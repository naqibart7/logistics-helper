"""
W1 — log hygiene. The Telegram request URL is
https://api.telegram.org/bot<TOKEN>/getUpdates, and httpx logs the full URL at
INFO. The second test is the guard: it proves the first one can actually see a
leak, so it cannot pass by accident.
"""

import io
import logging
import sys

import bot.main as main  # importing main.py is what arms the levels
from bot import logsafe


def _capture(func):
    """Run func() and return everything written to a root-level log stream."""
    stream = io.StringIO()
    handler = logging.StreamHandler(stream)
    handler.setLevel(logging.INFO)
    root = logging.getLogger()
    previous_level = root.level
    root.setLevel(logging.INFO)
    root.addHandler(handler)
    try:
        func()
    finally:
        root.removeHandler(handler)
        root.setLevel(previous_level)
    return stream.getvalue()


TOKEN = "1234567890:AAHfake-token-for-the-leak-test-not-a-real-secret"


def test_http_client_loggers_are_pinned_to_warning():
    assert logging.getLogger("httpx").level == logging.WARNING
    assert logging.getLogger("httpcore").level == logging.WARNING
    assert main.log is not None


def test_telegram_token_never_reaches_a_log_stream():
    """An INFO polling cycle must not put the token in logs/bot.log."""
    def emit():
        logging.getLogger("httpx").info(
            'HTTP Request: POST https://api.telegram.org/bot%s/getUpdates "200 OK"', TOKEN
        )
        logging.getLogger("httpcore").info(
            "send GET https://api.telegram.org/bot%s/getUpdates", TOKEN
        )
        main.log.info("Scheduler armed (KL)")  # unrelated line still gets through

    output = _capture(emit)
    assert TOKEN not in output
    assert "getUpdates" not in output
    assert "Scheduler armed" in output  # the stream really was capturing


def test_the_leak_check_would_catch_a_leak():
    """Control: with httpx back at INFO the token does appear, so the assertion
    in the test above is not vacuous."""
    logger = logging.getLogger("httpx")
    previous = logger.level
    logger.setLevel(logging.INFO)
    try:
        output = _capture(lambda: logger.info(
            'HTTP Request: POST https://api.telegram.org/bot%s/getUpdates "200 OK"', TOKEN
        ))
    finally:
        logger.setLevel(previous)
    assert TOKEN in output
    assert logger.level == logging.WARNING


# ── the second leak path: python-telegram-bot quotes the token in its errors ───

def _record(message, args=(), exc_info=None):
    return logging.LogRecord("telegram.ext.Updater", logging.ERROR, __file__, 1,
                             message, args, exc_info)


def test_redaction_filter_rewrites_message_and_args():
    filt = logsafe.TokenRedactionFilter(TOKEN)
    record = _record("HTTP Request: POST https://api.telegram.org/bot%s/getUpdates", (TOKEN,))
    assert filt.filter(record) is True

    text = logging.Formatter("%(message)s").format(record)
    assert TOKEN not in text
    assert logsafe.REDACTED in text
    assert "getUpdates" in text  # the rest of the line survives


def test_redaction_filter_rewrites_a_traceback():
    """The real leak seen on this machine: InvalidToken's message is
    'The token `<token>` was rejected by the server.' and Updater logs it with a
    traceback."""
    try:
        raise RuntimeError(f"The token `{TOKEN}` was rejected by the server.")
    except RuntimeError:
        record = _record("Invalid token; aborting", exc_info=sys.exc_info())

    logsafe.TokenRedactionFilter(TOKEN).filter(record)
    text = logging.Formatter("%(message)s").format(record)
    assert TOKEN not in text
    assert logsafe.REDACTED in text
    assert "rejected by the server" in text


def test_install_is_idempotent_and_survives_a_missing_token():
    original = logging.getLogRecordFactory()
    try:
        assert logsafe.install_token_redaction(TOKEN) is not None
        wrapped_once = logging.getLogRecordFactory()
        logsafe.install_token_redaction(TOKEN)
        logsafe.install_token_redaction(TOKEN)

        stream = io.StringIO()
        handler = logging.StreamHandler(stream)
        root = logging.getLogger()
        root.addHandler(handler)
        root.setLevel(logging.INFO)
        try:
            logging.getLogger("telegram.ext.Updater").error("token %s rejected", TOKEN)
        finally:
            root.removeHandler(handler)
        # Redacted exactly once, not once per install.
        assert stream.getvalue().count(logsafe.REDACTED) == 1

        assert logsafe.install_token_redaction("") is None
        assert logging.getLogRecordFactory() is original
        assert wrapped_once is not original
    finally:
        logging.setLogRecordFactory(original)


def test_every_logger_is_covered_not_just_the_root_logger():
    """telegram.ext and httpx log through their own loggers; a filter on the root
    logger never sees those records, which is why the record factory is used."""
    original = logging.getLogRecordFactory()
    stream = io.StringIO()
    handler = logging.StreamHandler(stream)
    handler.setLevel(logging.INFO)
    root = logging.getLogger()
    root.addHandler(handler)
    root.setLevel(logging.INFO)
    try:
        logsafe.install_token_redaction(TOKEN)
        logging.getLogger("telegram.ext.Updater").exception(
            "Invalid token; aborting", exc_info=_token_error()
        )
        logging.getLogger("httpx").setLevel(logging.INFO)
        try:
            logging.getLogger("httpx").info(
                "HTTP Request: POST https://api.telegram.org/bot%s/getUpdates", TOKEN
            )
        finally:
            logging.getLogger("httpx").setLevel(logging.WARNING)
    finally:
        root.removeHandler(handler)
        logsafe.install_token_redaction("")
        logging.setLogRecordFactory(original)

    output = stream.getvalue()
    assert TOKEN not in output
    assert output.count(logsafe.REDACTED) == 2
    assert "Invalid token; aborting" in output
    assert "getUpdates" in output


def _token_error():
    try:
        raise RuntimeError(f"The token `{TOKEN}` was rejected by the server.")
    except RuntimeError:
        return sys.exc_info()
