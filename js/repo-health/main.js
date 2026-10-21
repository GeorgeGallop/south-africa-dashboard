// Orchestrator: wires the header controls to the crawler, analysers and
// renderers, and keeps the status line and progress bar in sync.

import { crawl } from "./crawler.js";
import { buildInventory } from "./analyze.js";
import { scanPages, analyzeLinks } from "./links.js";
import { summaryCards, inventorySections } from "./sections-inventory.js";
import { junkSections } from "./sections-junk.js";
import { linksSections, linkStatCards } from "./sections-links.js";
import { el, clear, append, downloadButton } from "./ui.js";
import { formatBytes, formatCount } from "./util.js";

const dom = {
  status: document.getElementById("rh-status"),
  progressBar: document.getElementById("rh-progress-bar"),
  progress: document.getElementById("rh-progress"),
  summary: document.getElementById("rh-summary"),
  sections: document.getElementById("rh-sections"),
  linkSummary: document.getElementById("rh-link-summary"),
  linkSections: document.getElementById("rh-link-sections"),
  toc: document.getElementById("rh-toc"),
  rootSelect: document.getElementById("rh-root"),
  refresh: document.getElementById("rh-refresh"),
  deepScan: document.getElementById("rh-deepscan"),
  report: document.getElementById("rh-report"),
};

const ROOTS = buildRoots();

const state = {
  rootKey: dom.rootSelect?.value || "dashboard",
  busy: false,
  inventory: null,
  analysis: null,
  controller: null,
};

/* ------------------------------------------------------------------ */
/* Root selection                                                      */
/* ------------------------------------------------------------------ */

function buildRoots() {
  const page = new URL(window.location.href);
  // performance.html lives at <server>/south-africa-dashboard-main/pages/.
  return {
    dashboard: { url: new URL("../", page).href, label: "South Africa Dashboard repo" },
    project: { url: new URL("../../", page).href, label: "Entire project folder" },
  };
}

/* ------------------------------------------------------------------ */
/* Status helpers                                                      */
/* ------------------------------------------------------------------ */

function setStatus(text) {
  if (dom.status) dom.status.textContent = text;
}

function setProgress(pct) {
  if (!dom.progressBar) return;
  if (pct == null) {
    dom.progressBar.classList.add("progress-bar-striped", "progress-bar-animated");
    dom.progressBar.style.width = "100%";
  } else {
    dom.progressBar.classList.remove("progress-bar-striped", "progress-bar-animated");
    dom.progressBar.style.width = `${Math.min(100, Math.max(2, pct))}%`;
  }
}

function setBusy(busy) {
  state.busy = busy;
  for (const button of [dom.refresh, dom.deepScan]) {
    if (button) button.disabled = busy;
  }
  if (dom.progress) dom.progress.style.visibility = busy ? "visible" : "hidden";
  if (!busy) setProgress(100);
}

/* ------------------------------------------------------------------ */
/* Scan                                                                */
/* ------------------------------------------------------------------ */

async function runScan({ deep = true } = {}) {
  if (state.busy) return;
  state.controller?.abort();
  state.controller = new AbortController();
  const signal = state.controller.signal;

  const root = ROOTS[state.rootKey];
  setBusy(true);
  clear(dom.summary);
  clear(dom.sections);
  clear(dom.linkSummary);
  clear(dom.linkSections);
  clear(dom.toc);

  try {
    setStatus(`Crawling ${root.label}…`);
    setProgress(null);
    const result = await crawl(root.url, {
      signal,
      onProgress: ({ dirsVisited, filesFound, current }) =>
        setStatus(`Crawled ${formatCount(dirsVisited)} folders · ${formatCount(filesFound)} files · ${current}`),
    });

    if (!result.files.length) {
      setStatus("No files found. Is this page served by a dev server that lists directories?");
      setBusy(false);
      return;
    }

    const inventory = buildInventory(result.files, result.dirs, {
      rootPath: result.rootPath,
      rootUrl: result.rootUrl,
      rootLabel: root.label,
    });
    state.inventory = inventory;
    renderInventory(inventory);
    setStatus(`Crawl complete — ${formatCount(inventory.summary.fileCount)} files, ${formatBytes(inventory.summary.totalBytes)}.`);

    if (deep) {
      setProgress(0);
      setStatus("Scanning pages for links…");
      const scan = await scanPages(result.files, {
        rootPath: result.rootPath,
        signal,
        onProgress: ({ scanned, total }) => {
          setProgress((scanned / total) * 100);
          setStatus(`Scanning pages… ${formatCount(scanned)} / ${formatCount(total)}`);
        },
      });
      const analysis = analyzeLinks(result.files, result.dirs, scan);
      state.analysis = analysis;
      renderLinks(analysis);
      setStatus(
        `Done — ${formatCount(analysis.stats.pagesScanned)} pages scanned, ` +
        `${formatCount(analysis.stats.orphanCount)} orphans, ${formatCount(analysis.stats.brokenCount)} broken links.`,
      );
    } else {
      renderDeepScanPrompt();
    }

    renderToc();
    renderReportButton();
  } catch (error) {
    if (error?.name !== "AbortError") {
      setStatus(`Scan failed: ${error?.message || error}`);
    }
  } finally {
    setBusy(false);
  }
}

