/*
 * LCOE page controller — state, legend chips, and the three renderers.
 */
(function () {
  'use strict';

  var data = window.SA_LCOE;
  if (!data) return;

  var byId = function (id) { return document.getElementById(id); };

  var els = {
    legend: byId('lcoeLegend'),
    chart: byId('lcoeChart'),
    tooltip: byId('lcoeTooltip'),
    tableBody: byId('lcoeTableBody'),
    breakdown: byId('lcoeBreakdown'),
    count: byId('lcoeCount'),
    csvBtn: byId('lcoeCsvBtn'),
    csvNote: byId('lcoeCsvNote'),
    scaleBtn: byId('lcoeScaleBtn'),
    allBtn: byId('lcoeAllBtn'),
    noneBtn: byId('lcoeNoneBtn')
  };

  var state = { visible: {}, scale: 'linear' };
  data.technologies.forEach(function (tech) { state.visible[tech.id] = true; });

  function visibleTechs() {
    return data.technologies.filter(function (tech) { return state.visible[tech.id]; });
  }

  function query(techs) {
    return {
      years: data.years,
      series: data.series,
      technologies: techs,
      componentLabels: data.componentLabels,
      currency: data.currency,
      unit: data.unit,
      priceBasis: data.priceBasis,
      source: data.source
    };
  }

  function renderLegend() {
    if (!els.legend) return;
    els.legend.textContent = '';

    data.technologies.forEach(function (tech) {
      var chip = document.createElement('button');
      chip.type = 'button';
      chip.className = 'lcoe-chip';
      chip.dataset.techId = tech.id;
      var on = !!state.visible[tech.id];
      chip.setAttribute('aria-pressed', on ? 'true' : 'false');
      if (!on) chip.classList.add('is-off');

      var dot = document.createElement('span');
      dot.className = 'lcoe-swatch';
      dot.style.background = tech.color;
      chip.appendChild(dot);
      chip.appendChild(document.createTextNode(tech.short));

      chip.addEventListener('click', function () {
        state.visible[tech.id] = !state.visible[tech.id];
        renderAll();
      });

      els.legend.appendChild(chip);
    });
  }

  function renderAll() {
    var techs = visibleTechs();
    var payload = query(techs);

    if (els.chart) window.SALcoeChart.render(els.chart, { years: data.years, series: data.series, technologies: techs, scale: state.scale });
    if (els.tableBody) window.SALcoeTable.render(els.tableBody, payload);
    if (els.breakdown) window.SALcoeBreakdown.render(els.breakdown, payload);

    renderLegend();

    if (els.count) {
      els.count.textContent = techs.length + ' of ' + data.technologies.length +
        ' technologies · ' + window.SALcoeCsv.rowCount(payload) + ' rows';
    }
    if (els.csvNote) {
      els.csvNote.textContent = 'Exports the ' + window.SALcoeCsv.rowCount(payload) +
        ' rows currently shown in the chart and table.';
    }
    if (els.csvBtn) {
      els.csvBtn.disabled = techs.length === 0;
    }
  }

  if (els.scaleBtn) {
    els.scaleBtn.addEventListener('click', function () {
      state.scale = state.scale === 'log' ? 'linear' : 'log';
      els.scaleBtn.setAttribute('aria-pressed', state.scale === 'log' ? 'true' : 'false');
      els.scaleBtn.textContent = state.scale === 'log' ? 'Log scale: on' : 'Log scale: off';
      renderAll();
    });
  }

  if (els.allBtn) {
    els.allBtn.addEventListener('click', function () {
      data.technologies.forEach(function (tech) { state.visible[tech.id] = true; });
      renderAll();
    });
  }

  if (els.noneBtn) {
    els.noneBtn.addEventListener('click', function () {
      data.technologies.forEach(function (tech) { state.visible[tech.id] = false; });
      renderAll();
    });
  }

  if (els.csvBtn) {
    els.csvBtn.addEventListener('click', function () {
      var payload = query(visibleTechs());
      var csv = window.SALcoeCsv.build(payload);
      window.SALcoeCsv.download(csv, data.csvFilename);
    });
  }

  if (els.chart && els.tooltip) {
    window.SALcoeChart.attachTooltip(els.chart, els.tooltip, function () {
      return {
        years: data.years,
        series: data.series,
        technologies: visibleTechs()
      };
    });
  }

  renderAll();
})();
