(function initLegalNavigation(global) {
  const doc = global.document;
  if (!doc) return;

  const routes = global.NovaraLegalRoutes || {
    privacy: "/privacy/",
    terms: "/terms/",
    contact: "/contact/",
  };

  const currentPath = (global.location.pathname || "").replace(/\/index\.html$/i, "/").replace(/\/?$/, "");

  doc.querySelectorAll(".legal-header-nav a").forEach((link) => {
    const href = (link.getAttribute("href") || "").replace(/\/index\.html$/i, "/").replace(/\/?$/, "");
    const isActive = currentPath === href;
    link.classList.toggle("active", isActive);
    if (isActive) {
      link.setAttribute("aria-current", "page");
    } else {
      link.removeAttribute("aria-current");
    }
  });

  const tocLinks = Array.from(doc.querySelectorAll(".legal-toc a[href^='#']"));
  const sections = tocLinks
    .map((link) => {
      const id = link.getAttribute("href").slice(1);
      return doc.getElementById(id);
    })
    .filter(Boolean);

  if (!sections.length) return;

  function setActiveToc(id) {
    tocLinks.forEach((link) => {
      const match = link.getAttribute("href") === `#${id}`;
      link.classList.toggle("is-active", match);
      if (match) {
        link.setAttribute("aria-current", "true");
      } else {
        link.removeAttribute("aria-current");
      }
    });
  }

  const observer = new IntersectionObserver(
    (entries) => {
      const visible = entries
        .filter((entry) => entry.isIntersecting)
        .sort((a, b) => b.intersectionRatio - a.intersectionRatio);
      if (visible[0]) {
        setActiveToc(visible[0].target.id);
      }
    },
    {
      rootMargin: "-20% 0px -55% 0px",
      threshold: [0, 0.15, 0.4, 0.7],
    }
  );

  sections.forEach((section) => observer.observe(section));

  tocLinks.forEach((link) => {
    link.addEventListener("click", (event) => {
      const id = link.getAttribute("href").slice(1);
      const target = doc.getElementById(id);
      if (!target) return;
      event.preventDefault();
      target.scrollIntoView({ behavior: "smooth", block: "start" });
      setActiveToc(id);
    });
  });
})(window);
