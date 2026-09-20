"""On-disk cache so every page can render the last good fetch.

The cache is a single JSON document keyed by slice name::

    {
      "equities": {
        "fetchedAt": 1789570000,
        "source": "yahoo",
        "sessionKey": "2026-09-17",
        "data": {...}
      },
      ...
    }

Each slice records when it was fetched, which source produced it, and which
JSE session its prices belong to. The session key is what stops a previous
day's close being served as if it were current: a slice is only reused when it
was captured for the session that is current now *and* it is still inside its
TTL. A slice from an earlier session is refetched however young it is, and a
legacy entry written before session keys existed is treated as belonging to no
session at all, so it is refetched once and then stamped properly.

A plain TTL is not enough on its own because these are last-close series: a
slice fetched at 07:00 on Thursday holds Wednesday's close, and at 09:00 on
Thursday it is still only minutes old while the market has already begun a new
session.
"""
import json
import time
from pathlib import Path
from typing import Any, NamedTuple, Optional

from . import sessions
from .settings import CACHE_FILE


class Slice(NamedTuple):
    """One cached payload plus its provenance."""

    name: str
    data: Any
    fetched_at: float
    source: str
    session_key: str = ""

    @property
    def age_seconds(self) -> float:
        return max(0.0, time.time() - self.fetched_at)

    def is_fresh(self, ttl_seconds: float) -> bool:
        return self.age_seconds <= ttl_seconds

    def is_current_session(self, session_key: Optional[str]) -> bool:
        """True when this slice describes the session asked about."""
        if session_key is None:
            return True
        return bool(self.session_key) and self.session_key == session_key

    @property
    def fetched_at_sast(self) -> str:
        return sessions.format_sast(self.fetched_at)


class LoadResult(NamedTuple):
    """What a loader returns: the payload, its source and its session."""

    data: Any
    source: str
    session_key: str = ""


def _as_result(value) -> LoadResult:
    """Accept either a ``LoadResult`` or a plain ``(data, source)`` tuple."""
    if isinstance(value, LoadResult):
        return value
    data, source = value
    return LoadResult(data, source)


def _read_all(path: Path = CACHE_FILE) -> dict:
    if not path.exists():
        return {}
    try:
        payload = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return {}
    return payload if isinstance(payload, dict) else {}


def _write_all(payload: dict, path: Path = CACHE_FILE) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_suffix(".json.tmp")
    tmp.write_text(json.dumps(payload, indent=2), encoding="utf-8")
    tmp.replace(path)


def read(name: str, path: Path = CACHE_FILE) -> Optional[Slice]:
    """Return the cached slice ``name``, or ``None`` when absent/corrupt."""
    entry = _read_all(path).get(name)
    if not isinstance(entry, dict) or "data" not in entry:
        return None
    return Slice(
        name=name,
        data=entry.get("data"),
        fetched_at=float(entry.get("fetchedAt") or 0),
        source=str(entry.get("source") or "cache"),
        session_key=str(entry.get("sessionKey") or ""),
    )


def write(
    name: str,
    data: Any,
    source: str,
    session_key: str = "",
    path: Path = CACHE_FILE,
) -> None:
    """Persist ``data`` under ``name`` stamped with the current time."""
    payload = _read_all(path)
    now = time.time()
    payload[name] = {
        "fetchedAt": now,
        "fetchedAtIso": sessions.format_sast(now),
        "source": source,
        "sessionKey": session_key or "",
        "data": data,
    }
    _write_all(payload, path)


def is_usable(
    sliced: Slice,
    ttl_seconds: float,
    current_session_key: Optional[str] = None,
) -> bool:
    """Whether a cached slice may be served for the session in hand."""
    if ttl_seconds <= 0:
        return False  # an explicit refresh always refetches
    if not sliced.is_current_session(current_session_key):
        return False  # a newer JSE session exists and this slice is not of it
    return sliced.is_fresh(ttl_seconds)


def fetch_or_cache(
    name: str,
    ttl_seconds: float,
    loader,
    current_session_key: Optional[str] = None,
    path: Path = CACHE_FILE,
) -> Slice:
    """Return the cached slice when it is still valid, else refetch it.

    ``loader`` must return a :class:`LoadResult` (or a ``(data, source)``
    tuple). When the loader raises, the cached value is returned even if it is
    past its TTL or from an earlier session -- a stale number carrying a
    visible timestamp and session date beats an empty panel.
    """
    cached = read(name, path)
    if cached and is_usable(cached, ttl_seconds, current_session_key):
        return cached

    try:
        result = _as_result(loader())
    except Exception as exc:  # noqa: BLE001 - any provider failure falls back
        if cached:
            return cached._replace(source=f"{cached.source} (unreachable: {exc})")
        raise

    write(
        name,
        result.data,
        result.source,
        result.session_key or (current_session_key or ""),
        path,
    )
    return read(name, path)
