#!/usr/bin/env python3
"""
South Africa Dashboard — static server + To-Do persistence API.

Serves the dashboard files and exposes a tiny API that writes the
to-do list into the codebase (data/todo.json), so added items are
actually saved to disk and survive a browser cache / profile wipe.

  GET  /api/todo  ->  {"items": [...], "savedAt": "..."}
  PUT  /api/todo  ->  writes the JSON body to data/todo.json

Market data, fetched server-side and cached under data/market-cache.json:

  GET  /api/market/equities  ->  JSE last close, day change and market cap
  GET  /api/market/fx        ->  ZAR crosses with 1W-1Y windows
  GET  /api/market/bonds     ->  SA government yield curve, rate ladder, ratings
  GET  /api/market/overview  ->  all three series in one response

Append ?refresh=1 to any of them to bypass a fresh cache entry.

Run:
    py server.py
Then open:
    http://localhost:3101/pages/todo.html

Only Python's standard library is used (no pip install).
"""
import json
import os
import socket
import urllib.request
import urllib.parse
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

# Market data API. Imported defensively so a fault in a market module never
# takes down the static server or the to-do API.
try:
    from market import service as market_service
except Exception as _market_exc:  # pragma: no cover - reported at startup
    market_service = None
    print(f"[market] market API disabled: {_market_exc}")

PORT = int(os.environ.get("PORT", 3101))
ROOT = Path(__file__).resolve().parent
TODO_FILE = ROOT / "data" / "todo.json"

# How long to wait when proxying a remote RSS/HTML feed for the news page.
# Keep this below the browser-side fetch timeout (FETCH_TIMEOUT_MS = 10s)
# so a slow upstream feed fails-server-side before the browser aborts.
FETCH_TIMEOUT = 8  # seconds

# Files served with a long cache lifetime. The to-do page itself is
# served normally so edits always show up on refresh.
NO_CACHE = {"/pages/todo.html"}


