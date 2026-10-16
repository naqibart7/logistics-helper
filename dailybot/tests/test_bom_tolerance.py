"""
BOM tolerance — every hand-editable JSON file must survive a byte-order mark.

Windows editors (Notepad, Excel's "save as", some VS Code settings) happily put
U+FEFF at the start of a JSON file. json.load() refuses it outright:

    json.decoder.JSONDecodeError: Unexpected UTF-8 BOM (decode using utf-8-sig)

That is not hypothetical: the committed dailybot/data/projects.json carried a
BOM, so the 17:00 Item Progress job died with that traceback in the live bot on
2026-10-15 (see dailybot/logs/bot.log). Reads now use utf-8-sig; these tests pin
that down file by file.
"""

import json
from datetime import datetime

import pytest

from bot import config, lock, main, state, store
from bot.items import load_items
from bot.topics import load_topics

BOM = b"\xef\xbb\xbf"


def with_bom(payload, path):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(BOM + json.dumps(payload, ensure_ascii=False).encode("utf-8"))
    return path


def test_projects_json_with_a_bom_still_lists_projects(tmp_path, monkeypatch):
    """The exact live failure: the 17:00 job fell over before it could ask."""
    path = with_bom({"projects": ["pj-rufaidah", "pj-masjid"]}, tmp_path / "projects.json")
    monkeypatch.setattr(config, "PROJECTS_FILE", path)
    assert main.load_active_projects() == ["pj-rufaidah", "pj-masjid"]


def test_daily_record_with_a_bom_is_read(data_dirs):
    with_bom({"date": "2026-10-15", "chunks": {"midday": {"answeredAt": "13:22"}}},
             config.DAILY_DIR / "2026-10-15.json")
    record = store.load_daily("2026-10-15")
    assert record["chunks"]["midday"]["answeredAt"] == "13:22"
    assert record["date"] == "2026-10-15"


def test_item_tracker_with_a_bom_is_read(data_dirs):
    with_bom({"project": "pj-x", "completionPct": 50, "items": [{"name": "PVC", "status": "in_progress"}]},
             config.ITEMS_DIR / "pj-x.json")
    record = load_items("pj-x")
    assert record["completionPct"] == 50
    assert record["items"][0]["name"] == "PVC"


def test_topics_json_with_a_bom_is_read(tmp_path, monkeypatch):
    path = with_bom({"topics": [{"id": "weekly_meeting", "title": "Weekly meeting"}]},
                    tmp_path / "topics.json")
    monkeypatch.setattr(config, "TOPICS_FILE", path)
    assert load_topics()["weekly_meeting"]["title"] == "Weekly meeting"


def test_env_file_with_a_bom_still_yields_the_token(tmp_path, monkeypatch):
    """A BOM here is fatal at startup: the key becomes "\\ufeffTELEGRAM_BOT_TOKEN"."""
    env = tmp_path / ".env"
    env.write_bytes(BOM + b"TELEGRAM_BOT_TOKEN=123:abc\nNAQIB_CHAT_ID=42\n")
    monkeypatch.delenv("TELEGRAM_BOT_TOKEN", raising=False)
    monkeypatch.delenv("NAQIB_CHAT_ID", raising=False)
    main.load_env(str(env))
    import os
    assert os.environ["TELEGRAM_BOT_TOKEN"] == "123:abc"
    assert os.environ["NAQIB_CHAT_ID"] == "42"


def test_fired_and_heartbeat_state_with_a_bom_are_read(tmp_path):
    from zoneinfo import ZoneInfo

    fired = with_bom({"2026-10-15": ["midday"]}, tmp_path / "fired.json")
    sent_at = datetime(2026, 10, 15, 8, 2)
    heartbeat = with_bom(
        {
            "lastSent": sent_at.isoformat(timespec="seconds"),
            "lastSentEpoch": sent_at.replace(tzinfo=ZoneInfo(config.TIMEZONE)).timestamp(),
        },
        tmp_path / "heartbeat.json",
    )
    assert state.load_fired("2026-10-15", path=fired) == {"midday"}
    assert state.is_fired("2026-10-15", "midday", path=fired) is True
    # 5 minutes after the recorded heartbeat: throttled — so the BOM-prefixed
    # state was understood, not discarded as "nothing recorded yet".
    assert state.should_send_heartbeat(datetime(2026, 10, 15, 8, 7), path=heartbeat) is False
    # 20 minutes after: the 10-minute throttle has expired.
    assert state.should_send_heartbeat(datetime(2026, 10, 15, 8, 22), path=heartbeat) is True


def test_lock_file_with_a_bom_is_understood_not_treated_as_stale(tmp_path):
    import os

    path = with_bom({"pid": os.getpid(), "startedAt": "2026-10-15T08:02:00"}, tmp_path / ".bot.lock")
    assert lock.read_lock(path) == os.getpid()
    allowed, message = lock.acquire_lock(path)
    assert allowed is False
    assert "already running" in message


def test_writes_never_introduce_a_bom(data_dirs):
    """Tolerating BOMs on read must not mean writing them."""
    store.save_daily({"date": "2026-10-15", "chunks": {}, "deliveryActivity": {}})
    raw = (config.DAILY_DIR / "2026-10-15.json").read_bytes()
    assert not raw.startswith(BOM)
    assert json.loads(raw.decode("utf-8"))["date"] == "2026-10-15"
