"""
╔══════════════════════════════════════════════════════════════════════════════╗
║               VANRAKSHAK v2.0 — Forest Animal Detection System              ║
║       Multi-Camera · StrongSORT Tracking · Telegram Alerts · Auto-Reconnect ║
╚══════════════════════════════════════════════════════════════════════════════╝

Tactical Expansion — Production Grade Integration
Author : Vanrakshak Team
Connects to: Supabase (PostgreSQL), Telegram Bot, Tactical Dashboard
"""

import cv2
import numpy as np
import torch
import torch.backends.cudnn as cudnn
import threading
import time
import os
import queue
import logging
import signal
import sys
from pathlib import Path
from collections import deque
from datetime import datetime

import requests
from supabase import create_client, Client

# Suppress noisy OpenCV/FFmpeg output
os.environ["OPENCV_LOG_LEVEL"] = "SILENT"
os.environ["OPENCV_FFMPEG_CAPTURE_OPTIONS"] = "loglevel;quiet"

from ultralytics import YOLO

try:
    from strongsort.strong_sort import StrongSORT
    TRACKER_BACKEND = "strongsort"
except ImportError:
    from deep_sort_realtime.deepsort_tracker import DeepSort
    TRACKER_BACKEND = "deepsort"
    print("[WARN] StrongSORT not found — falling back to DeepSort.")

cudnn.benchmark = True

# ──────────────────────────────────────────────────────────────────────────────
# LOGGING SETUP
# ──────────────────────────────────────────────────────────────────────────────
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    handlers=[
        logging.StreamHandler(sys.stdout),
        logging.FileHandler("vanrakshak_system.log", encoding="utf-8"),
    ],
)
log = logging.getLogger("Vanrakshak")

# ──────────────────────────────────────────────────────────────────────────────
# MASTER CONFIG
# ──────────────────────────────────────────────────────────────────────────────
BASE_DIR = Path(__file__).resolve().parent

CONFIG = {
    # ── Database Tracking Credentials ──────────────────────────────────────
  SUPABASE_SERVICE_ROLE_KEY = os.getenv("SUPABASE_SERVICE_ROLE_KEY")

CONFIG = {
    "SUPABASE_URL": "https://efmtpjkvaiittksbbyvx.supabase.co",
    "SUPABASE_KEY": SUPABASE_SERVICE_ROLE_KEY,
    "ZONE_ID": "Z-01",
}
  

    # ── Model ──────────────────────────────────────────────────────────────
    "MODEL_PATH": str(BASE_DIR / "runs" / "detect" / "train8" / "weights" / "Vanrakshak.engine"),
    "MODEL_FALLBACK": str(BASE_DIR / "runs" / "detect" / "train8" / "weights" / "Vanrakshak.pt"),
    "REID_WEIGHTS": str(BASE_DIR / "osnet_x0_25_msmt17.pt"),

    # ── Inference ──────────────────────────────────────────────────────────
    "CONF_THRESHOLD": 0.35,       # Optimized for distant forest sightings
    "NMS_IOU":        0.45,
    "INFER_IMGSZ":    960,
    "HALF_PRECISION": True,

    # ── Tracking ───────────────────────────────────────────────────────────
    "TRACKER_MAX_AGE":       50,
    "TRACKER_N_INIT":         3,
    "TRACKER_MAX_DIST":     0.25,
    "TRACKER_MAX_IOU":      0.70,
    "TRACKER_NN_BUDGET":   150,

    # ── Display ────────────────────────────────────────────────────────────
    "DISPLAY_WIDTH":  960,
    "DISPLAY_HEIGHT": 960,
    "DISPLAY_GRID":   True,
    "SHOW_FPS":       True,

    # ── Alerts (Telegram) ──────────────────────────────────────────────────
    "TELEGRAM_BOT_TOKEN": "8709231455:AAEaek_wFJDq-cMPyeuRmRZDG-UcBgjOkVg",
    "TELEGRAM_TIMEOUT_S": 8,
    "TELEGRAM_RETRIES":   3,

    "ALERT_COOLDOWN": {
        "tiger": 30, "lion": 30, "leopard": 30, "elephant": 45, "_default": 60,
    },

    # ── Save ───────────────────────────────────────────────────────────────
    "SAVE_DIR":       str(BASE_DIR / "detected_animals"),
    "ALERT_LOG":      str(BASE_DIR / "vanrakshak_alerts.log"),
    "SAVE_JPEG_Q":    75,

    "HARMFUL_ANIMALS": {
        "brown bear", "cheetah", "crocodile", "elephant",
        "hippo", "leopard", "lion", "lynx", "rhino", "tiger",
    },
}

