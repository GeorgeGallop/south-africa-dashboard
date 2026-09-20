"""Temporary probe: with the server now threaded, a burst of RSS proxy fetches
must not delay the market endpoints."""
import threading
import time
import urllib.parse
import urllib.request

BASE = "http://localhost:3101"
MARKET = f"{BASE}/api/market/equities"
FX = f"{BASE}/api/market/fx"
FEEDS = [
    "https://www.moneyweb.co.za/feed/",
    "https://www.dailymaverick.co.za/feed/",
    "https://mg.co.za/feed/",
    "https://www.miningweekly.com/page/feed",
    "https://www.esi-africa.com/feed/",
    "https://techcentral.co.za/feed/",
    "https://www.sabcnews.com/sabcnews/feed/",
    "https://www.africanews.com/feed/rss",
]


def timed(url, timeout=60):
    start = time.time()
    try:
        with urllib.request.urlopen(url, timeout=timeout) as response:
            body = response.read()
        return round((time.time() - start) * 1000), len(body), None
    except Exception as exc:  # noqa: BLE001 - reported, not raised
        return round((time.time() - start) * 1000), 0, str(exc)


print("--- warm the cache ---")
ms, size, err = timed(MARKET)
print(f"  equities: {ms} ms, {size} bytes, err={err}")

print("--- idle, warm ---")
ms, size, err = timed(MARKET)
print(f"  equities: {ms} ms, {size} bytes, err={err}")
ms, size, err = timed(FX)
print(f"  fx:       {ms} ms, {size} bytes, err={err}")

print("--- market request while all 8 feeds are in flight ---")
results = {}


def background_rss(index, feed):
    results[index] = timed(f"{BASE}/api/rss?url={urllib.parse.quote(feed, safe='')}", timeout=60)


threads = [
    threading.Thread(target=background_rss, args=(i, feed))
    for i, feed in enumerate(FEEDS)
]
for thread in threads:
    thread.start()
time.sleep(0.5)

ms, size, err = timed(MARKET)
print(f"  equities during 8 feeds: {ms} ms, {size} bytes, err={err}")
ms, size, err = timed(FX)
print(f"  fx during 8 feeds:       {ms} ms, {size} bytes, err={err}")

for thread in threads:
    thread.join()
by_feed = {FEEDS[i]: results[i][0] for i in sorted(results)}
print("  feed timings (ms):")
for feed, ms in by_feed.items():
    print(f"    {ms:>6}  {feed}")
