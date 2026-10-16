# Handoff: Windows hardening (W1–W5) — Daily Bot v2 on Naqib's PC

**Status: DONE + proofs 2026-10-15 (101-test suite green; second copy refuses with
exit 2; stale lock cleared; self-test scheduled task registered with the required
settings and removed again).**

Source instruction: `TRAE_INSTRUCTION_BOT_ON_WINDOWS.md`. The first attempt at
this work produced only `run_bot.bat` and a codemod script that never applied —
see the correction note at the top of `TRAE_INSTRUCTION_REPORT.md`. Everything
below was rebuilt and proven.

## What I built

- **W1 runner + log hygiene**
  - `run_bot.bat` — runs from its own folder, creates `logs\`, prefers
    `.venv\Scripts\python.exe` and falls back to `python` on PATH, sets
    `PYTHONUTF8=1`, has **no `pause`**, appends to `logs\bot.log`, and exits with
    the bot's own code. ASCII-only, CRLF (see the note at the top of the file —
    a caret meeting a bare LF turned `dailybot_data_` into the command `aily`).
  - `bot/logsafe.py` — the token is rewritten out of **every** log record via
    `logging.setLogRecordFactory`. Two leak paths: httpx logs the request URL
    (closed by pinning `httpx`/`httpcore` to WARNING in `main.py`) and
    python-telegram-bot quotes the token in its own error text (only the record
    factory covers that one — a root-logger filter does *not* see records
    propagated from child loggers).
- **W2 one copy only** — `bot/lock.py`: `data/.bot.lock` holds a PID; a live PID
  refuses the second start (exit 2), a dead PID is cleared. `pid_alive` uses
  `OpenProcess`+`WaitForSingleObject`, never `os.kill(pid, 0)` (on Windows that
  would terminate the process). A polling **Conflict** is caught by
  `on_polling_error`, which logs one line and stops the loop via the documented
  `Application.stop_running()` — PTB 21.9 retries every `TelegramError` inside
  `Updater._network_loop_retry`, so a Conflict would otherwise loop forever.
  Exit 3.
- **W3a late wake** — `scheduler.grace_seconds()` and per-job
  `coalesce=True, misfire_grace_time=...`: midday 45 min, item_progress 45 min,
  both refreshes 45 min, late_afternoon 19 min, catch_up 9 min.
- **W3b cold start** — `data/fired.json` (date → touchpoints sent) plus
  `main.run_catchup()`, which replays each touchpoint that passed inside its
  grace window and is not recorded yet. Every sending job goes through
  `_send_once`, so the cron job and the catch-up cannot both send.
- **W4 heartbeat + /status** — one line "Bot started 08:02 on <PC>" throttled to
  once per 10 minutes (`data/heartbeat.json`); `/status` now shows running-since,
  the next three touchpoints and today's record.
- **W5 Windows install + backup** — `install_windows_task.ps1` (idempotent,
  `-Backup`, `-BackupDir`, `-Remove`, `-TaskName`), `backup_data.bat` (dated zip
  of `data\`, keeps the last 8, **excludes `data\.bot.lock`** via a staging copy
  so a restored lock cannot block a start), `RUN_ON_WINDOWS.md` (plain language).
- `bot/sim_coldstart.py` — the fast-forward proof for W3a/W3b/W4, no Telegram.

## How I proved it

- `python -m pytest -q` → **102 passed** (42 before, 60 new:
  test_runner_script 8, test_log_hygiene 7, test_lock_and_conflict 11,
  test_grace 10, test_catchup 14, test_heartbeat 10).
- `python -m bot.sim_coldstart` → all instruction scenarios, e.g. 13:40 → midday;
  second/third start → nothing; 13:20 → midday (inside grace); 14:01 → nothing;
  16:55 → catch_up only; 17:00 → item_progress only; Sunday → nothing.
- Real machine, real lock: with a holder process owning `data/.bot.lock`,
  `python -m bot.main` → **exit 2**, "Another instance is already running
  (PID: 22180). Exiting.", holder keeps its lock. After the holder died:
  "Stale lock cleared (PID 22180 is not running)" and the lock was removed on exit.
- Real machine, revoked token (`TELEGRAM_BOT_TOKEN` overridden with a fake):
  startup path reached polling, **exit 4**, and the fake token appeared **0
  times** in the output.
- `install_windows_task.ps1` self-test (task name `DailyBot_SelfTest`, then
  removed): logon trigger, `RestartCount 3 every PT1M`, `TimeLimit PT0S`,
  `MultipleInstances IgnoreNew`, allowed on battery, Interactive/Limited; a
  second run printed "Replaced the previous"; `-Remove` removed both tasks.
- `backup_data.bat` into a temp folder: zip written, 10 zips → 8 kept, `.bot.lock`
  not inside, staging folder cleaned up.

## Deliberate deviations from the instruction

1. **Grace is `gap - 1 minute`**, not the gap itself. With grace == gap a prompt
   waking exactly at the boundary would fire on the same minute as the next
   touchpoint, which the instruction forbids. Tests assert grace < gap.
2. **`data/heartbeat.json` added** alongside the specified `fired.json`, so the
   heartbeat throttle survives a restart. Both are gitignored.
3. **The runner prefers `.venv` but falls back to `python` on PATH** — no
   `dailybot/.venv` exists on this PC, and the instruction's literal
   `.venv\Scripts\python.exe` would have failed at the first log-on.
4. **Token redaction (`bot/logsafe.py`) added beyond W1's httpx/httpcore line**,
   because the end-to-end run found a second leak: PTB's `InvalidToken` message
   embedded the token in a logged traceback.
5. **`fix_logging.py` deleted** — it was committed as part of the first attempt,
   never applied its edit, and its presence implies the work was done.
6. **`-TaskName`/`-BackupTaskName` parameters added** so registration can be
   proven with a self-test task and then removed, rather than arming the real bot
   during verification.
7. `run_bot.bat` sets `PYTHONUTF8=1`: log messages use the house style's em
   dashes, which a cp1252 console would mangle in `logs\bot.log`.

## Open / not done

- **No live Telegram round-trip was performed.** The instruction forbids sending
  real messages without asking Naqib, and this PC's `.env` token belongs to a bot
  that may be polling elsewhere (the single-poller rule). Naqib's four items
  remain his: create the bot in @BotFather and press Start, fill `.env`, set
  power options / active hours, run the installer once.
- A live **Conflict** proof needs two pollers on one token; that is not something
  to stage on Naqib's token. Covered by a test against PTB's real retry loop.
- `data/fired.json` is pruned to 7 days; if a touchpoint's sender is added later
  (refresh_in/refresh_out), the catch-up replays it because log-only touchpoints
  are deliberately not marked fired.
