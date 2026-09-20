"""South African government bond market: the yield curve and the rate ladder.

Source
------
The curve is published by World Government Bonds, which aggregates the JSE's
daily benchmark government bond yields. The page hands its figures to the
browser through a small JSON endpoint, which this module calls the same way
the page does:

1. fetch the country page and read its ``jsGlobalVars`` block, and
2. POST that block back to ``/wp-json/country/v1/main``.

The response contains the current curve, the annual curve history, the spreads
of each benchmark over the SARB policy rate, the sovereign ratings and the
5-year CDS. All of it is parsed here into plain structures for the page.
"""
import json
import re
import time

COUNTRY_URL = "https://www.worldgovernmentbonds.com/country/south-africa/"
API_URL = "https://www.worldgovernmentbonds.com/wp-json/country/v1/main"

GLOBALVARS_RE = re.compile(r"var\s+jsGlobalVars\s*=\s*(\{.*?\});", re.S)

TENOR_RE = re.compile(r"^(\d+)\s+(month|year)s?")
YIELD_RE = re.compile(r"([\d.]+)\s*%")
BASIS_POINT_RE = re.compile(r"([+-]?[\d.]+)\s*bp")
NUMBER_RE = re.compile(r"[+-]?\d+(?:\.\d+)?")
TRAILING_DATE_RE = re.compile(r"\s\d{1,2}\s+[A-Za-z]{3,9}(?:\s+\d{4})?\s*$")
MONTHS_PER_YEAR = 12


def _text_of(html):
    """Flatten an HTML fragment to collapsed, tag-free text."""
    return re.sub(r"\s+", " ", re.sub(r"<[^>]+>", " ", html or "")).strip()


def _rows_of(html):
    """Return the flattened text of every ``<tr>`` in an HTML fragment."""
    rows = re.findall(r"<tr[^>]*>(.*?)</tr>", html or "", re.S)
    return [_text_of(row) for row in rows]


def _tenor_months(label):
    """Convert a ``'3 months'`` / ``'10 years'`` label to months."""
    match = TENOR_RE.match(label.strip())
    if not match:
        return None
    count, unit = int(match.group(1)), match.group(2)
    return count * MONTHS_PER_YEAR if unit == "year" else count


def _to_float(token):
    try:
        return float(token)
    except (TypeError, ValueError):
        return None


def fetch_raw(session):
    """Return the provider's parsed JSON payload for South Africa."""
    page = session.get_text(COUNTRY_URL)
    match = GLOBALVARS_RE.search(page)
    if not match:
        raise ValueError("jsGlobalVars block not found on the country page")
    globalvars = json.loads(match.group(1))
    return session.post_json(API_URL, {"GLOBALVAR": globalvars})


def parse_curve(main_table_html):
    """Parse the current benchmark curve from the ``mainTable`` fragment.

    Each row is ``<tenor> <yield>% <chg 1M> bp <chg 6M> bp <chg 12M> bp
    <zero price> <pct movements...> <capital growth> <date>``.
    """
    points = []
    for text in _rows_of(main_table_html):
        tenor_match = TENOR_RE.match(text)
        if not tenor_match:
            continue
        months = _tenor_months(text)
        if months is None:
            continue

        yield_match = YIELD_RE.search(text)
        if not yield_match:
            continue

        # Isolate the numeric tail: drop the tenor, the yield, the bp moves and
        # the trailing date, leaving the zero-coupon price and capital growth.
        remainder = text[tenor_match.end():]
        remainder = TRAILING_DATE_RE.sub("", remainder)
        remainder = BASIS_POINT_RE.sub(" ", remainder)
        remainder = YIELD_RE.sub(" ", remainder, count=1)
        numbers = [_to_float(token) for token in NUMBER_RE.findall(remainder)]
        numbers = [value for value in numbers if value is not None]

        movements = [_to_float(value) for value in BASIS_POINT_RE.findall(text)][:3]
        while len(movements) < 3:
            movements.append(None)

        points.append({
            "months": months,
            "label": f"{months // MONTHS_PER_YEAR}Y" if months >= MONTHS_PER_YEAR
                     else f"{months}M",
            "yield": _to_float(yield_match.group(1)),
            "change1mBp": movements[0],
            "change6mBp": movements[1],
            "change12mBp": movements[2],
            "zeroCouponPrice": numbers[0] if numbers else None,
            "capitalGrowth": numbers[-1] if len(numbers) > 1 else None,
        })

    points.sort(key=lambda point: point["months"])
    return points


PERIOD_RE = re.compile(r"^([A-Z][a-z]{2}\s+\d{4})\s+")
HISTORY_ORDER = ["1M", "3M", "6M", "1Y", "2Y", "3Y", "5Y", "7Y", "10Y", "30Y"]
NOT_AVAILABLE = {"n.a.", "n.a", "-", ""}


def _cell_to_float(cell):
    if cell.strip().lower() in NOT_AVAILABLE:
        return None
    return _to_float(cell)


