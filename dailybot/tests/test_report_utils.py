from datetime import date

from bot.report.utils import (
    BM_DAYS, BM_MONTHS, week_of_month, report_week_label, last_n_working_days,
)


def test_bm_names():
    assert BM_DAYS[0] == "Isnin"
    assert BM_MONTHS[9] == "SEPTEMBER"


def test_week_of_month_august_examples():
    assert week_of_month(date(2026, 8, 1)) == 1   # Sat before first Sunday
    assert week_of_month(date(2026, 8, 2)) == 2   # first Sunday
    assert week_of_month(date(2026, 8, 8)) == 2


def test_week_of_month_july_examples():
    assert week_of_month(date(2026, 7, 1)) == 1   # Wed before first Sunday
    assert week_of_month(date(2026, 7, 5)) == 2
    assert week_of_month(date(2026, 7, 27)) == 5


def test_report_week_label_same_month():
    week_line, date_line = report_week_label(date(2026, 9, 28), date(2026, 10, 3))
    assert week_line.startswith("MINGGU")
    assert "SEPTEMBER" in week_line
    # crosses month -> two month names in the range
    assert "SEPTEMBER" in date_line and "OKTOBER" in date_line


def test_last_n_working_days_skips_sunday():
    # reference Wednesday 2026-09-30
    days = last_n_working_days(6, reference=date(2026, 9, 30))
    assert len(days) == 6
    assert all(d.weekday() != 6 for d in days)   # no Sunday
    assert days[-1] == date(2026, 9, 30)          # chronological, ends on reference
    assert days[0] == date(2026, 9, 24)           # Thu (Sun 27 excluded)