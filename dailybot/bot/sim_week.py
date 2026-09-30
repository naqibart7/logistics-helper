"""
sim_week.py — Slice 6 integration proof: drive a full simulated working week
through the conversation + item + store layers (no Telegram), then compile the
weekly `.docx`.

For each Mon–Sat day (2026-09-28 … 2026-10-03):
  - midday + late-afternoon chunks: answer each applicable topic via record_answer
  - 5pm item progress: apply a status transition to the one tracked project
  - Mon/Fri project refresh: write the active-project list to projects.json
At the end: compile_week() -> the weekly report .docx into data/reports/.

Run from dailybot/:  python -m bot.sim_week
(Writes under data/ which is gitignored; the .docx is the proof artifact.)
"""

import asyncio
import tempfile
from datetime import date
from pathlib import Path

from bot import config
from bot.chunks import CHUNKS
from bot.topics import load_topics
from bot.conversation import pending_for_chunk
from bot.store import load_daily, save_daily, record_answer, now_kl_time
from bot.items import load_items, save_items, apply_item_changes
from bot.weekly import compile_week
from bot.report.utils import last_n_working_days


def redirect_to_temp():
    """Point all data paths at a fresh temp tree so the sim never touches real data."""
    root = Path(tempfile.mkdtemp(prefix="dailybot_sim_"))
    for name in ("daily", "items", "reports"):
        (root / name).mkdir()
    config.DAILY_DIR = root / "daily"
    config.ITEMS_DIR = root / "items"
    config.REPORTS_DIR = root / "reports"
    config.PROJECTS_FILE = root / "projects.json"
    return root


def _working_days(reference: date) -> list[date]:
    """The 6 Mon–Sat working days ending on `reference`."""
    return last_n_working_days(6, reference=reference)


def _fake_answer(topic):
    answers = {
        "weekly_meeting": "Mesyuarat sebut harga surau",
        "project_briefing": "Brief klien PJ Rufaidah tukar spec pintu",
        "discussion": "Bincang dimensi dengan kontraktor",
        "deal_supplier": "Deal ABC Aluminium, 50 karton",
        "production": "Siap potong PVC dan H. Steel",
        "logistic": "Urus inventori, label semula material",
        "lalamove": "3 trip ke site",
        "item_on_site": "PVC x20 tiba di surau",
        "point_learned": "Label awal jimat masa semakan",
        "obstacles": "Bekalan skru sedikit lambat",
    }
    return answers.get(topic["id"], "Tiada")


def answer_chunk(day_iso, chunk_id, topics, now):
    """Simulate Naqib answering every applicable topic of a chunk, in order."""
    record = load_daily(day_iso)
    chunk_record = record.get("chunks", {}).get(chunk_id, {})
    pending = pending_for_chunk(topics, CHUNKS[chunk_id], chunk_record, now)
    for topic in pending:
        record_answer(record, chunk_id, now_kl_time(), **{topic["outputField"]: _fake_answer(topic)})
    save_daily(record)
    return len(pending)


def simulate_week(reference: date) -> int:
    """Run the conversation flow for the 6-day week ending `reference`.

    Returns the number of chunk answers recorded (sanity check).
    """
    topics = load_topics()
    days = _working_days(reference)
    total = 0
    for i, d in enumerate(days):
        day_iso = d.isoformat()
        # chunk answers
        from datetime import datetime
        midday_ts = datetime(d.year, d.month, d.day, 13, 15)
        late_ts = datetime(d.year, d.month, d.day, 16, 30)
        total += answer_chunk(day_iso, "midday", topics, midday_ts)
        total += answer_chunk(day_iso, "lateAfternoon", topics, late_ts)
        # item progress: one transition per day on the tracked project
        _simulate_item_progress(i)
        # Mon refresh-in / Fri refresh-out
        if d.weekday() == 0:
            _write_projects(["pj-rufaidah", "surau-rahamaniyyah"])
        elif d.weekday() == 4:
            _write_projects(["pj-rufaidah"])
    return total


def _simulate_item_progress(day_index: int):
    transitions = [
        "add PVC in_progress; add H. Steel in_progress",
        "PVC -> done_payment",
        "H. Steel -> done_payment",
        "PVC -> ready_on_site",
        "H. Steel -> ready_on_site",
        "no change",
    ]
    rec = load_items("pj-rufaidah")
    rec = apply_item_changes(rec, transitions[day_index % len(transitions)])
    rec["completionPct"] = min(10 + day_index * 15, 100)
    save_items(rec)


def _write_projects(names: list[str]):
    import json
    config.PROJECTS_FILE.write_text(
        json.dumps({"projects": names}, ensure_ascii=False, indent=2), encoding="utf-8"
    )


def run(reference: date = date(2026, 10, 3), isolate: bool = True):
    data_root = redirect_to_temp() if isolate else None
    answered = simulate_week(reference)
    print(f"Week ending {reference.isoformat()}: {answered} chunk answers recorded across 6 working days")
    days = _working_days(reference)
    docx_path = asyncio.run(compile_week(days))
    print(f"Weekly .docx written to: {docx_path}")
    if data_root is not None:
        print(f"(isolated data root: {data_root})")
    return docx_path


if __name__ == "__main__":
    run()