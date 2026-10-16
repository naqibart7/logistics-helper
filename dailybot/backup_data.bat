@echo off
rem ============================================================================
rem  Daily Bot v2 - weekly data backup (W5)
rem
rem  Zips dailybot\data\ into a dated file and keeps the last 8.
rem
rem    backup_data.bat                  -> dailybot\backups\
rem    backup_data.bat "D:\BotBackups"  -> that folder
rem
rem  Install the Friday 18:00 task with:
rem    install_windows_task.ps1 -Backup -BackupDir "D:\BotBackups"
rem
rem  The bot's live lock file (data\.bot.lock) is deliberately NOT included: a
rem  restored stale lock would refuse to let the bot start. Everything else in
rem  data\ - answers, items, reports - is backed up.
rem
rem  Note for maintainers: this file uses CRLF line endings and no caret line
rem  continuations on purpose. cmd.exe escapes the first character of the next
rem  line when a caret meets a bare LF, which turned "dailybot_data_" into the
rem  command "aily" in an endless loop.
rem ============================================================================
setlocal
cd /d "%~dp0"

set "DEST=%~1"
if "%DEST%"=="" set "DEST=%~dp0backups"
if not exist "%DEST%" mkdir "%DEST%"

set "BOTDIR=%~dp0"

powershell -NoProfile -ExecutionPolicy Bypass -Command "$stamp = Get-Date -Format 'yyyy-MM-dd_HHmm'; $stage = Join-Path $env:TEMP ('dailybot_backup_' + $stamp); if (Test-Path $stage) { Remove-Item $stage -Recurse -Force }; Copy-Item -Path (Join-Path $env:BOTDIR 'data') -Destination $stage -Recurse -Force; Remove-Item -Path (Join-Path $stage '.bot.lock') -Force -ErrorAction SilentlyContinue; Get-ChildItem -Path $stage -Filter '*.tmp' -Recurse -Force | Remove-Item -Force -ErrorAction SilentlyContinue; $zip = Join-Path $env:DEST ('dailybot_data_' + $stamp + '.zip'); Compress-Archive -Path (Join-Path $stage '*') -DestinationPath $zip -Force; Remove-Item $stage -Recurse -Force; Write-Host ('Backed up ' + $zip + ' (lock file excluded)'); $old = Get-ChildItem -Path (Join-Path $env:DEST 'dailybot_data_*.zip') | Sort-Object LastWriteTime -Descending | Select-Object -Skip 8; if ($old) { $old | Remove-Item -Force; Write-Host ('Pruned ' + $old.Count + ' old backup(s); keeping the last 8.') } else { Write-Host 'Nothing to prune (8 or fewer backups).' }"

endlocal
