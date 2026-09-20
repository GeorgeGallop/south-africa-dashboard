"""Build the SA equity market payload from live JSE quotes.

Price semantics
---------------
Each row carries a price and the percentage change *of the same session*, plus
a ``basis`` flag saying which session that is:

``close``
    The regular session has ended, so the price is the settled last close and
    the change is that session's move. This is the normal state when the page
    is read outside JSE hours (09:00-17:00 SAST, Monday to Friday).
``intraday``
    The regular session is live, so the price is the current print and the
    change is measured against the previous close. The page labels this, so a
    moving number is never presented as a settled one.

``asOf`` is the newest provider quote timestamp -- the instant the prices
themselves describe -- rendered on the exchange clock (SAST). It is deliberately
not the fetch time: on a Saturday the newest quote is Friday's close, and the
page should say so rather than implying a Saturday print.
"""
import time

from . import sessions
from .listings import UNAVAILABLE, UNIVERSE
from .universe import SECTORS, yahoo_symbol

# Yahoo market states that indicate the regular session is live. During that
# window the quoted price is intraday rather than a settled close.
LIVE_STATES = {"REGULAR"}

# Yahoo quotes JSE prices in cents but market caps in whole rand.
CENTS_CURRENCY = "ZAc"

# Yahoo emits several pre-market spellings; collapse them to what the UI shows.
STATE_ALIASES = {
    "REGULAR": "REGULAR",
    "PRE": "PRE",
    "PREPRE": "PRE",
    "POST": "POST",
    "POSTPOST": "POST",
    "CLOSED": "CLOSED",
}


def _to_billions(value):
    """Convert a rand amount to billions, or ``None`` when unavailable."""
    if value is None:
        return None
    try:
        amount = float(value)
    except (TypeError, ValueError):
        return None
    return amount / 1e9


def _normalise_state(state):
    """Collapse Yahoo's market-state spellings into REGULAR/PRE/POST/CLOSED."""
    return STATE_ALIASES.get((state or "CLOSED").upper(), "CLOSED")


def _company_row(code, name, quote):
    """Turn one Yahoo quote into the row the equities page renders.

    ``p`` and ``c`` are always the same session: the settled close outside
    trading hours, or the live session while the JSE is open. ``basis`` says
    which, so the header can label the figures honestly.
    """
    if not quote:
        return None

    currency = quote.get("currency") or "ZAR"
    scale = 100.0 if currency == CENTS_CURRENCY else 1.0

    raw_price = quote.get("regularMarketPrice")
    raw_previous = quote.get("regularMarketPreviousClose")
    if raw_price is None:
        return None

    price = float(raw_price) / scale
    previous = None if raw_previous is None else float(raw_previous) / scale
    state = _normalise_state(quote.get("marketState"))

    change_pct = quote.get("regularMarketChangePercent")
    if change_pct is None and previous and previous > 0:
        change_pct = (price - previous) / previous * 100.0

    return {
        "t": code,
        "n": name,
        "p": round(price, 2),
        "c": round(float(change_pct), 2) if change_pct is not None else 0.0,
        "m": _to_billions(quote.get("marketCap")),
        "v": quote.get("regularMarketVolume"),
        "state": state,
        "basis": "intraday" if state in LIVE_STATES else "close",
        "qtime": quote.get("regularMarketTime"),
        "prev": round(previous, 2) if previous else None,
    }


def _sector_blocks(rows_by_code):
    """Group resolved rows into the 11 ICB sector buckets."""
    blocks = []
    for ident, name, icon, colour, blurb in SECTORS:
        members = [
            rows_by_code[code]
            for code, _cname, sector in UNIVERSE
            if sector == ident and code in rows_by_code
        ]
        members.sort(key=lambda row: (row["m"] or 0), reverse=True)
        if not members:
            continue
        blocks.append({
            "id": ident,
            "name": name,
            "icon": icon,
            "color": colour,
            "blurb": blurb,
            "companies": members,
        })
    return blocks


def _totals(rows):
    """Aggregate counts and market-cap total across all resolved rows.

    ``marketCapBillion`` is ``None`` -- not zero -- when no listing carried a
    market cap. The quote endpoint is the only source of caps, and when its
    crumb handshake fails the chart fallback returns prices without them; a
    zero here would be reported to the reader as a real R 0 market, so the
    absence is stated instead.
    """
    caps = [row["m"] for row in rows if row["m"] is not None]
    return {
        "listings": len(rows),
        "marketCapAvailable": bool(caps),
        "marketCapBillion": round(sum(caps), 2) if caps else None,
        "advancers": sum(1 for row in rows if row["c"] > 0),
        "decliners": sum(1 for row in rows if row["c"] < 0),
        "unchanged": sum(1 for row in rows if row["c"] == 0),
    }


def _newest_quote_epoch(rows):
    """The most recent provider quote timestamp across the resolved rows."""
    stamps = [
        row["qtime"]
        for row in rows
        if isinstance(row.get("qtime"), (int, float)) and row["qtime"] > 0
    ]
    return int(max(stamps)) if stamps else None


def build_equities_payload(client):
    """Fetch every covered listing and assemble the page payload."""
    symbols = [yahoo_symbol(code) for code, _n, _s in UNIVERSE]
    quotes = client.quotes(symbols)

    rows_by_code = {}
    missing = []
    for code, name, _sector in UNIVERSE:
        row = _company_row(code, name, quotes.get(yahoo_symbol(code)))
        if row is None:
            missing.append(code)
        else:
            rows_by_code[code] = row

    rows = list(rows_by_code.values())
    market_state = next(
        (row["state"] for row in rows if row.get("state")), "CLOSED"
    )

    captured = time.time()
    priced_at = _newest_quote_epoch(rows) or captured
    session_key = sessions.session_key(captured)

    return {
        "asOf": sessions.format_sast(priced_at),
        "asOfEpoch": int(priced_at),
        "capturedAt": sessions.format_sast(captured),
        "capturedAtEpoch": int(captured),
        "sessionKey": session_key,
        "sessionLabel": sessions.session_label(session_key),
        "sessionPhase": sessions.session_phase(captured),
        "marketState": market_state,
        "sectors": _sector_blocks(rows_by_code),
        "totals": _totals(rows),
        "unavailable": sorted(set(missing) | set(UNAVAILABLE)),
        "coverage": {
            "covered": len(UNIVERSE),
            "priced": len(rows),
            "declaredUnavailable": sorted(UNAVAILABLE),
        },
    }
