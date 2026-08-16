# multicam_fastapi_optimized.py
"""
Optimized 4-camera FastAPI dashboard:
- Zero-copy shared memory (camera -> detection)
- One GPU detection thread (YOLO via ThreadPoolExecutor) + StrongSORT on CPU threads
- ThreadPoolExecutor for drawing + JPEG encoding
- FastAPI streaming endpoints / same UI as before
- Tunables at top
"""

import os
import time
import math
import signal
import sys
import traceback
import multiprocessing as mp
from multiprocessing import shared_memory
from typing import List, Dict
from collections import deque
from concurrent.futures import ThreadPoolExecutor

import numpy as np
import cv2
from fastapi import FastAPI, Query, Body
from fastapi.responses import HTMLResponse, StreamingResponse, JSONResponse
from ultralytics import YOLO
from strongsort.strong_sort import StrongSORT  # adjust if your import path differs

# -----------------------
# CONFIG - adjust here
# -----------------------
CAM_RTSP = [
    # set your 4 RTSPs (or 0,1 for webcams)
    "rtsp://admin:Suruchi%40112@192.168.4.132:554/Streaming/Channels/101",
    "rtsp://admin:pass@192.168.4.133:554/Streaming/Channels/101",
    "rtsp://admin:pass@192.168.4.134:554/Streaming/Channels/101",
    "rtsp://admin:pass@192.168.4.135:554/Streaming/Channels/101",
]

MODEL_PATH = r"C:\Users\ADITYA\OneDrive\Desktop\object new detection.v2i.yolov11\best.pt"
FRAME_W = 1280      # reduce resolution for better throughput (set to 1920 if needed)
FRAME_H = 720
FRAME_C = 3
SHM_FRAME_SIZE = FRAME_W * FRAME_H * FRAME_C
BUFFERS_PER_CAMERA = 2

PROCESSED_JPEG_QUEUE_SIZE = 4

YOLO_IMGSZ = 640
YOLO_CONF = 0.30
YOLO_IOU = 0.45
YOLO_MAX_DET = 200

STRONGSORT_CONFIG = dict(
    model_weights="osnet_x0_25_msmt17.pt",
    device="cuda",
    max_age=30,
    max_dist=0.2,
    max_iou_dist=0.7,
    nn_budget=100,
    max_confidence=0.2,
    ema_alpha=0.95,
)

JPEG_QUALITY = 70
DRAW_THREADS = 4      # CPU threads for drawing + JPEG encoding

DETECTION_SLEEP = 0.002

# -----------------------
# Globals created in start_system
# -----------------------
CAM_SHMS = []
CAM_SHM_NAMES = []
CAM_CTRL_QUEUES = []
PROCESSED_JPEG_QUEUES = []
SHM_WRITE_IDX = []
COUNTS = None
SHUTDOWN = None

app = FastAPI(title="4-Camera YOLO+StrongSORT Optimized")

# -----------------------
# Utilities
# -----------------------
def np_from_shm_by_name(name: str) -> np.ndarray:
    shm = shared_memory.SharedMemory(name=name)
    return np.ndarray((FRAME_H, FRAME_W, FRAME_C), dtype=np.uint8, buffer=shm.buf)

def np_from_shm(shm_obj: shared_memory.SharedMemory) -> np.ndarray:
    return np.ndarray((FRAME_H, FRAME_W, FRAME_C), dtype=np.uint8, buffer=shm_obj.buf)

def torch_cuda_available() -> bool:
    try:
        import torch
        return torch.cuda.is_available()
    except Exception:
        return False

