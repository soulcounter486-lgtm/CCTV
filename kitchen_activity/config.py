"""Centralised configuration loaded from .env."""
from __future__ import annotations

import os
from dataclasses import dataclass

from dotenv import load_dotenv


@dataclass(frozen=True)
class Config:
    # ── RTSP ──────────────────────────────────────────────
    rtsp_url: str
    rtsp_transport: str
    rtsp_timeout_ms: int
    reconnect_backoff_seconds: int

    # ── YOLO ──────────────────────────────────────────────
    yolo_model: str
    conf_thres: float
    iou_thres: float
    device: str

    # ── Face recognition ──────────────────────────────────
    faces_db: str           # path to faces_db directory
    face_model: str         # DeepFace model name
    face_det_interval: int  # run face-recog every N frames per track-id
    face_distance_threshold: float  # cosine distance cutoff (lower = stricter)

    # ── Aggregation / zones ───────────────────────────────
    aggregation_seconds: int
    motion_active_threshold: float
    zones_config_path: str

    # ── Supabase ──────────────────────────────────────────
    supabase_url: str
    supabase_key: str
    supabase_table: str


def load_config() -> Config:
    load_dotenv(override=False)
    return Config(
        rtsp_url=os.getenv("RTSP_URL", ""),
        rtsp_transport=os.getenv("RTSP_TRANSPORT", "tcp"),
        rtsp_timeout_ms=int(os.getenv("RTSP_READ_TIMEOUT_MS", "60000")),
        reconnect_backoff_seconds=int(os.getenv("RECONNECT_BACKOFF_SECONDS", "2")),

        yolo_model=os.getenv("YOLO_MODEL", "yolov8n.pt"),
        conf_thres=float(os.getenv("CONF_THRES", "0.35")),
        iou_thres=float(os.getenv("IOU_THRES", "0.45")),
        device=os.getenv("DEVICE", "cpu"),

        faces_db=os.getenv("FACES_DB_PATH", "faces_db"),
        face_model=os.getenv("FACE_MODEL", "SFace"),
        face_det_interval=int(os.getenv("FACE_DET_INTERVAL", "30")),
        face_distance_threshold=float(os.getenv("FACE_DISTANCE_THRESHOLD", "0.6")),

        aggregation_seconds=int(os.getenv("AGGREGATION_SECONDS", "60")),
        motion_active_threshold=float(os.getenv("MOTION_ACTIVE_THRESHOLD", "18.0")),
        zones_config_path=os.getenv("ZONES_CONFIG_PATH", "config/zones.yaml"),

        supabase_url=os.getenv("SUPABASE_URL", ""),
        supabase_key=os.getenv("SUPABASE_KEY", ""),
        supabase_table=os.getenv("SUPABASE_TABLE", "kitchen_activity"),
    )
