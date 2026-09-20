"""Cached access to the market payloads used by the dashboard API.

Each slice is memoised on disk, so a page render is instant and a provider
outage degrades to the last good figures with a visible timestamp rather than
an empty panel.

Freshness has two parts. A slice must still be inside its TTL -- that is what
keeps an intraday figure moving -- *and* it must belong to the JSE session that
is current now. The second condition is what stops yesterday's close being
served as today's: at 09:00 SAST the cache entry written at 07:00 is only two
hours old, well inside the equity TTL, yet it holds the previous day's close
and must be refetched. ``force=True`` (the page's refresh button) skips both
checks but still falls back to the cached slice if the refetch fails.
"""
import time

from . import cache, sessions
from .bonds import build_bonds_payload
from .equities import build_equities_payload
from .fx import build_fx_payload
from .http import Session
from .settings import BOND_TTL, EQUITY_TTL, FX_TTL
from .yahoo import YahooClient

SLICE_EQUITIES = "equities"
SLICE_FX = "fx"
SLICE_BONDS = "bonds"

_session = None
_yahoo = None


def _session_and_client():
    """Return the process-wide HTTP session and Yahoo client."""
    global _session, _yahoo
    if _session is None:
        _session = Session()
        _yahoo = YahooClient(_session)
    return _session, _yahoo


def _envelope(sliced, ttl_seconds, current_session_key):
    """Wrap a cached slice with the provenance the page displays."""
    fresh = sliced.is_fresh(ttl_seconds)
    same_session = sliced.is_current_session(current_session_key)
    return {
        "meta": {
            "source": sliced.source,
            "fetchedAt": sliced.fetched_at_sast,
            "fetchedAtEpoch": int(sliced.fetched_at),
            "ageSeconds": round(sliced.age_seconds),
            "ttlSeconds": ttl_seconds,
            "stale": not fresh,
            "live": True,
            "sessionKey": sliced.session_key,
            "sessionLabel": sessions.session_label(sliced.session_key),
            "currentSessionKey": current_session_key,
            "currentSessionLabel": sessions.session_label(current_session_key),
            "sessionStale": not same_session,
        },
        "data": sliced.data,
    }


def get_equities(force=False):
    """Return the SA equity universe at last close, cached for EQUITY_TTL."""
    session, yahoo = _session_and_client()
    now = time.time()
    current = sessions.session_key(now)

    def load():
        return cache.LoadResult(
            data=build_equities_payload(yahoo),
            source="Yahoo Finance - JSE last close",
        )

    sliced = cache.fetch_or_cache(
        SLICE_EQUITIES,
        0 if force else EQUITY_TTL,
        load,
        current,
    )
    return _envelope(sliced, EQUITY_TTL, current)


def get_fx(force=False):
    """Return the ZAR currency crosses with their history windows."""
    _session, yahoo = _session_and_client()
    now = time.time()
    current = sessions.session_key(now)

    def load():
        return cache.LoadResult(
            data=build_fx_payload(yahoo),
            source="Yahoo Finance - FX daily closes",
        )

    sliced = cache.fetch_or_cache(
        SLICE_FX,
        0 if force else FX_TTL,
        load,
        current,
    )
    return _envelope(sliced, FX_TTL, current)


def get_bonds(force=False):
    """Return the SA government bond curve, rate ladder and ratings."""
    http_session, _yahoo = _session_and_client()
    now = time.time()
    current = sessions.session_key(now)

    def load():
        return cache.LoadResult(
            data=build_bonds_payload(http_session),
            source="World Government Bonds - JSE benchmark yields",
        )

    sliced = cache.fetch_or_cache(
        SLICE_BONDS,
        0 if force else BOND_TTL,
        load,
        current,
    )
    return _envelope(sliced, BOND_TTL, current)


def get_overview(force=False):
    """Return every slice in one response for the market overview section."""
    now = time.time()
    return {
        "generatedAt": sessions.format_sast(now),
        "generatedAtEpoch": int(now),
        "sessionKey": sessions.session_key(now),
        "sessionLabel": sessions.session_label(sessions.session_key(now)),
        "equities": get_equities(force),
        "fx": get_fx(force),
        "bonds": get_bonds(force),
    }
