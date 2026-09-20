/* ============================================================
   Equities view.

   Every price, day move and market cap rendered here comes from
   /api/market/equities, which reads live JSE last-close quotes server-side.
   Nothing on this page is a stored reference figure.

   The Full Universe area (search / sector / session-change / min-cap filters
   and the sortable table) is rendered from the payload each call, so a refresh
   repaints it with the figures the header is describing: the reader's filter
   and sort survive, the sector list follows the refreshed universe, and the
   rows carry the session and fetch age they belong to. It is rendered before
   the charts and guarded on its own, so a chart that cannot draw -- a missing
   Plotly build, no market caps -- can never leave the table stale or empty.
   ============================================================ */
(function () {
  'use strict';

  var F = window.MarketFormat;

  var state = {
    payload: null,
    companies: [],
    sortKey: 'm',
    sortDir: -1,
    activeSectorId: '',
    // Provenance of the payload the table is showing, so the Full Universe
    // area carries the same "which close, fetched when" as the header.
    meta: null
  };

  function el(id) {
    return document.getElementById(id);
  }

  function setText(id, value) {
    var node = el(id);
    if (node) node.textContent = value;
  }

  /**
   * Run one panel's render step on its own, so a fault in it cannot take the
   * rest of the page down with it -- least of all leave the universe table
   * showing a previous fetch.
   */
  function safely(draw, label) {
    try {
      draw();
    } catch (error) {
      console.error('[equities] ' + label + ' failed to render', error);
    }
  }

  /** Flatten the sector blocks into one sortable company list. */
  function flatten(payload) {
    var list = [];
    (payload.sectors || []).forEach(function (sector) {
      (sector.companies || []).forEach(function (company) {
        list.push({
          t: company.t,
          n: company.n,
          p: company.p,
          c: company.c,
          m: company.m,
          v: company.v,
          sectorId: sector.id,
          sectorName: sector.name,
          sectorIcon: sector.icon,
          sectorColor: sector.color
        });
      });
    });
    return list;
  }

  /** True when the payload carries a market cap for at least one listing. */
  function hasMarketCaps() {
    return state.companies.some(function (company) {
      return F.isNumber(company.m);
    });
  }

  /**
   * Replace a Plotly panel with an explanation. Used when a chart cannot be
   * drawn honestly -- a market-cap map with no market caps is worse than none.
   */
  function showChartMessage(id, text) {
    var container = el(id);
    if (!container) return;
    if (window.Plotly) window.Plotly.purge(id);
    container.textContent = '';
    var message = document.createElement('div');
    message.className = 'text-muted small d-flex align-items-center ' +
      'justify-content-center h-100 px-3 text-center';
    message.textContent = text;
    container.appendChild(message);
  }

  function sectorStats() {
    return (state.payload.sectors || []).map(function (sector) {
      var members = state.companies.filter(function (company) {
        return company.sectorId === sector.id;
      });
      return {
        id: sector.id,
        name: sector.name,
        icon: sector.icon,
        color: sector.color,
        count: members.length,
        mcap: members.reduce(function (sum, company) {
          return sum + (company.m || 0);
        }, 0),
        ups: members.filter(function (c) { return c.c > 0; }).length,
        downs: members.filter(function (c) { return c.c < 0; }).length
      };
    }).sort(function (a, b) { return b.mcap - a.mcap; });
  }

  /* ---------------- KPIs ---------------- */

  function renderKPIs() {
    var totals = state.payload.totals || {};
    var capList = state.companies
      .map(function (c) { return c.m; })
      .filter(F.isNumber)
      .sort(function (a, b) { return a - b; });

    var median = capList.length ? capList[Math.floor(capList.length / 2)] : null;
    // "Largest" is a market-cap claim, so it is only made when caps exist.
    var largest = capList.length
      ? state.companies.reduce(function (best, company) {
          return (company.m || 0) > (best.m || 0) ? company : best;
        }, state.companies[0] || {})
      : null;

    setText('kpiTotalCap', F.moneyBn(totals.marketCapBillion));
    setText('kpiListings', totals.listings === undefined ? '—' : totals.listings);
    setText('kpiSectorCount', 'across ' + (state.payload.sectors || []).length +
      ' sectors');
    setText('kpiAdvancers', totals.advancers === undefined ? '—' : totals.advancers);
    setText('kpiDecliners', totals.decliners === undefined ? '—' : totals.decliners);
    setText('kpiMedianMcap', F.num(median, 1));
    setText('kpiLargest', largest ? largest.t : '—');
    setText('kpiLargestName', largest && largest.n
      ? largest.n + ' · ' + F.moneyBn(largest.m) : '');
  }

  /* ---------------- Market map ---------------- */

  function darken(colour, mcap) {
    var hex = (colour || '#607d8b').replace('#', '');
    var r = parseInt(hex.substr(0, 2), 16);
    var g = parseInt(hex.substr(2, 2), 16);
    var b = parseInt(hex.substr(4, 2), 16);
    var mixAmount = Math.min(0.55, 0.15 + ((mcap || 0) / 3000) * 0.4);
    function mix(channel) {
      return Math.round(channel + (255 - channel) * mixAmount);
    }
    return 'rgb(' + mix(r) + ',' + mix(g) + ',' + mix(b) + ')';
  }

  function renderTreemap() {
    if (!window.Plotly) {
      showChartMessage('treemapChart', 'The market map is drawn with the ' +
        'Plotly library, which did not load. The figures below are unaffected.');
      return;
    }
    if (!hasMarketCaps()) {
      showChartMessage('treemapChart', 'Market caps were not returned by the ' +
        'provider for this fetch, so the market map — which is drawn by market ' +
        'cap — is omitted rather than shown at zero.');
      return;
    }

    var labels = [];
    var parents = [];
    var values = [];
    var colours = [];

    sectorStats().forEach(function (sector) {
      labels.push(sector.name);
      parents.push('');
      values.push(sector.mcap);
      colours.push(sector.color);
    });

    state.companies.forEach(function (company) {
      labels.push(company.t + ' · ' + company.n);
      parents.push(company.sectorName);
      values.push(company.m || 0.01);
      colours.push(darken(company.sectorColor, company.m));
    });

    Plotly.newPlot('treemapChart', [{
      type: 'treemap',
      labels: labels,
      parents: parents,
      values: values,
      marker: { colors: colours },
      branchvalues: 'total',
      textinfo: 'label',
      textfont: { size: 11 },
      hovertemplate: '%{label}<br><b>%{value:,.1f} R bn</b><extra></extra>'
    }], {
      margin: { l: 0, r: 0, t: 0, b: 0 }
    }, { responsive: true, displayModeBar: false });
  }

  /* ---------------- Sector rail ---------------- */

  function renderSectorList() {
    var list = el('sectorList');
    if (!list) return;
    var stats = sectorStats();
    var total = stats.reduce(function (sum, s) { return sum + s.mcap; }, 0);

    list.innerHTML = stats.map(function (sector) {
      var net = sector.ups - sector.downs;
      var active = sector.id === state.activeSectorId ? 'active' : '';
      // The weight bar is a share of market cap, so it is shown only when the
      // caps exist. The listing count and net movers are cap-independent.
      var weightRow = '';
      if (total > 0) {
        var weight = (sector.mcap / total) * 100;
        weightRow =
          '<div class="d-flex justify-content-between align-items-center mt-1">' +
            '<div class="weight-bar flex-grow-1 me-2">' +
              '<div style="width:' + weight.toFixed(1) + '%;background:' +
                sector.color + ';"></div></div>' +
            '<span class="small text-muted" style="font-size:0.72rem;width:58px;' +
              'text-align:right;">' + weight.toFixed(1) + '%</span>' +
          '</div>';
      }
      return '<div class="sector-row ' + active + '" ' +
          'onclick="EquitiesView.toggleSector(\'' + sector.id + '\')">' +
        '<div class="d-flex justify-content-between align-items-center">' +
          '<div class="fw-semibold small">' + sector.icon + ' ' + sector.name +
            ' <span class="text-muted fw-normal">(' + sector.count + ')</span></div>' +
          '<div class="small ' + (net >= 0 ? 'up' : 'down') + ' fw-bold">' +
            (net >= 0 ? '+' : '') + net + '</div>' +
        '</div>' +
        weightRow +
      '</div>';
    }).join('');
  }

  /* ---------------- Movers ---------------- */

  function moverRow(company) {
    return '<tr>' +
      '<td><span class="fw-semibold">' + company.t + '</span>' +
        '<div class="text-muted" style="font-size:0.7rem;">' + company.n + '</div></td>' +
      '<td class="text-end pct-cell ' + F.signClass(company.c) + '">' +
        F.signArrow(company.c) + ' ' + Math.abs(company.c).toFixed(2) + '%</td>' +
      '<td class="text-end">R ' + F.num(company.p) + '</td>' +
    '</tr>';
  }

  function renderMovers() {
    var sorted = state.companies.slice().sort(function (a, b) { return b.c - a.c; });
    var top = sorted.slice(0, 8);
    var bottom = sorted.slice(-8).reverse();

    var gainers = el('moversTableBody');
    var losers = el('laggardsTableBody');
    if (gainers) gainers.innerHTML = top.map(moverRow).join('');
    if (losers) losers.innerHTML = bottom.map(moverRow).join('');
  }

  /* ---------------- Sector mix ---------------- */

  function renderSectorPie() {
    if (!window.Plotly) {
      showChartMessage('sectorPieChart', 'The sector market-cap mix is drawn ' +
        'with the Plotly library, which did not load.');
      return;
    }
    if (!hasMarketCaps()) {
      showChartMessage('sectorPieChart', 'The sector market-cap mix needs ' +
        'market caps, which the provider did not return for this fetch.');
      return;
    }

    var stats = sectorStats();
    Plotly.newPlot('sectorPieChart', [{
      type: 'pie',
      labels: stats.map(function (s) { return s.name; }),
      values: stats.map(function (s) { return s.mcap; }),
      marker: { colors: stats.map(function (s) { return s.color; }) },
      textinfo: 'percent',
      hovertemplate: '%{label}<br><b>%{value:,.0f} R bn</b> (%{percent})<extra></extra>'
    }], {
      margin: { l: 0, r: 0, t: 0, b: 0 },
      showlegend: false
    }, { responsive: true, displayModeBar: false });
  }

  /* ---------------- Filtered table ---------------- */

  function filteredCompanies() {
    var search = el('searchInput');
    var sectorFilter = el('sectorFilter');
    var changeFilter = el('changeFilter');
    var minCapInput = el('minCapInput');

    var query = search ? search.value.trim().toLowerCase() : '';
    var sector = sectorFilter ? sectorFilter.value : '';
    var change = changeFilter ? changeFilter.value : '';
    var minCap = minCapInput ? (parseFloat(minCapInput.value) || 0) : 0;

    return state.companies.filter(function (company) {
      if (sector && company.sectorId !== sector) return false;
      if (query && String(company.n || '').toLowerCase().indexOf(query) === -1 &&
          String(company.t || '').toLowerCase().indexOf(query) === -1) return false;
      if (change === 'up' && company.c <= 0) return false;
      if (change === 'down' && company.c >= 0) return false;
      if ((company.m || 0) < minCap) return false;
      return true;
    });
  }

  /**
   * Rebuild the sector dropdown from the payload in hand, so the filter shows
   * the sectors the refreshed universe actually has. The reader's current
   * choice is kept while that sector is still listed, and dropped when it is
   * not -- otherwise a stale choice would filter every row away.
   */
  function renderSectorOptions(payload) {
    var select = el('sectorFilter');
    if (!select) return;

    var previous = select.value || state.activeSectorId || '';
    var sectors = payload.sectors || [];

    while (select.options.length > 1) select.remove(1);

    sectors.forEach(function (sector) {
      var option = document.createElement('option');
      option.value = sector.id;
      option.textContent = sector.icon + ' ' + sector.name;
      select.appendChild(option);
    });

    var stillListed = sectors.some(function (sector) {
      return sector.id === previous;
    });
    select.value = stillListed ? previous : '';
    state.activeSectorId = select.value;
  }

  function renderTable(list) {
    var body = el('equitiesTableBody');
    if (!body) return;

    var wrap = body.parentNode ? body.parentNode.parentNode : null;
    var previousScroll = wrap ? wrap.scrollTop : 0;

    var sorted = list.slice().sort(function (a, b) {
      var left = a[state.sortKey];
      var right = b[state.sortKey];
      if (typeof left === 'string') left = left.toLowerCase();
      if (typeof right === 'string') right = right.toLowerCase();
      if (left === right) return 0;
      return (left < right ? -1 : 1) * state.sortDir;
    });

    body.innerHTML = sorted.map(function (company) {
      return '<tr>' +
        '<td class="tick">' + company.t + '</td>' +
        '<td>' + company.n + '</td>' +
        '<td class="text-end">' + F.num(company.p) + '</td>' +
        '<td class="text-end pct-cell ' + F.signClass(company.c) + '">' +
          F.signArrow(company.c) + ' ' + Math.abs(company.c).toFixed(2) + '%</td>' +
        '<td class="text-end mcap-cell">' + F.num(company.m, 2) + '</td>' +
        '<td><span class="badge" style="background:' + company.sectorColor +
          '22;color:' + company.sectorColor + ';">' + company.sectorName + '</span></td>' +
      '</tr>';
    }).join('');

    setText('tableCount', sorted.length);
    // Replacing the rows resets the scroll container, which would throw the
    // reader back to the top on every refresh. Keep their place instead.
    if (wrap && previousScroll) wrap.scrollTop = previousScroll;
  }

  /**
   * Which close the rows on screen are, and how long ago it was fetched. The
   * table is filtered and sorted client-side, so without this the area gives
   * no sign that a refresh has replaced the figures underneath it.
   */
  function tableBasisText() {
    var meta = state.meta || {};
    var payload = state.payload || {};
    var session = payload.sessionLabel
      ? payload.sessionLabel + ' close'
      : 'last settled close';

    if (meta.snapshot) {
      return session + ' · stored snapshot, captured ' + F.age(meta.ageSeconds);
    }
    if (meta.sessionStale) {
      return session + ' · earlier session, last checked ' +
        F.age(meta.ageSeconds);
    }
    return session + ' · fetched ' + F.age(meta.ageSeconds);
  }

  function renderTableStamp() {
    setText('tableStamp', tableBasisText());
  }

  /**
   * The Full Universe area as one step: the sector filter, the filtered and
   * sorted rows, and the provenance of those rows. Every payload the page
   * receives runs this, so the table always describes the fetch the header is
   * describing -- and it runs before the charts, which cannot take it down.
   */
  function renderUniverse() {
    renderSectorOptions(state.payload || {});
    renderTable(filteredCompanies());
    renderTableStamp();
  }

  function applyFilters() {
    renderTable(filteredCompanies());
  }

  function sortBy(key) {
    if (key === state.sortKey) {
      state.sortDir *= -1;
    } else {
      state.sortKey = key;
      state.sortDir = (key === 'n' || key === 't') ? 1 : -1;
    }
    var headers = document.querySelectorAll('.sortable');
    Array.prototype.forEach.call(headers, function (header) {
      header.classList.remove('table-active');
    });
    var active = document.querySelector('.sortable[data-key="' + key + '"]');
    if (active) active.classList.add('table-active');
    applyFilters();
  }

  function resetFilters() {
    ['searchInput', 'sectorFilter', 'changeFilter', 'minCapInput'].forEach(function (id) {
      var node = el(id);
      if (node) node.value = '';
    });
    state.activeSectorId = '';
    renderSectorList();
    applyFilters();
    safely(renderTreemap, 'market map');
    safely(renderSectorPie, 'sector market-cap mix');
  }

  function toggleSector(id) {
    state.activeSectorId = state.activeSectorId === id ? '' : id;
    var select = el('sectorFilter');
    if (select) select.value = state.activeSectorId;
    renderSectorList();
    applyFilters();
    safely(renderTreemap, 'market map');
  }

  /* ---------------- CSV export ---------------- */

  function csvCell(value) {
    return '"' + String(value).replace(/"/g, '""') + '"';
  }

  function exportCSV() {
    var list = filteredCompanies().sort(function (a, b) {
      return (b.m || 0) - (a.m || 0);
    });
    var lines = [['Ticker', 'Company', 'Last close (ZAR)', 'Day change %',
                  'Market cap (R bn)', 'Sector'].join(',')];

    list.forEach(function (company) {
      lines.push([
        company.t,
        csvCell(company.n),
        F.isNumber(company.p) ? company.p.toFixed(2) : '',
        F.isNumber(company.c) ? company.c.toFixed(2) : '',
        F.isNumber(company.m) ? company.m.toFixed(2) : '',
        csvCell(company.sectorName)
      ].join(','));
    });

    var blob = new Blob(['\ufeff' + lines.join('\n')], {
      type: 'text/csv;charset=utf-8;'
    });
    var link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = 'jse-sa-equities-' + (state.payload.asOf || '').slice(0, 10) + '.csv';
    link.click();
    URL.revokeObjectURL(link.href);
  }

  /* ---------------- Status + entry point ---------------- */

  /** The clock time out of '2026-09-17 21:46:15 SAST', for a compact stamp. */
  function priceTime(asOf) {
    if (!asOf) return '';
    var match = String(asOf).match(/(\d{2}:\d{2}:\d{2}\s*SAST)$/);
    return match ? match[1] : asOf;
  }

  /**
   * The header's provenance line. It names the JSE session the figures belong
   * to before it says anything else, because "which close am I looking at?" is
   * the one thing a reader cannot work out from the numbers themselves.
   */
  function renderStatus(meta, payload) {
    var firstSector = (payload.sectors || [])[0] || {};
    var firstCompany = (firstSector.companies || [])[0] || {};
    var intraday = firstCompany.basis === 'intraday';
    var sessionStale = !!(meta && meta.sessionStale);

    setText('dataModeLabel', intraday
      ? 'live session (intraday)'
      : (sessionStale ? 'earlier session — not the latest close'
                      : 'last settled close'));

    var parts = [];
    if (payload.sessionLabel) {
      parts.push(payload.sessionLabel + ' close');
      var time = priceTime(payload.asOf);
      if (time) parts.push('priced ' + time);
    } else if (payload.asOf) {
      parts.push(payload.asOf);
    }
    parts.push('fetched ' + F.age(meta ? meta.ageSeconds : null));
    setText('dataStamp', parts.join(' · '));

    var note = el('coverageNote');
    if (note) {
      var coverage = payload.coverage || {};
      var text = (coverage.priced || 0) + ' of ' + (coverage.covered || 0) +
        ' covered listings priced; ' + (payload.unavailable || []).length +
        ' JSE codes have no live feed on the free source and are excluded.';
      if (sessionStale) {
        text += ' These are the ' + (payload.sessionLabel || 'previous') +
          ' close; the current JSE session is ' +
          ((meta && meta.currentSessionLabel) || 'later') + '.';
      }
      if ((payload.totals || {}).marketCapAvailable === false) {
        text += ' The provider returned no market caps for this fetch, so the ' +
          'market-cap figures and the cap-weighted charts are omitted.';
      }
      note.textContent = text;
    }
  }

  function render(payload, meta) {
    state.payload = payload;
    state.companies = flatten(payload);
    state.meta = meta || null;

    renderStatus(meta, payload);
    renderKPIs();
    // The filtered, sorted table is repainted from this payload before the
    // charts are touched, so a refresh can never leave it on an older fetch.
    safely(renderUniverse, 'full universe table');
    renderSectorList();
    renderMovers();
    safely(renderTreemap, 'market map');
    safely(renderSectorPie, 'sector market-cap mix');
  }

  window.EquitiesView = {
    render: render,
    applyFilters: applyFilters,
    sortBy: sortBy,
    resetFilters: resetFilters,
    toggleSector: toggleSector,
    exportCSV: exportCSV
  };
})();
