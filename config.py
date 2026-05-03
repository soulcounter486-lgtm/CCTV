from __future__ import annotations

import os
from dataclasses import dataclass

from dotenv import load_dotenv


@dataclass(frozen=True)
class Config:
    # RTSP
    rtsp_url: str
    reconnect_backoff_seconds: float

    # YOLO
    yolo_model: str
    device: str
    conf_thres: float
    iou_thres: float

    # Motion aggregation
    aggregation_seconds: int
    motion_active_threshold: float

    # Zones
    zones_config_path: str

    # Supabase
    supabase_url: str
    supabase_key: str
    supabase_table: str


def load_config() -> Config:
    """
    Reads values from `.env` (python-dotenv) then environment variables.

    Expected .env keys (per your request):
    - RTSP_URL
    - SUPABASE_URL
    - SUPABASE_KEY
    """
    load_dotenv(override=False)

    return Config(
        rtsp_url=os.getenv("RTSP_URL", ""),
        reconnect_backoff_seconds=float(os.getenv("RECONNECT_BACKOFF_SECONDS", "2")),
        yolo_model=os.getenv("YOLO_MODEL", "yolov8n.pt"),
        device=os.getenv("DEVICE", "cpu"),
        conf_thres=float(os.getenv("CONF_THRES", "0.35")),
        iou_thres=float(os.getenv("IOU_THRES", "0.45")),
        aggregation_seconds=int(os.getenv("AGGREGATION_SECONDS", "60")),
        motion_active_threshold=float(os.getenv("MOTION_ACTIVE_THRESHOLD", "18.0")),
        zones_config_path=os.getenv("ZONES_CONFIG_PATH", "config/zones.yaml"),
        supabase_url=os.getenv("SUPABASE_URL", ""),
        supabase_key=os.getenv("SUPABASE_KEY", ""),
        supabase_table=os.getenv("SUPABASE_TABLE", "kitchen_activity"),
    )

