"""Temporary check: after the crumb retry fix, a forced equities refresh must
carry market caps again."""
import json
import urllib.request

URL = "http://localhost:3101/api/market/equities?refresh=1"

with urllib.request.urlopen(URL, timeout=180) as response:
    envelope = json.load(response)

data = envelope["data"]
totals = data["totals"]
print("asOf           :", data.get("asOf"))
print("sessionLabel   :", data.get("sessionLabel"))
print("marketCapAvail :", totals.get("marketCapAvailable"))
print("marketCapBillion:", totals.get("marketCapBillion"))
print("listings       :", totals.get("listings"))
print("meta.sessionStale:", envelope["meta"].get("sessionStale"))

rows = []
for sector in data["sectors"]:
    for company in sector["companies"]:
        rows.append((company.get("m"), company["t"], company["n"], company["p"]))
priced = [row for row in rows if isinstance(row[0], (int, float))]
print("rows with a market cap:", len(priced), "of", len(rows))

for cap, ticker, name, price in sorted(priced, reverse=True)[:5]:
    print(f"  {ticker:<6} {name[:26]:<26} close={price:>10} cap={cap:,.1f} R bn")

if not priced:
    print("NO MARKET CAPS RETURNED")
