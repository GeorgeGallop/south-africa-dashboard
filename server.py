#!/usr/bin/env python3
"""
South Africa Dashboard — static server + To-Do persistence API.

Serves the dashboard files and exposes a tiny API that writes the
to-do list into the codebase (data/todo.json), so added items are
actually saved to disk and survive a browser cache / profile wipe.

  GET  /api/todo  ->  {"items": [...], "savedAt": "..."}
  PUT  /api/todo  ->  writes the JSON body to data/todo.json

  PUT  /api/sidebar-layout  ->  writes js/sidebar-layout.js and the
       sidebar markup inside index.html (from pages/sidebar-sections.html)

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
import gzip
import json
import os
import socket
import time
import urllib.error
import urllib.parse
import urllib.request
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
SIDEBAR_JS = ROOT / "js" / "sidebar-layout.js"
INDEX_HTML = ROOT / "index.html"
SIDEBAR_MAX_BYTES = 1_500_000

# How long to wait when proxying a remote RSS/HTML feed for the news page.
# Keep this below the browser-side fetch timeout (FETCH_TIMEOUT_MS = 18s)
# so a slow upstream feed fails-server-side before the browser aborts.
FETCH_TIMEOUT = 14  # seconds
FETCH_MAX_BYTES = 5_000_000
FETCH_HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
        "AppleWebKit/537.36 (KHTML, like Gecko) "
        "Chrome/129.0.0.0 Safari/537.36"
    ),
    "Accept": (
        "application/rss+xml, application/atom+xml, application/xml, "
        "text/xml, text/html;q=0.9, */*;q=0.8"
    ),
    "Accept-Language": "en-ZA,en-GB;q=0.9,en;q=0.8",
    "Accept-Encoding": "gzip, deflate",
    "Cache-Control": "no-cache",
    "Pragma": "no-cache",
}

# Files served with a long cache lifetime. The to-do page itself is
# served normally so edits always show up on refresh.
NO_CACHE = {"/pages/todo.html", "/js/sidebar-layout.js", "/pages/sidebar-sections.html"}


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

    def _replace_sidebar_inner(self, html, inner):
        marker = 'id="sidebarRoot"'
        found = html.find(marker)
        if found < 0:
            raise ValueError('index.html has no id="sidebarRoot"')
        open_start = html.rfind("<div", 0, found)
        if open_start < 0:
            raise ValueError("Could not find the sidebarRoot opening tag")
        gt = html.find(">", open_start)
        if gt < 0:
            raise ValueError("sidebarRoot opening tag is not closed")
        inner_start = gt + 1
        i = open_start
        depth = 0
        n = len(html)
        inner_end = None
        while i < n:
            if html.startswith("<!--", i):
                end = html.find("-->", i + 4)
                i = n if end < 0 else end + 3
                continue
            if html.startswith("<div", i) and (i + 4 >= n or not html[i + 4].isalnum()):
                depth += 1
                i += 4
                continue
            if html.startswith("</div>", i):
                depth -= 1
                if depth == 0:
                    inner_end = i
                    break
                i += 6
                continue
            i += 1
        if inner_end is None:
            raise ValueError("Could not find the sidebarRoot closing tag")
        nl = "\r\n" if "\r\n" in html else "\n"
        new_inner = nl + inner.strip() + nl + "        "
        return html[:inner_start] + new_inner + html[inner_end:]

    def _handle_sidebar_put(self):
        length = int(self.headers.get("Content-Length", 0) or 0)
        if length > SIDEBAR_MAX_BYTES:
            self._send_json(413, {"error": "Layout is too large to save"})
            return
        raw = self.rfile.read(length)
        try:
            payload = json.loads(raw.decode("utf-8"))
        except Exception:
            self._send_json(400, {"error": "Body is not valid JSON"})
            return
        if not isinstance(payload, dict):
            self._send_json(400, {"error": "Expected a JSON object"})
            return

        layout_js = payload.get("layoutJs")
        if not isinstance(layout_js, str) or "window.SA_SIDEBAR_LAYOUT" not in layout_js:
            self._send_json(400, {"error": "layoutJs must be the sidebar-layout.js file text"})
            return
        if "<script" in layout_js.lower():
            self._send_json(400, {"error": "layoutJs must not contain a script tag"})
            return

        SIDEBAR_JS.parent.mkdir(parents=True, exist_ok=True)
        SIDEBAR_JS.write_text(layout_js.replace("\r\n", "\n"), encoding="utf-8")

        wrote_html = False
        sidebar_html = payload.get("sidebarHtml")
        if isinstance(sidebar_html, str) and sidebar_html.strip():
            lowered = sidebar_html.lower()
            if "<script" in lowered or "javascript:" in lowered:
                self._send_json(400, {"error": "sidebarHtml must not contain script"})
                return
            if not INDEX_HTML.exists():
                self._send_json(500, {"error": "index.html is missing"})
                return
            original = INDEX_HTML.read_text(encoding="utf-8")
            try:
                updated = self._replace_sidebar_inner(original, sidebar_html)
            except ValueError as exc:
                self._send_json(500, {"error": str(exc)})
                return
            if 'id="sidebarRoot"' not in updated or "Welcome to South Africa" not in updated:
                self._send_json(500, {"error": "Refusing to write a damaged index.html"})
                return
            INDEX_HTML.write_text(updated, encoding="utf-8")
            wrote_html = True

        self._send_json(200, {
            "ok": True,
            "wroteJs": True,
            "wroteHtml": wrote_html,
            "js": "js/sidebar-layout.js",
            "html": "index.html" if wrote_html else None,
        })

    # ---------- RSS/HTML fetch proxy (used by the news page) ----------
    def _decode_fetched_body(self, raw, headers):
        enc = (headers.get("Content-Encoding") or "").lower()
        if "gzip" in enc or raw[:2] == b"\x1f\x8b":
            try:
                raw = gzip.decompress(raw)
            except Exception:
                pass
        if len(raw) > FETCH_MAX_BYTES:
            raw = raw[:FETCH_MAX_BYTES]
        return raw

    def _open_remote(self, target):
        parsed = urllib.parse.urlparse(target)
        headers = dict(FETCH_HEADERS)
        if parsed.scheme and parsed.netloc:
            headers["Referer"] = f"{parsed.scheme}://{parsed.netloc}/"
        req = urllib.request.Request(target, headers=headers)
        last_exc = None
        for attempt in range(2):
            try:
                with urllib.request.urlopen(req, timeout=FETCH_TIMEOUT) as resp:
                    raw = resp.read(FETCH_MAX_BYTES + 1)
                    content_type = resp.headers.get("Content-Type", "application/octet-stream")
                    body = self._decode_fetched_body(raw, resp.headers)
                    return body, content_type
            except urllib.error.HTTPError as exc:
                last_exc = exc
                # One retry on transient blocks / origin blips.
                if exc.code not in (403, 429, 502, 503) or attempt:
                    raise
                time.sleep(0.4)
            except Exception as exc:
                last_exc = exc
                if attempt:
                    raise
                time.sleep(0.4)
        raise last_exc

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
            body, content_type = self._open_remote(target)
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
        if path == "/api/sidebar-layout":
            if self.command in ("PUT", "POST"):
                self._handle_sidebar_put()
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