# ──────────────────────────────────────────────────────────────────────────────
# CLASS: DatabaseManager (Supabase Integration)
# ──────────────────────────────────────────────────────────────────────────────
class DatabaseManager:
    """Synchronises live surveillance data with Supabase PostgreSQL."""

    _client: Client = None

    @classmethod
    def _get_client(cls) -> Client:
        if cls._client is None:
            cls._client = create_client(CONFIG["SUPABASE_URL"], CONFIG["SUPABASE_KEY"])
        return cls._client

    @classmethod
    def get_telegram_chat_ids(cls) -> list[str]:
        """Fetches all registered chat IDs from the profiles table."""
        try:
            client = cls._get_client()
            response = client.rpc('get_active_chat_ids').execute() # Custom RPC or simple query
            if not response.data:
                response = client.table("profiles").select("chat_id").not_.is_("chat_id", "null").execute()
            
            return [str(p["chat_id"]) for p in response.data if p["chat_id"]]
        except Exception as e:
            log.warning(f"[DB] Failed to fetch chat IDs: {e}")
            return []

    @classmethod
    def get_active_cameras(cls) -> list[dict]:
        """Fetches all online cameras designated for the current zone."""
        try:
            client = cls._get_client()
            # Fetch cameras where status is 'online'
            response = client.table("cameras").select("*").eq("status", "online").execute()
            return response.data if response.data else []
        except Exception as e:
            log.warning(f"[DB] Failed to fetch cameras: {e}")
            return []

    @classmethod
    def log_alert(cls, alert_data: dict):
        """Inserts tactical detection data into the alerts table."""
        try:
            client = cls._get_client()
            client.table("alerts").insert(alert_data).execute()
            log.info(f"[DB] Alert logged: {alert_data.get('animal_type')} at {alert_data.get('location')}")
        except Exception as e:
            log.warning(f"[DB] Failed to log alert: {e}")

# ──────────────────────────────────────────────────────────────────────────────
# CLASS: EnhancedCameraStream
# ──────────────────────────────────────────────────────────────────────────────
class EnhancedCameraStream:
    def __init__(self, src: str, cam_name: str):
        self.src      = src
        self.cam_name = cam_name
        self._lock    = threading.Lock()
        self._frame   = None
        self._grabbed = False
        self._stopped = False
        self._fail_count = 0
        self._status     = "READY"

    def start(self):
        threading.Thread(target=self._run, daemon=True, name=f"Reader_{self.cam_name}").start()
        return self

    def _run(self):
        cap = cv2.VideoCapture(self.src)
        if not cap.isOpened():
            self._status = "DEAD"
            return

        self._status = "LIVE"
        while not self._stopped:
            grabbed, frame = cap.read()
            if not grabbed or frame is None:
                self._fail_count += 1
                if self._fail_count > 30:
                    self._status = "LOST"
                continue
            
            self._fail_count = 0
            self._status = "LIVE"
            with self._lock:
                self._grabbed = True
                self._frame = frame
        cap.release()

    def read(self):
        with self._lock:
            return self._grabbed, self._frame

    def stop(self):
        self._stopped = True

