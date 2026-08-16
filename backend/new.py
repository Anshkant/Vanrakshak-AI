# (Full file — updated with fixes & logging)
import os
import json
import time
import threading
import sqlite3
from datetime import datetime
from io import BytesIO
import logging
from collections import deque
from multiprocessing import Process, Queue, Event
import uuid

import cv2
import numpy as np
from flask import Flask, Response, render_template, jsonify, request, abort, send_from_directory
from flask_cors import CORS

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
SQLITE_DB_PATH = os.path.join(DB_DIR, "counts.db")
MYSQL_CONFIG_PATH = os.path.join(DB_DIR, "mysql_config.json")

# Model paths (use relative paths; place files in ./models)
MODEL_PATH = r"C:\Users\ADITYA\OneDrive\Desktop\final_prj\final_prj\best.pt"
PERSON_MODEL_PATH = r"C:\Users\ADITYA\OneDrive\Desktop\final_prj\final_prj\yolov8n.pt"

# Camera sources: indices or RTSP URLs
CAMERA_SOURCES = [
    0,
    1,
]

# Static/templates
STATIC_DIR = "templates"

# Detection / counting config
CLASSES = ['bag', 'box']
PERSON_CLASS_ID = 0

# Use relative lines (percent of frame height) so lines are always on frame
LINE_1_PCT = 0.55  # 55% down
LINE_2_PCT = 0.80  # 80% down
# Keep the old constants for backward compatibility if needed
LINE_1_Y = 550
LINE_2_Y = 780

OFFSET = 15
MIN_LIFETIME = 3
ENFORCE_DOWNWARD_MOVEMENT = True

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
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(name)s - %(levelname)s - %(message)s')
logger = logging.getLogger("merged_app")

# ---------- Globals for Flask + detection ----------
NUM_CAMERAS = max(1, min(16, len(CAMERA_SOURCES)))

processed_frame = {i: None for i in range(NUM_CAMERAS)}
latest_tracks = {i: [] for i in range(NUM_CAMERAS)}
latest_persons = {i: [] for i in range(NUM_CAMERAS)}
track_histories = {i: {} for i in range(NUM_CAMERAS)}
object_counts_per_cam = {i: {cls: 0 for cls in CLASSES} for i in range(NUM_CAMERAS)}
person_count_per_cam = {i: 0 for i in range(NUM_CAMERAS)}
# default last_frame_shape will be replaced soon with actual frame sizes
last_frame_shape = {i: (FRAME_HEIGHT, FRAME_WIDTH) for i in range(NUM_CAMERAS)}

frame_lock = threading.Lock()
tracks_lock = threading.Lock()
counts_lock = threading.Lock()

# Global detection control
DETECTION_ENABLED = False
DETECTION_ENABLED_LOCK = threading.Lock()
CURRENT_SESSION_ID = None
CURRENT_SESSION_LOCK = threading.Lock()

# Process/thread handles
camera_processes = [None] * NUM_CAMERAS
detection_threads = [None] * NUM_CAMERAS
counting_threads = [None] * NUM_CAMERAS
frame_queues = [None] * NUM_CAMERAS  # stores tuple: (queue, shutdown_event)

# ---------- Database helpers ----------
def load_mysql_config():
    cfg = {}
    if os.path.isfile(MYSQL_CONFIG_PATH):
        try:
            with open(MYSQL_CONFIG_PATH, "r", encoding="utf-8") as f:
                cfg = json.load(f) or {}
            logger.info("Loaded MySQL config from %s", MYSQL_CONFIG_PATH)
        except Exception as e:
            logger.warning("Failed to read mysql_config.json: %s", e)

    # overlay env
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
        logger.debug("MySQL config incomplete or missing; will use SQLite fallback.")
        return None
    cfg.setdefault("port", 3306)
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
        else:
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
    try:
        conn = sqlite3.connect(SQLITE_DB_PATH)
        cur = conn.cursor()
        cur.executescript("""
            PRAGMA foreign_keys = ON;
            CREATE TABLE IF NOT EXISTS cameras (
                camera_id INTEGER PRIMARY KEY AUTOINCREMENT,
                camera_name TEXT,
                status TEXT DEFAULT 'pause',
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP
            );
            CREATE TABLE IF NOT EXISTS trucks (
                truck_id INTEGER PRIMARY KEY AUTOINCREMENT,
                truck_no TEXT,
                camera_id INTEGER,
                in_time DATETIME DEFAULT CURRENT_TIMESTAMP,
                out_time DATETIME,
                FOREIGN KEY (camera_id) REFERENCES cameras(camera_id)
            );
            CREATE TABLE IF NOT EXISTS detections (
                detection_id INTEGER PRIMARY KEY AUTOINCREMENT,
                truck_id INTEGER,
                camera_id INTEGER,
                bags_count INTEGER DEFAULT 0,
                boxes_count INTEGER DEFAULT 0,
                detection_time DATETIME DEFAULT CURRENT_TIMESTAMP,
                session_id TEXT,
                FOREIGN KEY (truck_id) REFERENCES trucks(truck_id),
                FOREIGN KEY (camera_id) REFERENCES cameras(camera_id)
            );
            CREATE TABLE IF NOT EXISTS sessions (
                session_id TEXT PRIMARY KEY,
                start_time DATETIME NOT NULL,
                end_time DATETIME,
                status TEXT
            );
        """)
        conn.commit()
        conn.close()
        logger.info("SQLite DB ready at %s", SQLITE_DB_PATH)
    except Exception as e:
        logger.error("Failed to create SQLite DB: %s", e)

