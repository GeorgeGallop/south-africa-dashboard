/* ============================================================
   windy.js — Shared Windy embed builder for the SAWEM dashboard.

   Single source of truth for the Windy model-map URLs used by:
     • weather.html   → js/weather-viewer.js  (SA Model Maps)
     • map.html       → js/weather-map.js     (Weather Model overlay)

   Both views share the same model / level / field vocabulary and
   the same localStorage unit preference ('sawemUnits'),
   so the Weather page and the map layer always match exactly.
   ============================================================ */

const WINDY = (function () {
  'use strict';

  var UNIT_KEY = 'sawemUnits';

  /* Windy embed2 product codes — kept in the same keys as the
     model chips used on both pages (gfs / ecmwf / iconGlobal /
     iconEu). */
  var MODEL_PRODUCT = {
    gfs:        'gfs',
    ecmwf:      'ecmwf',
    iconGlobal: 'iconGlobal',
    iconEu:     'iconEu'
  };

  var MODEL_LABEL = {
    gfs:        'GFS',
    ecmwf:      'ECMWF',
    iconGlobal: 'ICON-Global',
    iconEu:     'ICON-EU'
  };

  var FIELD_OVERLAY = {
    wind:     'wind',
    pressure: 'pressure',
    temp:     'temp',
    rain:     'rain',
    clouds:   'clouds',
    waves:    'waves'
  };

  var FIELD_LABEL = {
    wind:     'Wind',
    pressure: 'MSLP Pressure',
    temp:     'Temperature',
    rain:     'Precipitation',
    clouds:   'Clouds',
    waves:    'Waves'
  };

  var LEVEL_LABEL = {
    surface: 'Surface',
    '850h':  '850 hPa',
    '700h':  '700 hPa',
    '500h':  '500 hPa',
    '300h':  '300 hPa',
    '200h':  '200 hPa'
  };

  var SA_CENTER_LAT = '-28.5';
  var SA_CENTER_LON = '24.5';
  var SA_ZOOM = '5';

  function unitsF() {
    try {
      return localStorage.getItem(UNIT_KEY) === 'f';
    } catch (e) {
      return false;
    }
  }

  /* Build the Windy embed URL for a { model, level, field } state.
     state.model / state.level / state.field are the chip objects from
     weather-viewer.js / weather-map.js ({ key, label }).
     Optional view = { lat, lon, zoom } overrides the SA default so
     the map-page overlay can open on the current Leaflet view. */
  function buildUrl(state, view) {
    var modelKey = state && state.model ? state.model.key : 'gfs';
    var levelKey = state && state.level ? state.level.key : 'surface';
    var fieldKey = state && state.field ? state.field.key : 'wind';

    var lat = (view && isFinite(view.lat)) ? String(view.lat) : SA_CENTER_LAT;
    var lon = (view && isFinite(view.lon)) ? String(view.lon) : SA_CENTER_LON;
    var zoom = (view && isFinite(view.zoom)) ? String(Math.round(view.zoom)) : SA_ZOOM;

    var params = [
      'lat=' + lat,
      'lon=' + lon,
      'zoom=' + zoom,
      'overlay=' + (FIELD_OVERLAY[fieldKey] || 'wind'),
      'product=' + (MODEL_PRODUCT[modelKey] || 'gfs'),
      'level=' + levelKey,
      'menu=',
      'message=',
      'marker=',
      'calendar=now',
      'pressure=',
      'type=map',
      'location=coordinates',
      'detail=',
      'metricWind=default',
      'metricTemp=' + (unitsF() ? 'imperial' : 'metric'),
      'radarRange=-1'
    ];

    return 'https://embed.windy.com/embed2.html?' + params.join('&');
  }

  /* Human caption for the status / caption bars, e.g.
     "GFS · Surface · Wind". Accepts the raw chip keys. */
  function label(modelKey, levelKey, fieldKey) {
    return (MODEL_LABEL[modelKey] || modelKey) +
      ' \u00B7 ' +
      (LEVEL_LABEL[levelKey] || levelKey) +
      ' \u00B7 ' +
      (FIELD_LABEL[fieldKey] || fieldKey);
  }

  return {
    buildUrl: buildUrl,
    label: label
  };

})();
