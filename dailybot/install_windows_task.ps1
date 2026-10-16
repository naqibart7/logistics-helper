<#
.SYNOPSIS
    Install (or remove) the Daily Bot v2 scheduled task on Naqib's Windows PC. (W5)

.DESCRIPTION
    Registers a task that runs dailybot\run_bot.bat at log on, so the bot comes
    back by itself after a reboot. Idempotent: running it twice leaves exactly
    one task. It prints what it did and the task's effective settings.

    You must be logged in for the bot to run. The screen may be locked, but the
    PC may not be at the sign-in screen or shut down.

    This file is deliberately ASCII-only: Windows PowerShell 5.1 reads .ps1
    files without a byte-order mark as ANSI, and a stray em dash then breaks the
    parser.

.PARAMETER TaskName
    Task name. Default "DailyBot". Also used by -Remove.

.PARAMETER BackupTaskName
    Name of the optional weekly backup task. Default "DailyBotBackup".

.PARAMETER Backup
    Also register the weekly backup task (Friday 18:00 -> backup_data.bat).

.PARAMETER BackupDir
    Folder the weekly backup writes into. Default: dailybot\backups.

.PARAMETER Remove
    Unregister the task(s) instead of creating them.

.EXAMPLE
    powershell -ExecutionPolicy Bypass -File install_windows_task.ps1
    powershell -ExecutionPolicy Bypass -File install_windows_task.ps1 -Backup
    powershell -ExecutionPolicy Bypass -File install_windows_task.ps1 -Remove

.NOTES
    Run it as the user who owns the bot (no administrator needed for your own
    logon task). If Windows refuses, open PowerShell as Administrator once and
    run the same command.
#>
[CmdletBinding()]
param(
    [string]$TaskName = "DailyBot",
    [string]$BackupTaskName = "DailyBotBackup",
    [switch]$Backup,
    [string]$BackupDir = "",
    [switch]$Remove
)

$ErrorActionPreference = "Stop"

$BotDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$Runner = Join-Path $BotDir "run_bot.bat"
$BackupScript = Join-Path $BotDir "backup_data.bat"
if (-not $BackupDir) { $BackupDir = Join-Path $BotDir "backups" }

$UserId = if ($env:USERDOMAIN) { "$env:USERDOMAIN\$env:USERNAME" } else { $env:USERNAME }

function Show-Task([string]$Name) {
    $task = Get-ScheduledTask -TaskName $Name -ErrorAction SilentlyContinue
    if (-not $task) { Write-Host "  (task '$Name' is not registered)"; return }
    Write-Host "  State          : $($task.State)"
    Write-Host "  Run as         : $($task.Principal.UserId) ($($task.Principal.LogonType), $($task.Principal.RunLevel))"
    foreach ($action in $task.Actions) { Write-Host "  Action         : $($action.Execute) $($action.Arguments)" }
    foreach ($trigger in $task.Triggers) { Write-Host "  Trigger        : $($trigger.CimClass.CimClassName) $($trigger.StartBoundary)" }
    Write-Host "  RestartCount   : $($task.Settings.RestartCount) every $($task.Settings.RestartInterval)"
    Write-Host "  TimeLimit      : '$($task.Settings.ExecutionTimeLimit)' (empty or PT0S = no limit)"
    Write-Host "  MultipleInst.  : $($task.Settings.MultipleInstances)"
    Write-Host "  On batteries   : may start = $($task.Settings.DisallowStartIfOnBatteries -eq $false), keeps running = $($task.Settings.StopIfGoingOnBatteries -eq $false)"
}

if ($Remove) {
    Write-Host "Removing scheduled task(s)..."
    $names = @($TaskName)
    if ($Backup) { $names += $BackupTaskName }
    foreach ($name in $names) {
        $registered = Get-ScheduledTask -TaskName $name -ErrorAction SilentlyContinue
        if ($registered) {
            Unregister-ScheduledTask -TaskName $name -Confirm:$false
            Write-Host "  Removed '$name'."
        } else {
            Write-Host "  '$name' was not registered - nothing to remove."
        }
    }
    Write-Host "Done. The bot will not restart by itself until you run this script again."
    return
}

if (-not (Test-Path $Runner)) { throw "Missing runner: $Runner" }

# -- the bot task --------------------------------------------------------------
Write-Host "Installing '$TaskName' for $UserId"
Write-Host "  Runner: $Runner"

$action = New-ScheduledTaskAction -Execute $Runner -WorkingDirectory $BotDir
$trigger = New-ScheduledTaskTrigger -AtLogOn -User $UserId
$settings = New-ScheduledTaskSettingsSet `
    -AllowStartIfOnBatteries `
    -DontStopIfGoingOnBatteries `
    -StartWhenAvailable `
    -MultipleInstances IgnoreNew `
    -ExecutionTimeLimit ([TimeSpan]::Zero) `
    -RestartCount 3 `
    -RestartInterval (New-TimeSpan -Minutes 1)
$principal = New-ScheduledTaskPrincipal -UserId $UserId -LogonType Interactive -RunLevel Limited

$existing = Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue
if ($existing) {
    Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false
    Write-Host "  Replaced the previous '$TaskName' (idempotent re-run)."
}

Register-ScheduledTask -TaskName $TaskName -Action $action -Trigger $trigger `
    -Settings $settings -Principal $principal `
    -Description "Daily Bot v2 - polls Telegram, no inbound port. One copy only (PID lock)." | Out-Null

Write-Host "  Registered. Settings as Windows stored them:"
Show-Task $TaskName
Write-Host "  Reminder: the task runs at log on, so you must be logged in (the screen may be locked)."

# -- the weekly backup task (optional) -----------------------------------------
if ($Backup) {
    if (-not (Test-Path $BackupScript)) { throw "Missing backup script: $BackupScript" }
    Write-Host ""
    Write-Host "Installing '$BackupTaskName' (Fridays 18:00 -> $BackupDir)"

    $backupAction = New-ScheduledTaskAction -Execute $BackupScript -Argument "`"$BackupDir`"" -WorkingDirectory $BotDir
    $backupTrigger = New-ScheduledTaskTrigger -Weekly -DaysOfWeek Friday -At 6pm
    $backupSettings = New-ScheduledTaskSettingsSet `
        -AllowStartIfOnBatteries `
        -DontStopIfGoingOnBatteries `
        -StartWhenAvailable `
        -MultipleInstances IgnoreNew `
        -ExecutionTimeLimit (New-TimeSpan -Hours 1)

    $existingBackup = Get-ScheduledTask -TaskName $BackupTaskName -ErrorAction SilentlyContinue
    if ($existingBackup) {
        Unregister-ScheduledTask -TaskName $BackupTaskName -Confirm:$false
        Write-Host "  Replaced the previous '$BackupTaskName' (idempotent re-run)."
    }

    Register-ScheduledTask -TaskName $BackupTaskName -Action $backupAction -Trigger $backupTrigger `
        -Settings $backupSettings -Principal $principal `
        -Description "Daily Bot v2 - weekly zip of data\ into $BackupDir (keeps the last 8)." | Out-Null

    Write-Host "  Registered. Settings as Windows stored them:"
    Show-Task $BackupTaskName
}
