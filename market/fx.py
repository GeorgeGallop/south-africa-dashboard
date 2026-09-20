"""ZAR currency crosses with history windows.

One daily chart request per pair yields everything the page needs: the latest
close, the day move, window returns (1W through 1Y) and a sparkline series.
An equal-weighted ZAR strength index is derived from the crosses and is
labelled as derived in the payload, because it is a construct of this
dashboard rather than a published benchmark.
"""
import time

from . import sessions

# Yahoo symbol, display code, label, foreign currency.
PAIRS = [
    ("USDZAR=X", "USDZAR", "USD/ZAR", "USD"),
    ("EURZAR=X", "EURZAR", "EUR/ZAR", "EUR"),
    ("GBPZAR=X", "GBPZAR", "GBP/ZAR", "GBP"),
    ("JPYZAR=X", "JPYZAR", "JPY/ZAR", "JPY"),
    ("AUDZAR=X", "AUDZAR", "AUD/ZAR", "AUD"),
    ("CHFZAR=X", "CHFZAR", "CHF/ZAR", "CHF"),
    ("CNYZAR=X", "CNYZAR", "CNY/ZAR", "CNY"),
]

# Look-back windows expressed in JSE trading sessions.
WINDOW_SESSIONS = {
    "1W": 5,
    "1M": 21,
    "3M": 63,
    "6M": 126,
    "1Y": 252,
}

SPARKLINE_POINTS = 60
CHART_RANGE = "1y"


def _percent_change(current, past):
    """Percentage change from ``past`` to ``current``, or ``None``."""
    if current is None or past in (None, 0):
        return None
    return (current - past) / past * 100.0


def _window_returns(closes):
    """Compute each look-back window's return from a daily close list."""
    returns = {}
    latest = closes[-1] if closes else None
    for label, lookback in WINDOW_SESSIONS.items():
        past = closes[-1 - lookback] if len(closes) > lookback else None
        value = _percent_change(latest, past)
        returns[label] = round(value, 2) if value is not None else None
    return returns


def _sparkline(points):
    """Trim a daily series to the sparkline window as ``[epoch_ms, value]``."""
    trimmed = points[-SPARKLINE_POINTS:]
    return [[point["t"] * 1000, round(point["c"], 4)] for point in trimmed]


def _pair_payload(client, symbol, code, label, foreign):
    """Fetch one cross and reduce it to the page's shape."""
    meta, points = client.chart(symbol, range_=CHART_RANGE, interval="1d")
    closes = [point["c"] for point in points]
    if not closes:
        return None

    latest = closes[-1]
    previous = closes[-2] if len(closes) > 1 else None
    year = closes[-WINDOW_SESSIONS["1Y"]:] if len(closes) > 1 else closes

    return {
        "code": code,
        "label": label,
        "foreign": foreign,
        "spot": round(latest, 4),
        "previous": round(previous, 4) if previous else None,
        "changePct": (
            round(_percent_change(latest, previous), 2)
            if previous is not None
            else None
        ),
        "windows": _window_returns(closes),
        "high1y": round(max(year), 4) if year else None,
        "low1y": round(min(year), 4) if year else None,
        "avg1y": round(sum(year) / len(year), 4) if year else None,
        "sessions": len(closes),
        "series": _sparkline(points),
    }


def _zar_strength_index(pairs):
    """Equal-weighted ZAR strength: average of each cross rebased to 100.

    A rising value means the rand strengthened against the basket. This is a
    dashboard construct, not a published index, and is labelled as such.
    """
    usable = [p for p in pairs if p and len(p["series"]) > 1]
    if not usable:
        return None

    length = min(len(p["series"]) for p in usable)
    stamps = usable[0]["series"][-length:]
    index = []
    for offset in range(length):
        ratios = []
        for pair in usable:
            series = pair["series"][-length:]
            base = series[0][1]
            if base:
                ratios.append(series[offset][1] / base)
        if not ratios:
            continue
        average = sum(ratios) / len(ratios)
        index.append([stamps[offset][0], round(100.0 / average, 3)])

    if not index:
        return None

    latest_change = None
    if len(index) > 1 and index[-2][1]:
        latest_change = (index[-1][1] - index[-2][1]) / index[-2][1] * 100.0

    return {
        "label": "Equal-weighted ZAR vs majors",
        "note": "Derived: each cross rebased to 100 at the start of the window, "
                "then averaged and inverted (up = rand stronger).",
        "level": index[-1][1],
        "changePct": round(latest_change, 2) if latest_change is not None else None,
        "series": index,
    }


def build_fx_payload(client):
    """Fetch every ZAR cross and assemble the currency payload."""
    pairs = [
        _pair_payload(client, symbol, code, label, foreign)
        for symbol, code, label, foreign in PAIRS
    ]
    pairs = [pair for pair in pairs if pair]

    captured = time.time()
    session_key = sessions.session_key(captured)

    return {
        "asOf": sessions.format_sast(captured),
        "asOfEpoch": int(captured),
        "sessionKey": session_key,
        "sessionLabel": sessions.session_label(session_key),
        "source": "Yahoo Finance FX daily closes",
        "windows": list(WINDOW_SESSIONS.keys()),
        "pairs": pairs,
        "zarIndex": _zar_strength_index(pairs),
    }
