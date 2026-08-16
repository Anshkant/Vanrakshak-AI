#!/usr/bin/env python3
"""
Single-file AI detection app:
- YOLO (bag/box) detection
- YOLOv8n person detection
- DeepSort tracking
- Counting using crossing two horizontal lines
- Flask server with embedded UI (no templates / no DB)
"""

import os
import sys
import time
import uuid
import json
import logging
import threading
from collections import deque
from multiprocessing import Process, Queue
from datetime import datetime
from io import BytesIO

# Third-party imports
try:
    import cv2
    import numpy as np
    import torch
    from flask import Flask, Response, jsonify, request, abort
    from flask_cors import CORS
    from ultralytics import YOLO
    from deep_sort_realtime.deepsort_tracker import DeepSort
except Exception as e:
    print("Missing dependencies or import error:", e)
    print("Install required packages: ultralytics deep-sort-realtime torch opencv-python flask flask-cors numpy")
    raise

# ---------- CONFIG ----------
BASE_DIR = os.path.dirname(os.path.abspath(__file__))

# Replace these with your model paths
MODEL_PATH = r"C:\Users\ADITYA\OneDrive\Desktop\final_prj\final_prj\best.pt"
PERSON_MODEL_PATH = r"C:\Users\ADITYA\OneDrive\Desktop\final_prj\final_prj\yolov8n.pt"

# Default camera sources (RTSP / indices / device strings)
CAMERA_SOURCES = [
    0,
    1
]

# Detection / counting config
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

FRAME_WIDTH = 1280
FRAME_HEIGHT = 720

YOLO_IMGSZ = 1080
YOLO_CONF = 0.36
YOLO_IOU = 0.48
PERSON_CONF = 0.45
PERSON_IOU = 0.5
DETECTION_SLEEP = 0.055

device = 'cuda' if (torch.cuda.is_available()) else 'cpu'
print(f"⚡ Using device: {device}")

# ---------- Logging ----------
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("merged_app")

# ---------- Globals ----------
NUM_CAMERAS = max(1, min(16, len(CAMERA_SOURCES)))

# Processed frames served by /video_feed/<id>
processed_frame = {i: None for i in range(NUM_CAMERAS)}
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

# Per-camera detection control
detection_enabled_per_cam = {i: False for i in range(NUM_CAMERAS)}
session_ids_per_cam = {i: None for i in range(NUM_CAMERAS)}
sessions_lock = threading.Lock()

# Camera lifecycle
camera_processes = []
detection_threads = []
person_threads = []
counting_threads = []
frame_queues = []

# ---------- Models & tracker (initialized lazily) ----------
model = None
person_model = None
tracker = None

def load_models():
    global model, person_model, tracker
    if model is not None and person_model is not None and tracker is not None:
        return
    try:
        logger.info("Loading YOLO model (bags/boxes) from: %s", MODEL_PATH)
        model = YOLO(MODEL_PATH)
        logger.info("✔ Loaded bag/box model.")
    except Exception as e:
        logger.exception("Failed to load bag/box model: %s", e)
        raise
    try:
        logger.info("Loading person model from: %s", PERSON_MODEL_PATH)
        person_model = YOLO(PERSON_MODEL_PATH)
        logger.info("✔ Loaded person model.")
    except Exception as e:
        logger.exception("Failed to load person model: %s", e)
        raise
    try:
        tracker = DeepSort(max_age=30, n_init=3, max_cosine_distance=0.3)
        logger.info("✔ DeepSort tracker initialized.")
    except Exception as e:
        logger.exception("Failed to init DeepSort: %s", e)
        raise

# ---------- Camera utilities ----------
def attempt_open(candidate, backend=None):
    try:
        if backend is not None:
            cap = cv2.VideoCapture(candidate, backend)
        else:
            cap = cv2.VideoCapture(candidate)
        if cap.isOpened():
            return cap
        else:
            try: cap.release()
            except Exception: pass
            return None
    except Exception as e:
        logger.debug("attempt_open exception for %s (%s): %s", candidate, backend, e)
        return None

