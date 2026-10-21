/*
 * Sidebar up/down reordering for the South Africa Dashboard (index.html).
 *
 * - Every sidebar item gets a small ▲ / ▼ control that appears on hover.
 * - Clicking ▲ moves the item up one position; ▼ moves it down one position.
 * - Items can only move within their own layer/section (same container) —
 *   a top-level section cannot go inside a subsection, and a sub-item cannot
 *   move into a different panel.
 * - Order is persisted in localStorage per container (top-level + each collapse
 *   panel) so it survives page reloads.
 */
window.SASidebarReorder = (function () {
  'use strict';

  var STORAGE_KEY = 'sa-dashboard-sidebar-order-v1';
  var sidebar = null;
  var toggleWired = false;

  /* ---------- helpers ---------- */

  function isItem(el) {
    return el && el.classList && el.classList.contains('list-group-item');
  }

  // Stable key for an item so its order can be persisted across reloads.
  function itemKey(item) {
    if (item.hasAttribute('data-bs-target')) {
      return 'collapse:' + item.getAttribute('data-bs-target');
    }
    var href = item.getAttribute('href');
    if (href && href !== '#') return 'link:' + href;
    return 'seq:' + Array.prototype.indexOf.call(item.parentNode.children, item);
  }

  // Key for a reorderable container (the sidebar itself, or a collapse panel's list).
  function containerKey(c) {
    if (c === sidebar) return '__root__';
    var col = c.closest('.collapse');
    return col ? col.id : '__unnamed__';
  }

  /*
   * A "unit" is a logical item = the list-group-item plus any immediately-
   * following sibling .collapse divs that belong to it (nested dropdowns).
   * E.g.  <a>Operation Vulindlela</a> <div class="collapse" id="economyOvSub">...
   */
  function getUnits(c) {
    var units = [];
    var cur = null;
    Array.prototype.forEach.call(c.childNodes, function (node) {
      if (node.nodeType === Node.TEXT_NODE) {
        if (node.textContent.trim() !== '' && cur) cur.tail.push(node);
        return;
      }
      if (node.nodeType !== Node.ELEMENT_NODE) return;
      if (node.classList.contains('list-group-item')) {
        cur = { head: node, tail: [] };
        units.push(cur);
      } else if (cur) {
        cur.tail.push(node);
      }
    });
    return units;
  }

  function unitNodes(unit) {
    return [unit.head].concat(unit.tail);
  }

  function loadOrder(c) {
    try {
      var all = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
      return all[containerKey(c)] || null;
    } catch (e) {
      return null;
    }
  }

  function saveOrder(c) {
    try {
      var all = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
      all[containerKey(c)] = getUnits(c).map(function (u) { return itemKey(u.head); });
      localStorage.setItem(STORAGE_KEY, JSON.stringify(all));
    } catch (e) { /* ignore */ }
  }

  function applyOrder(c) {
    var order = loadOrder(c);
    if (!order) return;
    var units = getUnits(c).slice().sort(function (a, b) {
      var ia = order.indexOf(itemKey(a.head));
      var ib = order.indexOf(itemKey(b.head));
      return (ia === -1 ? 999 : ia) - (ib === -1 ? 999 : ib);
    });
    units.forEach(function (u) {
      unitNodes(u).forEach(function (n) { c.appendChild(n); });
    });
  }

  /* ---------- move logic ---------- */

  function moveUnit(container, item, dir) {
    if (!item || !isItem(item)) return;
    var units = getUnits(container);
    var idx = -1;
    for (var i = 0; i < units.length; i++) {
      if (units[i].head === item) { idx = i; break; }
    }
    if (idx === -1) return;
    var unit = units[idx];
    var target = dir < 0 ? units[idx - 1] : units[idx + 1];
    if (!target) return;

    var nodes = unitNodes(unit).slice();
    nodes.forEach(function (n) {
      if (n.parentNode) n.parentNode.removeChild(n);
    });

    if (dir < 0) {
      // Insert before the previous unit's head.
      target.head.parentNode.insertBefore(unit.head, target.head);
      var cur = unit.head;
      unit.tail.forEach(function (n) {
        cur.parentNode.insertBefore(n, cur.nextSibling);
        cur = n;
      });
    } else {
      // Insert after the next unit's last node.
      var after = unitNodes(target)[unitNodes(target).length - 1];
      var ref = after.nextSibling;
      if (ref) {
        ref.parentNode.insertBefore(unit.head, ref);
      } else {
        after.parentNode.appendChild(unit.head);
      }
      var cur2 = unit.head;
      unit.tail.forEach(function (n) {
        cur2.parentNode.insertBefore(n, cur2.nextSibling);
        cur2 = n;
      });
    }

    saveOrder(container);
    updateButtons(container);
  }

  function updateButtons(container) {
    var units = getUnits(container);
    units.forEach(function (u, i) {
      var up = u.head.querySelector('.move-up');
      var down = u.head.querySelector('.move-down');
      if (up) up.classList.toggle('disabled', i === 0);
      if (down) down.classList.toggle('disabled', i === units.length - 1);
    });
  }

  /* ---------- add controls ---------- */

  function stop(e) {
    e.preventDefault();
    e.stopPropagation();
  }

  function setupItem(container, item) {
    if (item.querySelector('.move-controls')) return;

    var ctrl = document.createElement('span');
    ctrl.className = 'move-controls';

    var up = document.createElement('button');
    up.type = 'button';
    up.className = 'move-btn move-up';
    up.title = 'Move up';
    up.textContent = '\u25B2'; // ▲

    var down = document.createElement('button');
    down.type = 'button';
    down.className = 'move-btn move-down';
    down.title = 'Move down';
    down.textContent = '\u25BC'; // ▼

    up.addEventListener('click', function (e) {
      stop(e);
      moveUnit(container, item, -1);
    });
    down.addEventListener('click', function (e) {
      stop(e);
      moveUnit(container, item, 1);
    });

    ctrl.appendChild(up);
    ctrl.appendChild(down);
    item.classList.add('has-move-controls');
    item.appendChild(ctrl);
  }

  function enableControls(container) {
    getUnits(container).forEach(function (u) {
      setupItem(container, u.head);
    });
    updateButtons(container);
  }

  function wireToggle() {
    if (toggleWired) return;
    var TOGGLE_STORAGE_KEY = 'sa-dashboard-reorder-enabled';
    var toggle = document.getElementById('reorderToggle');
    if (!toggle) return;
    toggleWired = true;
    var saved = localStorage.getItem(TOGGLE_STORAGE_KEY);
    var enabled = saved === null ? true : saved === 'true';
    toggle.checked = enabled;
    document.body.classList.toggle('reorder-off', !enabled);
    toggle.addEventListener('change', function () {
      localStorage.setItem(TOGGLE_STORAGE_KEY, String(toggle.checked));
      document.body.classList.toggle('reorder-off', !toggle.checked);
    });
  }

  function init() {
    sidebar = document.querySelector('.col-md-3 > .list-group') ||
              document.getElementById('sidebarRoot');
    if (!sidebar) return;
    var containers = [sidebar];
    sidebar.querySelectorAll('.list-group.ms-3').forEach(function (g) {
      containers.push(g);
    });
    containers.forEach(function (c) {
      enableControls(c);
      applyOrder(c);
      updateButtons(c);
    });
    wireToggle();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  return { init: init };
})();
