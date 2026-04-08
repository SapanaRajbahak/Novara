// migrate-to-public.js
// This script moves all HTML, CSS, JS, and asset files into a public/ directory with proper subfolders, and updates HTML references.
// Run with: node migrate-to-public.js

const fs = require('fs');
const path = require('path');

const ROOT = process.cwd();
const PUBLIC = path.join(ROOT, 'public');

const FOLDERS = {
  html: '',
  css: 'css',
  js: 'js',
  images: 'images',
  fonts: 'fonts',
  icons: 'icons',
};

const EXT_MAP = {
  '.html': 'html',
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

function ensureDirSync(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function moveFile(src, dest) {
  ensureDirSync(path.dirname(dest));
  fs.renameSync(src, dest);
}

function updateHtmlReferences(htmlPath) {
  let html = fs.readFileSync(htmlPath, 'utf8');
  html = html.replace(/href="([^"]+\.css)"/g, 'href="/css/$1"');
  html = html.replace(/src="([^"]+\.js)"/g, 'src="/js/$1"');
  html = html.replace(/src="([^"]+\.(png|jpg|jpeg|gif|svg|ico))"/g, 'src="/images/$1"');
  fs.writeFileSync(htmlPath, html, 'utf8');
}

function migrate() {
  ensureDirSync(PUBLIC);
  Object.values(FOLDERS).forEach(sub => {
    if (sub) ensureDirSync(path.join(PUBLIC, sub));
  });

  const files = fs.readdirSync(ROOT);
  files.forEach(file => {
    const ext = path.extname(file).toLowerCase();
    if (EXT_MAP[ext]) {
      const sub = FOLDERS[EXT_MAP[ext]];
      const dest = path.join(PUBLIC, sub, file);
      moveFile(path.join(ROOT, file), dest);
      if (ext === '.html') updateHtmlReferences(dest);
    }
  });
}

migrate();

console.log('Migration complete. All static files moved to public/.');