def save_session_start(session_id):
    ts = datetime.utcnow()
    cfg = load_mysql_config()
    conn = get_mysql_conn(cfg) if cfg else None

    if conn:
        try:
            cur = conn.cursor()
            cur.execute("""
                CREATE TABLE IF NOT EXISTS sessions (
                    session_id VARCHAR(64) PRIMARY KEY,
                    start_time DATETIME(6) NOT NULL,
                    end_time DATETIME(6),
                    status VARCHAR(16)
                )
            """)
            cur.execute(
                "INSERT INTO sessions (session_id, start_time, status) VALUES (%s, %s, %s) ON DUPLICATE KEY UPDATE start_time=VALUES(start_time), status=VALUES(status)",
                (session_id, ts, "running")
            )
            try: cur.close()
            except: pass
            try: conn.close()
            except: pass
            logger.info("Saved session start to MySQL: %s", session_id)
            return
        except Exception as e:
            logger.warning("MySQL session start failed: %s", e)
        finally:
            try: conn.close()
            except: pass

    # SQLite fallback
    try:
        with sqlite3.connect(SQLITE_DB_PATH) as conn_lite:
            conn_lite.execute(
                "INSERT OR REPLACE INTO sessions (session_id, start_time, status) VALUES (?, ?, ?)",
                (session_id, ts.isoformat(), "running")
            )
        logger.info("Saved session start to SQLite: %s", session_id)
    except Exception as e:
        logger.warning("SQLite session start failed: %s", e)

def save_session_end(session_id):
    ts = datetime.utcnow()
    cfg = load_mysql_config()
    conn = get_mysql_conn(cfg) if cfg else None
    if conn:
        try:
            cur = conn.cursor()
            cur.execute(
                "UPDATE sessions SET end_time=%s, status=%s WHERE session_id=%s",
                (ts, "stopped", session_id)
            )
            try: cur.close()
            except: pass
            try: conn.close()
            except: pass
            logger.info("Saved session end to MySQL: %s", session_id)
            return
        except Exception as e:
            logger.warning("MySQL session end failed: %s", e)
        finally:
            try: conn.close()
            except: pass

    # SQLite fallback
    try:
        with sqlite3.connect(SQLITE_DB_PATH) as conn_lite:
            conn_lite.execute(
                "UPDATE sessions SET end_time=?, status=? WHERE session_id=?",
                (ts.isoformat(), "stopped", session_id)
            )
        logger.info("Saved session end to SQLite: %s", session_id)
    except Exception as e:
        logger.warning("SQLite session end failed: %s", e)

