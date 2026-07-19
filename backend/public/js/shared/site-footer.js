(function initNovaraSiteFooter(global) {
  if (!global.document) return;

  global.NovaraLegalRoutes = {
    privacy: "/privacy/",
    terms: "/terms/",
    contact: "/contact/",
    community: "/community/",
  };

  if (global.document.querySelector("[data-novara-footer]")) {
    return;
  }

  const footer = global.document.createElement("footer");
  footer.className = "landing-footer landing-footer--legal";
  footer.setAttribute("data-novara-footer", "");
  footer.innerHTML = [
    '<div class="footer-brand">',
    '  <span class="brand-dot" aria-hidden="true"></span>',
    "  <span>Novara</span>",
    "</div>",
    '<nav class="footer-links" aria-label="Legal">',
    `  <a href="${global.NovaraLegalRoutes.community}">Community</a>`,
    `  <a href="${global.NovaraLegalRoutes.privacy}">Privacy</a>`,
    `  <a href="${global.NovaraLegalRoutes.terms}">Terms</a>`,
    `  <a href="${global.NovaraLegalRoutes.contact}">Contact</a>`,
    "</nav>",
  ].join("");

  global.document.body.appendChild(footer);
})(window);
