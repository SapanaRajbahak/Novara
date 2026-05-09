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
const PAGE_SIZE = 12;

const elements = {
  searchInput: document.getElementById("searchInput"),
  categoryChips: document.getElementById("categoryChips"),
  featuredPanel: document.getElementById("featuredPanel"),
  featuredCount: document.getElementById("featuredCount"),
  featuredBooks: document.getElementById("featuredBooks"),
  trendingPanel: document.getElementById("trendingPanel"),
  trendingCount: document.getElementById("trendingCount"),
  trendingBooks: document.getElementById("trendingBooks"),
  recentSection: document.getElementById("recentSection"),
  recentCount: document.getElementById("recentCount"),
  recentBooks: document.getElementById("recentBooks"),
  filterGenre: document.getElementById("filterGenre"),
  filterType: document.getElementById("filterType"),
  filterSort: document.getElementById("filterSort"),
  resetFiltersBtn: document.getElementById("resetFiltersBtn"),
  resultsMeta: document.getElementById("resultsMeta"),
  booksCount: document.getElementById("booksCount"),
  booksResults: document.getElementById("booksResults"),
  pageInfo: document.getElementById("pageInfo"),
  prevPageBtn: document.getElementById("prevPageBtn"),
  nextPageBtn: document.getElementById("nextPageBtn"),
  openDrawerBtn: document.getElementById("openDrawerBtn"),
  closeDrawerBtn: document.getElementById("closeDrawerBtn"),
  filterDrawer: document.getElementById("filterDrawer"),
  drawerFiltersMount: document.getElementById("drawerFiltersMount"),
};

const state = {
  query: "",
  activeCategory: "all",
  filters: {
    genre: "all",
    type: "all",
    sort: "newest",
  },
  books: [],
  sections: {
    featured: [],
    trending: [],
    recent: [],
  },
  filterOptions: {
    genres: [],
    types: [],
    highlightedTags: [],
  },
  meta: {
    totalPublished: 0,
    matchingBooks: 0,
  },
  pagination: {
    page: 1,
    totalPages: 1,
  },
  requestId: 0,
  savedBookIds: new Set(),
};

let searchDebounceTimer = null;

async function loadSavedBooks() {
  try {
    const response = await fetch(`${API_BASE_URL}/api/profile/saved-books`, {
      credentials: "include",
      cache: "no-store",
    });
    if (!response.ok) {
      return;
    }
    const payload = await response.json();
    if (payload.success && Array.isArray(payload.data)) {
      state.savedBookIds = new Set(payload.data.map((item) => item.id));
    }
  } catch (error) {
    // Guest users or network errors — silently ignore
  }
}

async function toggleSave(bookId, buttonEl) {
  try {
    const response = await fetch(`${API_BASE_URL}/api/profile/saved-books/${encodeURIComponent(bookId)}`, {
      method: "POST",
      credentials: "include",
    });
    if (!response.ok) {
      return;
    }
    const data = await response.json();
    if (data.saved) {
      state.savedBookIds.add(bookId);
    } else {
      state.savedBookIds.delete(bookId);
    }
    updateSaveButtons(bookId);
  } catch (error) {
    // Silently ignore network errors
  }
}

function updateSaveButtons(bookId) {
  document.querySelectorAll(`[data-save-book-id="${bookId}"]`).forEach((btn) => {
    const saved = state.savedBookIds.has(bookId);
    btn.textContent = saved ? "Saved" : "Save";
    btn.classList.toggle("saved", saved);
  });
}

