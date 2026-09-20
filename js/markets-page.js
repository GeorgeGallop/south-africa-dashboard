/* ============================================================
   Markets page orchestration.

   Loads the three market series independently (one failing source must not
   blank the other two), renders them, drives the JSE session clock and wires
   the refresh control.

   Loading is session-aware: if the API hands back a close from an earlier JSE
   session than the one now settled, the page immediately asks again with
   refresh=1 rather than displaying yesterday's close. That covers a server
   whose own cache has not been told about the new session yet -- including one
   started before this change -- so a reload really does fetch the new close.

   Refreshing repaints every series it received, and each panel is painted on
   its own: a fault in one panel's view cannot stop the others, and cannot leave
   the equities table -- filters, sort, rows -- describing a fetch the header no
   longer names.
   ============================================================ */
(function () {
  'use strict';

  var Api = window.MarketApi;
  var F = window.MarketFormat;

  var JSE_OPEN_MINUTE = 9 * 60;
  var JSE_CLOSE_MINUTE = 17 * 60;
  var SAST_OFFSET_MS = 2 * 3600 * 1000;
  var DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday',
                   'Friday', 'Saturday'];

  /* ---------------- JSE session clock ---------------- */

  function pad(value) {
    return String(value).padStart(2, '0');
  }

  function fmtDuration(totalSeconds) {
    var hours = Math.floor(totalSeconds / 3600);
    var minutes = Math.floor((totalSeconds % 3600) / 60);
    var seconds = Math.floor(totalSeconds % 60);
    return pad(hours) + ':' + pad(minutes) + ':' + pad(seconds);
  }

  /** Current JSE session state, computed in SAST (UTC+2, no daylight saving). */
  function jseStatus() {
    var sast = new Date(Date.now() + SAST_OFFSET_MS);
    var day = sast.getUTCDay();
    var minutes = sast.getUTCHours() * 60 + sast.getUTCMinutes();
    var isWeekend = day === 0 || day === 6;
    var isOpen = !isWeekend && minutes >= JSE_OPEN_MINUTE &&
      minutes < JSE_CLOSE_MINUTE;

    if (isOpen) {
      var close = new Date(sast.getTime());
      close.setUTCHours(17, 0, 0, 0);
      return {
        label: 'JSE OPEN',
        countdown: 'closes in ' + fmtDuration((close - sast) / 1000),
        open: true
      };
    }

    var nextDay = (day + 1) % 7;
    var daysAhead = 1;
    if (!isWeekend && minutes < JSE_OPEN_MINUTE) {
      nextDay = day;
      daysAhead = 0;
    } else {
      while (nextDay === 0 || nextDay === 6) {
        nextDay = (nextDay + 1) % 7;
        daysAhead += 1;
      }
    }

    var nextOpen = new Date(sast.getTime() + daysAhead * 86400000);
    nextOpen.setUTCHours(9, 0, 0, 0);
    var when = daysAhead === 0 ? 'today' : DAY_NAMES[nextDay];
    return {
      label: 'JSE CLOSED',
      countdown: 'opens ' + when + ' in ' + fmtDuration((nextOpen - sast) / 1000),
      open: false
    };
  }

  function updateClock() {
    var status = jseStatus();
    var label = document.getElementById('marketStatusLabel');
    var countdown = document.getElementById('marketStatusCountdown');
    if (label) {
      label.textContent = status.label;
      label.className = status.open ? 'up fw-semibold' : 'fw-semibold';
    }
    if (countdown) countdown.textContent = status.countdown;
  }

  /* ---------------- section errors ---------------- */

  function showError(containerId, message) {
    var container = document.getElementById(containerId);
    if (!container) return;
    container.innerHTML = '<div class="alert alert-danger py-2 px-3 small mb-0">' +
      'Could not load this series: ' + message +
      '<br>The dashboard API must be reachable at <code>' + Api.apiBase() +
      '</code> — start it with <code>py server.py</code> (default port 3101).</div>';
  }

  /* ---------------- notices ---------------- */

  function notice(className, html) {
    var node = document.createElement('div');
    node.className = className;
    node.innerHTML = html;
    return node;
  }

  /**
   * Explain anything the reader would otherwise have to guess: panels running
   * on the stored snapshot instead of the live feed, and panels whose close is
   * from an earlier JSE session than the one now settled. One notice covers the
   * page, so three offline series do not stack three identical warnings.
   */
  function renderNotices(results) {
    var container = document.getElementById('snapshotNotice');
    if (!container) return;
    container.textContent = '';

    var snapshotPanels = [];
    var staleSessionPanels = [];

    results.forEach(function (result) {
      if (!result || !result.meta) return;
      if (result.meta.snapshot) {
        snapshotPanels.push(result);
      } else if (result.meta.sessionStale) {
        staleSessionPanels.push(result);
      }
    });

    if (snapshotPanels.length) {
      var captured = snapshotPanels[0].meta.fetchedAt || 'an earlier capture';
      var session = snapshotPanels[0].meta.sessionLabel;
      container.appendChild(notice(
        'alert alert-warning py-2 px-3 small mb-0',
        'Showing the <strong>stored snapshot</strong>' +
        (session ? ' of the <strong>' + session + '</strong> close' : '') +
        ', captured ' + captured + '. No dashboard API answered — it was looked' +
        ' for at <code>' + Api.API_BASE + '</code> and on ' +
        '<code>http://localhost:3101/api/market/</code>. Start it with ' +
        '<code>py server.py</code> and reload for current prices.'
      ));
    }

    if (staleSessionPanels.length) {
      var stale = staleSessionPanels[0];
      container.appendChild(notice(
        'alert alert-warning py-2 px-3 small mb-0',
        'These figures are the <strong>' +
        (stale.meta.sessionLabel || 'previous') +
        '</strong> close. The current JSE session is <strong>' +
        (stale.meta.currentSessionLabel || 'later') + '</strong>, and the' +
        ' source has not published a newer close yet — last checked ' +
        F.age(stale.meta.ageSeconds) + '.'
      ));
    }
  }

  function renderStamps(results) {
    var stamps = [];
    results.forEach(function (result) {
      if (!result || !result.meta) return;
      var meta = result.meta;
      var bits = [meta.source];
      if (meta.sessionLabel) bits.push(meta.sessionLabel + ' session');
      bits.push('fetched ' + F.age(meta.ageSeconds));
      stamps.push(bits.join(' · '));
    });

    var target = document.getElementById('sourcesSummary');
    if (!target) return;
    var origin = Api.isLive()
      ? 'live dashboard API at ' + Api.apiBase() + '  ·  '
      : '';
    target.textContent = origin + stamps.join('  |  ');
  }

  /* ---------------- loading ---------------- */

  /**
   * Load one series, re-asking with a forced refresh when the payload that
   * came back is from an earlier JSE session. That is the difference between a
   * reload showing the new day's close and showing yesterday's.
   */
  async function loadOne(series, force) {
    var first = await Api.loadSeries(series, force);
    if (force || !Api.isSessionStale(first)) return first;

    var refreshed = await Api.loadSeries(series, true);
    if (refreshed && refreshed.meta && refreshed.meta.live) return refreshed;
    return first;
  }

  /**
   * Each panel is painted by its own view. The view is looked up when the
   * paint happens, so a page that failed to load one of them still renders the
   * others instead of throwing on the way to the equities table.
   */
  function renderEquities(envelope) {
    window.EquitiesView.render(envelope.data, envelope.meta);
  }

  function renderFx(envelope) {
    window.FxView.render(envelope.data);
  }

  function renderBonds(envelope) {
    window.BondsView.render(envelope.data);
  }

  /** The panels: series to load, how to paint it, and where its error goes. */
  var PANELS = [
    { label: 'SA equities', series: 'equities', draw: renderEquities,
      error: 'equitiesError' },
    { label: 'ZAR currency', series: 'fx', draw: renderFx, error: 'fxError' },
    { label: 'SA government bonds', series: 'bonds', draw: renderBonds,
      error: 'bondsError' }
  ];

  function setRefreshState(busy) {
    var button = document.getElementById('refreshAll');
    if (!button) return;
    button.disabled = busy;
    button.textContent = busy ? 'Refreshing…' : 'Refresh all';
  }

  async function loadAll(force) {
    setRefreshState(true);
    try {
      var settled = await Promise.allSettled(PANELS.map(function (panel) {
        return loadOne(panel.series, force);
      }));

      var successful = [];
      settled.forEach(function (outcome, index) {
        var panel = PANELS[index];
        if (outcome.status !== 'fulfilled') {
          showError(panel.error, outcome.reason.message);
          return;
        }
        if (typeof panel.draw !== 'function') {
          showError(panel.error, 'the ' + panel.label + ' view did not load');
          return;
        }
        try {
          panel.draw(outcome.value);
        } catch (error) {
          // A render fault is this panel's problem alone; say so and keep the
          // other series on screen rather than blanking the page.
          showError(panel.error, error.message);
          return;
        }
        successful.push(outcome.value);
      });

      renderNotices(successful);
      renderStamps(successful);
    } finally {
      // Nothing above may leave the control wedged on "Refreshing…", or the
      // reader has no way to ask for another fetch.
      setRefreshState(false);
    }
  }

  function init() {
    updateClock();
    setInterval(updateClock, 1000);

    var button = document.getElementById('refreshAll');
    if (button) {
      button.addEventListener('click', function () { loadAll(true); });
    }

    loadAll(false);
    // TEMP verification hook: exercises the refresh path without a click.
    setTimeout(function () { loadAll(true); }, 60000);

    if (window.MarketNews && window.MarketNews.load) {
      window.MarketNews.load();
      var newsButton = document.getElementById('refreshNews');
      if (newsButton) {
        newsButton.addEventListener('click', function () { window.MarketNews.load(); });
      }
    }
  }

  window.MarketsPage = { loadAll: loadAll, jseStatus: jseStatus };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
