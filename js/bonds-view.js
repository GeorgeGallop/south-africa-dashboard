/* ============================================================
   SA government bond view.

   Renders the benchmark yield curve, the same curve as a table with 1M/6M/12M
   moves, the "rates down the curve" ladder measured against the SARB policy
   rate, the annual curve history and the sovereign rating panel.
   ============================================================ */
(function () {
  'use strict';

  var F = window.MarketFormat;
  var LINE_COLOUR = '#007A4D';
  var POLICY_COLOUR = '#c62828';
  var HISTORY_SERIES = [
    { key: '3M', label: '3-month', colour: '#0097a7' },
    { key: '5Y', label: '5-year', colour: '#f57c00' },
    { key: '10Y', label: '10-year', colour: '#007A4D' },
    { key: '30Y', label: '30-year', colour: '#455a64' }
  ];

  function el(id) {
    return document.getElementById(id);
  }

  function setText(id, value) {
    var node = el(id);
    if (node) node.textContent = value;
  }

  function renderSummary(data) {
    setText('bondPolicyRate', F.isNumber(data.policyRate.rate)
      ? data.policyRate.rate.toFixed(2) + '%' : '—');
    setText('bondPolicyDate', data.policyRate.asOf || '');
    setText('bond10y', F.isNumber(data.benchmark10y)
      ? data.benchmark10y.toFixed(3) + '%' : '—');

    var shape = data.shape || {};
    setText('bond10ySpread', F.bp(shape.policySpread10yBp, 1));
    setText('bondPeak', shape.peakMonths
      ? (shape.peakMonths / 12) + 'Y' : '—');
    setText('bondCds', F.isNumber(data.cds5yBp)
      ? data.cds5yBp.toFixed(0) + ' bp' : '—');
    setText('bondAsOf', data.asOf || '');
    setText('bondUpdated', data.lastUpdate || '');

    var inversion = el('bondInversionNote');
    if (inversion) {
      if (shape.longEndInverted) {
        var slope = F.bp(shape.slope10y30yBp, 1);
        inversion.className = 'alert alert-warning py-2 px-3 small mb-0';
        inversion.innerHTML = '<strong>Long end inverted.</strong> The curve ' +
          'peaks at <strong>' + (shape.peakMonths / 12) + ' years</strong> and ' +
          'the 30-year sits ' + slope + ' versus the 10-year, so the market is ' +
          'pricing lower long-run yields than at the peak.';
      } else {
        inversion.className = 'alert alert-secondary py-2 px-3 small mb-0';
        inversion.textContent = 'The curve slopes upward to the 30-year.';
      }
    }
  }

  function renderCurveChart(data) {
    var container = el('bondCurveChart');
    if (!container) return;
    var curve = data.curve || [];

    Plotly.newPlot(container, [{
      type: 'scatter',
      mode: 'lines+markers',
      x: curve.map(function (point) { return point.label; }),
      y: curve.map(function (point) { return point.yield; }),
      line: { color: LINE_COLOUR, width: 2.5 },
      marker: { size: 7, color: LINE_COLOUR },
      customdata: curve.map(function (point) { return point.months; }),
      hovertemplate: '%{x} (%{customdata} months)<br><b>%{y:.3f}%</b><extra></extra>'
    }], {
      margin: { l: 46, r: 10, t: 10, b: 32 },
      height: 300,
      xaxis: { title: { text: 'Residual maturity', font: { size: 11 } },
               tickfont: { size: 10 } },
      yaxis: { title: { text: 'Yield (%)', font: { size: 11 } },
               ticksuffix: '%', tickfont: { size: 10 }, rangemode: 'tozero' },
      shapes: F.isNumber(data.policyRate.rate) ? [{
        type: 'line', xref: 'paper', x0: 0, x1: 1,
        y0: data.policyRate.rate, y1: data.policyRate.rate,
        line: { color: POLICY_COLOUR, width: 1.4, dash: 'dot' }
      }] : [],
      annotations: F.isNumber(data.policyRate.rate) ? [{
        xref: 'paper', x: 0, y: data.policyRate.rate, xanchor: 'left',
        yanchor: 'bottom', text: 'policy ' + data.policyRate.rate.toFixed(2) + '%',
        showarrow: false, font: { size: 10, color: POLICY_COLOUR }
      }] : [],
      showlegend: false
    }, { responsive: true, displayModeBar: false });
  }

  function changeCell(value) {
    return '<td class="text-end ' + F.signClass(value) + '">' + F.bp(value, 1) + '</td>';
  }

  function renderCurveTable(data) {
    var body = el('bondCurveBody');
    if (!body) return;
    body.innerHTML = (data.curve || []).map(function (point) {
      return '<tr>' +
        '<td class="fw-semibold">' + point.label + '</td>' +
        '<td class="text-end fw-semibold">' + F.num(point.yield, 3) + '%</td>' +
        changeCell(point.change1mBp) +
        changeCell(point.change6mBp) +
        changeCell(point.change12mBp) +
        '<td class="text-end">' + F.num(point.zeroCouponPrice, 2) + '</td>' +
        '<td class="text-end">' + F.num(point.capitalGrowth, 3) + '</td>' +
      '</tr>';
    }).join('');
  }

  function renderLadder(data) {
    var body = el('bondLadderBody');
    if (!body) return;
    var entries = data.spreadsVsPolicy || [];

    body.innerHTML = entries.map(function (entry) {
      var spread = entry.spreadOverPolicyBp;
      var width = F.isNumber(spread)
        ? Math.max(2, Math.min(100, Math.abs(spread) / 3)) : 0;
      var colour = F.isNumber(spread) && spread >= 0 ? LINE_COLOUR : POLICY_COLOUR;
      return '<tr>' +
        '<td class="fw-semibold">' + entry.label + '</td>' +
        '<td class="text-end">' + F.num(entry.yield, 3) + '%</td>' +
        '<td class="text-end ' + F.signClass(spread) + '">' + F.bp(spread, 1) + '</td>' +
        '<td><div class="weight-bar"><div style="width:' + width.toFixed(0) +
          '%;background:' + colour + ';"></div></div></td>' +
      '</tr>';
    }).join('');
  }

  function renderHistory(data) {
    var container = el('bondHistoryChart');
    if (!container) return;
    var periods = (data.history || []).slice().reverse();
    if (!periods.length) {
      container.innerHTML = '<p class="text-muted small mb-0">' +
        'No history available.</p>';
      return;
    }

    var traces = HISTORY_SERIES.map(function (series) {
      return {
        type: 'scatter',
        mode: 'lines+markers',
        name: series.label,
        x: periods.map(function (period) { return period.period; }),
        y: periods.map(function (period) {
          var value = period.yields ? period.yields[series.key] : null;
          return F.isNumber(value) ? value : null;
        }),
        connectgaps: false,
        line: { color: series.colour, width: 1.8 },
        marker: { size: 5, color: series.colour },
        hovertemplate: series.label + ' %{x}: <b>%{y:.3f}%</b><extra></extra>'
      };
    });

    Plotly.newPlot(container, traces, {
      margin: { l: 44, r: 10, t: 6, b: 40 },
      height: 290,
      xaxis: { tickfont: { size: 10 }, showgrid: false },
      yaxis: { ticksuffix: '%', tickfont: { size: 10 }, title: { text: 'Yield (%)', font: { size: 10 } } },
      legend: { orientation: 'h', y: -0.2, font: { size: 10 } }
    }, { responsive: true, displayModeBar: false });
  }

  function renderRatings(data) {
    var body = el('bondRatingsBody');
    if (!body) return;
    var ratings = data.ratings || [];
    if (!ratings.length) {
      body.innerHTML = '<tr><td colspan="4" class="text-muted small">' +
        'No ratings available.</td></tr>';
      return;
    }
    body.innerHTML = ratings.map(function (rating) {
      var outlook = rating.outlook || '—';
      var badge = outlook === 'positive' ? 'up' :
        outlook === 'negative' ? 'down' : 'flat';
      return '<tr>' +
        '<td>' + rating.agency + '</td>' +
        '<td class="fw-semibold">' + (rating.rating || '—') + '</td>' +
        '<td class="' + badge + '">' + outlook + '</td>' +
        '<td class="text-muted">' + (rating.asOf || '—') + '</td>' +
      '</tr>';
    }).join('');
  }

  function render(data) {
    renderSummary(data);
    renderCurveChart(data);
    renderCurveTable(data);
    renderLadder(data);
    renderHistory(data);
    renderRatings(data);
  }

  window.BondsView = { render: render };
})();