def try_open_camera_candidates(source):
    """
    Attempts multiple ways to open the provided source.
    Returns a cv2.VideoCapture or None.
    """
    if isinstance(source, (int,)) or (isinstance(source, str) and source.isdigit()):
        try:
            idx = int(source)
            cap = attempt_open(idx)
            if cap:
                return cap
        except Exception:
            pass
        for i in range(0, 8):
            cap = attempt_open(i)
            if cap:
                return cap
        if os.name == "posix":
            for i in range(0, 8):
                cap = attempt_open(i, cv2.CAP_V4L2)
                if cap:
                    return cap
        else:
            for i in range(0, 8):
                cap = attempt_open(i, cv2.CAP_DSHOW)
                if cap:
                    return cap

    if isinstance(source, str):
        cap = attempt_open(source)
        if cap:
            return cap
        if os.name == "posix":
            if source in ("auto", "usb", ""):
                for i in range(0, 8):
                    dev = f"/dev/video{i}"
                    if os.path.exists(dev):
                        cap = attempt_open(dev, cv2.CAP_V4L2)
                        if cap:
                            return cap
            else:
                cap = attempt_open(source, cv2.CAP_V4L2)
                if cap:
                    return cap
        try:
            cap = attempt_open(source, cv2.CAP_FFMPEG)
            if cap:
                return cap
        except Exception:
            pass

    return None

def _normalize_source_input(source):
    if source is None:
        return 0
    if isinstance(source, int):
        return source
    if isinstance(source, float):
        try:
            return int(source)
        except Exception:
            return str(source)
    if isinstance(source, bytes):
        try:
            source = source.decode("utf-8")
        except Exception:
            source = str(source)
    if isinstance(source, str):
        s = source.strip()
        if s.isdigit():
            try:
                return int(s)
            except Exception:
                return s
        return s
    return str(source)

# ---------- Camera process & worker functions ----------
def camera_process(rtsp_or_index, frame_queue, reconnect_interval=5.0, use_usb_only=False):
    """
    Runs in its own Process. Reads frames and pushes them into a multiprocessing.Queue.
    """
    import time
    def open_capture(source, use_ffmpeg=False):
        if isinstance(source, int):
            cap = cv2.VideoCapture(source)
            try:
                cap.set(cv2.CAP_PROP_FRAME_WIDTH, FRAME_WIDTH)
                cap.set(cv2.CAP_PROP_FRAME_HEIGHT, FRAME_HEIGHT)
            except Exception:
                pass
            return cap
        else:
            try:
                if use_ffmpeg and hasattr(cv2, 'CAP_FFMPEG'):
                    cap = cv2.VideoCapture(source, cv2.CAP_FFMPEG)
                else:
                    cap = cv2.VideoCapture(source)
                try:
                    cap.set(cv2.CAP_PROP_FRAME_WIDTH, FRAME_WIDTH)
                    cap.set(cv2.CAP_PROP_FRAME_HEIGHT, FRAME_HEIGHT)
                except Exception:
                    pass
                return cap
            except Exception:
                return cv2.VideoCapture(source)

    while not SHUTDOWN_FLAG.is_set():
        cap = None
        if use_usb_only:
            idx = int(rtsp_or_index) if isinstance(rtsp_or_index, int) or (isinstance(rtsp_or_index, str) and rtsp_or_index.isdigit()) else FALLBACK_USB_INDEX
            logger.info("🔌 Camera (USB-only) opening index %s", idx)
            cap = open_capture(idx)
        else:
            if isinstance(rtsp_or_index, str) and rtsp_or_index.lower().startswith(("rtsp://", "rtmp://", "http://", "https://")):
                logger.info("🌐 Trying RTSP stream: %s", rtsp_or_index)
                cap = open_capture(rtsp_or_index, use_ffmpeg=True)
                if not cap.isOpened():
                    logger.warning("❌ RTSP open failed, trying USB fallback...")
                    try: cap.release()
                    except: pass
                    cap = open_capture(FALLBACK_USB_INDEX)
            else:
                try:
                    idx = int(rtsp_or_index)
                except Exception:
                    idx = FALLBACK_USB_INDEX
                logger.info("🔌 Opening camera index %d...", idx)
                cap = open_capture(idx)

        if not cap or not cap.isOpened():
            logger.warning("❌ Could not open camera %s. Retrying in %s seconds", rtsp_or_index, reconnect_interval)
            try: cap.release()
            except Exception: pass
            time.sleep(reconnect_interval)
            continue

        logger.info("✅ Camera %s opened successfully.", rtsp_or_index)
        while not SHUTDOWN_FLAG.is_set():
            ret, frame = cap.read()
            if not ret or frame is None:
                logger.warning("⚠ Lost camera read - will attempt to reconnect...")
                break
            try:
                if not frame_queue.full():
                    frame_queue.put(frame)
            except Exception:
                pass
            # small sleep to avoid starvation
            time.sleep(0.005)
        try: cap.release()
        except Exception: pass
        time.sleep(0.5)

