from __future__ import annotations

from pydantic import BaseModel
from pydantic import Field
from dotenv import load_dotenv

import os


class Settings(BaseModel):
    rtsp_url: str = Field(default="")

    device: str = Field(default="cpu")
    yolo_model: str = Field(default="yolov8n.pt")
    conf_thres: float = Field(default=0.35)
    iou_thres: float = Field(default=0.45)

    aggregation_seconds: int = Field(default=60)
    motion_active_threshold: float = Field(default=18.0)
    reconnect_backoff_seconds: float = Field(default=2.0)

    zones_config_path: str = Field(default="config/zones.yaml")

    supabase_url: str = Field(default="")
    supabase_service_role_key: str = Field(default="")
    supabase_table: str = Field(default="kitchen_activity")


def load_settings() -> Settings:
    load_dotenv(override=False)
    return Settings(
        rtsp_url=os.getenv("RTSP_URL", ""),
        device=os.getenv("DEVICE", "cpu"),
        yolo_model=os.getenv("YOLO_MODEL", "yolov8n.pt"),
        conf_thres=float(os.getenv("CONF_THRES", "0.35")),
        iou_thres=float(os.getenv("IOU_THRES", "0.45")),
        aggregation_seconds=int(os.getenv("AGGREGATION_SECONDS", "60")),
        motion_active_threshold=float(os.getenv("MOTION_ACTIVE_THRESHOLD", "18.0")),
        reconnect_backoff_seconds=float(os.getenv("RECONNECT_BACKOFF_SECONDS", "2")),
        zones_config_path=os.getenv("ZONES_CONFIG_PATH", "config/zones.yaml"),
        supabase_url=os.getenv("SUPABASE_URL", ""),
        supabase_service_role_key=os.getenv("SUPABASE_SERVICE_ROLE_KEY", ""),
        supabase_table=os.getenv("SUPABASE_TABLE", "kitchen_activity"),
    )
