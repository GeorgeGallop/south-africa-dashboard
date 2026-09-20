"""Throwaway probe: which Yahoo symbols return usable data?"""
import json
import urllib.request

UA = ("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
      "(KHTML, like Gecko) Chrome/122.0 Safari/537.36")

CANDIDATES = [
    # JSE indices
    "^J203.JO", "^JN0U.JO", "^J200.JO", "^JSE.JO", "^TOP40.JO", "^J201.JO",
    "^JOBS.JO", "^JALSH.JO", "^JN0U", "^J203",
    # SA govt bond yields (Reuters-style / Yahoo variants)
    "ZA10Y=RR", "ZA10YR=RR", "ZAR10YR=X", "SA10Y=X", "ZAR10Y=X",
    "R2030.JO", "R2035.JO", "R2048.JO", "^ZA10Y", "ZAGB10",
    "SA10YT=RR", "ZA2Y=RR", "ZA5Y=RR",
    # FX
    "USDZAR=X", "EURZAR=X", "GBPZAR=X", "ZAR=X",
    # Cross-check commodities
    "GC=F", "PL=F", "BZ=F",
]


def probe(symbol: str):
    url = (f"https://query2.finance.yahoo.com/v8/finance/chart/"
           f"{urllib.parse.quote(symbol)}?range=1mo&interval=1d")
    req = urllib.request.Request(url, headers={"User-Agent": UA})
    try:
        with urllib.request.urlopen(req, timeout=12) as resp:
            payload = json.load(resp)
    except Exception as exc:
        return symbol, None, f"ERR {type(exc).__name__}: {exc}"

    result = (payload.get("chart") or {}).get("result")
    if not result:
        err = ((payload.get("chart") or {}).get("error") or {})
        return symbol, None, f"no result ({err.get('description', 'unknown')})"

    meta = result[0].get("meta") or {}
    closes = (((result[0].get("indicators") or {}).get("quote") or [{}])[0]
              .get("close") or [])
    last = next((c for c in reversed(closes) if c is not None), None)
    return symbol, {
        "currency": meta.get("currency"),
        "price": meta.get("regularMarketPrice"),
        "prevClose": meta.get("chartPreviousClose") or meta.get("previousClose"),
        "lastClose": last,
        "lastClose2": next((c for c in reversed(closes[:-1]) if c is not None), None),
        "type": meta.get("instrumentType"),
        "name": meta.get("longName") or meta.get("shortName"),
        "tz": meta.get("exchangeTimezoneName"),
    }, "ok"


import urllib.parse  # noqa: E402

for sym in CANDIDATES:
    symbol, info, status = probe(sym)
    if info is None:
        print(f"{symbol:<12} MISS   {status}")
    else:
        name = (info["name"] or "")[:34]
        print(f"{symbol:<12} OK     {info['type']:<8} {str(info['currency']):<5} "
              f"px={info['price']} lastClose={info['lastClose']} "
              f"prev={info['prevClose']} | {name}")
