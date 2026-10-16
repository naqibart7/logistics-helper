"""
sim_coldstart.py — the W3a/W3b/W4 proof, fast-forwarded. No Telegram, no real
data: it drives the same pure clock (bot/scheduler.py), the same send-once path
(bot/main.py) and the same state files (bot/state.py) with a fake app that
prints what it would have sent.

    python -m bot.sim_coldstart
"""

import asyncio
import shutil
import sys
import tempfile
from datetime import datetime
from pathlib import Path

from bot import config, main
from bot.scheduler import TOUCHPOINTS, catch_up_touchpoints, format_when, grace_seconds, next_touchpoints

# This is a console tool on Windows, where the default code page is cp1252 and
# the /status preview contains an emoji: write UTF-8 instead of crashing.
try:
    sys.stdout.reconfigure(encoding="utf-8")
except (AttributeError, OSError):  # pragma: no cover - non-reconfigurable stdout
    pass

MONDAY = datetime(2026, 9, 28)      # 2026-09-28 is a Monday
SUNDAY = datetime(2026, 10, 4)


class FakeBot:
    def __init__(self):
        self.lines = []

    async def send_message(self, chat_id=None, text=""):
        self.lines.append(text)


class FakeApp:
    def __init__(self):
        self.bot = FakeBot()


def _at(day, hour, minute=0):
    return day.replace(hour=hour, minute=minute)


def install_fake_handlers():
    """Each touchpoint's sender becomes a printer, keyed by the real schedule."""
    def make(tp_id):
        async def handler(app):
            app.bot.lines.append(f"WOULD SEND: {tp_id}")
        return handler

    main.CATCHUP_HANDLERS = {
        tp_id: make(tp_id)
        for tp_id in ("midday", "late_afternoon", "catch_up", "item_progress")
    }


def scenario(label, now, app, fresh=True):
    """fresh=True starts from no fired.json — i.e. a first-ever start that day."""
    if fresh and config.FIRED_FILE.exists():
        config.FIRED_FILE.unlink()
    sent = asyncio.run(main.run_catchup(app, now=now))
    print(f"  {label:<46} -> {', '.join(sent) if sent else '(nothing)'}")


def main_():
    workdir = Path(tempfile.mkdtemp(prefix="dailybot_sim_"))
    original = (config.FIRED_FILE, config.HEARTBEAT_FILE, config.LOCK_FILE)
    config.FIRED_FILE = workdir / "fired.json"
    config.HEARTBEAT_FILE = workdir / "heartbeat.json"
    config.LOCK_FILE = workdir / ".bot.lock"

    print("Daily Bot v2 — cold start / grace simulation (no Telegram, no real data)")
    print("=" * 74)

    print("\nW3a — grace per touchpoint: min(45 min, gap to the next touchpoint that day)")
    print("      (APScheduler's own default misfire grace is 1 second)")
    for tp in TOUCHPOINTS:
        days = "Mon-Fri" if tp["weekdays"] == (0, 1, 2, 3, 4) else (
            "Mon-Sat" if tp["weekdays"] == (0, 1, 2, 3, 4, 5) else
            ("Mon" if tp["weekdays"] == (0,) else "Fri"))
        print(f"      {tp['id']:<15} {tp['time']}  {days:<8} {grace_seconds(tp['id']) // 60:>3} min")

    install_fake_handlers()
    app = FakeApp()

    print("\nW3b — a PC that was off or asleep, Monday 2026-09-28 unless stated")
    scenario("start 13:40  (nothing recorded yet)", _at(MONDAY, 13, 40), app)
    scenario("start 13:40 again  (first restart)", _at(MONDAY, 13, 40), app, fresh=False)
    scenario("start 13:40 again  (second restart)", _at(MONDAY, 13, 40), app, fresh=False)
    scenario("start 13:20  (woke inside the 45 min grace)", _at(MONDAY, 13, 20), app)
    scenario("start 13:20 again  (same, after a restart)", _at(MONDAY, 13, 20), app, fresh=False)
    scenario("start 14:01  (1 min past the 45 min grace)", _at(MONDAY, 14, 1), app)
    scenario("start 16:55  (crowded hour: 16:30 dropped)", _at(MONDAY, 16, 55), app)
    scenario("start 17:00  (catch-up dropped, item progress due)", _at(MONDAY, 17, 0), app)
    scenario("start Sunday 14:00  (Sunday is silent)", _at(SUNDAY, 14, 0), app)
    scenario("start Monday 10:30  (refresh_in has no sender yet)", _at(MONDAY, 10, 30), app)

    print("\nW4 — /status preview (Monday 12:00, running since 08:02)")
    print("      " + main.status_text(now=_at(MONDAY, 12, 0), running_since=_at(MONDAY, 8, 2)).replace("\n", "\n      "))

    print("\nnext three touchpoints after Friday 2026-10-02 16:55 (crosses into Saturday):")
    for when, tp in next_touchpoints(datetime(2026, 10, 2, 16, 55), 3):
        print(f"      {format_when(when)} — {tp['label']}")

    print("\nfired.json after a fresh 13:40 start (what stops a second send):")
    if config.FIRED_FILE.exists():
        config.FIRED_FILE.unlink()
    asyncio.run(main.run_catchup(app, now=_at(MONDAY, 13, 40)))
    state = config.FIRED_FILE.read_text(encoding="utf-8") if config.FIRED_FILE.exists() else "(none)"
    print("      " + state.strip().replace("\n", " "))

    config.FIRED_FILE, config.HEARTBEAT_FILE, config.LOCK_FILE = original
    shutil.rmtree(workdir, ignore_errors=True)
    return 0


if __name__ == "__main__":
    sys.exit(main_())
