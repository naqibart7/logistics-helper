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
    (tmp_path / "items").mkdir()
    (tmp_path / "daily").mkdir()
    (tmp_path / "reports").mkdir()
    return tmp_path