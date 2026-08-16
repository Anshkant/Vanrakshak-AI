# PART 1/4
import os
import json
import time
import threading
import sqlite3
from datetime import datetime
from io import BytesIO
import logging
from collections import deque
from multiprocessing import Process, Queue

import cv2
import numpy as np
from flask import Flask, Response, render_template, jsonify, request, abort, send_from_directory
from flask_cors import CORS

from concurrent.futures import ThreadPoolExecutor

# ThreadPoolExecutor for YOLO + DeepSORT
EXECUTOR = ThreadPoolExecutor(max_workers=12)

# Try MySQL connectors
MYSQL_CONNECTOR = None
try:
    import mysql.connector as mysql_connector
    MYSQL_CONNECTOR = "mysql-connector"
except Exception:
    try:
        import pymysql as pymysql_connector
        MYSQL_CONNECTOR = "pymysql"
    except Exception:
        MYSQL_CONNECTOR = None

# YOLO / DeepSort imports
try:
    import torch
    from ultralytics import YOLO
    from deep_sort_realtime.deepsort_tracker import DeepSort
except Exception as e:
    print("⚠ YOLO / DeepSort imports failed. Make sure ultralytics and deep_sort_realtime are installed.", e)
    # We'll re-raise later when models are required.

# ---------- CONFIG ----------
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DB_DIR = os.path.join(BASE_DIR, "database")
SQL_SCHEMA = os.path.join(DB_DIR, "aidetection.sql")
SQLITE_DB_PATH = os.path.join(DB_DIR, "counts.db")
MYSQL_CONFIG_PATH = os.path.join(DB_DIR, "mysql_config.json")

# Replace these with your model paths
MODEL_PATH = r"C:\Users\ADITYA\OneDrive\Desktop\final_prj\final_prj\best.pt"
PERSON_MODEL_PATH = r"C:\Users\ADITYA\OneDrive\Desktop\final_prj\final_prj\yolov8n.pt"

# Default camera sources (set for 4 cameras)
CAMERA_SOURCES = [
    0,
    1,
    2,
    3
]

# If your static HTML files are in another folder (for /dashboard, /reports, ...),
# set STATIC_DIR to that relative path. Default is current directory.
STATIC_DIR = "."

# Detection / counting config (copied from your code)
CAMERA_USE_USB_ONLY_GLOBAL = True
FALLBACK_USB_INDEX = 0
CLASSES = ['bag', 'box']
PERSON_CLASS_ID = 0
PERSON_CLASS_NAME = "person"

LINE_1_Y = 550
LINE_2_Y = 780
OFFSET = 15
MIN_LIFETIME = 3
ENFORCE_DOWNWARD_MOVEMENT = True
STOPPED_THRESHOLD_FRAMES = 30

FRAME_WIDTH = 1920
FRAME_HEIGHT = 1080

YOLO_IMGSZ = 1080
YOLO_CONF = 0.36
YOLO_IOU = 0.48
PERSON_CONF = 0.45
PERSON_IOU = 0.5
DETECTION_SLEEP = 0.055

device = 'cuda' if (('torch' in globals()) and torch.cuda.is_available()) else 'cpu'
print(f"⚡ Using device: {device}")

# ---------- Logging ----------
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("merged_app")

# ---------- Globals used by Flask + detection ----------
NUM_CAMERAS = max(1, min(16, len(CAMERA_SOURCES)))

processed_frame = {i: None for i in range(NUM_CAMERAS)}   # annotated frames to serve in /video_feed/<id>
latest_tracks = {i: [] for i in range(NUM_CAMERAS)}
latest_persons = {i: [] for i in range(NUM_CAMERAS)}
track_histories = {i: {} for i in range(NUM_CAMERAS)}
object_counts_per_cam = {i: {cls: 0 for cls in CLASSES} for i in range(NUM_CAMERAS)}
person_count_per_cam = {i: 0 for i in range(NUM_CAMERAS)}
last_frame_shape = {i: (FRAME_HEIGHT, FRAME_WIDTH) for i in range(NUM_CAMERAS)}

frame_lock = threading.Lock()
tracks_lock = threading.Lock()
counts_lock = threading.Lock()

SHUTDOWN_FLAG = threading.Event()

