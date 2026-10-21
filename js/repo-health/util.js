// Shared helpers for the repository-health analyser.
// Everything here is pure and DOM-free so it can be reused by any module.

/* Directories that are never worth crawling or reporting on. */
export const SKIP_DIRS = new Set([".git", "node_modules", ".vscode", ".idea"]);

/* Candidate directory names to probe when the crawl root serves index.html
   (a directory that contains an index cannot be listed by the dev server),
   so its children have to be discovered by name instead. */
export const PROBE_DIRS = [
  "pages", "css", "js", "data", "images", "market", "policy",
  "power-futures-lab-publications", "assets", "static", "fonts", "docs",
  "scripts", "scripts/tools", "img",
];

const BYTE_UNITS = ["B", "KB", "MB", "GB", "TB"];

export function formatBytes(bytes) {
  if (bytes == null || Number.isNaN(bytes)) return "—";
  if (bytes === 0) return "0 B";
  const i = Math.min(BYTE_UNITS.length - 1, Math.floor(Math.log(bytes) / Math.log(1024)));
  const value = bytes / Math.pow(1024, i);
  const digits = i === 0 ? 0 : value >= 100 ? 0 : value >= 10 ? 1 : 2;
  return `${value.toFixed(digits)} ${BYTE_UNITS[i]}`;
}

export function formatCount(n) {
  return n == null ? "—" : Number(n).toLocaleString("en-US");
}

export function formatDate(ms) {
  if (!ms) return "—";
  const d = new Date(ms);
  return d.toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });
}

export function daysSince(ms) {
  if (!ms) return null;
  return Math.floor((Date.now() - ms) / 86400000);
}

export function extensionOf(name) {
  const base = basename(name);
  const dot = base.lastIndexOf(".");
  if (dot <= 0) return "";
  return base.slice(dot + 1).toLowerCase();
}

export function basename(path) {
  const i = path.lastIndexOf("/");
  return i < 0 ? path : path.slice(i + 1);
}

export function dirname(path) {
  const i = path.lastIndexOf("/");
  return i < 0 ? "" : path.slice(0, i);
}

/* Strip a leading root prefix from an absolute server path, returning a
   repo-relative, human readable path (decoded). */
export function stripRoot(absPath, rootPath) {
  let p = decodeURIComponent(absPath);
  const root = decodeURIComponent(rootPath);
  if (p.startsWith(root)) p = p.slice(root.length);
  return p.replace(/^\/+/, "");
}

/* Rough "project depth" of a directory, used to keep nested noise separate. */
export function depthOf(relDir) {
  if (!relDir) return 0;
  return relDir.split("/").filter(Boolean).length;
}

const TYPE_BY_EXT = {
  html: "HTML pages", htm: "HTML pages",
  css: "Stylesheets", scss: "Stylesheets",
  js: "JavaScript", mjs: "JavaScript", cjs: "JavaScript", ts: "TypeScript",
  py: "Python", pyc: "Python bytecode", ipynb: "Notebooks",
  pdf: "PDF documents", doc: "Documents", docx: "Documents",
  xls: "Spreadsheets", xlsx: "Spreadsheets",
  csv: "Data (CSV)", json: "Data (JSON)", geojson: "Data (GeoJSON)",
  txt: "Text", md: "Markdown", rtf: "Text",
  jpg: "Images", jpeg: "Images", png: "Images", gif: "Images",
  svg: "Images", webp: "Images", bmp: "Images", ico: "Images", tif: "Images", tiff: "Images",
  mp4: "Media", mp3: "Media", wav: "Media", webm: "Media",
  zip: "Archives", gz: "Archives", tar: "Archives", "7z": "Archives", rar: "Archives",
  xml: "Data (XML)", yml: "Config", yaml: "Config", toml: "Config", ini: "Config", cfg: "Config",
  sh: "Scripts", bat: "Scripts", ps1: "Scripts",
};

export function typeOf(ext) {
  return TYPE_BY_EXT[ext] || (ext ? "Other" : "No extension");
}

export function isImageExt(ext) {
  return TYPE_BY_EXT[ext] === "Images";
}

export function isCodeExt(ext) {
  return ["js", "mjs", "cjs", "css", "scss", "py", "ts", "sh", "bat", "ps1"].includes(ext);
}

/* ------------------------------------------------------------------ */
/* Junk / delete-candidate classification                              */
/* ------------------------------------------------------------------ */

