/* ============================================================
   population-density.js — Population-density overlay for map.html
   ------------------------------------------------------------
   Adds a toggleable "Population density" layer to the Leaflet
   map, styled after the classic Stats SA census density map:

     • a yellow -> red density raster clipped to South Africa
       (rendered off-line from OpenStreetMap settlement data)
     • grey context for the surrounding land / ocean
     • the nine provincial boundaries (dissolved from districts)
     • province, neighbour-country and ocean labels
     • a legend matching the "people per square kilometre" bands
     • an opacity slider

   The raster is pre-projected to Web Mercator, so a plain
   L.imageOverlay across CONFIG.bounds lines up exactly.

   Exposes window.POP_DENSITY.
   ============================================================ */
var POP_DENSITY = (function () {
  'use strict';

  var CONFIG = {
    /* Raster + vector assets (paths relative to pages/). */
    densityImg: '../images/population-density/population-density.png',
    bordersImg: '../images/population-density/population-density-borders.png',
    districtsGeo: '../data/geo/south-africa-districts.geojson',

    /* Geographic extent of both rasters (Web Mercator rows). */
    bounds: [[-34.86417, 16.42194], [-22.09503, 32.921697]],

    /* Comfortable framing when the layer is switched on. */
    fit: [[-35.15, 15.70], [-21.60, 33.55]],

    pane: 'popDensity',
    paneZ: 450,
    contextFill: '#c9c9c9',
    borderStroke: 'rgba(60,60,60,0.85)',
    defaultOpacity: 1
  };

  /* Density bands, low -> high (ColorBrewer YlOrRd, 9 classes). */
  var BANDS = [
    { label: 'Less than 1', color: '#FFFFCC' },
    { label: '1 to 3', color: '#FFEDA0' },
    { label: '3 to 10', color: '#FED976' },
    { label: '10 to 30', color: '#FEB24C' },
    { label: '30 to 100', color: '#FD8D3C' },
    { label: '100 to 300', color: '#FC4E2A' },
    { label: '300 to 1,000', color: '#E31A1C' },
    { label: '1,000 to 3,000', color: '#BD0026' },
    { label: 'More than 3,000', color: '#800026' }
  ];

  /* Positions chosen so no two labels collide at the national view
     (the legend occupies the bottom-left of the map). */
  var PROVINCE_LABELS = [
    { text: 'LIMPOPO', lat: -23.30, lng: 29.15 },
    { text: 'GAUTENG', lat: -26.10, lng: 27.90 },
    { text: 'MPUMALANGA', lat: -25.60, lng: 30.45 },
    { text: 'NORTH WEST', lat: -25.80, lng: 24.70 },
    { text: 'FREE STATE', lat: -28.75, lng: 26.30 },
    { text: 'KWAZULU-NATAL', lat: -28.75, lng: 30.85 },
    { text: 'NORTHERN CAPE', lat: -29.55, lng: 21.05 },
    { text: 'EASTERN CAPE', lat: -32.05, lng: 26.15 },
    { text: 'WESTERN CAPE', lat: -33.15, lng: 21.60 }
  ];

  var NEIGHBOUR_LABELS = [
    { text: 'Namibia', lat: -22.40, lng: 17.10, cls: 'pd-neighbour' },
    { text: 'Botswana', lat: -22.30, lng: 24.10, cls: 'pd-neighbour' },
    { text: 'Zimbabwe', lat: -21.90, lng: 29.20, cls: 'pd-neighbour' },
    { text: 'Mozambique', lat: -24.30, lng: 32.85, cls: 'pd-neighbour' },
    { text: 'Lesotho', lat: -29.60, lng: 28.25, cls: 'pd-enclave' },
    { text: 'Eswatini', lat: -26.75, lng: 31.65, cls: 'pd-enclave' }
  ];

  var OCEAN_LABELS = [
    { text: 'Atlantic Ocean', lat: -31.20, lng: 16.05, cls: 'pd-ocean' },
    { text: 'Indian Ocean', lat: -34.05, lng: 31.35, cls: 'pd-ocean' }
  ];

  /* Leaflet state */
  var map = null;
  var baseLayer = null;
  var pane = null;
  var stage = null;            // L.layerGroup holding the whole overlay
  var opacity = CONFIG.defaultOpacity;
  var enabled = false;
  var ready = false;
  var legendControl = null;
  var opacityControl = null;
  var layersControl = null;

  /* ---------- small helpers ---------- */
  function labelIcon(text, cls) {
    return L.divIcon({
      className: 'pd-label-wrap',
      html: '<span class="pd-label ' + cls + '">' + text + '</span>',
      iconSize: [0, 0],
      iconAnchor: [0, 0]
    });
  }

  /* Build the world-minus-South-Africa grey context polygon.
     The first ring is a world rectangle; every district exterior
     becomes a hole (Leaflet fills polygons with even-odd rule). */
  function buildContextPolygon(geojson) {
    var world = [[-85, -180], [-85, 180], [85, 180], [85, -180]];
    var rings = [world];

    (geojson.features || []).forEach(function (feature) {
      var geom = feature.geometry || {};
      var polygons = geom.type === 'Polygon' ? [geom.coordinates]
        : geom.type === 'MultiPolygon' ? geom.coordinates : [];
      polygons.forEach(function (polygon) {
        if (!polygon || !polygon.length) return;
        var exterior = polygon[0].map(function (c) { return [c[1], c[0]]; });
        if (exterior.length >= 3) rings.push(exterior);
      });
    });

    return L.polygon(rings, {
      pane: CONFIG.pane,
      stroke: false,
      fill: true,
      fillColor: CONFIG.contextFill,
      fillOpacity: 1,
      interactive: false
    });
  }

  /* ---------- legend ---------- */
  function legendHTML() {
    var rows = BANDS.map(function (band) {
      return '<span class="pd-band">' +
        '<span class="pd-swatch" style="background:' + band.color + '"></span>' +
        '<span class="pd-band-label">' + band.label + '</span>' +
        '</span>';
    }).join('');
    return '' +
      '<div class="pd-legend-title">Population density in South Africa</div>' +
      '<div class="pd-legend-sub">Number of people per square kilometre</div>' +
      '<div class="pd-legend-grid">' + rows + '</div>' +
      '<div class="pd-legend-note">Modelled from settlement distribution · ' +
      'OpenStreetMap contributors</div>';
  }

  /* Top-left keeps the legend over empty grey ocean/neighbour land and
     clear of every province label (the bottom-left clips Western Cape). */
  function makeLegendControl() {
    var control = L.control({ position: 'topleft' });
    control.onAdd = function () {
      var div = L.DomUtil.create('div', 'pd-legend');
      div.innerHTML = legendHTML();
      L.DomEvent.disableClickPropagation(div);
      L.DomEvent.disableScrollPropagation(div);
      return div;
    };
    return control;
  }

  /* ---------- opacity slider ---------- */
  function makeOpacityControl() {
    var control = L.control({ position: 'bottomright' });
    control.onAdd = function () {
      var div = L.DomUtil.create('div', 'pd-opacity');
      div.innerHTML =
        '<label class="pd-opacity-label" for="pdOpacityRange">Opacity</label>' +
        '<input id="pdOpacityRange" class="pd-opacity-range" type="range" ' +
        'min="20" max="100" step="5" value="' + Math.round(opacity * 100) + '">';
      L.DomEvent.disableClickPropagation(div);
      L.DomEvent.disableScrollPropagation(div);

      var range = div.querySelector('#pdOpacityRange');
      range.addEventListener('input', function () {
        setOpacity(parseInt(range.value, 10) / 100);
      });
      return div;
    };
    return control;
  }

  /* ---------- public behaviour ---------- */
  function setOpacity(value) {
    opacity = Math.max(0.2, Math.min(1, value));
    if (pane) pane.style.opacity = String(opacity);
  }

  function setEnabled(on) {
    if (!stage) return;
    enabled = !!on;
    if (enabled) {
      if (!map.hasLayer(stage)) map.addLayer(stage);
      if (legendControl) legendControl.addTo(map);
      if (opacityControl) opacityControl.addTo(map);
    } else {
      if (map.hasLayer(stage)) map.removeLayer(stage);
      if (legendControl && legendControl._map) map.removeControl(legendControl);
      if (opacityControl && opacityControl._map) map.removeControl(opacityControl);
    }
    syncLayersCheckbox();
  }

  /* Keep the Leaflet layers control checkbox in step when the
     layer is toggled from the sidebar button. */
  function syncLayersCheckbox() {
    if (!layersControl) return;
    var container = layersControl.getContainer();
    if (!container) return;
    var boxes = container.querySelectorAll('input[type=checkbox]');
    Array.prototype.forEach.call(boxes, function (box) {
      box.checked = enabled;
    });
  }

  function fitSouthAfrica() {
    if (!map) return;
    /* The map sits under a Bootstrap navbar, so make sure Leaflet has
       the current container size before computing the framing. */
    map.invalidateSize();
    map.fitBounds(CONFIG.fit, { padding: [10, 10] });
  }

  function show() {           /* enable + frame */
    setEnabled(true);
    fitSouthAfrica();
  }

  /* ---------- build ---------- */
  function build() {
    if (ready) return;
    ready = true;

    pane = map.createPane(CONFIG.pane);
    pane.style.zIndex = String(CONFIG.paneZ);
    pane.style.opacity = String(opacity);

    stage = L.layerGroup();

    var overlays = {};
    overlays['Population density'] = stage;

    /* density raster (added once the image is available) */
    var densityLayer = L.imageOverlay(CONFIG.densityImg, CONFIG.bounds, {
      pane: CONFIG.pane, opacity: 1, interactive: false, alt: 'Population density'
    });
    densityLayer.addTo(stage);

    var bordersLayer = L.imageOverlay(CONFIG.bordersImg, CONFIG.bounds, {
      pane: CONFIG.pane, opacity: 1, interactive: false
    });
    bordersLayer.addTo(stage);

    /* labels */
    PROVINCE_LABELS.forEach(function (item) {
      L.marker([item.lat, item.lng], {
        icon: labelIcon(item.text, 'pd-province'),
        pane: CONFIG.pane, interactive: false, keyboard: false
      }).addTo(stage);
    });
    NEIGHBOUR_LABELS.concat(OCEAN_LABELS).forEach(function (item) {
      L.marker([item.lat, item.lng], {
        icon: labelIcon(item.text, item.cls),
        pane: CONFIG.pane, interactive: false, keyboard: false
      }).addTo(stage);
    });

    /* grey context + provincial boundaries from the district polygons */
    fetch(CONFIG.districtsGeo, { cache: 'no-store' })
      .then(function (res) {
        if (!res.ok) throw new Error('HTTP ' + res.status);
        return res.json();
      })
      .then(function (geojson) {
        buildContextPolygon(geojson).addTo(stage);
        /* context is added after the rasters, so push it behind them */
        stage.eachLayer(function (layer) {
          if (layer instanceof L.Polygon && layer.bringToBack) {
            layer.bringToBack();
          }
        });
      })
      .catch(function (err) {
        console.warn('Population density: could not load boundaries —', err);
      });

    /* controls */
    legendControl = makeLegendControl();
    opacityControl = makeOpacityControl();

    layersControl = L.control.layers(
      baseLayer ? { 'OpenStreetMap': baseLayer } : {},
      overlays,
      { position: 'topright', collapsed: true }
    );
    layersControl.addTo(map);

    map.on('overlayadd', function (e) {
      if (e.name === 'Population density') setEnabled(true);
    });
    map.on('overlayremove', function (e) {
      if (e.name === 'Population density') setEnabled(false);
    });

    setOpacity(opacity);
    setEnabled(false);
  }

  function init(leafletMap, osmBaseLayer) {
    map = leafletMap;
    baseLayer = osmBaseLayer || null;
    build();
    map.attributionControl.addAttribution(
      'Population density: modelled from settlement data'
    );
  }

  return {
    init: init,
    show: show,
    enable: function () { setEnabled(true); },
    disable: function () { setEnabled(false); },
    toggle: function () { setEnabled(!enabled); },
    isEnabled: function () { return enabled; },
    setOpacity: setOpacity,
    fitSouthAfrica: fitSouthAfrica
  };
})();