def save_count_to_db(session_id, camera_id, class_name, count=1, truck_id=None):
    if class_name not in CLASSES:
        logger.warning("Unknown class_name for DB save: %s", class_name)
        return

    logger.debug("save_count_to_db called: session=%s camera=%s class=%s count=%s", session_id, camera_id, class_name, count)
    cfg = load_mysql_config()
    conn = get_mysql_conn(cfg) if cfg else None

    if conn:
        logger.debug("Attempting MySQL write for session=%s camera=%s", session_id, camera_id)
        try:
            cur = conn.cursor()
            # find existing detection for this session + camera for today
            cur.execute(
                """
                SELECT detection_id, bags_count, boxes_count
                FROM detections
                WHERE session_id = %s AND camera_id = %s AND DATE(detection_time) = CURDATE()
                LIMIT 1
                """,
                (session_id, camera_id)
            )
            row = cur.fetchone()
            if row:
                detection_id = row[0]
                bags_cnt = int(row[1] or 0)
                boxes_cnt = int(row[2] or 0)
                if class_name == "bag":
                    bags_cnt += count
                    cur.execute("UPDATE detections SET bags_count = %s WHERE detection_id = %s", (bags_cnt, detection_id))
                else:
                    boxes_cnt += count
                    cur.execute("UPDATE detections SET boxes_count = %s WHERE detection_id = %s", (boxes_cnt, detection_id))
            else:
                bags_init = count if class_name == "bag" else 0
                boxes_init = count if class_name == "box" else 0
                cur.execute(
                    "INSERT INTO detections (truck_id, camera_id, bags_count, boxes_count, detection_time, session_id) VALUES (%s, %s, %s, %s, %s, %s)",
                    (truck_id, camera_id, bags_init, boxes_init, datetime.utcnow(), session_id)
                )
            # Try to commit explicitly
            try:
                conn.commit()
            except Exception:
                # If autocommit is enabled it's fine; but attempt commit anyway
                pass
            try: cur.close()
            except: pass
            try: conn.close()
            except: pass
            logger.info("MySQL write succeeded for session=%s camera=%s class=%s", session_id, camera_id, class_name)
            return
        except Exception as e:
            logger.exception("Failed to write detection to MySQL: %s", e)
            try: conn.close()
            except: pass

    # SQLite fallback
    logger.debug("Falling back to SQLite DB at %s", SQLITE_DB_PATH)
    try:
        with sqlite3.connect(SQLITE_DB_PATH) as conn_lite:
            cur = conn_lite.cursor()
            cur.execute("""
                SELECT detection_id, bags_count, boxes_count
                FROM detections
                WHERE session_id = ? AND camera_id = ? AND DATE(detection_time) = DATE('now')
                LIMIT 1
            """, (session_id, camera_id))
            row = cur.fetchone()
            if row:
                detection_id, bags_cnt, boxes_cnt = row[0], int(row[1] or 0), int(row[2] or 0)
                if class_name == "bag":
                    bags_cnt += count
                    cur.execute("UPDATE detections SET bags_count = ? WHERE detection_id = ?", (bags_cnt, detection_id))
                else:
                    boxes_cnt += count
                    cur.execute("UPDATE detections SET boxes_count = ? WHERE detection_id = ?", (boxes_cnt, detection_id))
            else:
                bags_init = count if class_name == "bag" else 0
                boxes_init = count if class_name == "box" else 0
                cur.execute(
                    "INSERT INTO detections (truck_id, camera_id, bags_count, boxes_count, detection_time, session_id) VALUES (?, ?, ?, ?, ?, ?)",
                    (truck_id, camera_id, bags_init, boxes_init, datetime.utcnow().isoformat(), session_id)
                )
            conn_lite.commit()
        logger.info("SQLite write succeeded for session=%s camera=%s class=%s", session_id, camera_id, class_name)
    except Exception as e:
        logger.exception("Failed to write detection to SQLite fallback: %s", e)

# ---------- Load YOLO models and tracker ----------
model = None
person_model = None
tracker = None

def load_models():
    global model, person_model, tracker
    if model and person_model and tracker:
        logger.info("Models already loaded.")
        return
    try:
        if not os.path.exists(MODEL_PATH):
            raise FileNotFoundError(f"Bag/Box model not found at: {MODEL_PATH}")
        model = YOLO(MODEL_PATH)
        logger.info("✅ Loaded YOLO model for bag/box detection.")

        if not os.path.exists(PERSON_MODEL_PATH):
            raise FileNotFoundError(f"Person model not found at: {PERSON_MODEL_PATH}")
        person_model = YOLO(PERSON_MODEL_PATH)
        logger.info("✅ Loaded YOLOv8n person detection model.")

        tracker = DeepSort(max_age=30, n_init=3, max_cosine_distance=0.3)
        logger.info("✅ DeepSort tracker initialized.")
    except Exception as e:
        logger.exception("❌ Failed to load models: %s", e)
        raise

# ---------- CAMERA PROCESS & WORKERS ----------
def camera_process(rtsp_or_index, frame_queue, shutdown_event):
    import cv2, time
    cap = None
    logger.info(f"Starting camera process for source: {rtsp_or_index}")
    while not shutdown_event.is_set():
        try:
            cap = cv2.VideoCapture(rtsp_or_index)
            if not cap.isOpened():
                raise IOError(f"Cannot open camera source: {rtsp_or_index}")

            # Try to set desired resolution (camera may ignore)
            try:
                cap.set(cv2.CAP_PROP_FRAME_WIDTH, FRAME_WIDTH)
                cap.set(cv2.CAP_PROP_FRAME_HEIGHT, FRAME_HEIGHT)
                logger.debug("Requested camera resolution %dx%d for %s", FRAME_WIDTH, FRAME_HEIGHT, rtsp_or_index)
            except Exception:
                pass

            logger.info(f"✅ Camera {rtsp_or_index} opened successfully.")
            while not shutdown_event.is_set():
                ret, frame = cap.read()
                if not ret or frame is None:
                    logger.warning(f"⚠ Lost camera read from {rtsp_or_index} - will attempt to reconnect...")
                    break
                try:
                    frame_queue.put_nowait(frame)
                except Exception:
                    pass
                time.sleep(0.01)
        except Exception as e:
            logger.warning(f"❌ Camera process for {rtsp_or_index} failed: {e}. Retrying in 5s...")
        finally:
            if cap:
                try: cap.release()
                except: pass
        time.sleep(5)
    logger.info(f"Camera process for {rtsp_or_index} shutting down.")

