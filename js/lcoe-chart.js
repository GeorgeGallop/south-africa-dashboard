/*
 * Range-band LCOE chart — dependency-free SVG renderer.
 *
 * Each technology draws a shaded band between its low and high LCOE and a
 * solid line through the midpoint, so both the uncertainty and the trend are
 * visible at once. Linear or log vertical scale.
 */
(function () {
  'use strict';

  var NS = 'http://www.w3.org/2000/svg';
  var WIDTH = 940;
  var HEIGHT = 470;
  var MARGIN = { top: 20, right: 20, bottom: 50, left: 76 };
  var LINEAR_MAX = 7000;
  var LOG_MIN = 100;
  var LOG_MAX = 7000;
  var LINEAR_TICKS = [0, 1000, 2000, 3000, 4000, 5000, 6000, 7000];
  var LOG_TICKS = [100, 200, 300, 500, 700, 1000, 2000, 3000, 5000, 7000];

  function plotWidth() {
    return WIDTH - MARGIN.left - MARGIN.right;
  }

  function plotHeight() {
    return HEIGHT - MARGIN.top - MARGIN.bottom;
  }

  function make(name, attrs) {
    var node = document.createElementNS(NS, name);
    if (attrs) {
      Object.keys(attrs).forEach(function (key) {
        node.setAttribute(key, attrs[key]);
      });
    }
    return node;
  }

  function xForIndex(index, count) {
    if (count <= 1) return MARGIN.left;
    return MARGIN.left + (index * plotWidth()) / (count - 1);
  }

  function yFor(value, scale) {
    var ratio;
    if (scale === 'log') {
      var clamped = Math.max(LOG_MIN, Math.min(LOG_MAX, value));
      ratio = (Math.log10(clamped) - Math.log10(LOG_MIN)) /
        (Math.log10(LOG_MAX) - Math.log10(LOG_MIN));
    } else {
      ratio = Math.max(0, Math.min(1, value / LINEAR_MAX));
    }
    return MARGIN.top + (1 - ratio) * plotHeight();
  }

  function clear(svg) {
    while (svg.firstChild) svg.removeChild(svg.firstChild);
  }

  function drawGrid(svg, years, scale) {
    var layer = make('g', { class: 'lcoe-grid' });
    var ticks = scale === 'log' ? LOG_TICKS : LINEAR_TICKS;

    ticks.forEach(function (tick) {
      var y = yFor(tick, scale);
      layer.appendChild(make('line', {
        x1: MARGIN.left, y1: y, x2: WIDTH - MARGIN.right, y2: y,
        stroke: '#e6e9eb', 'stroke-width': 1
      }));
      var label = make('text', {
        x: MARGIN.left - 10, y: y + 4, 'text-anchor': 'end',
        'font-size': 11, fill: '#6c757d'
      });
      label.textContent = tick.toLocaleString('en-ZA');
      layer.appendChild(label);
    });

    years.forEach(function (year, index) {
      var x = xForIndex(index, years.length);
      var label = make('text', {
        x: x, y: HEIGHT - MARGIN.bottom + 22, 'text-anchor': 'middle',
        'font-size': 12, fill: '#495057', 'font-weight': 600
      });
      label.textContent = year;
      layer.appendChild(label);
    });

    var caption = make('text', {
      x: MARGIN.left, y: HEIGHT - 8, 'font-size': 11, fill: '#6c757d'
    });
    caption.textContent = 'ZAR/MWh, nominal. Band = low–high range, line = midpoint.';
    layer.appendChild(caption);

    svg.appendChild(layer);
  }

  function bandPath(points, years, scale) {
    if (!points.length) return '';
    var forward = points.map(function (point, position) {
      return (position === 0 ? 'M' : 'L') +
        xForIndex(point.index, years.length).toFixed(1) + ',' +
        yFor(point.high, scale).toFixed(1);
    });
    var backward = points.slice().reverse().map(function (point) {
      return 'L' + xForIndex(point.index, years.length).toFixed(1) + ',' +
        yFor(point.low, scale).toFixed(1);
    });
    return forward.join(' ') + ' ' + backward.join(' ') + ' Z';
  }

  function medianPath(points, years, scale) {
    if (!points.length) return '';
    return points.map(function (point, position) {
      return (position === 0 ? 'M' : 'L') +
        xForIndex(point.index, years.length).toFixed(1) + ',' +
        yFor((point.low + point.high) / 2, scale).toFixed(1);
    }).join(' ');
  }

  function toPoints(raw, years) {
    return raw.map(function (entry) {
      return { index: years.indexOf(entry[0]), low: entry[1], high: entry[2] };
    }).filter(function (point) {
      return point.index !== -1;
    }).sort(function (a, b) {
      return a.index - b.index;
    });
  }

  function render(svg, options) {
    var years = options.years;
    var scale = options.scale === 'log' ? 'log' : 'linear';
    clear(svg);
    svg.setAttribute('viewBox', '0 0 ' + WIDTH + ' ' + HEIGHT);
    drawGrid(svg, years, scale);

    var seriesLayer = make('g', { class: 'lcoe-series' });
    options.technologies.forEach(function (tech) {
      var points = toPoints(options.series[tech.id] || [], years);
      if (!points.length) return;

      seriesLayer.appendChild(make('path', {
        d: bandPath(points, years, scale),
        fill: tech.color,
        'fill-opacity': 0.16,
        stroke: 'none'
      }));
      seriesLayer.appendChild(make('path', {
        d: medianPath(points, years, scale),
        fill: 'none',
        stroke: tech.color,
        'stroke-width': 2.4,
        'stroke-linejoin': 'round',
        'stroke-linecap': 'round'
      }));
    });
    svg.appendChild(seriesLayer);

    svg.appendChild(make('line', {
      x1: MARGIN.left, y1: MARGIN.top, x2: MARGIN.left,
      y2: MARGIN.top + plotHeight(), stroke: '#adb5bd', 'stroke-width': 1
    }));

    svg.setAttribute('aria-label',
      'LCOE range for South African generation technologies, ' + years[0] +
      ' to ' + years[years.length - 1] + ', ' +
      options.technologies.length + ' technologies shown');
  }

  function fillTooltip(container, year, technologies, series) {
    var rows = [];
    technologies.forEach(function (tech) {
      var match = (series[tech.id] || []).filter(function (entry) {
        return entry[0] === year;
      })[0];
      if (match) {
        rows.push({ tech: tech, low: match[1], high: match[2] });
      }
    });
    rows.sort(function (a, b) {
      return (a.low + a.high) - (b.low + b.high);
    });

    var title = document.createElement('div');
    title.className = 'lcoe-tooltip-title';
    title.textContent = year + ' · ZAR/MWh';
    container.appendChild(title);

    if (!rows.length) {
      var empty = document.createElement('div');
      empty.className = 'lcoe-tooltip-row text-muted';
      empty.textContent = 'No series at this year.';
      container.appendChild(empty);
      return;
    }

    rows.forEach(function (row) {
      var line = document.createElement('div');
      line.className = 'lcoe-tooltip-row';

      var swatch = document.createElement('span');
      swatch.className = 'lcoe-swatch';
      swatch.style.background = row.tech.color;
      line.appendChild(swatch);

      var label = document.createElement('span');
      label.className = 'lcoe-tooltip-label';
      label.textContent = row.tech.short;
      line.appendChild(label);

      var value = document.createElement('span');
      value.className = 'lcoe-tooltip-value';
      value.textContent = row.low.toLocaleString('en-ZA') + '–' +
        row.high.toLocaleString('en-ZA');
      line.appendChild(value);

      container.appendChild(line);
    });
  }

  function attachTooltip(svg, tooltip, getState) {
    var guide = make('line', {
      y1: MARGIN.top, y2: MARGIN.top + plotHeight(),
      stroke: '#007A4D', 'stroke-width': 1, 'stroke-dasharray': '4 4',
      opacity: 0
    });
    svg.appendChild(guide);

    function svgX(event) {
      var rect = svg.getBoundingClientRect();
      var ratio = rect.width ? WIDTH / rect.width : 1;
      return (event.clientX - rect.left) * ratio;
    }

    svg.addEventListener('pointermove', function (event) {
      var state = getState();
      var years = state.years;
      var step = years.length > 1 ? plotWidth() / (years.length - 1) : plotWidth();
      var index = Math.round((svgX(event) - MARGIN.left) / step);
      index = Math.max(0, Math.min(years.length - 1, index));
      var snapped = xForIndex(index, years.length);

      guide.setAttribute('x1', snapped);
      guide.setAttribute('x2', snapped);
      guide.setAttribute('opacity', 1);

      tooltip.textContent = '';
      fillTooltip(tooltip, years[index], state.technologies, state.series);
      tooltip.hidden = false;

      var host = svg.parentElement.getBoundingClientRect();
      var left = event.clientX - host.left + 16;
      var top = event.clientY - host.top + 12;
      tooltip.style.left = Math.max(8, Math.min(left, host.width - tooltip.offsetWidth - 12)) + 'px';
      tooltip.style.top = Math.max(8, Math.min(top, host.height - tooltip.offsetHeight - 12)) + 'px';
    });

    svg.addEventListener('pointerleave', function () {
      guide.setAttribute('opacity', 0);
      tooltip.hidden = true;
    });
  }

  window.SALcoeChart = {
    render: render,
    attachTooltip: attachTooltip
  };
})();