function createCoverSvg(title, genre) {
  const initials = title
    .split(" ")
    .map((word) => word[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();

  const palette = {
    Mystery: ["#23323f", "#46667b"],
    Fantasy: ["#553458", "#9d6aa6"],
    Thriller: ["#3f2a1b", "#ab6a3a"],
    Romance: ["#6a3047", "#bf6e91"],
    "Sci-Fi": ["#1f3d55", "#53a2d8"],
    Historical: ["#4f412d", "#a58a5a"],
    Drama: ["#3f3348", "#8672a1"],
    Adventure: ["#2b4337", "#5f9267"],
    default: ["#2d3b3a", "#608982"]
  };

  const [c1, c2] = palette[genre] || palette.default;
  const svg = `<svg xmlns='http://www.w3.org/2000/svg' width='300' height='400'>
    <defs>
      <linearGradient id='g' x1='0' x2='1' y1='0' y2='1'>
        <stop offset='0%' stop-color='${c1}'/>
        <stop offset='100%' stop-color='${c2}'/>
      </linearGradient>
    </defs>
    <rect width='100%' height='100%' rx='20' fill='url(#g)'/>
    <rect x='22' y='24' width='256' height='352' rx='16' fill='rgba(255,255,255,0.10)'/>
    <text x='50%' y='55%' dominant-baseline='middle' text-anchor='middle' fill='rgba(255,255,255,0.9)' font-family='Arial' font-size='62' font-weight='700'>${initials}</text>
  </svg>`;
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

function toAbsoluteUrl(url) {
  if (!url) {
    return "";
  }
  if (url.startsWith("http://") || url.startsWith("https://") || url.startsWith("data:")) {
    return url;
  }
  return `${API_BASE_URL}${url}`;
}

function formatDate(value) {
  if (!value) {
    return "";
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "";
  }
  return date.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "2-digit" });
}

function truncateText(value, maxLength = 140) {
  const normalized = String(value || "").trim();
  if (!normalized) {
    return "Summary coming soon.";
  }
  if (normalized.length <= maxLength) {
    return normalized;
  }
  return `${normalized.slice(0, maxLength).trim()}...`;
}

function formatTypeLabel(type) {
  if (type === "both") {
    return "eBook + Audio";
  }
  if (type === "audiobook") {
    return "Audiobook";
  }
  return "eBook";
}

function buildBookStats(book) {
  const stats = [];

  if (typeof book.reads === "number" && book.reads > 0) {
    stats.push(`${book.reads} reads`);
  }

  if (typeof book.likes === "number" && book.likes > 0) {
    stats.push(`${book.likes} likes`);
  }

  const addedLabel = formatDate(book.createdAt);
  if (addedLabel) {
    stats.push(`Added ${addedLabel}`);
  }

  return stats;
}

function createBookCard(book, compact = false) {
  const coverSrc = toAbsoluteUrl(book.coverUrl) || createCoverSvg(book.title || "Book", book.genre || "default");
  const tags = [book.genre, ...(Array.isArray(book.tags) ? book.tags.slice(0, compact ? 1 : 3) : [])].filter(Boolean);
  const stats = buildBookStats(book);
  const card = document.createElement("article");
  card.className = compact ? "story-strip-card" : "card book-card";
  card.innerHTML = `
    <div class="card-top">
      <img class="cover" src="${coverSrc}" alt="${book.title} cover" loading="lazy" />
      <div class="label-row">
        <span class="pill">Published</span>
        <span class="pill">${formatTypeLabel(book.type)}</span>
      </div>
    </div>
    <div class="card-body">
      <h3>${book.title}</h3>
      <p class="muted">${book.authorName || "Unknown Author"}</p>
      <div class="chip-row">${tags.map((tag) => `<span class="chip">${tag}</span>`).join("")}</div>
      ${compact ? "" : `<p class="card-summary">${truncateText(book.description)}</p>`}
      ${stats.length ? `<div class="stat-row">${stats.map((item) => `<span>${item}</span>`).join("")}</div>` : ""}
      <div class="actions">
        <a href="/reader/book.html?id=${encodeURIComponent(book.id)}">Open</a>
        ${book.hasAudiobook ? `<a href="/reader/audiobook.html?book=${encodeURIComponent(book.id)}">Listen</a>` : ""}
        <button type="button" class="save-btn${state.savedBookIds.has(book.id) ? " saved" : ""}" data-save-book-id="${book.id}">${state.savedBookIds.has(book.id) ? "Saved" : "Save"}</button>
      </div>
    </div>
  `;
  return card;
}

function renderEmpty(container, message) {
  container.innerHTML = `<div class="empty">${message}</div>`;
}

function populateSelect(selectEl, values, label) {
  const options = [`<option value="all">All ${label}</option>`]
    .concat([...values].sort((a, b) => a.localeCompare(b)).map((value) => `<option value="${value}">${value}</option>`));
  selectEl.innerHTML = options.join("");
}

function renderCategoryChips() {
  elements.categoryChips.innerHTML = "";
  ["all", ...state.filterOptions.genres].forEach((category) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = `chip ${state.activeCategory === category ? "active" : ""}`;
    button.textContent = category === "all" ? "All" : category;
    button.addEventListener("click", () => {
      state.activeCategory = category;
      state.filters.genre = category;
      elements.filterGenre.value = category;
      state.pagination.page = 1;
      renderCategoryChips();
      loadDiscoverData();
    });
    elements.categoryChips.appendChild(button);
  });
}