def detection_and_person_worker(frame_queue, camera_id, shutdown_event):
    global processed_frame, latest_tracks, latest_persons, track_histories, last_frame_shape, person_count_per_cam

    logger.info(f"Starting detection worker for camera_id: {camera_id}")
    # one-time log of frame shape to diagnose resolution issues
    logged_shape = False

    while not shutdown_event.is_set():
        if frame_queue.empty():
            time.sleep(0.01)
            continue

        try:
            frame = frame_queue.get()
        except Exception:
            time.sleep(0.01)
            continue

        h, w = frame.shape[:2]
        with frame_lock:
            last_frame_shape[camera_id] = (h, w)

        if not logged_shape:
            logger.info("Camera %s delivering frames at %sx%s", camera_id, h, w)
            logged_shape = True

        if not DETECTION_ENABLED:
            with frame_lock:
                processed_frame[camera_id] = frame.copy()
            time.sleep(0.1)
            continue

        try:
            # If models are not loaded, skip detection but still show frame
            if model is None or person_model is None or tracker is None:
                logger.warning("Models/tracker not ready; skipping detection loop.")
                with frame_lock:
                    processed_frame[camera_id] = frame.copy()
                time.sleep(0.5)
                continue

            # Bag/Box detection and tracking
            results = model.predict(frame, imgsz=YOLO_IMGSZ, conf=YOLO_CONF, iou=YOLO_IOU, device=device, verbose=False)[0]
            boxes = results.boxes.xyxy.cpu().numpy() if hasattr(results, "boxes") and results.boxes is not None and len(results.boxes) > 0 else np.empty((0,4))
            confs = results.boxes.conf.cpu().numpy() if hasattr(results, "boxes") and results.boxes is not None and len(results.boxes) > 0 else np.empty((0,))
            classes = results.boxes.cls.cpu().numpy().astype(int) if hasattr(results, "boxes") and results.boxes is not None and len(results.boxes) > 0 else np.empty((0,), dtype=int)

            dets = []
            for i, box in enumerate(boxes):
                x1, y1, x2, y2 = box
                cls_name = CLASSES[classes[i]] if classes[i] < len(CLASSES) else "object"
                dets.append(([float(x1), float(y1), float(x2 - x1), float(y2 - y1)], float(confs[i]), cls_name))

            tracks = tracker.update_tracks(dets, frame=frame)
            now_ts = time.time()
            with tracks_lock:
                latest_tracks[camera_id] = tracks
                for track in tracks:
                    if hasattr(track, "is_confirmed") and not track.is_confirmed():
                        continue
                    ltrb = track.to_ltrb()
                    cx, cy = int((ltrb[0] + ltrb[2]) / 2), int((ltrb[1] + ltrb[3]) / 2)
                    tid = track.track_id
                    if tid not in track_histories[camera_id]:
                        track_histories[camera_id][tid] = {
                            'centroids': deque(maxlen=50),
                            'frames': 0,
                            'crossed_1': False,
                            'crossed_2': False,
                            'counted': False,
                            'class': getattr(track, "det_class", "object"),
                            'last_seen': now_ts
                        }
                    hist = track_histories[camera_id][tid]
                    hist['centroids'].append((cx, cy))
                    hist['frames'] = len(hist['centroids'])
                    hist['last_seen'] = now_ts

            overlay = frame.copy()
            # compute relative lines (same formula as counting thread)
            line1_y = int(h * LINE_1_PCT)
            line2_y = int(h * LINE_2_PCT)

            for track in tracks:
                try:
                    x1, y1, x2, y2 = map(int, track.to_ltrb())
                    color = (0, 255, 0)
                    cv2.rectangle(overlay, (x1, y1), (x2, y2), color, 2)
                    text_y = max(10, y1 - 10)
                    cv2.putText(overlay, f"{getattr(track, 'det_class', 'obj')} ID:{track.track_id}",
                                (x1, text_y), cv2.FONT_HERSHEY_SIMPLEX, 0.6, color, 2)
                except Exception:
                    pass

            # Person detection (overlay only)
            person_results = person_model.predict(frame, imgsz=640, conf=PERSON_CONF, iou=PERSON_IOU, device=device, verbose=False)[0]
            if hasattr(person_results, "boxes") and person_results.boxes is not None and len(person_results.boxes) > 0:
                p_boxes = person_results.boxes.xyxy.cpu().numpy()
                p_confs = person_results.boxes.conf.cpu().numpy()
                p_clses = person_results.boxes.cls.cpu().numpy().astype(int)
            else:
                p_boxes = np.empty((0,4))
                p_confs = np.empty((0,))
                p_clses = np.empty((0,), dtype=int)

            persons = []
            for i, box in enumerate(p_boxes):
                if p_clses[i] == PERSON_CLASS_ID:
                    x1, y1, x2, y2 = map(int, box)
                    persons.append((x1, y1, x2, y2, float(p_confs[i])))

            with tracks_lock:
                latest_persons[camera_id] = persons
                person_count_per_cam[camera_id] = len(persons)

            for (x1, y1, x2, y2, conf) in persons:
                cv2.rectangle(overlay, (x1, y1), (x2, y2), (255, 0, 0), 2)
                cv2.putText(overlay, f"Person {conf:.2f}", (x1, max(10, y1 - 5)),
                            cv2.FONT_HERSHEY_SIMPLEX, 0.5, (255, 0, 0), 2)

            # draw lines (thicker for visibility)
            cv2.line(overlay, (0, line1_y), (w - 1, line1_y), (0, 0, 255), 3)
            cv2.line(overlay, (0, line2_y), (w - 1, line2_y), (0, 0, 255), 3)

            with frame_lock:
                processed_frame[camera_id] = overlay.copy()

        except Exception as e:
            logger.exception("⚠ Detection pipeline failed (camera %s): %s", camera_id, e)
            with frame_lock:
                processed_frame[camera_id] = frame.copy()

        time.sleep(DETECTION_SLEEP)
    logger.info(f"Detection worker for camera_id {camera_id} shutting down.")

