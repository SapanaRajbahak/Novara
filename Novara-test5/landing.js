const genres = [
  "Romance",
  "Fantasy",
  "Mystery",
  "Thriller",
  "Sci-Fi",
  "Historical",
  "Drama",
  "Action",
];

const API_BASE_URL = `${window.location.protocol}//${window.location.hostname || "localhost"}:5001`;

const elements = {
  featuredStoriesGrid: document.getElementById("featuredStoriesGrid"),
  genreGrid: document.getElementById("genreGrid"),
  chapterPreviewModal: document.getElementById("chapterPreviewModal"),
  chapterPreviewTitle: document.getElementById("chapterPreviewTitle"),
  chapterPreviewMeta: document.getElementById("chapterPreviewMeta"),
  chapterPreviewBody: document.getElementById("chapterPreviewBody"),
  lockedChapterPrompt: document.getElementById("lockedChapterPrompt"),
  authModal: document.getElementById("authModal"),
  authMessage: document.getElementById("authMessage"),
  featuredSyncMessage: document.getElementById("featuredSyncMessage"),
  signinForm: document.getElementById("signinForm"),
  signupForm: document.getElementById("signupForm"),
  startWriterJourneyBtn: document.getElementById("startWriterJourneyBtn"),
  writerCtaBtn: document.getElementById("writerCtaBtn"),
  startReadingBtn: document.getElementById("startReadingBtn"),
};

const authTabs = Array.from(document.querySelectorAll(".auth-tab"));
let pendingRedirect = "reader-dashboard.html";
let currentUser = null;
let featuredStories = [];
let featuredSource = "empty";
const previewCache = new Map();

function getLocalUploadedBooks() {
  try {
    const parsed = JSON.parse(localStorage.getItem("novelread.admin.uploadedBooks") || "[]");
    return Array.isArray(parsed) ? parsed : [];
  } catch (error) {
    return [];
  }
}

function setFeaturedSyncMessage(message, tone) {
  if (!elements.featuredSyncMessage) {
    return;
  }

  if (!message) {
    elements.featuredSyncMessage.hidden = true;
    elements.featuredSyncMessage.className = "sync-message";
    elements.featuredSyncMessage.textContent = "";
    return;
  }

  elements.featuredSyncMessage.hidden = false;
  elements.featuredSyncMessage.className = `sync-message${tone ? ` ${tone}` : ""}`;
  elements.featuredSyncMessage.textContent = message;
}

