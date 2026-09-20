"""Paths, timeouts and tunables shared by the market data modules."""
from pathlib import Path

# Dashboard root = the directory that contains this package's parent.
ROOT = Path(__file__).resolve().parent.parent
DATA_DIR = ROOT / "data"
CACHE_FILE = DATA_DIR / "market-cache.json"

# --- HTTP ---------------------------------------------------------------
# A desktop browser user-agent is required: Yahoo Finance answers HTTP 429 to
# the default urllib agent, and other providers reject it outright.
USER_AGENT = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36"
)
REQUEST_TIMEOUT = 15  # seconds, per request

# --- Cache --------------------------------------------------------------
# How long a cached slice stays fresh before it is refetched.
EQUITY_TTL = 15 * 60          # 15 minutes
FX_TTL = 5 * 60               # 5 minutes
BOND_TTL = 30 * 60            # 30 minutes
RATES_TTL = 6 * 60 * 60       # 6 hours (the upstream series are monthly)

# JSE trades 09:00-17:00 SAST (UTC+2), Monday to Friday, no daylight saving.
JSE_OPEN_MINUTE = 9 * 60
JSE_CLOSE_MINUTE = 17 * 60
SAST_OFFSET_HOURS = 2
