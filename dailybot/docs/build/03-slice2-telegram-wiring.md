# Handoff: Agents 2+3 — Slice 2 (wire to Telegram, dumb version)

**Status: COMPLETE — full round-trip proven live 2026-09-29** (after Naqib pressed Start in @A7Prod_bot). Plus: the live proof caught a real weekday-convention bug, fixed and re-proven same day.

## What I built
- `bot/chunks.py` — chunk membership table (midday / lateAfternoon; keys match the Section 6.2 example)
- `bot/topics.py` — topics.json loader + `first_topic_for_chunk` (skips weekday-restricted topics, e.g. weekly_meeting is Mondays-only)
- `bot/store.py` — `daily/{date}.json` read-modify-write, Section 6.2 shape verbatim (`chunks.midday.answeredAt` + outputField keys, `deliveryActivity` seeded)
- `bot/main.py` — the dumb wiring: APScheduler crons built from `TOUCHPOINTS` (KL tz); midday job sends the chunk's **first applicable question**; a text reply stores it via `record_answer` and confirms; `/test` fires the question on demand; `/status` shows today's record; `V2_TEST_SEND=1` fires once at startup
- `requirements.txt` — only `python-telegram-bot==21.9`, `APScheduler==3.10.4` (Slice 5 adds the LLM/docx deps)
- `.env` (gitignored) — Teleport's token reused for testing

## How I proved it works — the full round-trip (real Telegram, real KL clock)

```
12:48:58 INFO dailybot: V2_TEST_SEND=1 -> firing midday question once at startup
12:48:58 INFO httpx: POST .../sendMessage "HTTP/1.1 200 OK"      <- question delivered (403 gone after Start)
12:48:58 INFO dailybot: Sent midday question: weekly_meeting (outputField=weeklyMeeting)
12:49:51 INFO dailybot: Stored weekly_meeting -> Tiada in ...\dailybot\data\daily\2026-09-29.json
12:49:53 INFO httpx: POST .../sendMessage "HTTP/1.1 200 OK"      <- "Simpan: ..." confirmation delivered
```

`cat data/daily/2026-09-29.json` — the Section 6.2 shape, verbatim:

```json
{
  "date": "2026-09-29",
  "chunks": {
    "midday": { "answeredAt": "12:49", "weeklyMeeting": "Tiada" }
  },
  "deliveryActivity": { "doneToday": [], "readyToDeliver": [] }
}
```

## Bug caught by the live proof (fixed same day)

**Weekday-convention mismatch.** topics.json came from Lane 6a (Node.js), so its `weekdays: [1]` uses the JS convention (1 = Monday). The first Python code compared against Python's `weekday()` (1 = Tuesday) — so on Tuesday 2026-09-29 the bot asked the **Monday-only** Weekly Meeting question. Naqib's answer was valid regardless, but the topic shown was wrong for the day.

Fix in `bot/topics.py`: convert `js_weekday = (now.weekday() + 1) % 7` before comparing (documented in the function). Re-proven with simulated days — Monday → `weekly_meeting`, Tuesday → `project_briefing`, Sunday → `project_briefing` — all assertions pass. **Slice 3 must reuse `first_topic_for_chunk` / the JS convention for every topics.json weekday rule; never re-implement the mapping.**

Process note (honest): the old buggy process was still alive at the real 13:15 KL midday fire — it re-asked weekly_meeting (Naqib didn't reply, no data change). Those logs were deleted in the restart before being captured — evidence lost, lesson recorded: read the logs before deleting them.

## What I deliberately didn't touch
- No free-text matching, no catch-up content logic (those are Slice 3 proper).
- Smart Skip is now implemented in `send_midday_first_question` (see code change below): the midday question skips any topic whose `outputField` already has an answer recorded for today in `data/daily/{date}.json`.
- No late-afternoon chunk flow, no item tracker, no Delivery Activity (Slices 3/4).
- No Groq / docx (Slice 5).
- No changes to `lh_bot_6a`, `teleport`, or the v3 web app.

## Open questions for the next agent
1. **Token reuse:** testing runs on Teleport's @A7Prod_bot token. Phase 3 open item: a new BotFather bot before Slice 7 deploy; single-poller rule — old Teleport code must never run alongside v2.
2. `PENDING` is in-memory single-slot state — accepted for the dumb version (Smart Skip now prevents immediate re‑ask of the same topic); Slice 3 replaces it with the full per‑day checklist and free‑text matching.
3. The 16:30/16:50/17:00 jobs are armed and log-only; their conversation logic is Slices 3/4.
4. Groq + docx port (Slice 5) — LLM‑generated weekly briefings, formatter.py from Teleport’s .docx, Groq API key management.