function renderSection(panel, countEl, container, books, emptyMessage) {
  if (!books.length) {
    panel.hidden = true;
    container.innerHTML = "";
    if (countEl) {
      countEl.textContent = "0";
    }
    return;
  }

  panel.hidden = false;
  countEl.textContent = String(books.length);
  container.innerHTML = "";
  books.forEach((book) => container.appendChild(createBookCard(book, true)));

  if (!books.length && emptyMessage) {
    renderEmpty(container, emptyMessage);
  }
}

function syncFiltersFromForm() {
  state.filters.genre = elements.filterGenre.value;
  state.filters.type = elements.filterType.value;
  state.filters.sort = elements.filterSort.value;
  state.activeCategory = state.filters.genre;
}

function resetFilters() {
  state.filters = {
    genre: "all",
    type: "all",
    sort: "newest",
  };

  elements.filterGenre.value = "all";
  elements.filterType.value = "all";
  elements.filterSort.value = "newest";
  state.activeCategory = "all";
  state.pagination.page = 1;
  renderCategoryChips();
  loadDiscoverData();
}

function cloneFiltersForDrawer() {
  elements.drawerFiltersMount.innerHTML = "";
  elements.drawerFiltersMount.appendChild(document.getElementById("filtersSidebar").cloneNode(true));

  const drawerRoot = elements.drawerFiltersMount.querySelector("#filtersSidebar");
  if (!drawerRoot) {
    return;
  }

  drawerRoot.style.display = "grid";

  const bind = (id, handler) => {
    const el = drawerRoot.querySelector(`#${id}`);
    if (el) {
      el.addEventListener("input", handler);
      el.addEventListener("change", handler);
    }
  };

  bind("filterGenre", (event) => {
    elements.filterGenre.value = event.target.value;
    syncFiltersFromForm();
    state.pagination.page = 1;
    loadDiscoverData();
  });

  bind("filterType", (event) => {
    elements.filterType.value = event.target.value;
    syncFiltersFromForm();
    state.pagination.page = 1;
    loadDiscoverData();
  });

  bind("filterSort", (event) => {
    elements.filterSort.value = event.target.value;
    syncFiltersFromForm();
    state.pagination.page = 1;
    loadDiscoverData();
  });

  const resetBtn = drawerRoot.querySelector("#resetFiltersBtn");
  if (resetBtn) {
    resetBtn.addEventListener("click", resetFilters);
  }
}

function bindEvents() {
  elements.searchInput.addEventListener("input", () => {
    state.query = elements.searchInput.value;
    state.pagination.page = 1;
    window.clearTimeout(searchDebounceTimer);
    searchDebounceTimer = window.setTimeout(() => {
      loadDiscoverData();
    }, 180);
  });

  [elements.filterGenre, elements.filterType, elements.filterSort].forEach((control) => {
    control.addEventListener("change", () => {
      syncFiltersFromForm();
      state.pagination.page = 1;
      loadDiscoverData();
    });
  });

  elements.resetFiltersBtn.addEventListener("click", resetFilters);

  elements.prevPageBtn.addEventListener("click", () => {
    if (state.pagination.page <= 1) {
      return;
    }
    state.pagination.page -= 1;
    loadDiscoverData();
  });

  elements.nextPageBtn.addEventListener("click", () => {
    if (state.pagination.page >= state.pagination.totalPages) {
      return;
    }
    state.pagination.page += 1;
    loadDiscoverData();
  });

  elements.openDrawerBtn.addEventListener("click", () => {
    cloneFiltersForDrawer();
    elements.filterDrawer.classList.add("show");
    elements.filterDrawer.setAttribute("aria-hidden", "false");
  });

  elements.closeDrawerBtn.addEventListener("click", () => {
    elements.filterDrawer.classList.remove("show");
    elements.filterDrawer.setAttribute("aria-hidden", "true");
  });

  elements.filterDrawer.addEventListener("click", (event) => {
    if (event.target === elements.filterDrawer) {
      elements.filterDrawer.classList.remove("show");
      elements.filterDrawer.setAttribute("aria-hidden", "true");
    }
  });

  document.addEventListener("click", (event) => {
    const saveBtn = event.target.closest("[data-save-book-id]");
    if (!saveBtn) {
      return;
    }
    const bookId = saveBtn.dataset.saveBookId;
    toggleSave(bookId, saveBtn);
  });
}