# -----------------------
# Camera process
# -----------------------
def camera_process_main(cam_idx, rtsp_url, shm_names, ctrl_q, write_idx_val, shutdown_ev):

    """
    Camera process: open RTSP, write frames into shared memory alternating buffers,
    and notify detection via small control queue messages (cam_idx, buf_idx, ts).
    """
    print(f"[CAM-{cam_idx}] starting, url={rtsp_url}")
    # prefer ffmpeg backend
    backends = [cv2.CAP_FFMPEG, cv2.CAP_GSTREAMER, cv2.CAP_DSHOW, cv2.CAP_ANY]
    cap = None
    for be in backends:
        try:
            cap = cv2.VideoCapture(rtsp_url, be)
            if cap.isOpened():
                print(f"[CAM-{cam_idx}] opened with backend {be}")
                break
            else:
                cap.release()
                cap = None
        except Exception:
            cap = None
    if cap is None:
        print(f"[CAM-{cam_idx}] failed to open stream - exiting camera process")
        return

    try:
        cap.set(cv2.CAP_PROP_BUFFERSIZE, 1)
    except Exception:
        pass

    # resolve shared memory handles
    shms = [shared_memory.SharedMemory(name=n) for n in shm_names]
    write_idx = 0

    while not shutdown_ev.is_set():
        try:
            ret, frame = cap.read()
            if not ret or frame is None:
                # attempt re-open
                time.sleep(0.5)
                try:
                    cap.release()
                except Exception:
                    pass
                for be in backends:
                    try:
                        cap = cv2.VideoCapture(rtsp_url, be)
                        if cap.isOpened():
                            break
                    except Exception:
                        cap = None
                continue

            # ensure consistent size
            if frame.shape[1] != FRAME_W or frame.shape[0] != FRAME_H:
                frame = cv2.resize(frame, (FRAME_W, FRAME_H))

            # zero-copy write to shared memory
            arr = np_from_shm(shms[write_idx])
            np.copyto(arr, frame)

            # update shared index (atomic)
            with write_idx_val.get_lock():
                write_idx_val.value = write_idx

            # non-blocking notify (drop if full)
            try:
                ctrl_q.put_nowait((cam_idx, write_idx, time.time()))
            except Exception:
                pass

            write_idx = (write_idx + 1) % BUFFERS_PER_CAMERA
            time.sleep(0.001)
        except Exception as e:
            print(f"[CAM-{cam_idx}] exception: {e}")
            traceback.print_exc()
            time.sleep(0.5)
            continue

    try:
        cap.release()
    except Exception:
        pass
    for s in shms:
        try:
            s.close()
        except Exception:
            pass
    print(f"[CAM-{cam_idx}] stopped")

# -----------------------
# Helper: pipeline for YOLO -> StrongSORT -> draw
# -----------------------
def tracker_pipeline(
    cam_idx: int,
    frame: np.ndarray,
    h: int,
    w: int,
    yolo_future,
    tracker: StrongSORT,
    track_hist_cam: Dict,
    counts_proxy,
    jpeg_q: mp.Queue,
    draw_executor: ThreadPoolExecutor
):
    """
    Runs in a CPU thread:
      - waits for YOLO result (GPU thread)
      - parses detections
      - updates StrongSORT tracker
      - schedules draw_and_encode in draw_executor
    """
    try:
        results = yolo_future.result()
        # results from ultralytics is usually a list; handle both
        if isinstance(results, list) and len(results) > 0:
            res = results[0]
        else:
            res = results

        dets = []
        try:
            if hasattr(res, "boxes") and len(res.boxes) > 0:
                xyxy = res.boxes.xyxy.cpu().numpy()
                confs = res.boxes.conf.cpu().numpy()
                clsids = res.boxes.cls.cpu().numpy().astype(int)
                for k in range(len(xyxy)):
                    x1, y1, x2, y2 = xyxy[k]
                    bw = float(x2 - x1)
                    bh = float(y2 - y1)
                    conf = float(confs[k])
                    cls_id = int(clsids[k])
                    cls_name = str(cls_id)
                    dets.append(([float(x1), float(y1), bw, bh], conf, cls_name))
        except Exception:
            dets = []

        try:
            tracks = tracker.update(dets, frame)
        except Exception as e:
            print(f"[TRACK_PIPE] tracker.update fail cam{cam_idx}: {e}")
            tracks = []

        # schedule drawing + jpeg encode
        draw_executor.submit(
            draw_and_encode,
            cam_idx,
            frame,
            tracks,
            track_hist_cam,
            counts_proxy,
            jpeg_q,
            h,
            w
        )
    except Exception as e:
        print(f"[TRACK_PIPE] exception cam{cam_idx}: {e}")
        traceback.print_exc()
