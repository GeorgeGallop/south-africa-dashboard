/*
 * LCOE cost-composition bars — what the latest-year midpoint is made of.
 * Each row splits the modelled midpoint into capital, fuel, O&M and other.
 */
(function () {
  'use strict';

  var ORDER = ['capital', 'fuel', 'om', 'other'];
  var COLORS = {
    capital: '#007A4D',
    fuel: '#C62828',
    om: '#E3A008',
    other: '#6c757d'
  };

  function latestRow(series, techId) {
    var rows = (series[techId] || []).slice().sort(function (a, b) {
      return b[0] - a[0];
    });
    return rows[0] || null;
  }

  function render(container, options) {
    while (container.firstChild) container.removeChild(container.firstChild);

    options.technologies.forEach(function (tech) {
      var row = latestRow(options.series, tech.id);
      if (!row) return;
      var mid = Math.round((row[1] + row[2]) / 2);

      var wrapper = document.createElement('div');
      wrapper.className = 'lcoe-breakdown-row';

      var head = document.createElement('div');
      head.className = 'd-flex justify-content-between align-items-baseline gap-2';

      var label = document.createElement('span');
      label.className = 'small fw-semibold';
      var dot = document.createElement('span');
      dot.className = 'lcoe-swatch';
      dot.style.background = tech.color;
      label.appendChild(dot);
      label.appendChild(document.createTextNode(tech.short));
      head.appendChild(label);

      var value = document.createElement('span');
      value.className = 'small text-muted text-nowrap';
      value.textContent = 'R' + mid.toLocaleString('en-ZA') + '/MWh · ' + row[0];
      head.appendChild(value);

      wrapper.appendChild(head);

      var bar = document.createElement('div');
      bar.className = 'lcoe-stack';
      bar.setAttribute('role', 'img');
      bar.setAttribute('aria-label', tech.short + ' cost composition');

      ORDER.forEach(function (key) {
        var share = tech.components[key] || 0;
        if (!share) return;
        var segment = document.createElement('div');
        segment.className = 'lcoe-stack-segment';
        segment.style.width = share + '%';
        segment.style.background = COLORS[key];
        segment.title = tech.short + ' — ' + options.componentLabels[key] +
          ': ' + share + '% (about R' + Math.round(mid * share / 100).toLocaleString('en-ZA') + '/MWh)';
        if (share >= 10) segment.textContent = share + '%';
        bar.appendChild(segment);
      });

      wrapper.appendChild(bar);
      container.appendChild(wrapper);
    });
  }

  window.SALcoeBreakdown = {
    render: render,
    colors: COLORS,
    order: ORDER
  };
})();
