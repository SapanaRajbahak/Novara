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

function resolveApiBaseUrl() {
  const explicitBase = window.localStorage.getItem("novara.apiBaseUrl");
  if (explicitBase) {
    try {
      const parsed = new URL(explicitBase);
      const isLocalPage = window.location.protocol === "file:" || ["localhost", "127.0.0.1"].includes(window.location.hostname);
      const isExplicitLocal = ["localhost", "127.0.0.1"].includes(parsed.hostname);

      if (!isLocalPage || isExplicitLocal) {
        return explicitBase.replace(/\/$/, "");
      }
    } catch (error) {
      // Ignore invalid override and fall back to local default.
    }
  }

  const isFileProtocol = window.location.protocol === "file:";
  const protocol = isFileProtocol ? "http:" : window.location.protocol;
  const host = !isFileProtocol && window.location.hostname ? window.location.hostname : "localhost";
  return `${protocol}//${host}:5002`;
}

const API_BASE_URL = resolveApiBaseUrl();
const POST_LOGIN_REDIRECT_KEY = "novara.postLoginRedirect";
const REFERRAL_STORAGE_KEY = "novara_referral";
const LEGACY_REFERRAL_STORAGE_KEY = "novara.pendingReferrer";

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
  signupOtpForm: document.getElementById("signupOtpForm"),
  signupOtpInput: document.getElementById("signupOtpInput"),
  signupOtpEmail: document.getElementById("signupOtpEmail"),
  signupOtpResendBtn: document.getElementById("signupOtpResendBtn"),
  signupOtpBackBtn: document.getElementById("signupOtpBackBtn"),
  startWriterJourneyBtn: document.getElementById("startWriterJourneyBtn"),
  writerCtaBtn: document.getElementById("writerCtaBtn"),
  startReadingBtn: document.getElementById("startReadingBtn"),
};

const authTabs = Array.from(document.querySelectorAll(".auth-tab"));
let pendingRedirect = "/reader/reader-dashboard.html";
let currentUser = null;
let featuredStories = [];
let featuredSource = "empty";
const previewCache = new Map();
let activePreviewState = null;
let pendingSignupState = null;

function getLocalUploadedBooks() {
  try {
    const parsed = JSON.parse(localStorage.getItem("novara.admin.uploadedBooks") || "[]");
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

function toAbsoluteCoverUrl(value) {
  const raw = String(value || "").trim();
  if (!raw) {
    return "";
  }

  if (/^(https?:)?\/\//i.test(raw) || raw.startsWith("data:")) {
    return raw;
  }

  return `${API_BASE_URL}${raw.startsWith("/") ? raw : `/${raw}`}`;
}

function setAuthMessage(message, tone) {
  elements.authMessage.textContent = message;
  elements.authMessage.className = `auth-message${tone ? ` ${tone}` : ""}`;
}

function validateStrongPassword(value) {
  const password = String(value || "");
  const strongPasswordRegex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z0-9]).{8,}$/;
  return strongPasswordRegex.test(password);
}

function setAuthTab(mode) {
  const normalizedMode = mode === "signup" ? "signup" : "signin";
  authTabs.forEach((tab) => {
    tab.classList.toggle("active", tab.dataset.authTab === normalizedMode);
  });
  elements.signinForm.hidden = normalizedMode !== "signin";
  elements.signupForm.hidden = normalizedMode !== "signup";
  if (elements.signupOtpForm) {
    elements.signupOtpForm.hidden = true;
  }
  pendingSignupState = null;
  setAuthMessage("", "");
}

