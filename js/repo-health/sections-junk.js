// Renderers for the "delete candidates" part of the report: the junk table,
// a per-category breakdown and a ready-to-run cleanup script.

import { formatBytes, formatCount, JUNK_LEGEND } from "./util.js";
import { buildCleanupScript } from "./analyze.js";
import { sectionCard, dataTable, badge, sizeCell, copyButton, downloadButton, el } from "./ui.js";

export function junkSections(inventory, { rootLabel = "" } = {}) {
  const { junkItems, junkGroups, junkTotals } = inventory;
  const sections = [];

  sections.push(
    sectionCard({
      id: "delete-candidates",
      tone: "gold",
      title: "Delete candidates",
      subtitle: junkTotals.count
        ? `${formatCount(junkTotals.count)} files · ${formatBytes(junkTotals.bytes)} of recoverable space · ${formatBytes(junkTotals.safeBytes)} safe to remove immediately`
        : "Nothing matched the junk rules — the tree looks clean.",
      actions: [
        copyButton(() => junkItems.map((i) => i.path).join("\n"), "Copy paths"),
      ],
      body: [
        legend(),
        categoryBreakdown(junkGroups),
        dataTable({
          rows: junkItems,
          initialSort: { key: "size", dir: "desc" },
          searchPlaceholder: "Filter by path, category or reason…",
          emptyText: "No delete candidates found.",
          filterText: (row) => `${row.path} ${row.category} ${row.reason}`,
          columns: [
            { key: "path", label: "Path", value: (r) => r.path, render: (r) => el("code", { class: "rh-path", text: r.path }) },
            { key: "category", label: "Category", value: (r) => r.category, render: (r) => badge(r.category, "info") },
            { key: "severity", label: "Confidence", value: (r) => r.severity, render: (r) => badge(r.severity === "safe" ? "Safe" : "Review", r.severity === "safe" ? "safe" : "review") },
            { key: "size", label: "Size", align: "end", value: (r) => r.size, render: (r) => sizeCell(r.size) },
            { key: "reason", label: "Why it can go", sortable: false, render: (r) => el("span", { class: "text-muted", text: r.reason }) },
          ],
        }),
      ],
    }),
  );

  sections.push(cleanupCard(junkItems, rootLabel));
  return sections;
}

/* Small legend explaining each junk category. */
function legend() {
  const items = JUNK_LEGEND.map((entry) =>
    el("li", { class: "rh-legend__item" }, [
      el("strong", { text: entry.category }),
      el("span", { class: "text-muted", text: ` — ${entry.note}` }),
    ]),
  );
  return el("details", { class: "rh-legend" }, [
    el("summary", { text: "What counts as junk?" }),
    el("ul", { class: "rh-legend__list" }, items),
  ]);
}

function categoryBreakdown(groups) {
  if (!groups.length) return null;
  const max = groups[0].bytes || 1;
  const rows = groups.map((group) => {
    const pct = (group.bytes / max) * 100;
    return el("div", { class: "rh-cat" }, [
      el("div", { class: "rh-cat__head" }, [
        el("span", { class: "rh-cat__name", text: group.category }),
        el("span", { class: "rh-cat__meta text-muted", text: `${formatCount(group.count)} files · ${formatBytes(group.bytes)}` }),
      ]),
      el("div", { class: "rh-bar" }, [
        el("div", { class: "rh-bar__fill rh-bar__fill--gold", style: { width: `${Math.max(pct, 2)}%` } }),
      ]),
    ]);
  });
  return el("div", { class: "rh-cat-grid" }, rows);
}

/* Cleanup script with Windows / Unix toggle, copy and download. */
function cleanupCard(junkItems, rootLabel) {
  const script = buildCleanupScript(junkItems);
  if (!script.fileCount && !script.dirCount) {
    return sectionCard({
      id: "cleanup",
      tone: "blue",
      title: "Cleanup script",
      subtitle: "Nothing to clean up.",
      body: [el("p", { class: "text-muted mb-0", text: "No junk files detected for this root." })],
    });
  }

  const pre = el("pre", { class: "rh-code", text: script.unix });

  let mode = "unix";
  const winBtn = el("button", { class: "btn btn-sm btn-outline-secondary", text: "Windows (.bat)" });
  const unixBtn = el("button", { class: "btn btn-sm btn-success", text: "macOS / Linux (.sh)" });

  const apply = (next) => {
    mode = next;
    pre.textContent = next === "unix" ? script.unix : script.windows;
    winBtn.className = next === "windows" ? "btn btn-sm btn-success" : "btn btn-sm btn-outline-secondary";
    unixBtn.className = next === "unix" ? "btn btn-sm btn-success" : "btn btn-sm btn-outline-secondary";
  };
  winBtn.addEventListener("click", () => apply("windows"));
  unixBtn.addEventListener("click", () => apply("unix"));

  const filename = () => (mode === "unix" ? "cleanup.sh" : "cleanup.bat");

  return sectionCard({
    id: "cleanup",
    tone: "blue",
    title: "Cleanup script",
    subtitle: `Removes ${formatCount(script.fileCount)} files and ${formatCount(script.dirCount)} cache folders. Review before running.`,
    actions: [
      winBtn,
      unixBtn,
      copyButton(() => pre.textContent, "Copy script"),
      downloadButton(() => pre.textContent, filename(), "Download"),
    ],
    body: [pre],
    note: `Paths are relative to the repository root${rootLabel ? ` (${rootLabel})` : ""}. Run the script from that folder.`,
  });
}
