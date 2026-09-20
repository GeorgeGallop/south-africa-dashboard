/* tablekit.js — Excel-style column filters + CSV download for SA Dashboard tables. */
(function (global) {
  "use strict";

  function esc(v) {
    if (v === null || v === undefined) return "";
    const s = String(v);
    return /[",\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  }

  function toCSV(rows, columns) {
    const header = columns.map(function (c) { return esc(c.label); }).join(",");
    const body = rows.map(function (r) {
      return columns.map(function (c) { return esc(r[c.k]); }).join(",");
    });
    return "\uFEFF" + [header].concat(body).join("\r\n");
  }

  function downloadCSV(filename, rows, columns) {
    const blob = new Blob([toCSV(rows, columns)], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(function () { URL.revokeObjectURL(url); }, 500);
  }

  const BLANK = "(blank)";
  function keyOf(v) { return v === null || v === undefined || v === "" ? BLANK : String(v); }

  const STYLE = document.createElement("style");
  STYLE.textContent =
    "th.exf-th{cursor:default;position:relative;}" +
    "th.exf-clickable{cursor:pointer;}" +
    "th.exf-clickable:hover{background-color:#3d5a4e;}" +
    ".exf-btn{margin-left:6px;padding:2px 7px;border:none;background:rgba(255,255,255,.18);color:inherit;font-size:.8rem;cursor:pointer;opacity:.9;line-height:1.4;border-radius:3px;}" +
    ".exf-btn:hover{opacity:1;background:rgba(255,255,255,.35);}" +
    ".exf-btn.exf-active{opacity:1;background:#FFCD00;color:#212529;font-weight:700;}" +
    ".exf-panel{position:fixed;z-index:3000;background:#fff;border:1px solid #ced4da;border-radius:6px;box-shadow:0 6px 18px rgba(0,0,0,.18);width:250px;padding:8px;font-family:inherit;max-height:calc(100vh - 16px);overflow:auto;}" +
    ".exf-search{width:100%;margin-bottom:6px;font-size:.8rem;padding:4px 6px;border:1px solid #ced4da;border-radius:4px;}" +
    ".exf-list{max-height:220px;overflow-y:auto;margin-bottom:6px;}" +
    ".exf-item{display:flex;align-items:center;gap:6px;font-size:.8rem;padding:2px 4px;cursor:pointer;white-space:nowrap;}" +
    ".exf-item:hover{background:#f1f3f5;}" +
    ".exf-item input{margin:0;}" +
    ".exf-empty{font-size:.8rem;color:#6c757d;padding:6px 4px;}" +
    ".exf-actions{display:flex;gap:6px;align-items:center;}" +
    ".exf-actions button{font-size:.75rem;padding:3px 8px;border:1px solid #ced4da;border-radius:4px;background:#fff;cursor:pointer;}" +
    ".exf-actions button:hover{background:#f1f3f5;}" +
    ".exf-ok{margin-left:auto;background:#007A4D !important;color:#fff;border-color:#007A4D !important;}";
  document.head.appendChild(STYLE);

  function attachFilters(opts) {
    const headRow = opts.headRow;
    const columns = opts.columns;
    const getRows = opts.getRows;
    const onChange = opts.onChange || function () {};
    const filterOnHeaderClick = !!opts.filterOnHeaderClick;
    const filters = Object.create(null);

    function closeAll() {
      document.querySelectorAll(".exf-panel").forEach(function (p) { p.remove(); });
    }

    columns.forEach(function (col, idx) {
      const th = headRow.children[idx];
      if (!th) return;
      th.classList.add("exf-th");
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "exf-btn";
      btn.title = "Filter by " + col.label;
      btn.innerHTML = "&#9662;";
      btn.addEventListener("click", function (e) {
        e.stopPropagation();
        e.preventDefault();
        openFilter(col, th, btn);
      });
      th.appendChild(btn);
      if (filterOnHeaderClick) {
        th.classList.add("exf-clickable");
        th.addEventListener("click", function (e) {
          if (e.target === btn || btn.contains(e.target)) return;
          if (e.target.closest && e.target.closest("a")) return;
          openFilter(col, th, btn);
        });
      }
    });

    function uniqueValues(col) {
      const set = new Set();
      getRows().forEach(function (r) {
        set.add(keyOf(r[col.k]));
      });
      return Array.from(set).sort(function (a, b) {
        return a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" });
      });
    }

    function rowPassesOtherFilters(r, excludeKey) {
      return Object.keys(filters).every(function (k) {
        if (k === excludeKey) return true;
        const s = filters[k];
        if (!s) return true;        // no filter on this column
        if (!s.size) return false;  // filter active but nothing selected -> no rows pass
        return s.has(keyOf(r[k]));
      });
    }

    function valueCounts(col, excludeKey) {
      const counts = Object.create(null);
      getRows().forEach(function (r) {
        if (!rowPassesOtherFilters(r, excludeKey)) return;
        const k = keyOf(r[col.k]);
        counts[k] = (counts[k] || 0) + 1;
      });
      return counts;
    }

    function renderList(list, values, counts, col, searchValue) {
      list.innerHTML = "";
      const t = (searchValue || "").toLowerCase();
      values.forEach(function (v) {
        if (t && v.toLowerCase().indexOf(t) === -1) return;
        const sel = filters[col.k];
        const label = document.createElement("label");
        label.className = "exf-item";
        const cb = document.createElement("input");
        cb.type = "checkbox";
        cb.checked = !sel || sel.has(v);
        cb.addEventListener("change", function () {
          if (!filters[col.k]) filters[col.k] = new Set();
          if (cb.checked) filters[col.k].add(v);
          else filters[col.k].delete(v);
          refreshCounts(list, col);
          onChange();
          updateHeaderStates();
        });
        const span = document.createElement("span");
        span.textContent = v + " (" + (counts[v] || 0) + ")";
        label.appendChild(cb);
        label.appendChild(span);
        list.appendChild(label);
      });
      if (!list.children.length) {
        const d = document.createElement("div");
        d.className = "exf-empty";
        d.textContent = "No matching values";
        list.appendChild(d);
      }
    }

    function refreshCounts(list, col) {
      const c = valueCounts(col, col.k);
      list.querySelectorAll(".exf-item").forEach(function (item) {
        const span = item.querySelector("span");
        const v = span.textContent.replace(/\s*\(\d+\)$/, "");
        span.textContent = v + " (" + (c[v] || 0) + ")";
      });
    }

    function openFilter(col, th, btn) {
      closeAll();
      const rect = th.getBoundingClientRect();
      const values = uniqueValues(col);
      const counts = valueCounts(col, col.k);

      const panel = document.createElement("div");
      panel.className = "exf-panel";
      panel.style.top = Math.min(rect.bottom + 4, Math.max(8, window.innerHeight - 260)) + "px";
      panel.style.left = Math.min(rect.left, Math.max(8, window.innerWidth - 266)) + "px";

      const search = document.createElement("input");
      search.type = "text";
      search.className = "exf-search";
      search.placeholder = "Search values…";

      const list = document.createElement("div");
      list.className = "exf-list";

      const actions = document.createElement("div");
      actions.className = "exf-actions";
      const selectAll = document.createElement("button");
      selectAll.type = "button";
      selectAll.textContent = "Select all";
      const clear = document.createElement("button");
      clear.type = "button";
      clear.textContent = "Clear";
      const ok = document.createElement("button");
      ok.type = "button";
      ok.className = "exf-ok";
      ok.textContent = "OK";

      selectAll.addEventListener("click", function () {
        delete filters[col.k];
        renderList(list, values, valueCounts(col, col.k), col, search.value);
        onChange();
        updateHeaderStates();
      });
      clear.addEventListener("click", function () {
        // Empty selection = filter stays active but matches nothing (Excel behaviour)
        if (!filters[col.k]) filters[col.k] = new Set();
        filters[col.k].clear();
        renderList(list, values, valueCounts(col, col.k), col, search.value);
        onChange();
        updateHeaderStates();
      });
      ok.addEventListener("click", closeAll);
      search.addEventListener("input", function () {
        renderList(list, values, counts, col, search.value);
      });

      actions.appendChild(selectAll);
      actions.appendChild(clear);
      actions.appendChild(ok);
      panel.appendChild(search);
      panel.appendChild(list);
      panel.appendChild(actions);
      document.body.appendChild(panel);
      renderList(list, values, counts, col, "");
      search.focus();

      const outside = function (e) {
        if (!panel.contains(e.target) && e.target !== btn && !btn.contains(e.target)) {
          panel.remove();
          document.removeEventListener("mousedown", outside, true);
        }
      };
      setTimeout(function () { document.addEventListener("mousedown", outside, true); }, 0);
    }

    function updateHeaderStates() {
      columns.forEach(function (col, idx) {
        const th = headRow.children[idx];
        if (!th) return;
        const active = filters[col.k] !== undefined;
        th.classList.toggle("exf-active", active);
        const b = th.querySelector(".exf-btn");
        if (b) b.classList.toggle("exf-active", active);
      });
    }

    window.addEventListener("scroll", closeAll);
    window.addEventListener("resize", closeAll);

    return {
      applyFilters: function (rows) {
        const keys = Object.keys(filters).filter(function (k) { return filters[k] !== undefined; });
        if (!keys.length) return rows;
        return rows.filter(function (r) {
          return keys.every(function (k) {
            const s = filters[k];
            if (!s.size) return false;
            return s.has(keyOf(r[k]));
          });
        });
      },
      resetFilters: function () {
        Object.keys(filters).forEach(function (k) { delete filters[k]; });
        updateHeaderStates();
      },
      activeCount: function () {
        return Object.keys(filters).filter(function (k) { return filters[k] !== undefined; }).length;
      },
      updateHeaderStates: updateHeaderStates
    };
  }

  global.TableKit = { downloadCSV: downloadCSV, attachFilters: attachFilters };
})(window);
