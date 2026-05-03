"""
main.py — Kitchen Activity Monitor with YOLOv8 person detection + DeepFace recognition.

Pipeline (per frame):
    RTSP frame → YOLOv8 track() → per-person:
        · Crop face region (top 40% of bbox)
        · DeepFace identify (async thread, every FACE_DET_INTERVAL frames)
        · Check which zone the person centre is in
        · Accumulate motion score
    Every AGGREGATION_SECONDS → flush per-(zone, employee) averages → Supabase INSERT
"""
from __future__ import annotations

import sys
import time
import threading
from collections import defaultdict
from pathlib import Path
from typing import NamedTuple

import cv2
import numpy as np
from ultralytics import YOLO
from supabase import create_client

from kitchen_activity.config import load_config
from kitchen_activity.rtsp import RtspConfig, RtspStream
from kitchen_activity.zones import load_zones, point_in_polygon
from kitchen_activity import face_encoder


# ── Types ─────────────────────────────────────────────────────────────────────

class BucketKey(NamedTuple):
    zone_name: str
    employee_name: str


# ── Face recognition helper ───────────────────────────────────────────────────

class AsyncFaceRecognizer:
    """
    Background-thread face recognizer with per-track-id result caching.

    Why async: DeepFace.find() can take 200 ms–1 s per call. Running it
    synchronously would drop frames. Instead we submit crops to a worker thread
    and use the cached result from the previous recognition cycle.
    """

    def __init__(self, faces_db: str, model_name: str, threshold: float, interval: int) -> None:
        self._faces_db = faces_db
        self._model_name = model_name
        self._threshold = threshold
        self._interval = interval          # frames between re-runs per track id

        self._cache: dict[int, str] = {}   # track_id → name
        self._last_run: dict[int, int] = {}
        self._pending: dict[int, np.ndarray] = {}
        self._lock = threading.Lock()

        self._worker = threading.Thread(target=self._run, daemon=True)
        self._worker.start()

    def due(self, track_id: int, frame_idx: int) -> bool:
        return frame_idx - self._last_run.get(track_id, -self._interval) >= self._interval

    def submit(self, track_id: int, crop: np.ndarray, frame_idx: int) -> None:
        with self._lock:
            self._pending[track_id] = crop.copy()
            self._last_run[track_id] = frame_idx

    def get(self, track_id: int) -> str:
        with self._lock:
            return self._cache.get(track_id, "unknown")

    def _run(self) -> None:
        while True:
            with self._lock:
                batch = dict(self._pending)
                self._pending.clear()
            for tid, crop in batch.items():
                name = face_encoder.recognize(crop, self._faces_db, self._model_name, self._threshold)
                with self._lock:
                    self._cache[tid] = name
                    print(f"  [Face] track={tid} → {name}")
            time.sleep(0.05)


# ── Aggregator ────────────────────────────────────────────────────────────────

class Aggregator:
    """Accumulates motion scores per (zone, employee) and flushes every window_sec."""

    def __init__(self, window_sec: int, global_threshold: float) -> None:
        self._window = window_sec
        self._global_thr = global_threshold
        self._start = time.time()
        # key → {'sum': float, 'n': int, 'threshold': float}
        self._data: dict[BucketKey, dict] = defaultdict(lambda: {"sum": 0.0, "n": 0, "threshold": self._global_thr})

    def add(self, zone_name: str, employee: str, motion: float, zone_threshold: float | None = None) -> None:
        key = BucketKey(zone_name, employee)
        bucket = self._data[key]
        bucket["sum"] += motion
        bucket["n"] += 1
        if zone_threshold is not None:
            bucket["threshold"] = zone_threshold

    def ready(self) -> bool:
        return time.time() - self._start >= self._window

    def flush(self) -> list[dict]:
        records = []
        for key, v in self._data.items():
            avg = v["sum"] / v["n"] if v["n"] > 0 else 0.0
            records.append({
                "zone_name": key.zone_name,
                "employee_name": key.employee_name,
                "is_active": avg >= v["threshold"],
                "motion_score": round(avg, 2),
            })
        self._data.clear()
        self._start = time.time()
        return records


# ── Utilities ─────────────────────────────────────────────────────────────────

def crop_face(frame: np.ndarray, x1: int, y1: int, x2: int, y2: int, ratio: float = 0.45) -> np.ndarray:
    """Return the top *ratio* portion of the bounding box as a face crop."""
    fh, fw = frame.shape[:2]
    pad_x = int((x2 - x1) * 0.08)
    fy2 = min(fh, y1 + int((y2 - y1) * ratio))
    fx1 = max(0, x1 - pad_x)
    fx2 = min(fw, x2 + pad_x)
    return frame[y1:fy2, fx1:fx2]


