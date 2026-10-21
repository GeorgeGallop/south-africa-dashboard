// Renderers for link health: orphan pages, broken internal links, unreferenced
// assets and content-quality flags (near-empty pages, missing headings).

import { formatBytes, formatCount } from "./util.js";
import { sectionCard, dataTable, badge, sizeCell, statCard, el } from "./ui.js";

export function linkStatCards(analysis) {
  const s = analysis.stats;
  return [
    statCard({ label: "Pages scanned", value: formatCount(s.pagesScanned), sub: `${formatCount(s.totalLinks)} internal links`, tone: "green", icon: "scan" }),
    statCard({ label: "Orphan pages", value: formatCount(s.orphanCount), sub: `${formatCount(s.unreachableCount)} unreachable`, tone: "gold", icon: "alert" }),
    statCard({ label: "Broken links", value: formatCount(s.brokenCount), sub: "internal links that 404", tone: "blue", icon: "link" }),
    statCard({ label: "Unused assets", value: formatCount(s.unusedAssetCount), sub: "images / css / js", tone: "gold", icon: "junk" }),
  ];
}

export function linksSections(analysis) {
  return [
    orphanSection(analysis),
    brokenSection(analysis),
    unusedAssetsSection(analysis),
    contentQualitySection(analysis),
  ];
}

/* ------------------------------------------------------------------ */
/* Orphan pages                                                        */
/* ------------------------------------------------------------------ */

function orphanSection(analysis) {
  const rows = analysis.orphans;
  return sectionCard({
    id: "orphans",
    tone: "gold",
    title: "Orphan pages",
    subtitle: rows.length
      ? `${formatCount(rows.length)} pages that nothing links to — likely dead weight or a missing menu entry.`
      : "Every page is linked from somewhere. Nice.",
    body: [
      dataTable({
        rows,
        initialSort: { key: "size", dir: "desc" },
        pageSize: 30,
        searchPlaceholder: "Filter by page or title…",
        emptyText: "No orphan pages found.",
        columns: [
          { key: "path", label: "Page", value: (r) => r.path, render: (r) => el("code", { class: "rh-path", text: r.path }) },
          { key: "title", label: "Title", value: (r) => r.title || "", render: (r) => el("span", { class: "text-muted", text: r.title || "—" }) },
          { key: "size", label: "Size", align: "end", value: (r) => r.size ?? 0, render: (r) => sizeCell(r.size ?? 0) },
          {
            key: "reach",
            label: "Reachable from home",
            value: (r) => (r.unreachable ? 0 : 1),
            render: (r) => badge(r.unreachable ? "No" : "Yes", r.unreachable ? "danger" : "safe"),
          },
        ],
      }),
    ],
    note: "A page may still be reached by a route not scanned here. Verify before deleting.",
  });
}

/* ------------------------------------------------------------------ */
/* Broken internal links                                               */
/* ------------------------------------------------------------------ */

function brokenSection(analysis) {
  const rows = analysis.brokenLinks;
  return sectionCard({
    id: "broken-links",
    tone: "blue",
    title: "Broken internal links",
    subtitle: rows.length
      ? `${formatCount(rows.length)} links point at a file that does not exist.`
      : "No broken internal links detected.",
    body: [
      dataTable({
        rows,
        pageSize: 30,
        searchPlaceholder: "Filter by page or target…",
        emptyText: "No broken links found.",
        columns: [
          { key: "source", label: "On page", value: (r) => r.source, render: (r) => el("code", { class: "rh-path", text: r.source }) },
          { key: "target", label: "Links to", value: (r) => r.target, render: (r) => el("code", { class: "rh-path rh-path--bad", text: r.target }) },
        ],
      }),
    ],
  });
}

/* ------------------------------------------------------------------ */
/* Unreferenced assets                                                 */
/* ------------------------------------------------------------------ */

function unusedAssetsSection(analysis) {
  const rows = analysis.unusedAssets;
  const total = rows.reduce((n, r) => n + (r.size || 0), 0);
  return sectionCard({
    id: "unused-assets",
    tone: "gold",
    title: "Unreferenced assets",
    subtitle: rows.length
      ? `${formatCount(rows.length)} images / styles / scripts (${formatBytes(total)}) that no scanned page references.`
      : "Every scanned asset is referenced by some page.",
    body: [
      dataTable({
        rows,
        initialSort: { key: "size", dir: "desc" },
        pageSize: 30,
        searchPlaceholder: "Filter by path or type…",
        emptyText: "No unused assets found.",
        columns: [
          { key: "path", label: "Path", value: (r) => r.path, render: (r) => el("code", { class: "rh-path", text: r.path }) },
          { key: "type", label: "Type", value: (r) => r.type, render: (r) => badge(r.type, "info") },
          { key: "size", label: "Size", align: "end", value: (r) => r.size ?? 0, render: (r) => sizeCell(r.size ?? 0) },
        ],
      }),
    ],
    note: "Assets referenced only from CSS or JavaScript (background images, dynamic paths) will show here even though they are used.",
  });
}

/* ------------------------------------------------------------------ */
/* Content quality                                                     */
/* ------------------------------------------------------------------ */

function contentQualitySection(analysis) {
  const rows = [
    ...analysis.emptyPages.map((p) => ({ kind: "Nearly empty", path: p.path, detail: `${formatCount(p.textLength)} chars of text`, sort: p.textLength })),
    ...analysis.noHeadingPages.map((p) => ({ kind: "No heading", path: p.path, detail: p.title || "—", sort: 1_000_000 })),
  ];

  return sectionCard({
    id: "content-quality",
    tone: "green",
    title: "Content quality flags",
    subtitle: `${formatCount(analysis.emptyPages.length)} nearly empty pages · ${formatCount(analysis.noHeadingPages.length)} pages with no <h1> heading.`,
    body: [
      dataTable({
        rows,
        pageSize: 30,
        searchPlaceholder: "Filter by page…",
        emptyText: "No content issues detected.",
        columns: [
          { key: "path", label: "Page", value: (r) => r.path, render: (r) => el("code", { class: "rh-path", text: r.path }) },
          { key: "kind", label: "Flag", value: (r) => r.kind, render: (r) => badge(r.kind, r.kind === "Nearly empty" ? "danger" : "review") },
          { key: "detail", label: "Detail", sortable: false, render: (r) => el("span", { class: "text-muted", text: r.detail }) },
        ],
      }),
    ],
  });
}
