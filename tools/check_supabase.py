from __future__ import annotations

import os
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

    # Count (approx) by fetching small sample, and also fetch latest rows.
    res_latest = (
        sb.table(table)
        .select("id, created_at, zone_name, is_active, motion_score")
        .order("created_at", desc=True)
        .limit(5)
        .execute()
    )

    if getattr(res_latest, "error", None):
        raise SystemExit(f"Latest query failed: {res_latest.error}")

    rows = res_latest.data or []
    print(f"Latest rows (up to 5): {len(rows)}")
    for r in rows:
        print(r)


if __name__ == "__main__":
    main()

