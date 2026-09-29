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


# Free-text matching (rule-based — no LLM in Slice 3; Groq arrives at Slice 5).
# A stray message (no pending question) is checked against every still-open
# topic: score = shared distinctive words between the message and the topic's
# title + prompt. Best score wins; ties or zero score mean "no match, stay
# silent" — the bot never guesses. Design choice flagged per the pipeline's
# gate rule (Lane 6a's JS logic wasn't available locally to port).
STOPWORDS = frozenset(
    "ada apa apalagi tidak tak tiada je ke kat dengan untuk dari daripada"
    " di dalam yang ini itu harini hari saya kita kami kamu anda beliau"
    " mereka dia nya lah kah tah pun juga sudah telah belum akan mahu nak"
    " boleh bisa dapat adalah ialah dan atau tapi tetapi sebab kerana"
    " kerana kalau jika bila apabila semua setiap satu dua the a an and"
    " or but if then than so such no not only own same what when where"
    " which who whom this that these those am is are was were be been"
    " being have has had having do does did doing will would can line".split()
)


def _words(text):
    """Lowercase alphanumeric word set, stopwords removed."""
    import re
    return {w for w in re.findall(r"[a-z0-9]+", text.lower()) if w not in STOPWORDS}


def match_free_text(text, pending_topics):
    """
    Best-match topic for a stray message, or None (no guess on ties/zero).
    `pending_topics` is [(chunk_id, topic_dict), ...] — chunk_id tells the
    caller where to store the answer.
    """
    msg_words = _words(text)
    if not msg_words or not pending_topics:
        return None
    scored = []
    for chunk_id, topic in pending_topics:
        topic_words = _words(f"{topic.get('title', '')} {topic.get('prompt', '')}")
        scored.append((len(msg_words & topic_words), chunk_id, topic))
    scored.sort(key=lambda s: s[0], reverse=True)
    best, runner_up = scored[0][0], (scored[1][0] if len(scored) > 1 else 0)
    if best == 0 or best == runner_up:
        return None
    return scored[0][1], scored[0][2]
