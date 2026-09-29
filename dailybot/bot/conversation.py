"""
conversation.py — Slice 3 pure checklist helpers (no Telegram, no file I/O).

Architecture Section 4 (Smart Skip): before a chunk fires, drop every topic
Naqib already answered today. Every incoming message is checked against the
same per-day checklist before deciding what's still missing.

Weekday rule: topics.json came from Lane 6a (Node.js) — `weekdays` uses the
JS getDay() convention (0=Sun, 1=Mon, ..., 6=Sat). Never compare Python's
weekday() directly; use js_weekday() here.
"""


def js_weekday(now):
    """JS getDay() number for a datetime (0=Sun .. 6=Sat)."""
    return (now.weekday() + 1) % 7


def is_topic_applicable(topic, now):
    """True when the topic has no weekday restriction or today matches it."""
    wd = topic.get("weekdays")
    if not wd:
        return True
    return js_weekday(now) in wd


def pending_for_chunk(topics, chunk_topic_ids, chunk_record, now):
    """
    Ordered applicable topics in a chunk whose outputField has no answer yet
    in chunk_record (the daily/{date}.json chunks[chunk_id] dict).
    `topics` is {topic_id: topic_dict} from topics.py load_topics().
    Raises loudly on unknown topic ids — data drift must be loud.
    """
    answered = {k for k in (chunk_record or {}) if k != "answeredAt"}
    pending = []
    for tid in chunk_topic_ids:
        t = topics.get(tid)
        if t is None:
            raise ValueError(f"topics.json is missing topic {tid!r} — data file drifted from chunks.py")
        if not is_topic_applicable(t, now):
            continue
        if t["outputField"] in answered:
            continue
        pending.append(t)
    return pending


def catchup_leftovers(topics, daily_record, chunk_map, now):
    """
    {chunk_id: [pending topics]} for every chunk in chunk_map
    (e.g. {"midday": [...], "lateAfternoon": [...]}).
    The catch-up ping renders this — only real leftovers, never repeats.
    """
    chunks = (daily_record or {}).get("chunks", {})
    leftovers = {}
    for chunk_id, chunk_topic_ids in chunk_map.items():
        leftovers[chunk_id] = pending_for_chunk(
            topics, chunk_topic_ids, chunks.get(chunk_id, {}), now
        )
    return leftovers
