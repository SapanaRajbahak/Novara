// migrate-novara-structure-safe.js
// Run with: node migrate-novara-structure-safe.js
//
// What it does:
// - Recursively scans your project for frontend files
// - Moves HTML/CSS/JS into backend/public role-based folders
// - Moves assets into backend/public/assets/{images|icons|logos}
// - Updates HTML asset references to root-based paths
// - Skips backend logic folders and important backend files
// - Prints moved / skipped / ambiguous reports
//
// IMPORTANT:
// 1. Commit your project to git first before running.
// 2. Review the "ambiguous" report after running.
// 3. Test page by page after migration.

const fs = require("fs");
const path = require("path");

const ROOT = process.cwd();
const BACKEND = path.join(ROOT, "backend");
const PUBLIC = path.join(BACKEND, "public");

const DEST = {
  rootHtml: PUBLIC,

  admin: {
    html: path.join(PUBLIC, "admin"),
    css: path.join(PUBLIC, "css", "admin"),
    js: path.join(PUBLIC, "js", "admin"),
  },
  reader: {
    html: path.join(PUBLIC, "reader"),
    css: path.join(PUBLIC, "css", "reader"),
    js: path.join(PUBLIC, "js", "reader"),
  },
  writer: {
    html: path.join(PUBLIC, "writer"),
    css: path.join(PUBLIC, "css", "writer"),
    js: path.join(PUBLIC, "js", "writer"),
  },
  auth: {
    html: path.join(PUBLIC, "auth"),
    css: path.join(PUBLIC, "css", "shared"),
    js: path.join(PUBLIC, "js", "shared"),
  },
  shared: {
    css: path.join(PUBLIC, "css", "shared"),
    js: path.join(PUBLIC, "js", "shared"),
  },
  assets: {
    images: path.join(PUBLIC, "assets", "images"),
    icons: path.join(PUBLIC, "assets", "icons"),
    logos: path.join(PUBLIC, "assets", "logos"),
  },
};

const moved = [];
const skipped = [];
const ambiguous = [];
const errors = [];

const FRONTEND_EXTENSIONS = new Set([
  ".html",
  ".css",
  ".js",
  ".png",
  ".jpg",
  ".jpeg",
  ".gif",
  ".svg",
  ".webp",
  ".ico",
]);

const SKIP_DIRS = new Set([
  ".git",
  "node_modules",
  "dist",
  "build",
  ".next",
  ".turbo",
  ".vscode",
]);

const BACKEND_LOGIC_DIRS = new Set([
  path.normalize(path.join("backend", "config")),
  path.normalize(path.join("backend", "controllers")),
  path.normalize(path.join("backend", "middleware")),
  path.normalize(path.join("backend", "models")),
  path.normalize(path.join("backend", "prisma")),
  path.normalize(path.join("backend", "routes")),
  path.normalize(path.join("backend", "scripts")),
  path.normalize(path.join("backend", "services")),
  path.normalize(path.join("backend", "utils")),
  path.normalize(path.join("backend", "validators")),
]);

const SKIP_FILES = new Set([
  "server.js",
  "migrate-novara-structure.js",
  "migrate-novara-structure-safe.js",
  "automate-restructure.js",
  "migrate-to-public.js",
  "docker-compose.yml",
  "package.json",
  "package-lock.json",
  ".env",
  ".env.example",
  "README.md",
  ".gitignore",
  "local_dump.sql",
]);

const SHARED_CSS = new Set([
  "style.css",
  "landing.css",
]);

const SHARED_JS = new Set([
  "app.js",
  "config.js",
  "novara-session.js",
  "landing.js",
]);

const ADMIN_PATTERNS = [
  /^admin-/i,
  /^admin$/i,
  /^admin[a-z0-9-]*$/i,
];

const READER_PATTERNS = [
  /^reader-/i,
  /^reader$/i,
  /^library/i,
  /^discover/i,
  /^audiobook/i,
  /^annotations/i,
  /^profile/i,
  /^settings/i,
  /^book/i,
];

const WRITER_PATTERNS = [
  /^writer-/i,
  /^writer$/i,
];

const AUTH_PATTERNS = [
  /^check-email/i,
  /^verification-/i,
  /^login/i,
  /^signup/i,
  /^register/i,
  /^forgot-password/i,
  /^reset-password/i,
];

function ensureDir(dir) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

function normalizeRel(absPath) {
  return path.normalize(path.relative(ROOT, absPath));
}

function isInside(dirRelPath, candidateRelPath) {
  return candidateRelPath === dirRelPath || candidateRelPath.startsWith(dirRelPath + path.sep);
}

