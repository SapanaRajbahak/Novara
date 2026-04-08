// === Unified Data Persistence Utilities ===
function getCurrentUserId() {
  // Replace with real user logic if available
  return localStorage.getItem('novara.userId') || 'guest';
}

// CONTINUE READING
function getContinueReading() {
  return JSON.parse(localStorage.getItem('novara.continueReading') || '[]');
}
function setContinueReading(entries) {
  localStorage.setItem('novara.continueReading', JSON.stringify(entries));
}
function addContinueReading({ bookId, source, currentChapter, progress }) {
  const userId = getCurrentUserId();
  let entries = getContinueReading();
  // Remove any existing for this user/book
  entries = entries.filter(e => !(e.userId === userId && e.bookId === bookId));
  entries.unshift({ userId, bookId, source, currentChapter, progress });
  setContinueReading(entries);
}

// LIBRARY
function getLibrary() {
  return JSON.parse(localStorage.getItem('novara.savedBooks') || '[]');
}
function setLibrary(entries) {
  localStorage.setItem('novara.savedBooks', JSON.stringify(entries));
}
function addToLibrary(bookId) {
  const userId = getCurrentUserId();
  let entries = getLibrary();
  if (!entries.some(e => e.userId === userId && e.bookId === bookId)) {
    entries.unshift({ userId, bookId });
    setLibrary(entries);
  }
}

