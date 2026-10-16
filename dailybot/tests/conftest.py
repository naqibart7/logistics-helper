"""Shared pytest fixtures — isolate any file-backed module onto tmp dirs."""

import sys
from pathlib import Path

import pytest

# Ensure dailybot/ is importable when running `pytest` (not `python -m pytest`).
ROOT = Path(__file__).resolve().parent.parent
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

import bot.config as config


@pytest.fixture
def data_dirs(tmp_path, monkeypatch):
    """Redirect data/ subdirs to a temp tree so tests never touch real data."""
    monkeypatch.setattr(config, "ITEMS_DIR", tmp_path / "items")
    monkeypatch.setattr(config, "DAILY_DIR", tmp_path / "daily")
    monkeypatch.setattr(config, "REPORTS_DIR", tmp_path / "reports")
    # Windows-hardening runtime state (W2/W3b/W4) must also stay out of the real
    # data/ folder: the lock would block, fired.json would suppress sends.
    monkeypatch.setattr(config, "LOCK_FILE", tmp_path / ".bot.lock")
    monkeypatch.setattr(config, "FIRED_FILE", tmp_path / "fired.json")
    monkeypatch.setattr(config, "HEARTBEAT_FILE", tmp_path / "heartbeat.json")
    (tmp_path / "items").mkdir()
    (tmp_path / "daily").mkdir()
    (tmp_path / "reports").mkdir()
    return tmp_path