function shouldSkipPath(absPath) {
  const rel = normalizeRel(absPath);
  const parts = rel.split(path.sep);

  if (parts.some((p) => SKIP_DIRS.has(p))) return true;

  for (const logicDir of BACKEND_LOGIC_DIRS) {
    if (isInside(logicDir, rel)) return true;
  }

  // Never reprocess things already in backend/public
  if (isInside(path.normalize(path.join("backend", "public")), rel)) return true;

  return false;
}

function walk(dir) {
  let results = [];
  let entries = [];

  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch (err) {
    errors.push({ file: dir, reason: `Failed to read directory: ${err.message}` });
    return results;
  }

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);

    if (shouldSkipPath(fullPath)) continue;

    if (entry.isDirectory()) {
      results = results.concat(walk(fullPath));
    } else if (entry.isFile()) {
      const ext = path.extname(entry.name).toLowerCase();
      if (FRONTEND_EXTENSIONS.has(ext) && !SKIP_FILES.has(entry.name)) {
        results.push(fullPath);
      }
    }
  }

  return results;
}

function detectRoleFromName(baseName, ext) {
  const lower = baseName.toLowerCase();

  if (lower === "index.html") {
    return { role: "root", type: "html" };
  }

  if (ext === ".css" && SHARED_CSS.has(lower)) {
    return { role: "shared", type: "css" };
  }

  if (ext === ".js" && SHARED_JS.has(lower)) {
    return { role: "shared", type: "js" };
  }

  if (ADMIN_PATTERNS.some((r) => r.test(baseName))) {
    return { role: "admin" };
  }

  if (READER_PATTERNS.some((r) => r.test(baseName))) {
    return { role: "reader" };
  }

  if (WRITER_PATTERNS.some((r) => r.test(baseName))) {
    return { role: "writer" };
  }

  if (AUTH_PATTERNS.some((r) => r.test(baseName))) {
    return { role: "auth" };
  }

  return null;
}

function detectAssetBucket(baseName, sourcePath) {
  const lower = baseName.toLowerCase();
  const rel = normalizeRel(sourcePath).toLowerCase();

  if (
    lower.includes("logo") ||
    rel.includes("logo") ||
    rel.includes(path.sep + "logos" + path.sep)
  ) {
    return "logos";
  }

  if (
    path.extname(lower) === ".ico" ||
    lower.includes("icon") ||
    rel.includes("icon") ||
    rel.includes(path.sep + "icons" + path.sep)
  ) {
    return "icons";
  }

  return "images";
}

function getDestination(absPath) {
  const base = path.basename(absPath);
  const ext = path.extname(base).toLowerCase();

  if ([".png", ".jpg", ".jpeg", ".gif", ".svg", ".webp", ".ico"].includes(ext)) {
    const bucket = detectAssetBucket(base, absPath);
    return {
      kind: "asset",
      role: bucket,
      dest: path.join(DEST.assets[bucket], base),
    };
  }

  const result = detectRoleFromName(base, ext);
  if (!result) return null;

  if (result.role === "root" && ext === ".html") {
    return {
      kind: "html",
      role: "root",
      dest: path.join(DEST.rootHtml, base),
    };
  }

  if (ext === ".html") {
    return {
      kind: "html",
      role: result.role,
      dest: path.join(DEST[result.role].html, base),
    };
  }

  if (ext === ".css") {
    const bucket = result.role === "shared" ? DEST.shared.css : DEST[result.role].css;
    return {
      kind: "css",
      role: result.role,
      dest: path.join(bucket, base),
    };
  }

  if (ext === ".js") {
    const bucket = result.role === "shared" ? DEST.shared.js : DEST[result.role].js;
    return {
      kind: "js",
      role: result.role,
      dest: path.join(bucket, base),
    };
  }

  return null;
}

function moveFile(src, dest) {
  try {
    ensureDir(path.dirname(dest));

    if (fs.existsSync(dest)) {
      skipped.push({
        src,
        dest,
        reason: "Destination file already exists",
      });
      return false;
    }

    fs.renameSync(src, dest);
    moved.push({ src, dest });
    return true;
  } catch (err) {
    errors.push({
      file: src,
      reason: `Move failed: ${err.message}`,
    });
    return false;
  }
}

function buildCssPath(fileName, htmlRole) {
  const lower = fileName.toLowerCase();

  if (SHARED_CSS.has(lower)) return `/css/shared/${fileName}`;
  if (htmlRole === "admin") return `/css/admin/${fileName}`;
  if (htmlRole === "reader") return `/css/reader/${fileName}`;
  if (htmlRole === "writer") return `/css/writer/${fileName}`;
  if (htmlRole === "auth") return `/css/shared/${fileName}`;

  // for root/index.html, prefer shared
  return `/css/shared/${fileName}`;
}