/* ------------------------------------------------------------------ */
/* Rendering                                                           */
/* ------------------------------------------------------------------ */

function renderInventory(inventory) {
  append(dom.summary, summaryCards(inventory));
  append(dom.sections, inventorySections(inventory));
  append(dom.sections, junkSections(inventory, { rootLabel: inventory.meta.rootLabel }));
}

function renderLinks(analysis) {
  append(dom.linkSummary, linkStatCards(analysis));
  append(dom.linkSections, linksSections(analysis));
}

function renderDeepScanPrompt() {
  if (!dom.linkSections) return;
  append(dom.linkSections, [
    el("div", { class: "alert alert-secondary d-flex justify-content-between align-items-center" }, [
      el("span", { text: "Run the deep scan to check for orphan pages, broken links and unused assets." }),
      el("button", { class: "btn btn-sm btn-success", text: "Run deep scan", onclick: () => runScan({ deep: true }) }),
    ]),
  ]);
}

function renderToc() {
  if (!dom.toc) return;
  const sections = [
    ...dom.sections.querySelectorAll(".rh-section"),
    ...dom.linkSections.querySelectorAll(".rh-section"),
  ];
  const links = sections.map((section) => {
    const title = section.querySelector(".rh-section__title")?.textContent || section.id;
    return el("a", { class: "rh-toc__link", href: `#${section.id}`, text: title });
  });
  clear(dom.toc);
  append(dom.toc, links);
  dom.toc.parentElement?.classList.toggle("d-none", !links.length);
}

/* ------------------------------------------------------------------ */
/* Report export                                                       */
/* ------------------------------------------------------------------ */

function buildReport() {
  const inventory = state.inventory;
  const analysis = state.analysis;
  if (!inventory) return "{}";
  const report = {
    generatedAt: new Date().toISOString(),
    root: inventory.meta.rootLabel,
    summary: inventory.summary,
    byType: inventory.byType,
    largestFiles: inventory.largest.map((f) => ({ path: f.path, size: f.size })),
    deleteCandidates: inventory.junkItems.map((i) => ({ path: i.path, size: i.size, category: i.category, severity: i.severity })),
    duplicates: inventory.duplicates.map((g) => ({ reason: g.reason, confidence: g.confidence, files: g.files.map((f) => f.path) })),
    linkHealth: analysis
      ? {
          stats: analysis.stats,
          orphans: analysis.orphans.map((o) => o.path),
          brokenLinks: analysis.brokenLinks,
          unusedAssets: analysis.unusedAssets.map((a) => ({ path: a.path, size: a.size })),
        }
      : null,
  };
  return JSON.stringify(report, null, 2);
}

function renderReportButton() {
  if (!dom.report) return;
  clear(dom.report);
  append(dom.report, [downloadButton(buildReport, "repo-health-report.json", "Download report (.json)")]);
}

/* ------------------------------------------------------------------ */
/* Wiring                                                              */
/* ------------------------------------------------------------------ */

dom.refresh?.addEventListener("click", () => runScan({ deep: Boolean(state.analysis) }));
dom.deepScan?.addEventListener("click", () => runScan({ deep: true }));
dom.rootSelect?.addEventListener("change", (event) => {
  state.rootKey = event.target.value;
  runScan({ deep: true });
});

runScan({ deep: true });
