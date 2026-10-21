// Live crawler for a statically served repository.
//
// The dev server (VS Code "Live Server", python -m http.server, ...) renders
// an HTML directory listing for any folder that does NOT contain an index
// file. Folders that DO contain one serve that page instead, so their children
// are discovered by probing a small set of conventional names and by reading
// the served page's own links.

import {
  SKIP_DIRS, PROBE_DIRS, stripRoot, basename, dirname,
  extensionOf, typeOf, sameOriginPath,
} from "./util.js";

const DIR_CONCURRENCY = 8;
const HEAD_CONCURRENCY = 12;

/* ------------------------------------------------------------------ */
/* Fetching                                                            */
/* ------------------------------------------------------------------ */

/* Classify what a directory URL actually returned. */
async function fetchDir(dirUrl, signal) {
  let res;
  try {
    res = await fetch(dirUrl.href, { signal });
  } catch {
    return { kind: "missing" };
  }
  if (!res.ok) return { kind: "missing" };
  const text = await res.text();
  if (/<title>\s*listing directory/i.test(text) || text.includes('id="files"')) {
    return { kind: "listing", html: text };
  }
  if (/<html[\s>]/i.test(text) || /<head[\s>]/i.test(text)) {
    return { kind: "page", html: text };
  }
  return { kind: "missing" };
}

/* ------------------------------------------------------------------ */
/* Listing parser                                                      */
/* ------------------------------------------------------------------ */

export function parseListing(html, dirUrl) {
  const doc = new DOMParser().parseFromString(html, "text/html");
  let anchors = Array.from(doc.querySelectorAll("#files li a"));
  if (!anchors.length) anchors = Array.from(doc.querySelectorAll("a[href]"));
  const entries = [];
  const origin = new URL(dirUrl).origin;

  for (const a of anchors) {
    const href = a.getAttribute("href");
    if (!href || href.startsWith("?") || href.startsWith("#")) continue;

    const nameSpan = a.querySelector(".name");
    const name = (nameSpan ? nameSpan.textContent : a.textContent).trim();
    if (!name || name === ".." || name === ".") continue;

    let url;
    try {
      url = new URL(href, dirUrl);
    } catch {
      continue;
    }
    if (url.origin !== origin) continue;
    url.hash = "";
    url.search = "";

    const cls = a.getAttribute("class") || "";
    const isDir = cls.includes("icon-directory") || name.endsWith("/") || url.pathname.endsWith("/");

    const sizeSpan = a.querySelector(".size");
    const dateSpan = a.querySelector(".date");
    const sizeText = sizeSpan ? sizeSpan.textContent.trim() : "";
    const size = /^\d+$/.test(sizeText) ? Number(sizeText) : null;
    let mtime = null;
    const dateText = dateSpan ? dateSpan.textContent.trim() : "";
    if (dateText) {
      const d = new Date(dateText);
      if (!Number.isNaN(d.getTime())) mtime = d.getTime();
    }

    entries.push({ name: name.replace(/\/+$/, ""), url, isDir, size, mtime });
  }
  return entries;
}

/* ------------------------------------------------------------------ */
/* Crawl                                                               */
/* ------------------------------------------------------------------ */