# Global detection control
DETECTION_ENABLED = False
DETECTION_ENABLED_LOCK = threading.Lock()
CURRENT_SESSION_ID = None
CURRENT_SESSION_LOCK = threading.Lock()

# Per-camera detection control + sessions
detection_enabled_per_cam = {i: False for i in range(NUM_CAMERAS)}
session_ids_per_cam = {i: None for i in range(NUM_CAMERAS)}
sessions_lock = threading.Lock()

# For starting/stopping processes/threads
camera_processes = []
detection_threads = []
person_threads = []
counting_threads = []
frame_queues = []

# ---------- Database helpers from your working code ----------
def load_mysql_config():
    cfg = {}
    if os.path.isfile(MYSQL_CONFIG_PATH):
        try:
            with open(MYSQL_CONFIG_PATH, "r", encoding="utf-8") as f:
                cfg = json.load(f)
            logger.info("Loaded MySQL config from %s", MYSQL_CONFIG_PATH)
        except Exception as e:
            logger.warning("Failed to read mysql_config.json: %s", e)
    cfg.setdefault("host", os.environ.get("MYSQL_HOST"))
    cfg.setdefault("user", os.environ.get("MYSQL_USER"))
    cfg.setdefault("password", os.environ.get("MYSQL_PASSWORD"))
    cfg.setdefault("database", os.environ.get("MYSQL_DATABASE"))
    port_env = os.environ.get("MYSQL_PORT")
    if port_env:
        try:
            cfg["port"] = int(port_env)
        except Exception:
            pass
    if not cfg.get("host") or not cfg.get("user") or not cfg.get("database"):
        return None
    return cfg

def get_mysql_conn(cfg):
    if not cfg or MYSQL_CONNECTOR is None:
        return None
    try:
        if MYSQL_CONNECTOR == "mysql-connector":
            conn = mysql_connector.connect(
                host=cfg.get("host"),
                user=cfg.get("user"),
                password=cfg.get("password"),
                database=cfg.get("database"),
                port=cfg.get("port", 3306),
                autocommit=True,
            )
            return conn
        else:  # pymysql
            import pymysql
            conn = pymysql.connect(
                host=cfg.get("host"),
                user=cfg.get("user"),
                password=cfg.get("password"),
                database=cfg.get("database"),
                port=cfg.get("port", 3306),
                autocommit=True,
                charset="utf8mb4"
            )
            return conn
    except Exception as e:
        logger.warning("MySQL connect failed: %s", e)
        return None

def init_sqlite_db():
    os.makedirs(DB_DIR, exist_ok=True)
    if not os.path.isfile(SQLITE_DB_PATH):
        if os.path.isfile(SQL_SCHEMA):
            try:
                with open(SQL_SCHEMA, "r", encoding="utf-8") as f:
                    sql = f.read()
                conn = sqlite3.connect(SQLITE_DB_PATH)
                conn.executescript(sql)
                conn.commit()
                conn.close()
                logger.info("Created SQLite DB from schema: %s", SQLITE_DB_PATH)
                return
            except Exception as e:
                logger.warning("Failed to create SQLite from schema: %s", e)
        # Minimal fallback
        try:
            conn = sqlite3.connect(SQLITE_DB_PATH)
            cur = conn.cursor()
            cur.execute("""
                CREATE TABLE IF NOT EXISTS detections (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    ts TEXT,
                    cls TEXT,
                    count INTEGER
                )
            """)
            conn.commit()
            conn.close()
            logger.info("Created minimal SQLite DB at %s", SQLITE_DB_PATH)
        except Exception as e:
            logger.error("Failed to create minimal SQLite DB: %s", e)
# PART 2/4

def save_counts_to_db(counts):
    cfg = load_mysql_config()
    if cfg:
        conn = get_mysql_conn(cfg)
        if conn:
            try:
                cur = conn.cursor()
                ts = counts.get("ts", datetime.utcnow().isoformat())
                by_class = counts.get("by_class", {})
                for cls, cnt in by_class.items():
                    cur.execute(
                        "INSERT INTO detections (ts, cls, count) VALUES (%s, %s, %s)",
                        (ts, cls, int(cnt))
                    )
                try: cur.close()
                except: pass
                try: conn.close()
                except: pass
                return
            except:
                pass

    try:
        conn = sqlite3.connect(SQLITE_DB_PATH)
        cur = conn.cursor()
        ts = counts.get("ts", datetime.utcnow().isoformat())
        by_class = counts.get("by_class", {})
        for cls, cnt in by_class.items():
            cur.execute("INSERT INTO detections (ts, cls, count) VALUES (?, ?, ?)", (ts, cls, int(cnt)))
        conn.commit()
        conn.close()
    except:
        pass