def detect_objects(frame):
    """
    Calls the bag/box YOLO model and returns results
    """
    results = model.predict(frame, imgsz=YOLO_IMGSZ, conf=YOLO_CONF, iou=YOLO_IOU, device=device, verbose=False)
    return results

def track_objects(detections, frame):
    tracks = tracker.update_tracks(detections, frame=frame)
    return tracks

def detection_worker(frame_queue, camera_id):
    """
    Thread: takes frames from frame_queue, runs detection+tracking and updates processed_frame and track_histories.
    """
    global processed_frame, latest_tracks, track_histories, last_frame_shape
    while not SHUTDOWN_FLAG.is_set():
        if frame_queue is None or frame_queue.empty():
            time.sleep(0.01)
            continue
        frame = frame_queue.get()
        if frame is None:
            time.sleep(0.01)
            continue
        h, w = frame.shape[:2]
        last_frame_shape[camera_id] = (h, w)
        try:
            detections = detect_objects(frame)
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
            # DeepSort expects list of bbox + conf + class
            tracks = track_objects(dets, frame)
            now_ts = time.time()
            with tracks_lock:
                latest_tracks[camera_id] = tracks
                for track in tracks:
                    try:
                        if hasattr(track, "is_confirmed") and not track.is_confirmed():
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
                    except Exception:
                        continue
            # overlay drawing
            overlay = frame.copy()
            for track in tracks:
                try:
                    x1, y1, x2, y2 = map(int, track.to_ltrb())
                    color = (0, 255, 0)
                    cv2.rectangle(overlay, (x1, y1), (x2, y2), color, 2)
                    cv2.putText(overlay, f"{getattr(track, 'det_class', 'obj')} ID:{track.track_id}",
                                (x1, max(0, y1 - 10)), cv2.FONT_HERSHEY_SIMPLEX, 0.6, color, 2)
                except Exception:
                    pass
            # draw counting lines
            cv2.line(overlay, (0, LINE_1_Y), (w, LINE_1_Y), (0, 0, 255), 2)
            cv2.line(overlay, (0, LINE_2_Y), (w, LINE_2_Y), (0, 0, 255), 2)
            with frame_lock:
                processed_frame[camera_id] = overlay.copy()
        except Exception as e:
            logger.exception("⚠ Detection pipeline failed (camera %s): %s", camera_id, e)
            time.sleep(0.05)

def person_detection_worker(frame_queue, camera_id):
    """
    Thread: runs person detector and overlays person boxes onto processed_frame
    """
    global latest_persons, person_count_per_cam, processed_frame
    while not SHUTDOWN_FLAG.is_set():
        if frame_queue is None or frame_queue.empty():
            time.sleep(0.02)
            continue
        frame = frame_queue.get()
        if frame is None:
            time.sleep(0.02)
            continue
        try:
            results = person_model.predict(frame, imgsz=640, conf=PERSON_CONF, iou=PERSON_IOU, device=device, verbose=False)[0]
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
                        cv2.putText(overlay, f"Person {conf:.2f}", (x1, y1 - 5),
                                    cv2.FONT_HERSHEY_SIMPLEX, 0.5, (255, 0, 0), 2)
                    processed_frame[camera_id] = overlay
        except Exception as e:
            logger.exception("⚠ Person detection failed (camera %s): %s", camera_id, e)
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
                    cls_name = hist.get('class', 'object')
                    if hist['frames'] < MIN_LIFETIME:
                        continue
                    try:
                        cx, cy = hist['centroids'][-1]
                    except Exception:
                        continue
                    prev_y = hist['centroids'][-2][1] if len(hist['centroids']) > 1 else None

                    if (not hist['crossed_1']) and (cy > (line1_y - OFFSET)):
                        if ENFORCE_DOWNWARD_MOVEMENT and prev_y is not None and cy >= prev_y:
                            hist['crossed_1'] = True
                        elif not ENFORCE_DOWNWARD_MOVEMENT:
                            hist['crossed_1'] = True

                    if hist['crossed_1'] and (not hist['crossed_2']) and (cy > (line2_y - OFFSET)):
                        if ENFORCE_DOWNWARD_MOVEMENT and prev_y is not None and cy >= prev_y:
                            hist['crossed_2'] = True
                        elif not ENFORCE_DOWNWARD_MOVEMENT:
                            hist['crossed_2'] = True

                    if hist['crossed_1'] and hist['crossed_2'] and (not hist['counted']):
                        with counts_lock:
                            object_counts_per_cam[cam][cls_name] = object_counts_per_cam[cam].get(cls_name, 0) + 1
                        hist['counted'] = True
                        logger.info("✅ COUNTED (cam %s): %s (track %s) — total %s", cam, cls_name, tid, object_counts_per_cam[cam][cls_name])
                        # No DB persistence in this simplified version

            time.sleep(0.25)
        logger.info("CountingThread stopped for camera %s.", cam)

    def stop(self):
        self.running = False

