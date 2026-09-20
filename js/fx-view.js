/* ============================================================
   Currency view: ZAR crosses with their history windows.

   Renders the cross table (spot, day move, 1W-1Y returns, 52-week range
   position and an inline sparkline) plus the derived equal-weighted ZAR
   strength chart.
   ============================================================ */
(function () {
  'use strict';

  var F = window.MarketFormat;
  var SPARK_W = 96;
  var SPARK_H = 26;
  var TREND_UP = '#2e7d32';
  var TREND_DOWN = '#c62828';

  function el(id) {
    return document.getElementById(id);
  }

  /** Build a small inline SVG sparkline for one series of [ts, value] pairs. */
  function sparkline(series) {
    if (!Array.isArray(series) || series.length < 2) return '';

    var values = series.map(function (point) { return point[1]; });
    var min = Math.min.apply(null, values);
    var max = Math.max.apply(null, values);
    var span = (max - min) || 1;

    var points = values.map(function (value, index) {
      var x = (index / (values.length - 1)) * SPARK_W;
      var y = SPARK_H - ((value - min) / span) * SPARK_H;
      return x.toFixed(1) + ',' + y.toFixed(1);
    }).join(' ');

    var colour = values[values.length - 1] >= values[0] ? TREND_UP : TREND_DOWN;
    return '<svg width="' + SPARK_W + '" height="' + SPARK_H + '" ' +
      'viewBox="0 0 ' + SPARK_W + ' ' + SPARK_H + '" aria-hidden="true">' +
      '<polyline fill="none" stroke="' + colour + '" stroke-width="1.6" ' +
      'points="' + points + '"/></svg>';
  }

  /** Where the current rate sits inside its 52-week range, as a percentage. */
  function rangePosition(pair) {
    if (!F.isNumber(pair.high1y) || !F.isNumber(pair.low1y)) return null;
    var span = pair.high1y - pair.low1y;
    if (span <= 0) return null;
    return ((pair.spot - pair.low1y) / span) * 100;
  }

  function positionBar(pair) {
    var position = rangePosition(pair);
    if (position === null) return '<span class="text-muted small">—</span>';
    var clamped = Math.max(0, Math.min(100, position));
    return '<div class="range-bar" title="1Y range ' + F.num(pair.low1y, 4) +
      ' – ' + F.num(pair.high1y, 4) + '">' +
      '<div style="width:' + clamped.toFixed(0) + '%"></div></div>' +
      '<span class="range-label">' + clamped.toFixed(0) + '%</span>';
  }

  function windowCells(pair, windows) {
    return windows.map(function (label) {
      var value = pair.windows ? pair.windows[label] : null;
      return '<td class="text-end ' + F.signClass(value) + '">' +
        F.signed(value, 2) + '</td>';
    }).join('');
  }

  function renderTable(payload) {
    var body = el('fxTableBody');
    if (!body) return;
    var windows = payload.windows || [];

    body.innerHTML = payload.pairs.map(function (pair) {
      return '<tr>' +
        '<td class="fw-semibold">' + pair.label + '</td>' +
        '<td class="text-end fw-semibold">' + F.num(pair.spot, 4) + '</td>' +
        '<td class="text-end ' + F.signClass(pair.changePct) + ' pct-cell">' +
          F.signArrow(pair.changePct) + ' ' + F.signed(pair.changePct, 2) + '</td>' +
        windowCells(pair, windows) +
        '<td class="text-center">' + positionBar(pair) + '</td>' +
        '<td class="text-center">' + sparkline(pair.series) + '</td>' +
      '</tr>';
    }).join('');
  }

  function renderIndex(payload) {
    var container = el('fxIndexChart');
    if (!container) return;
    var index = payload.zarIndex;
    if (!index || !index.series || !index.series.length) {
      container.innerHTML = '<p class="text-muted small mb-0">' +
        'No derived index available.</p>';
      return;
    }

    var rising = F.isNumber(index.changePct) && index.changePct > 0;
    Plotly.newPlot(container, [{
      type: 'scatter',
      mode: 'lines',
      x: index.series.map(function (point) { return point[0]; }),
      y: index.series.map(function (point) { return point[1]; }),
      line: { color: rising ? TREND_UP : TREND_DOWN, width: 2 },
      hovertemplate: '%{x|%d %b %Y}<br><b>%{y:.2f}</b><extra></extra>'
    }], {
      margin: { l: 40, r: 8, t: 8, b: 26 },
      height: 190,
      xaxis: { type: 'date', showgrid: false, tickfont: { size: 10 } },
      // Autoscaled to the data: anchoring the axis at zero flattens the move.
      yaxis: {
        tickfont: { size: 10 },
        zeroline: false,
        title: { text: 'index', font: { size: 10 } }
      },
      showlegend: false
    }, { responsive: true, displayModeBar: false });
  }

  function renderSummary(payload) {
    var target = el('fxSummary');
    if (!target) return;
    var usd = payload.pairs.filter(function (pair) {
      return pair.code === 'USDZAR';
    })[0];
    if (!usd) {
      target.textContent = '';
      return;
    }
    var oneYear = usd.windows ? usd.windows['1Y'] : null;
    var direction = F.isNumber(oneYear) && oneYear > 0 ? 'weaker' : 'stronger';
    target.innerHTML = 'USD/ZAR <strong>' + F.num(usd.spot, 4) + '</strong>' +
      ' (' + F.signed(usd.changePct, 2) + ' on the day, ' +
      F.signed(oneYear, 1) + ' over 12 months, i.e. the rand is <strong>' +
      direction + '</strong> against the dollar over that window).';
  }

  function render(payload) {
    renderSummary(payload);
    renderTable(payload);
    renderIndex(payload);
  }

  window.FxView = { render: render, sparkline: sparkline };
})();