# ---------- Load YOLO models and tracker ----------
model = None
person_model = None
tracker = None

def load_models():
    global model, person_model, tracker
    model = YOLO(MODEL_PATH)
    person_model = YOLO(PERSON_MODEL_PATH)
    tracker = DeepSort(max_age=30, n_init=3, max_cosine_distance=0.3)

# ---------- CAMERA PROCESS ----------
def camera_process(rtsp_or_index, frame_queue, reconnect_interval=5.0, use_usb_only=False):
    import cv2, time

    def open_capture(source, use_ffmpeg=False):
        if isinstance(source, int):
            cap = cv2.VideoCapture(source)
            cap.set(cv2.CAP_PROP_FRAME_WIDTH, FRAME_WIDTH)
            cap.set(cv2.CAP_PROP_FRAME_HEIGHT, FRAME_HEIGHT)
            return cap
        else:
            if use_ffmpeg:
                cap = cv2.VideoCapture(source, cv2.CAP_FFMPEG)
            else:
                cap = cv2.VideoCapture(source)
            cap.set(cv2.CAP_PROP_FRAME_WIDTH, FRAME_WIDTH)
            cap.set(cv2.CAP_PROP_FRAME_HEIGHT, FRAME_HEIGHT)
            return cap

    while not SHUTDOWN_FLAG.is_set():
        if use_usb_only:
            idx = int(rtsp_or_index) if str(rtsp_or_index).isdigit() else FALLBACK_USB_INDEX
            cap = open_capture(idx)
        else:
            try:
                idx = int(rtsp_or_index)
                cap = open_capture(idx)
            except:
                cap = open_capture(rtsp_or_index, use_ffmpeg=True)

        if not cap or not cap.isOpened():
            time.sleep(reconnect_interval)
            continue

        while not SHUTDOWN_FLAG.is_set():
            ret, frame = cap.read()
            if not ret:
                break
            if not frame_queue.full():
                frame_queue.put(frame)
            time.sleep(0.005)

        try: cap.release()
        except: pass

        time.sleep(0.5)

# ---------- THREADPOOL ENABLED DETECTION ----------
def detect_objects(frame):
    return EXECUTOR.submit(
        model.predict,
        frame,
        imgsz=YOLO_IMGSZ,
        conf=YOLO_CONF,
        iou=YOLO_IOU,
        device=device,
        verbose=False
    )

def track_objects(detections, frame):
    return EXECUTOR.submit(
        tracker.update_tracks,
        detections,
        frame=frame
    )

def detection_worker(frame_queue, camera_id):
    global processed_frame, latest_tracks, track_histories, last_frame_shape

    while not SHUTDOWN_FLAG.is_set():
        if frame_queue.empty():
            time.sleep(0.01)
            continue

        frame = frame_queue.get()
        h, w = frame.shape[:2]
        last_frame_shape[camera_id] = (h, w)

        try:
            future_det = detect_objects(frame)
            detections = future_det.result()
            results = detections[0]

            boxes, confs, classes = [], [], []
            if hasattr(results, "boxes") and len(results.boxes) > 0:
                boxes = results.boxes.xyxy.cpu().numpy()
                confs = results.boxes.conf.cpu().numpy()
                classes = results.boxes.cls.cpu().numpy().astype(int)

            dets = []
            for i, box in enumerate(boxes):
                x1, y1, x2, y2 = box
                wbox, hbox = x2 - x1, y2 - y1
                cls_name = CLASSES[classes[i]] if classes[i] < len(CLASSES) else "object"
                dets.append(([x1, y1, wbox, hbox], float(confs[i]), cls_name))

            future_tracks = track_objects(dets, frame)
            tracks = future_tracks.result()

            now_ts = time.time()

            with tracks_lock:
                latest_tracks[camera_id] = tracks
                for track in tracks:
                    if not track.is_confirmed():
                        continue

                    tid = track.track_id
                    ltrb = track.to_ltrb()
                    x1, y1, x2, y2 = map(int, ltrb)
                    cx, cy = int((x1 + x2) / 2), int((y1 + y2) / 2)
                    cls_name = getattr(track, "det_class", "object")

                    if tid not in track_histories[camera_id]:
                        track_histories[camera_id][tid] = {
                            'centroids': deque(maxlen=50),
                            'frames': 0,
                            'crossed_1': False,
                            'crossed_2': False,
                            'counted': False,
                            'class': cls_name,
                            'last_seen': now_ts
                        }

                    hist = track_histories[camera_id][tid]
                    hist['centroids'].append((cx, cy))
                    hist['frames'] = len(hist['centroids'])
                    hist['last_seen'] = now_ts

            overlay = frame.copy()

            for track in tracks:
                try:
                    x1, y1, x2, y2 = map(int, track.to_ltrb())
                    cv2.rectangle(overlay, (x1, y1), (x2, y2), (0, 255, 0), 2)
                    cv2.putText(
                        overlay,
                        f"{getattr(track, 'det_class', 'obj')} ID:{track.track_id}",
                        (x1, y1 - 10),
                        cv2.FONT_HERSHEY_SIMPLEX,
                        0.6,
                        (0, 255, 0),
                        2
                    )
                except:
                    pass

            cv2.line(overlay, (0, LINE_1_Y), (w, LINE_1_Y), (0, 0, 255), 2)
            cv2.line(overlay, (0, LINE_2_Y), (w, LINE_2_Y), (0, 0, 255), 2)

            with frame_lock:
                processed_frame[camera_id] = overlay.copy()

        except:
            time.sleep(0.05)