# ---------- Flask app (embedded UI) ----------
app = Flask(__name__)
CORS(app)

@app.route("/")
def index():
    # Simple single-page UI embedded in Python
    html = f"""
<!doctype html>
<html>
<head>
  <meta charset="utf-8">
  <title>AI Detection Dashboard</title>
  <style>
    body {{ background:#0f1724; color:#e6eef8; font-family: Arial, sans-serif; margin:0; }}
    .header {{ padding:14px; text-align:center; font-size:22px; background:#081028; box-shadow:0 2px 6px rgba(0,0,0,0.5); }}
    .controls {{ padding:12px; display:flex; gap:10px; justify-content:center; background:#071226; }}
    button {{ padding:8px 14px; border-radius:6px; border:none; cursor:pointer; }}
    button.primary {{ background:#0ea5a4; color:#002; font-weight:bold; }}
    button.warn {{ background:#f97316; color:white; }}
    .grid {{ display:grid; grid-template-columns:repeat(2, 1fr); gap:12px; padding:12px; }}
    .panel {{ background:#071026; padding:10px; border-radius:8px; box-shadow:0 2px 8px rgba(0,0,0,0.6); }}
    iframe {{ width:100%; height:360px; border-radius:6px; border:1px solid #223; }}
    .counts {{ display:flex; gap:10px; justify-content:space-around; margin-top:8px; }}
    .tile {{ background:#081726; padding:10px; border-radius:6px; text-align:center; min-width:120px; }}
    .small {{ font-size:12px; color:#9fb6d6; }}
  </style>
</head>
<body>
  <div class="header">AI Detection Dashboard (Single File)</div>
  <div class="controls">
    <button id="startAll" class="primary">Start All</button>
    <button id="stopAll" class="warn">Stop All</button>
    <div style="width:12px;"></div>
    <div id="session" style="align-self:center;color:#9fb6d6"></div>
  </div>

  <div class="grid">
    <div class="panel">
      <h3>Camera 0</h3>
      <iframe src="/video_feed/0"></iframe>
      <div class="counts">
        <div class="tile"><div class="small">Bags</div><div id="bag0">0</div></div>
        <div class="tile"><div class="small">Boxes</div><div id="box0">0</div></div>
        <div class="tile"><div class="small">Persons</div><div id="person0">0</div></div>
      </div>
      <div style="margin-top:8px; display:flex; gap:8px;">
        <button onclick="startCam(0)">Start Cam 0</button>
        <button onclick="stopCam(0)" class="warn">Stop Cam 0</button>
      </div>
    </div>

    <div class="panel">
      <h3>Camera 1</h3>
      <iframe src="/video_feed/1"></iframe>
      <div class="counts">
        <div class="tile"><div class="small">Bags</div><div id="bag1">0</div></div>
        <div class="tile"><div class="small">Boxes</div><div id="box1">0</div></div>
        <div class="tile"><div class="small">Persons</div><div id="person1">0</div></div>
      </div>
      <div style="margin-top:8px; display:flex; gap:8px;">
        <button onclick="startCam(1)">Start Cam 1</button>
        <button onclick="stopCam(1)" class="warn">Stop Cam 1</button>
      </div>
    </div>
  </div>

<script>
function updateCounts(){
  fetch('/counts').then(r=>r.json()).then(data=>{
    // aggregated counts (per-class) are top-level; we also expose per-camera in 'per_camera' if available
    if(data.per_camera){
      data.per_camera.forEach(function(pc){
        var id = pc.camera_id;
        document.getElementById('bag'+id).innerText = pc.counts.bag || 0;
        document.getElementById('box'+id).innerText = pc.counts.box || 0;
        document.getElementById('person'+id).innerText = pc.persons || 0;
      });
    } else {
      document.getElementById('bag0').innerText = data.bag || 0;
      document.getElementById('box0').innerText = data.box || 0;
      document.getElementById('person0').innerText = data.persons || 0;
      document.getElementById('bag1').innerText = data.bag || 0;
      document.getElementById('box1').innerText = data.box || 0;
      document.getElementById('person1').innerText = data.persons || 0;
    }
  }).catch(err=>{ /* ignore */ });
  fetch('/status').then(r=>r.json()).then(s=>{
    document.getElementById('session').innerText = 'Session: ' + (s.session_id || 'none') + ' | Running: ' + s.detection_enabled;
  }).catch(()=>{});
}

setInterval(updateCounts, 1000);
updateCounts();

document.getElementById('startAll').addEventListener('click', ()=>{
  fetch('/start', {method:'POST'}).then(r=>r.json()).then(console.log).catch(console.error);
});
document.getElementById('stopAll').addEventListener('click', ()=>{
  fetch('/stop', {method:'POST'}).then(r=>r.json()).then(console.log).catch(console.error);
});

function startCam(id){
  fetch('/start/' + id, {method:'POST'}).then(r=>r.json()).then(console.log).catch(console.error);
}
function stopCam(id){
  fetch('/stop/' + id, {method:'POST'}).then(r=>r.json()).then(console.log).catch(console.error);
}
</script>
</body>
</html>
    """
    return html

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
    """
    Returns aggregated counts and per-camera counts.
    Format:
    {
      "bag": total_bag,
      "box": total_box,
      "persons": total_persons,
      "per_camera": [
         {"camera_id":0, "counts": {"bag":..., "box":...}, "persons": n},
         ...
      ]
    }
    """
    agg = {cls: 0 for cls in CLASSES}
    total_persons = 0
    per_camera = []
    with counts_lock:
        for cam_id in range(NUM_CAMERAS):
            cam_counts = object_counts_per_cam.get(cam_id, {})
            for cls in CLASSES:
                agg[cls] = agg.get(cls, 0) + cam_counts.get(cls, 0)
            total_persons += person_count_per_cam.get(cam_id, 0)
            per_camera.append({
                "camera_id": cam_id,
                "counts": {cls: cam_counts.get(cls, 0) for cls in CLASSES},
                "persons": person_count_per_cam.get(cam_id, 0)
            })
    response = dict(agg)
    response['persons'] = total_persons
    response['per_camera'] = per_camera
    return jsonify(response)

