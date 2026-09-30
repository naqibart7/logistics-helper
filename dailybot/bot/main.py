"""
main.py — Slice 4: item tracker (guided 5pm flow per project) + Delivery Activity.
Both chunks + catch-up + free-text from Slice 3 remain. No Groq/docx (Slice 5).

Env (from dailybot/.env, never committed): TELEGRAM_BOT_TOKEN, NAQIB_CHAT_ID.
V2_TEST_SEND=1 -> also fire the midday question once at startup (proof mode).

Run from dailybot/:  python -m bot.main
"""

import logging
import os
import json
from datetime import datetime
from zoneinfo import ZoneInfo

from apscheduler.schedulers.asyncio import AsyncIOScheduler
from apscheduler.triggers.cron import CronTrigger
from telegram import Update
from telegram.ext import Application, CommandHandler, ContextTypes, MessageHandler, filters

from bot import config
from bot.chunks import CHUNKS, topics_for_chunk
from bot.conversation import pending_for_chunk, catchup_leftovers, match_free_text
from bot.scheduler import TOUCHPOINTS, label_for
from bot.store import load_daily, save_daily, record_answer, now_kl_time
from bot.topics import load_topics
from bot.items import load_items, save_items, format_item_list, apply_item_changes, icon_for

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")
log = logging.getLogger("dailybot")

KL = ZoneInfo(config.TIMEZONE)

# One pending question at a time (chunks / free-text).
PENDING = {"chunk": None, "topic": None}

# Item Progress multi-step flow state (Slice 4).
# step: "awaiting_changes" | "awaiting_completion"
# project_id: the project being processed
# item_record: the loaded items dict
PENDING_ITEM = {"active": False, "step": None, "project_id": None, "item_record": None, "project_index": 0}


def load_active_projects():
    """Return list of project ids from projects.json (Mon/Fri refresh writes here)."""
    path = config.PROJECTS_FILE
    if path.exists():
        with path.open("r", encoding="utf-8") as f:
            data = json.load(f)
        return data.get("projects", [])
    # Hardcoded fallback for Slice 4 proof — Architecture §5.2 says "start with ONE hardcoded project"
    return ["pj-rufaidah"]


