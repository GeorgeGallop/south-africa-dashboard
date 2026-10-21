/*
 * Renders a sidebar layout model into the dashboard sidebar.
 *
 * Produces the same Bootstrap collapse markup the hand-written sidebar used,
 * so styling, the ▲▼ reorder controls and saved collapse state all keep
 * working. No-op when window.SA_SIDEBAR_LAYOUT is null, which leaves the
 * markup in index.html untouched.
 */
window.SASidebarLayoutRender = (function () {
  'use strict';

  var ARROW = '\u2192 ';

  function el(tag, className) {
    var node = document.createElement(tag);
    if (className) node.className = className;
    return node;
  }

  function labelNode(item) {
    if (item.image && item.image.src) {
      var wrap = el('span', 'd-flex align-items-center');
      var img = el('img');
      img.src = item.image.src;
      img.alt = item.image.alt || item.label;
      img.style.height = item.image.height || '22px';
      img.style.marginRight = '8px';
      img.style.verticalAlign = 'middle';
      wrap.appendChild(img);
      var text = el('span');
      text.textContent = item.label;
      wrap.appendChild(text);
      return wrap;
    }
    var span = el('span');
    span.textContent = (item.arrow ? ARROW : '') + item.label;
    return span;
  }

  function badgeNode() {
    var badge = el('span', 'badge bg-secondary');
    badge.textContent = '\u25BC';
    return badge;
  }

  function linkNode(item) {
    var cls = 'list-group-item list-group-item-action small';
    if (item.extraClass) cls += ' ' + item.extraClass;
    var anchor = el('a', cls);
    anchor.href = item.href || '#';
    if (item.style) anchor.setAttribute('style', item.style);
    anchor.textContent = (item.arrow === false ? '' : ARROW) + item.label;
    return anchor;
  }

  function panelNode(item, depth) {
    var panel = el('div', 'collapse mt-2');
    if (item.target) panel.id = item.target;
    var list = el('div', 'list-group ms-3');
    (item.children || []).forEach(function (child) {
      appendItem(list, child, depth + 1);
    });
    panel.appendChild(list);
    return panel;
  }

  function sectionHead(item, depth, withBadge) {
    var cls = depth === 0
      ? 'd-flex justify-content-between align-items-center text-decoration-none'
      : 'list-group-item list-group-item-action small';
    if (depth > 0 && withBadge) {
      cls += ' d-flex justify-content-between align-items-center text-decoration-none';
    }
    if (item.extraClass) cls += ' ' + item.extraClass;

    var head = el('a', cls);
    head.href = '#';
    head.setAttribute('data-bs-toggle', 'collapse');
    head.setAttribute('data-bs-target', '#' + (item.target || ''));
    if (item.style) head.setAttribute('style', item.style);
    head.appendChild(labelNode(item));
    if (withBadge) head.appendChild(badgeNode());
    return head;
  }

  function appendItem(container, item, depth) {
    if (!item) return;

    if (item.type !== 'section') {
      container.appendChild(linkNode(item));
      return;
    }

    var withBadge = item.badge !== false;

    if (depth === 0) {
      var wrapper = el('div', 'list-group-item list-group-item-action');
      wrapper.appendChild(sectionHead(item, 0, true));
      wrapper.appendChild(panelNode(item, 0));
      container.appendChild(wrapper);
      return;
    }

    container.appendChild(sectionHead(item, depth, withBadge));
    container.appendChild(panelNode(item, depth));
  }

  function render(model, target) {
    if (!model || !model.sections || !target) return false;
    target.textContent = '';
    model.sections.forEach(function (item) {
      appendItem(target, item, 0);
    });
    return true;
  }

  function applyModel(model, target) {
    if (!model || !model.sections || !model.sections.length || !target) return false;
    render(model, target);
    document.documentElement.setAttribute('data-sidebar-source', 'js/sidebar-layout.js');
    if (window.SASidebarReorder && typeof window.SASidebarReorder.init === 'function') {
      window.SASidebarReorder.init();
    }
    return true;
  }

  function parseFetched(text) {
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

  function boot() {
    var target = document.getElementById('sidebarRoot');
    if (!target) return;

    var layoutUrl = 'js/sidebar-layout.js';
    fetch(layoutUrl, { cache: 'no-store' }).then(function (response) {
      if (!response.ok) throw new Error('layout HTTP ' + response.status);
      return response.text();
    }).then(function (text) {
      if (applyModel(parseFetched(text), target)) return;
      applyModel(window.SA_SIDEBAR_LAYOUT, target);
    }).catch(function () {
      applyModel(window.SA_SIDEBAR_LAYOUT, target);
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }

  return { render: render, boot: boot };
})();
