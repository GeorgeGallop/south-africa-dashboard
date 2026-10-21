// Small DOM toolkit: element builders, cards, badges, bars and a reusable
// sortable / filterable table. Every value coming from the repository is
// inserted as a text node (never innerHTML), so filenames can never inject
// markup.

import { formatBytes, formatCount } from "./util.js";

export function el(tag, attrs = {}, children) {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs)) {
    if (value == null || value === false) continue;
    if (key === "class") node.className = value;
    else if (key === "text") node.textContent = value;
    else if (key === "dataset") Object.assign(node.dataset, value);
    else if (key.startsWith("on") && typeof value === "function") node.addEventListener(key.slice(2).toLowerCase(), value);
    else if (key === "style" && typeof value === "object") Object.assign(node.style, value);
    else node.setAttribute(key, value);
  }
  append(node, children);
  return node;
}

export function append(node, children) {
  if (children == null) return node;
  const list = Array.isArray(children) ? children : [children];
  for (const child of list) {
    if (child == null || child === false) continue;
    node.append(child instanceof Node ? child : document.createTextNode(String(child)));
  }
  return node;
}

export function clear(node) {
  while (node.firstChild) node.removeChild(node.firstChild);
  return node;
}

/* ------------------------------------------------------------------ */
/* Small presentational pieces                                         */
/* ------------------------------------------------------------------ */

const BADGE_TONES = {
  safe: "text-bg-success",
  review: "text-bg-warning",
  danger: "text-bg-danger",
  info: "text-bg-secondary",
  neutral: "text-bg-light border",
};

export function badge(text, tone = "neutral") {
  return el("span", { class: `badge ${BADGE_TONES[tone] || BADGE_TONES.neutral} rh-badge`, text });
}

const ICON_PATHS = {
  files: "M12 2 2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5",
  size: "M12 2C8 2 4 3 4 5s4 3 8 3 8-1 8-3-4-3-8-3zM4 5v14c0 2 4 3 8 3s8-1 8-3V5M4 12c0 2 4 3 8 3s8-1 8-3",
  page: "M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8zM14 2v6h6M16 13H8M16 17H8",
  junk: "M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M6 6l1 14a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-14",
  book: "M4 19.5A2.5 2.5 0 0 1 6.5 17H20M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z",
  image: "M3 3h18v18H3zM8.5 8.5a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3zM21 15l-5-5L5 21",
  data: "M18 20V10M12 20V4M6 20v-6",
  code: "M16 18l6-6-6-6M8 6l-6 6 6 6",
  scan: "M11 3a8 8 0 1 0 0 16 8 8 0 0 0 0-16zM21 21l-4.35-4.35",
  link: "M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71",
  alert: "M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20zM12 8v4M12 16h.01",
};

const SVG_NS = "http://www.w3.org/2000/svg";

export function iconSvg(name) {
  const svg = document.createElementNS(SVG_NS, "svg");
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("width", "15");
  svg.setAttribute("height", "15");
  svg.setAttribute("fill", "none");
  svg.setAttribute("stroke", "currentColor");
  svg.setAttribute("stroke-width", "2");
  svg.setAttribute("stroke-linecap", "round");
  svg.setAttribute("stroke-linejoin", "round");
  svg.setAttribute("class", "rh-icon");
  const path = document.createElementNS(SVG_NS, "path");
  path.setAttribute("d", ICON_PATHS[name] || ICON_PATHS.files);
  svg.append(path);
  return svg;
}

export function statCard({ label, value, sub, tone = "green", icon }) {
  return el("div", { class: "col-6 col-lg-3" }, [
    el("div", { class: `card rh-stat rh-stat--${tone} h-100 border-2` }, [
      el("div", { class: "card-body" }, [
        el("div", { class: "rh-stat__label" }, icon ? [iconSvg(icon), label] : label),
        el("div", { class: "rh-stat__value", text: value }),
        sub ? el("div", { class: "rh-stat__sub text-muted", text: sub }) : null,
      ]),
    ]),
  ]);
}

export function bar(pct, tone = "green") {
  return el("div", { class: "rh-bar" }, [
    el("div", { class: `rh-bar__fill rh-bar__fill--${tone}`, style: { width: `${Math.max(pct, pct > 0 ? 2 : 0)}%` } }),
  ]);
}

export function sizeCell(bytes) {
  return el("span", { class: "rh-size", title: `${formatCount(bytes)} bytes`, text: formatBytes(bytes) });
}

/* A titled card with an optional right-hand action area. */
export function sectionCard({ id, title, subtitle, tone = "green", actions, body, note }) {
  const card = el("section", { class: `card rh-section rh-section--${tone} mb-4`, id });
  const head = el("div", { class: "card-header rh-section__head" }, [
    el("div", {}, [
      el("h2", { class: "rh-section__title", text: title }),
      subtitle ? el("p", { class: "rh-section__sub mb-0", text: subtitle }) : null,
    ]),
    actions ? el("div", { class: "rh-section__actions" }, actions) : null,
  ]);
  card.append(head);
  const bodyEl = el("div", { class: "card-body" }, body);
  card.append(bodyEl);
  if (note) card.append(el("div", { class: "card-footer rh-note", text: note }));
  return card;
}

/* ------------------------------------------------------------------ */
/* Data table                                                          */
/* ------------------------------------------------------------------ */