function createCoverSvg(title, genre) {
  const initials = title
    .split(" ")
    .map((word) => word[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();

  const palette = {
    Romance: ["#6a3047", "#bf6e91"],
    Fantasy: ["#553458", "#9d6aa6"],
    Mystery: ["#23323f", "#46667b"],
    Thriller: ["#3f2a1b", "#ab6a3a"],
    "Sci-Fi": ["#1f3d55", "#53a2d8"],
    Historical: ["#4f412d", "#a58a5a"],
    Drama: ["#3f3348", "#8672a1"],
    Action: ["#2b4337", "#5f9267"],
    default: ["#2d3b3a", "#608982"],
  };

  const [c1, c2] = palette[genre] || palette.default;
  const svg = `<svg xmlns='http://www.w3.org/2000/svg' width='300' height='400'>
    <defs>
      <linearGradient id='g' x1='0' x2='1' y1='0' y2='1'>
        <stop offset='0%' stop-color='${c1}'/>
        <stop offset='100%' stop-color='${c2}'/>
      </linearGradient>
    </defs>
    <rect width='100%' height='100%' rx='22' fill='url(#g)'/>
    <rect x='22' y='24' width='256' height='352' rx='16' fill='rgba(255,255,255,0.10)'/>
    <text x='50%' y='55%' dominant-baseline='middle' text-anchor='middle' fill='rgba(255,255,255,0.9)' font-family='Arial' font-size='62' font-weight='700'>${initials}</text>
  </svg>`;

  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

function setAuthMessage(message, tone) {
  elements.authMessage.textContent = message;
  elements.authMessage.className = `auth-message${tone ? ` ${tone}` : ""}`;
}

function setAuthTab(mode) {
  const normalizedMode = mode === "signup" ? "signup" : "signin";
  authTabs.forEach((tab) => {
    tab.classList.toggle("active", tab.dataset.authTab === normalizedMode);
  });
  elements.signinForm.hidden = normalizedMode !== "signin";
  elements.signupForm.hidden = normalizedMode !== "signup";
  setAuthMessage("", "");
}

function openModal(modal) {
  if (modal) {
    modal.hidden = false;
  }
}

function closeModal(modal) {
  if (modal) {
    modal.hidden = true;
  }
}

function openAuthModal(mode, redirectTo) {
  if (redirectTo) {
    pendingRedirect = redirectTo;
  }
  setAuthTab(mode);
  openModal(elements.authModal);
}

function extractPreviewText(content, fallback) {
  if (!content || typeof content !== "string") {
    return fallback || "Preview unavailable for this story right now.";
  }

  const normalized = content
    .replace(/\s+/g, " ")
    .replace(/CHAPTER\s+[0-9IVXLCDM]+\.?/gi, "")
    .trim();

  if (!normalized) {
    return fallback || "Preview unavailable for this story right now.";
  }

  if (normalized.length <= 900) {
    return normalized;
  }

  return `${normalized.slice(0, 900).trim()}...`;
}

async function fetchLiveStories() {
  function normalizeStories(books) {
    return books.map((book, index) => ({
      id: book.id || `story-${index + 1}`,
      title: book.title || "Untitled",
      author: book.authorName || book.author || "Unknown Author",
      genre: book.genre || "General",
      description: book.description || "No description available yet.",
    }));
  }

  try {
    const response = await fetch(`${API_BASE_URL}/api/books?page=1&limit=100&sort=newest`, {
      cache: "no-store",
    });

    if (response.ok) {
      const payload = await response.json();
      if (payload.success && Array.isArray(payload.data) && payload.data.length > 0) {
        return { stories: normalizeStories(payload.data), source: "api" };
      }
    }
  } catch (error) {
    // Continue to local fallbacks.
  }

  const localUploadedBooks = getLocalUploadedBooks();
  if (localUploadedBooks.length > 0) {
    return { stories: normalizeStories(localUploadedBooks), source: "local-storage" };
  }

  try {
    const libraryResponse = await fetch("./data/library.json", { cache: "no-store" });
    if (libraryResponse.ok) {
      const libraryPayload = await libraryResponse.json();
      if (libraryPayload && Array.isArray(libraryPayload.books) && libraryPayload.books.length > 0) {
        return { stories: normalizeStories(libraryPayload.books), source: "library-json" };
      }
    }
  } catch (error) {
    // Fall through to empty state.
  }

  return { stories: [], source: "empty" };
}

function renderFeaturedStories() {
  setFeaturedSyncMessage("", "");

  if (!featuredStories.length) {
    elements.featuredStoriesGrid.innerHTML = `
      <article class="story-card" style="grid-column: 1 / -1;">
        <div class="story-content">
          <h3>No books available yet</h3>
          <p class="story-description">Your database is currently empty. Once your imported/downloaded books are in the backend, they will appear here automatically.</p>
        </div>
      </article>
    `;

    const localCount = getLocalUploadedBooks().length;
    if (localCount > 0) {
      elements.featuredStoriesGrid.innerHTML += `
        <article class="story-card restore-card">
          <div class="story-content">
            <h3>Restore your local catalog</h3>
            <p class="story-description">Found ${localCount} book(s) in this browser storage. Sync them back to backend in one click.</p>
            <div class="restore-actions">
              <button type="button" class="restore-btn" data-restore-local-books="true">Restore Local Books to Backend</button>
            </div>
          </div>
        </article>
      `;
    }

    return;
  }

  if (featuredSource === "local-storage") {
    setFeaturedSyncMessage("Showing local browser books. Sync to backend to persist across devices.", "");
  }

  elements.featuredStoriesGrid.innerHTML = featuredStories
    .map((story) => `
      <article class="story-card">
        <img class="story-cover" src="${createCoverSvg(story.title, story.genre)}" alt="${story.title} cover" loading="lazy" />
        <div class="story-content">
          <h3>${story.title}</h3>
          <p class="story-meta">${story.author} · ${story.genre}</p>
          <p class="story-description">${story.description}</p>
          <div class="story-actions">
            <button type="button" class="preview-btn" data-preview-story="${story.id}">Preview Chapter 1</button>
            <button type="button" data-locked-preview="true">Locked Chapters</button>
          </div>
        </div>
      </article>
    `)
    .join("");
}

async function restoreLocalBooksToBackend() {
  const localBooks = getLocalUploadedBooks();

  if (!localBooks.length) {
    setFeaturedSyncMessage("No local books found to restore.", "is-error");
    return;
  }

  const user = currentUser || (await fetchCurrentUser());
  if (!user) {
    setFeaturedSyncMessage("Login is required before restoring local books.", "is-error");
    openAuthModal("signin", "index.html");
    return;
  }

  setFeaturedSyncMessage("Syncing local books to backend...", "");

  try {
    const response = await fetch(`${API_BASE_URL}/api/books/restore-local`, {
      method: "POST",
      credentials: "include",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ books: localBooks }),
    });

    const payload = await response.json().catch(() => ({
      success: false,
      error: "Failed to parse restore response",
    }));

    if (!response.ok || !payload.success) {
      throw new Error(payload.error || "Restore failed");
    }

    const summary = payload.data || {};
    setFeaturedSyncMessage(
      `Restore complete: ${summary.created || 0} created, ${summary.skipped || 0} skipped.`,
      "is-success"
    );

    const result = await fetchLiveStories();
    featuredStories = result.stories;
    featuredSource = result.source;
    renderFeaturedStories();
  } catch (error) {
    setFeaturedSyncMessage(error.message || "Restore failed.", "is-error");
  }
}

function renderGenres() {
  elements.genreGrid.innerHTML = genres
    .map((genre) => `
      <article class="genre-card">
        <h3>${genre}</h3>
        <p>Explore top ${genre.toLowerCase()} stories and new releases.</p>
      </article>
    `)
    .join("");
}

async function loadPreviewForStory(story) {
  if (previewCache.has(story.id)) {
    return previewCache.get(story.id);
  }

  const result = {
    chapter1: extractPreviewText(story.description, "Preview unavailable for this story right now."),
    chapterTitle: "Chapter 1",
    hasLockedChapters: true,
  };

  try {
    const chaptersResponse = await fetch(`${API_BASE_URL}/api/books/${encodeURIComponent(story.id)}/chapters`, {
      cache: "no-store",
    });

    if (!chaptersResponse.ok) {
      previewCache.set(story.id, result);
      return result;
    }

    const chaptersPayload = await chaptersResponse.json();
    const chapters = Array.isArray(chaptersPayload.data) ? chaptersPayload.data : [];

    if (!chapters.length) {
      result.hasLockedChapters = false;
      previewCache.set(story.id, result);
      return result;
    }

    const firstChapter = chapters.slice().sort((a, b) => (a.chapterNumber || 0) - (b.chapterNumber || 0))[0];
    if (!firstChapter || !firstChapter.id) {
      previewCache.set(story.id, result);
      return result;
    }

    result.chapterTitle = firstChapter.title || "Chapter 1";
    result.hasLockedChapters = chapters.length > 1;

    const chapterResponse = await fetch(`${API_BASE_URL}/api/chapters/${encodeURIComponent(firstChapter.id)}`, {
      cache: "no-store",
    });

    if (chapterResponse.ok) {
      const chapterPayload = await chapterResponse.json();
      result.chapter1 = extractPreviewText(
        chapterPayload && chapterPayload.data ? chapterPayload.data.content : "",
        extractPreviewText(story.description, "Preview unavailable for this story right now.")
      );
    }
  } catch (error) {
    // Keep fallback preview from description.
  }

  previewCache.set(story.id, result);
  return result;
}

async function showChapterPreview(story) {
  elements.chapterPreviewTitle.textContent = `${story.title} · Chapter 1 Preview`;
  elements.chapterPreviewMeta.textContent = `${story.author} · ${story.genre}`;
  elements.chapterPreviewBody.textContent = "Loading preview...";
  elements.lockedChapterPrompt.hidden = true;

  elements.chapterPreviewModal.querySelectorAll(".chapter-chip").forEach((chip) => {
    chip.classList.toggle("active", chip.dataset.chapter === "1");
    chip.hidden = false;
  });

  openModal(elements.chapterPreviewModal);

  const preview = await loadPreviewForStory(story);
  elements.chapterPreviewBody.textContent = preview.chapter1;

  const chips = elements.chapterPreviewModal.querySelectorAll(".chapter-chip");
  chips.forEach((chip, index) => {
    if (index === 0) {
      chip.textContent = preview.chapterTitle || "Chapter 1";
      chip.classList.add("active");
      chip.classList.remove("locked");
      return;
    }

    if (preview.hasLockedChapters) {
      chip.hidden = false;
      chip.classList.add("locked");
      chip.classList.remove("active");
    } else {
      chip.hidden = true;
    }
  });
}

async function fetchCurrentUser() {
  if (!window.NovelReadSession) {
    return null;
  }
  currentUser = await window.NovelReadSession.fetchCurrentUser();
  return currentUser;
}

async function handleWriterJourneyIntent() {
  const user = currentUser || (await fetchCurrentUser());

  if (!user) {
    openAuthModal("signup", "writer-onboarding.html");
    return;
  }

  if (user.role === "ADMIN") {
    window.location.href = "admin.html";
    return;
  }

  if (window.NovelReadSession.canUseWriter(user)) {
    window.NovelReadSession.setPreferredDashboard("writer");
    window.location.href = "writer-dashboard.html";
    return;
  }

  window.location.href = "writer-onboarding.html";
}

async function submitSigninWithCredentials(email, password) {
  const response = await fetch(`${API_BASE_URL}/api/auth/signin`, {
    method: "POST",
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ email, password }),
  });

  const payload = await response.json().catch(() => ({
    success: false,
    error: "Unable to sign in",
  }));

  if (!response.ok || !payload.success) {
    throw new Error(payload.error || "Unable to sign in");
  }

  if (window.NovelReadSession) {
    await window.NovelReadSession.fetchCurrentUser(true);
  }

  return payload;
}