@app.route('/status')
def get_status():
    with DETECTION_ENABLED_LOCK:
        enabled = DETECTION_ENABLED
    with CURRENT_SESSION_LOCK:
        sid = CURRENT_SESSION_ID
    per_cam_status = []
    with tracks_lock:
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

# ---------- Start/Stop endpoints ----------
@app.route('/start', methods=['POST'])
def api_start():
    global DETECTION_ENABLED, object_counts_per_cam, track_histories, CURRENT_SESSION_ID
    try:
        with DETECTION_ENABLED_LOCK:
            if DETECTION_ENABLED:
                logger.info("Start requested but already running.")
                return jsonify({"ok": True, "message": "already running", "session_id": CURRENT_SESSION_ID})
            # load models before starting
            load_models()
            # create session id and reset state
            sid = str(uuid.uuid4())
            with CURRENT_SESSION_LOCK:
                CURRENT_SESSION_ID = sid
            with tracks_lock:
                for cam in range(NUM_CAMERAS):
                    object_counts_per_cam[cam] = {cls: 0 for cls in CLASSES}
                    track_histories[cam].clear()
                    latest_tracks[cam].clear()
                    latest_persons[cam].clear()

            # start camera processes / worker threads
            _start_all_cameras()
            DETECTION_ENABLED = True
            logger.info("Detection started. session_id=%s", sid)
        return jsonify({"ok": True, "session_id": sid})
    except Exception as e:
        logger.exception("Start endpoint error: %s", e)
        return jsonify({"ok": False, "error": str(e)}), 500

