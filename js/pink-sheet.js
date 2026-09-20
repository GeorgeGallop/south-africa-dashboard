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
    if (!card.canvas) return;
    new Chart(card.canvas, {
      type: 'line',
      data: {
        labels: years,
        datasets: [{
          label: card.label,
          data: values,
          borderColor: card.color,
          backgroundColor: card.color + '22',
          pointBackgroundColor: card.color,
          pointBorderColor: card.color,
          borderWidth: 2,
          pointRadius: 2,
          pointHoverRadius: 6,
          tension: 0.2,
          spanGaps: true
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: true,
        plugins: {
          legend: { display: false },
          tooltip: {
            enabled: true,
            callbacks: {
              label: function (ci) {
                return card.label + ': ' + ci.parsed.y + (unit ? ' ' + unit : '');
              }
            }
          }
        },
        scales: {
          x: { ticks: { maxTicksLimit: 8, font: { size: 9 } } },
          y: { ticks: { font: { size: 9 } } }
        }
      }
    });
  }

  function markSourceNote(id, text) {
    var canvas = el(id);
    var card = canvas && canvas.closest('.card');
    if (!card) return;
    var note = card.querySelector('.pink-source-note');
    if (note) {
      note.textContent = text;
    } else {
      note = document.createElement('p');
      note.className = 'pink-source-note text-muted mt-2 mb-0';
      note.style.cssText = 'font-size:0.72rem; text-align:center;';
      note.textContent = text;
      card.appendChild(note);
    }
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
      var canvas = el(s.id);
      var data = commodities[s.label];
      if (!canvas || !data || !data.values) return; // not available — keep CSV chart

      // Destroy the CSV-based chart for this canvas (if any) and redraw official data
      var chart = Chart.getChart(canvas);
      if (chart) chart.destroy();

      var values = years.map(function (y) {
        return data.values[y] != null ? data.values[y] : null;
      });

      renderCard({ id: s.id, canvas: canvas, label: s.label, color: s.color }, years, values, data.unit);
      markSourceNote(s.id, 'Source: World Bank Pink Sheet (official)');
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