export async function crawl(rootUrl, { onProgress, signal } = {}) {
  const root = new URL(rootUrl, window.location.href);
  const rootPath = root.pathname;

  const files = new Map();    // repo-relative path -> file record
  const dirs = new Set();     // repo-relative directory paths
  const seenDirs = new Set(); // guards the queue
  const queue = [];

  let visited = 0;
  let active = 0;

  function urlForRel(rel) {
    return new URL(rel.split("/").map(encodeURIComponent).join("/"), root);
  }

  function addFile(rel, { url, size, mtime }) {
    if (!rel || files.has(rel)) return;
    const ext = extensionOf(rel);
    files.set(rel, {
      path: rel,
      url: url || urlForRel(rel).href,
      dir: dirname(rel),
      name: basename(rel),
      ext,
      type: typeOf(ext),
      size: size == null ? null : Number(size),
      mtime: mtime || null,
    });
  }

  function enqueueDir(rel) {
    const clean = (rel || "").replace(/\/+$/, "");
    if (SKIP_DIRS.has(basename(clean))) return;
    if (seenDirs.has(clean)) return;
    seenDirs.add(clean);
    queue.push(clean);
  }

  function applyListing(entries, dirRel) {
    for (const e of entries) {
      const childRel = dirRel ? `${dirRel}/${e.name}` : e.name;
      if (e.isDir) enqueueDir(childRel);
      else addFile(childRel, { url: e.url.href, size: e.size, mtime: e.mtime });
    }
  }

  /* Read a served page purely to discover sibling folders/files it links to. */
  function adoptPage(html, pageUrl) {
    const doc = new DOMParser().parseFromString(html, "text/html");
    const raw = [];
    for (const a of doc.querySelectorAll("a[href]")) raw.push(a.getAttribute("href"));
    for (const n of doc.querySelectorAll("img[src],script[src],link[href],source[src],iframe[src],video[src],audio[src]")) {
      raw.push(n.getAttribute("src") || n.getAttribute("href"));
    }
    for (const href of raw) {
      const pathname = sameOriginPath(href, pageUrl.href);
      if (!pathname || !pathname.startsWith(rootPath)) continue;
      const rel = stripRoot(pathname, rootPath);
      if (pathname.endsWith("/")) enqueueDir(rel);
      else addFile(rel, { url: new URL(pathname, root).href, size: null, mtime: null });
    }
  }

  async function processDir(rel) {
    const dirUrl = rel ? new URL(`${rel}/`, root) : root;
    const result = await fetchDir(dirUrl, signal);
    if (result.kind === "listing") {
      if (rel) dirs.add(rel);
      applyListing(parseListing(result.html, dirUrl.href), rel);
    } else if (result.kind === "page") {
      if (rel) dirs.add(rel);
      addFile(rel ? `${rel}/index.html` : "index.html", {
        url: dirUrl.href, size: result.html.length, mtime: null,
      });
      adoptPage(result.html, dirUrl);
    }
    visited += 1;
    onProgress?.({ dirsVisited: visited, filesFound: files.size, current: rel || "." });
  }

  /* Seed: crawl the root, filling the queue synchronously before pumping. */
  const rootResult = await fetchDir(root, signal);
  if (rootResult.kind === "listing") {
    applyListing(parseListing(rootResult.html, root.href), "");
    visited += 1;
  } else {
    addFile("index.html", {
      url: root.href, size: rootResult.html ? rootResult.html.length : null, mtime: null,
    });
    if (rootResult.html) adoptPage(rootResult.html, root);
    for (const name of PROBE_DIRS) enqueueDir(name);
  }

  await new Promise((resolve) => {
    function pump() {
      if (signal?.aborted) return resolve();
      while (active < DIR_CONCURRENCY && queue.length) {
        const rel = queue.shift();
        active += 1;
        processDir(rel)
          .catch(() => {})
          .finally(() => { active -= 1; pump(); });
      }
      if (active === 0 && queue.length === 0) resolve();
    }
    pump();
  });

  await fillMissingSizes(files, signal);

  return {
    files: Array.from(files.values()),
    dirs: Array.from(dirs),
    rootPath,
    rootUrl: root.href,
    dirsVisited: visited,
  };
}

/* HEAD every file whose size the server did not report (python's listing). */
async function fillMissingSizes(files, signal) {
  const pending = Array.from(files.values()).filter((f) => f.size == null);
  let cursor = 0;
  async function worker() {
    while (cursor < pending.length && !signal?.aborted) {
      const file = pending[cursor++];
      try {
        const res = await fetch(file.url, { method: "HEAD", signal });
        if (res.ok) {
          const len = Number(res.headers.get("Content-Length"));
          if (!Number.isNaN(len)) file.size = len;
          const last = res.headers.get("Last-Modified");
          if (last) {
            const d = new Date(last);
            if (!Number.isNaN(d.getTime())) file.mtime = d.getTime();
          }
        }
      } catch {
        /* leave size as null */
      }
    }
  }
  await Promise.all(Array.from({ length: HEAD_CONCURRENCY }, worker));
}
