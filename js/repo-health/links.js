// Deep scan: fetch every HTML page, extract the links and asset references it
// makes, then answer the questions a maintainer actually cares about —
// which pages nothing points at, which links 404, and which assets are dead
// weight no page ever loads.

import { sameOriginPath, stripRoot, basename } from "./util.js";

const PAGE_CONCURRENCY = 8;

/* ------------------------------------------------------------------ */
/* Scanning                                                            */
/* ------------------------------------------------------------------ */

async function fetchText(url, signal) {
  try {
    const res = await fetch(url, { signal });
    if (!res.ok) return null;
    return await res.text();
  } catch {
    return null;
  }
}

function collectRefs(doc, pageUrl) {
  const links = new Set();
  const assets = new Set();
  let externals = 0;

  const record = (set, raw) => {
    const pathname = sameOriginPath(raw, pageUrl);
    if (pathname) {
      set.add(pathname);
      return;
    }
    if (raw && /^https?:\/\//i.test(raw.trim())) externals += 1;
  };

  for (const a of doc.querySelectorAll("a[href]")) record(links, a.getAttribute("href"));
  for (const n of doc.querySelectorAll("img[src]")) record(assets, n.getAttribute("src"));
  for (const n of doc.querySelectorAll("source[src]")) record(assets, n.getAttribute("src"));
  for (const n of doc.querySelectorAll("script[src]")) record(assets, n.getAttribute("src"));
  for (const n of doc.querySelectorAll("iframe[src]")) record(assets, n.getAttribute("src"));
  for (const n of doc.querySelectorAll("video[src],audio[src]")) record(assets, n.getAttribute("src"));
  for (const n of doc.querySelectorAll("link[href]")) record(assets, n.getAttribute("href"));

  return { links, assets, externals };
}

export async function scanPages(files, { rootPath, onProgress, signal } = {}) {
  const htmlFiles = files.filter((f) => f.ext === "html");
  const pages = new Map();
  let cursor = 0;
  let done = 0;

  async function worker() {
    while (cursor < htmlFiles.length && !signal?.aborted) {
      const file = htmlFiles[cursor++];
      const text = await fetchText(file.url, signal);
      if (text != null) {
        const doc = new DOMParser().parseFromString(text, "text/html");
        const { links, assets, externals } = collectRefs(doc, file.url);
        const bodyText = (doc.body?.textContent || "").replace(/\s+/g, " ").trim();
        pages.set(file.path, {
          path: file.path,
          title: (doc.title || "").trim(),
          headingCount: doc.querySelectorAll("h1, h2").length,
          hasH1: Boolean(doc.querySelector("h1")),
          textLength: bodyText.length,
          links: toRel(links, rootPath),
          assets: toRel(assets, rootPath),
          externals,
        });
      }
      done += 1;
      onProgress?.({ scanned: done, total: htmlFiles.length, current: file.path });
    }
  }

  await Promise.all(Array.from({ length: PAGE_CONCURRENCY }, worker));
  return { pages, total: htmlFiles.length, scanned: pages.size };
}

function toRel(absoluteSet, rootPath) {
  const out = new Set();
  for (const p of absoluteSet) {
    if (!p.startsWith(rootPath)) continue;
    out.add(stripRoot(p, rootPath));
  }
  return out;
}

/* ------------------------------------------------------------------ */
/* Analysis                                                            */
/* ------------------------------------------------------------------ */

export function analyzeLinks(files, dirs, scan) {
  const fileSet = new Set(files.map((f) => f.path));
  const dirSet = new Set(dirs.map((d) => d.replace(/\/+$/, "")));
  const htmlPaths = files.filter((f) => f.ext === "html").map((f) => f.path);
  const htmlSet = new Set(htmlPaths);

  const outgoing = new Map();     // page -> Set(target html)
  const incoming = new Map();     // target html -> Set(source page)
  const assetRefs = new Map();    // asset path -> Set(source page)
  const brokenLinks = [];
  const externalByPage = new Map();

  const addTo = (map, key, value) => {
    const set = map.get(key) || new Set();
    set.add(value);
    map.set(key, set);
  };

  /* A link may point at a page, a folder, or a folder's index. */
  function resolveTarget(rel) {
    if (!rel) return null;
    const clean = rel.replace(/\/+$/, "");
    if (fileSet.has(rel)) return rel;
    if (fileSet.has(clean)) return clean;
    if (dirSet.has(clean) || clean === "") {
      const indexRel = clean ? `${clean}/index.html` : "index.html";
      return fileSet.has(indexRel) ? indexRel : null;
    }
    return null;
  }

  for (const [page, info] of scan.pages) {
    outgoing.set(page, new Set());
    externalByPage.set(page, info.externals);
    for (const link of info.links) {
      const target = resolveTarget(link);
      if (target && htmlSet.has(target)) {
        addTo(outgoing, page, target);
        addTo(incoming, target, page);
      } else if (!target && !looksLikeAsset(link)) {
        brokenLinks.push({ source: page, target: link });
      }
    }
    for (const asset of info.assets) {
      if (fileSet.has(asset)) addTo(assetRefs, asset, page);
    }
  }

  const indexPage = htmlSet.has("index.html") ? "index.html" : null;

  /* Breadth-first reachability from the home page. */
  const reachable = new Set();
  if (indexPage) {
    const queue = [indexPage];
    reachable.add(indexPage);
    while (queue.length) {
      const current = queue.shift();
      for (const next of outgoing.get(current) || []) {
        if (!reachable.has(next)) {
          reachable.add(next);
          queue.push(next);
        }
      }
    }
  }

  const byPath = new Map(files.map((f) => [f.path, f]));

  const orphans = htmlPaths
    .filter((p) => p !== indexPage)
    .filter((p) => (incoming.get(p)?.size || 0) === 0)
    .map((p) => {
      const f = byPath.get(p);
      const info = scan.pages.get(p);
      return {
        path: p,
        size: f?.size ?? null,
        title: info?.title || "",
        linkedFromIndex: Boolean(indexPage && (outgoing.get(indexPage)?.has(p))),
        unreachable: !reachable.has(p),
      };
    })
    .sort((a, b) => (b.size || 0) - (a.size || 0));

  /* Pages that no other page links to AND that cannot be reached from home. */
  const unreachablePages = htmlPaths
    .filter((p) => p !== indexPage && !reachable.has(p))
    .map((p) => ({ path: p, size: byPath.get(p)?.size ?? null }))
    .sort((a, b) => (b.size || 0) - (a.size || 0));

  const unusedAssets = files
    .filter((f) => ["Images", "Stylesheets", "JavaScript"].includes(f.type))
    .filter((f) => (assetRefs.get(f.path)?.size || 0) === 0)
    .map((f) => ({ path: f.path, size: f.size ?? 0, type: f.type }))
    .sort((a, b) => b.size - a.size);

  const emptyPages = htmlPaths
    .map((p) => ({ path: p, info: scan.pages.get(p) }))
    .filter((r) => r.info && r.info.textLength < 200)
    .map((r) => ({ path: r.path, textLength: r.info.textLength, title: r.info.title }))
    .sort((a, b) => a.textLength - b.textLength);

  const noHeadingPages = htmlPaths
    .map((p) => ({ path: p, info: scan.pages.get(p) }))
    .filter((r) => r.info && !r.info.hasH1)
    .map((r) => ({ path: r.path, title: r.info.title }))
    .sort((a, b) => a.path.localeCompare(b.path));

  const deadEndPages = htmlPaths
    .filter((p) => (outgoing.get(p)?.size || 0) === 0)
    .map((p) => ({ path: p, size: byPath.get(p)?.size ?? null }))
    .sort((a, b) => (b.size || 0) - (a.size || 0));

  const stats = {
    pagesScanned: scan.scanned,
    pagesTotal: scan.total,
    totalLinks: Array.from(outgoing.values()).reduce((n, s) => n + s.size, 0),
    externalLinks: Array.from(externalByPage.values()).reduce((n, v) => n + v, 0),
    brokenCount: brokenLinks.length,
    orphanCount: orphans.length,
    unreachableCount: unreachablePages.length,
    unusedAssetCount: unusedAssets.length,
    emptyCount: emptyPages.length,
  };

  return {
    pages: scan.pages,
    outgoing,
    incoming,
    assetRefs,
    brokenLinks,
    orphans,
    unreachablePages,
    unusedAssets,
    emptyPages,
    noHeadingPages,
    deadEndPages,
    stats,
  };
}

/* Broken-link noise filter: skip obvious non-page references (images, css,
   downloads) so the list stays focused on real navigation breakage. */
function looksLikeAsset(rel) {
  const ext = basename(rel).split(".").pop()?.toLowerCase() || "";
  return ["png", "jpg", "jpeg", "gif", "svg", "webp", "css", "js", "pdf", "csv",
    "json", "ico", "mp4", "zip", "xlsx", "geojson", "woff", "woff2", "ttf"].includes(ext);
}