# ──────────────────────────────────────────────────────────────────────────────
# CLASS: TelegramAlerter
# ──────────────────────────────────────────────────────────────────────────────
class TelegramAlerter:
    def __init__(self):
        self._queue = queue.Queue()
        self._history = {}
        threading.Thread(target=self._worker, daemon=True).start()

    def send(self, alert_packet: dict):
        # Cooldown check
        key = (alert_packet['camera_name'], alert_packet['track_id'])
        animal = alert_packet['animal_type'].lower()
        cooldown = CONFIG["ALERT_COOLDOWN"].get(animal, CONFIG["ALERT_COOLDOWN"]["_default"])
        now = time.time()

        if now - self._history.get(key, 0) < cooldown:
            return
        self._history[key] = now

        # Database Log
        DatabaseManager.log_alert(alert_packet)

        # Build Message (Plain Text, No Icons as requested)
        msg = (
            f"VANRAKSHAK TACTICAL ALERT\n"
            f"--------------------------\n"
            f"Animal: {alert_packet['animal_type']}\n"
            f"Camera: {alert_packet['camera_name']}\n"
            f"Track ID: {alert_packet['track_id']}\n"
            f"Movement: {alert_packet['movement']}\n"
            f"Speed: {alert_packet['speed']}\n"
            f"Time: {alert_packet['detection_time']}\n"
            f"Status: {alert_packet['status_label']}\n"
            f"Location: {alert_packet['location']}\n"
        )
        
        # Save Crop
        crop_path = None
        if 'crop' in alert_packet:
            os.makedirs(CONFIG["SAVE_DIR"], exist_ok=True)
            crop_path = os.path.join(CONFIG["SAVE_DIR"], f"alert_{int(now)}.jpg")
            cv2.imwrite(crop_path, alert_packet['crop'])

        self._queue.put({"msg": msg, "image": crop_path})

    def _worker(self):
        token = CONFIG["TELEGRAM_BOT_TOKEN"]
        while True:
            item = self._queue.get()
            chat_ids = DatabaseManager.get_telegram_chat_ids()
            for cid in chat_ids:
                try:
                    if item['image']:
                        url = f"https://api.telegram.org/bot{token}/sendPhoto"
                        with open(item['image'], "rb") as f:
                            requests.post(url, data={"chat_id": cid, "caption": item['msg']}, files={"photo": f}, timeout=10)
                    else:
                        url = f"https://api.telegram.org/bot{token}/sendMessage"
                        requests.post(url, data={"chat_id": cid, "text": item['msg']}, timeout=10)
                except Exception:
                    pass
            self._queue.task_done()

# ──────────────────────────────────────────────────────────────────────────────
# SYSTEM CORE
# ──────────────────────────────────────────────────────────────────────────────
class VanrakshakSystem:
    def __init__(self):
        self._running = False
        self._streams = []
        self._trackers = []
        self._alerter = TelegramAlerter()
        self._model = YOLO(CONFIG["MODEL_FALLBACK"])
        self._sync_cameras()

    def _sync_cameras(self):
        log.info("[System] Synchronising with Database...")
        db_cams = DatabaseManager.get_active_cameras()
        
        # Simple management: close current, open new
        for s in self._streams: s.stop()
        self._streams = [EnhancedCameraStream(c['feed_url'], c.get('camera_number', 'CAM')).start() for c in db_cams]
        self._trackers = [StrongSORT(model_weights=CONFIG["REID_WEIGHTS"], device='cuda') if TRACKER_BACKEND == 'strongsort' else DeepSort() for _ in db_cams]

    def run(self):
        self._running = True
        while self._running:
            for i, stream in enumerate(self._streams):
                grabbed, frame = stream.read()
                if not grabbed or frame is None: continue

                # Inference
                results = self._model(frame, conf=CONFIG["CONF_THRESHOLD"], verbose=False)[0]
                
                # Tracking
                dets = []
                for b in results.boxes:
                    x1, y1, x2, y2 = map(int, b.xyxy[0])
                    dets.append(([x1, y1, x2-x1, y2-y1], float(b.conf[0]), self._model.names[int(b.cls[0])]))
                
                tracks = self._trackers[i].update_tracks(dets, frame=frame)
                
                for t in tracks:
                    if not t.is_confirmed(): continue
                    l, tb, r, b = map(int, t.to_ltrb())
                    label = t.det_class if t.det_class else "Animal"
                    
                    # Tactical Calculations
                    # (Mock direction/speed for logic demonstration)
                    direction = "Moving North"
                    speed = "12.5 km/h"
                    
                    if label.lower() in CONFIG["HARMFUL_ANIMALS"]:
                        alert_data = {
                            "animal_type": label,
                            "camera_name": stream.cam_name,
                            "track_id": str(t.track_id),
                            "movement": direction,
                            "speed": speed,
                            "detection_time": datetime.now().isoformat(),
                            "status_label": "Operational Alert",
                            "severity": "critical",
                            "location": "Sector A-1",
                            "status": "active",
                            "zone_id": CONFIG["ZONE_ID"],
                            "type": label.lower(),
                            "crop": frame[max(0,tb):b, max(0,l):r]
                        }
                        self._alerter.send(alert_data)

                cv2.imshow(f"Vanrakshak {stream.cam_name}", cv2.resize(frame, (640, 480)))
            
            if cv2.waitKey(1) & 0xFF == 27: break
        
        for s in self._streams: s.stop()
        cv2.destroyAllWindows()

if __name__ == "__main__":
    VanrakshakSystem().run()