function buildJsPath(fileName, htmlRole) {
  const lower = fileName.toLowerCase();

  if (SHARED_JS.has(lower)) return `/js/shared/${fileName}`;
  if (htmlRole === "admin") return `/js/admin/${fileName}`;
  if (htmlRole === "reader") return `/js/reader/${fileName}`;
  if (htmlRole === "writer") return `/js/writer/${fileName}`;
  if (htmlRole === "auth") return `/js/shared/${fileName}`;

  // for root/index.html, prefer shared
  return `/js/shared/${fileName}`;
}

function buildAssetPath(fileName) {
  const bucket = detectAssetBucket(fileName, fileName);
  return `/assets/${bucket}/${fileName}`;
}

function updateHtmlPaths(filePath, htmlRole) {
  try {
    let html = fs.readFileSync(filePath, "utf8");

    // href for CSS files
    html = html.replace(
      /href=(["'])(?!https?:\/\/|\/\/|\/|#)([^"'\/]+\.css)\1/gi,
      (_, quote, fileName) => `href=${quote}${buildCssPath(fileName, htmlRole)}${quote}`
    );

    // src for JS files
    html = html.replace(
      /src=(["'])(?!https?:\/\/|\/\/|\/)([^"'\/]+\.js)\1/gi,
      (_, quote, fileName) => `src=${quote}${buildJsPath(fileName, htmlRole)}${quote}`
    );

    // src for image files
    html = html.replace(
      /src=(["'])(?!https?:\/\/|\/\/|\/)([^"'\/]+\.(png|jpg|jpeg|gif|svg|webp|ico))\1/gi,
      (_, quote, fileName) => `src=${quote}${buildAssetPath(fileName)}${quote}`
    );

    // href for favicon/icons/images
    html = html.replace(
      /href=(["'])(?!https?:\/\/|\/\/|\/|#)([^"'\/]+\.(png|jpg|jpeg|gif|svg|webp|ico))\1/gi,
      (_, quote, fileName) => `href=${quote}${buildAssetPath(fileName)}${quote}`
    );

    fs.writeFileSync(filePath, html, "utf8");
  } catch (err) {
    errors.push({
      file: filePath,
      reason: `Failed to update HTML paths: ${err.message}`,
    });
  }
}

function migrateFiles() {
  const files = walk(ROOT);

  for (const src of files) {
    const plan = getDestination(src);

    if (!plan) {
      ambiguous.push(src);
      continue;
    }

    const movedOk = moveFile(src, plan.dest);

    if (movedOk && plan.kind === "html") {
      updateHtmlPaths(plan.dest, plan.role);
    }
  }
}

function printSection(title, items, formatter) {
  console.log(`\n${title}`);
  if (!items.length) {
    console.log("  (none)");
    return;
  }
  for (const item of items) {
    console.log(formatter(item));
  }
}

function printReport() {
  console.log("\n================ MIGRATION REPORT ================\n");

  printSection("Moved files:", moved, ({ src, dest }) => `✔ ${src} -> ${dest}`);

  printSection(
    "Skipped files:",
    skipped,
    ({ src, dest, reason }) => `⚠ ${src} -> ${dest} (${reason})`
  );

  printSection(
    "Ambiguous files (manual review needed):",
    ambiguous,
    (file) => `❓ ${file}`
  );

  printSection(
    "Errors:",
    errors,
    ({ file, reason }) => `✖ ${file} (${reason})`
  );

  console.log("\n================ END OF REPORT ==================\n");
}

function ensureBaseFolders() {
  ensureDir(DEST.rootHtml);

  ensureDir(DEST.admin.html);
  ensureDir(DEST.admin.css);
  ensureDir(DEST.admin.js);

  ensureDir(DEST.reader.html);
  ensureDir(DEST.reader.css);
  ensureDir(DEST.reader.js);

  ensureDir(DEST.writer.html);
  ensureDir(DEST.writer.css);
  ensureDir(DEST.writer.js);

  ensureDir(DEST.auth.html);
  ensureDir(DEST.shared.css);
  ensureDir(DEST.shared.js);

  ensureDir(DEST.assets.images);
  ensureDir(DEST.assets.icons);
  ensureDir(DEST.assets.logos);
}

function main() {
  console.log("Starting safe Novara migration...\n");
  ensureBaseFolders();
  migrateFiles();
  printReport();
}

main();