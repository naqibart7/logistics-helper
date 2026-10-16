@echo off
rem ============================================================================
rem  Daily Bot v2 - Windows runner (W1)
rem
rem  Run this by hand once to prove the bot works, then let the scheduled task
rem  (install_windows_task.ps1) run it at every log on.
rem
rem  - works from its own folder, so the task can start it from anywhere
rem  - appends to logs\bot.log (gitignored; the token never reaches it - see the
rem    httpx/httpcore levels in bot\main.py, proven by tests\test_log_hygiene.py)
rem  - uses dailybot\.venv when it exists, otherwise the python on PATH
rem  - exits with the bot's own exit code: 0 normal, 2 refused (another copy is
rem    running), 3 another poller owns the token, 4 Telegram rejected the token
rem  - no `pause`: a scheduled task must not sit waiting for a keypress
rem
rem  Note for maintainers: CRLF line endings, ASCII only, no caret line
rem  continuations - see the note in backup_data.bat for why.
rem ============================================================================
setlocal
cd /d "%~dp0"

if not exist "logs" mkdir "logs"

rem  Log messages are UTF-8 (the source uses em dashes). Without this, a Windows
rem  console code page of cp1252 mangles them in logs\bot.log.
set "PYTHONUTF8=1"

set "PY=%~dp0.venv\Scripts\python.exe"
if not exist "%PY%" set "PY=python"

echo [%DATE% %TIME%] --- starting Daily Bot v2 (%PY%) --- >> "logs\bot.log"
"%PY%" -m bot.main >> "logs\bot.log" 2>&1
set "RC=%ERRORLEVEL%"
echo [%DATE% %TIME%] --- bot exited with code %RC% --- >> "logs\bot.log"

endlocal & exit /b %RC%