class CountingThread(threading.Thread):
    def _init_(self, camera_id, shutdown_event):
        super()._init_(daemon=True)
        self.camera_id = camera_id
        self.shutdown_event = shutdown_event

    def run(self):
        global track_histories, object_counts_per_cam, CURRENT_SESSION_ID
        cam = self.camera_id
        logger.info(f"Starting counting thread for camera_id: {cam}")
        while not self.shutdown_event.is_set():
            if not DETECTION_ENABLED:
                time.sleep(0.25)
                continue

            h, w = last_frame_shape.get(cam, (FRAME_HEIGHT, FRAME_WIDTH))
            # use same relative computation as overlay
            line1_y = int(h * LINE_1_PCT)
            line2_y = int(h * LINE_2_PCT)

            logger.debug("CountingThread cam=%s using lines line1=%s line2=%s OFFSET=%s", cam, line1_y, line2_y, OFFSET)

            with tracks_lock:
                histories = track_histories.get(cam, {})
                for tid, hist in list(histories.items()):
                    if hist.get('counted', False) or hist['frames'] < MIN_LIFETIME:
                        continue
                    cx, cy = hist['centroids'][-1]
                    prev_y = hist['centroids'][-2][1] if len(hist['centroids']) > 1 else cy

                    if not hist['crossed_1'] and cy > (line1_y - OFFSET) and (not ENFORCE_DOWNWARD_MOVEMENT or cy >= prev_y):
                        hist['crossed_1'] = True
                    if hist['crossed_1'] and (not hist['crossed_2']) and cy > (line2_y - OFFSET) and (not ENFORCE_DOWNWARD_MOVEMENT or cy >= prev_y):
                        hist['crossed_2'] = True

                    if hist['crossed_1'] and hist['crossed_2'] and (not hist['counted']):
                        cls_name = hist.get('class', 'object')
                        if cls_name not in CLASSES:
                            cls_name = CLASSES[0]  # fallback
                        with counts_lock:
                            object_counts_per_cam[cam][cls_name] = object_counts_per_cam[cam].get(cls_name, 0) + 1
                            current_count = object_counts_per_cam[cam][cls_name]
                        hist['counted'] = True
                        logger.info(f"✅ COUNTED (cam {cam}): {cls_name} (track {tid}) — New total: {current_count}")

                        with CURRENT_SESSION_LOCK:
                            sid = CURRENT_SESSION_ID
                        if sid:
                            logger.info("COUNT EVENT: cam=%s track=%s class=%s sid=%s -> attempting DB write", cam, tid, cls_name, sid)
                            try:
                                save_count_to_db(sid, cam, cls_name, 1)
                                logger.info("DB write attempted for sid=%s cam=%s class=%s", sid, cam, cls_name)
                            except Exception as e:
                                logger.exception("DB write exception for sid=%s cam=%s: %s", sid, cam, e)

            time.sleep(0.25)
        logger.info(f"CountingThread stopped for camera {cam}.")

# ---------- FLASK APP ----------
app = Flask(__name__, template_folder="templates", static_folder="templates", static_url_path="")
CORS(app)

@app.route("/")
def index():
    try:
        return render_template("index.html")
    except Exception as e:
        logger.warning("templates/index.html not found or failed to render: %s", e)
        return jsonify({"ok": False, "error": "index template not found. Place index.html in templates/."}), 500

