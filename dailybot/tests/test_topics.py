from datetime import datetime

from bot.topics import load_topics, first_topic_for_chunk
from bot.chunks import topics_for_chunk

TOPICS = load_topics()
MON = datetime(2026, 9, 28, 12, 0)
TUE = datetime(2026, 9, 29, 12, 0)
SUN = datetime(2026, 10, 4, 12, 0)


def test_load_topics_has_10():
    assert len(TOPICS) == 10


def test_first_topic_monday_weekly_meeting():
    t = first_topic_for_chunk(TOPICS, topics_for_chunk("midday"), MON)
    assert t["id"] == "weekly_meeting"


def test_first_topic_tuesday_project_briefing():
    t = first_topic_for_chunk(TOPICS, topics_for_chunk("midday"), TUE)
    assert t["id"] == "project_briefing"


def test_first_topic_sunday_project_briefing():
    t = first_topic_for_chunk(TOPICS, topics_for_chunk("midday"), SUN)
    assert t["id"] == "project_briefing"


def test_unknown_topic_raises():
    try:
        first_topic_for_chunk(TOPICS, ["nonexistent_topic"], TUE)
        assert False
    except ValueError:
        pass