# PART 3/4

def person_detection_worker(frame_queue, camera_id):
    global latest_persons, person_count_per_cam, processed_frame

    while not SHUTDOWN_FLAG.is_set():
        if frame_queue.empty():
            time.sleep(0.02)
            continue

        frame = frame_queue.get()
        try:
            results = person_model.predict(
                frame,
                imgsz=640,
                conf=PERSON_CONF,
                iou=PERSON_IOU,
                device=device,
                verbose=False
            )[0]

            boxes, confs, classes = [], [], []
            if hasattr(results, "boxes") and len(results.boxes) > 0:
                boxes = results.boxes.xyxy.cpu().numpy()
                confs = results.boxes.conf.cpu().numpy()
                classes = results.boxes.cls.cpu().numpy().astype(int)

            persons = []
            for i, box in enumerate(boxes):
                if classes[i] == PERSON_CLASS_ID:
                    x1, y1, x2, y2 = map(int, box)
                    persons.append((x1, y1, x2, y2, float(confs[i])))

            with tracks_lock:
                latest_persons[camera_id] = persons
                person_count_per_cam[camera_id] = len(persons)

            with frame_lock:
                if processed_frame.get(camera_id) is not None:
                    overlay = processed_frame[camera_id].copy()
                    for (x1, y1, x2, y2, conf) in persons:
                        cv2.rectangle(overlay, (x1, y1), (x2, y2), (255, 0, 0), 2)
                        cv2.putText(
                            overlay,
                            f"Person {conf:.2f}",
                            (x1, y1 - 5),
                            cv2.FONT_HERSHEY_SIMPLEX,
                            0.5,
                            (255, 0, 0),
                            2
                        )
                    processed_frame[camera_id] = overlay

        except:
            time.sleep(0.05)

