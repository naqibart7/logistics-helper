"""
main.py — Slice 2 (dumb version): scheduler sends the midday chunk's FIRST
question to Naqib's chat; one reply gets stored into daily/{date}.json.
No skip logic yet, no other chunks yet, no item tracker yet.

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
from bot.chunks import topics_for_chunk
from bot.scheduler import TOUCHPOINTS, label_for
from bot.store import load_daily, save_daily, record_answer, now_kl_time
from bot.topics import load_topics, first_topic_for_chunk

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


async def send_midday_first_question(app):
    """Send the midday chunk's first applicable question (Smart Skip: skip if already answered today)."""
    topics = load_topics()
    now = datetime.now(KL)
    chunk_topic_ids = topics_for_chunk("midday")
    daily = load_daily(today_iso())
    answered_output_fields = {
        k for k in daily.get("chunks", {}).get("midday", {})
        if k != "answeredAt"
    }
    topic = None
    for tid in chunk_topic_ids:
        t = topics.get(tid)
        if t is None:
            raise ValueError(f"topics.json is missing topic {tid!r}")
        wd = t.get("weekdays")
        js_weekday = (now.weekday() + 1) % 7
        if wd and js_weekday not in wd:
            continue                      # weekday restriction not met today
        if t["outputField"] in answered_output_fields:
            continue                      # Smart Skip: already answered today
        topic = t
        break
    if topic is None:
        log.info("No applicable midday topic today (all applicable already answered) — nothing sent.")
        return
    chat_id = os.environ["NAQIB_CHAT_ID"]
    await app.bot.send_message(chat_id=chat_id, text=topic["prompt"])
    PENDING["chunk"] = "midday"
    PENDING["topic"] = topic
    log.info("Sent midday question: %s (outputField=%s)", topic["id"], topic["outputField"])


async def on_midday_fire(app):
    log.info("MIDDAY CHUNK fired at %s", now_kl_time())
    await send_midday_first_question(app)


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
    """Store one reply against the pending question. Dumb version: no matching."""
    if str(update.effective_chat.id) != os.environ.get("NAQIB_CHAT_ID"):
        return
    if update.message is None or not update.message.text:
        return
    text = update.message.text.strip()
    if PENDING["topic"] is None:
        log.info("Got text with no pending question (Slice 3 will match free text): %.60s", text)
        return
    topic = PENDING["topic"]
    record = load_daily(today_iso())
    record_answer(record, PENDING["chunk"], now_kl_time(), **{topic["outputField"]: text})
    path = save_daily(record)
    log.info("Stored %s -> %s in %s", topic["id"], text[:40], path)
    await update.message.reply_text(f"Simpan: {topic['title']} — terima kasih!")
    PENDING["chunk"] = None
    PENDING["topic"] = None


def arm_scheduler(app, scheduler):
    """
    Wire every TOUCHPOINT to a KL cron job. Slice 2: only the midday chunk
    sends a message; the rest log their fire (their conversation logic is
    Slice 3/4). Schedule times come ONLY from scheduler.TOUCHPOINTS.
    """
    for tp in TOUCHPOINTS:
        hour, minute = tp["time"].split(":")
        day_of_week = ",".join(str(w) for w in tp["weekdays"])
        if tp["id"] == "midday":
            scheduler.add_job(
                on_midday_fire, CronTrigger(hour=int(hour), minute=int(minute), day_of_week=day_of_week, timezone=KL),
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
    log.info("Starting NAQIB Daily Bot v2 (Slice 2, dumb version) — polling, no inbound port")
    app.run_polling()


if __name__ == "__main__":
    main()
