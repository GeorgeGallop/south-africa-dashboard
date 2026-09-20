"""Throwaway probe 5: verify WGB curve endpoint + Yahoo market-cap sourcing."""
import json
import re
import urllib.request

UA = ("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
      "(KHTML, like Gecko) Chrome/122.0 Safari/537.36")

# ---------- 1. World Government Bonds curve endpoint ----------
ENDPOINT = "https://www.worldgovernmentbonds.com/wp-json/country/v1/main"
GLOBALVAR = {
    "JS_VARIABLE": "jsGlobalVars",
    "FUNCTION": "Country",
    "DOMESTIC": True,
    "ENDPOINT": "https://www.worldgovernmentbonds.com/wp-json/country/v1/historical",
    "DATE_RIF": "2099-12-31",
    "OBJ": None,
    "COUNTRY1": {
        "SYMBOL": "28",
        "PAESE": "South Africa",
        "PAESE_UPPERCASE": "SOUTH AFRICA",
        "BANDIERA": "za",
        "URL_PAGE": "south-africa",
    },
    "COUNTRY2": None,
    "OBJ1": None,
    "OBJ2": None,
}

print("=" * 70)
print("WGB /wp-json/country/v1/main")
print("=" * 70)
try:
    body = json.dumps({"GLOBALVAR": GLOBALVAR}).encode("utf-8")
    req = urllib.request.Request(ENDPOINT, data=body, headers={
        "User-Agent": UA,
        "Content-Type": "application/json",
        "Accept": "application/json, text/plain, */*",
        "Referer": "https://www.worldgovernmentbonds.com/country/south-africa/",
    })
    with urllib.request.urlopen(req, timeout=25) as resp:
        payload = json.load(resp)
    print("keys:", list(payload.keys()))
    inner = payload.get("result") or payload.get("data") or payload
    if isinstance(inner, dict):
        for key in ("bond10y", "mainTable", "domesticSpreadTable", "historyTable",
                    "cbRateNumber", "lastTimeValDesc"):
            value = inner.get(key)
            if value is None:
                continue
            preview = re.sub(r"\s+", " ", str(value))
            print("\n--- " + key + " ---")
            print(preview[:900])
except Exception as exc:
    print("FAILED:", type(exc).__name__, exc)

# ---------- 2. Yahoo: can we get market cap without a crumb? ----------
print("\n" + "=" * 70)
print("Yahoo market-cap probes")
print("=" * 70)


def get(url):
    req = urllib.request.Request(url, headers={"User-Agent": UA})
    with urllib.request.urlopen(req, timeout=20) as resp:
        return json.load(resp)


for label, url in [
    ("v7 quote (NPN,JSE,MTN)",
     "https://query2.finance.yahoo.com/v7/finance/quote?symbols=NPN.JO,JSE.JO,MTN.JO"),
    ("v6 quoteSummary NPN",
     "https://query2.finance.yahoo.com/v6/finance/quoteSummary/NPN.JO?modules=price,defaultKeyStatistics"),
]:
    try:
        data = get(url)
        print(f"[OK] {label}")
        print("     " + re.sub(r"\s+", " ", json.dumps(data))[:700])
    except Exception as exc:
        print(f"[ERR] {label}: {type(exc).__name__}: {exc}")