# -----------------------
# Detection process (single process, threaded pipeline)
# -----------------------
def detection_process_main(cam_shm_names_all, ctrl_queues, jpeg_queues, counts_proxy, shutdown_ev):

    """
    Single detection process:
      - loads YOLO once on GPU
      - has one YOLO thread (GPU) via ThreadPoolExecutor(max_workers=1)
      - has multiple StrongSORT threads on CPU
      - draw_and_encode runs in its own thread pool
      - each camera frame goes through:
           YOLO (GPU thread) -> StrongSORT (CPU thread) -> draw+JPEG (CPU thread)
    """
    print("[DETECT] starting, loading models...")
    device = "cuda" if torch_cuda_available() else "cpu"
    print(f"[DETECT] device = {device}")

    # load model
    try:
        model = YOLO(MODEL_PATH)
        print("[DETECT] YOLO loaded")
    except Exception as e:
        print("[DETECT] failed to load YOLO:", e)
        shutdown_ev.set()
        return

    # init StrongSORT trackers per camera
    trackers = []
    for idx in range(len(cam_shm_names_all)):
        cfg = STRONGSORT_CONFIG.copy()
        cfg["device"] = device
        try:
            tr = StrongSORT(**cfg)
        except Exception as e:
            print(f"[DETECT] StrongSORT full init failed for cam{idx}: {e}, falling back")
            tr = StrongSORT(model_weights=cfg.get("model_weights"), device=cfg.get("device"))
        trackers.append(tr)

    # prepare shared memory handles
    cam_shms_all = [[shared_memory.SharedMemory(name=n) for n in names] for names in cam_shm_names_all]

    # per-camera track history for counting
    track_histories = [dict() for _ in range(len(cam_shm_names_all))]
    for i in range(len(cam_shm_names_all)):
        counts_proxy.setdefault(f"cam{i}", 0)

    # thread pools
    yolo_executor = ThreadPoolExecutor(max_workers=1)  # ONE thread for YOLO (GPU-safe)
    tracker_executor = ThreadPoolExecutor(max_workers=len(cam_shm_names_all))  # one per camera
    draw_executor = ThreadPoolExecutor(max_workers=DRAW_THREADS)

    try:
        while not shutdown_ev.is_set():
            # Poll control queues (non-blocking) and collect latest message per camera
            latest_msgs = {}
            for cam_idx, q in enumerate(ctrl_queues):
                while True:
                    try:
                        msg = q.get_nowait()
                        latest_msgs[cam_idx] = msg  # keep last message only
                    except Exception:
                        break

            if not latest_msgs:
                time.sleep(0.002)
                continue

            # For each camera with a new frame, schedule YOLO+tracker+draw pipeline
            for cam_idx, msg in latest_msgs.items():
                _, buf_idx, ts = msg
                shm = cam_shms_all[cam_idx][buf_idx]
                frame_local = np_from_shm(shm).copy()
                h, w = frame_local.shape[:2]

                # submit YOLO inference to the single GPU thread
                try:
                    yolo_future = yolo_executor.submit(
                        model.predict,
                        frame_local,
                        imgsz=YOLO_IMGSZ,
                        conf=YOLO_CONF,
                        iou=YOLO_IOU,
                        device=device,
                        half=(device == "cuda"),
                        max_det=YOLO_MAX_DET,
                        verbose=False
                    )
                except Exception as e:
                    print(f"[DETECT] failed to submit YOLO job cam{cam_idx}: {e}")
                    continue

                # submit tracker+draw pipeline to CPU threads
                tracker_executor.submit(
                    tracker_pipeline,
                    cam_idx,
                    frame_local,
                    h,
                    w,
                    yolo_future,
                    trackers[cam_idx],
                    track_histories[cam_idx],
                    counts_proxy,
                    jpeg_queues[cam_idx],
                    draw_executor
                )

            # cleanup old tracks periodically
            nowt = time.time()
            for cam_idx in range(len(track_histories)):
                for tid, hist in list(track_histories[cam_idx].items()):
                    if nowt - hist.get("last_seen", nowt) > 10.0:
                        track_histories[cam_idx].pop(tid, None)

            time.sleep(DETECTION_SLEEP)
    except KeyboardInterrupt:
        pass
    except Exception as e:
        print("[DETECT] exception in main loop:", e)
        traceback.print_exc()
    finally:
        # shutdown executors
        try:
            yolo_executor.shutdown(wait=False)
        except Exception:
            pass
        try:
            tracker_executor.shutdown(wait=False)
        except Exception:
            pass
        try:
            draw_executor.shutdown(wait=False)
        except Exception:
            pass

        # close shared memories
        for cam_shms in cam_shms_all:
            for s in cam_shms:
                try:
                    s.close()
                except Exception:
                    pass
        print("[DETECT] exiting")

