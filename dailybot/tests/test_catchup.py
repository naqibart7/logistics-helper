"""
W3b — a PC that was off or asleep when a prompt was due.

The scenarios are the ones the instruction lists: start at 13:40 with no marker
-> the 13:15 prompt fires once; start at 18:00 -> nothing; two restarts -> no
duplicates; a Sunday start -> nothing; a sleep that wakes inside the grace
window -> fires late once.
"""

import asyncio
from datetime import datetime, timedelta

import pytest

from bot import main
from bot.scheduler import catch_up_touchpoints
from bot.state import load_fired, mark_fired

MONDAY = datetime(2026, 9, 28)     # 2026-09-28 is a Monday (test_scheduler.py)
SUNDAY = datetime(2026, 10, 4)

HANDLED = ("midday", "late_afternoon", "catch_up", "item_progress")


def _at(day, hour, minute=0):
    return day.replace(hour=hour, minute=minute)


# ── the pure planner ───────────────────────────────────────────────────────────

def test_start_at_1340_owes_the_1315_prompt():
    assert catch_up_touchpoints(_at(MONDAY, 13, 40)) == ["midday"]


def test_start_at_1800_owes_nothing():
    assert catch_up_touchpoints(_at(MONDAY, 18, 0)) == []


def test_sunday_start_owes_nothing():
    assert catch_up_touchpoints(_at(SUNDAY, 14, 0)) == []


def test_waking_inside_the_grace_window_still_owes_the_prompt():
    assert catch_up_touchpoints(_at(MONDAY, 13, 20)) == ["midday"]  # 5 min late
    assert catch_up_touchpoints(_at(MONDAY, 13, 59)) == ["midday"]  # 44 min late
    assert catch_up_touchpoints(_at(MONDAY, 14, 1)) == []           # 46 min late


def test_a_late_prompt_does_not_stack_on_the_next_one():
    # 16:55: the 16:30 chunk is 25 minutes late (past its 19-minute grace) so it
    # is dropped rather than crowding the catch-up ping at 16:50.
    assert catch_up_touchpoints(_at(MONDAY, 16, 55)) == ["catch_up"]
    # 17:00 exactly: the catch-up ping is now 10 minutes late (past its 9), and
    # the item-progress flow is due.
    assert catch_up_touchpoints(_at(MONDAY, 17, 0)) == ["item_progress"]


def test_monday_refresh_is_owed_in_the_morning():
    assert catch_up_touchpoints(_at(MONDAY, 10, 30)) == ["refresh_in"]


def test_friday_refresh_is_owed_in_the_afternoon():
    friday = datetime(2026, 10, 2, 15, 30)
    assert catch_up_touchpoints(friday) == ["refresh_out"]


# ── the start-up path ──────────────────────────────────────────────────────────

@pytest.fixture
def sent(monkeypatch):
    """Record what a cold start would actually send, without Telegram."""
    calls = []

    def make(tp_id):
        async def handler(app):
            calls.append(tp_id)
        return handler

    monkeypatch.setattr(main, "CATCHUP_HANDLERS", {tp: make(tp) for tp in HANDLED})
    return calls


def test_cold_start_sends_the_owed_prompt_once(data_dirs, sent):
    now = _at(MONDAY, 13, 40)
    assert asyncio.run(main.run_catchup("app", now=now)) == ["midday"]
    assert sent == ["midday"]
    assert load_fired("2026-09-28") == {"midday"}


def test_two_restarts_send_nothing_the_second_time(data_dirs, sent):
    now = _at(MONDAY, 13, 40)
    asyncio.run(main.run_catchup("app", now=now))
    assert asyncio.run(main.run_catchup("app", now=now)) == []
    assert sent == ["midday"]


def test_next_day_starts_clean(data_dirs, sent):
    asyncio.run(main.run_catchup("app", now=_at(MONDAY, 13, 40)))
    asyncio.run(main.run_catchup("app", now=_at(MONDAY + timedelta(days=1), 13, 40)))
    assert sent == ["midday", "midday"]
    assert load_fired("2026-09-28") == {"midday"}
    assert load_fired("2026-09-29") == {"midday"}


def test_a_prompt_already_sent_today_is_not_replayed(data_dirs, sent):
    mark_fired("2026-09-28", "midday")
    assert asyncio.run(main.run_catchup("app", now=_at(MONDAY, 13, 40))) == []
    assert sent == []


def test_evening_start_sends_nothing(data_dirs, sent):
    assert asyncio.run(main.run_catchup("app", now=_at(MONDAY, 18, 0))) == []
    assert sent == []


def test_sunday_start_sends_nothing(data_dirs, sent):
    assert asyncio.run(main.run_catchup("app", now=_at(SUNDAY, 14, 0))) == []
    assert sent == []


def test_log_only_refreshes_are_not_sent_but_not_marked(data_dirs, sent):
    """The Mon 10:00 refresh has no sender yet: nothing goes out and nothing is
    recorded, so the day it gains logic the catch-up still replays it."""
    assert asyncio.run(main.run_catchup("app", now=_at(MONDAY, 10, 30))) == []
    assert sent == []
    assert load_fired("2026-09-28") == set()
