"""
weekly.py — Slice 5 adapter + orchestrator.

Reads the last 6 working days of daily/*.json and reshapes them into the
`{date_iso: [{project, activity_type, detail}]}` shape Teleport's compiler
and formatter expect, then runs compile_report → build_docx.

This is the one non-verbatim piece: Teleport read SQLite; v2 reads daily JSON
files. The data contract downstream is identical.
"""

import logging
from datetime import date

from bot import config
from bot.report.utils import last_n_working_days, report_week_label
from bot.report.compiler import compile_report
from bot.report.formatter import build_docx

logger = logging.getLogger(__name__)

# Daily chunk answers are general (not project-specific) — report them under the
# same "Harian" project Teleport used for its fixed daily categories.
HARIAN_PROJECT = "Harian"

# deliveryActivity entries render under an activity type, not a topic.
DELIVERY_ACTIVITY_TYPE = "Hantar ke Site"

# answers that carry no signal (skipped / default) — drop them from the report.
_NO_SIGNAL = {"", "-", "tiada", "tiada isu", "x"}


def _output_field_titles():
    """{outputField: title} from topics.json (e.g. weeklyMeeting -> 'Weekly Meeting')."""
    from bot.topics import load_topics
    return {t["outputField"]: t.get("title", t["id"]) for t in load_topics().values()}


def load_activities_by_day(days: list[date]) -> dict[str, list[dict]]:
    """
    Build {date_iso: [{project, activity_type, detail}]} from daily/*.json.

    Each answered chunk topic becomes one activity row (project="Harian",
    activity_type=topic title, detail=answer). Delivery Activity doneToday
    entries become "Hantar ke Site" rows.
    """
    from bot.store import load_daily

    titles = _output_field_titles()
    result: dict[str, list[dict]] = {}

    for d in days:
        key = d.isoformat()
        record = load_daily(key)
        rows: list[dict] = []

        for chunk_id in ("midday", "lateAfternoon"):
            chunk = record.get("chunks", {}).get(chunk_id, {})
            for field, value in chunk.items():
                if field == "answeredAt":
                    continue
                if not value:
                    continue
                detail = str(value).strip()
                if detail.lower() in _NO_SIGNAL:
                    continue
                rows.append({
                    "project": HARIAN_PROJECT,
                    "activity_type": titles.get(field, field),
                    "detail": detail,
                })

        for entry in record.get("deliveryActivity", {}).get("doneToday", []):
            rows.append({
                "project": HARIAN_PROJECT,
                "activity_type": DELIVERY_ACTIVITY_TYPE,
                "detail": str(entry),
            })

        result[key] = rows
    return result


def days_with_data(activities_by_day: dict[str, list[dict]]) -> int:
    return sum(1 for rows in activities_by_day.values() if rows)


async def compile_week(working_days: list[date]) -> str:
    """Compile an explicit list of working days -> .docx -> return path."""
    start_date, end_date = working_days[0], working_days[-1]

    activities_by_day = load_activities_by_day(working_days)
    week_line, date_range_line = report_week_label(start_date, end_date)

    sections = await compile_report(
        activities_by_day=activities_by_day,
        working_days=working_days,
        week_line=week_line,
        date_range_line=date_range_line,
    )

    docx_path = build_docx(
        report_sections=sections,
        week_line=week_line,
        date_range_line=date_range_line,
        activities_by_day=activities_by_day,
        working_days=working_days,
    )
    logger.info("Weekly report written to %s", docx_path)
    return str(docx_path)


async def generate_weekly_report() -> str:
    """Full pipeline for the last 6 working days: read → compile → .docx."""
    return await compile_week(last_n_working_days(6))