# -----------------------
# Drawing + JPEG encode function (runs in threadpool)
# -----------------------
def draw_and_encode(
    cam_idx: int,
    frame: np.ndarray,
    tracks,
    track_hist: Dict,
    counts_proxy,
    jpeg_q: mp.Queue,
    h: int,
    w: int
):
    """
    Draw boxes & IDs, update counting, encode JPEG, push to jpeg queue.
    This runs in a thread (OpenCV/NumPy release GIL).
    """
    try:
        for track in tracks:
            try:
                tid = getattr(track, "track_id", None)
                tlbr = None
                if hasattr(track, "to_ltrb"):
                    tlbr = track.to_ltrb()
                elif hasattr(track, "tlbr"):
                    tlbr = track.tlbr
                if tlbr is None:
                    continue
                x1, y1, x2, y2 = map(int, tlbr)
                cx = int((x1 + x2) / 2)
                cy = int((y1 + y2) / 2)
                color = (0, 255, 0) if not (track.track_id is None) else (0, 180, 255)
                cv2.rectangle(frame, (x1, y1), (x2, y2), color, 2)
                cv2.putText(frame, f"ID:{tid}", (x1, max(0, y1 - 8)), cv2.FONT_HERSHEY_SIMPLEX, 0.5, color, 1)
                # counting: line crossing at 40% height
                line_y = int(h * 0.4)
                if tid not in track_hist:
                    track_hist[tid] = {'centroids': deque(maxlen=30), 'counted': False, 'last_seen': time.time()}
                hist = track_hist[tid]
                hist['centroids'].append((cx, cy))
                hist['last_seen'] = time.time()
                if not hist['counted'] and len(hist['centroids']) > 1:
                    prev_y = hist['centroids'][-2][1]
                    if prev_y < line_y <= cy:
                        counts_proxy[f"cam{cam_idx}"] = counts_proxy.get(f"cam{cam_idx}", 0) + 1
                        hist['counted'] = True
            except Exception:
                pass

        # overlay
        cv2.line(frame, (0, int(h * 0.4)), (w, int(h * 0.4)), (0, 0, 255), 2)
        ts = time.strftime("%Y-%m-%d %H:%M:%S")
        cv2.putText(frame, ts, (10, h - 10), cv2.FONT_HERSHEY_SIMPLEX, 0.5, (200, 200, 200), 1)

        # encode JPEG
        try:
            ret, buf = cv2.imencode('.jpg', frame, [int(cv2.IMWRITE_JPEG_QUALITY), JPEG_QUALITY])
            if ret:
                jbytes = buf.tobytes()
                try:
                    if jpeg_q.full():
                        try:
                            jpeg_q.get_nowait()
                        except Exception:
                            pass
                    jpeg_q.put_nowait(jbytes)
                except Exception:
                    pass
        except Exception as e:
            print(f"[DRAW] jpeg encode err cam{cam_idx}: {e}")
    except Exception as e:
        print(f"[DRAW] exception cam{cam_idx}:", e)

# -----------------------
# FastAPI endpoints + UI (same UI)
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
    <h1 style="text-align:center">4-Camera YOLO+StrongSORT Dashboard (Optimized)</h1>
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

@app.get("/", response_class=HTMLResponse)
async def index():
    return HTML_PAGE

def mjpeg_stream_generator(cam_idx: int):
    q = PROCESSED_JPEG_QUEUES[cam_idx]
    while not SHUTDOWN.is_set():
        try:
            jbytes = q.get(timeout=1.0)
            yield (b'--frame\r\nContent-Type: image/jpeg\r\n\r\n' + jbytes + b'\r\n')
        except Exception:
            time.sleep(0.01)
            continue

@app.get("/cam1")
async def cam1():
    return StreamingResponse(mjpeg_stream_generator(0), media_type='multipart/x-mixed-replace; boundary=frame')

@app.get("/cam2")
async def cam2():
    return StreamingResponse(mjpeg_stream_generator(1), media_type='multipart/x-mixed-replace; boundary=frame')

@app.get("/cam3")
async def cam3():
    return StreamingResponse(mjpeg_stream_generator(2), media_type='multipart/x-mixed-replace; boundary=frame')

@app.get("/cam4")
async def cam4():
    return StreamingResponse(mjpeg_stream_generator(3), media_type='multipart/x-mixed-replace; boundary=frame')

# Unified endpoint for your other UI version
@app.get("/video_feed")
async def video_feed(src: int = Query(0, ge=0)):
    if not PROCESSED_JPEG_QUEUES:
        def blank_gen():
            while True:
                time.sleep(0.1)
                yield b''
        return StreamingResponse(blank_gen(), media_type='multipart/x-mixed-replace; boundary=frame')

    cam_idx = max(0, min(src, len(PROCESSED_JPEG_QUEUES) - 1))
    return StreamingResponse(
        mjpeg_stream_generator(cam_idx),
        media_type='multipart/x-mixed-replace; boundary=frame'
    )

