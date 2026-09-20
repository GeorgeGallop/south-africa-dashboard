"""The JSE trading-session clock.

Every series this dashboard serves is a *last close* series, which makes a
plain TTL the wrong freshness rule. A slice carrying Tuesday's close is not
made current by being five minutes old on Wednesday morning -- yet a TTL-only
cache will happily serve it, and the page then shows a previous day's close as
if nothing had happened.

This module answers the one question the cache actually needs: which JSE
session does a given instant belong to? The JSE trades 09:00-17:00 SAST
(UTC+2, no daylight saving), Monday to Friday. Before 09:00 the session has not
opened, so the live prices are still the previous trading day's close; from
09:00 onwards the instant belongs to that day's session.

The timestamps are computed in SAST rather than the machine's own zone, because
the reader may be anywhere: a dashboard rendered in Chicago must still say which
South African session it is showing.
"""
from datetime import datetime, timedelta, timezone

#: South African Standard Time: UTC+2, all year, no daylight saving.
SAST = timezone(timedelta(hours=2))

#: JSE regular session, in SAST.
OPEN_HOUR = 9
CLOSE_HOUR = 17

#: Phases of a session, as reported to the page.
PHASE_OPEN = "open"
PHASE_SETTLED = "settled"


def to_sast(epoch):
    """Convert a POSIX timestamp to an aware SAST datetime."""
    return datetime.fromtimestamp(float(epoch), tz=SAST)


def is_trading_day(day):
    """True for Monday to Friday. Exchange holidays are not modelled."""
    return day.weekday() < 5


def previous_trading_day(day):
    """The last weekday strictly before ``day``."""
    cursor = day - timedelta(days=1)
    while not is_trading_day(cursor):
        cursor -= timedelta(days=1)
    return cursor


def session_date(epoch):
    """The JSE session whose prices an instant belongs to.

    A weekend, or the hours before the open, still belong to the previous
    trading day -- that is the close the market is quoting.
    """
    stamp = to_sast(epoch)
    day = stamp.date()
    if not is_trading_day(day) or stamp.hour < OPEN_HOUR:
        return previous_trading_day(day)
    return day


def session_key(epoch):
    """``'2026-09-17'`` -- the cache's freshness key for an instant."""
    return session_date(epoch).isoformat()


def session_phase(epoch):
    """``'open'`` inside the session, otherwise ``'settled'``."""
    stamp = to_sast(epoch)
    if not is_trading_day(stamp.date()):
        return PHASE_SETTLED
    if OPEN_HOUR <= stamp.hour < CLOSE_HOUR:
        return PHASE_OPEN
    return PHASE_SETTLED


def session_label(key):
    """``'Thu 17 Sep 2026'`` for a session key, or ``''`` when there is none."""
    if not key:
        return ""
    try:
        day = datetime.fromisoformat(key).date()
    except ValueError:
        return ""
    return day.strftime("%a %d %b %Y")


def format_sast(epoch, with_seconds=True):
    """``'2026-09-17 21:46:15 SAST'`` -- the exchange clock, not the reader's."""
    pattern = "%Y-%m-%d %H:%M:%S" if with_seconds else "%Y-%m-%d %H:%M"
    return to_sast(epoch).strftime(pattern) + " SAST"


def session_window(epoch):
    """The session's opening and closing instants, as SAST strings."""
    day = session_date(epoch)
    opened = datetime(day.year, day.month, day.day, OPEN_HOUR, tzinfo=SAST)
    closed = datetime(day.year, day.month, day.day, CLOSE_HOUR, tzinfo=SAST)
    return (
        opened.strftime("%Y-%m-%d %H:%M SAST"),
        closed.strftime("%Y-%m-%d %H:%M SAST"),
    )