export function dataTable(options) {
  const {
    columns,
    rows,
    searchPlaceholder = "Filter rows…",
    emptyText = "Nothing to show.",
    initialSort,
    pageSize = 40,
    filterText,
  } = options;

  const state = {
    query: "",
    sortKey: initialSort?.key ?? null,
    sortDir: initialSort?.dir ?? "asc",
    page: 1,
  };

  const wrapper = el("div", { class: "rh-table" });

  const search = el("input", {
    type: "search", class: "form-control form-control-sm rh-search",
    placeholder: searchPlaceholder,
    oninput: (e) => { state.query = e.target.value.toLowerCase(); state.page = 1; refresh(); },
  });
  const countLabel = el("span", { class: "rh-table__count text-muted small" });
  wrapper.append(el("div", { class: "rh-table__toolbar" }, [search, countLabel]));

  const table = el("table", { class: "table table-sm table-hover rh-grid align-middle mb-0" });
  const thead = el("thead");
  const headRow = el("tr");
  thead.append(headRow);
  const tbody = el("tbody");
  table.append(thead, tbody);

  const pager = el("div", { class: "rh-pager" });

  const scroll = el("div", { class: "rh-table__scroll" }, [table]);
  wrapper.append(scroll, pager);

  function valueOf(row, column) {
    return column.value ? column.value(row) : row[column.key];
  }

  function sortValueOf(row, column) {
    const value = valueOf(row, column);
    if (typeof value === "number") return value;
    return String(value ?? "").toLowerCase();
  }

  function rowText(row) {
    if (filterText) return filterText(row).toLowerCase();
    return columns.map((c) => String(valueOf(row, c) ?? "")).join(" ").toLowerCase();
  }

  function buildHeader() {
    clear(headRow);
    for (const column of columns) {
      const active = state.sortKey === column.key;
      const label = el("span", {}, [
        column.label,
        active ? el("span", { class: "rh-sort", text: state.sortDir === "asc" ? " ▲" : " ▼" }) : null,
      ]);
      const th = el("th", {
        class: [column.align === "end" ? "text-end" : "", column.sortable === false ? "" : "rh-sortable"].join(" ").trim(),
        role: column.sortable === false ? null : "button",
        tabindex: column.sortable === false ? null : "0",
        onclick: column.sortable === false ? null : () => toggleSort(column.key),
        onkeydown: column.sortable === false ? null : (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); toggleSort(column.key); } },
      }, [label]);
      headRow.append(th);
    }
  }

  function toggleSort(key) {
    if (state.sortKey === key) state.sortDir = state.sortDir === "asc" ? "desc" : "asc";
    else { state.sortKey = key; state.sortDir = "asc"; }
    refresh();
  }

  function computeRows() {
    let list = rows.slice();
    if (state.query) list = list.filter((row) => rowText(row).includes(state.query));
    const column = columns.find((c) => c.key === state.sortKey);
    if (column) {
      const dir = state.sortDir === "asc" ? 1 : -1;
      list.sort((a, b) => {
        const av = sortValueOf(a, column);
        const bv = sortValueOf(b, column);
        if (av < bv) return -1 * dir;
        if (av > bv) return 1 * dir;
        return 0;
      });
    }
    return list;
  }

  function refresh() {
    buildHeader();
    const filtered = computeRows();
    const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
    state.page = Math.min(state.page, totalPages);
    const start = (state.page - 1) * pageSize;
    const pageRows = filtered.slice(start, start + pageSize);

    clear(tbody);
    if (!pageRows.length) {
      tbody.append(el("tr", {}, [el("td", { colspan: columns.length, class: "text-center text-muted py-4", text: emptyText })]));
    } else {
      for (const row of pageRows) {
        const tr = el("tr");
        for (const column of columns) {
          const content = column.render ? column.render(row) : String(valueOf(row, column) ?? "");
          tr.append(el("td", { class: column.align === "end" ? "text-end" : "", "data-column": column.key }, [content]));
        }
        tbody.append(tr);
      }
    }

    countLabel.textContent = filtered.length === rows.length
      ? `${formatCount(rows.length)} rows`
      : `${formatCount(filtered.length)} of ${formatCount(rows.length)} rows`;

    clear(pager);
    if (totalPages > 1) {
      pager.append(
        el("button", { class: "btn btn-sm btn-outline-secondary", text: "‹ Prev", disabled: state.page === 1 || null, onclick: () => { state.page -= 1; refresh(); } }),
        el("span", { class: "rh-pager__label", text: `Page ${state.page} of ${totalPages}` }),
        el("button", { class: "btn btn-sm btn-outline-secondary", text: "Next ›", disabled: state.page === totalPages || null, onclick: () => { state.page += 1; refresh(); } }),
      );
    }
  }

  refresh();
  return wrapper;
}

/* ------------------------------------------------------------------ */
/* Clipboard + download                                                */
/* ------------------------------------------------------------------ */

export function copyButton(getText, label = "Copy") {
  const button = el("button", { class: "btn btn-sm btn-outline-success", text: label });
  button.addEventListener("click", async () => {
    const original = button.textContent;
    try {
      await navigator.clipboard.writeText(getText());
      button.textContent = "Copied";
    } catch {
      button.textContent = "Copy failed";
    }
    setTimeout(() => { button.textContent = original; }, 1500);
  });
  return button;
}

export function downloadButton(getText, filename, label = "Download") {
  return el("button", {
    class: "btn btn-sm btn-outline-secondary",
    text: label,
    onclick: () => {
      const blob = new Blob([getText()], { type: "text/plain;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const a = el("a", { href: url, download: filename });
      document.body.append(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    },
  });
}

export function codeBlock(getText) {
  const pre = el("pre", { class: "rh-code" });
  pre.textContent = getText();
  return pre;
}
