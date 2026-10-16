# Running the Daily Bot on your Windows PC

*Written 15 Oct 2026. This is the interim home for the bot until the DigitalOcean
droplet exists. Plain language on purpose: none of it needs a developer.*

The bot is one Python program that talks to Telegram. It polls outward, so
nothing needs to be opened on your router, and it keeps its state in the
`dailybot\data\` folder. This PC differs from a server in three ways — it sleeps,
it reboots, and someone can start a second copy — and the bot now handles all
three.

---

## 1. Before the first run (once)

1. **Make a new bot** in Telegram: talk to **@BotFather**, send `/newbot`, follow
   the questions, and copy the token it gives you (looks like
   `123456789:AAE...`). Then **open your new bot's chat and press Start** — a bot
   cannot message you until you have.
2. **Stop any old bot.** One token can only be used by one program at a time. If
   the old Teleport / 6a bot is still running somewhere on this token, stop it
   first, or the two will fight and the loser exits with a "Conflict" message.
   (That is the bot protecting you, not a crash.)
3. **Put the token in `.env`** in the `dailybot` folder. Open it with Notepad and
   fill in:
   - `TELEGRAM_BOT_TOKEN=` the token from @BotFather
   - `NAQIB_CHAT_ID=` your own chat id (already there from earlier work; keep it)
   - `GROQ_API_KEY=` the key for the weekly report (already there; keep it)

   Never send this file to anyone and never commit it — it is already ignored by
   git.

## 2. Run it by hand once (do this before installing the task)

Double-click **`run_bot.bat`**, or in a terminal in the `dailybot` folder run
`run_bot.bat`. A black window appears and stays open while the bot runs.

- In Telegram, send **`/status`**. You should get the bot's name, the time it
  started, and the next three things it is going to ask you, then today's record.
  That reply proves the token, your chat id and the schedule are all right.
- Close the window (or press `Ctrl+C`) to stop it. The bot is not running while
  that window is closed.
- Everything it prints also goes into `dailybot\logs\bot.log` (newest at the
  bottom). The token never appears in that file.

If `/status` says nothing: the window will say what went wrong. "Invalid token"
means the `.env` token is wrong or was revoked — make a new one in @BotFather.
"Another instance is already running" means a copy is already going.

## 3. Install it so it comes back by itself

In the `dailybot` folder, right-click **`install_windows_task.ps1`** and choose
*Run with PowerShell*. If Windows refuses, open PowerShell and run:

```powershell
powershell -ExecutionPolicy Bypass -File install_windows_task.ps1 -Backup -BackupDir "D:\BotBackups"
```

- `-Backup` also adds the weekly backup (Friday 18:00). Leave it out if you do
  not want it. `-BackupDir` is where the zips go; the default is
  `dailybot\backups`.
- What it sets up: the bot starts **when you log on**, restarts itself if it
  crashes (3 tries, one minute apart), never gives up on a long-running task,
  allows itself on battery, and refuses to start a second copy.
- **You must be logged in** for the bot to run. The screen may be locked, but the
  PC must not be at the sign-in screen, asleep, or shut down.
- Run it again any time — it replaces the old task instead of adding a second.
- To undo everything: `powershell -ExecutionPolicy Bypass -File install_windows_task.ps1 -Remove`
  (add `-Backup` as well to remove the backup task).

## 4. Power settings (the part that makes it reliable)

Control Panel → Power Options:

- **Never sleep while plugged in** during working hours. A sleeping PC cannot ask
  you the 13:15 question. If it does sleep through one, the bot catches up on
  wake: it sends anything that was due in the last 45 minutes (and for the 16:30
  and 16:50 prompts, only if there is enough room before the next one). Longer
  gaps are skipped on purpose rather than piling up.
- **Closing the lid** should do nothing while plugged in.
- **Windows Update**: set *Active hours* to your working hours so a reboot does
  not land in the middle of the afternoon prompts.
- After a reboot, the bot comes back at logon by itself. `/status` tells you when
  it last started.

## 5. The weekly backup

`backup_data.bat` zips the `data\` folder — your answers, the item tracker, the
weekly reports — into a dated file and keeps the **last 8**. The bot's live lock
file is deliberately left out of the zip (a restored lock could refuse to start).

Run it by hand any time: double-click `backup_data.bat`, or
`backup_data.bat "D:\BotBackups"` for a specific folder.

## 6. Day-to-day

- **Is it alive?** Send `/status`. It shows "Running since".
- **It went quiet.** Check `dailybot\logs\bot.log` (bottom). Then check the
  scheduled task: Start → "Task Scheduler" → Task Scheduler Library → `DailyBot`
  → *Last Run Result*. Also check you are logged in.
- **It says "Conflict".** Another program is polling the same token. Stop it, and
  only one copy will keep running.
- **It says "Invalid token".** Make a new bot in @BotFather and update `.env`.

## 7. Later: move it to the DigitalOcean droplet

`DEPLOY.md` has the server steps. The move is one copy operation:

1. Stop the PC bot first (uninstall the task, close the window) — one token, one
   process.
2. Copy the whole `dailybot\data\` folder and the `.env` file to the droplet.
   Nothing else in the bot is machine-specific.
3. Delete `data\.bot.lock` on the droplet if it was copied; a stale lock is
   cleared automatically, but there is no reason to carry it over.
4. `logs\` is not needed on the server; start the bot there and check `/status`.
