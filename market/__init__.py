"""Server-side market data for the South Africa Dashboard.

This package fetches real market data (JSE equities, ZAR currency crosses,
SA government bond yields and the domestic rate ladder) and serves it to the
browser through the dashboard's own HTTP API. All network access happens
server-side so the pages never hit CORS restrictions, and every successful
fetch is cached on disk so a page still renders the last good values when a
source is temporarily unreachable.

Only the Python standard library is used.
"""

__all__ = ["settings"]