@app.route('/dashboard')
def dashboard_page():
    try:
        return send_from_directory(STATIC_DIR, 'dashboard.html')
    except Exception as e:
        logger.warning("Failed to serve dashboard file: %s", e)
        abort(404)

@app.route('/reports')
def reports_page():
    try:
        return send_from_directory(STATIC_DIR, 'reports.html')
    except Exception as e:
        logger.warning("Failed to serve reports file: %s", e)
        abort(404)

@app.route('/Analytics')
def analytics_page():
    try:
        return send_from_directory(STATIC_DIR, 'Analytics.html')
    except Exception as e:
        logger.warning("Failed to serve analytics file: %s", e)
        abort(404)

@app.route('/Assign')
def assign_page():
    try:
        return send_from_directory(STATIC_DIR, 'Assign.html')
    except Exception as e:
        logger.warning("Failed to serve assign file: %s", e)
        abort(404)

@app.route('/login')
def login_page():
    try:
        return send_from_directory(STATIC_DIR, 'login.html')
    except Exception as e:
        logger.warning("Failed to serve login file: %s", e)
        abort(404)

@app.route('/video_feed')
@app.route('/video_feed/<int:cam_id>')
def video_feed(cam_id=0):
    if not (0 <= cam_id < NUM_CAMERAS):
        abort(404)

    def gen(cam):
        while True:
            with frame_lock:
                frame = processed_frame.get(cam)
            if frame is None:
                frame = np.zeros((480, 640, 3), dtype=np.uint8)
                cv2.putText(frame, f'Camera {cam} not available', (50, 240), cv2.FONT_HERSHEY_SIMPLEX, 1, (255, 255, 255), 2)

            ret, buffer = cv2.imencode('.jpg', frame, [cv2.IMWRITE_JPEG_QUALITY, 80])
            if not ret:
                continue

            yield (b'--frame\r\nContent-Type: image/jpeg\r\n\r\n' + buffer.tobytes() + b'\r\n')
            time.sleep(0.03)
    return Response(gen(cam_id), mimetype='multipart/x-mixed-replace; boundary=frame')

@app.route('/counts')
def get_counts():
    with counts_lock:
        agg_obj_counts = {cls: sum(object_counts_per_cam[i].get(cls, 0) for i in range(NUM_CAMERAS)) for cls in CLASSES}
    with tracks_lock:
        total_persons = sum(person_count_per_cam.values())

    response = {**agg_obj_counts, "persons": total_persons}
    return jsonify(response)

@app.route('/counts_db')
def counts_db():
    with CURRENT_SESSION_LOCK:
        sid = CURRENT_SESSION_ID
    if not sid:
        return jsonify({"ok": False, "error": "no active session"}), 400

    camera_id = request.args.get("camera_id", default=None, type=int)
    cfg = load_mysql_config()
    conn = get_mysql_conn(cfg) if cfg else None
    if conn:
        try:
            cur = conn.cursor()
            if camera_id is not None:
                cur.execute("""
                    SELECT SUM(bags_count) AS bags, SUM(boxes_count) AS boxes
                    FROM detections
                    WHERE session_id = %s AND camera_id = %s
                """, (sid, camera_id))
            else:
                cur.execute("""
                    SELECT SUM(bags_count) AS bags, SUM(boxes_count) AS boxes
                    FROM detections
                    WHERE session_id = %s
                """, (sid,))
            row = cur.fetchone()
            bags = int(row[0] or 0)
            boxes = int(row[1] or 0)
            total = bags + boxes
            try: cur.close()
            except: pass
            try: conn.close()
            except: pass
            return jsonify({"bags": bags, "boxes": boxes, "total": total, "session_id": sid})
        except Exception as e:
            logger.exception("counts_db MySQL error: %s", e)
        finally:
            try: conn.close()
            except: pass

    try:
        with sqlite3.connect(SQLITE_DB_PATH) as conn_lite:
            cur = conn_lite.cursor()
            if camera_id is not None:
                cur.execute("""
                    SELECT SUM(bags_count) AS bags, SUM(boxes_count) AS boxes
                    FROM detections
                    WHERE session_id = ? AND camera_id = ?
                """, (sid, camera_id))
            else:
                cur.execute("""
                    SELECT SUM(bags_count) AS bags, SUM(boxes_count) AS boxes
                    FROM detections
                    WHERE session_id = ?
                """, (sid,))
            row = cur.fetchone()
            bags = int(row[0] or 0)
            boxes = int(row[1] or 0)
        total = bags + boxes
        return jsonify({"bags": bags, "boxes": boxes, "total": total, "session_id": sid})
    except Exception as e:
        logger.exception("counts_db SQLite error: %s", e)
        return jsonify({"ok": False, "error": str(e)}), 500

