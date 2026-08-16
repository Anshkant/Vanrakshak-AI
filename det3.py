"""
4-Camera YOLO + DeepSORT (deep-sort-realtime) Dashboard
- Single file
- YOLO for detection
- DeepSORT for ID tracking
- FastAPI for simple 4-tile web dashboard
"""

import threading
import time
from collections import deque

import cv2
import numpy as np
from fastapi import FastAPI
from fastapi.responses import HTMLResponse, StreamingResponse, JSONResponse
from ultralytics import YOLO
from deep_sort_realtime.deepsort_tracker import DeepSort

# -----------------------
# CONFIG
# -----------------------
CAM_SOURCES = [
    #"rtsp://admin:Suruchi%40112@192.168.4.132:554/Streaming/Channels/101",
    #"rtsp://admin:pass@192.168.4.133:554/Streaming/Channels/101",
   0 ,#"rtsp://admin:pass@192.168.4.134:554/Streaming/Channels/101",
   1 #"rtsp://admin:pass@192.168.4.135:554/Streaming/Channels/101",
]

MODEL_PATH = r"C:\Users\ADITYA\OneDrive\Desktop\object new detection.v2i.yolov11\best.pt"

YOLO_IMGSZ = 640
YOLO_CONF = 0.30

JPEG_QUALITY = 70
PROCESS_SLEEP = 0.002  # small sleep so loop is not 100% busy

# -----------------------
# GLOBALS
# -----------------------
app = FastAPI(title="4-Cam YOLO + DeepSORT")

caps = []
trackers = []
latest_jpeg = []
counts = []
track_histories = []
shutdown_flag = False
process_thread = None

# -----------------------
# HTML Dashboard
# -----------------------
HTML_PAGE = """
<!doctype html>
<html>
  <head>
    <title>4-Camera Dashboard</title>
    <style>
      body { background:#111; color:#eee; font-family:Arial,Helvetica,sans-serif; }
      .grid { display:grid; grid-template-columns: 1fr 1fr; gap:10px; padding:10px; }
      .card { background:#121212; border-radius:6px; padding:8px; box-shadow: 0 2px 8px rgba(0,0,0,0.6); }
      img { width:100%; height:360px; object-fit:cover; border-radius:4px; }
      h2 { font-size:16px; margin:8px 0 4px; color:#00e0ff; }
    </style>
  </head>
  <body>
    <h1 style="text-align:center">4-Camera YOLO + DeepSORT Dashboard</h1>
    <div class="grid">
      <div class="card"><h2>Camera 1 (Count: <span id="c1">0</span>)</h2><img id="c1img" src="/cam1"></div>
      <div class="card"><h2>Camera 2 (Count: <span id="c2">0</span>)</h2><img id="c2img" src="/cam2"></div>
      <div class="card"><h2>Camera 3 (Count: <span id="c3">0</span>)</h2><img id="c3img" src="/cam3"></div>
      <div class="card"><h2>Camera 4 (Count: <span id="c4">0</span>)</h2><img id="c4img" src="/cam4"></div>
    </div>
    <script>
      async function updateCounts(){
        try{
          const r = await fetch('/counts');
          const j = await r.json();
          document.getElementById('c1').innerText = j.cam0 || 0;
          document.getElementById('c2').innerText = j.cam1 || 0;
          document.getElementById('c3').innerText = j.cam2 || 0;
          document.getElementById('c4').innerText = j.cam3 || 0;
        }catch(e){}
      }
      setInterval(updateCounts, 1000);
      updateCounts();
    </script>
  </body>
</html>
"""

from fastapi.responses import HTMLResponse

@app.get("/dashboard", response_class=HTMLResponse)
def dashboard():
    return HTML_PAGE

# -----------------------
# Utils
# -----------------------
def get_device():
    try:
        import torch
        return "cuda" if torch.cuda.is_available() else "cpu"
    except Exception:
        return "cpu"