function showSignupOtpStep(email, password) {
  pendingSignupState = { email, password };
  elements.signinForm.hidden = true;
  elements.signupForm.hidden = true;
  if (elements.signupOtpForm) {
    elements.signupOtpForm.hidden = false;
  }
  if (elements.signupOtpEmail) {
    elements.signupOtpEmail.textContent = email;
  }
  if (elements.signupOtpInput) {
    elements.signupOtpInput.value = "";
    window.setTimeout(() => elements.signupOtpInput.focus(), 0);
  }
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

function sanitizeRedirectPath(rawValue) {
  const value = String(rawValue || "").trim();
  if (!value) {
    return "";
  }
  if (/^https?:\/\//i.test(value) || value.startsWith("//")) {
    return "";
  }
  return value.startsWith("/") ? value.slice(1) : value;
}

function resolveInitialAuthIntent() {
  const params = new URLSearchParams(window.location.search);
  const queryNext = sanitizeRedirectPath(params.get("next") || "");
  const queryAuth = params.get("auth") === "signup" ? "signup" : "signin";

  if (queryNext) {
    pendingRedirect = queryNext;
    return { shouldOpenAuth: true, mode: queryAuth };
  }

  const storedNext = sanitizeRedirectPath(localStorage.getItem(POST_LOGIN_REDIRECT_KEY) || "");
  if (storedNext) {
    pendingRedirect = storedNext;
    return { shouldOpenAuth: true, mode: "signin" };
  }

  return { shouldOpenAuth: false, mode: "signin" };
}

function captureReferralFromUrl() {
  const params = new URLSearchParams(window.location.search);
  const refValue = String(params.get("ref") || "").trim();
  if (!refValue) {
    return "";
  }
  localStorage.setItem(REFERRAL_STORAGE_KEY, refValue);
  localStorage.removeItem(LEGACY_REFERRAL_STORAGE_KEY);
  return refValue;
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

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function normalizePreviewChapters(chapters) {
  return chapters
    .filter((chapter) => chapter && chapter.id)
    .map((chapter, index) => ({
      id: chapter.id,
      chapterNumber: Number(chapter.chapterNumber || index + 1),
      title: chapter.title || `Chapter ${index + 1}`,
    }))
    .sort((a, b) => a.chapterNumber - b.chapterNumber)
    .map((chapter) => ({
      ...chapter,
      isLockedForGuest: chapter.chapterNumber > 1,
    }));
}

async function fetchPreviewChapterContent(chapterId, fallbackText) {
  if (!chapterId) {
    return {
      content: extractPreviewText("", fallbackText),
      isLocked: false,
    };
  }

  try {
    const response = await fetch(`${API_BASE_URL}/api/chapters/${encodeURIComponent(chapterId)}`, {
      cache: "no-store",
      credentials: "include",
    });

    if (response.status === 403) {
      return {
        content: "🔒 Unlock this chapter by logging in or signing up.",
        isLocked: true,
      };
    }

    if (!response.ok) {
      return {
        content: extractPreviewText("", fallbackText),
        isLocked: false,
      };
    }

    const payload = await response.json();
    const content = payload && payload.data ? payload.data.content : "";
    return {
      content: extractPreviewText(content, fallbackText),
      isLocked: false,
    };
  } catch (error) {
    return {
      content: extractPreviewText("", fallbackText),
      isLocked: false,
    };
  }
}

function renderPreviewChapterControls(preview, activeChapterId) {
  const controls = elements.chapterPreviewModal.querySelector(".chapter-controls");
  if (!controls) {
    return;
  }

  controls.innerHTML = preview.chapters
    .map((chapter) => {
      const isActive = chapter.id === activeChapterId;
      const isLocked = chapter.isLockedForGuest;
      const label = `Chapter ${chapter.chapterNumber}: ${chapter.title}`;
      const displayLabel = isLocked
        ? `🔒 Unlock Chapter ${chapter.chapterNumber}`
        : label;
      const safeLabel = escapeHtml(label);
      const safeDisplayLabel = escapeHtml(displayLabel);

      return `
        <button
          type="button"
          class="chapter-chip ${isActive ? "active" : ""} ${isLocked ? "locked" : ""}"
          data-preview-chapter-id="${chapter.id}"
          ${isLocked ? 'data-preview-chapter-locked="true"' : ""}
          title="${safeLabel}"
        >
          ${safeDisplayLabel}
        </button>
      `;
    })
    .join("");
}

function setActivePreviewState(story, preview, activeChapterId) {
  activePreviewState = {
    story,
    preview,
    activeChapterId,
  };

  renderPreviewChapterControls(preview, activeChapterId);
}

async function showPreviewChapterContent(chapter) {
  if (!activePreviewState || !chapter) {
    return;
  }

  setActivePreviewState(activePreviewState.story, activePreviewState.preview, chapter.id);
  elements.chapterPreviewBody.textContent = "Loading chapter preview...";
  elements.lockedChapterPrompt.hidden = true;

  const hasCached = activePreviewState.preview.chapterPreviews[chapter.id];
  const previewContent = hasCached
    ? activePreviewState.preview.chapterPreviews[chapter.id]
    : await fetchPreviewChapterContent(chapter.id, activePreviewState.story.description);

  activePreviewState.preview.chapterPreviews[chapter.id] = previewContent;
  elements.chapterPreviewTitle.textContent = `${activePreviewState.story.title} · Chapter ${chapter.chapterNumber} Preview`;

  if (previewContent.isLocked) {
    elements.chapterPreviewBody.textContent = "🔒 Unlock this chapter by logging in or signing up.";
    elements.lockedChapterPrompt.hidden = false;
    return;
  }

  elements.chapterPreviewBody.textContent = previewContent.content;
}

async function openStoryInReader(story) {
  if (!story || !story.id) {
    return;
  }

  try {
    const preview = await loadPreviewForStory(story);
    const firstChapter = preview.chapters.find((chapter) => Number(chapter.chapterNumber) === 1) || preview.chapters[0];

    if (firstChapter && firstChapter.id) {
      window.location.href = `/reader/reader.html?bookId=${encodeURIComponent(story.id)}&chapterId=${encodeURIComponent(firstChapter.id)}`;
      return;
    }
  } catch (error) {
    // Fallback to the book detail page if chapter lookup fails.
  }

  window.location.href = `/reader/book.html?id=${encodeURIComponent(story.id)}`;
}

async function fetchLiveStories() {
  function normalizeStories(books) {
    return books.map((book, index) => ({
      id: book.id || `story-${index + 1}`,
      title: book.title || "Untitled",
      author: book.authorName || book.author || "Unknown Author",
      genre: book.genre || "General",
      description: book.description || "No description available yet.",
      coverUrl: toAbsoluteCoverUrl(book.coverUrl),
    }));
  }

  try {
    const response = await fetch(`${API_BASE_URL}/api/books/featured`, {
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
        <img class="story-cover" src="${story.coverUrl || createCoverSvg(story.title, story.genre)}" alt="${story.title} cover" loading="lazy" data-fallback-cover="${createCoverSvg(story.title, story.genre)}" data-open-story="${story.id}" />
        <div class="story-content">
          <h3 data-open-story="${story.id}">${story.title}</h3>
          <p class="story-meta">${story.author} · ${story.genre}</p>
          <p class="story-description">${story.description}</p>
          <div class="story-actions">
            <button type="button" class="preview-btn" data-preview-story="${story.id}">Read Chapter 1 Free</button>
            <button type="button" data-locked-preview="true" data-preview-story="${story.id}">View Chapters</button>
          </div>
        </div>
      </article>
    `)
    .join("");

  elements.featuredStoriesGrid.querySelectorAll("img.story-cover[data-fallback-cover]").forEach((img) => {
    img.addEventListener(
      "error",
      () => {
        const fallbackCover = img.getAttribute("data-fallback-cover");
        if (fallbackCover && img.src !== fallbackCover) {
          img.src = fallbackCover;
        }
      },
      { once: true }
    );
  });
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
    openAuthModal("signin", "/index.html");
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
    chapters: [],
    chapterPreviews: {},
    activeChapterId: "",
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
    result.chapters = normalizePreviewChapters(chapters);

    if (!chapters.length) {
      result.hasLockedChapters = false;
      result.chapters = [];
      previewCache.set(story.id, result);
      return result;
    }

    const firstChapter = result.chapters[0] || null;
    if (!firstChapter || !firstChapter.id) {
      previewCache.set(story.id, result);
      return result;
    }

    result.chapterTitle = firstChapter.title || "Chapter 1";
    result.activeChapterId = firstChapter.id;
    result.hasLockedChapters = result.chapters.some((chapter) => chapter.isLockedForGuest);

    const firstChapterPreview = await fetchPreviewChapterContent(
      firstChapter.id,
      extractPreviewText(story.description, "Preview unavailable for this story right now.")
    );
    result.chapter1 = firstChapterPreview.content;
    result.chapterPreviews[firstChapter.id] = firstChapterPreview;
  } catch (error) {
    // Keep fallback preview from description.
  }

  if (!result.chapters.length) {
    result.chapters = [
      {
        id: "",
        chapterNumber: 1,
        title: "Chapter 1",
        isLockedForGuest: false,
      },
    ];
  }

  previewCache.set(story.id, result);
  return result;
}

async function showChapterPreview(story) {
  elements.chapterPreviewTitle.textContent = `${story.title} · Chapter Preview`;
  elements.chapterPreviewMeta.textContent = `${story.author} · ${story.genre}`;
  elements.chapterPreviewBody.textContent = "Loading preview...";
  elements.lockedChapterPrompt.hidden = true;

  openModal(elements.chapterPreviewModal);

  const preview = await loadPreviewForStory(story);
  const activeChapter = preview.chapters.find((chapter) => chapter.id === preview.activeChapterId) || preview.chapters[0];
  setActivePreviewState(story, preview, activeChapter.id);
  await showPreviewChapterContent(activeChapter);
}

async function fetchCurrentUser() {
  if (!window.NovaraSession) {
    return null;
  }
  currentUser = await window.NovaraSession.fetchCurrentUser();
  return currentUser;
}

async function handleWriterJourneyIntent() {
  const user = currentUser || (await fetchCurrentUser());

  if (!user) {
    openAuthModal("signup", "/writer/writer-onboarding.html");
    return;
  }

  if (user.role === "ADMIN") {
    window.location.href = "/admin/admin.html";
    return;
  }

  if (window.NovaraSession.canUseWriter(user)) {
    window.NovaraSession.setPreferredDashboard("writer");
    window.NovaraSession.setPreferredDashboard("writer");
    window.location.href = "/writer/writer-dashboard.html";
    return;
  }

  window.location.href = "/writer/writer-onboarding.html";
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

  if (window.NovaraSession) {
    await window.NovaraSession.fetchCurrentUser(true);
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
  const referralRef = String(
    localStorage.getItem(REFERRAL_STORAGE_KEY) ||
    localStorage.getItem(LEGACY_REFERRAL_STORAGE_KEY) ||
    ""
  ).trim();

  if (!validateStrongPassword(password)) {
    throw new Error("Password must be at least 8 characters and include uppercase, lowercase, number, and special character.");
  }

  const response = await fetch(`${API_BASE_URL}/api/auth/signup`, {
    method: "POST",
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ name, email, password, ref: referralRef || undefined }),
  });

  const payload = await response.json().catch(() => ({
    success: false,
    error: "Unable to create account",
  }));

  if (!response.ok || !payload.success) {
    throw new Error(payload.error || "Unable to create account");
  }

  localStorage.removeItem(REFERRAL_STORAGE_KEY);
  localStorage.removeItem(LEGACY_REFERRAL_STORAGE_KEY);
  showSignupOtpStep(email, password);
  return {
    success: true,
    message: payload.message || "Account created. Verify OTP to continue.",
  };
}

async function submitSignupOtpVerification() {
  if (!pendingSignupState || !pendingSignupState.email || !pendingSignupState.password) {
    throw new Error("Signup session expired. Please create your account again.");
  }

  const otpCode = String(elements.signupOtpInput?.value || "").trim();
  if (!/^\d{6}$/.test(otpCode)) {
    throw new Error("Enter a valid 6-digit OTP code.");
  }

  const verifyResponse = await fetch(`${API_BASE_URL}/api/auth/verify-signup-otp`, {
    method: "POST",
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      email: pendingSignupState.email,
      otp: otpCode,
    }),
  });

  const verifyPayload = await verifyResponse.json().catch(() => ({
    success: false,
    error: "Unable to verify OTP",
  }));

  if (!verifyResponse.ok || !verifyPayload.success) {
    throw new Error(verifyPayload.error || "Unable to verify OTP");
  }

  return submitSigninWithCredentials(pendingSignupState.email, pendingSignupState.password);
}

async function resendSignupOtp() {
  if (!pendingSignupState || !pendingSignupState.email) {
    throw new Error("Signup session expired. Please create your account again.");
  }

  const response = await fetch(`${API_BASE_URL}/api/auth/send-otp`, {
    method: "POST",
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ email: pendingSignupState.email }),
  });

  const payload = await response.json().catch(() => ({
    success: false,
    error: "Unable to resend OTP",
  }));

  if (!response.ok || !payload.success) {
    throw new Error(payload.error || "Unable to resend OTP");
  }
}

function bindEvents() {
  document.addEventListener("click", (event) => {
    const openStoryTrigger = event.target.closest("[data-open-story]");
    if (openStoryTrigger) {
      const story = featuredStories.find((item) => item.id === openStoryTrigger.dataset.openStory);
      if (story) {
        openStoryInReader(story);
      }
      return;
    }

    const previewTrigger = event.target.closest("[data-preview-story]");
    if (previewTrigger) {
      const story = featuredStories.find((item) => item.id === previewTrigger.dataset.previewStory);
      if (story) {
        openStoryInReader(story);
      }
      return;
    }

    const previewChapterTrigger = event.target.closest("[data-preview-chapter-id]");
    if (previewChapterTrigger && activePreviewState) {
      const chapterId = previewChapterTrigger.dataset.previewChapterId;
      const chapter = activePreviewState.preview.chapters.find((item) => item.id === chapterId);
      if (!chapter) {
        return;
      }

      const isLockedForGuest = previewChapterTrigger.dataset.previewChapterLocked === "true";
      if (isLockedForGuest && !currentUser) {
        elements.lockedChapterPrompt.hidden = false;
        const targetUrl = `/reader/reader.html?bookId=${encodeURIComponent(activePreviewState.story.id)}&chapterId=${encodeURIComponent(chapter.id)}`;
        openAuthModal("signin", targetUrl);
        return;
      }

      showPreviewChapterContent(chapter);
      return;
    }

    const lockedPreviewTrigger = event.target.closest("[data-locked-preview]");
    if (lockedPreviewTrigger) {
      const story = featuredStories.find((item) => item.id === lockedPreviewTrigger.dataset.previewStory);
      if (story) {
        openStoryInReader(story);
      }
      return;
    }

    const lockedChapterTrigger = event.target.closest(".chapter-chip.locked");
    if (lockedChapterTrigger) {
      elements.lockedChapterPrompt.hidden = false;
      openAuthModal("signin", "/reader/reader-dashboard.html");
      return;
    }

    const authOpenTrigger = event.target.closest("[data-auth-open]");
    if (authOpenTrigger) {
      const mode = authOpenTrigger.dataset.authOpen;
      const redirectTo =
        mode === "signup" && pendingRedirect && pendingRedirect.includes("writer")
          ? "/writer/writer-onboarding.html"
          : pendingRedirect || "/reader/reader-dashboard.html";
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

  if (elements.signinForm) {
    elements.signinForm.addEventListener("submit", async (event) => {
      event.preventDefault();
      setAuthMessage("Signing in...", "");

      try {
        const payload = await submitSignin(new FormData(elements.signinForm));
        setAuthMessage("Login successful. Redirecting...", "success");
        localStorage.removeItem(POST_LOGIN_REDIRECT_KEY);
        // If admin, redirect to admin.html, else reader-dashboard.html
        if (payload && payload.user && payload.user.role === "ADMIN") {
          window.setTimeout(() => {
            window.location.href = "/admin/admin.html";
          }, 260);
        } else {
          window.setTimeout(() => {
            window.location.href = pendingRedirect || "/reader/reader-dashboard.html";
          }, 260);
        }
      } catch (error) {
        setAuthMessage(error.message, "error");
      }
    });
  }

  if (elements.signupForm) {
    elements.signupForm.addEventListener("submit", async (event) => {
      event.preventDefault();
      setAuthMessage("Creating your account...", "");

      try {
        await submitSignup(new FormData(elements.signupForm));
        setAuthMessage("Account created. Enter OTP to complete signup.", "success");
      } catch (error) {
        setAuthMessage(error.message, "error");
      }
    });
  }

  if (elements.signupOtpForm) {
    elements.signupOtpForm.addEventListener("submit", async (event) => {
      event.preventDefault();
      setAuthMessage("Verifying OTP...", "");

      try {
        const payload = await submitSignupOtpVerification();
        setAuthMessage("Verification successful. Redirecting...", "success");
        localStorage.removeItem(POST_LOGIN_REDIRECT_KEY);
        if (payload && payload.user && payload.user.role === "ADMIN") {
          window.setTimeout(() => {
            window.location.href = "/admin/admin.html";
          }, 260);
        } else {
          window.setTimeout(() => {
            window.location.href = pendingRedirect || "/reader/reader-dashboard.html";
          }, 260);
        }
      } catch (error) {
        setAuthMessage(error.message, "error");
      }
    });
  }

  if (elements.signupOtpResendBtn) {
    elements.signupOtpResendBtn.addEventListener("click", async () => {
      setAuthMessage("Resending OTP...", "");
      try {
        await resendSignupOtp();
        setAuthMessage("A new OTP has been sent.", "success");
      } catch (error) {
        setAuthMessage(error.message, "error");
      }
    });
  }

  if (elements.signupOtpBackBtn) {
    elements.signupOtpBackBtn.addEventListener("click", () => {
      pendingSignupState = null;
      setAuthTab("signup");
    });
  }

  if (elements.startWriterJourneyBtn) {
    elements.startWriterJourneyBtn.addEventListener("click", handleWriterJourneyIntent);
  }
  if (elements.writerCtaBtn) {
    elements.writerCtaBtn.addEventListener("click", handleWriterJourneyIntent);
  }
  if (elements.startReadingBtn) {
    elements.startReadingBtn.addEventListener("click", async (event) => {
      const user = currentUser || (await fetchCurrentUser());
      if (!user) {
        event.preventDefault();
        const featuredSection = document.getElementById("featured");
        if (featuredSection) {
          featuredSection.scrollIntoView({ behavior: "smooth", block: "start" });
        }
      }
    });
  }
}

async function bootstrap() {
  captureReferralFromUrl();
  const authIntent = resolveInitialAuthIntent();
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

  if (authIntent.shouldOpenAuth && !currentUser) {
    openAuthModal(authIntent.mode, pendingRedirect);
  }
}

// Ensure all logic runs after DOM is fully loaded
document.addEventListener("DOMContentLoaded", () => {
  bootstrap();
});