class CountingThread(threading.Thread):
    def __init__(self, camera_id):
        super().__init__(daemon=True)
        self.camera_id = camera_id
        self.running = True

    def run(self):
        global track_histories, object_counts_per_cam, CURRENT_SESSION_ID
        cam = self.camera_id

        while self.running and not SHUTDOWN_FLAG.is_set():
            h, w = last_frame_shape.get(cam, (FRAME_HEIGHT, FRAME_WIDTH))
            line1_y = min(LINE_1_Y, h - 10)
            line2_y = min(LINE_2_Y, h - 10)

            with DETECTION_ENABLED_LOCK:
                enabled_global = DETECTION_ENABLED
            with sessions_lock:
                enabled_cam = detection_enabled_per_cam.get(cam, False)

            if not (enabled_global or enabled_cam):
                time.sleep(0.25)
                continue

            with tracks_lock:
                histories = track_histories.get(cam, {})
                for tid, hist in list(histories.items()):
                    if hist.get('counted', False):
                        continue

                    if hist['frames'] < MIN_LIFETIME:
                        continue

                    cx, cy = hist['centroids'][-1]
                    prev_y = hist['centroids'][-2][1] if len(hist['centroids']) > 1 else None

                    if (not hist['crossed_1']) and (cy > (line1_y - OFFSET)):
                        if prev_y is None or cy >= prev_y:
                            hist['crossed_1'] = True

                    if hist['crossed_1'] and (not hist['crossed_2']) and (cy > (line2_y - OFFSET)):
                        if prev_y is None or cy >= prev_y:
                            hist['crossed_2'] = True

                    if hist['crossed_1'] and hist['crossed_2'] and (not hist['counted']):
                        cls_name = hist.get('class', 'object')

                        with counts_lock:
                            object_counts_per_cam[cam][cls_name] = object_counts_per_cam[cam].get(cls_name, 0) + 1

                        hist['counted'] = True

                        with sessions_lock:
                            sid_cam = session_ids_per_cam.get(cam)
                        with CURRENT_SESSION_LOCK:
                            sid_global = CURRENT_SESSION_ID
                        sid = sid_cam or sid_global

                        if sid:
                            try:
                                snapshot = {
                                    "ts": datetime.utcnow().isoformat(),
                                    "by_class": object_counts_per_cam.get(cam, {})
                                }
                                save_counts_to_db(snapshot)
                            except:
                                pass

            time.sleep(0.25)

        print(f"CountingThread stopped for camera {cam}")

    def stop(self):
        self.running = False

# ---------- FLASK APP ----------
app = Flask(__name__, template_folder="templates", static_folder="templates", static_url_path="")
CORS(app)

@app.route("/")
def index():
    return render_template("index.html")

@app.route('/dashboard')
def dashboard_page():
    return send_from_directory(STATIC_DIR, 'dashboard.html')

@app.route('/reports')
def reports_page():
    return send_from_directory(STATIC_DIR, 'reports.html')

@app.route('/Analytics')
def analysis_page():
    return send_from_directory(STATIC_DIR, 'Analytics.html')

@app.route('/Assign')
def info_page():
    return send_from_directory(STATIC_DIR, 'Assign.html')

@app.route('/login')
def login_page():
    return send_from_directory(STATIC_DIR, 'login.html')

@app.route('/video_feed')
@app.route('/video_feed/<int:cam_id>')
def video_feed(cam_id=0):
    def gen(cam):
        while not SHUTDOWN_FLAG.is_set():
            with frame_lock:
                frame = processed_frame.get(cam)
                if frame is None:
                    time.sleep(0.05)
                    continue

                ret, buffer = cv2.imencode('.jpg', frame, [cv2.IMWRITE_JPEG_QUALITY, 80])
                if not ret:
                    continue

            yield (b'--frame\r\nContent-Type: image/jpeg\r\n\r\n' + buffer.tobytes() + b'\r\n')
            time.sleep(0.02)

    return Response(gen(cam_id), mimetype='multipart/x-mixed-replace; boundary=frame')

@app.route('/counts')
def get_counts():
    agg = {cls: 0 for cls in CLASSES}
    total_persons = 0

    with counts_lock:
        for cam_id in range(NUM_CAMERAS):
            cam_counts = object_counts_per_cam.get(cam_id, {})
            for cls in CLASSES:
                agg[cls] += cam_counts.get(cls, 0)
            total_persons += person_count_per_cam.get(cam_id, 0)

    response = dict(agg)
    response['persons'] = total_persons
    return jsonify(response)
# PART 4/4

@app.route('/status')
def get_status():
    with DETECTION_ENABLED_LOCK:
        enabled = DETECTION_ENABLED

    with CURRENT_SESSION_LOCK:
        sid = CURRENT_SESSION_ID

    per_cam_status = []
    for cam_id in range(NUM_CAMERAS):
        per_cam_status.append({
            "camera_id": cam_id,
            "source": CAMERA_SOURCES[cam_id] if cam_id < len(CAMERA_SOURCES) else None,
            "active_tracks": len(latest_tracks.get(cam_id, [])),
            "persons_detected": len(latest_persons.get(cam_id, [])),
            "frame_shape": last_frame_shape.get(cam_id, None)
        })

    status = {
        "device": device,
        "detection_enabled": enabled,
        "session_id": sid,
        "per_camera": per_cam_status,
        "timestamp": datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    }
    return jsonify(status)

