const fs = require("fs");
const path = require("path");

const PUBLIC = path.join(__dirname, "backend", "public");

function read(filePath) {
  return fs.readFileSync(filePath, "utf8");
}

function write(filePath, content) {
  fs.writeFileSync(filePath, content, "utf8");
}

function fixHtmlFile(filePath) {
  let html = read(filePath);
  const original = html;

  // Fix CSS paths to root-based
  html = html.replace(/href=["']\.?\/?css\/([^"']+)["']/g, 'href="/css/$1"');

  // Fix JS paths to root-based
  html = html.replace(/src=["']\.?\/?js\/([^"']+)["']/g, 'src="/js/$1"');

  // Fix assets paths to root-based
  html = html.replace(/src=["']\.?\/?assets\/([^"']+)["']/g, 'src="/assets/$1"');
  html = html.replace(/href=["']\.?\/?assets\/([^"']+)["']/g, 'href="/assets/$1"');

  // Fix direct shared files
  html = html.replace(/src=["']\.?\/?novara-session\.js[^"']*["']/g, 'src="/js/shared/novara-session.js"');
  html = html.replace(/src=["']\.?\/?landing\.js[^"']*["']/g, 'src="/js/shared/landing.js"');
  html = html.replace(/src=["']\.?\/?app\.js[^"']*["']/g, 'src="/js/shared/app.js"');

  // Fix direct shared css
  html = html.replace(/href=["']\.?\/?style\.css[^"']*["']/g, 'href="/css/shared/style.css"');
  html = html.replace(/href=["']\.?\/?landing\.css[^"']*["']/g, 'href="/css/shared/landing.css"');

  // Fix page links to root-based
  html = html.replace(/href=["'](admin[^"']*\.html)["']/g, 'href="/$1"');
  html = html.replace(/href=["'](reader[^"']*\.html)["']/g, 'href="/$1"');
  html = html.replace(/href=["'](writer[^"']*\.html)["']/g, 'href="/$1"');
  html = html.replace(/href=["']([a-zA-Z0-9_-]+\.html)["']/g, 'href="/$1"');

  if (html !== original) {
    write(filePath, html);
    console.log(`✔ Fixed HTML: ${path.relative(__dirname, filePath)}`);
  }
}

function fixJsFile(filePath) {
  let js = read(filePath);
  const original = js;

  // Fix redirects to root-based pages
  js = js.replace(/window\.location\.href\s*=\s*["']([a-zA-Z0-9/_-]+\.html[^"']*)["']/g, 'window.location.href = "/$1"');

  // Fix api fetch paths if written as api/...
  js = js.replace(/fetch\(["']api\//g, 'fetch("/api/');
  js = js.replace(/fetch\(["']\.\/api\//g, 'fetch("/api/');

  if (js !== original) {
    write(filePath, js);
    console.log(`✔ Fixed JS: ${path.relative(__dirname, filePath)}`);
  }
}

function walk(dir) {
  fs.readdirSync(dir).forEach((file) => {
    const fullPath = path.join(dir, file);
    const stat = fs.statSync(fullPath);

    if (stat.isDirectory()) {
      walk(fullPath);
    } else if (file.endsWith(".html")) {
      fixHtmlFile(fullPath);
    } else if (file.endsWith(".js")) {
      fixJsFile(fullPath);
    }
  });
}

if (!fs.existsSync(PUBLIC)) {
  console.error(`Folder not found: ${PUBLIC}`);
  process.exit(1);
}

walk(PUBLIC);
console.log("\nAll paths fixed.");