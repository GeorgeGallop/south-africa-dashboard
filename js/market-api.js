/* ============================================================
   Market data access + shared number formatting.

   Every market figure on the dashboard comes from the dashboard's own
   /api/market/* endpoints, which fetch server-side and cache on disk. The
   browser never talks to Yahoo or World Government Bonds directly, so a
   provider's CORS or rate-limit policy cannot break the page.

   Those endpoints live on the dashboard server (`py server.py`, port 3101),
   but the pages themselves are usually opened through a *static* server --
   Live Server on 5500, or even file://. On that origin /api/market/* answers
   404, and the page used to fall back to data/market-snapshot.js and show a
   frozen capture for ever, however many times it was refreshed. So the API is
   now looked for in more than one place: this page's own origin first, then
   the dashboard server on its usual port. The dashboard server answers with
   Access-Control-Allow-Origin: *, so the cross-origin call is allowed.

   Only when no API answers anywhere does the page fall back to the stored
   snapshot -- and then it says so, with the session the figures belong to, so a
   stored close is never presented as a live one.
   ============================================================ */
(function () {
  'use strict';

  // Absolute, so it resolves the same from /pages/*.html and from the root.
  var SAME_ORIGIN_BASE = new URL('../api/market/', window.location.href).href;
  var MARKET_PATH = 'api/market/';

  /** The API base actually in use, for the header's source line. */
  function apiBase() {
    var origin = window.DashboardApi ? window.DashboardApi.active() : '';
    return origin ? origin + MARKET_PATH : SAME_ORIGIN_BASE;
  }

  function isLive() {
    return !!(window.DashboardApi && window.DashboardApi.active());
  }

  /* ---------------- stored snapshot ---------------- */

  /** The stored snapshot document, or null when the page did not load it. */
  function snapshotDoc() {
    return window.MARKET_SNAPSHOT || null;
  }

  /** The stored envelope for one series, or null when absent. */
  function storedSeries(series) {
    var doc = snapshotDoc();
    var entry = doc && doc.series ? doc.series[series] : null;
    return entry && entry.data ? entry : null;
  }

  /** How long ago the snapshot was captured, in seconds. */
  function snapshotAgeSeconds() {
    var doc = snapshotDoc();
    if (!doc || !doc.generatedAtEpoch) return null;
    return Math.max(0, Math.round(Date.now() / 1000 - doc.generatedAtEpoch));
  }

  /** The JSE session the loaded snapshot describes, or ''. */
  function snapshotSessionKey() {
    var doc = snapshotDoc();
    if (!doc) return '';
    if (doc.sessionKey) return doc.sessionKey;
    var equities = doc.series && doc.series.equities;
    var meta = equities && equities.meta;
    return (meta && meta.sessionKey) || '';
  }

  /**
   * Pull data/market-snapshot.json when the copy already loaded in the page is
   * from an earlier JSE session, so regenerating the snapshot is enough and a
   * plain refresh picks it up. Silently does nothing over file://, where
   * fetching a local file is blocked, or when nothing newer exists.
   */
  async function refreshStoredSnapshot() {
    var S = window.JseSession;
    if (!S) return false;
    if (snapshotDoc() && snapshotSessionKey() === S.sessionKey()) return false;

    try {
      var url = new URL('../data/market-snapshot.json', window.location.href).href;
      var response = await fetch(url + '?v=' + Date.now(), { cache: 'no-store' });
      if (!response.ok) return false;
      var doc = await response.json();
      if (!doc || !doc.series) return false;
      window.MARKET_SNAPSHOT = doc;
      return true;
    } catch (error) {
      return false;
    }
  }

  /**
   * Wrap stored data in the same envelope shape a live response uses, so the
   * views and the header treat both identically -- while the source line and
   * the staleness flags make clear which one this is.
   */
  function snapshotEnvelope(entry, reason) {
    var doc = snapshotDoc() || {};
    var storedMeta = (entry && entry.meta) || {};
    var S = window.JseSession;
    var currentKey = S ? S.sessionKey() : '';
    var sessionKey = storedMeta.sessionKey || doc.sessionKey || '';

    return {
      meta: {
        source: 'stored snapshot, last settled JSE close (' + reason + ')',
        fetchedAt: storedMeta.fetchedAt || doc.generatedAt || '',
        fetchedAtEpoch: storedMeta.fetchedAtEpoch || doc.generatedAtEpoch || null,
        ageSeconds: snapshotAgeSeconds(),
        ttlSeconds: null,
        stale: true,
        live: false,
        snapshot: true,
        sessionKey: sessionKey,
        sessionLabel: storedMeta.sessionLabel || doc.sessionLabel || '',
        currentSessionKey: currentKey,
        sessionStale: !!(currentKey && sessionKey && sessionKey !== currentKey)
      },
      data: entry.data
    };
  }

  /** Every stored series combined, for a caller asking for 'overview'. */
  function storedOverview() {
    return {
      generatedAt: (snapshotDoc() || {}).generatedAt || '',
      equities: storedSeries('equities'),
      fx: storedSeries('fx'),
      bonds: storedSeries('bonds')
    };
  }

  /* ---------------- live API ---------------- */

  /** The cache-busting query for one series request. */
  function queryFor(force) {
    var query = ['_=' + Date.now()];
    if (force) query.push('refresh=1');
    return query.join('&');
  }

  /**
   * Fetch one series from the dashboard API on whichever origin answers --
   * this one, or the dashboard server on its own port. The lookup is shared
   * with the news strip, so both find the same running server.
   */
  async function loadLive(series, force) {
    var response = await window.DashboardApi.fetchPath(
      MARKET_PATH + series + '?' + queryFor(force),
      { cache: 'no-store' }
    );
    return response.json();
  }

  /** Why the live request failed, phrased for the header's source line. */
  function reasonFor(error) {
    if (!error) return 'no live feed';
    if (error.message === 'Failed to fetch' || error.name === 'TypeError') {
      return 'no dashboard API reachable';
    }
    return error.message;
  }

  /**
   * Fetch one market series, preferring the live dashboard API and falling
   * back to the stored snapshot. Throws only when neither is available.
   */
  async function loadSeries(series, force) {
    try {
      return await loadLive(series, force);
    } catch (error) {
      // The API is unreachable: adopt a newer stored capture if one exists,
      // then serve the snapshot so the panel is not left empty.
      await refreshStoredSnapshot();
      if (series === 'overview') {
        var overview = storedOverview();
        if (overview.equities) {
          return snapshotEnvelope({ data: overview }, reasonFor(error));
        }
      }
      var stored = storedSeries(series);
      if (stored) return snapshotEnvelope(stored, reasonFor(error));
      throw error;
    }
  }

  /* ---------------- freshness judgement ---------------- */

  /** The instant a payload's own prices describe, when it reports one. */
  function payloadEpoch(envelope) {
    var data = envelope && envelope.data;
    if (data && typeof data.asOfEpoch === 'number' && data.asOfEpoch > 0) {
      return data.asOfEpoch;
    }
    var meta = envelope && envelope.meta;
    if (meta && typeof meta.fetchedAtEpoch === 'number' && meta.fetchedAtEpoch > 0) {
      return meta.fetchedAtEpoch;
    }
    return null;
  }

  /**
   * True when the payload in hand is from an earlier JSE session than the one
   * running (or last settled) now, and so a refresh should fetch a newer close.
   *
   * The session has to be settled for that to be worth asking: during the
   * first minutes of a new session the provider is still quoting the previous
   * close, so escalating then would refetch on every load and achieve nothing.
   *
   * A server that reports meta.sessionStale has already judged its own cache,
   * so its answer is trusted -- unless it also reports the figures as stale,
   * which means a refetch was attempted and the provider could not be reached,
   * and retrying would only spin. A server too old to report anything is
   * judged here from the payload's own price timestamp instead.
   */
  function isSessionStale(envelope) {
    var meta = envelope && envelope.meta;
    var S = window.JseSession;
    if (!meta || !meta.live || !S) return false;
    if (S.phase() !== 'settled') return false;
    if (typeof meta.sessionStale === 'boolean') {
      return meta.sessionStale === true && meta.stale === false;
    }
    var epoch = payloadEpoch(envelope);
    if (!epoch) return false;
    return S.sessionKey(epoch) !== S.sessionKey();
  }

  /** True when the page has a stored snapshot to fall back on. */
  function hasSnapshot() {
    return !!snapshotDoc();
  }

  /* ---------------- shared number formatting ---------------- */

  function isNumber(value) {
    return typeof value === 'number' && isFinite(value);
  }

  /** Fixed-decimal number, or an em dash when the value is missing. */
  function num(value, dp) {
    if (!isNumber(value)) return '—';
    return value.toLocaleString('en-US', {
      minimumFractionDigits: dp === undefined ? 2 : dp,
      maximumFractionDigits: dp === undefined ? 2 : dp
    });
  }

  /** Percentage with an explicit sign and a % suffix. */
  function signed(value, dp) {
    if (!isNumber(value)) return '—';
    var places = dp === undefined ? 2 : dp;
    return (value > 0 ? '+' : '') + value.toFixed(places) + '%';
  }

  /** Basis points with an explicit sign. */
  function bp(value, dp) {
    if (!isNumber(value)) return '—';
    var places = dp === undefined ? 1 : dp;
    return (value > 0 ? '+' : '') + value.toFixed(places) + ' bp';
  }

  /** Compact rand-billion style figures used on the KPI cards. */
  function compact(value) {
    if (!isNumber(value)) return '—';
    if (Math.abs(value) >= 1000) return (value / 1000).toFixed(2) + 'T';
    if (Math.abs(value) >= 100) return value.toFixed(0);
    return value.toFixed(1);
  }

  /**
   * Format a rand-billion figure with the unit that actually applies, so a
   * trillion-rand aggregate is never printed under a "billion" label.
   */
  function moneyBn(value) {
    if (!isNumber(value)) return '—';
    var absolute = Math.abs(value);
    if (absolute >= 1000) return 'R ' + (value / 1000).toFixed(2) + 'tn';
    if (absolute >= 1) return 'R ' + value.toFixed(2) + 'bn';
    return 'R ' + (value * 1000).toFixed(0) + 'm';
  }

  /** Human-readable age for a cached payload. */
  function age(seconds) {
    if (!isNumber(seconds)) return 'time unknown';
    if (seconds < 5) return 'just now';
    if (seconds < 60) return seconds + 's ago';
    if (seconds < 3600) return Math.round(seconds / 60) + ' min ago';
    if (seconds < 86400) return Math.round(seconds / 3600) + ' h ago';
    return Math.round(seconds / 86400) + ' d ago';
  }

  /** Colour class for a signed value. */
  function signClass(value) {
    if (!isNumber(value)) return 'flat';
    return value > 0 ? 'up' : value < 0 ? 'down' : 'flat';
  }

  /** Arrow glyph for a signed value. */
  function signArrow(value) {
    if (!isNumber(value) || value === 0) return '—';
    return value > 0 ? '▲' : '▼';
  }

  window.MarketApi = {
    loadSeries: loadSeries,
    API_BASE: SAME_ORIGIN_BASE,
    apiBase: apiBase,
    isLive: isLive,
    isSessionStale: isSessionStale,
    refreshStoredSnapshot: refreshStoredSnapshot,
    hasSnapshot: hasSnapshot
  };
  window.MarketFormat = {
    num: num,
    signed: signed,
    bp: bp,
    compact: compact,
    age: age,
    signClass: signClass,
    signArrow: signArrow,
    isNumber: isNumber,
    moneyBn: moneyBn
  };
})();
