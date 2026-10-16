"""
store.py — daily/{date}.json read/write. The Section 6.2 shape, verbatim:

    {"date": "2026-09-28",
     "chunks": {"midday": {"answeredAt": "13:22", "dealSupplier": "..."},
                "lateAfternoon": {"answeredAt": null}},
     "deliveryActivity": {"doneToday": [], "readyToDeliver": []}}

One file per day. Read-modify-write, single user, no locking (one process).
Delivery Activity lives here too (Section 5.2) — Slice 4 fills it.
"""

import json
from datetime import datetime

from bot import config


def _daily_path(date_iso):
    return config.DAILY_DIR / f"{date_iso}.json"


def load_daily(date_iso):
    """Load today's record, or a fresh empty one (with both chunk keys present)."""
    path = _daily_path(date_iso)
    if path.exists():
        # utf-8-sig: a BOM (Windows editors add one) would break json.load().
        with path.open("r", encoding="utf-8-sig") as f:
            record = json.load(f)
    else:
        record = {"date": date_iso, "chunks": {}, "deliveryActivity": {"doneToday": [], "readyToDeliver": []}}
    record.setdefault("date", date_iso)
    record.setdefault("chunks", {})
    record.setdefault("deliveryActivity", {"doneToday": [], "readyToDeliver": []})
    return record


def save_daily(record):
    path = _daily_path(record["date"])
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8") as f:
        json.dump(record, f, ensure_ascii=False, indent=2)
    return path


def record_answer(record, chunk_id, answered_at, **answers):
    """
    Merge answers into chunks[chunk_id], setting answeredAt on the first answer
    of that chunk. Keys are outputFields (weeklyMeeting, dealSupplier, ...) —
    the caller maps topic -> outputField via topics.json.
    """
    chunk = record["chunks"].setdefault(chunk_id, {})
    if chunk.get("answeredAt") is None:
        chunk["answeredAt"] = answered_at
    chunk.update(answers)
    return record


def now_kl_time():
    """HH:MM in KL — the answeredAt format from the Section 6.2 example."""
    from zoneinfo import ZoneInfo
    return datetime.now(ZoneInfo("Asia/Kuala_Lumpur")).strftime("%H:%M")