def parse_history(history_table_html):
    """Parse the annual benchmark history into one entry per period."""
    periods = []
    for text in _rows_of(history_table_html):
        match = PERIOD_RE.match(text)
        if not match:
            continue
        period = match.group(1)
        cells = text[match.end():].split()
        if len(cells) < len(HISTORY_ORDER):
            continue

        yields = {
            tenor: _cell_to_float(cells[index])
            for index, tenor in enumerate(HISTORY_ORDER)
        }
        spread = _cell_to_float(cells[len(HISTORY_ORDER)]) if len(cells) > len(
            HISTORY_ORDER) else None

        periods.append({
            "period": period,
            "yields": yields,
            "spread10y2yBp": spread,
        })
    return periods


def parse_spreads(spread_table_html):
    """Parse yields and their spread over the policy rate, by benchmark."""
    entries = []
    for text in _rows_of(spread_table_html):
        months = _tenor_months(text)
        if months is None:
            continue
        yield_match = YIELD_RE.search(text)
        if not yield_match:
            continue

        # The final bp figure in each row is the spread over the policy rate.
        spreads = BASIS_POINT_RE.findall(text)
        entries.append({
            "months": months,
            "label": f"{months // MONTHS_PER_YEAR}Y" if months >= MONTHS_PER_YEAR
                     else f"{months}M",
            "yield": _to_float(yield_match.group(1)),
            "spreadOverPolicyBp": _to_float(spreads[-1]) if spreads else None,
        })
    entries.sort(key=lambda entry: entry["months"])
    return entries


AGENCY_NAMES = (
    "Standard & Poor's",
    "Moody's Investors Service",
    "Fitch Ratings",
    "DBRS",
    "Scope Ratings",
)
# A rating may carry a +/- modifier; a trailing \b would reject it, so use a
# negative lookahead instead.
RATING_RE = re.compile(
    r"\b(AA[+-]?|A[+-]?|BBB[+-]?|BB[+-]?|B[+-]?|CCC[+-]?|"
    r"Aa[123]|A[123]|Baa[123]|Ba[123]|B[123]|Caa[123])(?![A-Za-z0-9])"
)
OUTLOOK_RE = re.compile(r"\b(positive|negative|stable)\b", re.I)
RATING_DATE_RE = re.compile(r"\d{1,2}\s+[A-Za-z]{3}\s+\d{4}")


def parse_ratings(rating_table_html):
    """Parse the sovereign rating panel into agency entries."""
    ratings = []
    for text in _rows_of(rating_table_html):
        agency = next((name for name in AGENCY_NAMES if text.startswith(name)), None)
        if not agency:
            continue

        rating_match = RATING_RE.search(text)
        outlook_match = OUTLOOK_RE.search(text)
        date_match = RATING_DATE_RE.search(text)
        ratings.append({
            "agency": agency,
            "rating": rating_match.group(1) if rating_match else None,
            "outlook": outlook_match.group(1).lower() if outlook_match else None,
            "asOf": date_match.group(0) if date_match else None,
        })
    return ratings


def _yield_at(curve, months):
    """Return the curve yield at ``months``, or ``None`` when absent."""
    for point in curve:
        if point["months"] == months:
            return point["yield"]
    return None


def _basis_points(later, earlier):
    """Difference between two yields expressed in basis points."""
    if later is None or earlier is None:
        return None
    return round((later - earlier) * 100, 1)


def _curve_shape(curve, policy_rate):
    """Describe the curve's level, slope and long-end inversion."""
    yield_3m = _yield_at(curve, 3)
    yield_5y = _yield_at(curve, 60)
    yield_10y = _yield_at(curve, 120)
    yield_20y = _yield_at(curve, 240)
    yield_30y = _yield_at(curve, 360)

    return {
        "policySpread10yBp": _basis_points(yield_10y, policy_rate),
        "slope3m10yBp": _basis_points(yield_10y, yield_3m),
        "slope5y10yBp": _basis_points(yield_10y, yield_5y),
        "slope10y30yBp": _basis_points(yield_30y, yield_10y),
        "longEndInverted": (
            yield_20y is not None and yield_30y is not None
            and yield_30y < yield_20y
        ),
        "peakMonths": max(
            (point for point in curve if point["yield"] is not None),
            key=lambda point: point["yield"],
        )["months"] if curve else None,
    }


def build_bonds_payload(session):
    """Fetch and assemble the SA bond market payload."""
    raw = fetch_raw(session)

    curve = parse_curve(raw.get("mainTable"))
    policy_rate = _to_float(raw.get("cbRateNumber"))

    return {
        "asOf": raw.get("lastDataValDesc"),
        "lastUpdate": raw.get("lastTimeValDesc"),
        "fetchedAt": time.strftime("%Y-%m-%dT%H:%M:%S"),
        "source": "World Government Bonds (JSE daily benchmark yields)",
        "currency": "ZAR",
        "policyRate": {
            "label": "SARB policy (repo) rate",
            "rate": policy_rate,
            "asOf": raw.get("cbRateDate"),
        },
        "benchmark10y": _to_float(raw.get("bond10y")),
        "curve": curve,
        "history": parse_history(raw.get("historyTable")),
        "spreadsVsPolicy": parse_spreads(raw.get("domesticSpreadTable")),
        "ratings": parse_ratings(raw.get("ratingTable")),
        "cds5yBp": _to_float(raw.get("lastCds")),
        "shape": _curve_shape(curve, policy_rate),
    }