@app.route('/report_rows')
def report_rows():
    cfg = load_mysql_config()
    conn = get_mysql_conn(cfg) if cfg else None

    if conn:
        try:
            cur = conn.cursor()
            cur.execute("""
                SELECT 
                    t.truck_no,
                    c.camera_name,
                    t.in_time,
                    t.out_time,
                    SUM(d.bags_count) AS total_bags,
                    SUM(d.boxes_count) AS total_boxes,
                    SUM(d.bags_count + d.boxes_count) AS total_count,
                    DATE(d.detection_time) AS date
                FROM detections d
                LEFT JOIN trucks t ON d.truck_id = t.truck_id
                LEFT JOIN cameras c ON d.camera_id = c.camera_id
                GROUP BY t.truck_id, c.camera_id, DATE(d.detection_time)
                ORDER BY d.detection_time DESC
                LIMIT 500
            """)
            rows = cur.fetchall()
            try: cur.close()
            except: pass
            try: conn.close()
            except: pass
            results = []
            for r in rows:
                results.append({
                    "truck_no": r[0],
                    "camera_name": r[1],
                    "in_time": r[2].isoformat() if isinstance(r[2], datetime) else r[2],
                    "out_time": r[3].isoformat() if isinstance(r[3], datetime) else r[3],
                    "total_bags": int(r[4] or 0),
                    "total_boxes": int(r[5] or 0),
                    "total_count": int(r[6] or 0),
                    "date": r[7].isoformat() if isinstance(r[7], datetime) else str(r[7])
                })
            return jsonify(results)
        except Exception as e:
            logger.exception("report_rows MySQL error: %s", e)
        finally:
            try: conn.close()
            except: pass

    try:
        with sqlite3.connect(SQLITE_DB_PATH) as conn_lite:
            conn_lite.row_factory = sqlite3.Row
            cur = conn_lite.cursor()
            cur.execute("""
                SELECT 
                    t.truck_no,
                    c.camera_name,
                    t.in_time,
                    t.out_time,
                    SUM(d.bags_count) AS total_bags,
                    SUM(d.boxes_count) AS total_boxes,
                    SUM(d.bags_count + d.boxes_count) AS total_count,
                    DATE(d.detection_time) AS date
                FROM detections d
                LEFT JOIN trucks t ON d.truck_id = t.truck_id
                LEFT JOIN cameras c ON d.camera_id = c.camera_id
                GROUP BY t.truck_id, c.camera_id, DATE(d.detection_time)
                ORDER BY d.detection_time DESC
                LIMIT 500
            """)
            rows = cur.fetchall()
        results = []
        for r in rows:
            results.append({
                "truck_no": r["truck_no"],
                "camera_name": r["camera_name"],
                "in_time": r["in_time"],
                "out_time": r["out_time"],
                "total_bags": int(r["total_bags"] or 0),
                "total_boxes": int(r["total_boxes"] or 0),
                "total_count": int(r["total_count"] or 0),
                "date": r["date"]
            })
        return jsonify(results)
    except Exception as e:
        logger.exception("report_rows SQLite error: %s", e)
        return jsonify({"ok": False, "error": str(e)}), 500

@app.route('/status')
def get_status():
    per_cam_status = []
    for cam_id in range(NUM_CAMERAS):
        per_cam_status.append({
            "camera_id": cam_id,
            "source": CAMERA_SOURCES[cam_id] if cam_id < len(CAMERA_SOURCES) else None,
            "detection_enabled": DETECTION_ENABLED,
            "active_tracks": len(latest_tracks.get(cam_id, [])),
            "persons_detected": len(latest_persons.get(cam_id, [])),
            "frame_shape": last_frame_shape.get(cam_id, None)
        })
    status = {
        "device": device,
        "global_detection_enabled": DETECTION_ENABLED,
        "global_session_id": CURRENT_SESSION_ID,
        "num_cameras": NUM_CAMERAS,
        "per_camera": per_cam_status,
        "timestamp": datetime.now().isoformat()
    }
    return jsonify(status)

@app.route('/start', methods=['POST'])
def api_start():
    global DETECTION_ENABLED, CURRENT_SESSION_ID
    try:
        with DETECTION_ENABLED_LOCK:
            if DETECTION_ENABLED:
                return jsonify({"ok": True, "message": "already running", "session_id": CURRENT_SESSION_ID})

            load_models()
            sid = str(uuid.uuid4())
            with CURRENT_SESSION_LOCK:
                CURRENT_SESSION_ID = sid

            save_session_start(sid)
            _reset_all_states()
            _start_all_cameras()
            DETECTION_ENABLED = True
            logger.info(f"GLOBAL DETECTION STARTED. Session ID: {sid}")
        return jsonify({"ok": True, "session_id": sid})
    except Exception as e:
        logger.exception("Start endpoint error: %s", e)
        return jsonify({"ok": False, "error": str(e)}), 500

