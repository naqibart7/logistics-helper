"""
W4 — the start-up heartbeat (one line, at most once per 10 minutes) and /status
(running-since + the next three touchpoints).
"""

import asyncio
import json
import platform
from datetime import datetime

import pytest

from bot import main
from bot.scheduler import next_touchpoints
from bot.state import record_heartbeat, should_send_heartbeat

MONDAY = datetime(2026, 9, 28)
BASE = MONDAY.replace(hour=8, minute=2)


class _FakeBot:
    def __init__(self):
        self.messages = []

    async def send_message(self, chat_id=None, text="", **kwargs):
        self.messages.append({"chat_id": chat_id, "text": text})


class _FakeApp:
    def __init__(self):
        self.bot = _FakeBot()


@pytest.fixture
def naqib(monkeypatch):
    monkeypatch.setenv("NAQIB_CHAT_ID", "424242")


# ── the throttle ───────────────────────────────────────────────────────────────

def test_three_rapid_restarts_send_one_heartbeat(data_dirs, naqib):
    app = _FakeApp()
    for minutes in (0, 1, 2):
        asyncio.run(main.send_heartbeat(app, now=BASE.replace(minute=2 + minutes)))

    assert len(app.bot.messages) == 1
    assert app.bot.messages[0]["text"].startswith("Bot started 08:02 on ")
    assert platform.node() in app.bot.messages[0]["text"]
    assert app.bot.messages[0]["chat_id"] == "424242"


def test_restart_ten_minutes_later_sends_again(data_dirs, naqib):
    app = _FakeApp()
    asyncio.run(main.send_heartbeat(app, now=BASE))
    asyncio.run(main.send_heartbeat(app, now=BASE.replace(minute=12)))  # 08:02 -> 08:12

    assert [m["text"] for m in app.bot.messages] == [
        f"Bot started 08:02 on {platform.node()}",
        f"Bot started 08:12 on {platform.node()}",
    ]


def test_nine_minutes_later_is_still_throttled(data_dirs):
    record_heartbeat(BASE)
    assert should_send_heartbeat(BASE.replace(minute=12)) is True   # exactly 10 minutes
    assert should_send_heartbeat(BASE.replace(minute=11)) is False  # 9 minutes
    assert should_send_heartbeat(BASE.replace(minute=3)) is False


def test_missing_or_corrupt_state_sends(data_dirs):
    assert should_send_heartbeat(BASE) is True
    main.config.HEARTBEAT_FILE.write_text("not json", encoding="utf-8")
    assert should_send_heartbeat(BASE) is True


def test_heartbeat_state_is_written_with_a_timestamp(data_dirs):
    record_heartbeat(BASE)
    saved = json.loads(main.config.HEARTBEAT_FILE.read_text(encoding="utf-8"))
    assert saved["lastSent"].startswith("2026-09-28T08:02")
    assert isinstance(saved["lastSentEpoch"], float)


# ── /status ────────────────────────────────────────────────────────────────────

def test_next_three_touchpoints_from_monday_noon():
    when = [tp["id"] for _, tp in next_touchpoints(MONDAY.replace(hour=12, minute=0), 3)]
    assert when == ["midday", "late_afternoon", "catch_up"]


def test_next_touchpoints_crosses_into_the_next_day():
    when = [tp["id"] for _, tp in next_touchpoints(MONDAY.replace(hour=18, minute=0), 3)]
    assert when == ["midday", "late_afternoon", "catch_up"]  # Tuesday's runs


def test_next_touchpoints_skips_sunday():
    saturday_evening = datetime(2026, 10, 3, 18, 0)  # 2026-10-04 is a Sunday
    upcoming = next_touchpoints(saturday_evening, 3)
    assert [tp["id"] for _, tp in upcoming] == ["refresh_in", "midday", "late_afternoon"]
    assert all(when_at.weekday() != 6 for when_at, _ in upcoming)


def test_status_text_shows_running_since_and_three_touchpoints(data_dirs):
    text = main.status_text(now=MONDAY.replace(hour=12, minute=0), running_since=BASE)
    assert "Running since: 2026-09-28 08:02" in text
    assert text.count("— ") == 3
    assert "13:15 — MIDDAY CHUNK" in text
    assert "16:30 — LATE-AFTERNOON CHUNK" in text
    assert "Rekod harini (20" in text


def test_status_text_says_so_when_not_started_in_this_process(data_dirs, monkeypatch):
    monkeypatch.setitem(main.RUNNING_SINCE, "at", None)
    text = main.status_text(now=MONDAY.replace(hour=12, minute=0))
    assert "not started in this process" in text
