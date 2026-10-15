# Instruction for Trae — Run Daily Bot v2 on Naqib's Windows PC (14 Oct 2026)
### Interim home for the bot until the DigitalOcean droplet exists. Independent of the other two instruction files.

## Context
The bot is one Python process (`python -m bot.main`): APScheduler 3.10.4 with KL-timezone crons,
polling Telegram (no inbound port), state in `dailybot/data/` (`daily/`, `items/`, `reports/`).
It already ran on this PC for the Slice 2 live test. A PC differs from a server in three ways:
it sleeps, it reboots, and someone may start a second copy. This work makes the bot survive
those. The `data/` layout and the Docker files must stay unchanged so a later move to the
droplet is a copy of `data/` and `.env`.

## Ground rules
- Prove it by running it. Paste real output.
- Never weaken an assertion or widen a timeout to pass a test without saying so.
- Do not change prompts, topics, touchpoint times, the JS-weekday rule, or "Sunday is silent".
- Do not touch the Material-Logi web app files.
- The token must never reach a log file, the terminal output or git.
- Tests use fakes. Do not send real Telegram messages without telling Naqib first.

## Tasks

**W1. Runner script and log hygiene.**
- `dailybot/run_bot.bat`: set the working directory to its own folder, run
  `.venv\Scripts\python.exe -m bot.main`, append output to `logs\bot.log`. `logs/` is gitignored.
- The log notes say token-bearing logs had to be deleted. That suggests the HTTP client logs
  request URLs, which contain the token. Set the `httpx` and `httpcore` loggers to WARNING and
  confirm it.
- **Test:** capture log output at INFO during a fake polling cycle and assert the token string
  never appears.

**W2. One copy only.**
- On start, write `data/.bot.lock` containing the PID. If the lock exists and that PID is alive,
  print a clear message and exit. A stale lock (dead PID) is cleared. Remove the lock on a clean
  exit.
- If Telegram answers with a Conflict error (another poller on this token), log one clear line
  and exit. Do not retry in a loop.
- **Test:** a second start refuses; a stale lock is cleared; a Conflict error exits once.

**W3. Late wake and cold start.** APScheduler's default misfire grace is 1 second (check the job
defaults in `bot/main.py`), so a prompt due while the PC sleeps is skipped.
- **W3a, sleep then wake:** give each touchpoint job `coalesce=True` and a misfire grace of
  the smaller of 45 minutes and the gap to the next touchpoint that day. A late prompt must never
  land on top of the next one. The Mon 10:00 and Fri 15:00 refreshes get 45 minutes.
- **W3b, PC was off, boots late:** keep `data/fired.json` (date → touchpoints already sent),
  written each time a touchpoint is sent. On start, use `due_touchpoints(now)` to find today's
  touchpoints that passed within their grace window and are not marked fired, and send each
  once.
- **Test, using the existing fast-forward sim:** start at 13:40 with no marker → the 13:15
  prompt fires once; start at 18:00 → nothing fires; two restarts in a row → no duplicates; a
  Sunday start → nothing; a simulated sleep that wakes inside the grace window → fires late once.

**W4. Heartbeat.** On start, send Naqib one line: "Bot started 08:02 on <computer name>". Send
it at most once per 10 minutes, so a restart loop cannot spam him. `/status` shows the running-since
time and the next three touchpoints. **Test:** the throttle holds across three rapid starts.

**W5. Windows install and backup.**
- `dailybot/install_windows_task.ps1`, idempotent, prints what it did: registers a scheduled
  task that runs `run_bot.bat` at log on, with restart on failure every 1 minute (3 tries), run
  only if no instance is already running (`-MultipleInstances IgnoreNew`), no time limit, and
  allowed on battery. Add `-Remove` to undo it. State plainly that the user must be logged in
  (the screen can be locked).
- `dailybot/backup_data.bat`: zip `data\` into a dated file in a folder Naqib chooses, keeping the
  last 8. Add an optional second task, Friday 18:00.
- `dailybot/RUN_ON_WINDOWS.md`, plain language: new BotFather token and pressing Start, stop any
  old bot (one token = one process), fill `.env`, run once by hand and send `/status`, run the
  installer, power settings (never sleep while plugged in during working hours, lid close does
  nothing, Windows Update active hours), the weekly backup, and the later move to DigitalOcean
  (stop the PC bot first, copy `data/` and `.env`). Keep `DEPLOY.md` for the droplet.

## Order of work
W1 → W2 → W3a → W3b → W4 → W5. Every task ships its tests. The existing 42 pytest tests must
still pass.

## Do not
- Switch to webhooks or open an inbound port.
- Change the `data/` layout or the Docker files.
- Add a feature that sends anything beyond the heartbeat line.
- Mark a task done without pasted proof.

## Report back with
1. Table: task → done / partial / not done → evidence.
2. `pytest` output with the new test count.
3. Proof on the real machine: the registered task's settings (`Get-ScheduledTask` output), the
   bot restarting within a minute after you kill it, a second copy refusing to start, and the
   heartbeat arriving.
4. Every deviation from this file, and every question left unguessed.

## Naqib does these himself (no agent can)
- Create the new bot in @BotFather and press Start on it.
- Fill in `.env`.
- Set the power options and Windows Update active hours.
- Run `install_windows_task.ps1` once.
