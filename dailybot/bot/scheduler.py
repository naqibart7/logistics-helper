"""
scheduler.py — the touchpoint clock. One job: answer "what fires at this moment?"

No Telegram. No conversation logic. No message text (labels only). Pure and
clock-injectable: callers pass a KL datetime; the sim (and later tests)
fast-forwards a clock through due_touchpoints() to prove the timing.

Windows hardening (W3a/W3b) adds two more questions to the same clock, both
still pure:
    grace_seconds(id)        how late this touchpoint may still fire
    catch_up_touchpoints(now)  what a PC that was asleep/off should send on boot
    next_touchpoints(now, n)   what /status shows Naqib

Schedule (Architecture Section 3). Weekdays use Python convention: 0=Mon .. 6=Sun.
Chunk days default Mon-Sat (flagged for Naqib in the Slice 0 handoff — Sunday is
the only open assumption). "~16:50", "~10:00", "~15:00" pinned per the handoff.
"""

from datetime import datetime, timedelta

# KL times, schedule-table order. Each entry: id, printable label, HH:MM, weekdays.
TOUCHPOINTS = [
    {"id": "midday",         "label": "MIDDAY CHUNK",                      "time": "13:15", "weekdays": (0, 1, 2, 3, 4, 5)},
    {"id": "late_afternoon", "label": "LATE-AFTERNOON CHUNK",              "time": "16:30", "weekdays": (0, 1, 2, 3, 4, 5)},
    {"id": "catch_up",       "label": "CATCH-UP PING",                     "time": "16:50", "weekdays": (0, 1, 2, 3, 4, 5)},
    {"id": "item_progress",  "label": "ITEM PROGRESS + DELIVERY ACTIVITY",  "time": "17:00", "weekdays": (0, 1, 2, 3, 4, 5)},
    {"id": "refresh_in",     "label": "PROJECT REFRESH (IN)",               "time": "10:00", "weekdays": (0,)},
    {"id": "refresh_out",    "label": "PROJECT REFRESH (OUT)",               "time": "15:00", "weekdays": (4,)},
]

# APScheduler's own default misfire grace is 1 second: a prompt due while the PC
# slept was dropped. W3a caps the replacement at this many minutes.
MAX_GRACE_MINUTES = 45


def _parse_hhmm(text):
    """'13:15' becomes (13, 15). Raises on malformed input — schedule typos must be loud."""
    parts = text.split(":")
    if len(parts) != 2:
        raise ValueError(f"Bad touchpoint time: {text!r} (expected HH:MM)")
    hour, minute = int(parts[0]), int(parts[1])
    if not (0 <= hour <= 23 and 0 <= minute <= 59):
        raise ValueError(f"Bad touchpoint time: {text!r} (out of range)")
    return hour, minute


def due_touchpoints(now):
    """
    Return the touchpoint ids due at this KL datetime's minute, in schedule order.
    A touchpoint fires when (hour, minute) matches AND today is one of its weekdays.
    Passing `now` in any tz is the caller's choice — the math is tz-agnostic; the
    deploy layer is responsible for feeding KL wall-clock time.
    """
    fired = []
    for tp in TOUCHPOINTS:
        hour, minute = _parse_hhmm(tp["time"])
        if now.weekday() in tp["weekdays"] and (now.hour, now.minute) == (hour, minute):
            fired.append(tp["id"])
    return fired


def label_for(touchpoint_id):
    """Printable label for a touchpoint id (sim + logs)."""
    for tp in TOUCHPOINTS:
        if tp["id"] == touchpoint_id:
            return tp["label"]
    raise ValueError(f"Unknown touchpoint id: {touchpoint_id!r}")


def touchpoint_for(touchpoint_id):
    """The schedule row for an id."""
    for tp in TOUCHPOINTS:
        if tp["id"] == touchpoint_id:
            return tp
    raise ValueError(f"Unknown touchpoint id: {touchpoint_id!r}")


def _minutes_since_midnight(text):
    hour, minute = _parse_hhmm(text)
    return hour * 60 + minute


def grace_seconds(touchpoint_id):
    """
    How late (W3a) this touchpoint may still run after its scheduled minute.

    The rule from the instruction: the smaller of 45 minutes and the gap to the
    next touchpoint that day. One minute is taken off the gap so a late prompt
    cannot land on the same minute as the next one — the point of the rule. The
    Mon 10:00 and Fri 15:00 refreshes have no same-day neighbour inside 45
    minutes, so they get the full 45.
    """
    tp = touchpoint_for(touchpoint_id)
    scheduled = _minutes_since_midnight(tp["time"])
    grace_minutes = MAX_GRACE_MINUTES
    for day in tp["weekdays"]:
        later = [
            _minutes_since_midnight(other["time"]) - scheduled
            for other in TOUCHPOINTS
            if other is not tp
            and day in other["weekdays"]
            and _minutes_since_midnight(other["time"]) > scheduled
        ]
        if later:
            grace_minutes = min(grace_minutes, min(later) - 1)
    return max(0, grace_minutes) * 60


def catch_up_touchpoints(now):
    """
    What a cold start owes Naqib (W3b): today's touchpoints whose minute has
    already passed but which are still inside their grace window, in schedule
    order. The caller drops the ones already in fired.json before sending.
    """
    due = []
    for tp in TOUCHPOINTS:
        if now.weekday() not in tp["weekdays"]:
            continue
        hour, minute = _parse_hhmm(tp["time"])
        scheduled = now.replace(hour=hour, minute=minute, second=0, microsecond=0)
        late_seconds = (now - scheduled).total_seconds()
        if 0 <= late_seconds <= grace_seconds(tp["id"]):
            due.append(tp["id"])
    return due


def next_touchpoints(now, count=3):
    """
    The next `count` firings strictly after `now`, as (datetime, schedule row)
    pairs — what /status shows so Naqib can see the bot is armed for the right
    times. Nine days are scanned because a refresh can be a week away.
    """
    candidates = []
    for day_offset in range(0, 9):
        day = now + timedelta(days=day_offset)
        for tp in TOUCHPOINTS:
            if day.weekday() not in tp["weekdays"]:
                continue
            hour, minute = _parse_hhmm(tp["time"])
            when = day.replace(hour=hour, minute=minute, second=0, microsecond=0)
            if when > now:
                candidates.append((when, tp))
    candidates.sort(key=lambda pair: pair[0])
    return candidates[:count]


def format_when(when):
    """'Mon 28 Sep 13:15' — KL datetime for /status and logs."""
    return when.strftime("%a %d %b %H:%M")
