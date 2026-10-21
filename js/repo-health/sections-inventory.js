// Renderers for the repository overview: headline metrics, where the weight
// sits (folders + file types), the biggest files, duplicates and the small or
// empty files worth a second look.

import { formatBytes, formatCount, formatDate } from "./util.js";
import { statCard, sectionCard, dataTable, badge, sizeCell, el } from "./ui.js";

export function summaryCards(inventory) {
  const s = inventory.summary;
  return [
    statCard({ label: "Files", value: formatCount(s.fileCount), sub: `${formatCount(s.dirCount)} folders`, tone: "green", icon: "files" }),
    statCard({ label: "Total size", value: formatBytes(s.totalBytes), sub: "tracked on disk", tone: "blue", icon: "size" }),
    statCard({ label: "HTML pages", value: formatCount(s.htmlCount), sub: "in pages/ and root", tone: "green", icon: "page" }),
    statCard({ label: "Junk files", value: formatCount(s.junkCount), sub: `${formatBytes(s.junkBytes)} reclaimable`, tone: "gold", icon: "junk" }),
    statCard({ label: "PDFs", value: formatCount(s.pdfCount), sub: formatBytes(s.pdfBytes), tone: "blue", icon: "book" }),
    statCard({ label: "Images", value: formatCount(s.imageCount), sub: formatBytes(s.imageBytes), tone: "gold", icon: "image" }),
    statCard({ label: "Data files", value: formatCount(s.dataCount), sub: "csv · json · xlsx", tone: "green", icon: "data" }),
    statCard({ label: "Code files", value: formatCount(s.codeCount), sub: "js · css · py", tone: "blue", icon: "code" }),
  ];
}

export function inventorySections(inventory) {
  const sections = [];
  sections.push(weightSection(inventory));
  sections.push(largestSection(inventory));
  sections.push(duplicateSection(inventory.duplicates));
  sections.push(smallFilesSection(inventory));
  return sections;
}

/* ------------------------------------------------------------------ */
/* Where the weight is                                                 */
/* ------------------------------------------------------------------ */

function weightSection(inventory) {
  const columns = el("div", { class: "row g-4" }, [
    el("div", { class: "col-lg-6" }, [breakdown("Largest folders", inventory.topLevel, "folder")]),
    el("div", { class: "col-lg-6" }, [breakdown("By file type", inventory.byType, "kind")]),
  ]);

  return sectionCard({
    id: "weight",
    tone: "green",
    title: "Where the weight is",
    subtitle: "Total bytes per top-level folder and per file type.",
    body: [columns],
  });
}

function breakdown(title, list, keyName) {
  const top = list.slice(0, 10);
  const max = top.length ? top[0].bytes || 1 : 1;
  const rows = top.map((entry) =>
    el("div", { class: "rh-break-row" }, [
      el("div", { class: "rh-break-row__head" }, [
        el("span", { class: "rh-break-row__name", text: entry.key || "(none)" }),
        el("span", { class: "rh-break-row__meta text-muted", text: `${formatCount(entry.count)} · ${formatBytes(entry.bytes)}` }),
      ]),
      el("div", { class: "rh-bar" }, [
        el("div", { class: "rh-bar__fill rh-bar__fill--green", style: { width: `${Math.max((entry.bytes / max) * 100, 2)}%` } }),
      ]),
    ]),
  );
  return el("div", { class: "rh-break" }, [
    el("h3", { class: "rh-break__title", text: title }),
    el("div", { class: "rh-break__list" }, rows.length ? rows : [el("p", { class: "text-muted", text: "No data." })]),
  ]);
}

/* ------------------------------------------------------------------ */
/* Largest files                                                       */
/* ------------------------------------------------------------------ */