@app.route('/start', methods=['POST'])
def api_start():
    global DETECTION_ENABLED, object_counts_per_cam, track_histories, CURRENT_SESSION_ID

    try:
        with DETECTION_ENABLED_LOCK:
            if DETECTION_ENABLED:
                return jsonify({"ok": True, "message": "already running", "session_id": CURRENT_SESSION_ID})

            load_models()

            import uuid
            sid = str(uuid.uuid4())

            with CURRENT_SESSION_LOCK:
                CURRENT_SESSION_ID = sid

            with tracks_lock:
                for cam in range(NUM_CAMERAS):
                    object_counts_per_cam[cam] = {cls: 0 for cls in CLASSES}
                    track_histories[cam].clear()
                    latest_tracks[cam].clear()
                    latest_persons[cam].clear()

            _start_all_cameras()
            DETECTION_ENABLED = True

        return jsonify({"ok": True, "session_id": sid})

    except Exception as e:
        return jsonify({"ok": False, "error": str(e)}), 500

@app.route('/stop', methods=['POST'])
def api_stop():
    global DETECTION_ENABLED, object_counts_per_cam, CURRENT_SESSION_ID

    try:
        with DETECTION_ENABLED_LOCK:
            if not DETECTION_ENABLED:
                return jsonify({"ok": True, "message": "already stopped", "session_id": CURRENT_SESSION_ID})

            DETECTION_ENABLED = False

        _stop_all_cameras()

        with CURRENT_SESSION_LOCK:
            sid = CURRENT_SESSION_ID

        if sid:
            try:
                snapshot = {
                    "ts": datetime.utcnow().isoformat(),
                    "by_class": {
                        cam: object_counts_per_cam.get(cam, {})
                        for cam in range(NUM_CAMERAS)
                    }
                }
                save_counts_to_db(snapshot)
            except:
                pass

        with tracks_lock:
            for cam in range(NUM_CAMERAS):
                object_counts_per_cam[cam] = {cls: 0 for cls in CLASSES}
                track_histories[cam].clear()
                latest_tracks[cam].clear()
                latest_persons[cam].clear()

        with CURRENT_SESSION_LOCK:
            CURRENT_SESSION_ID = None

        return jsonify({"ok": True, "session_id": sid})

    except Exception as e:
        return jsonify({"ok": False, "error": str(e)}), 500

@app.route('/start/<int:cam_id>', methods=['POST'])
def start_camera(cam_id):
    if cam_id < 0 or cam_id >= NUM_CAMERAS:
        return jsonify({"ok": False, "error": "invalid cam_id"}), 400

    try:
        with sessions_lock:
            if detection_enabled_per_cam.get(cam_id):
                return jsonify({
                    "ok": True,
                    "message": "camera already running",
                    "camera_id": cam_id,
                    "session_id": session_ids_per_cam.get(cam_id)
                })

            import uuid
            sid = str(uuid.uuid4())
            session_ids_per_cam[cam_id] = sid
            detection_enabled_per_cam[cam_id] = True

            with tracks_lock:
                object_counts_per_cam[cam_id] = {cls: 0 for cls in CLASSES}
                track_histories[cam_id].clear()
                latest_tracks[cam_id].clear()
                latest_persons[cam_id].clear()

        _start_camera(cam_id)

        return jsonify({"ok": True, "camera_id": cam_id, "session_id": sid})

    except Exception as e:
        return jsonify({"ok": False, "error": str(e)}), 500

@app.route('/stop/<int:cam_id>', methods=['POST'])
def stop_camera(cam_id):
    if cam_id < 0 or cam_id >= NUM_CAMERAS:
        return jsonify({"ok": False, "error": "invalid cam_id"}), 400

    try:
        with sessions_lock:
            if not detection_enabled_per_cam.get(cam_id):
                sid = session_ids_per_cam.get(cam_id)
                return jsonify({
                    "ok": True,
                    "message": "camera already stopped",
                    "camera_id": cam_id,
                    "session_id": sid
                })

            detection_enabled_per_cam[cam_id] = False
            sid = session_ids_per_cam.get(cam_id)
            session_ids_per_cam[cam_id] = None

        _stop_camera(cam_id)

        if sid:
            try:
                snapshot = {
                    "ts": datetime.utcnow().isoformat(),
                    "by_class": {cam_id: object_counts_per_cam.get(cam_id, {})}
                }
                save_counts_to_db(snapshot)
            except:
                pass

        with tracks_lock:
            object_counts_per_cam[cam_id] = {cls: 0 for cls in CLASSES}
            track_histories[cam_id].clear()
            latest_tracks[cam_id].clear()
            latest_persons[cam_id].clear()

        return jsonify({"ok": True, "camera_id": cam_id, "session_id": sid})

    except Exception as e:
        return jsonify({"ok": False, "error": str(e)}), 500