@app.route('/stop', methods=['POST'])
def api_stop():
    global DETECTION_ENABLED, object_counts_per_cam, CURRENT_SESSION_ID
    try:
        with DETECTION_ENABLED_LOCK:
            if not DETECTION_ENABLED:
                logger.info("Stop requested but already stopped.")
                sid = CURRENT_SESSION_ID
                return jsonify({"ok": True, "message": "already stopped", "session_id": sid})
            DETECTION_ENABLED = False
            logger.info("Detection stopping...")
        # stop all camera processes/threads
        _stop_all_cameras()

        # reset local counts & session
        with tracks_lock:
            for cam in range(NUM_CAMERAS):
                object_counts_per_cam[cam] = {cls: 0 for cls in CLASSES}
                track_histories[cam].clear()
                latest_tracks[cam].clear()
                latest_persons[cam].clear()
        with CURRENT_SESSION_LOCK:
            sid = CURRENT_SESSION_ID
            CURRENT_SESSION_ID = None
        return jsonify({"ok": True, "session_id": sid})
    except Exception as e:
        logger.exception("Stop endpoint error: %s", e)
        return jsonify({"ok": False, "error": str(e)}), 500

@app.route('/start/<int:cam_id>', methods=['POST'])
def start_camera(cam_id):
    if cam_id < 0 or cam_id >= NUM_CAMERAS:
        return jsonify({"ok": False, "error": "invalid cam_id"}), 400
    try:
        with sessions_lock:
            if detection_enabled_per_cam.get(cam_id):
                return jsonify({"ok": True, "message": "camera already running", "camera_id": cam_id, "session_id": session_ids_per_cam.get(cam_id)})
            sid = str(uuid.uuid4())
            session_ids_per_cam[cam_id] = sid
            detection_enabled_per_cam[cam_id] = True
            # reset camera state
            with tracks_lock:
                object_counts_per_cam[cam_id] = {cls: 0 for cls in CLASSES}
                track_histories[cam_id].clear()
                latest_tracks[cam_id].clear()
                latest_persons[cam_id].clear()
        _start_camera(cam_id)
        logger.info("Per-camera start: cam=%s sid=%s", cam_id, sid)
        return jsonify({"ok": True, "camera_id": cam_id, "session_id": sid})
    except Exception as e:
        logger.exception("start_camera error: %s", e)
        return jsonify({"ok": False, "error": str(e)}), 500

@app.route('/stop/<int:cam_id>', methods=['POST'])
def stop_camera(cam_id):
    if cam_id < 0 or cam_id >= NUM_CAMERAS:
        return jsonify({"ok": False, "error": "invalid cam_id"}), 400
    try:
        with sessions_lock:
            if not detection_enabled_per_cam.get(cam_id):
                sid = session_ids_per_cam.get(cam_id)
                return jsonify({"ok": True, "message": "camera already stopped", "camera_id": cam_id, "session_id": sid})
            detection_enabled_per_cam[cam_id] = False
            sid = session_ids_per_cam.get(cam_id)
            session_ids_per_cam[cam_id] = None
        _stop_camera(cam_id)
        # reset camera counts and tracks
        with tracks_lock:
            object_counts_per_cam[cam_id] = {cls: 0 for cls in CLASSES}
            track_histories[cam_id].clear()
            latest_tracks[cam_id].clear()
            latest_persons[cam_id].clear()
        logger.info("Per-camera stop: cam=%s sid=%s", cam_id, sid)
        return jsonify({"ok": True, "camera_id": cam_id, "session_id": sid})
    except Exception as e:
        logger.exception("stop_camera error: %s", e)
        return jsonify({"ok": False, "error": str(e)}), 500

