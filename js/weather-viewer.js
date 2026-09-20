/* ============================================================
   weather-viewer.js — Weather page for the SAWEM dashboard.

   Three panels:
     1. 15-day forecasts  — Open-Meteo API (free, no key):
            temperature, precipitation, wind, humidity,
            pressure & UV. Pick ANY number of cities — each
            selected city is fetched and its series overlaid
            on the same six charts.
     2. SA model maps     — Windy embed (GFS / ECMWF / ICON):
            model × level × field chips rebuild the iframe,
            mirroring the Tropical Tidbits SAFR viewers.
     3. Tropical Tidbits  — the original SAFR viewers open in a
            new tab (TT sends X-Frame-Options: SAMEORIGIN, so
            it cannot be iframed).

   Units: 'sawemUnits' in localStorage ('c' | 'f') — shared with
   the map's Weather Model layer.
   ============================================================ */

(function () {
  'use strict';

  var OPEN_METEO = 'https://api.open-meteo.com/v1/forecast';
  var UNIT_KEY = 'sawemUnits';

  /* ============================================================
     UNITS (°C / °F) — shared with the map's Weather Model layer.
     ============================================================ */

  function getUnits() {
    try {
      return localStorage.getItem(UNIT_KEY) || 'c';
    } catch (e) { return 'c'; }
  }

  function setUnits(u) {
    try { localStorage.setItem(UNIT_KEY, u); } catch (e) { /* ignore */ }
  }

  function unitsF() {
    return getUnits() === 'f';
  }

  function toTemp(c) {
    return unitsF() ? c * 9 / 5 + 32 : c;
  }

  function tempLabel() {
    return unitsF() ? '\u00B0F' : '\u00B0C';
  }

  function syncUnitsToggle() {
    var toggle = document.getElementById('wxUnitsToggle');
    if (!toggle) return;
    var u = getUnits();
    toggle.querySelectorAll('.wx-units-opt').forEach(function (opt) {
      opt.classList.toggle('active', opt.getAttribute('data-unit') === u);
    });
  }

  function wireUnitsToggle() {
    var toggle = document.getElementById('wxUnitsToggle');
    if (!toggle) return;
    toggle.querySelectorAll('.wx-units-opt').forEach(function (opt) {
      opt.addEventListener('click', function () {
        var u = opt.getAttribute('data-unit');
        if (getUnits() === u) return;
        setUnits(u);
        syncUnitsToggle();
        applyUnitsToPage();
      });
    });
  }

  /* Re-render everything on the page that depends on units. */
  function applyUnitsToPage() {
    // 1. Fresh forecast re-render (charts rebuild with converted values)
    loadForecasts();

    // 2. Chart header unit text
    var unitLabel = document.getElementById('tempUnitLabel');
    if (unitLabel) {
      unitLabel.textContent = (unitsF() ? '\u00B0F' : '\u00B0C') + ' — daily max / min';
    }

    // 3. Windy map: use imperial / metric temperature display
    rebuildWindy();

    // 4. Notify the map-side weather layer if it exists on this page
    if (typeof WEATHER_MODEL_LAYER !== 'undefined') {
      WEATHER_MODEL_LAYER.setUnits();
    }
  }

  /* ============================================================
     GRID / DATA CONFIG
     ============================================================ */

  var cities = [
    { name: 'Johannesburg',   lat: -26.2041, lon: 28.0473 },
    { name: 'Cape Town',      lat: -33.9249, lon: 18.4241 },
    { name: 'Durban',         lat: -29.8587, lon: 31.0218 },
    { name: 'Pretoria',       lat: -25.7479, lon: 28.2293 },
    { name: 'Gqeberha',       lat: -33.9608, lon: 25.6022 },
    { name: 'Bloemfontein',   lat: -29.0852, lon: 26.1596 },
    { name: 'Polokwane',      lat: -23.8962, lon: 29.4486 },
    { name: 'East London',    lat: -33.0153, lon: 27.9116 },
    { name: 'Kimberley',      lat: -28.7319, lon: 24.7624 },
    { name: 'Mbombela',       lat: -25.4659, lon: 30.9853 }
  ];

  /* One colour per city, in selection order, for the overlaid series. */
  var CITY_COLORS = [
    '#FF3B3B', '#1565C0', '#A6FF00', '#FF8C00', '#FF3CAC',
    '#00DFE6', '#D941FF', '#0066FF', '#FFE600', '#00CC66'
  ];

  var models = [
    { key: 'gfs',         label: 'GFS' },
    { key: 'ecmwf',       label: 'ECMWF' },
    { key: 'iconGlobal',  label: 'ICON-Global' },
    { key: 'iconEu',      label: 'ICON-EU' }
  ];

  var levels = [
    { key: 'surface', label: 'Surface' },
    { key: '850h',    label: '850 hPa' },
    { key: '700h',    label: '700 hPa' },
    { key: '500h',    label: '500 hPa' },
    { key: '300h',    label: '300 hPa' },
    { key: '200h',    label: '200 hPa' }
  ];

  var fields = [
    { key: 'wind',     label: '💨 Wind' },
    { key: 'pressure', label: '🧭 MSLP Pressure' },
    { key: 'temp',     label: '🌡 Temperature' },
    { key: 'rain',     label: '🌧 Precipitation' },
    { key: 'clouds',   label: '☁️ Clouds' },
    { key: 'waves',    label: '🌊 Waves' }
  ];

  var tropicalTidbitsLinks = [
    {
      title: '🧭 MSLP + Precip + Frozen',
      desc: 'GFS · SAFR · mslp_pcpn_frzn — exactly the viewer you linked',
      url: 'https://www.tropicaltidbits.com/analysis/models/?model=gfs&region=safr&pkg=mslp_pcpn_frzn&runtime=2026081012&fh=6'
    },
    {
      title: '🌀 850 Vorticity + 200 Wind',
      desc: 'GFS · SAFR · vort850_uv200 — exactly the viewer you linked',
      url: 'https://www.tropicaltidbits.com/analysis/models/?model=gfs&region=safr&pkg=vort850_uv200&runtime=2026081012&fh=6'
    },
    {
      title: '🗺 All TT Model Regions',
      desc: 'Tropical Tidbits — every model & region',
      url: 'https://www.tropicaltidbits.com/analysis/models/'
    }
  ];

  var state = {
    model: models[0],
    level: levels[0],
    field: fields[0]
  };

  /* Multi-select city list — every selected city is plotted. */
  var selectedCities = [cities[0]];

  var chars = {};
  var statusTimer = null;

  /* ============================================================
     STATUS STRIP
     ============================================================ */

  function setStatus(text, cls) {
    var el = document.getElementById('wxStatus');
    if (!el) return;
    el.textContent = text;
    el.className = 'wx-status ' + (cls || '');
  }

  function flashStatus(text, cls, ms) {
    setStatus(text, cls || 'ok');
    if (statusTimer) clearTimeout(statusTimer);
    statusTimer = setTimeout(function () {
      setStatus('● live — ' + selectedCities.map(function (c) { return c.name; }).join(', ') + ' · 15-day forecast', 'ok');
    }, ms || 2400);
  }

  /* ============================================================
     CHIP BARS
     ============================================================ */

  /* Generic chip bar builder.
     - label: item.label || item.name
     - isActive(item) decides the active class (re-evaluated live)
     - multi: chips toggle independently (cities); otherwise they
       are radio-style (models / levels / fields). */
  function buildChips(containerId, items, isActive, onClick, multi) {
    var bar = document.getElementById(containerId);
    if (!bar) return;
    bar.innerHTML = '';

    function refresh() {
      Array.prototype.forEach.call(bar.children, function (c) {
        var item = c.__wxItem;
        c.classList.toggle('active', !!isActive(item));
      });
    }

    items.forEach(function (item) {
      var chip = document.createElement('button');
      chip.type = 'button';
      chip.className = 'wx-chip';
      chip.textContent = item.label || item.name;
      chip.__wxItem = item;
      chip.addEventListener('click', function () {
        var wasActive = !!isActive(item);
        if (multi) {
          // Toggle in / out of the selection set.
          onClick(item, wasActive);
        } else {
          onClick(item);
        }
        refresh();
      });
      bar.appendChild(chip);
    });

    refresh();
  }

  function initChips() {
    // Cities: multi-select.
    buildChips('wxCities', cities, function (city) {
      return selectedCities.indexOf(city) !== -1;
    }, function (city, wasActive) {
      if (wasActive) {
        // Keep at least one city selected.
        if (selectedCities.length === 1) return;
        selectedCities = selectedCities.filter(function (c) { return c !== city; });
      } else {
        selectedCities.push(city);
      }
      loadForecasts();
      flashStatus('Forecast: ' + selectedCities.map(function (c) { return c.name; }).join(', '), 'loading');
    }, true);

    buildChips('wxModels', models, function (item) {
      return item.key === state.model.key;
    }, function (model) {
      state.model = model;
      rebuildWindy();
    });

    buildChips('wxLevels', levels, function (item) {
      return item.key === state.level.key;
    }, function (level) {
      state.level = level;
      rebuildWindy();
    });

    buildChips('wxFields', fields, function (item) {
      return item.key === state.field.key;
    }, function (field) {
      state.field = field;
      rebuildWindy();
    });
  }

  /* ============================================================
     15-DAY FORECAST CHARTS (Open-Meteo, multi-city)
     ============================================================ */

  function forecastURL(city) {
    var params = [
      'latitude=' + city.lat,
      'longitude=' + city.lon,
      'timezone=auto',
      'forecast_days=15',
      'current=temperature_2m,relative_humidity_2m,weather_code,wind_speed_10m,precipitation',
      'daily=temperature_2m_max,temperature_2m_min,precipitation_sum,windspeed_10m_max,windgusts_10m_max,uv_index_max',
      'hourly=relative_humidity_2m,surface_pressure'
    ];
    return OPEN_METEO + '?' + params.join('&');
  }

  /* Aggregate an hourly Open-Meteo array into per-day means
     aligned with the daily time array. */
  function dailyMeans(hourlyTime, values, dailyTime) {
    var sums = {};
    var counts = {};

    hourlyTime.forEach(function (iso, i) {
      var day = iso.slice(0, 10);
      var v = values[i];
      if (v === null || v === undefined) return;
      sums[day] = (sums[day] || 0) + v;
      counts[day] = (counts[day] || 0) + 1;
    });

    return dailyTime.map(function (iso) {
      var day = iso.slice(0, 10);
      return counts[day] ? Math.round((sums[day] / counts[day]) * 10) / 10 : null;
    });
  }

  function readableDates(dailyTime) {
    return dailyTime.map(function (iso) {
      var d = new Date(iso + 'T12:00:00');
      if (isNaN(d.getTime())) return iso;
      return d.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' });
    });
  }

  function chartFont() {
    return "'Space Mono', 'Courier New', monospace";
  }

  function baseOptions() {
    return {
      responsive: true,
      maintainAspectRatio: false,
      animation: { duration: 400 },
      plugins: {
        legend: {
          labels: {
            font: { family: chartFont(), size: 9, weight: '700' },
            color: '#1a1a1a',
            boxWidth: 12,
            boxHeight: 6,
            padding: 8
          }
        },
        tooltip: {
          backgroundColor: '#1a1a1a',
          borderColor: '#1a1a1a',
          borderWidth: 2,
          titleFont: { family: chartFont(), size: 11, weight: '700' },
          bodyFont: { family: chartFont(), size: 11 },
          cornerRadius: 0
        }
      },
      scales: {
        x: {
          ticks: {
            font: { family: chartFont(), size: 9 },
            color: '#555',
            maxRotation: 60,
            autoSkip: true,
            maxTicksLimit: 10
          },
          grid: { color: 'rgba(0,0,0,0.08)' }
        },
        y: {
          ticks: { font: { family: chartFont(), size: 9 }, color: '#555' },
          grid: { color: 'rgba(0,0,0,0.08)' }
        }
      }
    };
  }

  function mkChart(id, config) {
    var canvas = document.getElementById(id);
    if (!canvas) return null;
    if (chars[id]) chars[id].destroy();
    var ctx = canvas.getContext('2d');
    chars[id] = new Chart(ctx, config);
    return chars[id];
  }

  function hexToRgba(hex, alpha) {
    var n = parseInt(hex.slice(1), 16);
    return 'rgba(' + ((n >> 16) & 255) + ',' + ((n >> 8) & 255) + ',' + (n & 255) + ',' + alpha + ')';
  }

  function renderCharts(datas) {
    var labels = readableDates(datas[0].daily.time);
    var tempDatasets = [];
    var precipDatasets = [];
    var gustDatasets = [];
    var windDatasets = [];
    var humidityDatasets = [];
    var pressureDatasets = [];
    var uvDatasets = [];

    datas.forEach(function (d, i) {
      var color = CITY_COLORS[i % CITY_COLORS.length];
      var cityName = d.city.name;

      // Temperature — solid line for max, dashed line for min (same hue).
      tempDatasets.push({
        label: cityName + ' max ' + tempLabel(),
        data: d.daily.temperature_2m_max.map(toTemp),
        borderColor: color,
        backgroundColor: hexToRgba(color, 0.12),
        borderWidth: 2.5,
        pointBackgroundColor: color,
        pointRadius: 2,
        tension: 0.3,
        fill: false
      });
      tempDatasets.push({
        label: cityName + ' min ' + tempLabel(),
        data: d.daily.temperature_2m_min.map(toTemp),
        borderColor: color,
        borderWidth: 1.5,
        borderDash: [5, 4],
        pointRadius: 1.5,
        tension: 0.3,
        fill: false
      });

      precipDatasets.push({
        label: cityName + ' mm',
        data: d.daily.precipitation_sum,
        backgroundColor: hexToRgba(color, 0.6),
        borderColor: color,
        borderWidth: 1.5,
        borderRadius: 0
      });

      gustDatasets.push({
        label: cityName + ' gust km/h',
        data: d.daily.windgusts_10m_max,
        borderColor: color,
        backgroundColor: hexToRgba(color, 0.12),
        borderWidth: 2.5,
        pointBackgroundColor: color,
        pointRadius: 2,
        tension: 0.3,
        fill: false
      });
      windDatasets.push({
        label: cityName + ' wind km/h',
        data: d.daily.windspeed_10m_max,
        borderColor: color,
        borderWidth: 1.5,
        borderDash: [5, 4],
        pointRadius: 1.5,
        tension: 0.3,
        fill: false
      });

      humidityDatasets.push({
        label: cityName + ' RH %',
        data: dailyMeans(d.hourly.time, d.hourly.relative_humidity_2m, d.daily.time),
        borderColor: color,
        backgroundColor: hexToRgba(color, 0.12),
        borderWidth: 2.5,
        pointBackgroundColor: color,
        pointRadius: 2,
        tension: 0.3,
        fill: false
      });

      pressureDatasets.push({
        label: cityName + ' hPa',
        data: dailyMeans(d.hourly.time, d.hourly.surface_pressure, d.daily.time),
        borderColor: color,
        backgroundColor: hexToRgba(color, 0.12),
        borderWidth: 2.5,
        pointBackgroundColor: color,
        pointRadius: 2,
        tension: 0.3,
        fill: false
      });

      uvDatasets.push({
        label: cityName + ' UV',
        data: d.daily.uv_index_max,
        backgroundColor: hexToRgba(color, 0.6),
        borderColor: color,
        borderWidth: 1.5,
        borderRadius: 0
      });
    });

    mkChart('chart-temp', { type: 'line', data: { labels: labels, datasets: tempDatasets }, options: baseOptions() });
    mkChart('chart-precip', { type: 'bar', data: { labels: labels, datasets: precipDatasets }, options: baseOptions() });
    mkChart('chart-wind', { type: 'line', data: { labels: labels, datasets: gustDatasets.concat(windDatasets) }, options: baseOptions() });
    mkChart('chart-humidity', { type: 'line', data: { labels: labels, datasets: humidityDatasets }, options: baseOptions() });
    mkChart('chart-pressure', { type: 'line', data: { labels: labels, datasets: pressureDatasets }, options: baseOptions() });
    mkChart('chart-uv', { type: 'bar', data: { labels: labels, datasets: uvDatasets }, options: baseOptions() });
  }

  function wxCodeLabel(code) {
    var n = Number(code);
    if (!isFinite(n)) return '—';
    if (n === 0) return 'Clear';
    if (n <= 3) return 'Partly cloudy';
    if (n <= 48) return 'Fog';
    if (n <= 57) return 'Drizzle';
    if (n <= 67) return 'Rain';
    if (n <= 77) return 'Snow';
    if (n <= 82) return 'Showers';
    if (n <= 86) return 'Snow showers';
    if (n <= 99) return 'Thunderstorm';
    return 'Code ' + n;
  }

  function renderNow(datas) {
    var wrap = document.getElementById('wxNow');
    if (!wrap) return;
    wrap.innerHTML = '';
    datas.forEach(function (d) {
      var cur = d.current || {};
      var card = document.createElement('div');
      card.className = 'wx-now-card';
      var t = cur.temperature_2m;
      card.innerHTML =
        '<div class="wx-now-city">' + d.city.name + '</div>' +
        '<div class="wx-now-temp">' + (t == null ? '—' : Math.round(toTemp(t)) + ' ' + tempLabel()) + '</div>' +
        '<div class="wx-now-meta">' + wxCodeLabel(cur.weather_code) + '</div>' +
        '<div class="wx-now-row">' +
          '<span>' + (cur.relative_humidity_2m == null ? '—' : Math.round(cur.relative_humidity_2m) + '% RH') + '</span>' +
          '<span>' + (cur.wind_speed_10m == null ? '—' : Math.round(cur.wind_speed_10m) + ' km/h') + '</span>' +
          '<span>' + (cur.precipitation == null ? '—' : cur.precipitation + ' mm') + '</span>' +
        '</div>';
      wrap.appendChild(card);
    });
  }

  function loadForecasts() {
    var list = selectedCities.slice();
    setStatus('Loading forecasts…', 'loading');

    var jobs = list.map(function (city) {
      return fetch(forecastURL(city), { cache: 'no-store' }).then(function (res) {
        if (!res.ok) throw new Error('API HTTP ' + res.status);
        return res.json();
      }).then(function (data) {
        if (!data.daily || !data.hourly) throw new Error('Malformed API response');
        data.city = city;
        return data;
      });
    });

    Promise.all(jobs)
      .then(function (datas) {
        renderNow(datas);
        renderCharts(datas);
        setStatus('● live — ' + datas.map(function (d) { return d.city.name; }).join(', ') + ' · present + 15-day forecast', 'ok');
      })
      .catch(function (err) {
        console.error('⚠ Weather forecast failed:', err);
        setStatus('⚠ Forecast failed — check network / retry', 'error');
      });
  }

  /* ============================================================
     WINDY MODEL MAP (weather page)
     ============================================================ */

  function windyURL() {
    // Shared builder (js/windy.js) — identical to the map page's
    // Weather Model layer so both views always match.
    return WINDY.buildUrl(state);
  }

  function rebuildWindy() {
    var frame = document.getElementById('windy-embed');
    var caption = document.getElementById('wxWindyCaption');
    if (!frame) return;

    frame.src = windyURL();
    if (caption) {
      caption.textContent =
        state.model.label + ' · ' + state.level.label +
        ' · ' + state.field.label + ' — Southern Africa';
    }
  }

  /* ============================================================
     TROPICAL TIDBITS CARDS
     ============================================================ */

  function buildTtLinks() {
    var grid = document.getElementById('wxTtLinks');
    if (!grid) return;
    grid.innerHTML = '';

    tropicalTidbitsLinks.forEach(function (link) {
      var card = document.createElement('div');
      card.className = 'wx-tt-card';

      var title = document.createElement('div');
      title.className = 'wx-tt-title';
      title.textContent = link.title;

      var desc = document.createElement('div');
      desc.className = 'wx-tt-desc';
      desc.textContent = link.desc;

      var btn = document.createElement('a');
      btn.className = 'wx-tt-btn';
      btn.href = link.url;
      btn.target = '_blank';
      btn.rel = 'noreferrer';
      btn.innerHTML = '<i class="fas fa-external-link-alt"></i> Open viewer';

      card.appendChild(title);
      card.appendChild(desc);
      card.appendChild(btn);
      grid.appendChild(card);
    });
  }

  /* ============================================================
     BOOT
     ============================================================ */

  function boot() {
    syncUnitsToggle();
    wireUnitsToggle();
    buildTtLinks();
    initChips();
    rebuildWindy();
    loadForecasts();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }

})();
