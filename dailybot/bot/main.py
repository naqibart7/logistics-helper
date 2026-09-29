"""
main.py — Slice 3 step 1: conversation engine walks each chunk topic by
topic (Smart Skip checklist shared in bot/conversation.py); catch-up ping
lists only real leftovers. No item tracker yet (Slice 4), no Groq/docx (Slice 5).

Env (from dailybot/.env, never committed): TELEGRAM_BOT_TOKEN, NAQIB_CHAT_ID.
V2_TEST_SEND=1 -> also fire the midday question once at startup (proof mode).

Run from dailybot/:  python -m bot.main
"""

import logging
import os
from datetime import datetime
from zoneinfo import ZoneInfo

from apscheduler.schedulers.asyncio import AsyncIOScheduler
from apscheduler.triggers.cron import CronTrigger
from telegram import Update
from telegram.ext import Application, CommandHandler, ContextTypes, MessageHandler, filters

from bot import config
from bot.chunks import CHUNKS, topics_for_chunk
from bot.conversation import pending_for_chunk, catchup_leftovers
from bot.scheduler import TOUCHPOINTS, label_for
from bot.store import load_daily, save_daily, record_answer, now_kl_time
from bot.topics import load_topics

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")
log = logging.getLogger("dailybot")

KL = ZoneInfo(config.TIMEZONE)

# One pending question at a time (dumb version; Slice 3 replaces with a checklist).
PENDING = {"chunk": None, "topic": None}


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
    """Store a reply against the pending question, then walk to the chunk's next pending topic."""
    if str(update.effective_chat.id) != os.environ.get("NAQIB_CHAT_ID"):
        return
    if update.message is None or not update.message.text:
        return
    text = update.message.text.strip()
    if PENDING["topic"] is None:
        log.info("Got text with no pending question (free-text matching lands later in Slice 3): %.60s", text)
        return
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


def arm_scheduler(app, scheduler):
    """
    Wire every TOUCHPOINT to a KL cron job. Slice 3 step 1: midday +
    late-afternoon chunks send; catch-up ping lists leftovers; item progress
    + refresh jobs stay log-only (Slices 4 / refresh logic). Schedule times
    come ONLY from scheduler.TOUCHPOINTS.
    """
    handlers = {
        "midday": on_midday_fire,
        "late_afternoon": on_lateafternoon_fire,
        "catch_up": on_catchup_fire,
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
    log.info("Starting NAQIB Daily Bot v2 (Slice 3 step 1: both chunks + catch-up) — polling, no inbound port")
    app.run_polling()


if __name__ == "__main__":
    main()
