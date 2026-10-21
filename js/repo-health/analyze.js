// Turns a flat list of crawled files into the metrics the page reports on.
// Pure functions only — no DOM — so each piece is easy to test and reuse.

import { classifyJunk, similarityKey } from "./util.js";

/* Filenames that appear once per folder by convention and must never be
   treated as "duplicates" of each other just because the names match. */
const GENERIC_NAMES = new Set([
  "index", "readme", "style", "styles", "main", "app", "server", "todo",
  "config", "settings", "test", "tests", "package", "license", "robots",
]);

const LARGE_FILE = 4096;

/* ------------------------------------------------------------------ */
/* Inventory                                                           */
/* ------------------------------------------------------------------ */

export function buildInventory(files, dirs, meta = {}) {
  const byType = new Map();
  const byExtension = new Map();
  const byDir = new Map();
  const topLevel = new Map();

  let totalBytes = 0;

  for (const f of files) {
    const size = f.size || 0;
    totalBytes += size;

    bump(byType, f.type, size);
    bump(byExtension, f.ext || "(none)", size);

    const dirKey = f.dir || "(root)";
    bump(byDir, dirKey, size);

    const top = f.dir ? f.dir.split("/")[0] : "(root)";
    bump(topLevel, top, size);
  }

  const junkItems = [];
  for (const f of files) {
    const info = classifyJunk(f.path, f.size);
    if (info) junkItems.push({ path: f.path, url: f.url, size: f.size || 0, ...info });
  }
  junkItems.sort((a, b) => b.size - a.size);

  const groupMap = new Map();
  for (const item of junkItems) {
    const rec = groupMap.get(item.category) || { category: item.category, count: 0, bytes: 0, items: [] };
    rec.count += 1;
    rec.bytes += item.size;
    rec.items.push(item);
    groupMap.set(item.category, rec);
  }
  const junkGroups = Array.from(groupMap.values()).sort((a, b) => b.bytes - a.bytes || b.count - a.count);

  const junkTotals = junkItems.reduce(
    (acc, i) => {
      acc.count += 1;
      acc.bytes += i.size;
      if (i.severity === "safe") {
        acc.safeCount += 1;
        acc.safeBytes += i.size;
      } else {
        acc.reviewCount += 1;
        acc.reviewBytes += i.size;
      }
      return acc;
    },
    { count: 0, bytes: 0, safeCount: 0, safeBytes: 0, reviewCount: 0, reviewBytes: 0 },
  );

  const countWhere = (pred) => files.filter(pred).length;
  const bytesWhere = (pred) => files.filter(pred).reduce((n, f) => n + (f.size || 0), 0);

  const htmlFiles = files.filter((f) => f.ext === "html");
  const images = files.filter((f) => f.type === "Images");

  const summary = {
    fileCount: files.length,
    totalBytes,
    dirCount: dirs.length,
    htmlCount: htmlFiles.length,
    pdfCount: countWhere((f) => f.ext === "pdf"),
    pdfBytes: bytesWhere((f) => f.ext === "pdf"),
    imageCount: images.length,
    imageBytes: images.reduce((n, f) => n + (f.size || 0), 0),
    codeCount: countWhere((f) => ["js", "mjs", "css", "py", "ts"].includes(f.ext)),
    dataCount: countWhere((f) => ["csv", "json", "geojson", "xlsx", "xls"].includes(f.ext)),
    junkCount: junkTotals.count,
    junkBytes: junkTotals.bytes,
    safeJunkBytes: junkTotals.safeBytes,
  };

  const largest = files
    .filter((f) => f.size != null)
    .sort((a, b) => b.size - a.size)
    .slice(0, 40);

  const emptyFiles = files.filter((f) => f.size === 0);

  const thinPages = htmlFiles
    .filter((f) => f.size != null && f.size > 0 && f.size < 4000)
    .sort((a, b) => a.size - b.size);

  const dated = files.filter((f) => f.mtime).sort((a, b) => a.mtime - b.mtime);
  const oldest = dated.slice(0, 8);
  const newest = dated.slice(-8).reverse();

  return {
    files,
    dirs,
    meta,
    summary,
    byType: toSortedList(byType, totalBytes),
    byExtension: toSortedList(byExtension, totalBytes).slice(0, 24),
    byDirectory: Array.from(byDir.values()).sort((a, b) => b.bytes - a.bytes),
    topLevel: Array.from(topLevel.values()).sort((a, b) => b.bytes - a.bytes),
    junkItems,
    junkGroups,
    junkTotals,
    largest,
    emptyFiles,
    thinPages,
    duplicates: findDuplicateGroups(files),
    oldest,
    newest,
  };
}

