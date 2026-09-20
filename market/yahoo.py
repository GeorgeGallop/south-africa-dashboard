"""Yahoo Finance client for JSE equities, ZAR crosses and index levels.

Two endpoints are used:

``/v8/finance/chart/{symbol}``
    Always available without authentication. Returns meta plus a daily close
    series, which is enough for a last close and a day change.

``/v7/finance/quote``
    Richer (market cap, shares outstanding, market state) but requires a
    "crumb" token tied to a session cookie. The handshake -- hit
    ``fc.yahoo.com`` for the cookie, then ``/v1/test/getcrumb`` for the token
    -- is performed once per client and reused for every batch.
"""
import time
import urllib.parse

from .http import MarketHttpError, Session
from .settings import REQUEST_TIMEOUT

CHART_URL = "https://query2.finance.yahoo.com/v8/finance/chart/{symbol}"
QUOTE_URL = "https://query2.finance.yahoo.com/v7/finance/quote"
CRUMB_URL = "https://query1.finance.yahoo.com/v1/test/getcrumb"
COOKIE_URL = "https://fc.yahoo.com"

# Yahoo returns JSE prices in cents (currency ``ZAc``) on the chart endpoint.
CENTS_CURRENCY = "ZAc"
QUOTE_BATCH_SIZE = 25

# How long to wait before retrying a failed crumb handshake. A handshake that
# failed once is not latched for the life of the process: that would pin every
# later fetch to the chart endpoint, which reports a price but no market cap,
# and the page would show a zero market-cap total with no explanation.
CRUMB_RETRY_SECONDS = 120

QUOTE_FIELDS = (
    "symbol,shortName,longName,currency,regularMarketPrice,regularMarketChange,"
    "regularMarketChangePercent,regularMarketPreviousClose,regularMarketTime,"
    "marketCap,sharesOutstanding,marketState,exchangeName,fullExchangeName,"
    "regularMarketVolume,fiftyTwoWeekHigh,fiftyTwoWeekLow"
)


def to_rands(value, currency):
    """Normalise a JSE quote expressed in cents back to rand."""
    if value is None:
        return None
    try:
        number = float(value)
    except (TypeError, ValueError):
        return None
    if currency == CENTS_CURRENCY:
        return number / 100.0
    return number


class YahooClient:
    """Session-bound Yahoo Finance reader."""

    def __init__(self, session=None):
        self.session = session or Session()
        self._crumb = None
        self._crumb_attempted_at = None

    # -- authentication --------------------------------------------------
    @property
    def crumb(self):
        """The quote-API crumb, or ``None`` while the handshake is failing.

        A successful handshake is kept for the life of the client. A failed one
        is retried on a later call rather than latched, so a single transient
        error cannot pin every subsequent fetch to the chart endpoint -- which
        reports a price but no market cap -- until the process is restarted.
        """
        if self._crumb:
            return self._crumb

        now = time.time()
        retry_due = (
            self._crumb_attempted_at is None
            or now - self._crumb_attempted_at >= CRUMB_RETRY_SECONDS
        )
        if not retry_due:
            return None

        self._crumb_attempted_at = now
        self._crumb = self._fetch_crumb()
        return self._crumb

    def _fetch_crumb(self):
        try:
            self.session.get_bytes(COOKIE_URL, timeout=REQUEST_TIMEOUT)
        except MarketHttpError:
            # fc.yahoo.com answers 404 on purpose; the Set-Cookie still lands,
            # so a failure here is not fatal -- try the crumb anyway.
            pass
        try:
            return self.session.get_text(CRUMB_URL, timeout=REQUEST_TIMEOUT).strip() or None
        except MarketHttpError:
            return None

    # -- quotes ----------------------------------------------------------
    def quotes(self, symbols):
        """Batch quote lookup. Returns ``{symbol: quote_dict}``.

        Falls back to the unauthenticated chart endpoint when the crumb
        handshake is unavailable, so market caps degrade to ``None`` rather
        than the whole refresh failing.
        """
        if not symbols:
            return {}
        crumb = self.crumb
        if not crumb:
            return self._quotes_via_chart(symbols)

        collected = {}
        for start in range(0, len(symbols), QUOTE_BATCH_SIZE):
            batch = symbols[start:start + QUOTE_BATCH_SIZE]
            query = urllib.parse.urlencode({
                "symbols": ",".join(batch),
                "fields": QUOTE_FIELDS,
                "crumb": crumb,
            })
            try:
                payload = self.session.get_json(f"{QUOTE_URL}?{query}")
            except MarketHttpError:
                continue
            for row in (payload.get("quoteResponse") or {}).get("result") or []:
                symbol = row.get("symbol")
                if symbol:
                    collected[symbol] = row
        return collected or self._quotes_via_chart(symbols)

    def _quotes_via_chart(self, symbols):
        collected = {}
        for symbol in symbols:
            try:
                meta, _ = self.chart(symbol, range_="1mo", interval="1d")
            except MarketHttpError:
                continue
            collected[symbol] = meta
        return collected

    # -- charts ----------------------------------------------------------
    def chart(self, symbol, range_="1mo", interval="1d"):
        """Return ``(meta, closes)`` where closes is a list of daily points."""
        query = urllib.parse.urlencode({
            "range": range_,
            "interval": interval,
            "events": "history",
        })
        url = CHART_URL.format(symbol=urllib.parse.quote(symbol)) + "?" + query
        payload = self.session.get_json(url)
        results = (payload.get("chart") or {}).get("result") or []
        if not results:
            error = ((payload.get("chart") or {}).get("error") or {}).get("description")
            raise MarketHttpError(f"{symbol}: no chart result ({error or 'unknown'})")

        result = results[0]
        return result.get("meta") or {}, _closes_from(result)


def _closes_from(result):
    """Zip the timestamps and closes of a chart result into daily points."""
    stamps = result.get("timestamp") or []
    quote_blocks = ((result.get("indicators") or {}).get("quote") or [{}])
    closes = quote_blocks[0].get("close") or []
    points = []
    for stamp, close in zip(stamps, closes):
        if close is None:
            continue
        points.append({"t": int(stamp), "c": float(close)})
    return points
