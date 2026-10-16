"""
logsafe.py — W1: the token must never reach a log file, the terminal or git.

Two leak paths exist, and both were observed on this machine:

  1. httpx/httpcore log the request URL at INFO, and the Telegram URL is
     https://api.telegram.org/bot<TOKEN>/getUpdates. bot/main.py pins those two
     loggers to WARNING, which closes this one.
  2. python-telegram-bot puts the token in the *message* of its own errors --
     "The token `<TOKEN>` was rejected by the server." (InvalidToken, raised
     when the .env token is wrong or revoked) -- and Updater logs that with a
     full traceback, which run_bot.bat appends to logs\\bot.log. Pinning log
     levels does nothing about this one.

So this module wraps logging.setLogRecordFactory(). A logger's own filters are
NOT applied to records that propagate up from child loggers, and a handler's
filters only cover that handler -- the record factory is the one hook that sees
every record from every logger (telegram.ext, httpx, httpcore, dailybot)
regardless of which handler finally writes it.
"""

import logging
import os
import traceback

REDACTED = "<telegram-token-redacted>"

# The factory that was in place before we wrapped it, so a second install (or an
# install with no token) restores it instead of stacking wrappers.
_ORIGINAL_FACTORY = None


def redact(text, token):
    """Replace every occurrence of the token. Missing token or text is a no-op."""
    if not text or not token:
        return text
    return str(text).replace(token, REDACTED)


class TokenRedactionFilter(logging.Filter):
    """Rewrites the token out of a log record before any handler sees it."""

    def __init__(self, token):
        super().__init__()
        self.token = token or ""

    def filter(self, record):
        if not self.token:
            return True
        if isinstance(record.msg, str) and self.token in record.msg:
            record.msg = record.msg.replace(self.token, REDACTED)
        if record.args:
            # getMessage() is what the formatter prints; freeze it with the
            # token already removed and drop the raw args.
            record.msg = redact(record.getMessage(), self.token)
            record.args = ()
        if record.exc_info:
            # The formatter appends record.exc_text when exc_info is empty, so
            # pre-format the traceback and clear exc_info.
            record.exc_text = redact(
                "".join(traceback.format_exception(*record.exc_info)), self.token
            )
            record.exc_info = None
        return True


def install_token_redaction(token=None):
    """
    Wrap the log-record factory so the token is rewritten out of every record
    before any handler formats it. Idempotent: a second call replaces the
    previous wrapper instead of stacking one per start. Returns the filter doing
    the work, or None when there is no token to protect (the factory is then
    restored to whatever it was).
    """
    global _ORIGINAL_FACTORY

    token = token if token is not None else os.environ.get("TELEGRAM_BOT_TOKEN", "")

    if _ORIGINAL_FACTORY is not None:
        logging.setLogRecordFactory(_ORIGINAL_FACTORY)
        _ORIGINAL_FACTORY = None

    if not token:
        return None

    _ORIGINAL_FACTORY = logging.getLogRecordFactory()
    redaction = TokenRedactionFilter(token)

    def redacting_factory(*args, **kwargs):
        record = _ORIGINAL_FACTORY(*args, **kwargs)
        redaction.filter(record)  # mutates in place
        return record

    logging.setLogRecordFactory(redacting_factory)
    return redaction