export const JUNK_LEGEND = [
  { category: "Python bytecode cache", note: "*.pyc and __pycache__/ — regenerated automatically, never commit." },
  { category: "Scratch / temp file", note: "Names starting with _tmp — throwaway probe scripts and their output." },
  { category: "OS junk", note: ".DS_Store, Thumbs.db, desktop.ini — created by the operating system." },
  { category: "Backup / editor leftovers", note: "*.bak, *.orig, *.old, *~, *.swp — safe to remove." },
  { category: "OS copy", note: "'Copy of …' duplicates created by the file manager." },
  { category: "Empty file", note: "0 bytes — placeholder with no content." },
  { category: "Stray script in root", note: "Python script loose in the project root instead of a module folder." },
];

const BACKUP_EXTS = new Set(["bak", "old", "orig", "tmp", "temp", "swp", "swo", "save"]);
const OS_JUNK = new Set([".ds_store", "thumbs.db", "desktop.ini", ".localized"]);
const GENERIC_SCRATCH = /^(untitled|new file|new text document|test|temp|tmp|scratch|copy)([ _-]?\d+)?\.[a-z0-9]+$/i;

/* Returns a descriptor {category, reason, severity} when the file looks
   disposable, otherwise null. severity: 'safe' | 'review'. */
export function classifyJunk(relPath, size) {
  const base = basename(relPath);
  const lower = base.toLowerCase();
  const ext = extensionOf(relPath);

  if (relPath.includes("__pycache__/") || ext === "pyc") {
    return {
      category: "Python bytecode cache",
      reason: "Compiled Python cache — regenerated automatically, never needed in the repo.",
      severity: "safe",
    };
  }
  if (/^_tmp/i.test(base) || /^_probe/i.test(base) || /(_out|_snapshot|_debug)\.(txt|json|log|csv)$/i.test(base)) {
    return {
      category: "Scratch / temp file",
      reason: "Name marks it as a scratch probe or its throwaway output.",
      severity: "safe",
    };
  }
  if ((ext === "txt" || ext === "log" || ext === "out") && /^_/.test(base)) {
    return {
      category: "Scratch / temp file",
      reason: "Underscore-prefixed scratch text/log output.",
      severity: "review",
    };
  }
  if (size === 0) {
    return {
      category: "Empty file",
      reason: "0 bytes — nothing but a placeholder.",
      severity: "review",
    };
  }
  if (BACKUP_EXTS.has(ext) || base.endsWith("~")) {
    return {
      category: "Backup / editor leftovers",
      reason: "Backup or editor swap file left behind.",
      severity: "safe",
    };
  }
  if (OS_JUNK.has(lower)) {
    return {
      category: "OS junk",
      reason: "Operating-system scratch file.",
      severity: "safe",
    };
  }
  if (/^copy( \d+)?( of )?/i.test(base) || / copy( \d+)?\.[a-z0-9]+$/i.test(base)) {
    return {
      category: "OS copy",
      reason: "Duplicate created by 'Copy' in the file manager.",
      severity: "review",
    };
  }
  if (GENERIC_SCRATCH.test(lower)) {
    return {
      category: "Scratch / temp file",
      reason: "Generic throwaway filename.",
      severity: "review",
    };
  }
  if (ext === "py" && dirname(relPath) === "" && base !== "server.py") {
    return {
      category: "Stray script in root",
      reason: "One-off Python script sitting in the root instead of a module folder.",
      severity: "review",
    };
  }
  return null;
}

/* ------------------------------------------------------------------ */
/* Duplicate-name helpers                                              */
/* ------------------------------------------------------------------ */

/* Normalise a filename for similarity: drop directories, extensions,
   trailing "(1)" counters and all punctuation. */
export function similarityKey(name) {
  return basename(name)
    .replace(/\.[a-z0-9]+$/i, "")
    .replace(/\(\d+\)/g, "")
    .replace(/[_\-\s]*\d+$/, "")
    .replace(/[^a-z0-9]/gi, "")
    .toLowerCase();
}

/* ------------------------------------------------------------------ */
/* Misc                                                                */
/* ------------------------------------------------------------------ */

export function clamp(n, min, max) {
  return Math.max(min, Math.min(max, n));
}

/* Turn a full URL string into an absolute pathname, or null when it is
   external / not a normal link. */
export function sameOriginPath(rawHref, baseUrl) {
  if (!rawHref) return null;
  const trimmed = rawHref.trim();
  if (!trimmed || trimmed.startsWith("#")) return null;
  if (/^(mailto:|tel:|javascript:|data:|blob:)/i.test(trimmed)) return null;
  let url;
  try {
    url = new URL(trimmed, baseUrl);
  } catch {
    return null;
  }
  if (url.origin !== new URL(baseUrl).origin) return null;
  url.hash = "";
  url.search = "";
  return url.pathname;
}
