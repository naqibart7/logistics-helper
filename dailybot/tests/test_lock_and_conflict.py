"""
W2 — one copy only: the PID lock, the stale-lock rule, and the Conflict exit.

"Exits once" is proven against Updater._network_loop_retry's actual loop
condition (`while self.running`) rather than a stand-in: the fake below repeats
the poll call for as long as the application says it is running, exactly as
python-telegram-bot 21.9 does, so an unhandled Conflict would show up as many
iterations instead of one.
"""

import asyncio
import logging
import os
import subprocess
import sys

import pytest
from telegram.error import Conflict, InvalidToken

from bot import lock
from bot import main

DEVNULL = subprocess.DEVNULL


def _finished_process():
    """A PID that is certainly no longer alive."""
    process = subprocess.Popen([sys.executable, "-c", "pass"], stdout=DEVNULL, stderr=DEVNULL)
    process.wait()
    return process.pid


# ── the lock ───────────────────────────────────────────────────────────────────

def test_lock_path_defaults_to_the_configured_file(data_dirs):
    assert lock.lock_path() == data_dirs / ".bot.lock"


def test_first_copy_takes_the_lock(data_dirs):
    allowed, message = lock.acquire_lock()
    assert allowed is True
    assert lock.read_lock() == os.getpid()
    assert "Lock acquired" in message


def test_second_copy_refuses_while_the_first_is_alive(data_dirs):
    assert lock.acquire_lock()[0] is True
    allowed, message = lock.acquire_lock()
    assert allowed is False
    assert f"PID: {os.getpid()}" in message
    assert "already running" in message
    assert lock.read_lock() == os.getpid()  # the running copy keeps its lock


def test_stale_lock_is_cleared(data_dirs):
    dead = _finished_process()
    lock.write_lock(pid=dead)
    assert lock.pid_alive(dead) is False

    allowed, message = lock.acquire_lock()
    assert allowed is True
    assert "Stale lock cleared" in message
    assert f"PID {dead}" in message
    assert lock.read_lock() == os.getpid()


def test_release_removes_only_our_own_lock(data_dirs):
    lock.acquire_lock()
    assert lock.release_lock() is True
    assert lock.lock_path().exists() is False
    assert lock.release_lock() is False  # idempotent

    dead = _finished_process()
    lock.write_lock(pid=dead)
    assert lock.release_lock() is False  # not ours
    assert lock.read_lock() == dead


def test_unreadable_lock_is_treated_as_stale(data_dirs):
    lock.lock_path().write_text("{ not json", encoding="utf-8")
    assert lock.read_lock() is None
    assert lock.acquire_lock()[0] is True


def test_impossible_pids_are_not_alive():
    assert lock.pid_alive(0) is False
    assert lock.pid_alive(-1) is False
    assert lock.pid_alive(None) is False
    assert lock.pid_alive("not-a-pid") is False


# ── the Conflict exit ──────────────────────────────────────────────────────────

class _FakeApplication:
    """Stands in for the PTB Application passed to the error handler."""

    def __init__(self):
        self.stop_calls = 0

    def stop_running(self):
        self.stop_calls += 1


class _FakeContext:
    def __init__(self, error, application):
        self.error = error
        self.application = application


class _FakePollingApp:
    """Mimics Updater._network_loop_retry: retry for as long as we are running."""

    def __init__(self, error):
        self.running = True
        self.iterations = 0
        self.stop_calls = 0
        self._error = error

    def stop_running(self):
        self.running = False
        self.stop_calls += 1

    def run_polling(self):
        while self.running:
            self.iterations += 1
            context = _FakeContext(self._error, self)
            asyncio.run(main.on_polling_error(None, context))


@pytest.fixture
def clean_conflict_state(data_dirs, monkeypatch):
    monkeypatch.setitem(main.POLLING_STATE, "conflict", False)
    yield


def test_conflict_logs_one_line_and_exits_once(clean_conflict_state, caplog):
    app = _FakePollingApp(Conflict("Conflict: terminated by other getUpdates request"))
    with caplog.at_level(logging.ERROR, logger="dailybot"):
        exit_code = main.run_bot(app)

    assert app.iterations == 1, "a Conflict must not be retried"
    assert app.stop_calls == 1
    assert exit_code == main.CONFLICT_EXIT_CODE
    errors = [record for record in caplog.records if record.levelno == logging.ERROR]
    assert len(errors) == 1
    assert "another poller on this token detected" in errors[0].getMessage()


def test_run_bot_returns_zero_after_a_clean_shutdown(clean_conflict_state):
    app = _FakePollingApp(Conflict("never raised"))
    app.running = False  # returns without any polling error
    assert main.run_bot(app) == 0


def test_bad_token_exits_with_its_own_code(clean_conflict_state, caplog):
    """A revoked/wrong token must not look like a crash, and must not spin."""
    class BadTokenApp:
        def __init__(self):
            self.calls = 0

        def run_polling(self):
            self.calls += 1
            raise InvalidToken("The token `123:secret` was rejected by the server.")

        def stop_running(self):
            pass

    app = BadTokenApp()
    with caplog.at_level(logging.ERROR, logger="dailybot"):
        exit_code = main.run_bot(app)

    assert app.calls == 1
    assert exit_code == main.TOKEN_EXIT_CODE
    errors = [record.getMessage() for record in caplog.records if record.levelno == logging.ERROR]
    assert len(errors) == 1
    assert "rejected the token in .env" in errors[0]
    assert "secret" not in errors[0]


def test_ordinary_polling_errors_keep_retrying(clean_conflict_state, caplog):
    """Network blips must NOT exit the bot — only Conflict does."""
    app = _FakeApplication()
    context = _FakeContext(TimeoutError("read timed out"), app)

    with caplog.at_level(logging.WARNING, logger="dailybot"):
        asyncio.run(main.on_polling_error(None, context))
        asyncio.run(main.on_polling_error(None, context))

    assert main.POLLING_STATE["conflict"] is False
    assert app.stop_calls == 0
    assert len([r for r in caplog.records if "retrying" in r.getMessage()]) == 2
