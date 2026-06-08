const fs = require('fs');
const path = require('path');

const ROOT = process.cwd();
const PUBLIC = path.join(ROOT, 'backend', 'public');

const EXT_MAP = {
  '.html': '',
  '.css': 'css',
  '.js': 'js',
  '.png': 'images',
  '.jpg': 'images',
  '.jpeg': 'images',
  '.gif': 'images',
  '.svg': 'images',
  '.ico': 'icons',
  '.ttf': 'fonts',
  '.woff': 'fonts',
  '.woff2': 'fonts',
};

function ensureDir(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function moveFile(src, dest) {
  if (fs.existsSync(dest)) {
    console.log(`⚠️ Skipped (exists): ${dest}`);
    return;
  }

  ensureDir(path.dirname(dest));
  fs.renameSync(src, dest);
  console.log(`✅ Moved: ${src} → ${dest}`);
}

function updateHtml(htmlPath) {
  let html = fs.readFileSync(htmlPath, 'utf8');

  html = html
    .replace(/href="\.?\/?([^"]+\.css)"/g, 'href="/css/$1"')
    .replace(/src="\.?\/?([^"]+\.js)"/g, 'src="/js/$1"')
    .replace(/src="\.?\/?([^"]+\.(png|jpg|jpeg|gif|svg|ico))"/g, 'src="/images/$1"');

  fs.writeFileSync(htmlPath, html, 'utf8');
}

function walk(dir) {
  const files = fs.readdirSync(dir);

  for (const file of files) {
    const fullPath = path.join(dir, file);
    const relative = path.relative(ROOT, fullPath);

    if (
      relative.startsWith('node_modules') ||
      relative.startsWith('backend')
    ) {
      continue;
    }

    const stat = fs.statSync(fullPath);

    if (stat.isDirectory()) {
      walk(fullPath);
    } else {
      const ext = path.extname(file).toLowerCase();

      if (!EXT_MAP[ext]) continue;
      if (file === 'migrate-to-public.js') continue;

      const sub = EXT_MAP[ext];
      const dest = path.join(PUBLIC, sub, file);

      moveFile(fullPath, dest);

      if (ext === '.html') {
        updateHtml(dest);
      }
    }
  }
}

function run() {
  console.log('🚀 Starting migration...\n');
  ensureDir(PUBLIC);
  walk(ROOT);
  console.log('\n🎉 Migration complete!');
}

run();