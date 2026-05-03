from __future__ import annotations

import os
import time
import uuid

from dotenv import load_dotenv
from supabase import create_client


def main() -> None:
    load_dotenv(override=False)
    url = os.getenv("SUPABASE_URL", "")
    key = os.getenv("SUPABASE_KEY", "")
    table = os.getenv("SUPABASE_TABLE", "kitchen_activity")

    if not url or not key:
        raise SystemExit("Missing SUPABASE_URL or SUPABASE_KEY in .env")

    sb = create_client(url, key)
    zone = f"__smoke_test__{uuid.uuid4().hex[:8]}"
    payload = {
        "zone_name": zone,
        "is_active": False,
        "motion_score": 0.0,
    }

    ins = sb.table(table).insert(payload).execute()
    if getattr(ins, "error", None):
        raise SystemExit(f"Insert failed: {ins.error}")

    # Small delay so realtime/list queries can catch up if needed
    time.sleep(0.2)

    sel = (
        sb.table(table)
        .select("id, created_at, zone_name, is_active, motion_score")
        .eq("zone_name", zone)
        .limit(1)
        .execute()
    )
    if getattr(sel, "error", None):
        raise SystemExit(f"Select failed: {sel.error}")

    rows = sel.data or []
    if not rows:
        raise SystemExit("Insert appeared to succeed but row not visible on select (RLS/policy issue?).")

    print("OK: smoke insert + select worked")
    print(rows[0])


if __name__ == "__main__":
    main()
