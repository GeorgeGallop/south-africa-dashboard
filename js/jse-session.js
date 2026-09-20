/* ============================================================
   The JSE session clock, in the browser.

   The dashboard's figures are last-close figures, so "is this
   today's close or yesterday's?" is a question the page has to be
   able to answer on its own. This mirrors market/sessions.py: the
   JSE trades 09:00-17:00 SAST (UTC+2, no daylight saving) Monday to
   Friday; before the open the market is still quoting the previous
   trading day's close.

   Everything is derived from the SAST wall clock, never the
   reader's timezone, so the same page tells the same story whether
   it is open in Johannesburg or Chicago.
   ============================================================ */
(function () {
  'use strict';

  var SAST_OFFSET_MS = 2 * 3600 * 1000;
  var OPEN_HOUR = 9;
  var CLOSE_HOUR = 17;
  var DAY_MS = 86400000;

  var DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  var MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
                     'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

  function pad2(value) {
    return String(value).padStart(2, '0');
  }

  /** The epoch second the page is running at. */
  function nowSeconds() {
    return Math.floor(Date.now() / 1000);
  }

  /** SAST calendar fields for an instant, read through UTC getters. */
  function sastFields(epochSeconds) {
    var shifted = new Date(epochSeconds * 1000 + SAST_OFFSET_MS);
    return {
      year: shifted.getUTCFullYear(),
      month: shifted.getUTCMonth() + 1,
      day: shifted.getUTCDate(),
      hour: shifted.getUTCHours(),
      minute: shifted.getUTCMinutes(),
      second: shifted.getUTCSeconds(),
      weekday: shifted.getUTCDay()
    };
  }

  function isTradingWeekday(weekday) {
    return weekday >= 1 && weekday <= 5;
  }

  /** Midnight SAST of the day an instant falls in, as a UTC-epoch value. */
  function dayFloor(epochSeconds) {
    var fields = sastFields(epochSeconds);
    return Date.UTC(fields.year, fields.month - 1, fields.day);
  }

  /** The last weekday strictly before a midnight value. */
  function previousTradingDay(dayMs) {
    var cursor = dayMs - DAY_MS;
    while (!isTradingWeekday(new Date(cursor).getUTCDay())) {
      cursor -= DAY_MS;
    }
    return cursor;
  }

  /**
   * The JSE session whose prices an instant belongs to, as a midnight value.
   * Weekends and the hours before the open belong to the previous trading day,
   * because that is the close being quoted.
   */
  function sessionDay(epochSeconds) {
    var fields = sastFields(epochSeconds);
    var floor = dayFloor(epochSeconds);
    if (!isTradingWeekday(fields.weekday) || fields.hour < OPEN_HOUR) {
      return previousTradingDay(floor);
    }
    return floor;
  }

  function isoDate(dayMs) {
    var day = new Date(dayMs);
    return day.getUTCFullYear() + '-' + pad2(day.getUTCMonth() + 1) +
      '-' + pad2(day.getUTCDate());
  }

  /** '2026-09-17' -- matches the session key the server stamps on its cache. */
  function sessionKey(epochSeconds) {
    return isoDate(sessionDay(epochSeconds === undefined ? nowSeconds() : epochSeconds));
  }

  /** 'Thu 17 Sep 2026' for a session key, or '' when there is none. */
  function sessionLabel(key) {
    if (!key) return '';
    var parts = String(key).split('-');
    if (parts.length !== 3) return '';
    var ms = Date.UTC(parseInt(parts[0], 10), parseInt(parts[1], 10) - 1,
      parseInt(parts[2], 10));
    var day = new Date(ms);
    if (isNaN(day.getTime())) return '';
    return DAY_NAMES[day.getUTCDay()] + ' ' + pad2(day.getUTCDate()) + ' ' +
      MONTH_NAMES[day.getUTCMonth()] + ' ' + day.getUTCFullYear();
  }

  /** 'open' while the session is trading, otherwise 'settled'. */
  function phase(epochSeconds) {
    var fields = sastFields(epochSeconds === undefined ? nowSeconds() : epochSeconds);
    if (!isTradingWeekday(fields.weekday)) return 'settled';
    if (fields.hour >= OPEN_HOUR && fields.hour < CLOSE_HOUR) return 'open';
    return 'settled';
  }

  /** '2026-09-17 21:46:15 SAST' -- the exchange clock, not the reader's. */
  function formatSast(epochSeconds) {
    var fields = sastFields(epochSeconds);
    return fields.year + '-' + pad2(fields.month) + '-' + pad2(fields.day) + ' ' +
      pad2(fields.hour) + ':' + pad2(fields.minute) + ':' +
      pad2(fields.second) + ' SAST';
  }

  /** True when a session key is not the session running (or last settled) now. */
  function isStaleKey(key, epochSeconds) {
    if (!key) return false;
    return key !== sessionKey(epochSeconds);
  }

  window.JseSession = {
    nowSeconds: nowSeconds,
    sessionKey: sessionKey,
    sessionLabel: sessionLabel,
    phase: phase,
    formatSast: formatSast,
    isStaleKey: isStaleKey
  };
})();