class Handler(SimpleHTTPRequestHandler):
    """Serves static files and handles the /api/todo read/write API."""

    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(ROOT), **kwargs)

    # ---------- helpers ----------
    def _send_json(self, code, payload):
        body = json.dumps(payload).encode("utf-8")
        try:
            self.send_response(code)
            self.send_header("Content-Type", "application/json")
            self.send_header("Content-Length", str(len(body)))
            self.send_header("Access-Control-Allow-Origin", "*")
            self.end_headers()
            self.wfile.write(body)
        except (BrokenPipeError, ConnectionAbortedError, ConnectionResetError):
            # The browser aborted the request (navigation, cancelled feed fetch).
            # Nothing to send and nowhere to send it, so drop it quietly.
            pass

    def _read_todo(self):
        if TODO_FILE.exists():
            try:
                return json.loads(TODO_FILE.read_text(encoding="utf-8"))
            except Exception:
                return None
        return None

    def _handle_put(self):
        length = int(self.headers.get("Content-Length", 0) or 0)
        raw = self.rfile.read(length)
        try:
            payload = json.loads(raw.decode("utf-8"))
        except Exception:
            self._send_json(400, {"error": "Body is not valid JSON"})
            return

        if not isinstance(payload, dict) or not isinstance(payload.get("items"), list):
            self._send_json(400, {"error": 'Expected {"items": [...], "savedAt": "..."}'})
            return

        TODO_FILE.parent.mkdir(parents=True, exist_ok=True)
        TODO_FILE.write_text(
            json.dumps(payload, indent=2, ensure_ascii=False),
            encoding="utf-8",
        )
        self._send_json(200, {"ok": True, "count": len(payload["items"])})

    # ---------- RSS/HTML fetch proxy (used by the news page) ----------
    def _handle_fetch(self):
        query = urllib.parse.parse_qs(urllib.parse.urlparse(self.path).query)
        target = (query.get("url") or [""])[0]
        if not target:
            self._send_json(400, {"error": "Missing 'url' parameter"})
            return
        target = target.strip()
        # Only allow http/https to avoid SSRF into local files.
        if not (target.startswith("http://") or target.startswith("https://")):
            self._send_json(400, {"error": "Only http/https URLs are allowed"})
            return
        try:
            req = urllib.request.Request(target, headers={
                "User-Agent": (
                    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
                    "AppleWebKit/537.36 (KHTML, like Gecko) "
                    "Chrome/120.0.0.0 Safari/537.36"
                ),
                "Accept": "application/rss+xml, application/xml, text/xml, text/html, */*",
            })
            with urllib.request.urlopen(req, timeout=FETCH_TIMEOUT) as resp:
                body = resp.read()
                content_type = resp.headers.get("Content-Type", "application/octet-stream")
            self.send_response(200)
            self.send_header("Content-Type", content_type)
            self.send_header("Content-Length", str(len(body)))
            self.send_header("Access-Control-Allow-Origin", "*")
            self.end_headers()
            self.wfile.write(body)
        except Exception as exc:
            self._send_json(502, {"error": str(exc)})

    # ---------- HTTP methods ----------
    def _route(self):
        path = self.path.split("?", 1)[0]
        if path == "/api/todo":
            if self.command == "GET":
                data = self._read_todo()
                if data is None:
                    self._send_json(404, {"error": "Todo file not created yet"})
                else:
                    self._send_json(200, data)
            elif self.command in ("PUT", "POST"):
                self._handle_put()
            else:
                self._send_json(405, {"error": "Method not allowed"})
            return True
        # Market data backing the equities, currency and bond views.
        if path.startswith("/api/market/"):
            if self.command == "GET":
                self._handle_market()
            else:
                self._send_json(405, {"error": "Method not allowed"})
            return True
        # RSS / HTML fetch proxy for the news page. Serves the remote feed
        # server-side so the browser never hits CORS or flaky public proxies.
        if path in ("/api/rss", "/api/fetch"):
            if self.command == "GET":
                self._handle_fetch()
            else:
                self._send_json(405, {"error": "Method not allowed"})
            return True
        return False

    # ---------- market data API ----------
    # Series name -> service function, served under /api/market/<series>.
    MARKET_BUILDERS = {
        "equities": "get_equities",
        "fx": "get_fx",
        "bonds": "get_bonds",
        "overview": "get_overview",
    }

    def _handle_market(self):
        """Serve a market series, optionally forcing a cache refresh."""
        if market_service is None:
            self._send_json(503, {"error": "Market data module unavailable"})
            return

        parts = urllib.parse.urlparse(self.path)
        series = parts.path.rstrip("/").rsplit("/", 1)[-1]
        builder = self.MARKET_BUILDERS.get(series)
        if builder is None:
            self._send_json(404, {"error": f"Unknown market series '{series}'"})
            return

        force = "refresh=1" in (parts.query or "")
        try:
            self._send_json(200, getattr(market_service, builder)(force))
        except Exception as exc:  # noqa: BLE001 - surfaced to the page as 502
            self._send_json(502, {"error": str(exc)})

    def do_GET(self):
        if self._route():
            return
        # SimpleHTTPRequestHandler handles the static file itself.
        super().do_GET()

    def do_PUT(self):
        if self._route():
            return
        self._send_json(404, {"error": "Not found"})

    def do_POST(self):
        if self._route():
            return
        self._send_json(404, {"error": "Not found"})

    def do_OPTIONS(self):
        # CORS preflight (needed only if the page is opened via file://)
        self.send_response(204)
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, PUT, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.end_headers()

    def log_message(self, fmt, *args):
        # Keep the console clean; only print real server errors.
        pass


class DualStackServer(ThreadingHTTPServer):
    """A threaded server reachable over both IPv4 and IPv6.

    "localhost" resolves to ::1 on Windows before it falls back to 127.0.0.1.
    Listening on IPv4 alone therefore costs a stalled connection attempt --
    about two seconds here -- on every request the page makes, and a burst of
    them can fail outright. Binding IPv6 with IPv4 mapped removes that.
    """

    address_family = socket.AF_INET6

    def server_bind(self):
        try:
            self.socket.setsockopt(socket.IPPROTO_IPV6, socket.IPV6_V6ONLY, 0)
        except (AttributeError, OSError):
            # No dual-stack toggle on this platform: stays IPv6 only.
            pass
        super().server_bind()


if __name__ == "__main__":
    print("=" * 60)
    print("South Africa Dashboard")
    print(f"  Root:         {ROOT}")
    print(f"  To-Do page:   http://localhost:{PORT}/pages/todo.html")
    print(f"  To-Do API:    http://localhost:{PORT}/api/todo")
    print(f"  Todo file:    {TODO_FILE}")
    print(f"  Market API:   http://localhost:{PORT}/api/market/equities")
    print("                /api/market/fx | /api/market/bonds | /api/market/overview")
    print("  Stop with Ctrl+C")
    print("=" * 60)
    # Threaded on purpose: a market request must not wait behind a slow upstream
    # feed on /api/rss, which can sit on an unreachable provider for seconds.
    # Bound on "::" so localhost and 127.0.0.1 both answer on the first attempt.
    server = DualStackServer(("::", PORT), Handler)
    server.daemon_threads = True
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()