# ---------- CAMERA START/STOP HELPERS ----------
def _start_all_cameras():
    global camera_processes, detection_threads, person_threads, counting_threads, frame_queues

    if camera_processes:
        return

    sources = CAMERA_SOURCES[:NUM_CAMERAS]
    frame_queues = []
    camera_processes = []
    detection_threads = []
    person_threads = []
    counting_threads = []

    for cam_id in range(NUM_CAMERAS):
        src = sources[cam_id]
        q = Queue(maxsize=4)
        frame_queues.append(q)

        p = Process(target=camera_process, args=(src, q, 5.0, CAMERA_USE_USB_ONLY_GLOBAL))
        p.daemon = True
        camera_processes.append(p)

        dt = threading.Thread(target=detection_worker, args=(q, cam_id), daemon=True)
        pt = threading.Thread(target=person_detection_worker, args=(q, cam_id), daemon=True)
        ct = CountingThread(cam_id)

        detection_threads.append(dt)
        person_threads.append(pt)
        counting_threads.append(ct)

    for p in camera_processes: p.start()
    for t in detection_threads: t.start()
    for t in person_threads: t.start()
    for ct in counting_threads: ct.start()

def _stop_all_cameras():
    global camera_processes, detection_threads, person_threads, counting_threads, frame_queues

    SHUTDOWN_FLAG.set()

    for p in camera_processes:
        try: p.terminate()
        except: pass

    for ct in counting_threads:
        try: ct.stop()
        except: pass

    camera_processes = []
    detection_threads = []
    person_threads = []
    counting_threads = []
    frame_queues = []
    SHUTDOWN_FLAG.clear()

def _start_camera(cam_id):
    global camera_processes, detection_threads, person_threads, counting_threads, frame_queues

    if model is None or person_model is None or tracker is None:
        load_models()

    if not frame_queues:
        frame_queues = [None] * NUM_CAMERAS
        camera_processes = [None] * NUM_CAMERAS
        detection_threads = [None] * NUM_CAMERAS
        person_threads = [None] * NUM_CAMERAS
        counting_threads = [None] * NUM_CAMERAS

    if frame_queues[cam_id] is not None:
        return

    src = CAMERA_SOURCES[cam_id]
    q = Queue(maxsize=4)
    frame_queues[cam_id] = q

    p = Process(target=camera_process, args=(src, q, 5.0, CAMERA_USE_USB_ONLY_GLOBAL))
    p.daemon = True
    camera_processes[cam_id] = p

    dt = threading.Thread(target=detection_worker, args=(q, cam_id), daemon=True)
    pt = threading.Thread(target=person_detection_worker, args=(q, cam_id), daemon=True)
    ct = CountingThread(cam_id)

    detection_threads[cam_id] = dt
    person_threads[cam_id] = pt
    counting_threads[cam_id] = ct

    p.start()
    dt.start()
    pt.start()
    ct.start()

def _stop_camera(cam_id):
    global camera_processes, frame_queues, counting_threads

    try:
        if camera_processes[cam_id] is not None:
            camera_processes[cam_id].terminate()
            camera_processes[cam_id] = None

        if counting_threads[cam_id] is not None:
            counting_threads[cam_id].stop()
            counting_threads[cam_id] = None

        frame_queues[cam_id] = None

    except:
        pass

# ---------- STARTUP ----------
if __name__ == "__main__":
    import argparse
    parser = argparse.ArgumentParser()
    parser.add_argument("--host", default="0.0.0.0")
    parser.add_argument("--port", type=int, default=5000)
    parser.add_argument("--debug", action="store_true")
    args = parser.parse_args()

    init_sqlite_db()

    app.run(host=args.host, port=args.port, debug=args.debug, threaded=True, use_reloader=False)
