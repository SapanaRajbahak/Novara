(function attachNovaraSession(global) {
  function resolveApiBaseUrl() {
    const explicitBase = global.localStorage && global.localStorage.getItem("Novara.apiBaseUrl");
    if (explicitBase) {
      try {
        const parsed = new URL(explicitBase);
        const location = global.location || {};
        const isLocalPage = location.protocol === "file:" || ["localhost", "127.0.0.1"].includes(location.hostname);
        const isExplicitLocal = ["localhost", "127.0.0.1"].includes(parsed.hostname);

        if (!isLocalPage || isExplicitLocal) {
          return explicitBase.replace(/\/$/, "");
        }
      } catch (error) {
        // Ignore invalid override and fall back to local default.
      }
    }

    const location = global.location || {};
    const isFileProtocol = location.protocol === "file:";
    const protocol = isFileProtocol ? "http:" : (location.protocol || "http:");
    const host = !isFileProtocol && location.hostname ? location.hostname : "localhost";
    return `${protocol}//${host}:5001`;
  }

  const API_BASE_URL = resolveApiBaseUrl();
  const DASHBOARD_PREFERENCE_KEY = "novara.preferredDashboard";
  const STORAGE_MIGRATION_MARKER_KEY = "novara.storageMigration.v1";
  const LEGACY_STORAGE_KEY_PAIRS = [
    ["novelread.bookmarks", "novara.bookmarks"],
    ["novelread.continueReading", "novara.continueReading"],
    ["novelread.reader.settings", "novara.reader.settings"],
    ["novelread.reader.progress", "novara.reader.progress"],
    ["novelread.reader.bookmarks", "novara.reader.bookmarks"],
    ["novelread.reader.notes", "novara.reader.notes"],
    ["novelread.reader.listenProgress", "novara.reader.listenProgress"],
    ["novelread.tts.voice", "novara.tts.voice"],
    ["novelread.postLoginRedirect", "novara.postLoginRedirect"],
    ["novelread.userId", "novara.userId"],
    ["novelread.savedBooks", "novara.savedBooks"],
    ["novelread.preferredDashboard", "novara.preferredDashboard"],
    ["novelread.admin.auth", "novara.admin.auth"],
    ["novelread.admin.uploadedBooks", "novara.admin.uploadedBooks"],
    ["novelread.admin.chapterDrafts", "novara.admin.chapterDrafts"],
    ["novelread.admin.aiDrafts", "novara.admin.aiDrafts"],
    ["novelread.admin.chapterEditorDrafts", "novara.admin.chapterEditorDrafts"],
    ["novelread.admin.settings", "novara.admin.settings"],
  ];
  const APP_ROUTES = {
    adminDashboard: "./admin.html",
    adminUpload: "./admin-upload.html",
    readerDashboard: "./reader-dashboard.html",
    writerDashboard: "./writer-dashboard.html",
    writerStudio: "./writer-stories-new.html",
  };

  const state = {
    loaded: false,
    user: null,
  };

  function getInitials(name) {
    const resolvedName = typeof name === "string" && name.trim() ? name.trim() : "Novara";
    return resolvedName
      .split(/\s+/)
      .map((part) => part[0])
      .slice(0, 2)
      .join("")
      .toUpperCase();
  }

  function getCurrentUser() {
    return state.user;
  }

  function canUseWriter(user = state.user) {
    return Boolean(user && user.role !== "ADMIN" && user.isWriter);
  }

  function canStartWriterJourney(user = state.user) {
    return Boolean(user && user.role !== "ADMIN" && !user.isWriter);
  }

  function getPreferredDashboard() {
    const storedValue = global.localStorage.getItem(DASHBOARD_PREFERENCE_KEY);
    return storedValue === "writer" ? "writer" : "reader";
  }

  function setPreferredDashboard(value) {
    const nextValue = value === "writer" ? "writer" : "reader";
    global.localStorage.setItem(DASHBOARD_PREFERENCE_KEY, nextValue);
    return nextValue;
  }

  function migrateLegacyLocalStorage() {
    if (!global.localStorage) {
      return;
    }

    if (global.localStorage.getItem(STORAGE_MIGRATION_MARKER_KEY)) {
      return;
    }

    LEGACY_STORAGE_KEY_PAIRS.forEach(([oldKey, newKey]) => {
      if (!global.localStorage.getItem(newKey) && global.localStorage.getItem(oldKey)) {
        global.localStorage.setItem(newKey, global.localStorage.getItem(oldKey));
      }
    });

    global.localStorage.setItem(STORAGE_MIGRATION_MARKER_KEY, "done");
  }

  async function fetchCurrentUser(force = false) {
    if (state.loaded && !force) {
      return state.user;
    }

    try {
      const response = await fetch(`${API_BASE_URL}/api/auth/me`, {
        cache: "no-store",
        credentials: "include",
      });

      if (!response.ok) {
        state.loaded = true;
        state.user = null;
        return null;
      }

      const payload = await response.json();
      state.loaded = true;
      state.user = payload && payload.success ? payload.user || null : null;
      return state.user;
    } catch (error) {
      state.loaded = true;
      state.user = null;
      return null;
    }
  }

  async function enableWriterAccess(profile) {
    const response = await fetch(`${API_BASE_URL}/api/auth/writer/onboarding`, {
      method: "POST",
      credentials: "include",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(profile),
    });

    const payload = await response.json().catch(() => ({
      success: false,
      error: "Unable to process writer onboarding",
    }));

    if (!response.ok || !payload.success) {
      throw new Error(payload.error || "Unable to enable writer access");
    }

    state.loaded = true;
    state.user = payload.user || null;
    setPreferredDashboard("writer");
    return state.user;
  }

  async function signOut(redirectTo = "./index.html") {
    try {
      await fetch(`${API_BASE_URL}/api/auth/signout`, {
        method: "POST",
        credentials: "include",
      });
    } catch (error) {
      // Continue local cleanup even if API is unavailable.
    }

    state.loaded = true;
    state.user = null;
    global.localStorage.removeItem("novara.admin.auth");
    global.localStorage.removeItem(DASHBOARD_PREFERENCE_KEY);
    global.location.href = redirectTo;
  }

  function renderDashboardSwitcher(container, options = {}) {
    if (!container) {
      return;
    }

    if (!canUseWriter()) {
      container.hidden = true;
      container.innerHTML = "";
      return;
    }

    const currentDashboard = options.currentDashboard === "writer" ? "writer" : "reader";
    const readerHref = options.readerHref || APP_ROUTES.readerDashboard;
    const writerHref = options.writerHref || APP_ROUTES.writerDashboard;

    container.hidden = false;
    container.innerHTML = `
      <div class="dashboard-switcher" role="group" aria-label="Dashboard switcher">
        <a class="dashboard-switcher__link ${currentDashboard === "reader" ? "is-active" : ""}" href="${readerHref}" data-dashboard-target="reader">Reader Dashboard</a>
        <a class="dashboard-switcher__link ${currentDashboard === "writer" ? "is-active" : ""}" href="${writerHref}" data-dashboard-target="writer">Writer Dashboard</a>
      </div>
    `;

    container.querySelectorAll("[data-dashboard-target]").forEach((link) => {
      link.addEventListener("click", () => {
        setPreferredDashboard(link.dataset.dashboardTarget);
      });
    });
  }

  function renderWriterJourneyCard(container, options = {}) {
    if (!container) {
      return;
    }

    const user = getCurrentUser();
    if (!user || user.role === "ADMIN") {
      container.hidden = true;
      container.innerHTML = "";
      return;
    }

    const writerHref = options.writerHref || APP_ROUTES.writerDashboard;
    const onboardingHref = options.onboardingHref || "writer-onboarding.html";
    const readerHref = options.readerHref || APP_ROUTES.readerDashboard;

    if (canUseWriter(user)) {
      container.hidden = false;
      container.innerHTML = `
        <div class="writer-cta-card">
          <p class="writer-cta-card__eyebrow">Writer Access Enabled</p>
          <h3>Switch between reading and writing with one account.</h3>
          <p>Your pen name is ready, your dashboard is live, and your reader profile stays unchanged.</p>
          <div class="writer-cta-card__actions">
            <a class="writer-cta-link" href="${writerHref}" data-dashboard-target="writer">Open Writer Dashboard</a>
            <a class="writer-cta-link writer-cta-link--secondary" href="${readerHref}" data-dashboard-target="reader">Stay in Reader Dashboard</a>
          </div>
        </div>
      `;
    } else if (canStartWriterJourney(user)) {
      container.hidden = false;
      container.innerHTML = `
        <div class="writer-cta-card">
          <p class="writer-cta-card__eyebrow">Creator Upgrade</p>
          <h3>Start Your Writer Journey</h3>
          <p>Unlock a dedicated author workspace, set your pen name, and keep reading without creating a separate account.</p>
          <div class="writer-cta-card__actions">
            <a class="writer-cta-link" href="${onboardingHref}">Start Your Writer Journey</a>
          </div>
        </div>
      `;
    } else {
      container.hidden = true;
      container.innerHTML = "";
      return;
    }

    container.querySelectorAll("[data-dashboard-target]").forEach((link) => {
      link.addEventListener("click", () => {
        setPreferredDashboard(link.dataset.dashboardTarget);
      });
    });
  }

  function showToast(message) {
    const toast = document.createElement("div");
    toast.className = "toast";
    toast.textContent = message;
    document.body.appendChild(toast);
    global.setTimeout(() => {
      toast.remove();
    }, 1700);
  }

  migrateLegacyLocalStorage();

  global.NovaraSession = {
    API_BASE_URL,
    APP_ROUTES,
    fetchCurrentUser,
    getCurrentUser,
    getInitials,
    canUseWriter,
    canStartWriterJourney,
    getPreferredDashboard,
    setPreferredDashboard,
    signOut,
    enableWriterAccess,
    showToast,
    renderDashboardSwitcher,
    renderWriterJourneyCard,
  };
})(window);