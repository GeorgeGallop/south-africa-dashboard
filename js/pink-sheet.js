/* ============================================================
   Pink Sheet - Official Commodity Prices (World Bank)
   ------------------------------------------------------------
   Loads the World Bank Pink Sheet annual price data
   (extracted from the official CMO-Historical-Data-Annual.xlsx
   published at the World Bank Commodity Markets page) and
   re-renders the commodity cards with official values.
   ============================================================ */
(function () {
  'use strict';

  var PINK_SHEET_URL = '../data/power/pink_sheet_annual.json';

  // Maps dashboard card id -> Pink Sheet commodity label
  var SERIES = [
    { id: 'goldChart',       label: 'Gold',                    color: '#FFCD00' },
    { id: 'platinumChart',   label: 'Platinum',                color: '#6c757d' },
    { id: 'coalChart',       label: 'Coal, South African',     color: '#343a40' },
    { id: 'ironOreChart',    label: 'Iron ore, cfr spot',      color: '#fd7e14' }
  ];

  function el(id) { return document.getElementById(id); }

  function renderCard(card, years, values, unit) {
    if (!card.host) return;
    var hover = card.label + '<br>%{x}: %{y:.2f}' + (unit ? ' ' + unit : '') + '<extra></extra>';
    var traces = [{
      type: 'scatter',
      mode: 'lines',
      name: card.label,
      x: years,
      y: values,
      line: { color: card.color, width: 1.7, shape: 'spline' },
      hovertemplate: hover,
      connectgaps: true
    }];
    if (window.DataPlots && typeof window.DataPlots.draw === 'function') {
      window.DataPlots.draw(card.id, traces, { yTitle: card.label + (unit ? ' (' + unit + ')' : '') });
      return;
    }
    if (typeof Plotly === 'undefined') return;
    Plotly.react(card.host, traces, {
      autosize: true,
      margin: { l: 30, r: 6, t: 4, b: 18 },
      paper_bgcolor: 'rgba(0,0,0,0)',
      plot_bgcolor: '#fff',
      showlegend: false,
      hovermode: 'x unified',
      font: { family: 'Segoe UI, system-ui, sans-serif', size: 9, color: '#343a40' },
      xaxis: { showgrid: false, tickfont: { size: 8 }, nticks: 4 },
      yaxis: { gridcolor: '#eef1f4', tickfont: { size: 8 }, nticks: 4, zeroline: false }
    }, { responsive: true, displayModeBar: false });
  }

  var PINK_PAGE = 'https://www.worldbank.org/en/research/commodity-markets';
  var PINK_XLSX = 'https://thedocs.worldbank.org/en/doc/74e8be41ceb20fa0da750cda2f6b9e4e-0050012026/related/CMO-Historical-Data-Annual.xlsx';

  function markSourceNote(id, text) {
    var host = el(id);
    var card = host && host.closest('.card');
    if (!card) return;
    var note = card.querySelector('.data-source-note') || card.querySelector('.pink-source-note');
    if (note) {
      if (note.querySelector('a')) return;
      note.innerHTML = 'Source: <a href="' + PINK_PAGE + '" target="_blank" rel="noopener">World Bank Pink Sheet</a> · <a href="' + PINK_XLSX + '" target="_blank" rel="noopener">annual xlsx</a>';
      return;
    }
    note = document.createElement('p');
    note.className = 'data-source-note';
    note.innerHTML = 'Source: <a href="' + PINK_PAGE + '" target="_blank" rel="noopener">World Bank Pink Sheet</a> · <a href="' + PINK_XLSX + '" target="_blank" rel="noopener">annual xlsx</a>';
    card.appendChild(note);
  }

  async function loadPinkSheet() {
    var resp, json;
    try {
      resp = await fetch(PINK_SHEET_URL);
      if (!resp.ok) throw new Error('HTTP ' + resp.status);
      json = await resp.json();
    } catch (e) {
      console.warn('Pink Sheet not loaded (keeping local CSV charts):', e.message);
      return;
    }

    var years = json.years;
    var commodities = json.commodities;

    SERIES.forEach(function (s) {
      var host = el(s.id);
      var data = commodities[s.label];
      if (!host || !data || !data.values) return;

      var values = years.map(function (y) {
        return data.values[y] != null ? data.values[y] : null;
      });

      renderCard({ id: s.id, host: host, label: s.label, color: s.color }, years, values, data.unit);
      markSourceNote(s.id, 'Source: World Bank Pink Sheet (official)');
      if (window.DataPlots && window.DataPlots.size) window.DataPlots.size(host);
      else if (typeof Plotly !== 'undefined') Plotly.Plots.resize(host);
    });

    var commodityBlock = el('commodity-prices');
    if (commodityBlock) {
      var footer = commodityBlock.querySelector('.pink-global-note');
      if (!footer) {
        footer = document.createElement('p');
        footer.className = 'pink-global-note text-muted mt-2 small';
        footer.textContent = 'Commodity prices sourced from the World Bank Commodity Price Data (The Pink Sheet) — ' +
          json.source + '. Gold, Platinum, Coal (South Africa) and Iron Ore now display official World Bank values.';
        commodityBlock.appendChild(footer);
      }
    }
  }

  window.loadPinkSheet = loadPinkSheet;
})();