function updateFilterOptions() {
  populateSelect(elements.filterGenre, state.filterOptions.genres, "Genres");
  elements.filterGenre.value = state.filters.genre;
}

function renderResults() {
  elements.booksCount.textContent = String(state.meta.matchingBooks || state.books.length);
  elements.pageInfo.textContent = `Page ${state.pagination.page} of ${state.pagination.totalPages}`;
  elements.prevPageBtn.disabled = state.pagination.page <= 1;
  elements.nextPageBtn.disabled = state.pagination.page >= state.pagination.totalPages;

  if (!state.meta.totalPublished) {
    elements.resultsMeta.textContent = "No published books are available yet.";
  } else if (!state.books.length) {
    elements.resultsMeta.textContent = `No published books matched your current search and filters. Catalog size: ${state.meta.totalPublished}.`;
  } else {
    elements.resultsMeta.textContent = `Showing ${state.books.length} of ${state.meta.matchingBooks} matching published books. Total catalog: ${state.meta.totalPublished}.`;
  }

  elements.booksResults.innerHTML = "";
  if (!state.books.length) {
    renderEmpty(elements.booksResults, "No published books match your current filters.");
  } else {
    state.books.forEach((book) => elements.booksResults.appendChild(createBookCard(book)));
  }

  renderSection(elements.featuredPanel, elements.featuredCount, elements.featuredBooks, state.sections.featured, "");
  renderSection(elements.trendingPanel, elements.trendingCount, elements.trendingBooks, state.sections.trending, "");

  if (!state.sections.recent.length) {
    elements.recentSection.hidden = true;
    elements.recentBooks.innerHTML = "";
    elements.recentCount.textContent = "0";
  } else {
    elements.recentSection.hidden = false;
    elements.recentCount.textContent = String(state.sections.recent.length);
    elements.recentBooks.innerHTML = "";
    state.sections.recent.forEach((book) => elements.recentBooks.appendChild(createBookCard(book, true)));
  }
}

async function loadDiscoverData() {
  const requestId = state.requestId + 1;
  state.requestId = requestId;
  elements.resultsMeta.textContent = "Loading published books...";

  const params = new URLSearchParams({
    page: String(state.pagination.page),
    limit: String(PAGE_SIZE),
    sort: state.filters.sort,
  });

  const genre = state.filters.genre !== "all" ? state.filters.genre : "";
  if (genre) {
    params.set("genre", genre);
  }
  if (state.filters.type !== "all") {
    params.set("type", state.filters.type);
  }
  if (state.query.trim()) {
    params.set("search", state.query.trim());
  }

  try {
    const response = await fetch(`${API_BASE_URL}/api/books/discover?${params.toString()}`, { cache: "no-store" });
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    const payload = await response.json();
    if (!payload.success) {
      throw new Error(payload.error || "Failed to load discover feed");
    }

    if (requestId !== state.requestId) {
      return;
    }

    state.books = Array.isArray(payload.data) ? payload.data : [];
    state.sections = {
      featured: payload.sections && Array.isArray(payload.sections.featured) ? payload.sections.featured : [],
      trending: payload.sections && Array.isArray(payload.sections.trending) ? payload.sections.trending : [],
      recent: payload.sections && Array.isArray(payload.sections.recent) ? payload.sections.recent : [],
    };
    state.filterOptions = payload.filterOptions || { genres: [], types: [], highlightedTags: [] };
    state.meta = payload.meta || { totalPublished: 0, matchingBooks: state.books.length };
    state.pagination = payload.pagination || { page: 1, totalPages: 1 };

    updateFilterOptions();
    renderCategoryChips();
    renderResults();
  } catch (error) {
    if (requestId !== state.requestId) {
      return;
    }

    state.books = [];
    state.sections = { featured: [], trending: [], recent: [] };
    state.filterOptions = { genres: [], types: [], highlightedTags: [] };
    state.meta = { totalPublished: 0, matchingBooks: 0 };
    state.pagination = { page: 1, totalPages: 1 };
    updateFilterOptions();
    renderCategoryChips();
    renderResults();
    elements.resultsMeta.textContent = error.message || "Unable to load published books.";
  }
}

async function bootstrap() {
  bindEvents();
  syncFiltersFromForm();
  await Promise.all([loadDiscoverData(), loadSavedBooks()]);
}

bootstrap();
