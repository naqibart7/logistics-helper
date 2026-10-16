"""
lock.py — one copy only (W2).

A Windows PC differs from a server in that someone can double-click the bot
twice. Two processes polling one Telegram token is an error (Telegram answers
the loser with a Conflict), so the bot takes a PID lock before it polls:

    data/.bot.lock   ->   {"pid": 1234, "startedAt": "2026-10-15T08:02:11+08:00"}

A lock whose PID is no longer alive is *stale* (the PC rebooted, or the process
was killed) and is cleared on start. The lock holds a PID rather than a
timestamp because a PID survives a reboot as a provable fact: the process is
either there or it is not.

`pid_alive` deliberately avoids `os.kill(pid, 0)`: on Windows os.kill with any
signal other than CTRL_C_EVENT / CTRL_BREAK_EVENT calls TerminateProcess, so
"is this PID alive?" would kill it. It opens the process with SYNCHRONIZE and
waits zero milliseconds instead.
"""

import ctypes
import json
import os
from datetime import datetime
from pathlib import Path

from bot import config

# Windows process-access rights / wait results.
_SYNCHRONIZE = 0x00100000
_WAIT_TIMEOUT = 0x00000102  # the process is still running
_ERROR_ACCESS_DENIED = 5


def lock_path(path=None):
    """The lock file (config.LOCK_FILE unless a caller overrides it)."""
    return Path(path or config.LOCK_FILE)


def pid_alive(pid):
    """True if a process with this PID exists and has not exited."""
    try:
        pid = int(pid)
    except (TypeError, ValueError):
        return False
    if pid <= 0:
        return False

    if os.name != "nt":
        try:
            os.kill(pid, 0)
        except ProcessLookupError:
            return False
        except PermissionError:
            return True  # exists, owned by someone else
        return True

    kernel32 = ctypes.windll.kernel32
    handle = kernel32.OpenProcess(_SYNCHRONIZE, False, pid)
    if not handle:
        # Access denied means the process exists but is not ours to open.
        return kernel32.GetLastError() == _ERROR_ACCESS_DENIED
    try:
        return kernel32.WaitForSingleObject(handle, 0) == _WAIT_TIMEOUT
    finally:
        kernel32.CloseHandle(handle)


def read_lock(path=None):
    """PID recorded in the lock file, or None if there is no readable lock."""
    path = lock_path(path)
    if not path.exists():
        return None
    try:
        with path.open("r", encoding="utf-8-sig") as f:
            data = json.load(f)
        return int(data["pid"])
    except (ValueError, KeyError, OSError):
        # A half-written or hand-edited lock is not worth arguing with: treat it
        # as stale so the bot can start.
        return None


def write_lock(path=None, pid=None):
    path = lock_path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    payload = {
        "pid": int(pid if pid is not None else os.getpid()),
        "startedAt": datetime.now().astimezone().isoformat(timespec="seconds"),
    }
    with path.open("w", encoding="utf-8") as f:
        json.dump(payload, f, indent=2)
    return path


def acquire_lock(path=None):
    """
    Take the single-copy lock.

    Returns (True, note) when this process may poll, and (False, message) when
    another live process already holds it.
    """
    path = lock_path(path)
    holder = read_lock(path)
    note = "Lock acquired."
    if holder is not None:
        if pid_alive(holder):
            return False, f"Another instance is already running (PID: {holder}). Exiting."
        note = f"Stale lock cleared (PID {holder} is not running). Lock acquired."
    write_lock(path)
    return True, note


def release_lock(path=None):
    """
    Drop the lock on a clean exit. Only removes a lock this process owns, so a
    second copy cannot delete the running copy's lock on its way out.
    """
    path = lock_path(path)
    if read_lock(path) == os.getpid():
        try:
            path.unlink()
        except OSError:
            pass
        return True
    return False