@app.post("/start")
async def start_endpoint(payload: dict = Body(default=None)):
    return {"ok": True, "detail": "System is always running; /start is a no-op."}

@app.post("/stop")
async def stop_endpoint():
    return {"ok": True, "detail": "System keeps running; /stop is a no-op in always-on mode."}

@app.get("/counts")
async def counts():
    base = dict(COUNTS) if COUNTS is not None else {}
    total_cam = sum(v for k, v in base.items() if k.startswith("cam"))
    base.setdefault("bag", 0)
    base.setdefault("box", 0)
    base.setdefault("persons", total_cam)
    base.setdefault("total", base["bag"] + base["box"])
    return JSONResponse(base)

@app.get("/counts_db")
async def counts_db():
    return {}
# -----------------------
# Startup / Shutdown orchestration
# -----------------------
def create_shared_buffers():
    global CAM_SHMS, CAM_SHM_NAMES
    CAM_SHMS = []
    CAM_SHM_NAMES = []
    for cam_idx in range(len(CAM_RTSP)):
        shms = []
        names = []
        for b in range(BUFFERS_PER_CAMERA):
            name = f"mc_cam{cam_idx}_buf{b}_{int(time.time()*1000)}"
            shm = shared_memory.SharedMemory(create=True, size=SHM_FRAME_SIZE, name=name)
            shms.append(shm)
            names.append(name)
        CAM_SHMS.append(shms)
        CAM_SHM_NAMES.append(names)

def cleanup_shared_buffers():
    global CAM_SHMS
    for shms in CAM_SHMS:
        for s in shms:
            try:
                s.close()
                s.unlink()
            except Exception:
                pass

def start_system():
    global CAM_SHMS, CAM_SHM_NAMES, CAM_CTRL_QUEUES, PROCESSED_JPEG_QUEUES, SHM_WRITE_IDX, COUNTS, SHUTDOWN

    mp.set_start_method("spawn", force=True)
    manager = mp.Manager()
    COUNTS = manager.dict({f"cam{i}": 0 for i in range(len(CAM_RTSP))})
    SHUTDOWN = mp.Event()

    # prepare shared memory
    create_shared_buffers()

    # control queues and jpeg queues
    CAM_CTRL_QUEUES[:] = [mp.Queue(maxsize=8) for _ in range(len(CAM_RTSP))]
    PROCESSED_JPEG_QUEUES[:] = [mp.Queue(maxsize=PROCESSED_JPEG_QUEUE_SIZE) for _ in range(len(CAM_RTSP))]
    SHM_WRITE_IDX[:] = [mp.Value('i', 0) for _ in range(len(CAM_RTSP))]

    # start camera processes
    cam_procs = []
    for idx, rtsp in enumerate(CAM_RTSP):
        p = mp.Process(
            target=camera_process_main,
            args=(idx, rtsp, CAM_SHM_NAMES[idx], CAM_CTRL_QUEUES[idx], SHM_WRITE_IDX[idx], SHUTDOWN),
            daemon=True
        )
        p.start()
        cam_procs.append(p)
        print(f"[MAIN] started camera process {idx} pid={p.pid}")

    # start detection process
    det_proc = mp.Process(
        target=detection_process_main,
        args=(CAM_SHM_NAMES, CAM_CTRL_QUEUES, PROCESSED_JPEG_QUEUES, COUNTS, SHUTDOWN),
        daemon=True
    )
    det_proc.start()
    print(f"[MAIN] started detection process pid={det_proc.pid}")

    return cam_procs, det_proc

@app.on_event("startup")
async def on_startup():
    print("[MAIN] starting system ...")
    app.state.cam_procs, app.state.det_proc = start_system()

@app.on_event("shutdown")
async def on_shutdown():
    print("[MAIN] shutting down ...")
    try:
        SHUTDOWN.set()
    except Exception:
        pass

    try:
        for p in getattr(app.state, "cam_procs", []):
            if p.is_alive():
                p.terminate()
                p.join(timeout=1.0)
    except Exception:
        pass

    try:
        dp = getattr(app.state, "det_proc", None)
        if dp and dp.is_alive():
            dp.terminate()
            dp.join(timeout=1.0)
    except Exception:
        pass

    try:
        cleanup_shared_buffers()
    except Exception:
        pass

    print("[MAIN] stopped.")

# Optional local debug run
if __name__ == "__main__":
    import uvicorn
    # FastAPI startup event will call start_system()
    uvicorn.run(app, host="0.0.0.0", port=5000, log_level="info")
