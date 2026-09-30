"""
report/utils.py — date/time utilities for the weekly report: Bahasa Malaysia
month/day names, week-of-month label, date-range header, last-N-working-days.

Ported near-verbatim from Teleport's bot/utils.py (Slice 5).
"""

from datetime import date, datetime, timedelta
from zoneinfo import ZoneInfo


def today_kl(timezone: str = "Asia/Kuala_Lumpur") -> date:
    """Return today's date in the given timezone (default Asia/Kuala_Lumpur)."""
    return datetime.now(ZoneInfo(timezone)).date()


# ── Bahasa Malaysia names ──────────────────────────────────────────────────────

BM_MONTHS = {
    1: "JANUARI", 2: "FEBRUARI", 3: "MAC", 4: "APRIL", 5: "MEI", 6: "JUN",
    7: "JULAI", 8: "OGOS", 9: "SEPTEMBER", 10: "OKTOBER", 11: "NOVEMBER", 12: "DISEMBER",
}

BM_DAYS = {
    0: "Isnin", 1: "Selasa", 2: "Rabu", 3: "Khamis", 4: "Jumaat", 5: "Sabtu", 6: "Ahad",
}


def week_of_month(d: date) -> int:
    """Sunday-anchored week-of-month number, counting from 1 (company convention)."""
    first = d.replace(day=1)
    days_to_first_sunday = (6 - first.weekday()) % 7
    first_sunday = first + timedelta(days=days_to_first_sunday)
    if days_to_first_sunday == 0:
        return (d - first_sunday).days // 7 + 1
    if d < first_sunday:
        return 1
    return (d - first_sunday).days // 7 + 2


def report_week_label(start_date: date, end_date: date) -> tuple[str, str]:
    """Return (week_line, date_range_line) for the report header."""
    week_num = week_of_month(start_date)
    week_line = f"MINGGU {week_num} - BULAN {BM_MONTHS[start_date.month]}"
    if start_date.month == end_date.month:
        date_range_line = (
            f"{start_date.day} - {end_date.day} {BM_MONTHS[end_date.month]} {end_date.year}"
        )
    else:
        date_range_line = (
            f"{start_date.day} {BM_MONTHS[start_date.month]} - "
            f"{end_date.day} {BM_MONTHS[end_date.month]} {end_date.year}"
        )
    return week_line, date_range_line


def last_n_working_days(n: int = 6, reference: date | None = None) -> list[date]:
    """Last `n` Mon-Sat working days ending on (and including) `reference`."""
    ref = reference or today_kl()
    days: list[date] = []
    cursor = ref
    while len(days) < n:
        if cursor.weekday() != 6:  # skip Sunday
            days.append(cursor)
        cursor -= timedelta(days=1)
    days.reverse()
    return days