function bump(map, key, size) {
  const rec = map.get(key) || { key, count: 0, bytes: 0 };
  rec.count += 1;
  rec.bytes += size;
  map.set(key, rec);
}

function toSortedList(map, totalBytes) {
  return Array.from(map.values())
    .map((r) => ({ ...r, pct: totalBytes ? (r.bytes / totalBytes) * 100 : 0 }))
    .sort((a, b) => b.bytes - a.bytes);
}

/* ------------------------------------------------------------------ */
/* Duplicate detection                                                 */
/* ------------------------------------------------------------------ */

export function findDuplicateGroups(files) {
  const groups = [];
  const claimed = new Set();

  const bySize = new Map();
  for (const f of files) {
    if (f.size == null || f.size < LARGE_FILE || !f.ext) continue;
    const key = `${f.ext}:${f.size}`;
    const list = bySize.get(key) || [];
    list.push(f);
    bySize.set(key, list);
  }
  for (const group of bySize.values()) {
    if (group.length < 2) continue;
    const nameKeys = new Set(group.map((f) => similarityKey(f.name)));
    groups.push({
      reason: "Identical byte size and file type",
      confidence: nameKeys.size === 1 ? "High" : "Medium",
      size: group[0].size,
      files: group.slice().sort((a, b) => a.path.localeCompare(b.path)),
    });
    for (const f of group) claimed.add(f.path);
  }

  const byName = new Map();
  for (const f of files) {
    if (!f.ext) continue;
    const key = similarityKey(f.name);
    if (!key || GENERIC_NAMES.has(key)) continue;
    const composite = `${f.ext}:${key}`;
    const list = byName.get(composite) || [];
    list.push(f);
    byName.set(composite, list);
  }
  for (const group of byName.values()) {
    if (group.length < 2) continue;
    if (group.every((f) => claimed.has(f.path))) continue;
    const sizes = new Set(group.map((f) => f.size));
    groups.push({
      reason: sizes.size === 1 ? "Matching name and size" : "Near-identical filenames",
      confidence: sizes.size === 1 ? "High" : "Medium",
      size: group[0].size,
      files: group.slice().sort((a, b) => a.path.localeCompare(b.path)),
    });
  }

  return groups.sort((a, b) => b.files.length - a.files.length);
}

/* ------------------------------------------------------------------ */
/* Cleanup script generation                                           */
/* ------------------------------------------------------------------ */

/* Group junk into __pycache__ directories and plain files, then build a
   ready-to-run script. `prefix` is prepended to every path (e.g. the repo
   folder name) so the commands work from the parent directory. */
export function buildCleanupScript(junkItems, prefix = "") {
  const dirsToRemove = new Set();
  const filesToRemove = [];
  for (const item of junkItems) {
    const idx = item.path.indexOf("__pycache__/");
    if (idx >= 0) dirsToRemove.add(item.path.slice(0, idx + "__pycache__".length));
    else filesToRemove.push(item.path);
  }

  const winQuote = (p) => `"${prefix}${p.split("/").join("\\")}"`;

  const windows = [
    "@echo off",
    "REM Generated by the repository-health page. Review before running.",
    "REM Removes regenerable caches, scratch files and other junk.",
    "",
    ...Array.from(dirsToRemove).sort().map((d) => `rd /s /q ${winQuote(d)}`),
    ...filesToRemove.slice().sort().map((f) => `del /f /q ${winQuote(f)}`),
    "",
    "echo Cleanup complete.",
  ].join("\r\n");

  const unix = [
    "#!/usr/bin/env bash",
    "# Generated by the repository-health page. Review before running.",
    "set -e",
    "",
    ...Array.from(dirsToRemove).sort().map((d) => `rm -rf "${prefix}${d}"`),
    ...filesToRemove.slice().sort().map((f) => `rm -f "${prefix}${f}"`),
    "",
    'echo "Cleanup complete."',
  ].join("\n");

  return { windows, unix, dirCount: dirsToRemove.size, fileCount: filesToRemove.length };
}
