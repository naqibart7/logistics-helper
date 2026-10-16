"""
W3a — the misfire grace. APScheduler's default is one second, so a prompt due
while the PC slept used to be dropped. Each touchpoint now gets
min(45 minutes, gap to the next touchpoint that day), and the jobs get
coalesce=True. These tests read the schedule table, not a copy of it.
"""

import asyncio
from datetime import datetime

from apscheduler.triggers.cron import CronTrigger

from bot import main
from bot.scheduler import TOUCHPOINTS, grace_seconds, touchpoint_for
from bot.state import is_fired

WEEKDAY_CHUNKS = ("midday", "late_afternoon", "catch_up", "item_progress")


def _minutes(text):
    hour, minute = text.split(":")
    return int(hour) * 60 + int(minute)


def test_grace_is_capped_at_45_minutes():
    # item_progress is the last touchpoint of the day; the Mon/Fri refreshes have
    # no same-day neighbour inside the cap.
    assert grace_seconds("item_progress") == 45 * 60
    assert grace_seconds("refresh_in") == 45 * 60     # Mon 10:00, next is 13:15
    assert grace_seconds("refresh_out") == 45 * 60    # Fri 15:00, next is 16:30
    assert grace_seconds("midday") == 45 * 60         # 13:15 -> 16:30


def test_grace_shrinks_before_a_crowded_hour():
    # 16:30 must not slide into 16:50, and 16:50 must not slide into 17:00.
    assert grace_seconds("late_afternoon") == 19 * 60
    assert grace_seconds("catch_up") == 9 * 60


def test_a_late_prompt_can_never_land_on_the_next_touchpoint():
    for tp in TOUCHPOINTS:
        scheduled = _minutes(tp["time"])
        same_day_later = [
            _minutes(other["time"]) - scheduled
            for other in TOUCHPOINTS
            if other is not tp
            and set(other["weekdays"]) & set(tp["weekdays"])
            and _minutes(other["time"]) > scheduled
        ]
        if same_day_later:
            gap_minutes = min(same_day_later)
            assert grace_seconds(tp["id"]) < gap_minutes * 60


def test_every_touchpoint_has_a_positive_grace():
    for tp in TOUCHPOINTS:
        assert grace_seconds(tp["id"]) > 0


def test_grace_uses_the_schedule_table_not_a_hardcoded_map():
    assert touchpoint_for("midday")["time"] == "13:15"


# ── the jobs themselves ────────────────────────────────────────────────────────

class _FakeScheduler:
    def __init__(self):
        self.jobs = []

    def add_job(self, func, trigger, **kwargs):
        self.jobs.append({"func": func, "trigger": trigger, **kwargs})


def test_every_cron_job_is_coalesced_and_has_its_grace():
    scheduler = _FakeScheduler()
    main.arm_scheduler(object(), scheduler)

    assert len(scheduler.jobs) == len(TOUCHPOINTS)
    for job in scheduler.jobs:
        assert isinstance(job["trigger"], CronTrigger)
        assert job["coalesce"] is True
        assert job["misfire_grace_time"] == grace_seconds(job["name"]) > 0


def test_sending_jobs_go_through_the_once_wrapper():
    scheduler = _FakeScheduler()
    main.arm_scheduler(object(), scheduler)
    by_name = {job["name"]: job for job in scheduler.jobs}

    for tp_id in WEEKDAY_CHUNKS:
        assert by_name[tp_id]["func"].__name__ == f"once_{tp_id}"
    # refresh_in / refresh_out are still log-only, so they are not wrapped.
    assert by_name["refresh_in"]["func"].__name__ == "log_only"


def test_once_wrapper_sends_the_first_time_and_skips_after(data_dirs):
    calls = []

    async def handler(app):
        calls.append(app)

    wrapped = main._send_once("midday", handler)
    asyncio.run(wrapped("app"))
    asyncio.run(wrapped("app"))

    assert calls == ["app"]
    assert is_fired(datetime.now().strftime("%Y-%m-%d"), "midday")


def test_once_wrapper_does_not_mark_a_failed_send(data_dirs):
    async def handler(app):
        raise RuntimeError("Telegram unreachable")

    wrapped = main._send_once("midday", handler)
    try:
        asyncio.run(wrapped("app"))
    except RuntimeError:
        pass
    assert is_fired(datetime.now().strftime("%Y-%m-%d"), "midday") is False


def test_the_real_apscheduler_accepts_the_jobs():
    """The fake above proves what we pass; this proves APScheduler takes it.
    Only construction and add_job are exercised — the scheduler is never started
    and no network call happens."""
    from apscheduler.schedulers.asyncio import AsyncIOScheduler

    scheduler = AsyncIOScheduler(timezone=main.KL)
    main.arm_scheduler(object(), scheduler)

    jobs = scheduler.get_jobs()
    assert len(jobs) == len(TOUCHPOINTS)
    for job in jobs:
        assert job.coalesce is True
        assert job.misfire_grace_time == grace_seconds(job.name) > 0
        assert job.name in {tp["id"] for tp in TOUCHPOINTS}
