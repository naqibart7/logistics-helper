"""
state.py — the two bits of runtime state that must survive a restart (W3b/W4).

    data/fired.json      {"2026-10-15": ["midday", "catch_up"]}
        date -> touchpoints already sent that day. Written every time a
        touchpoint is sent, so a PC that was off at 13:15 and boots at 13:40
        sends the 13:15 prompt once — and a second restart sends nothing.

    data/heartbeat.json  {"lastSent": "...", "lastSentEpoch": 1760486531.0}
        when the "Bot started" line was last sent, so a restart loop cannot
        spam Naqib.

Both files are disposable: no answers live here (those are in daily/ and
items/), so a missing or corrupt file is treated as "nothing recorded yet"
rather than an error. Writes go through a temp file + os.replace so a power cut
cannot leave a half-written JSON file behind that would then be re-read.
"""

import json
import os
import tempfile
from datetime import datetime, timedelta
from pathlib import Path
from zoneinfo import ZoneInfo

from bot import config

HEARTBEAT_INTERVAL_MINUTES = 10
FIRED_KEEP_DAYS = 7


def _path(kind, path=None):
    if path is not None:
        return Path(path)
    return {"fired": config.FIRED_FILE, "heartbeat": config.HEARTBEAT_FILE}[kind]


def _read_json(path, default):
    if not path.exists():
        return default
    try:
        # utf-8-sig: tolerate a BOM so a hand-edited state file is not silently
        # read as "nothing recorded yet".
        with path.open("r", encoding="utf-8-sig") as f:
            return json.load(f)
    except (ValueError, OSError):
        return default


def _write_json(path, data):
    path = str(path)
    folder = os.path.dirname(path)
    if folder:
        os.makedirs(folder, exist_ok=True)
    handle, tmp = tempfile.mkstemp(dir=folder or ".", suffix=".tmp")
    try:
        with os.fdopen(handle, "w", encoding="utf-8") as f:
            json.dump(data, f, ensure_ascii=False, indent=2)
        os.replace(tmp, path)
    except BaseException:
        if os.path.exists(tmp):
            os.unlink(tmp)
        raise


# ── fired touchpoints (W3b) ────────────────────────────────────────────────────

def load_fired(date_iso, path=None):
    """Touchpoint ids already sent on this date (a set; empty when unknown)."""
    data = _read_json(_path("fired", path), {})
    return set(data.get(date_iso, []))


def is_fired(date_iso, touchpoint_id, path=None):
    return touchpoint_id in load_fired(date_iso, path)


def mark_fired(date_iso, touchpoint_id, path=None):
    """Record that this touchpoint was sent today, pruning week-old dates."""
    path = _path("fired", path)
    data = _read_json(path, {})
    entry = set(data.get(date_iso, []))
    entry.add(touchpoint_id)
    data[date_iso] = sorted(entry)

    cutoff = date_iso
    try:
        cutoff = (datetime.fromisoformat(date_iso) - timedelta(days=FIRED_KEEP_DAYS)).date().isoformat()
    except ValueError:
        pass  # unparseable date key: keep whatever is there
    pruned = {}
    for day, ids in data.items():
        try:
            if day >= cutoff:
                pruned[day] = ids
        except TypeError:
            pruned[day] = ids
    _write_json(path, pruned)
    return entry


# ── heartbeat throttle (W4) ────────────────────────────────────────────────────

def _epoch(moment):
    """Seconds since the epoch; a naive datetime is read as KL wall-clock time."""
    if moment.tzinfo is None:
        moment = moment.replace(tzinfo=ZoneInfo(config.TIMEZONE))
    return moment.timestamp()


def should_send_heartbeat(now, path=None, interval_minutes=HEARTBEAT_INTERVAL_MINUTES):
    """True unless a heartbeat was already sent within the last interval."""
    data = _read_json(_path("heartbeat", path), {})
    last = data.get("lastSentEpoch")
    if last is None:
        return True
    try:
        return (_epoch(now) - float(last)) >= interval_minutes * 60
    except (TypeError, ValueError):
        return True


def record_heartbeat(now, path=None):
    path = _path("heartbeat", path)
    _write_json(path, {
        "lastSent": now.isoformat(timespec="seconds"),
        "lastSentEpoch": _epoch(now),
    })
    return path