def draw_tracks_and_count(cam_idx, frame, tracks):
    """
    Draw DeepSORT tracks, IDs, and update simple line-crossing count.
    """
    h, w = frame.shape[:2]
    line_y = int(h * 0.4)

    hist = track_histories[cam_idx]

    for track in tracks:
        try:
            if not track.is_confirmed():
                continue
            l, t, r, b = track.to_ltrb()
            x1, y1, x2, y2 = map(int, [l, t, r, b])
            cx = int((x1 + x2) / 2)
            cy = int((y1 + y2) / 2)
            tid = track.track_id

            # draw bbox & id
            color = (0, 255, 0)
            cv2.rectangle(frame, (x1, y1), (x2, y2), color, 2)
            cv2.putText(frame, f"ID:{tid}", (x1, max(0, y1 - 8)),
                        cv2.FONT_HERSHEY_SIMPLEX, 0.5, color, 1)

            # track history & counting
            if tid not in hist:
                hist[tid] = {
                    "centroids": deque(maxlen=30),
                    "counted": False,
                    "last_seen": time.time(),
                }
            hitem = hist[tid]
            hitem["centroids"].append((cx, cy))
            hitem["last_seen"] = time.time()

            if (not hitem["counted"]) and len(hitem["centroids"]) > 1:
                prev_y = hitem["centroids"][-2][1]
                if prev_y < line_y <= cy:
                    counts[cam_idx] += 1
                    hitem["counted"] = True
        except Exception:
            continue

    # draw counting line + timestamp
    cv2.line(frame, (0, line_y), (w, line_y), (0, 0, 255), 2)
    ts = time.strftime("%Y-%m-%d %H:%M:%S")
    cv2.putText(frame, ts, (10, h - 10),
                cv2.FONT_HERSHEY_SIMPLEX, 0.5, (200, 200, 200), 1)

    return frame

# -----------------------
# Background processing loop
# -----------------------
def processing_loop(model):
    global shutdown_flag

    device = get_device()
    print(f"[PROCESS] using device: {device}")

    while not shutdown_flag:
        for cam_idx, cap in enumerate(caps):
            if cap is None:
                continue

            ret, frame = cap.read()
            if not ret or frame is None:
                # try reopen
                time.sleep(0.5)
                try:
                    cap.release()
                except Exception:
                    pass
                try:
                    caps[cam_idx] = cv2.VideoCapture(CAM_SOURCES[cam_idx])
                except Exception:
                    caps[cam_idx] = None
                continue

            # YOLO detection
            try:
                results = model.predict(
                    frame,
                    imgsz=YOLO_IMGSZ,
                    conf=YOLO_CONF,
                    verbose=False,
                    device=device,
                )
                res = results[0]
            except Exception as e:
                print(f"[DETECT] YOLO error cam{cam_idx}: {e}")
                continue

            # build DeepSORT detections: [tlwh], conf, class_name
            dets = []
            try:
                boxes = res.boxes
                if boxes is not None and len(boxes) > 0:
                    xyxy = boxes.xyxy.cpu().numpy()
                    confs = boxes.conf.cpu().numpy()
                    clsids = boxes.cls.cpu().numpy().astype(int)
                    for k in range(len(xyxy)):
                        x1, y1, x2, y2 = xyxy[k]
                        conf = float(confs[k])
                        cls_id = int(clsids[k])
                        # if you want only person class and your model has 'person' as 0:
                        # if cls_id != 0: continue
                        w = float(x2 - x1)
                        h = float(y2 - y1)
                        dets.append(([float(x1), float(y1), w, h], conf, str(cls_id)))
            except Exception:
                dets = []

            # DeepSORT tracking
            try:
                tracks = trackers[cam_idx].update_tracks(dets, frame=frame)
            except Exception as e:
                print(f"[TRACK] DeepSORT error cam{cam_idx}: {e}")
                tracks = []

            # draw tracks, ids, and update counts
            frame_drawn = draw_tracks_and_count(cam_idx, frame.copy(), tracks)

            # JPEG encode & store latest bytes
            try:
                ok, buf = cv2.imencode(
                    ".jpg",
                    frame_drawn,
                    [int(cv2.IMWRITE_JPEG_QUALITY), JPEG_QUALITY],
                )
                if ok:
                    latest_jpeg[cam_idx] = buf.tobytes()
            except Exception as e:
                print(f"[ENCODE] cam{cam_idx}: {e}")

        # cleanup old track histories
        nowt = time.time()
        for cam_idx in range(len(track_histories)):
            hist = track_histories[cam_idx]
            for tid in list(hist.keys()):
                if nowt - hist[tid]["last_seen"] > 10.0:
                    hist.pop(tid, None)

        time.sleep(PROCESS_SLEEP)

    print("[PROCESS] loop stopped")

