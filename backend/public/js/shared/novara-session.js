(function attachNovaraSession(global) {
  const PROD_API_BASE_URL = "https://novara-6s67.onrender.com";
  const DEV_API_PORT = 5002;
  const DEV_API_BASE_URL = `http://localhost:${DEV_API_PORT}`;

  function resolveApiBaseUrl() {
    const configuredBase = global.APP_CONFIG && typeof global.APP_CONFIG.API_BASE_URL === "string"
      ? global.APP_CONFIG.API_BASE_URL.trim()
      : "";
    if (configuredBase) {
      return configuredBase.replace(/\/$/, "");
    }

    const explicitBase = global.localStorage
      && (global.localStorage.getItem("Novara.apiBaseUrl") || global.localStorage.getItem("novara.apiBaseUrl"));
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
    const isLocalHost = ["localhost", "127.0.0.1"].includes(location.hostname);
    if (isFileProtocol || isLocalHost) {
      return DEV_API_BASE_URL;
    }

    return location.origin || PROD_API_BASE_URL;
  }

  function getApiBaseCandidates() {
    const primaryBase = resolveApiBaseUrl();
    const candidates = [primaryBase];
    const location = global.location || {};
    const isLocalPage = location.protocol === "file:" || ["localhost", "127.0.0.1"].includes(location.hostname);

    if (isLocalPage && !candidates.includes(DEV_API_BASE_URL)) {
      candidates.push(DEV_API_BASE_URL);
    }

    if (!candidates.includes(PROD_API_BASE_URL)) {
      candidates.push(PROD_API_BASE_URL);
    }

    return candidates;
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
    adminDashboard: "/admin/admin.html",
    adminUpload: "/admin/admin-upload.html",
    readerDashboard: "/reader/reader-dashboard.html",
    writerDashboard: "/writer/writer-dashboard.html",
    writerStudio: "/writer/writer-stories-new.html",
  };

const state = {
  loaded: false,
  user: null,
};

  const SESSION_SNAPSHOT_KEY = "novara.sessionSnapshot";
  const READER_USER_PREFIX = "novara.reader.u.";

  /** Per-user reader localStorage segment (e.g. "settings", "progress"). */
  function readerDataKeyForUser(userId, segment) {
    const uid = userId && String(userId).trim() ? String(userId).trim() : "guest";
    return `${READER_USER_PREFIX}${uid}.${segment}`;
  }

  function readerDataKey(segment) {
    const id = state.user && state.user.id ? state.user.id : global.localStorage && global.localStorage.getItem("novara.userId");
    return readerDataKeyForUser(id || "guest", segment);
  }

  function getSessionSnapshot() {
    if (!global.localStorage) return null;
    try {
      const raw = global.localStorage.getItem(SESSION_SNAPSHOT_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch (e) {
      return null;
    }
  }

  function setSessionSnapshot(user) {
    if (!global.localStorage || !user || !user.id) return;
    const snap = {
      id: user.id,
      username: user.name || "",
      email: user.email || "",
      role: user.role || "USER",
      nickname: (user.writerProfile && user.writerProfile.penName) || user.name || "",
    };
    global.localStorage.setItem(SESSION_SNAPSHOT_KEY, JSON.stringify(snap));
    global.localStorage.setItem("novara.userId", String(user.id));
  }

  function clearSessionSnapshot() {
    if (!global.localStorage) return;
    global.localStorage.removeItem(SESSION_SNAPSHOT_KEY);
    global.localStorage.removeItem("novara.userId");
  }

  const LEGACY_READER_TO_SEGMENT = [
    ["novara.reader.settings", "settings"],
    ["novara.reader.progress", "progress"],
    ["novara.reader.bookmarks", "readerBookmarks"],
    ["novara.reader.notes", "notes"],
    ["novara.reader.listenProgress", "listenProgress"],
    ["novara.tts.voice", "ttsVoice"],
    ["novara.continueReading", "continueReading"],
    ["novara.bookmarks", "bookmarks"],
    ["novara.savedBooks", "savedBooks"],
    ["novara.favoriteBooks", "favoriteBookIds"],
    ["novara.audio.progress", "audioProgress"],
    ["novara.audio.bookmarks", "audioBookmarks"],
    ["novara.user.settings", "accountSettings"],
  ];

  /**
   * Copy legacy global reader keys into the guest bucket only (never into a real account),
   * so anonymous reading stays on-device without assigning shared cache to a signed-in user.
   */
  function primeGuestReaderScopedFromLegacy() {
    if (!global.localStorage) return;
    const guestId = "guest";
    LEGACY_READER_TO_SEGMENT.forEach(([legacyKey, segment]) => {
      const next = readerDataKeyForUser(guestId, segment);
      if (!global.localStorage.getItem(next) && global.localStorage.getItem(legacyKey)) {
        global.localStorage.setItem(next, global.localStorage.getItem(legacyKey));
      }
    });
  }

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
        clearSessionSnapshot();
        primeGuestReaderScopedFromLegacy();
        return null;
      }

      const payload = await response.json();
      state.loaded = true;
      state.user = payload && payload.success ? payload.user || null : null;
      if (state.user && state.user.id) {
        setSessionSnapshot(state.user);
      } else {
        clearSessionSnapshot();
        primeGuestReaderScopedFromLegacy();
      }
      return state.user;
    } catch (error) {
      state.loaded = true;
      state.user = null;
      clearSessionSnapshot();
      primeGuestReaderScopedFromLegacy();
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
    if (state.user && state.user.id) {
      setSessionSnapshot(state.user);
    }
    setPreferredDashboard("writer");
    return state.user;
  }

  async function signOut(redirectTo = "/index.html") {
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
    clearSessionSnapshot();
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
    const onboardingHref = options.onboardingHref || "/writer/writer-onboarding.html";
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
    PROD_API_BASE_URL,
    DEV_API_BASE_URL,
    resolveApiBaseUrl,
    getApiBaseCandidates,
    APP_ROUTES,
    fetchCurrentUser,
    getCurrentUser,
    getSessionSnapshot,
    readerDataKey,
    readerDataKeyForUser,
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