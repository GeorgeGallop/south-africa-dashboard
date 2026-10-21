/*
 * Sidebar editor — tree rendering, editing operations and saving.
 *
 * Works on the layout model, redraws the tree after every change, keeps a
 * bounded undo history, and writes the result to js/sidebar-layout.js.
 */
window.SASidebarEditor = (function () {
  'use strict';

  var Model = window.SASidebarModel;
  var Store = window.SASidebarStore;
  var Serialize = window.SASidebarLayoutSerialize;

  var state = {
    model: null,
    source: '',
    savedText: '',
    history: [],
    filter: ''
  };

  function byId(id) {
    return document.getElementById(id);
  }

  function toText() {
    return Serialize.toFileText(state.model);
  }

  function isDirty() {
    return !!state.model && toText() !== state.savedText;
  }

  function snapshot() {
    state.history.push(JSON.stringify(state.model));
    if (state.history.length > 60) state.history.shift();
  }

  function undo() {
    if (!state.history.length) return;
    state.model = Model.assignIds(JSON.parse(state.history.pop()));
    render();
    setStatus('Undone.', 'text-muted');
  }

  function commit() {
    Model.ensureTargets(state.model);
    render();
  }

  function hasDescendant(item, id) {
    var found = false;
    Model.walk(item.children || [], function (child) {
      if (child.id === id) found = true;
    });
    return found;
  }

  function sectionSelect(selectedId, excludeItem) {
    var select = document.createElement('select');
    select.className = 'form-select form-select-sm';

    var top = document.createElement('option');
    top.value = '__root__';
    top.textContent = '— Top level —';
    top.selected = true;
    select.appendChild(top);

    Model.walk(state.model.sections, function (item, depth) {
      if (item.type !== 'section') return;
      if (excludeItem && (item.id === excludeItem.id || hasDescendant(excludeItem, item.id))) return;
      var option = document.createElement('option');
      option.value = item.id;
      option.textContent = new Array(depth + 1).join('— ') + item.label;
      select.appendChild(option);
    });

    if (selectedId) select.value = selectedId;
    return select;
  }

  function iconButton(label, title, handler) {
    var button = document.createElement('button');
    button.type = 'button';
    button.className = 'sx-btn';
    button.textContent = label;
    button.title = title;
    button.setAttribute('aria-label', title);
    button.addEventListener('click', handler);
    return button;
  }

  function renameItem(item) {
    var next = window.prompt('Rename "' + item.label + '" to:', item.label);
    if (next === null) return;
    var trimmed = Model.clean(next);
    if (!trimmed || trimmed === item.label) return;
    snapshot();
    item.label = trimmed;
    commit();
    setStatus('Renamed to "' + trimmed + '".', 'text-success');
  }

  function deleteItem(item) {
    var kids = item.children ? item.children.length : 0;
    var warning = kids
      ? 'Delete section "' + item.label + '" and its ' + kids + ' item(s)?'
      : 'Delete "' + item.label + '"?';
    if (!window.confirm(warning)) return;
    snapshot();
    Model.removeItem(state.model, item.id);
    commit();
    setStatus('Deleted "' + item.label + '".', 'text-success');
  }

  function nudge(item, delta) {
    snapshot();
    if (!Model.moveWithin(state.model, item.id, delta)) {
      state.history.pop();
      return;
    }
    render();
  }

  function currentParentId(item) {
    var hit = Model.locate(state.model.sections, item.id, null);
    return hit && hit.parent ? hit.parent.id : '__root__';
  }

  function reparent(item, targetId) {
    var parentId = targetId === '__root__' ? null : targetId;
    if (currentParentId(item) === (parentId || '__root__')) {
      setStatus('Already in that section.', 'text-muted');
      return;
    }
    snapshot();
    var moved = Model.moveItem(state.model, item.id, parentId, null);
    if (!moved) {
      state.history.pop();
      setStatus('That move is not allowed.', 'text-danger');
      return;
    }
    if (item.type === 'section') item.arrow = !!parentId && !item.image;
    commit();
    setStatus('Moved "' + item.label + '".', 'text-success');
  }

  function openMovePicker(host, item) {
    if (host.querySelector('.sx-move')) return;
    var picker = sectionSelect(currentParentId(item), item);
    picker.classList.add('sx-move');

    var cancel = iconButton('\u2715', 'Cancel move', function () {
      picker.remove();
      cancel.remove();
    });

    picker.addEventListener('change', function () {
      var target = picker.value;
      picker.remove();
      cancel.remove();
      if (target && target !== item.id) reparent(item, target);
    });

    host.appendChild(picker);
    host.appendChild(cancel);
    picker.focus();
  }

  function row(item, depth) {
    var node = document.createElement('div');
    node.className = 'sx-row' + (item.type === 'section' ? ' sx-row-section' : ' sx-row-link');
    node.style.paddingLeft = (6 + depth * 18) + 'px';

    var dot = document.createElement('span');
    dot.className = 'sx-dot';
    node.appendChild(dot);

    var label = document.createElement('span');
    label.className = 'sx-label';
    label.textContent = item.label;
    node.appendChild(label);

    var meta = document.createElement('span');
    meta.className = 'sx-meta';
    meta.textContent = item.type === 'section'
      ? (item.children ? item.children.length : 0) + ' items'
      : item.href;
    node.appendChild(meta);

    var actions = document.createElement('span');
    actions.className = 'sx-actions';

    actions.appendChild(iconButton('\u25B2', 'Move up', function () { nudge(item, -1); }));
    actions.appendChild(iconButton('\u25BC', 'Move down', function () { nudge(item, 1); }));
    actions.appendChild(iconButton('\u270E', 'Rename', function () { renameItem(item); }));
    actions.appendChild(iconButton('\u21C4', 'Move into another section', function () {
      openMovePicker(actions, item);
    }));
    actions.appendChild(iconButton('\u2715', 'Delete', function () { deleteItem(item); }));

    node.appendChild(actions);
    return node;
  }

  function itemMatches(item, filter) {
    if (!filter) return true;
    return (item.label + ' ' + (item.href || '')).toLowerCase().indexOf(filter) !== -1;
  }

  function subtreeMatches(item, filter) {
    if (itemMatches(item, filter)) return true;
    var kids = item.children || [];
    for (var i = 0; i < kids.length; i++) {
      if (subtreeMatches(kids[i], filter)) return true;
    }
    return false;
  }

  function renderPreview() {
    var host = byId('sxPreview');
    if (!host || !state.model || !window.SASidebarLayoutRender) return;
    host.textContent = '';
    var root = document.createElement('div');
    root.className = 'list-group';
    host.appendChild(root);
    var copy = Model.clone(state.model);
    Model.walk(copy.sections, function (item) {
      if (item.image && item.image.src && item.image.src.indexOf('images/') === 0) {
        item.image.src = '../' + item.image.src;
      }
    });
    window.SASidebarLayoutRender.render(copy, root);
  }

  function render() {
    var host = byId('sxTree');
    if (!host || !state.model) return;

    host.textContent = '';
    var filter = state.filter.trim().toLowerCase();
    var shown = 0;

    Model.walk(state.model.sections, function (item, depth) {
      if (filter && !subtreeMatches(item, filter)) return;
      host.appendChild(row(item, depth));
      shown += 1;
    });

    var stats = Model.stats(state.model);
    var summary = stats.sections + ' sections · ' + stats.links + ' page links';
    if (filter) summary += ' · ' + shown + ' matching';
    var statsEl = byId('sxStats');
    if (statsEl) statsEl.textContent = summary;

    refreshParentSelects();
    renderPreview();

    var pre = byId('sxFilePreview');
    if (pre && !pre.hidden) pre.textContent = toText();

    updateToolbar();
  }

  /* ---------- status and toolbar ---------- */

  function setStatus(message, klass) {
    var el = byId('sxStatus');
    if (!el) return;
    el.textContent = message || '';
    el.className = 'small ' + (klass || 'text-muted');
  }

  function updateToolbar() {
    var dirty = byId('sxDirty');
    if (dirty) {
      var changed = isDirty();
      dirty.textContent = changed ? 'Unsaved changes' : 'No unsaved changes';
      dirty.className = 'badge ' + (changed ? 'bg-warning text-dark' : 'bg-success');
    }

    var undoBtn = byId('sxUndo');
    if (undoBtn) undoBtn.disabled = state.history.length === 0;

    var saveBtn = byId('sxSaveFile');
    if (saveBtn) {
      saveBtn.disabled = !state.model;
      saveBtn.title = 'Write this sidebar into the dashboard code and update Home';
    }

    var source = byId('sxSource');
    if (source) source.textContent = state.source;
  }

  /* ---------- saving ---------- */

  function previewHtml() {
    if (!state.model || !window.SASidebarLayoutRender) return '';
    var tmp = document.createElement('div');
    tmp.className = 'list-group';
    window.SASidebarLayoutRender.render(state.model, tmp);
    return tmp.innerHTML;
  }

  function saveToDashboard() {
    if (!state.model) return;
    Model.ensureTargets(state.model);
    var text = toText();
    setStatus('Writing the sidebar into the dashboard…', 'text-muted');
    Store.saveToCodebase({
      layoutJs: text,
      sidebarHtml: previewHtml()
    }).then(function () {
      state.savedText = text;
      state.source = 'js/sidebar-layout.js';
      updateToolbar();
      setStatus('Saved. Open Home — the sidebar there is now this layout.', 'text-success');
    }).catch(function (error) {
      var msg = (error && error.message) || 'Save failed.';
      if (/fetch|network|failed to fetch|load failed/i.test(msg) && msg.indexOf('3101') === -1) {
        msg = 'Could not reach the dashboard server on port 3101. Start it with py server.py, then click Save to dashboard again.';
      }
      setStatus(msg, 'text-danger');
    });
  }

  function reloadFromSource() {
    setStatus('Reloading…', 'text-muted');
    window.SASidebarStore.load().then(function (result) {
      applyLoaded(result, 'Reloaded from ' + result.source + '.');
    }).catch(function (error) {
      setStatus((error && error.message) || 'Reload failed.', 'text-danger');
    });
  }

  function applyLoaded(result, message) {
    state.model = result.model;
    state.source = result.source;
    state.savedText = toText();
    state.history = [];
    render();
    setStatus(message || ('Loaded from ' + result.source + '.'), 'text-muted');
  }

  function clearSavedLayout() {
    if (!window.confirm('Clear the saved layout so index.html uses its own sidebar markup again?')) {
      return;
    }
    var text = Serialize.disabledText();
    var afterWrite = function (note) {
      Store.load().then(function (result) {
        applyLoaded(result, note);
      }).catch(function (error) {
        setStatus((error && error.message) || 'Cleared, but reload failed.', 'text-danger');
      });
    };

    Store.saveToCodebase({ layoutJs: text }).then(function () {
      afterWrite('Cleared the overlay file. Home will use the sidebar markup in index.html.');
    }).catch(function (error) {
      setStatus((error && error.message) || 'Could not clear the layout.', 'text-danger');
    });
  }

  /* ---------- adding ---------- */

  function refreshParentSelects() {
    ['sxNewSectionParent', 'sxNewLinkParent'].forEach(function (id) {
      var host = byId(id);
      if (!host) return;
      var previous = host.value;
      host.textContent = '';
      var fresh = sectionSelect(null, null);
      while (fresh.firstChild) host.appendChild(fresh.firstChild);
      host.value = previous || '__root__';
      if (host.value !== (previous || '__root__')) host.value = '__root__';
    });
  }

  function addSection() {
    var labelInput = byId('sxNewSectionLabel');
    var parentSelect = byId('sxNewSectionParent');
    if (!labelInput || !parentSelect) return;

    var label = Model.clean(labelInput.value);
    if (!label) {
      setStatus('Give the new section a name first.', 'text-warning');
      labelInput.focus();
      return;
    }

    var parentId = parentSelect.value === '__root__' ? null : parentSelect.value;
    snapshot();
    var section = Model.newSection(label, { arrow: !!parentId });
    Model.insertItem(state.model, parentId, null, section);
    labelInput.value = '';
    refreshParentSelects();
    commit();
    setStatus('Added section "' + section.label + '".', 'text-success');
  }

  function normaliseHref(raw) {
    var href = Model.clean(raw);
    if (!href) return '';
    if (/^https?:\/\//i.test(href)) return href;
    var clean = href.replace(/^\.?\//, '');
    if (clean.indexOf('pages/') !== 0) clean = 'pages/' + clean;
    if (!/\.html?(#|$)/i.test(clean)) clean += '.html';
    return clean;
  }

  function addLink() {
    var labelInput = byId('sxNewLinkLabel');
    var hrefInput = byId('sxNewLinkHref');
    var parentSelect = byId('sxNewLinkParent');
    if (!labelInput || !hrefInput || !parentSelect) return;

    var label = Model.clean(labelInput.value);
    var href = normaliseHref(hrefInput.value);
    if (!label || !href) {
      setStatus('A page link needs both a label and a page path.', 'text-warning');
      return;
    }
    var parentId = parentSelect.value === '__root__' ? null : parentSelect.value;

    snapshot();
    var link = Model.newLink(label, href);
    Model.insertItem(state.model, parentId, null, link);
    labelInput.value = '';
    hrefInput.value = '';
    commit();
    setStatus('Added link "' + link.label + '" → ' + link.href + '.', 'text-success');
  }

  /* ---------- wiring ---------- */

  function on(id, event, handler) {
    var el = byId(id);
    if (el) el.addEventListener(event, handler);
  }

  function wire() {
    on('sxUndo', 'click', undo);
    on('sxSaveFile', 'click', saveToDashboard);
    on('sxReload', 'click', reloadFromSource);
    on('sxClear', 'click', clearSavedLayout);
    on('sxAddSection', 'click', addSection);
    on('sxAddLink', 'click', addLink);
    on('sxNewSectionLabel', 'keydown', function (event) {
      if (event.key === 'Enter') addSection();
    });
    on('sxNewLinkHref', 'keydown', function (event) {
      if (event.key === 'Enter') addLink();
    });
    on('sxNewLinkLabel', 'keydown', function (event) {
      if (event.key === 'Enter') addLink();
    });

    on('sxFilter', 'input', function (event) {
      state.filter = event.target.value || '';
      render();
    });

    on('sxToggleFile', 'click', function () {
      var pre = byId('sxFilePreview');
      if (!pre) return;
      if (pre.hidden) {
        pre.textContent = toText();
        pre.hidden = false;
      } else {
        pre.hidden = true;
        pre.textContent = '';
      }
    });
  }

  function init() {
    setStatus('Loading the current sidebar…', 'text-muted');
    wire();
    Store.load().then(function (result) {
      applyLoaded(result, 'Loaded from ' + result.source + '. Edit freely, then save.');
    }).catch(function (error) {
      setStatus((error && error.message) || 'Could not load the sidebar.', 'text-danger');
    });
  }

  return { init: init };
})();