# ---------- Camera lifecycle helpers ----------
def _start_all_cameras():
    """
    Start camera processes and worker threads for all configured CAMERA_SOURCES.
    """
    global camera_processes, detection_threads, person_threads, counting_threads, frame_queues

    if camera_processes:
        logger.info("_start_all_cameras called but camera processes already exist.")
        return

    sources = list(CAMERA_SOURCES)[:NUM_CAMERAS]
    if len(sources) < NUM_CAMERAS:
        for _ in range(NUM_CAMERAS - len(sources)):
            sources.append(FALLBACK_USB_INDEX)

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
        detection_threads.append(dt)
        pt = threading.Thread(target=person_detection_worker, args=(q, cam_id), daemon=True)
        person_threads.append(pt)
        ct = CountingThread(cam_id)
        counting_threads.append(ct)

    # start
    for p in camera_processes:
        p.start()
    for t in detection_threads:
        t.start()
    for t in person_threads:
        t.start()
    for ct in counting_threads:
        ct.start()

    logger.info("Started all camera processes and worker threads.")

def _stop_all_cameras():
    global camera_processes, detection_threads, person_threads, counting_threads, frame_queues
    SHUTDOWN_FLAG.set()
    for p in camera_processes:
        try:
            p.terminate()
        except Exception:
            pass
    for ct in counting_threads:
        try:
            ct.stop()
        except Exception:
            pass
    camera_processes = []
    detection_threads = []
    person_threads = []
    counting_threads = []
    frame_queues = []
    SHUTDOWN_FLAG.clear()
    logger.info("Stopped all camera processes and worker threads.")

def _start_camera(cam_id):
    """
    Start a single camera's process and threads.
    """
    global camera_processes, detection_threads, person_threads, counting_threads, frame_queues

    # Ensure models are loaded
    load_models()

    if not frame_queues:
        frame_queues = [None] * NUM_CAMERAS
        camera_processes = [None] * NUM_CAMERAS
        detection_threads = [None] * NUM_CAMERAS
        person_threads = [None] * NUM_CAMERAS
        counting_threads = [None] * NUM_CAMERAS

    if frame_queues[cam_id] is not None:
        logger.info("_start_camera: cam %d already started", cam_id)
        return

    src = CAMERA_SOURCES[cam_id] if cam_id < len(CAMERA_SOURCES) else FALLBACK_USB_INDEX
    q = Queue(maxsize=4)
    frame_queues[cam_id] = q
    p = Process(target=camera_process, args=(src, q, 5.0, CAMERA_USE_USB_ONLY_GLOBAL))
    p.daemon = True
    camera_processes[cam_id] = p
    dt = threading.Thread(target=detection_worker, args=(q, cam_id), daemon=True)
    detection_threads[cam_id] = dt
    pt = threading.Thread(target=person_detection_worker, args=(q, cam_id), daemon=True)
    person_threads[cam_id] = pt
    ct = CountingThread(cam_id)
    counting_threads[cam_id] = ct

    p.start()
    dt.start()
    pt.start()
    ct.start()

    logger.info("_start_camera: started cam %d", cam_id)

def _stop_camera(cam_id):
    global camera_processes, detection_threads, person_threads, counting_threads, frame_queues
    try:
        if camera_processes and camera_processes[cam_id] is not None:
            try:
                camera_processes[cam_id].terminate()
            except Exception:
                pass
            camera_processes[cam_id] = None
        if counting_threads and counting_threads[cam_id] is not None:
            try:
                counting_threads[cam_id].stop()
            except Exception:
                pass
            counting_threads[cam_id] = None
        frame_queues[cam_id] = None
        logger.info("_stop_camera: stopped cam %d", cam_id)
    except Exception as e:
        logger.exception("_stop_camera error for cam %d: %s", cam_id, e)

# ---------- Startup ----------
def parse_args_and_run():
    import argparse
    parser = argparse.ArgumentParser()
    parser.add_argument("--host", default="0.0.0.0")
    parser.add_argument("--port", type=int, default=5000)
    parser.add_argument("--debug", action="store_true")
    args = parser.parse_args()

    logger.info("Starting Flask app on %s:%d", args.host, args.port)
    try:
        app.run(host=args.host, port=args.port, debug=args.debug, threaded=True, use_reloader=False)
    except KeyboardInterrupt:
        logger.info("Shutting down due to KeyboardInterrupt...")
        _stop_all_cameras()
    except Exception as e:
        logger.exception("Flask run raised exception: %s", e)
        _stop_all_cameras()

if __name__ == "__main__":
    parse_args_and_run()
