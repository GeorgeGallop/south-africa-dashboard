/*
 * Loading and saving the sidebar layout.
 *
 * Source of truth priority:
 *   1. js/sidebar-layout.js  (what index.html renders)
 *   2. the sidebar markup inside index.html (captured by parsing it)
 *
 * Save writes through PUT /api/sidebar-layout on the dashboard server
 * (port 3101), which updates js/sidebar-layout.js and the sidebar in
 * index.html. No file-picker dialog.
 */
window.SASidebarStore = (function () {
  'use strict';

  function captureFromIndexHtml() {
    return fetch('../index.html', { cache: 'no-store' })
      .then(function (response) {
        if (!response.ok) {
          throw new Error('Could not read index.html (HTTP ' + response.status + ')');
        }
        return response.text();
      })
      .then(function (html) {
        var doc = new DOMParser().parseFromString(html, 'text/html');
        var model = window.SASidebarModel.captureFromDocument(doc);
        if (!model || !model.sections.length) {
          throw new Error('No sidebar found in index.html');
        }
        return model;
      });
  }

  function parseLayoutScript(text) {
    if (window.SASidebarLayoutSerialize && window.SASidebarLayoutSerialize.parseLayoutScript) {
      return window.SASidebarLayoutSerialize.parseLayoutScript(text);
    }
    var marker = 'window.SA_SIDEBAR_LAYOUT = ';
    var i = String(text || '').indexOf(marker);
    if (i < 0) return null;
    var raw = text.slice(i + marker.length).trim();
    if (raw.charAt(raw.length - 1) === ';') raw = raw.slice(0, -1).trim();
    if (!raw || raw === 'null') return null;
    return JSON.parse(raw);
  }

  function fromSavedObject(saved, source) {
    return {
      model: window.SASidebarModel.assignIds(window.SASidebarModel.clone(saved)),
      source: source || 'js/sidebar-layout.js'
    };
  }

  function loadLayoutFile() {
    return fetch('../js/sidebar-layout.js', { cache: 'no-store' })
      .then(function (response) {
        if (!response.ok) {
          throw new Error('Could not read sidebar-layout.js (HTTP ' + response.status + ')');
        }
        return response.text();
      })
      .then(function (text) {
        return parseLayoutScript(text);
      });
  }

  function load() {
    return loadLayoutFile().then(function (saved) {
      if (saved && saved.sections && saved.sections.length) {
        return fromSavedObject(saved, 'js/sidebar-layout.js');
      }
      return captureFromIndexHtml().then(function (model) {
        return { model: model, source: 'index.html (sidebar markup)' };
      });
    }).catch(function () {
      var saved = window.SA_SIDEBAR_LAYOUT;
      if (saved && saved.sections && saved.sections.length) {
        return fromSavedObject(saved, 'js/sidebar-layout.js');
      }
      return captureFromIndexHtml().then(function (model) {
        return { model: model, source: 'index.html (sidebar markup)' };
      });
    });
  }

  function layoutApiUrls() {
    var path = '/api/sidebar-layout';
    var urls = [];
    if (String(window.location.port) === '3101') {
      urls.push(window.location.origin + path);
      return urls;
    }
    urls.push('http://127.0.0.1:3101' + path);
    urls.push('http://localhost:3101' + path);
    try {
      if (window.location.origin) urls.push(window.location.origin + path);
    } catch (e) { /* ignore */ }
    return urls;
  }

  function saveToCodebase(payload) {
    var urls = layoutApiUrls();
    var lastError = new Error(
      'Could not reach the dashboard server. Start it with py server.py (port 3101), then click Save again.'
    );

    function attempt(i) {
      if (i >= urls.length) return Promise.reject(lastError);
      return fetch(urls[i], {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      }).then(function (response) {
        if (!response.ok) {
          return response.json().then(function (body) {
            throw new Error((body && body.error) || ('Save failed HTTP ' + response.status));
          }, function () {
            throw new Error('Save failed HTTP ' + response.status);
          });
        }
        return response.json();
      }).catch(function (error) {
        lastError = error;
        return attempt(i + 1);
      });
    }

    return attempt(0);
  }

  return {
    load: load,
    saveToCodebase: saveToCodebase
  };
})();