def load_env(path=".env"):
    """Tiny .env loader — no python-dotenv dependency for two variables."""
    if not os.path.exists(path):
        return
    with open(path, "r", encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            key, _, value = line.partition("=")
            os.environ.setdefault(key.strip(), value.strip())


def today_iso():
    return datetime.now(KL).strftime("%Y-%m-%d")


async def send_chunk_first_pending(app, chunk_id):
    """Send a chunk's first still-unanswered question (Smart Skip checklist)."""
    topics = load_topics()
    now = datetime.now(KL)
    daily = load_daily(today_iso())
    pending = pending_for_chunk(
        topics, topics_for_chunk(chunk_id),
        daily.get("chunks", {}).get(chunk_id, {}), now,
    )
    if not pending:
        log.info("%s: nothing pending (all applicable already answered) — nothing sent.", chunk_id)
        return
    topic = pending[0]
    chat_id = os.environ["NAQIB_CHAT_ID"]
    await app.bot.send_message(chat_id=chat_id, text=topic["prompt"])
    PENDING["chunk"] = chunk_id
    PENDING["topic"] = topic
    log.info("Sent %s question: %s (outputField=%s)", chunk_id, topic["id"], topic["outputField"])


async def send_midday_first_question(app):
    """Midday chunk entry point (kept for /test + V2_TEST_SEND)."""
    await send_chunk_first_pending(app, "midday")


async def on_midday_fire(app):
    log.info("MIDDAY CHUNK fired at %s", now_kl_time())
    await send_chunk_first_pending(app, "midday")


async def on_lateafternoon_fire(app):
    log.info("LATE-AFTERNOON CHUNK fired at %s", now_kl_time())
    await send_chunk_first_pending(app, "lateAfternoon")


async def on_catchup_fire(app):
    """One message listing only still-unanswered topics from both chunks."""
    topics = load_topics()
    now = datetime.now(KL)
    daily = load_daily(today_iso())
    leftovers = catchup_leftovers(topics, daily, CHUNKS, now)
    lines = []
    for chunk_id in ("midday", "lateAfternoon"):
        for t in leftovers.get(chunk_id, []):
            lines.append(f"- {t['title']}")
    if not lines:
        log.info("CATCH-UP PING: nothing left unanswered — staying silent.")
        return
    text = "Belum jawab lagi harini:\n" + "\n".join(lines)
    await app.bot.send_message(chat_id=os.environ["NAQIB_CHAT_ID"], text=text)
    log.info("Sent catch-up ping: %d leftover(s)", len(lines))


async def on_itemprogress_fire(app):
    """5:00 PM — guided Item Progress + Delivery Activity per active project."""
    projects = load_active_projects()
    if not projects:
        log.info("ITEM PROGRESS: no active projects — nothing to do.")
        return
    # Reset state and start with first project
    PENDING_ITEM.update(
        active=True,
        step="awaiting_changes",
        project_id=projects[0],
        project_index=0,
    )
    item_rec = load_items(projects[0])
    PENDING_ITEM["item_record"] = item_rec
    text = (
        f"📦 *Item Progress — {projects[0]}*\n"
        f"Sekarang: {format_item_list(item_rec)}\n"
        f"Perubahan? (contoh: 'PVC -> done_payment' atau 'add H. Steel in_progress' atau 'no change')"
    )
    await app.bot.send_message(
        chat_id=os.environ["NAQIB_CHAT_ID"], text=text, parse_mode="Markdown"
    )
    log.info("ITEM PROGRESS started for %s", projects[0])


async def _ask_completion(app, project_id, item_rec):
    """Step 2: ask for completion %."""
    PENDING_ITEM["step"] = "awaiting_completion"
    await app.bot.send_message(
        chat_id=os.environ["NAQIB_CHAT_ID"],
        text=f"📊 *{project_id} — Peratus penyelesaian keseluruhan? (0-100)*",
        parse_mode="Markdown",
    )
    log.info("ITEM PROGRESS asking completion % for %s", project_id)


async def _finish_itemprogress(app, project_id, item_rec, completion_pct):
    """Save completion, advance to next project or start Delivery Activity."""
    item_rec["completionPct"] = int(completion_pct)
    save_items(item_rec)
    log.info("Saved completion %d%% for %s", completion_pct, project_id)

    projects = load_active_projects()
    PENDING_ITEM["project_index"] += 1
    if PENDING_ITEM["project_index"] < len(projects):
        # Next project
        next_id = projects[PENDING_ITEM["project_index"]]
        PENDING_ITEM["project_id"] = next_id
        PENDING_ITEM["step"] = "awaiting_changes"
        PENDING_ITEM["item_record"] = load_items(next_id)
        text = (
            f"📦 *Item Progress — {next_id}*\n"
            f"Sekarang: {format_item_list(PENDING_ITEM['item_record'])}\n"
            f"Perubahan? (contoh: 'PVC -> done_payment' atau 'add H. Steel in_progress' atau 'no change')"
        )
        await app.bot.send_message(chat_id=os.environ["NAQIB_CHAT_ID"], text=text, parse_mode="Markdown")
        log.info("ITEM PROGRESS moved to %s", next_id)
    else:
        # All projects done — start Delivery Activity
        PENDING_ITEM["active"] = False
        PENDING_ITEM["step"] = None
        await _start_delivery_activity(app)


async def _start_delivery_activity(app):
    """Delivery Activity: ask done today, then ready to deliver."""
    PENDING_ITEM["active"] = True
    PENDING_ITEM["step"] = "delivery_done_today"
    await app.bot.send_message(
        chat_id=os.environ["NAQIB_CHAT_ID"],
        text="🚚 *Delivery Activity*\n1) Hantar apa hari ini? (format: projek | item | kuantiti)\nContoh: 'Surau | PVC | 50'\nKata 'tiada' kalau tiada.",
        parse_mode="Markdown",
    )
    log.info("DELIVERY ACTIVITY started: awaiting done today")


async def _ask_delivery_ready(app):
    """Step 2 of Delivery Activity."""
    PENDING_ITEM["step"] = "delivery_ready_to_deliver"
    await app.bot.send_message(
        chat_id=os.environ["NAQIB_CHAT_ID"],
        text="🚚 *Delivery Activity (lanjutan)*\n2) Sedia hantar bila-bila masa? (projek | item | tarikh target)\nContoh: 'Surau | H. Steel | 12/10'\nKata 'tiada' kalau tiada.",
        parse_mode="Markdown",
    )
    log.info("DELIVERY ACTIVITY: awaiting ready to deliver")


async def _finish_delivery_activity(app, done_entry, ready_entry):
    """Save both into today's daily.json deliveryActivity."""
    daily = load_daily(today_iso())
    da = daily.setdefault("deliveryActivity", {"doneToday": [], "readyToDeliver": []})
    if done_entry and done_entry.lower() != "tiada":
        da["doneToday"].append(done_entry)
    if ready_entry and ready_entry.lower() != "tiada":
        da["readyToDeliver"].append(ready_entry)
    save_daily(daily)
    PENDING_ITEM["active"] = False
    PENDING_ITEM["step"] = None
    await app.bot.send_message(chat_id=os.environ["NAQIB_CHAT_ID"], text="✅ Delivery Activity disimpan. Terima kasih!")
    log.info("DELIVERY ACTIVITY saved: done=%s ready=%s", bool(done_entry), bool(ready_entry))


async def cmd_test(update: Update, context: ContextTypes.DEFAULT_TYPE):
    """Fire the midday question immediately (proof/demo command)."""
    if str(update.effective_chat.id) != os.environ.get("NAQIB_CHAT_ID"):
        return
    await send_midday_first_question(context.application)


async def cmd_status(update: Update, context: ContextTypes.DEFAULT_TYPE):
    if str(update.effective_chat.id) != os.environ.get("NAQIB_CHAT_ID"):
        return
    record = load_daily(today_iso())
    await update.message.reply_text(f"Rekod harini ({today_iso()}):\n{record}")


async def on_text(update: Update, context: ContextTypes.DEFAULT_TYPE):
    """Handle chunk replies, free-text matching, AND Item Progress / Delivery Activity flow."""
    if str(update.effective_chat.id) != os.environ.get("NAQIB_CHAT_ID"):
        return
    if update.message is None or not update.message.text:
        return
    text = update.message.text.strip()

    # ----- Item Progress / Delivery Activity multi-step flow (Slice 4) -----
    if PENDING_ITEM["active"]:
        if PENDING_ITEM["step"] == "awaiting_changes":
            # Apply changes to current project's items
            item_rec = apply_item_changes(PENDING_ITEM["item_record"], text)
            PENDING_ITEM["item_record"] = item_rec
            await _ask_completion(context.bot, PENDING_ITEM["project_id"], item_rec)
            return

        if PENDING_ITEM["step"] == "awaiting_completion":
            try:
                pct = int(text)
                if 0 <= pct <= 100:
                    await _finish_itemprogress(context.bot, PENDING_ITEM["project_id"], PENDING_ITEM["item_record"], pct)
                    return
            except ValueError:
                pass
            await update.message.reply_text("Sila masukkan peratus 0-100 sahaja.")
            return

        if PENDING_ITEM["step"] == "delivery_done_today":
            PENDING_ITEM["delivery_done"] = text
            await _ask_delivery_ready(context.bot)
            return

        if PENDING_ITEM["step"] == "delivery_ready_to_deliver":
            await _finish_delivery_activity(context.bot, PENDING_ITEM.get("delivery_done", ""), text)
            return

    # ----- Chunk sequential Q&A (Slice 3) -----
    if PENDING["topic"] is not None:
        topic = PENDING["topic"]
        chunk_id = PENDING["chunk"]
        record = load_daily(today_iso())
        record_answer(record, chunk_id, now_kl_time(), **{topic["outputField"]: text})
        path = save_daily(record)
        log.info("Stored %s -> %s in %s", topic["id"], text[:40], path)
        await update.message.reply_text(f"Simpan: {topic['title']} — terima kasih!")
        # Sequential walk: ask the chunk's next still-unanswered topic, if any.
        pending = pending_for_chunk(
            load_topics(), topics_for_chunk(chunk_id),
            record.get("chunks", {}).get(chunk_id, {}), datetime.now(KL),
        )
        if not pending:
            PENDING["chunk"] = None
            PENDING["topic"] = None
            return
        nxt = pending[0]
        await update.message.reply_text(nxt["prompt"])
        PENDING["chunk"] = chunk_id
        PENDING["topic"] = nxt
        log.info("Next %s question: %s (outputField=%s)", chunk_id, nxt["id"], nxt["outputField"])
        return

    # ----- Free-text matching against open chunk topics (Slice 3) -----
    topics = load_topics()
    now = datetime.now(KL)
    record = load_daily(today_iso())
    open_topics = []
    for chunk_id in ("midday", "lateAfternoon"):
        for t in pending_for_chunk(
            topics, topics_for_chunk(chunk_id),
            record.get("chunks", {}).get(chunk_id, {}), now,
        ):
            open_topics.append((chunk_id, t))
    hit = match_free_text(text, open_topics)
    if hit is not None:
        chunk_id, topic = hit
        record_answer(record, chunk_id, now_kl_time(), **{topic["outputField"]: text})
        path = save_daily(record)
        log.info("Free-text matched %s -> %s in %s", topic["id"], text[:40], path)
        await update.message.reply_text(f"Simpan ({topic['title']}): terima kasih!")
        return

    log.info("Free text matched no open topic, ignoring: %.60s", text)


def arm_scheduler(app, scheduler):
    """
    Wire every TOUCHPOINT to a KL cron job. Slice 4: midday + late-afternoon
    chunks + catch-up send; item_progress (17:00) runs guided flow; refresh
    jobs stay log-only (Slice 5+). Schedule times come ONLY from scheduler.TOUCHPOINTS.
    """
    handlers = {
        "midday": on_midday_fire,
        "late_afternoon": on_lateafternoon_fire,
        "catch_up": on_catchup_fire,
        "item_progress": on_itemprogress_fire,
    }
    for tp in TOUCHPOINTS:
        hour, minute = tp["time"].split(":")
        day_of_week = ",".join(str(w) for w in tp["weekdays"])
        if tp["id"] in handlers:
            scheduler.add_job(
                handlers[tp["id"]], CronTrigger(hour=int(hour), minute=int(minute), day_of_week=day_of_week, timezone=KL),
                args=[app], name=tp["id"],
            )
        else:
            def log_only(label=tp["label"]):
                log.info("%s WOULD FIRE NOW (conversation logic lands in a later slice)", label)
            scheduler.add_job(
                log_only, CronTrigger(hour=int(hour), minute=int(minute), day_of_week=day_of_week, timezone=KL),
                name=tp["id"],
            )


async def post_init(app):
    scheduler = AsyncIOScheduler(timezone=KL)
    arm_scheduler(app, scheduler)
    scheduler.start()
    log.info("Scheduler armed: %s (KL)", ", ".join(f"{tp['id']} {tp['time']} {label_for(tp['id'])}" for tp in TOUCHPOINTS))
    if os.environ.get("V2_TEST_SEND") == "1":
        log.info("V2_TEST_SEND=1 -> firing midday question once at startup")
        await send_midday_first_question(app)


def main():
    load_env()
    token = os.environ.get("TELEGRAM_BOT_TOKEN")
    if not token:
        raise SystemExit("TELEGRAM_BOT_TOKEN missing — set it in dailybot/.env")
    app = Application.builder().token(token).post_init(post_init).build()
    app.add_handler(CommandHandler("test", cmd_test))
    app.add_handler(CommandHandler("status", cmd_status))
    app.add_handler(MessageHandler(filters.TEXT & ~filters.COMMAND, on_text))
    log.info("Starting NAQIB Daily Bot v2 (Slice 4: item tracker + delivery) — polling, no inbound port")
    app.run_polling()


if __name__ == "__main__":
    main()
