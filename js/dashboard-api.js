/* ============================================================
   Finding the dashboard's own API.

   The dashboard's endpoints (/api/market/*, /api/rss) are served by
   `py server.py` on port 3101, but the pages are usually opened through a
   *static* server -- Live Server on 5500, or even file:// -- where this origin
   has no such endpoints and answers 404. A page that only ever asks its own
   origin therefore silently degrades to whatever fallback it has.

   This resolves that: a request is tried on this page's own origin first, then
   on the dashboard server's usual port, and whichever answers is remembered for
   the rest of the page's life. Cross-origin only works because the dashboard
   server sends Access-Control-Allow-Origin: * on every JSON response.
   ============================================================ */
(function () {
  'use strict';

  // The dashboard server's own port, tried when this origin has no API.
  var DASHBOARD_PORT = 3101;
  var DASHBOARD_HOSTS = ['localhost', '127.0.0.1'];

  /**
   * The hosts to try for the dashboard server, this page's own host first.
   * "localhost" can resolve to IPv6 while the server listens on IPv4, so
   * asking the host the page already came from first avoids a dead hop.
   */
  function dashboardHosts() {
    var here = window.location.hostname;
    var hosts = DASHBOARD_HOSTS.slice();
    var index = hosts.indexOf(here);
    if (index > 0) {
      hosts.splice(index, 1);
      hosts.unshift(here);
    }
    return hosts;
  }

  /** Candidate origins for the dashboard endpoints, best guess first. */
  function origins() {
    var list = [new URL('../', window.location.href).href];
    dashboardHosts().forEach(function (host) {
      var origin = 'http://' + host + ':' + DASHBOARD_PORT + '/';
      if (list.indexOf(origin) === -1) list.push(origin);
    });
    return list;
  }

  // The origin that last answered, so later requests skip the dead ones.
  var activeOrigin = null;

  /** The origin serving the API, or '' when none has answered yet. */
  function active() {
    return activeOrigin;
  }

  /** Forget the remembered origin, so every candidate is retried. */
  function reset() {
    activeOrigin = null;
  }

  /**
   * Fetch a dashboard path (for example 'api/market/equities') from whichever
   * origin answers. Rejects when no candidate does, so the caller can fall back
   * to its stored data.
   */
  async function fetchPath(path, init) {
    var known = origins();
    var order = activeOrigin
      ? [activeOrigin].concat(known.filter(function (origin) {
          return origin !== activeOrigin;
        }))
      : known;

    var lastError = null;
    for (var index = 0; index < order.length; index += 1) {
      try {
        var response = await fetch(order[index] + path, init);
        if (!response.ok) {
          lastError = new Error('HTTP ' + response.status);
          continue;
        }
        activeOrigin = order[index];
        return response;
      } catch (error) {
        lastError = error;
      }
    }

    throw new Error(
      'no dashboard API on this origin or port ' + DASHBOARD_PORT +
      ' (' + (lastError ? lastError.message : 'unreachable') + ')'
    );
  }

  window.DashboardApi = {
    origins: origins,
    active: active,
    reset: reset,
    fetchPath: fetchPath
  };
})();
