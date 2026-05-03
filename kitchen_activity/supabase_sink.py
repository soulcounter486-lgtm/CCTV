from __future__ import annotations

from dataclasses import dataclass

from supabase import create_client
from supabase.client import Client


@dataclass(frozen=True)
class SupabaseConfig:
    url: str
    key: str
    table: str = "kitchen_activity"


class SupabaseSink:
    def __init__(self, cfg: SupabaseConfig):
        if not cfg.url:
            raise ValueError("SUPABASE_URL is empty")
        if not cfg.key:
            raise ValueError("SUPABASE_KEY is empty")
        self._cfg = cfg
        self._client: Client = create_client(cfg.url, cfg.key)

    def insert_activity(self, zone_name: str, is_active: bool, motion_score: float) -> None:
        payload = {
            "zone_name": zone_name,
            "is_active": bool(is_active),
            "motion_score": float(motion_score),
        }
        res = self._client.table(self._cfg.table).insert(payload).execute()
        if getattr(res, "error", None):
            raise RuntimeError(f"Supabase insert failed: {res.error}")
