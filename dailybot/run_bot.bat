@echo off
:: Daily Bot v2 Runner Script (Windows)
:: Sets working directory, runs the bot, and appends output to logs/bot.log

:: Set working directory to the bot's folder
cd /d "%~dp0"

:: Append output to log file (logs/ is gitignored)
echo %DATE% %TIME% Starting Daily Bot v2 >> logs\bot.log

:: Run the bot with Python, redirecting stdout/stderr to the log
:: Set httpx and httpcore loggers to WARNING to prevent token leakage in logs
python -m bot.main >> logs\bot.log 2>&1

:: After bot exits, silence the noisy HTTP client loggers (token leakage prevention)
for /f "tokens=*" %%L in ('python -c "import logging; logging.getLogger('httpx').setLevel(logging.WARNING); logging.getLogger('httpcore').setLevel(logging.WARNING); print('done')"') do echo %%L

echo Bot execution completed. Log appended to logs\bot.log
pause