"""
config.py — paths, timezone, LLM config. Data-first: the schedule itself lives
in scheduler.py's TOUCHPOINTS table where it can be read as data.

LLM config (Slice 5) is ported from Teleport's config: a small provider-preset
table with .env overrides. `load_dotenv()` runs at import so `python -m bot.main`
from dailybot/ picks up dailybot/.env before the LLM constants are read.
"""
import os
from pathlib import Path

from dotenv import load_dotenv

load_dotenv()

TIMEZONE = "Asia/Kuala_Lumpur"  # KL = UTC+8, no DST — fixed offset all year

# dailybot/data/ — topics, projects, items, daily, reports all live under here.
DATA_DIR = Path(__file__).resolve().parent.parent / "data"
TOPICS_FILE = DATA_DIR / "topics.json"
PROJECTS_FILE = DATA_DIR / "projects.json"
ITEMS_DIR = DATA_DIR / "items"
DAILY_DIR = DATA_DIR / "daily"
REPORTS_DIR = DATA_DIR / "reports"

# ── LLM (weekly compile, Slice 5) ──────────────────────────────────────────────
# Provider presets — override with LLM_BASE_URL / LLM_MODEL / LLM_API_KEY.
# Default groq model `openai/gpt-oss-120b` carried from Teleport (llama-3.3-70b
# was silently retired — 404 — so this is the surviving default).
_LLM_PRESETS = {
    "groq": {
        "base_url": "https://api.groq.com/openai/v1",
        "model": "openai/gpt-oss-120b",
        "key_env": "GROQ_API_KEY",
    },
    "openrouter": {
        "base_url": "https://openrouter.ai/api/v1",
        "model": "meta-llama/llama-3.3-70b-instruct:free",
        "key_env": "OPENROUTER_API_KEY",
    },
    "ollama": {
        "base_url": "http://localhost:11434/v1",
        "model": "llama3.1:8b",
        "key_env": "",
    },
}

LLM_PROVIDER = os.getenv("LLM_PROVIDER", "groq").strip().lower()
if LLM_PROVIDER not in _LLM_PRESETS:
    raise RuntimeError(
        f"Unknown LLM_PROVIDER={LLM_PROVIDER!r}. Choose one of: {sorted(_LLM_PRESETS)}"
    )
_preset = _LLM_PRESETS[LLM_PROVIDER]

LLM_BASE_URL = os.getenv("LLM_BASE_URL", _preset["base_url"])
LLM_MODEL = os.getenv("LLM_MODEL", _preset["model"])


def llm_api_key():
    """Resolve the LLM key lazily (so main.py's manual .env load also works)."""
    for candidate in ("LLM_API_KEY", _preset["key_env"], "GROQ_API_KEY"):
        if candidate and os.getenv(candidate):
            return os.getenv(candidate)
    if LLM_PROVIDER == "ollama":
        return "ollama"  # local server needs no real key
    needed = _preset["key_env"] or "LLM_API_KEY"
    raise RuntimeError(f"Missing {needed} for LLM_PROVIDER={LLM_PROVIDER}")


MIN_DAYS_FOR_REPORT = int(os.getenv("MIN_DAYS_FOR_REPORT", "3"))
