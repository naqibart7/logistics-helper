from datetime import datetime

from bot.conversation import (
    js_weekday,
    is_topic_applicable,
    pending_for_chunk,
    catchup_leftovers,
    match_free_text,
)
from bot.chunks import CHUNKS
from bot.topics import load_topics

TOPICS = load_topics()
MON = datetime(2026, 9, 28, 12, 0)
TUE = datetime(2026, 9, 29, 12, 0)
SUN = datetime(2026, 10, 4, 12, 0)


def test_js_weekday_convention():
    assert js_weekday(MON) == 1   # Monday -> JS 1
    assert js_weekday(TUE) == 2   # Tuesday -> JS 2
    assert js_weekday(SUN) == 0   # Sunday -> JS 0


def test_weekly_meeting_monday_only():
    wm = TOPICS["weekly_meeting"]
    assert is_topic_applicable(wm, MON) is True
    assert is_topic_applicable(wm, TUE) is False
    assert is_topic_applicable(wm, SUN) is False


def test_topic_with_no_weekday_always_applicable():
    brig = TOPICS["project_briefing"]
    assert is_topic_applicable(brig, MON) is True
    assert is_topic_applicable(brig, SUN) is True


def test_pending_fresh_tuesday_skips_weekly_meeting():
    ids = [t["id"] for t in pending_for_chunk(TOPICS, CHUNKS["midday"], {}, TUE)]
    assert ids == ["project_briefing", "discussion", "deal_supplier", "production"]


def test_pending_monday_includes_weekly_meeting():
    ids = [t["id"] for t in pending_for_chunk(TOPICS, CHUNKS["midday"], {}, MON)]
    assert ids[0] == "weekly_meeting"


def test_pending_skips_already_answered():
    answered = {"answeredAt": "13:22", "projectBriefing": "x", "discussion": "y"}
    ids = [t["id"] for t in pending_for_chunk(TOPICS, CHUNKS["midday"], answered, TUE)]
    assert ids == ["deal_supplier", "production"]


def test_catchup_lists_only_leftovers():
    daily = {
        "chunks": {
            "midday": {"answeredAt": "13:22", "projectBriefing": "x", "discussion": "y"},
            "lateAfternoon": {},
        }
    }
    leftovers = catchup_leftovers(TOPICS, daily, CHUNKS, TUE)
    assert [t["id"] for t in leftovers["midday"]] == ["deal_supplier", "production"]
    assert [t["id"] for t in leftovers["lateAfternoon"]] == [
        "logistic", "lalamove", "item_on_site", "point_learned", "obstacles",
    ]


def test_catchup_silent_when_all_answered():
    daily = {
        "chunks": {
            "midday": {"answeredAt": "13:22", "projectBriefing": "a", "discussion": "b",
                       "dealSupplier": "c", "production": "d"},
            "lateAfternoon": {"answeredAt": "16:35", "logistic": "e", "lalamove": "f",
                              "itemOnSite": "g", "pointLearned": "h", "obstacles": "i"},
        }
    }
    leftovers = catchup_leftovers(TOPICS, daily, CHUNKS, TUE)
    assert leftovers["midday"] == [] and leftovers["lateAfternoon"] == []


def _open_topics():
    return [
        (chunk_id, t)
        for chunk_id in ("midday", "lateAfternoon")
        for t in pending_for_chunk(TOPICS, CHUNKS[chunk_id], {}, TUE)
    ]


def test_match_free_text_lalamove():
    hit = match_free_text("Lalamove 3 trip harini", _open_topics())
    assert hit is not None and hit[1]["id"] == "lalamove"


def test_match_free_text_supplier():
    hit = match_free_text("Deal dengan ABC Supplier 50 karton", _open_topics())
    assert hit is not None and hit[1]["id"] == "deal_supplier"


def test_match_free_text_no_match_tiada():
    assert match_free_text("Tiada", _open_topics()) is None


def test_match_free_text_offtopic_none():
    assert match_free_text("cuaca panas hari ini", _open_topics()) is None