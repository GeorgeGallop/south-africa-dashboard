/*
 * Sidebar layout model for the South Africa Dashboard.
 *
 * The layout is plain data:
 *   { version: 1, sections: [ item, ... ] }
 *
 * item = link    { type:'link', label, href, arrow, extraClass, style }
 *      | section { type:'section', label, target, arrow, badge, image,
 *                  extraClass, style, children:[ item, ... ] }
 *
 * `target` is the Bootstrap collapse id (e.g. "powerSub") and must be unique.
 * Ids are runtime handles for the editor only and are not serialised.
 */
window.SASidebarModel = (function () {
  'use strict';

  var STRUCTURAL = [
    'list-group-item', 'list-group-item-action', 'small', 'd-flex',
    'justify-content-between', 'align-items-center', 'text-decoration-none',
    'has-move-controls'
  ];
  var idCounter = 0;

  function nextId(prefix) {
    idCounter += 1;
    return prefix + '-' + idCounter;
  }

  function clean(text) {
    return String(text === null || text === undefined ? '' : text)
      .replace(/\s+/g, ' ').trim();
  }

  function stripArrow(text) {
    return clean(text).replace(/^(?:\u2192|\u21d2|->)+\s*/, '');
  }

  function labelFromAnchor(anchor) {
    var clone = anchor.cloneNode(true);
    Array.prototype.forEach.call(
      clone.querySelectorAll('.badge, .move-controls, img'),
      function (node) { node.parentNode.removeChild(node); }
    );
    return stripArrow(clone.textContent);
  }

  function extraClass(anchor) {
    var keep = [];
    Array.prototype.forEach.call(anchor.classList, function (name) {
      if (STRUCTURAL.indexOf(name) === -1) keep.push(name);
    });
    return keep.join(' ');
  }

  function imageFromAnchor(anchor) {
    var img = anchor.querySelector('img');
    if (!img) return null;
    return {
      src: img.getAttribute('src') || '',
      alt: img.getAttribute('alt') || '',
      height: img.style.height || '22px'
    };
  }

  function captureLink(anchor) {
    return {
      id: nextId('lnk'),
      type: 'link',
      label: labelFromAnchor(anchor),
      href: anchor.getAttribute('href') || '#',
      arrow: true,
      extraClass: extraClass(anchor),
      style: anchor.getAttribute('style') || ''
    };
  }

  function captureSection(anchor, collapseEl, depth) {
    var list = collapseEl ? collapseEl.querySelector('.list-group') : null;
    var image = imageFromAnchor(anchor);
    return {
      id: nextId('sec'),
      type: 'section',
      label: labelFromAnchor(anchor),
      target: (collapseEl && collapseEl.id) || '',
      arrow: depth > 0 && !image,
      badge: !!anchor.querySelector('.badge'),
      image: image,
      extraClass: extraClass(anchor),
      style: anchor.getAttribute('style') || '',
      children: captureList(list, depth + 1)
    };
  }

  function captureList(container, depth) {
    var items = [];
    if (!container) return items;

    Array.prototype.forEach.call(container.children, function (node) {
      if (node.classList.contains('collapse')) return;
      if (node.classList.contains('move-controls')) return;

      if (node.tagName === 'DIV' && node.classList.contains('list-group-item')) {
        var head = node.querySelector('a[data-bs-target]');
        if (head) {
          var section = captureSection(head, node.querySelector('.collapse'), depth);
          section.arrow = false;
          section.wrapper = true;
          items.push(section);
        } else {
          var inner = node.querySelector('a');
          if (inner) items.push(captureLink(inner));
        }
        return;
      }

      if (node.tagName === 'A' && node.classList.contains('list-group-item')) {
        var target = node.getAttribute('data-bs-target');
        if (target) {
          var sibling = node.nextElementSibling;
          var panel = sibling && sibling.classList.contains('collapse') ? sibling : null;
          items.push(captureSection(node, panel, depth));
        } else {
          items.push(captureLink(node));
        }
      }
    });

    return items;
  }

  function captureFromDocument(doc) {
    var root = doc.querySelector('.col-md-3 > .list-group') || doc.querySelector('#sidebarRoot');
    if (!root) return null;
    idCounter = 0;
    return { version: 1, sections: captureList(root, 0) };
  }

  function walk(items, fn, depth, parent) {
    var level = depth || 0;
    (items || []).forEach(function (item) {
      fn(item, level, parent);
      if (item.children && item.children.length) {
        walk(item.children, fn, level + 1, item);
      }
    });
  }

  function locate(items, id, parent) {
    var list = items || [];
    for (var i = 0; i < list.length; i++) {
      var item = list[i];
      if (item.id === id) {
        return { item: item, siblings: list, index: i, parent: parent || null };
      }
      if (item.children) {
        var hit = locate(item.children, id, item);
        if (hit) return hit;
      }
    }
    return null;
  }

  function findById(model, id) {
    var hit = locate(model.sections, id, null);
    return hit ? hit.item : null;
  }

  function containsId(item, id) {
    if (item.id === id) return true;
    var found = false;
    walk(item.children || [], function (child) {
      if (child.id === id) found = true;
    });
    return found;
  }

  function siblingsFor(model, parentId) {
    if (!parentId) return model.sections;
    var parent = findById(model, parentId);
    if (!parent) return null;
    if (!parent.children) parent.children = [];
    return parent.children;
  }

  function insertItem(model, parentId, index, item) {
    var list = siblingsFor(model, parentId);
    if (!list) return false;
    var at = Math.max(0, Math.min(typeof index === 'number' ? index : list.length, list.length));
    list.splice(at, 0, item);
    return true;
  }

  function removeItem(model, id) {
    var hit = locate(model.sections, id, null);
    if (!hit) return null;
    hit.siblings.splice(hit.index, 1);
    return hit.item;
  }

  function moveItem(model, id, parentId, index) {
    var hit = locate(model.sections, id, null);
    if (!hit) return false;
    if (parentId && containsId(hit.item, parentId)) return false;

    hit.siblings.splice(hit.index, 1);
    var list = siblingsFor(model, parentId);
    if (!list) {
      hit.siblings.splice(hit.index, 0, hit.item);
      return false;
    }
    var at = typeof index === 'number' ? index : list.length;
    list.splice(Math.max(0, Math.min(at, list.length)), 0, hit.item);
    return true;
  }

  function moveWithin(model, id, delta) {
    var hit = locate(model.sections, id, null);
    if (!hit) return false;
    var target = hit.index + delta;
    if (target < 0 || target >= hit.siblings.length) return false;
    var item = hit.siblings.splice(hit.index, 1)[0];
    hit.siblings.splice(target, 0, item);
    return true;
  }

  function slugTarget(label) {
    var base = clean(label).toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');
    if (!base) base = 'section';
    return base + '-sub';
  }

  function ensureTargets(model) {
    var taken = {};
    walk(model.sections, function (item) {
      if (item.type === 'section' && item.target) {
        taken[item.target] = (taken[item.target] || 0) + 1;
      }
    });

    var seen = {};
    walk(model.sections, function (item) {
      if (item.type !== 'section') return;
      if (item.target && !seen[item.target]) {
        seen[item.target] = true;
        return;
      }
      var base = slugTarget(item.label);
      var candidate = base;
      var n = 2;
      while (seen[candidate] || taken[candidate]) {
        candidate = base + '-' + n;
        n += 1;
      }
      item.target = candidate;
      seen[candidate] = true;
      taken[candidate] = 1;
    });
  }

  function newSection(label, options) {
    var opts = options || {};
    return {
      id: nextId('sec'),
      type: 'section',
      label: clean(label) || 'New section',
      target: '',
      arrow: opts.arrow !== false,
      badge: opts.badge !== false,
      image: null,
      extraClass: opts.extraClass || '',
      style: opts.style || '',
      children: []
    };
  }

  function newLink(label, href) {
    return {
      id: nextId('lnk'),
      type: 'link',
      label: clean(label) || 'New page',
      href: clean(href) || 'pages/',
      arrow: true,
      extraClass: '',
      style: ''
    };
  }

  function clone(model) {
    return JSON.parse(JSON.stringify(model));
  }

  function stats(model) {
    var counts = { sections: 0, links: 0, depth: 0 };
    walk(model.sections, function (item, depth) {
      if (item.type === 'section') counts.sections += 1;
      else counts.links += 1;
      if (depth > counts.depth) counts.depth = depth;
    });
    return counts;
  }

  function assignIds(model) {
    walk(model.sections, function (item) {
      if (!item.id) item.id = nextId(item.type === 'section' ? 'sec' : 'lnk');
      if (item.type === 'section' && !item.children) item.children = [];
    });
    return model;
  }

  return {
    captureFromDocument: captureFromDocument,
    walk: walk,
    locate: locate,
    findById: findById,
    insertItem: insertItem,
    removeItem: removeItem,
    moveItem: moveItem,
    moveWithin: moveWithin,
    ensureTargets: ensureTargets,
    newSection: newSection,
    newLink: newLink,
    clone: clone,
    stats: stats,
    assignIds: assignIds,
    clean: clean,
    slugTarget: slugTarget
  };
})();