async function submitSignin(formData) {
  const email = String(formData.get("email") || "").trim().toLowerCase();
  const password = String(formData.get("password") || "");

  return submitSigninWithCredentials(email, password);
}

async function submitSignup(formData) {
  const name = String(formData.get("name") || "").trim();
  const email = String(formData.get("email") || "").trim().toLowerCase();
  const password = String(formData.get("password") || "");

  const response = await fetch(`${API_BASE_URL}/api/auth/signup`, {
    method: "POST",
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ name, email, password }),
  });

  const payload = await response.json().catch(() => ({
    success: false,
    error: "Unable to create account",
  }));

  if (!response.ok || !payload.success) {
    throw new Error(payload.error || "Unable to create account");
  }

  return submitSigninWithCredentials(email, password);
}

function bindEvents() {
  document.addEventListener("click", (event) => {
    const previewTrigger = event.target.closest("[data-preview-story]");
    if (previewTrigger) {
      const story = featuredStories.find((item) => item.id === previewTrigger.dataset.previewStory);
      if (story) {
        showChapterPreview(story);
      }
      return;
    }

    const lockedPreviewTrigger = event.target.closest("[data-locked-preview]");
    if (lockedPreviewTrigger) {
      openAuthModal("signin", "reader-dashboard.html");
      return;
    }

    const lockedChapterTrigger = event.target.closest(".chapter-chip.locked");
    if (lockedChapterTrigger) {
      elements.lockedChapterPrompt.hidden = false;
      openAuthModal("signin", "reader-dashboard.html");
      return;
    }

    const authOpenTrigger = event.target.closest("[data-auth-open]");
    if (authOpenTrigger) {
      const mode = authOpenTrigger.dataset.authOpen;
      const redirectTo = mode === "signup" && pendingRedirect.includes("writer")
        ? "writer-onboarding.html"
        : pendingRedirect || "reader-dashboard.html";
      openAuthModal(mode, redirectTo);
      return;
    }

    const restoreTrigger = event.target.closest("[data-restore-local-books]");
    if (restoreTrigger) {
      restoreLocalBooksToBackend();
      return;
    }

    const closeTrigger = event.target.closest("[data-close-modal]");
    if (closeTrigger) {
      closeModal(document.getElementById(closeTrigger.dataset.closeModal));
      return;
    }

    if (event.target === elements.authModal) {
      closeModal(elements.authModal);
      return;
    }

    if (event.target === elements.chapterPreviewModal) {
      closeModal(elements.chapterPreviewModal);
    }
  });

  authTabs.forEach((tab) => {
    tab.addEventListener("click", () => {
      setAuthTab(tab.dataset.authTab);
    });
  });

  elements.signinForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    setAuthMessage("Signing in...", "");

    try {
      await submitSignin(new FormData(elements.signinForm));
      setAuthMessage("Login successful. Redirecting...", "success");
      window.setTimeout(() => {
        window.location.href = pendingRedirect || "reader-dashboard.html";
      }, 260);
    } catch (error) {
      setAuthMessage(error.message, "error");
    }
  });

  elements.signupForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    setAuthMessage("Creating your account...", "");

    try {
      await submitSignup(new FormData(elements.signupForm));
      setAuthMessage("Account created. Redirecting...", "success");
      window.setTimeout(() => {
        window.location.href = pendingRedirect || "reader-dashboard.html";
      }, 260);
    } catch (error) {
      setAuthMessage(error.message, "error");
    }
  });

  elements.startWriterJourneyBtn.addEventListener("click", handleWriterJourneyIntent);
  elements.writerCtaBtn.addEventListener("click", handleWriterJourneyIntent);

  elements.startReadingBtn.addEventListener("click", async (event) => {
    const user = currentUser || (await fetchCurrentUser());
    if (!user) {
      event.preventDefault();
      document.getElementById("featured").scrollIntoView({ behavior: "smooth", block: "start" });
    }
  });
}

async function bootstrap() {
  renderGenres();
  bindEvents();
  await fetchCurrentUser();

  try {
    const result = await fetchLiveStories();
    featuredStories = result.stories;
    featuredSource = result.source;
  } catch (error) {
    featuredStories = [];
    featuredSource = "empty";
  }

  renderFeaturedStories();
}

bootstrap();