function largestSection(inventory) {
  return sectionCard({
    id: "largest",
    tone: "blue",
    title: "Largest files",
    subtitle: "The biggest single files — usually the first place to look for bloat.",
    body: [
      dataTable({
        rows: inventory.largest,
        initialSort: { key: "size", dir: "desc" },
        pageSize: 20,
        searchPlaceholder: "Filter by path or type…",
        emptyText: "No sized files found.",
        columns: [
          { key: "path", label: "Path", value: (r) => r.path, render: (r) => fileLink(r) },
          { key: "type", label: "Type", value: (r) => r.type, render: (r) => badge(r.type, "info") },
          { key: "size", label: "Size", align: "end", value: (r) => r.size ?? 0, render: (r) => sizeCell(r.size ?? 0) },
          { key: "mtime", label: "Modified", align: "end", value: (r) => r.mtime ?? 0, render: (r) => formatDate(r.mtime) },
        ],
      }),
    ],
  });
}

/* ------------------------------------------------------------------ */
/* Duplicates                                                          */
/* ------------------------------------------------------------------ */

function duplicateSection(duplicates) {
  const body = duplicates.length
    ? [
        el("p", { class: "text-muted", text: "Groups of files that share a byte size or a near-identical name. High confidence groups are usually genuine duplicates." }),
        el("div", { class: "rh-dupes" }, duplicates.slice(0, 40).map(dupeGroup)),
      ]
    : [el("p", { class: "text-muted mb-0", text: "No duplicate-size or near-duplicate-name files detected." })];

  return sectionCard({
    id: "duplicates",
    tone: "gold",
    title: "Possible duplicates",
    subtitle: `${formatCount(duplicates.length)} suspicious group${duplicates.length === 1 ? "" : "s"} — candidates for consolidation.`,
    body,
  });
}

function dupeGroup(group) {
  return el("div", { class: "rh-dupe" }, [
    el("div", { class: "rh-dupe__head" }, [
      badge(group.confidence, group.confidence === "High" ? "danger" : "review"),
      el("span", { class: "rh-dupe__reason", text: group.reason }),
      el("span", { class: "rh-dupe__size text-muted", text: `${group.files.length} files · ${formatBytes(group.size ?? 0)} each` }),
    ]),
    el("ul", { class: "rh-dupe__list" }, group.files.map((f) =>
      el("li", {}, [fileLink(f), el("span", { class: "text-muted", text: ` — ${formatBytes(f.size ?? 0)}` })]),
    )),
  ]);
}

/* ------------------------------------------------------------------ */
/* Small & empty files                                                 */
/* ------------------------------------------------------------------ */

function smallFilesSection(inventory) {
  const rows = [
    ...inventory.emptyFiles.map((f) => ({ kind: "Empty", path: f.path, url: f.url, size: 0, mtime: f.mtime })),
    ...inventory.thinPages.map((f) => ({ kind: "Thin page", path: f.path, url: f.url, size: f.size, mtime: f.mtime })),
  ];

  return sectionCard({
    id: "small-files",
    tone: "gold",
    title: "Empty & thin files",
    subtitle: `${formatCount(rows.length)} files that are empty or suspiciously small — often abandoned stubs.`,
    body: [
      dataTable({
        rows,
        initialSort: { key: "size", dir: "asc" },
        pageSize: 30,
        searchPlaceholder: "Filter by path…",
        emptyText: "No empty or thin files.",
        columns: [
          { key: "path", label: "Path", value: (r) => r.path, render: (r) => fileLink(r) },
          { key: "kind", label: "Kind", value: (r) => r.kind, render: (r) => badge(r.kind, r.kind === "Empty" ? "danger" : "review") },
          { key: "size", label: "Size", align: "end", value: (r) => r.size ?? 0, render: (r) => sizeCell(r.size ?? 0) },
          { key: "mtime", label: "Modified", align: "end", value: (r) => r.mtime ?? 0, render: (r) => formatDate(r.mtime) },
        ],
      }),
    ],
  });
}

/* ------------------------------------------------------------------ */
/* Shared                                                              */
/* ------------------------------------------------------------------ */

function fileLink(file) {
  return el("span", { class: "rh-filelink" }, [
    el("code", { class: "rh-path", text: file.path }),
    file.url
      ? el("a", { class: "rh-open", href: file.url, target: "_blank", rel: "noopener", text: "open" })
      : null,
  ]);
}