# -----------------------
# FastAPI endpoints
# -----------------------
@app.get("/", response_class=HTMLResponse)
async def index():
    return HTML_PAGE

def mjpeg_stream(cam_idx: int):
    while not shutdown_flag:
        frame_bytes = latest_jpeg[cam_idx]
        if frame_bytes is not None:
            yield (b"--frame\r\nContent-Type: image/jpeg\r\n\r\n" +
                   frame_bytes + b"\r\n")
        else:
            time.sleep(0.05)

@app.get("/cam1")
async def cam1():
    return StreamingResponse(mjpeg_stream(0),
                             media_type="multipart/x-mixed-replace; boundary=frame")

@app.get("/cam2")
async def cam2():
    return StreamingResponse(mjpeg_stream(1),
                             media_type="multipart/x-mixed-replace; boundary=frame")

@app.get("/cam3")
async def cam3():
    return StreamingResponse(mjpeg_stream(2),
                             media_type="multipart/x-mixed-replace; boundary=frame")

@app.get("/cam4")
async def cam4():
    return StreamingResponse(mjpeg_stream(3),
                             media_type="multipart/x-mixed-replace; boundary=frame")

@app.get("/counts")
async def get_counts():
    # return cam0..cam3 like your UI expects
    resp = {f"cam{i}": int(counts[i]) for i in range(len(counts))}
    # also add persons / bag / box fields if you want to reuse old JS
    resp.setdefault("persons", sum(counts))
    resp.setdefault("bag", 0)
    resp.setdefault("box", 0)
    resp.setdefault("total", resp["bag"] + resp["box"])
    return JSONResponse(resp)

# -----------------------
# Startup / shutdown
# -----------------------
@app.on_event("startup")
async def on_startup():
    global caps, trackers, latest_jpeg, counts, track_histories, process_thread, shutdown_flag

    print("[MAIN] starting system ...")

    # open 4 cameras
    caps = []
    for idx, src in enumerate(CAM_SOURCES):
        cap = cv2.VideoCapture(src)
        if not cap.isOpened():
            print(f"[MAIN] WARNING: camera {idx} source {src} not opened")
            caps.append(None)
        else:
            print(f"[MAIN] camera {idx} opened")
            caps.append(cap)

    # create DeepSORT trackers
    trackers = []
    for i in range(len(CAM_SOURCES)):
        tracker = DeepSort(
            max_age=30,
            n_init=3,
            nn_budget=100,
            max_iou_distance=0.7,
            nms_max_overlap=0.5,
            max_cosine_distance=0.2,
            embedder="mobilenet",
            half=True,
            bgr=True,
            embedder_gpu=True,  # set False if you want embedder on CPU
        )
        trackers.append(tracker)

    # shared state
    latest_jpeg = [None for _ in range(len(CAM_SOURCES))]
    counts = [0 for _ in range(len(CAM_SOURCES))]
    track_histories = [dict() for _ in range(len(CAM_SOURCES))]
    shutdown_flag = False

    # load YOLO model once
    device = get_device()
    model = YOLO(MODEL_PATH)
    try:
        model.to(device)
    except Exception:
        pass
    print(f"[MAIN] YOLO loaded on {device}")

    # start background processing thread
    process_thread = threading.Thread(
        target=processing_loop, args=(model,), daemon=True
    )
    process_thread.start()
    print("[MAIN] processing loop started")

@app.on_event("shutdown")
async def on_shutdown():
    global shutdown_flag

    print("[MAIN] shutting down ...")
    shutdown_flag = True
    try:
        if process_thread is not None:
            process_thread.join(timeout=2.0)
    except Exception:
        pass

    for cap in caps:
        try:
            if cap is not None:
                cap.release()
        except Exception:
            pass

    cv2.destroyAllWindows()
    print("[MAIN] stopped.")

# -----------------------
# Local run
# -----------------------
if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=5000, log_level="info")
