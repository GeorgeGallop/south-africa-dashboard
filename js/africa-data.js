/* ============================================================
   Africa - Electricity Access & Population (World Bank API)
   ------------------------------------------------------------
   Fetches population (SP.POP.TOTL) and access to electricity
   (EG.ELC.ACCS.ZS) for ALL 54 African countries from the World
   Bank API, computes population without access
   (pop * (1 - access/100)), and renders:
     - a multi-country time series
     - a country breakdown chart
     - a headline stat validating the "~600M without access" figure
   ============================================================ */
(function () {
  'use strict';

  var AFRICA_ISO3 = [
    'DZA','AGO','BEN','BWA','BFA','BDI','CPV','CMR','CAF','TCD','COM','COD','COG','CIV','DJI','EGY','GNQ','ERI','SWZ','ETH','GAB','GMB','GHA','GIN','GNB','KEN','LSO','LBR','LBY','MDG','MWI','MLI','MRT','MUS','MAR','MOZ','NAM','NER','NGA','RWA','STP','SEN','SYC','SLE','SOM','ZAF','SSD','SDN','TZA','TGO','TUN','UGA','ZMB','ZWE'
  ];

  var AFRICA_NAMES = {
    DZA:'Algeria',AGO:'Angola',BEN:'Benin',BWA:'Botswana',BFA:'Burkina Faso',BDI:'Burundi',
    CPV:'Cabo Verde',CMR:'Cameroon',CAF:'Central African Republic',TCD:'Chad',COM:'Comoros',
    COD:'DR Congo',COG:'Congo',CIV:"Côte d'Ivoire",DJI:'Djibouti',EGY:'Egypt',
    GNQ:'Equatorial Guinea',ERI:'Eritrea',SWZ:'Eswatini',ETH:'Ethiopia',GAB:'Gabon',
    GMB:'Gambia',GHA:'Ghana',GIN:'Guinea',GNB:'Guinea-Bissau',KEN:'Kenya',LSO:'Lesotho',
    LBR:'Liberia',LBY:'Libya',MDG:'Madagascar',MWI:'Malawi',MLI:'Mali',MRT:'Mauritania',
    MUS:'Mauritius',MAR:'Morocco',MOZ:'Mozambique',NAM:'Namibia',NER:'Niger',NGA:'Nigeria',
    RWA:'Rwanda',STP:'São Tomé & Príncipe',SEN:'Senegal',SYC:'Seychelles',SLE:'Sierra Leone',
    SOM:'Somalia',ZAF:'South Africa',SSD:'South Sudan',SDN:'Sudan',TZA:'Tanzania',TGO:'Togo',
    TUN:'Tunisia',UGA:'Uganda',ZMB:'Zambia',ZWE:'Zimbabwe'
  };

  var INDICATORS = { pop: 'SP.POP.TOTL', access: 'EG.ELC.ACCS.ZS' };
  var START_YEAR = 1990;
  var END_YEAR = new Date().getFullYear() + 1;

  var PALETTE = [
    '#007A4D','#FFCD00','#002395','#6f42c1','#fd7e14','#20c997','#dc3545','#17a2b8',
    '#6610f2','#28a745','#e83e8c','#343a40','#9b5de5','#00bbf9','#f15bb5','#fee440',
    '#5e60ce','#7400b8','#6930c3','#5390d9','#48bfe3','#72efdd','#80ffdb','#d9ed92',
    '#ffd6a5','#fdfcdc','#b8f2e6','#cdb4db','#f72585','#3a0ca3','#4cc9f0','#90be6d',
    '#f9c74f','#f9844a','#e63946','#023047','#219ebc','#8ecae6','#ffb703','#fb8500',
    '#588157','#3a5a40','#a3b18a','#dad7cd','#344e41','#ccd5ae','#e9edc9','#fefae0',
    '#dda15e','#606c38','#283618','#bc6c25','#6d597a','#b56576'
  ];

  var state = {
    years: [],
    pop: {},
    access: {},
    metric: 'without',
    windowSize: 9999,
    windowStart: 0,
    loading: false,
    lastUpdated: null
  };

  var lineChart = null;
  var detailChart = null;

  // ---------- helpers ----------
  function el(id) { return document.getElementById(id); }

  function fmtNumber(n) {
    if (n == null || isNaN(n)) return '—';
    if (n >= 1e9) return (n / 1e9).toFixed(2) + ' billion';
    if (n >= 1e6) return (n / 1e6).toFixed(1) + ' million';
    return n.toLocaleString();
  }

  function fmtFull(n) {
    if (n == null || isNaN(n)) return '—';
    return Math.round(n).toLocaleString();
  }

  function metricLabel(m) {
    if (m === 'pop') return 'Total population';
    if (m === 'access') return 'Access to electricity (%)';
    return 'Population without access';
  }

  // ---------- data loading ----------
  function apiUrl(code, page) {
    return 'https://api.worldbank.org/v2/country/' + AFRICA_ISO3.join(';') +
      '/indicator/' + code + '?format=json&date=' + START_YEAR + ':' + END_YEAR +
      '&per_page=500&page=' + page;
  }

  async function fetchIndicator(code) {
    var out = {};
    var page = 1;
    var total = 1;
    while (page <= total) {
      var resp;
      try {
        resp = await fetch(apiUrl(code, page));
      } catch (e) {
        throw new Error('World Bank API fetch failed: ' + e.message);
      }
      var json = await resp.json();
      if (!json || !json[1] || !json[1].length) break;
      total = Math.max(1, (json[0] && json[0].pages) || 1);
      json[1].forEach(function (row) {
        if (!row || !row.countryiso3code || row.value == null) return;
        if (!out[row.countryiso3code]) out[row.countryiso3code] = {};
        out[row.countryiso3code][String(row.date)] = row.value;
      });
      page++;
      if (page > 50) break; // safety
    }
    return out;
  }

  function align(rawPop, rawAccess) {
    var yearSet = {};
    Object.keys(rawPop).forEach(function (iso) {
      Object.keys(rawPop[iso]).forEach(function (y) { yearSet[y] = 1; });
    });
    state.years = Object.keys(yearSet).map(Number).sort(function (a, b) { return a - b; });

    var idx = {};
    state.years.forEach(function (y, i) { idx[y] = i; });

    state.pop = {};
    state.access = {};
    AFRICA_ISO3.forEach(function (iso) {
      if (!rawPop[iso] && !rawAccess[iso]) return;
      state.pop[iso] = new Array(state.years.length).fill(null);
      state.access[iso] = new Array(state.years.length).fill(null);
      Object.keys(rawPop[iso] || {}).forEach(function (y) {
        if (idx[y] !== undefined) state.pop[iso][idx[y]] = rawPop[iso][y];
      });
      Object.keys(rawAccess[iso] || {}).forEach(function (y) {
        if (idx[y] !== undefined) state.access[iso][idx[y]] = rawAccess[iso][y];
      });
    });
  }

  function withoutAccess(iso, i) {
    var p = state.pop[iso][i];
    var a = state.access[iso][i];
    if (p == null || a == null) return null;
    return p * (1 - a / 100);
  }

  function metricValue(iso, i) {
    if (state.metric === 'pop') return state.pop[iso][i];
    if (state.metric === 'access') return state.access[iso][i];
    return withoutAccess(iso, i);
  }

  // Latest year index that has BOTH population and access data for
  // at least one country (used for the "without access" totals).
  function latestCompleteYearIndex() {
    for (var i = state.years.length - 1; i >= 0; i--) {
      var anyPop = false, anyAccess = false;
      AFRICA_ISO3.forEach(function (iso) {
        if (state.pop[iso] && state.pop[iso][i] != null) anyPop = true;
        if (state.access[iso] && state.access[iso][i] != null) anyAccess = true;
      });
      if (anyPop && anyAccess) return i;
    }
    return state.years.length - 1;
  }

  // Latest year that has data for a given country (fallback for per-country charts)
  function latestYearIndexFor(iso) {
    for (var i = state.years.length - 1; i >= 0; i--) {
      var v = metricValue(iso, i);
      if (v != null) return i;
    }
    return state.years.length - 1;
  }

  // ---------- window helpers ----------
  function currentWindow() {
    var full = state.years.length;
    if (!full) return { s: 0, e: 0, labels: [] };
    var size = state.windowSize === 9999 ? full : Math.min(state.windowSize, full);
    var maxStart = Math.max(0, full - size);
    var s = Math.max(0, Math.min(state.windowStart, maxStart));
    return { s: s, e: s + size - 1, maxStart: maxStart };
  }

  // ---------- charts ----------
  function drawAfrica(id, traces, opts) {
    if (window.DataPlots && typeof window.DataPlots.draw === 'function') {
      window.DataPlots.draw(id, traces, opts || {});
      return;
    }
    var host = el(id);
    if (!host || typeof Plotly === 'undefined') return;
    Plotly.react(host, traces, {
      autosize: true,
      margin: { l: 30, r: 6, t: 4, b: 18 },
      paper_bgcolor: 'rgba(0,0,0,0)',
      plot_bgcolor: '#fff',
      showlegend: false,
      hovermode: traces[0] && traces[0].type === 'pie' ? 'closest' : 'x unified',
      font: { family: 'Segoe UI, system-ui, sans-serif', size: 9, color: '#343a40' }
    }, { responsive: true, displayModeBar: false });
  }

  function renderLineChart() {
    var host = el('africaLineChart');
    if (!host || !state.years.length) return;
    var w = currentWindow();
    var labels = state.years.slice(w.s, w.e + 1).map(String);
    var hover = state.metric === 'access'
      ? '%{y:.1f}%'
      : '%{y:,.0f}';

    var traces = [];
    AFRICA_ISO3.forEach(function (iso, i) {
      if (!state.pop[iso]) return;
      var color = PALETTE[i % PALETTE.length];
      var name = AFRICA_NAMES[iso] || iso;
      traces.push({
        type: 'scatter',
        mode: 'lines',
        name: name,
        x: labels,
        y: state.years.slice(w.s, w.e + 1).map(function (_, j) {
          return metricValue(iso, w.s + j);
        }),
        line: { color: color, width: 1.4 },
        hovertemplate: name + '<br>%{x}: ' + hover + '<extra></extra>',
        connectgaps: true
      });
    });

    drawAfrica('africaLineChart', traces, {
      yTitle: metricLabel(state.metric),
      tickformat: state.metric === 'access' ? '.0f' : '~s'
    });
    lineChart = host;
  }

  function renderDetailChart() {
    var host = el('africaPieChart');
    if (!host || !state.years.length) return;
    var w = currentWindow();
    var summaryIdx = (state.metric === 'without') ? latestCompleteYearIndex() : null;
    var yrIdx = summaryIdx !== null ? summaryIdx : w.e;

    var rows = [];
    AFRICA_ISO3.forEach(function (iso, i) {
      if (!state.pop[iso]) return;
      var v;
      if (state.metric === 'access') v = state.access[iso][yrIdx];
      else if (state.metric === 'pop') v = state.pop[iso][yrIdx];
      else v = withoutAccess(iso, yrIdx);
      if (v == null && state.metric !== 'access') v = 0;
      rows.push({ iso: iso, name: AFRICA_NAMES[iso] || iso, value: v, color: PALETTE[i % PALETTE.length] });
    });

    if (state.metric === 'access') {
      rows.sort(function (a, b) { return (b.value || 0) - (a.value || 0); });
      var top = rows.slice(0, 15);
      drawAfrica('africaPieChart', [{
        type: 'bar',
        orientation: 'h',
        x: top.map(function (r) { return r.value; }),
        y: top.map(function (r) { return r.name; }),
        marker: { color: top.map(function (r) { return r.color; }) },
        hovertemplate: '%{y}<br>%{x:.1f}%<extra></extra>'
      }], { yTitle: 'Access to electricity (%)' });
      detailChart = host;
      return;
    }

    rows = rows.filter(function (r) { return r.value > 0; });
    rows.sort(function (a, b) { return b.value - a.value; });
    var shown = rows.slice(0, 8);
    var rest = rows.slice(8);
    var restSum = rest.reduce(function (s, r) { return s + r.value; }, 0);
    var labels = shown.map(function (r) { return r.name; });
    var values = shown.map(function (r) { return r.value; });
    var colors = shown.map(function (r) { return r.color; });
    if (restSum > 0) {
      labels.push('Other (' + rest.length + ' countries)');
      values.push(restSum);
      colors.push('#adb5bd');
    }

    drawAfrica('africaPieChart', [{
      type: 'pie',
      labels: labels,
      values: values,
      marker: { colors: colors, line: { color: '#fff', width: 1 } },
      hole: 0.42,
      textinfo: 'none',
      hovertemplate: '%{label}<br>%{value:,.0f} (%{percent})<extra></extra>',
      sort: false
    }], {});
    detailChart = host;
  }

  // ---------- summary ----------
  function renderSummary() {
    var box = el('africaSummary');
    if (!box) return;
    if (!state.years.length) {
      box.innerHTML = '<span class="text-danger">No data loaded yet.</span>';
      return;
    }
    var w = currentWindow();
    var summaryIdx = (state.metric === 'without') ? latestCompleteYearIndex() : w.e;
    var yr = state.years[summaryIdx];

    var totalPop = 0, totalWithout = 0, countriesPop = 0;
    AFRICA_ISO3.forEach(function (iso) {
      if (!state.pop[iso]) return;
      var p = state.pop[iso][summaryIdx];
      var a = state.access[iso][summaryIdx];
      if (p != null) { totalPop += p; countriesPop++; }
      if (p != null && a != null) totalWithout += p * (1 - a / 100);
    });

    var pctWithout = totalPop ? (totalWithout / totalPop * 100) : 0;

    var updated = state.lastUpdated ? new Date(state.lastUpdated).toLocaleString() : '—';

    box.innerHTML =
      '<div class="row g-3">' +
      '  <div class="col-md-4 col-6"><div class="fs-4 fw-bold text-sa-green">' + fmtNumber(totalWithout) + '</div>' +
      '    <div class="text-muted small">Population WITHOUT access · ' + yr + ' (all Africa)</div></div>' +
      '  <div class="col-md-4 col-6"><div class="fs-4 fw-bold">' + fmtNumber(totalPop) + '</div>' +
      '    <div class="text-muted small">Total population · ' + yr + ' (' + countriesPop + ' countries)</div></div>' +
      '  <div class="col-md-4 col-6"><div class="fs-4 fw-bold">' + pctWithout.toFixed(2) + '%</div>' +
      '    <div class="text-muted small">Share without access</div></div>' +
      '</div>' +
      '<hr>' +
      '<p class="small text-muted mb-1"><strong>The ~600 million figure:</strong> the commonly cited value is for ' +
      '<em>Sub-Saharan Africa</em> (World Bank, ~2022). This page computes all <strong>54 African countries</strong> ' +
      '(Sub-Saharan Africa + North Africa).</p>' +
      '<p class="small text-muted mb-0">For ' + yr + ' the computed total across Africa is <strong>' +
      fmtFull(totalWithout) + ' people</strong> without access to electricity. ' +
      (totalWithout >= 5.5e8 && totalWithout < 7.5e8
        ? 'That is consistent with the ~600 million ballpark. '
        : 'That differs from the ~600 million figure — see the exact number above and the source data. ') +
      'Source: World Bank API (SP.POP.TOTL × (1 − EG.ELC.ACCS.ZS/100)). Last updated: ' + updated + '.</p>';
  }

  // ---------- render all ----------
  function renderAll() {
    renderLineChart();
    renderDetailChart();
    renderSummary();
  }

  // ---------- public load ----------
  async function loadAfricaData(opts) {
    opts = opts || {};
    var btn = el('africaRefreshBtn');
    if (state.loading) return;
    state.loading = true;
    if (btn) { btn.disabled = true; btn.innerHTML = '⏳ Fetching World Bank data…'; }

    var summary = el('africaSummary');
    if (summary && !opts.silent) summary.textContent = 'Fetching population + electricity access for 54 African countries from the World Bank API…';

    try {
      var rawPop = await fetchIndicator(INDICATORS.pop);
      var rawAccess = await fetchIndicator(INDICATORS.access);
      align(rawPop, rawAccess);
      state.lastUpdated = Date.now();
      renderAll();
      document.querySelectorAll('.data-tile .plotly-host').forEach(function (host) {
        if (window.DataPlots && window.DataPlots.size) window.DataPlots.size(host);
        else if (typeof Plotly !== 'undefined') Plotly.Plots.resize(host);
      });
    } catch (e) {
      if (summary) summary.innerHTML = '<span class="text-danger">⚠️ ' + e.message + '</span>';
    } finally {
      state.loading = false;
      if (btn) { btn.disabled = false; btn.innerHTML = '↻ Refresh from API'; }
    }
  }

  // ---------- CSV download ----------
  function downloadCSV() {
    if (!state.years.length) return;
    var w = currentWindow();
    var header = ['Year'].concat(AFRICA_ISO3.filter(function (iso) { return state.pop[iso]; }).map(function (iso) { return AFRICA_NAMES[iso] || iso; }));
    var lines = [header.join(',')];
    for (var i = w.s; i <= w.e; i++) {
      var row = [state.years[i]];
      AFRICA_ISO3.forEach(function (iso) {
        if (!state.pop[iso]) return;
        var v = metricValue(iso, i);
        row.push(v == null ? '' : (state.metric === 'access' ? v.toFixed(2) : Math.round(v)));
      });
      lines.push(row.join(','));
    }
    var blob = new Blob([lines.join('\n')], { type: 'text/csv' });
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'africa_' + state.metric + '_' + state.years[w.s] + '-' + state.years[w.e] + '.csv';
    a.click();
    URL.revokeObjectURL(a.href);
  }

  // ---------- init ----------
  function init() {
    // metric buttons
    var metricBtns = document.querySelectorAll('[data-africa-metric]');
    Array.prototype.forEach.call(metricBtns, function (b) {
      b.addEventListener('click', function () {
        state.metric = b.getAttribute('data-africa-metric');
        Array.prototype.forEach.call(metricBtns, function (x) { x.classList.remove('active'); });
        b.classList.add('active');
        renderAll();
      });
    });

    var refresh = el('africaRefreshBtn');
    if (refresh) refresh.addEventListener('click', function () { loadAfricaData(); });

    var download = el('africaDownloadBtn');
    if (download) download.addEventListener('click', downloadCSV);

    loadAfricaData({ silent: true });
  }

  window.loadAfricaData = loadAfricaData;

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
