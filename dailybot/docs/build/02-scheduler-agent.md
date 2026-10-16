# Handoff: Agent 2 — Scheduler (Slice 1)

## What I built
- `bot/__init__.py` — empty package marker (`.gitkeep` removed; package is real now)
- `bot/config.py` — `TIMEZONE = "Asia/Kuala_Lumpur"` + `DATA_DIR` family of paths. Nothing else.
- `bot/scheduler.py` — `TOUCHPOINTS` data table (id, label, HH:MM, weekdays) + two pure functions:
  `due_touchpoints(now)` (returns ids due at this minute, schedule order) and
  `label_for(id)` (printable name). Malformed schedule times raise loudly.
  **No Telegram, no conversation logic, no message text.**
- `bot/sim_scheduler.py` — the proof harness: fast-forwards Mon 2026-09-28 00:00 → Sun 2026-10-04 23:59
  minute-by-minute (10,080 minutes) and prints every firing line.

## How I proved it works
`python -m bot.sim_scheduler` (from `dailybot/`) — actual output:

```
Mon 2026-09-28 10:00 — PROJECT REFRESH (IN) WOULD FIRE NOW
Mon 2026-09-28 13:15 — MIDDAY CHUNK WOULD FIRE NOW
Mon 2026-09-28 16:30 — LATE-AFTERNOON CHUNK WOULD FIRE NOW
Mon 2026-09-28 16:50 — CATCH-UP PING WOULD FIRE NOW
Mon 2026-09-28 17:00 — ITEM PROGRESS + DELIVERY ACTIVITY WOULD FIRE NOW
Tue 2026-09-29 13:15 — MIDDAY CHUNK WOULD FIRE NOW
Tue 2026-09-29 16:30 — LATE-AFTERNOON CHUNK WOULD FIRE NOW
Tue 2026-09-29 16:50 — CATCH-UP PING WOULD FIRE NOW
Tue 2026-09-29 17:00 — ITEM PROGRESS + DELIVERY ACTIVITY WOULD FIRE NOW
Wed 2026-09-30 13:15 — MIDDAY CHUNK WOULD FIRE NOW
Wed 2026-09-30 16:30 — LATE-AFTERNOON CHUNK WOULD FIRE NOW
Wed 2026-09-30 16:50 — CATCH-UP PING WOULD FIRE NOW
Wed 2026-09-30 17:00 — ITEM PROGRESS + DELIVERY ACTIVITY WOULD FIRE NOW
Thu 2026-10-01 13:15 — MIDDAY CHUNK WOULD FIRE NOW
Thu 2026-10-01 16:30 — LATE-AFTERNOON CHUNK WOULD FIRE NOW
Thu 2026-10-01 16:50 — CATCH-UP PING WOULD FIRE NOW
Thu 2026-10-01 17:00 — ITEM PROGRESS + DELIVERY ACTIVITY WOULD FIRE NOW
Fri 2026-10-02 13:15 — MIDDAY CHUNK WOULD FIRE NOW
Fri 2026-10-02 15:00 — PROJECT REFRESH (OUT) WOULD FIRE NOW
Fri 2026-10-02 16:30 — LATE-AFTERNOON CHUNK WOULD FIRE NOW
Fri 2026-10-02 16:50 — CATCH-UP PING WOULD FIRE NOW
Fri 2026-10-02 17:00 — ITEM PROGRESS + DELIVERY ACTIVITY WOULD FIRE NOW
Sat 2026-10-03 13:15 — MIDDAY CHUNK WOULD FIRE NOW
Sat 2026-10-03 16:30 — LATE-AFTERNOON CHUNK WOULD FIRE NOW
Sat 2026-10-03 16:50 — CATCH-UP PING WOULD FIRE NOW
Sat 2026-10-03 17:00 — ITEM PROGRESS + DELIVERY ACTIVITY WOULD FIRE NOW

Total firing events in one simulated week: 26 (expected 26)
```

All five touchpoint kinds fire at their Architecture Section 3 times, in order,
Mon–Sat; Sunday is silent; 26 events/week = 6×4 chunks + Mon refresh-in + Fri refresh-out.

## What I deliberately didn't touch
- No APScheduler / no real clock subscription — that's Slice 2's wiring job.
- No Telegram client, no questions, no message text.
- `data/` untouched (read-only for the scheduler layer).
- topics.json NOT read here — weekday/topic rules for conversations are Slice 3's.

## Open questions for the next agent
1. **Mon–Sat assumption stands** (from Slice 0) — needs Naqib's yes before live deploy; the sim output above is exactly what he should approve.
2. Slice 2 must feed **KL wall-clock** datetimes into `due_touchpoints()` (APScheduler `TimeZone("Asia/Kuala_Lumpur")`); the math itself is tz-agnostic by design.
3. `TOUCHPOINTS` is the single source of the schedule — Slice 2 must subscribe through `due_touchpoints`, never duplicate the times.
