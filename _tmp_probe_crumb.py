"""Temporary probe: is the Yahoo quote-crumb handshake working right now?

Market caps come only from /v7/finance/quote, which needs a crumb. When the
handshake fails, yahoo.quotes() falls back to the chart endpoint, which carries
a price but no market cap, so every 'm' degrades to None.
"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from market.http import MarketHttpError, Session  # noqa: E402
from market.yahoo import COOKIE_URL, CRUMB_URL, YahooClient  # noqa: E402

session = Session()

print("fc.yahoo.com cookie:", end=" ")
try:
    session.get_bytes(COOKIE_URL, timeout=10)
    print("ok")
except MarketHttpError as exc:
    print(f"failed: {exc}")

print("getcrumb:", end=" ")
try:
    crumb = session.get_text(CRUMB_URL, timeout=10).strip()
    print(repr(crumb))
except MarketHttpError as exc:
    print(f"failed: {exc}")

client = YahooClient(session)
print("client.crumb:", repr(client.crumb))

quotes = client.quotes(["NPN.JO", "BHG.JO", "FSR.JO"])
print(f"quotes returned: {len(quotes)}")
for symbol, quote in sorted(quotes.items()):
    print(
        f"  {symbol:<8} price={quote.get('regularMarketPrice')} "
        f"marketCap={quote.get('marketCap')} "
        f"shares={quote.get('sharesOutstanding')}"
    )
