"""Small HTTP session helper with cookies, retries and browser-like headers.

Every market data provider used by this dashboard is a public but
browser-facing endpoint: Yahoo Finance rejects the default urllib agent with
HTTP 429 and World Government Bonds rejects requests that do not carry the
session cookie it sets on the page view. A single ``Session`` object carries
those cookies and identity for the whole fetch cycle.
"""
import http.cookiejar
import json
import time
import urllib.error
import urllib.parse
import urllib.request

from .settings import REQUEST_TIMEOUT, USER_AGENT

RETRY_ATTEMPTS = 2
RETRY_BACKOFF_SECONDS = 1.5


class MarketHttpError(RuntimeError):
    """Raised when a provider cannot be reached after all retries."""


class Session:
    """A cookie-preserving HTTP client with browser-like defaults."""

    def __init__(self, user_agent=USER_AGENT):
        self.user_agent = user_agent
        self._jar = http.cookiejar.CookieJar()
        self._opener = urllib.request.build_opener(
            urllib.request.HTTPCookieProcessor(self._jar)
        )

    # -- low level -------------------------------------------------------
    def request(self, url, data=None, headers=None, timeout=REQUEST_TIMEOUT):
        """Perform one request and return the raw response body as bytes."""
        merged = {
            "User-Agent": self.user_agent,
            "Accept": "application/json, text/html, text/plain, */*",
            "Accept-Language": "en-US,en;q=0.9",
        }
        if headers:
            merged.update(headers)

        last_error = None
        for attempt in range(RETRY_ATTEMPTS):
            request = urllib.request.Request(url, data=data, headers=merged)
            try:
                with self._opener.open(request, timeout=timeout) as response:
                    return response.read()
            except (urllib.error.URLError, OSError, ValueError) as exc:
                last_error = exc
                if attempt + 1 < RETRY_ATTEMPTS:
                    time.sleep(RETRY_BACKOFF_SECONDS)
        raise MarketHttpError(f"{url} -> {last_error}")

    # -- typed helpers ---------------------------------------------------
    def get_bytes(self, url, headers=None, timeout=REQUEST_TIMEOUT):
        return self.request(url, headers=headers, timeout=timeout)

    def get_text(self, url, headers=None, timeout=REQUEST_TIMEOUT):
        return self.get_bytes(url, headers=headers, timeout=timeout).decode(
            "utf-8", "replace"
        )

    def get_json(self, url, headers=None, timeout=REQUEST_TIMEOUT):
        raw = self.get_bytes(url, headers=headers, timeout=timeout)
        try:
            return json.loads(raw.decode("utf-8", "replace"))
        except json.JSONDecodeError as exc:
            raise MarketHttpError(f"{url} -> invalid JSON ({exc})") from exc

    def post_json(self, url, payload, headers=None, timeout=REQUEST_TIMEOUT):
        body = json.dumps(payload).encode("utf-8")
        merged = {
            "Content-Type": "application/json",
            "X-Requested-With": "XMLHttpRequest",
            "Origin": origin_of(url),
            "Referer": url,
        }
        if headers:
            merged.update(headers)
        raw = self.request(url, data=body, headers=merged, timeout=timeout)
        try:
            return json.loads(raw.decode("utf-8", "replace"))
        except json.JSONDecodeError as exc:
            raise MarketHttpError(f"{url} -> invalid JSON ({exc})") from exc


def origin_of(url):
    """Return ``scheme://host`` for a URL, used to build Origin headers."""
    parts = urllib.parse.urlsplit(url)
    return f"{parts.scheme}://{parts.netloc}"
