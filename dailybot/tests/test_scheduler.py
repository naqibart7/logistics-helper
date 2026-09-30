from datetime import datetime

from bot.scheduler import TOUCHPOINTS, due_touchpoints, label_for, _parse_hhmm


def test_parse_hhmm():
    assert _parse_hhmm("13:15") == (13, 15)
    assert _parse_hhmm("00:00") == (0, 0)
    try:
        _parse_hhmm("25:00")
        assert False
    except ValueError:
        pass


def test_single_fire_exact_minute():
    now = datetime(2026, 9, 28, 13, 15)  # Monday midday
    assert due_touchpoints(now) == ["midday"]


def test_sunday_silent():
    for hh, mm in [(13, 15), (16, 30), (16, 50), (17, 0)]:
        now = datetime(2026, 10, 4, hh, mm)  # Sunday
        assert due_touchpoints(now) == []


def test_refresh_in_and_out():
    assert "refresh_in" in due_touchpoints(datetime(2026, 9, 28, 10, 0))  # Mon 10:00
    assert "refresh_out" in due_touchpoints(datetime(2026, 10, 2, 15, 0))  # Fri 15:00


def test_full_week_total_26():
    from datetime import timedelta
    start = datetime(2026, 9, 28, 0, 0)
    end = datetime(2026, 10, 4, 23, 59)
    count = 0
    now = start
    while now <= end:
        count += len(due_touchpoints(now))
        now += timedelta(minutes=1)
    assert count == 26


def test_label_for():
    assert label_for("midday") == "MIDDAY CHUNK"
    assert label_for("item_progress") == "ITEM PROGRESS + DELIVERY ACTIVITY"


def test_touchpoints_table_shape():
    for tp in TOUCHPOINTS:
        assert {"id", "label", "time", "weekdays"} <= set(tp)