@app.route('/stop', methods=['POST'])
def api_stop():
    global DETECTION_ENABLED, CURRENT_SESSION_ID
    try:
        with DETECTION_ENABLED_LOCK:
            if not DETECTION_ENABLED:
                return jsonify({"ok": True, "message": "already stopped", "session_id": CURRENT_SESSION_ID})
            DETECTION_ENABLED = False
            logger.info("GLOBAL DETECTION STOPPING...")

        _stop_all_cameras()
        with CURRENT_SESSION_LOCK:
            sid = CURRENT_SESSION_ID
            CURRENT_SESSION_ID = None

        if sid:
            save_session_end(sid)

        logger.info(f"GLOBAL DETECTION STOPPED. Session ID was: {sid}")
        return jsonify({"ok": True, "session_id": sid})
    except Exception as e:
        logger.exception("Stop endpoint error: %s", e)
        return jsonify({"ok": False, "error": str(e)}), 500

# ---------- Helper functions to manage cameras lifecycle ----------
def _reset_cam_state(cam_id):
    with tracks_lock:
        object_counts_per_cam[cam_id] = {cls: 0 for cls in CLASSES}
        track_histories[cam_id].clear()
        latest_tracks[cam_id].clear()
        latest_persons[cam_id].clear()
        person_count_per_cam[cam_id] = 0

def _reset_all_states():
    for cam_id in range(NUM_CAMERAS):
        _reset_cam_state(cam_id)
    logger.info("All camera states and counts have been reset.")

def _start_camera(cam_id):
    global camera_processes, detection_threads, counting_threads, frame_queues
    if not (0 <= cam_id < NUM_CAMERAS):
        return
    if camera_processes[cam_id] is not None and camera_processes[cam_id].is_alive():
        logger.info(f"Camera {cam_id} is already running.")
        return

    src = CAMERA_SOURCES[cam_id]
    shutdown_event = Event()
    q = Queue(maxsize=5)

    p = Process(target=camera_process, args=(src, q, shutdown_event))
    p.daemon = True
    dt = threading.Thread(target=detection_and_person_worker, args=(q, cam_id, shutdown_event), daemon=True)
    ct = CountingThread(cam_id, shutdown_event)

    frame_queues[cam_id] = (q, shutdown_event)
    camera_processes[cam_id] = p
    detection_threads[cam_id] = dt
    counting_threads[cam_id] = ct

    p.start()
    dt.start()
    ct.start()
    logger.info(f"Started camera {cam_id} with source {src}")

def _start_all_cameras():
    for cam_id in range(NUM_CAMERAS):
        _start_camera(cam_id)
    logger.info("All cameras started.")

def _stop_camera(cam_id):
    global camera_processes, detection_threads, counting_threads, frame_queues
    if not (0 <= cam_id < NUM_CAMERAS) or frame_queues[cam_id] is None:
        return

    q, shutdown_event = frame_queues[cam_id]
    shutdown_event.set()

    p = camera_processes[cam_id]
    if p:
        p.join(timeout=5)
        if p.is_alive():
            p.terminate()
            logger.warning(f"Camera process {cam_id} did not shut down gracefully, terminated.")

    if detection_threads[cam_id]:
        detection_threads[cam_id].join(timeout=2)
    if counting_threads[cam_id]:
        counting_threads[cam_id].join(timeout=2)

    camera_processes[cam_id] = None
    detection_threads[cam_id] = None
    counting_threads[cam_id] = None
    frame_queues[cam_id] = None

    _reset_cam_state(cam_id)
    logger.info(f"Stopped camera {cam_id}")

def _stop_all_cameras():
    logger.info("Stopping all cameras...")
    for cam_id in range(NUM_CAMERAS):
        _stop_camera(cam_id)
    logger.info("All cameras have been stopped.")

# ---------- Startup ----------
if __name__ == "__main__":
    import argparse
    parser = argparse.ArgumentParser()
    parser.add_argument("--host", default="0.0.0.0")
    parser.add_argument("--port", type=int, default=5000)
    parser.add_argument("--debug", action="store_true")
    args = parser.parse_args()

    init_sqlite_db()

    cfg = load_mysql_config()
    if cfg and get_mysql_conn(cfg):
        logger.info("MySQL connection successful. Will use MySQL for persistence.")
    else:
        logger.info("MySQL not available or configured. Using SQLite fallback.")

    logger.info("Flask app starting... Open http://127.0.0.1:%d in your browser.", args.port)
    try:
        app.run(host=args.host, port=args.port, debug=args.debug, threaded=True, use_reloader=False)
    except KeyboardInterrupt:
        logger.info("Shutting down due to KeyboardInterrupt...")
    finally:
        _stop_all_cameras()