// BOOKMARKS
function getBookmarks() {
  return JSON.parse(localStorage.getItem('novara.bookmarks') || '[]');
}
function setBookmarks(entries) {
  localStorage.setItem('novara.bookmarks', JSON.stringify(entries));
}
function addBookmark({ bookId, chapterId, note }) {
  const userId = getCurrentUserId();
  let entries = getBookmarks();
  entries.unshift({ userId, bookId, chapterId, note });
  setBookmarks(entries);
}
function resolveApiBaseUrl() {
  const explicitBase = window.localStorage.getItem("Novara.apiBaseUrl");
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
const SAVED_BOOKS_KEY = "novara.savedBooks";
const elements = {
  continueReadingRow: document.getElementById("continueReadingRow"),
  trendingRow: document.getElementById("trendingRow"),
  genreRow: document.getElementById("genreRow"),
  browseGrid: document.getElementById("browseGrid"),
  loadMoreBtn: document.getElementById("loadMoreBtn"),
  globalSearchInput: document.getElementById("globalSearchInput"),
  discoverySearchInput: document.getElementById("discoverySearchInput"),
  quickGenreChips: document.getElementById("quickGenreChips"),
  dashboardProfileName: document.getElementById("dashboardProfileName"),
  dashboardAvatar: document.getElementById("dashboardAvatar"),
  dashboardSwitcher: document.getElementById("dashboardSwitcher"),
  writerJourneyPanel: document.getElementById("writerJourneyPanel"),
  writerNavLink: document.getElementById("writerNavLink"),
  writerDropdownLink: document.getElementById("writerDropdownLink"),
  profileMenuBtn: document.getElementById("profileMenuBtn"),
  profileDropdown: document.getElementById("profileDropdown"),
  profileSignOutLink: document.getElementById("profileSignOutLink"),
};

const state = {
  allBooks: [],
  inProgress: [],
  trending: [],
  genres: [],
  activeGenre: "all",
  browsePage: 1,
  pageSize: 10,
  searchTerm: "",
  savedBooks: loadSavedBooks(),
};

function getApiBaseCandidates() {
  const candidates = [API_BASE_URL];
  const isFileProtocol = window.location.protocol === "file:";
  const protocol = isFileProtocol ? "http:" : window.location.protocol;

  const localCandidates = [
    `${protocol}//localhost:5002`,
    `${protocol}//127.0.0.1:5002`,
  ];

  localCandidates.forEach((base) => {
    if (!candidates.includes(base)) {
      candidates.push(base);
    }
  });

  return candidates;
}

function loadSavedBooks() {
  try {
    const raw = localStorage.getItem(SAVED_BOOKS_KEY);
    const parsed = JSON.parse(raw || "[]");
    return new Set(Array.isArray(parsed) ? parsed : []);
  } catch (error) {
    return new Set();
  }
}

function persistSavedBooks() {
  localStorage.setItem(SAVED_BOOKS_KEY, JSON.stringify([...state.savedBooks]));
}

function showToast(message) {
  let root = document.getElementById("toastRoot");
  if (!root) {
    root = document.createElement("div");
    root.id = "toastRoot";
    root.className = "toast-root";
    document.body.appendChild(root);
  }

  const toast = document.createElement("div");
  toast.className = "toast";
  toast.textContent = message;
  root.appendChild(toast);

  window.setTimeout(() => {
    toast.classList.add("hide");
    window.setTimeout(() => toast.remove(), 200);
  }, 1800);
}

function createCoverSvg(title, genre) {
  const initials = String(title || "Book")
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

function normalizeBook(raw, index = 0) {
  return {
    id: raw.id || `book-${index + 1}`,
    title: raw.title || "Untitled",
    authorName: raw.authorName || raw.author || "Unknown Author",
    genre: raw.genre || "General",
    coverUrl: toAbsoluteCoverUrl(raw.coverUrl) || createCoverSvg(raw.title, raw.genre),
    createdAt: raw.createdAt || raw.publishedAt || "",
  };
}

function clampPercent(value) {
  const number = Number(value);
  if (Number.isNaN(number)) {
    return 0;
  }
  return Math.max(0, Math.min(100, Math.round(number)));
}

async function fetchBooksCatalog() {
  let lastError = null;

  for (const apiBase of getApiBaseCandidates()) {
    try {
      // Backend only allows limit 1-100
      const response = await fetch(`${apiBase}/api/books?page=1&limit=100&sort=newest`, {
        cache: "no-store",
        credentials: "include",
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const payload = await response.json();
      if (!payload.success || !Array.isArray(payload.data)) {
        throw new Error("Invalid books payload");
      }

      return payload.data.map(normalizeBook);
    } catch (error) {
      lastError = error;
    }
  }

  console.warn("Reader dashboard could not load backend catalog:", lastError);
  showToast("Unable to load backend books right now.");
  return [];
}

async function fetchReadingProgress(bookId) {
  try {
    const response = await fetch(`${API_BASE_URL}/api/progress/reading/${encodeURIComponent(bookId)}`, {
      cache: "no-store",
      credentials: "include",
    });

    if (!response.ok) {
      return null;
    }

    const payload = await response.json();
    if (!payload.success || !payload.data) {
      return null;
    }

    return payload.data;
  } catch (error) {
    return null;
  }
}

function createEmptyState(message) {
  const node = document.createElement("div");
  node.className = "empty-state";
  node.innerHTML = `<div><strong>Nothing here yet</strong><p>${message}</p></div>`;
  return node;
}

function createContinueCard(item) {
  const chapterLabel = item.chapterNumber ? `Chapter ${item.chapterNumber}` : "Continue reading";
  const progress = clampPercent(item.progressPercent);
  const chapterIdParam = item.chapterId ? `&chapterId=${encodeURIComponent(item.chapterId)}` : "";

  const card = document.createElement("article");
  card.className = "continue-card";
  card.innerHTML = `
    <img class="cover" src="${item.coverUrl}" alt="${item.title} cover" loading="lazy" />
    <div>
      <p class="title">${item.title}</p>
      <p class="meta">${item.authorName}</p>
      <p class="progress-text">${chapterLabel} · ${progress}%</p>
      <div class="progress-track"><span style="width:${progress}%"></span></div>
      <div class="inline-actions">
        <a class="solid-btn" href="reader.html?bookId=${encodeURIComponent(item.id)}${chapterIdParam}">Resume</a>
      </div>
    </div>
  `;
  return card;
}

function createRailCard(book, tag) {
  const card = document.createElement("article");
  card.className = "rail-card";
  card.innerHTML = `
    <img class="cover" src="${book.coverUrl}" alt="${book.title} cover" loading="lazy" />
    <p class="title">${book.title}</p>
    <p class="meta">${book.authorName}</p>
    <span class="tag-pill">${tag}</span>
    <div class="inline-actions">
      <a href="book.html?id=${encodeURIComponent(book.id)}">Open</a>
      <a href="reader.html?bookId=${encodeURIComponent(book.id)}">Read</a>
    </div>
  `;
  return card;
}

function createGenreCard(genre) {
  const card = document.createElement("article");
  card.className = "genre-card";
  card.innerHTML = `
    <p class="title">${genre}</p>
    <p>Explore top ${genre.toLowerCase()} stories curated for you.</p>
  `;
  return card;
}

function createBrowseCard(book) {
  const saved = state.savedBooks.has(book.id);
  const card = document.createElement("article");
  card.className = "browse-card";
  card.innerHTML = `
    <div class="browse-card__imgwrap">
      <img class="cover" src="${book.coverUrl}" alt="${book.title} cover" loading="lazy" />
    </div>
    <div class="browse-card__body">
      <p class="title">${book.title}</p>
      <p class="meta">${book.authorName} · ${book.genre}</p>
      <div class="inline-actions compact">
        <a href="book.html?id=${encodeURIComponent(book.id)}">Details</a>
        <a href="reader.html?bookId=${encodeURIComponent(book.id)}">Read</a>
        <button type="button" data-save-book-id="${book.id}">${saved ? "Saved" : "Save"}</button>
      </div>
    </div>
  `;
  return card;
}

function renderContinueReading() {
  elements.continueReadingRow.innerHTML = "";
  // Use unified continue reading data, sorted by updatedAt descending
  let entries = getContinueReading().filter(e => e.userId === getCurrentUserId());
  entries = entries
    .filter(e => e.bookId)
    .sort((a, b) => {
      const aTime = a.updatedAt ? new Date(a.updatedAt).getTime() : 0;
      const bTime = b.updatedAt ? new Date(b.updatedAt).getTime() : 0;
      return bTime - aTime;
    });
  if (!entries.length) {
    elements.continueReadingRow.appendChild(createEmptyState("Start reading any book to see it here."));
    return;
  }
  // Map bookId to book data
  entries.slice(0, 10).forEach((entry) => {
    const book = state.allBooks.find(b => b.id === entry.bookId);
    if (book) {
      elements.continueReadingRow.appendChild(createContinueCard({
        ...book,
        chapterId: entry.currentChapter,
        chapterNumber: entry.currentChapter ? (parseInt(entry.currentChapter.replace(/\D/g, "")) || 1) : 1,
        progressPercent: entry.progress || 0
      }));
    }
  });
}

function renderTrending() {
  elements.trendingRow.innerHTML = "";
  const items = state.trending.slice(0, 14);
  if (!items.length) {
    elements.trendingRow.appendChild(createEmptyState("Trending stories will show up here soon."));
    return;
  }

  items.forEach((book) => {
    elements.trendingRow.appendChild(createRailCard(book, "Trending"));
  });
}

function renderGenres() {
  elements.genreRow.innerHTML = "";
  if (!state.genres.length) {
    elements.genreRow.appendChild(createEmptyState("Pick a genre from discovery to personalize this row."));
    return;
  }

  state.genres.slice(0, 8).forEach((genre) => {
    elements.genreRow.appendChild(createGenreCard(genre));
  });
}

function renderGenreChips() {
  elements.quickGenreChips.innerHTML = "";
  const allChip = document.createElement("button");
  allChip.type = "button";
  allChip.className = `chip ${state.activeGenre === "all" ? "active" : ""}`;
  allChip.textContent = "All";
  allChip.dataset.genre = "all";
  elements.quickGenreChips.appendChild(allChip);

  state.genres.slice(0, 10).forEach((genre) => {
    const chip = document.createElement("button");
    chip.type = "button";
    chip.className = `chip ${state.activeGenre === genre ? "active" : ""}`;
    chip.textContent = genre;
    chip.dataset.genre = genre;
    elements.quickGenreChips.appendChild(chip);
  });
}

function getFilteredBrowseBooks() {
  const query = state.searchTerm.trim().toLowerCase();

  return state.allBooks.filter((book) => {
    const matchesGenre = state.activeGenre === "all" || book.genre === state.activeGenre;
    if (!matchesGenre) {
      return false;
    }

    if (!query) {
      return true;
    }

    const haystack = `${book.title} ${book.authorName} ${book.genre}`.toLowerCase();
    return haystack.includes(query);
  });
}

function renderBrowseGrid() {
  elements.browseGrid.innerHTML = "";
  const filtered = getFilteredBrowseBooks();
  if (!filtered.length) {
    elements.browseGrid.appendChild(createEmptyState("No books match your search yet. Try another keyword."));
    elements.loadMoreBtn.hidden = true;
    return;
  }

  const maxItems = state.browsePage * state.pageSize;
  filtered.slice(0, maxItems).forEach((book) => {
    elements.browseGrid.appendChild(createBrowseCard(book));
  });

  elements.loadMoreBtn.hidden = maxItems >= filtered.length;
}

function bindDiscoveryEvents() {
  const syncSearch = () => {
    state.searchTerm = elements.discoverySearchInput.value || elements.globalSearchInput.value || "";
    elements.globalSearchInput.value = state.searchTerm;
    elements.discoverySearchInput.value = state.searchTerm;
    state.browsePage = 1;
    renderBrowseGrid();
  };

  elements.globalSearchInput.addEventListener("input", syncSearch);
  elements.discoverySearchInput.addEventListener("input", syncSearch);

  elements.quickGenreChips.addEventListener("click", (event) => {
    const chip = event.target.closest("button[data-genre]");
    if (!chip) {
      return;
    }

    state.activeGenre = chip.dataset.genre;
    state.browsePage = 1;
    renderGenreChips();
    renderBrowseGrid();
  });

  elements.loadMoreBtn.addEventListener("click", () => {
    state.browsePage += 1;
    renderBrowseGrid();
  });

  elements.browseGrid.addEventListener("click", (event) => {
    const saveBtn = event.target.closest("button[data-save-book-id]");
    if (!saveBtn) {
      return;
    }
    const bookId = saveBtn.dataset.saveBookId;
    if (getLibrary().some(e => e.userId === getCurrentUserId() && e.bookId === bookId)) {
      // Remove from library
      let entries = getLibrary().filter(e => !(e.userId === getCurrentUserId() && e.bookId === bookId));
      setLibrary(entries);
      saveBtn.textContent = "Save";
      showToast("Removed from saved books");
    } else {
      addToLibrary(bookId);
      saveBtn.textContent = "Saved";
      showToast("Saved to your library");
    }
    // Update UI instantly
    renderBrowseGrid();
    renderContinueReading();
  });
}

function setupProfileMenu() {
  elements.profileMenuBtn.addEventListener("click", () => {
    const isOpen = elements.profileDropdown.classList.toggle("show");
    elements.profileMenuBtn.setAttribute("aria-expanded", String(isOpen));
  });

  document.addEventListener("click", (event) => {
    if (!event.target.closest(".profile-menu")) {
      elements.profileDropdown.classList.remove("show");
      elements.profileMenuBtn.setAttribute("aria-expanded", "false");
    }
  });

  elements.profileSignOutLink.addEventListener("click", async (event) => {
    event.preventDefault();
    if (window.NovaraSession && typeof window.NovaraSession.signOut === "function") {
      await window.NovaraSession.signOut("./index.html");
      return;
    }
    window.location.href = "./index.html";
  });
}

async function syncSessionUi() {
  if (!window.NovaraSession) {
    return null;
  }

  const user = await window.NovaraSession.fetchCurrentUser();

  if (user) {
    elements.dashboardProfileName.textContent = user.name;
    elements.dashboardAvatar.textContent = window.NovaraSession.getInitials(user.name);
    // Allow admins to access the reader dashboard: do NOT redirect
  }

  window.NovaraSession.renderDashboardSwitcher(elements.dashboardSwitcher, {
    currentDashboard: "reader",
    readerHref: window.NovaraSession.APP_ROUTES.readerDashboard,
    writerHref: window.NovaraSession.APP_ROUTES.writerDashboard,
  });

  window.NovaraSession.renderWriterJourneyCard(elements.writerJourneyPanel, {
    readerHref: window.NovaraSession.APP_ROUTES.readerDashboard,
    writerHref: window.NovaraSession.APP_ROUTES.writerDashboard,
    onboardingHref: "writer-onboarding.html",
  });

  const canUseWriter = window.NovaraSession.canUseWriter(user);
  elements.writerNavLink.hidden = !canUseWriter;
  elements.writerNavLink.href = window.NovaraSession.APP_ROUTES.writerDashboard;
  elements.writerDropdownLink.hidden = !canUseWriter;
  elements.writerDropdownLink.href = window.NovaraSession.APP_ROUTES.writerDashboard;

  return user;
}

// buildInProgress no longer needed, handled by getContinueReading

function buildRecommendations() {
  state.trending = state.allBooks.slice(0, 20);
  state.genres = [...new Set(state.allBooks.map((book) => book.genre).filter(Boolean))];
}

async function bootstrap() {
  setupProfileMenu();
  bindDiscoveryEvents();

  await syncSessionUi();

  state.allBooks = await fetchBooksCatalog();
  buildRecommendations();

  renderContinueReading();
  renderTrending();
  renderGenres();
  renderGenreChips();
  renderBrowseGrid();
}

bootstrap();
