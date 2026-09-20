"""Throwaway probe 2: locate a machine-readable SA government bond curve."""
import re
import urllib.request

UA = ("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
      "(KHTML, like Gecko) Chrome/122.0 Safari/537.36")


def fetch(url, timeout=20):
    req = urllib.request.Request(url, headers={
        "User-Agent": UA,
        "Accept": "text/html,application/json,text/csv,*/*",
    })
    with urllib.request.urlopen(req, timeout=timeout) as resp:
        raw = resp.read()
        return resp.status, resp.headers.get("Content-Type", ""), raw


URLS = [
    ("WGB country page", "https://www.worldgovernmentbonds.com/country/south-africa/"),
    ("WGB 10y history", "https://www.worldgovernmentbonds.com/bond-historical-data/south-africa/10-years/"),
    ("Stooq 10zab.b", "https://stooq.com/q/d/l/?s=10zab.b&i=d"),
    ("Stooq 10zab", "https://stooq.com/q/d/l/?s=10zab&i=d"),
    ("Moneyweb bonds", "https://www.moneyweb.co.za/market-data/bonds/"),
    ("Investing ZA10Y", "https://www.investing.com/rates-bonds/south-africa-10-year-bond-yield"),
    ("FRED ZA repo", "https://fred.stlouisfed.org/graph/fredgraph.csv?id=IRSTCB01ZAM156N"),
    ("FRED ZA call", "https://fred.stlouisfed.org/graph/fredgraph.csv?id=IRSTCI01ZAM156N"),
    ("FRED ZA 3M CD", "https://fred.stlouisfed.org/graph/fredgraph.csv?id=IR3TCD01ZAM156N"),
]

for label, url in URLS:
    try:
        status, ctype, raw = fetch(url)
        text = raw.decode("utf-8", "replace")
        sniff = re.sub(r"\s+", " ", text[:180])
        print(f"[{status}] {label:<18} {ctype[:28]:<28} {len(raw):>7}B")
        print(f"      {sniff}")
    except Exception as exc:
        print(f"[ERR] {label:<18} {type(exc).__name__}: {exc}")

print("\n=== WGB script srcs / async endpoints ===")
try:
    _, _, raw = fetch("https://www.worldgovernmentbonds.com/country/south-africa/")
    text = raw.decode("utf-8", "replace")
    for match in sorted(set(re.findall(r'src="([^"]+\.js[^"]*)"', text))):
        print("  JS   ", match)
    for match in sorted(set(re.findall(r'(https?://[^"\'\\s]*async[^"\'\\s]*)', text))):
        print("  ASYNC", match)
    for match in sorted(set(re.findall(r'["\'](/[^"\']*\.php[^"\']*)["\']', text))):
        print("  PHP  ", match)
except Exception as exc:
    print("  WGB scan failed:", exc)
