"""
seed_test_data.py
오늘 날짜 09:00~21:00 범위로 1분 단위 kitchen_activity row를 insert해
대시보드 UI 전체를 실데이터로 검증하는 스크립트.

사용법:
    python tools/seed_test_data.py          # 오늘 날짜로 insert
    python tools/seed_test_data.py --delete # 오늘 seed row 삭제만
"""
from __future__ import annotations

import math
import os
import sys
from datetime import datetime, timezone, timedelta
from dotenv import load_dotenv
from supabase import create_client

SEED_TAG = "seed_test"


def pseudo(seed: float) -> float:
    x = math.sin(seed) * 10000
    return x - math.floor(x)


def build_rows(zone: str, threshold: float) -> list[dict]:
    now = datetime.now()
    base = datetime(now.year, now.month, now.day, 9, 0, 0, tzinfo=timezone.utc)
    rows = []
    for i in range(720):  # 9:00 ~ 21:00 (720 minutes)
        t = base + timedelta(minutes=i)
        hour = 9 + i / 60
        lunch = math.exp(-((hour - 12.5) ** 2) / 2.2)
        dinner = math.exp(-((hour - 18.5) ** 2) / 3.0)
        base_v = 10 + lunch * 35 + dinner * 45
        noise = (pseudo(i * 7 + len(zone)) - 0.5) * 8
        motion = max(0.0, min(90.0, base_v + noise))
        rows.append({
            "created_at": t.isoformat(),
            "zone_name": zone,
            "is_active": bool(motion >= threshold),
            "motion_score": round(motion, 2),
        })
    return rows


def delete_seed_rows(sb, table: str) -> None:
    now = datetime.now()
    day_start = datetime(now.year, now.month, now.day, 0, 0, 0, tzinfo=timezone.utc).isoformat()
    day_end = datetime(now.year, now.month, now.day + 1, 0, 0, 0, tzinfo=timezone.utc).isoformat()
    for zone in ("cooking_zone", "packing_zone"):
        res = (
            sb.table(table)
            .delete()
            .gte("created_at", day_start)
            .lt("created_at", day_end)
            .eq("zone_name", zone)
            .execute()
        )
        deleted = len(res.data or [])
        print(f"Deleted {deleted} rows for {zone}")


def main() -> None:
    load_dotenv(override=False)
    url = os.getenv("SUPABASE_URL", "")
    key = os.getenv("SUPABASE_KEY", "")
    table = os.getenv("SUPABASE_TABLE", "kitchen_activity")

    if not url or not key:
        raise SystemExit("Missing SUPABASE_URL or SUPABASE_KEY in .env")

    sb = create_client(url, key)

    if "--delete" in sys.argv:
        delete_seed_rows(sb, table)
        return

    delete_seed_rows(sb, table)

    for zone, threshold in [("cooking_zone", 18.0), ("packing_zone", 12.0)]:
        rows = build_rows(zone, threshold)
        CHUNK = 200
        inserted = 0
        for i in range(0, len(rows), CHUNK):
            chunk = rows[i : i + CHUNK]
            res = sb.table(table).insert(chunk).execute()
            if getattr(res, "error", None):
                raise SystemExit(f"Insert failed for {zone}: {res.error}")
            inserted += len(chunk)
        print(f"Inserted {inserted} rows for {zone}")

    # Quick verify
    res = (
        sb.table(table)
        .select("zone_name, is_active, motion_score")
        .order("created_at", desc=True)
        .limit(4)
        .execute()
    )
    print("\nLatest rows after seed:")
    for r in (res.data or []):
        print(f"  {r}")


if __name__ == "__main__":
    main()
