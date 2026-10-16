"""
W1 — the runner script's contract, asserted instead of eyeballed.

run_bot.bat is one of the deliverables, so its required properties are checked
here: it works from its own folder, creates the log folder it writes into, keeps
the log out of git, uses a project .venv when there is one, forces UTF-8 so the
log cannot be mangled by the console code page, never blocks a scheduled task on
a keypress, and passes the bot's exit code on.
"""

import re
from pathlib import Path

import pytest

BOT_DIR = Path(__file__).resolve().parent.parent
RUNNER = BOT_DIR / "run_bot.bat"


@pytest.fixture(scope="module")
def runner_text():
    return RUNNER.read_bytes().decode("ascii")


def test_runner_exists_and_is_ascii_with_crlf_endings():
    raw = RUNNER.read_bytes()
    assert raw
    # ASCII-only keeps cmd.exe's code page out of the picture; CRLF is what cmd
    # expects (a caret meeting a bare LF once turned "dailybot_data_" into the
    # command "aily" in an endless loop).
    assert all(byte < 128 for byte in raw)
    assert raw.count(b"\r\n") > 5
    assert re.search(rb"(?<!\r)\n", raw) is None


def test_runner_works_from_its_own_folder(runner_text):
    assert re.search(r"cd /d \"%~dp0\"", runner_text, re.IGNORECASE)


def test_runner_creates_and_appends_to_the_log(runner_text):
    assert re.search(r"if not exist \"logs\" mkdir \"logs\"", runner_text, re.IGNORECASE)
    assert runner_text.count(">> \"logs\\bot.log\"") == 3  # start line, bot output, exit line


def test_runner_prefers_the_project_venv(runner_text):
    assert 'set "PY=%~dp0.venv\\Scripts\\python.exe"' in runner_text
    assert re.search(r"if not exist \"%PY%\" set \"PY=python\"", runner_text, re.IGNORECASE)
    assert "\"%PY%\" -m bot.main" in runner_text


def test_runner_forces_utf8_logs(runner_text):
    assert 'set "PYTHONUTF8=1"' in runner_text


def test_runner_never_pauses(runner_text):
    """A scheduled task that waits for a keypress never finishes."""
    assert not re.search(r"^\s*pause\b", runner_text, re.IGNORECASE | re.MULTILINE)


def test_runner_propagates_the_bot_exit_code(runner_text):
    assert 'set "RC=%ERRORLEVEL%"' in runner_text
    assert "exit /b %RC%" in runner_text


def test_logs_folder_is_gitignored():
    ignore = (BOT_DIR / ".gitignore").read_text(encoding="utf-8")
    lines = {line.strip() for line in ignore.splitlines()}
    assert "logs/" in lines
    assert "logs_*.txt" in lines
    # The runtime state the new code writes must stay out of git too.
    assert {"data/.bot.lock", "data/fired.json", "data/heartbeat.json"} <= lines