# ── Main loop ─────────────────────────────────────────────────────────────────

def main() -> None:
    cfg = load_config()

    if not cfg.rtsp_url:
        sys.exit("[ERROR] RTSP_URL is not set in .env")
    if not cfg.supabase_url or not cfg.supabase_key:
        sys.exit("[ERROR] SUPABASE_URL / SUPABASE_KEY not set in .env")

    # ── Supabase client ───────────────────────────────────────────────────────
    sb = create_client(cfg.supabase_url, cfg.supabase_key)

    # ── Zones ─────────────────────────────────────────────────────────────────
    zones = load_zones(cfg.zones_config_path)
    print(f"Loaded {len(zones)} zone(s): {[z.name for z in zones]}")

    # ── YOLO ──────────────────────────────────────────────────────────────────
    model = YOLO(cfg.yolo_model)
    print(f"YOLO model: {cfg.yolo_model}")

    # ── Face DB ───────────────────────────────────────────────────────────────
    Path(cfg.faces_db).mkdir(exist_ok=True)
    face_recog = AsyncFaceRecognizer(
        cfg.faces_db, cfg.face_model, cfg.face_distance_threshold, cfg.face_det_interval
    )
    employees = face_encoder.list_employees(cfg.faces_db)
    print(f"Faces DB '{cfg.faces_db}': {len(employees)} employee(s) registered")

    # ── RTSP stream ───────────────────────────────────────────────────────────
    rtsp_cfg = RtspConfig(
        url=cfg.rtsp_url,
        rtsp_transport=cfg.rtsp_transport,
        ffmpeg_read_timeout_ms=cfg.rtsp_timeout_ms,
        reconnect_backoff_seconds=cfg.reconnect_backoff_seconds,
    )
    stream = RtspStream(rtsp_cfg)

    # ── Aggregator ────────────────────────────────────────────────────────────
    agg = Aggregator(cfg.aggregation_seconds, cfg.motion_active_threshold)

    # Motion tracking per track-id: last centre (normalised 0–1)
    prev_centres: dict[int, tuple[float, float]] = {}
    frame_idx = 0

    print("Monitoring started. Press Ctrl+C to stop.")

    for _ts, frame in stream.frames():
        frame_idx += 1
        h, w = frame.shape[:2]

        # ── YOLO track ────────────────────────────────────────────────────────
        try:
            results = model.track(
                frame,
                persist=True,
                conf=cfg.conf_thres,
                iou=cfg.iou_thres,
                classes=[0],   # person only
                verbose=False,
            )
        except Exception as exc:
            print(f"[YOLO] {exc}")
            continue

        if not results or results[0].boxes is None:
            if agg.ready():
                _flush(agg, sb, cfg.supabase_table)
            continue

        for box in results[0].boxes:
            if box.id is None:
                continue

            tid = int(box.id.item())
            x1, y1, x2, y2 = map(int, box.xyxy[0].tolist())

            # Normalised centre
            cx = (x1 + x2) / 2.0 / w
            cy = (y1 + y2) / 2.0 / h

            # ── Motion score (Euclidean pixel displacement of centre) ─────────
            prev = prev_centres.get(tid)
            if prev is not None:
                motion = float(np.hypot((cx - prev[0]) * w, (cy - prev[1]) * h))
            else:
                motion = 0.0
            prev_centres[tid] = (cx, cy)

            # ── Face recognition (async) ──────────────────────────────────────
            if face_recog.due(tid, frame_idx):
                face_crop = crop_face(frame, x1, y1, x2, y2)
                if face_crop.size > 0:
                    face_recog.submit(tid, face_crop, frame_idx)

            employee = face_recog.get(tid)

            # ── Zone check ────────────────────────────────────────────────────
            px, py = int(cx * w), int(cy * h)
            for zone in zones:
                if point_in_polygon((px, py), zone.polygon):
                    agg.add(zone.name, employee, motion, zone.motion_active_threshold)

        # ── Flush aggregation window ──────────────────────────────────────────
        if agg.ready():
            _flush(agg, sb, cfg.supabase_table)


def _flush(agg: Aggregator, sb, table: str) -> None:
    records = agg.flush()
    if not records:
        return
    try:
        sb.table(table).insert(records).execute()
        for r in records:
            status = "Active" if r["is_active"] else "Idle"
            print(f"  [INSERT] {r['zone_name']} / {r['employee_name']} → {status} (motion={r['motion_score']})")
    except Exception as exc:
        print(f"[Supabase INSERT error] {exc}")


if __name__ == "__main__":
    main()
