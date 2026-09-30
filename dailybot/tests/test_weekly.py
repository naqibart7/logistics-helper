import json
from datetime import date

from bot.weekly import load_activities_by_day, days_with_data


def _write_day(data_dirs, iso, mid=None, late=None, done_today=None):
    from bot import config
    record = {
        "date": iso,
        "chunks": {
            "midday": {"answeredAt": "13:22", **(mid or {})},
            "lateAfternoon": {"answeredAt": "16:35", **(late or {})},
        },
        "deliveryActivity": {"doneToday": done_today or [], "readyToDeliver": []},
    }
    (config.DAILY_DIR / f"{iso}.json").write_text(
        json.dumps(record, ensure_ascii=False, indent=2), encoding="utf-8"
    )


def test_adapter_maps_topics_with_titles(data_dirs):
    _write_day(data_dirs, "2026-09-28",
               mid={"dealSupplier": "Deal ABC, 50 karton", "weeklyMeeting": "Tiada"})
    days = [date(2026, 9, 28)]
    acts = load_activities_by_day(days)
    rows = acts["2026-09-28"]
    types = {r["activity_type"] for r in rows}
    assert "Deal Supplier" in types          # title from topics.json
    assert "Weekly Meeting" not in types     # "Tiada" dropped as no-signal
    for r in rows:
        assert r["project"] == "Harian"


def test_adapter_drops_no_signal(data_dirs):
    _write_day(data_dirs, "2026-09-28",
               mid={"production": "", "discussion": "-", "dealSupplier": "x"})
    acts = load_activities_by_day([date(2026, 9, 28)])
    # only "x" also dropped by _NO_SIGNAL; nothing remains
    assert acts["2026-09-28"] == []


def test_adapter_includes_delivery(data_dirs):
    _write_day(data_dirs, "2026-09-28", done_today=["Surau | PVC | 20"])
    acts = load_activities_by_day([date(2026, 9, 28)])
    types = [r["activity_type"] for r in acts["2026-09-28"]]
    assert "Hantar ke Site" in types


def test_days_with_data(data_dirs):
    _write_day(data_dirs, "2026-09-28", mid={"production": "Siap potong PVC"})
    _write_day(data_dirs, "2026-09-29")  # empty
    acts = load_activities_by_day([date(2026, 9, 28), date(2026, 9, 29)])
    assert days_with_data(acts) == 1