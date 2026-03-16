const elements = {
  searchInput: document.getElementById("searchInput"),
  categoryChips: document.getElementById("categoryChips"),
  trendingSearches: document.getElementById("trendingSearches"),
  recommendedGenres: document.getElementById("recommendedGenres"),
  filterGenre: document.getElementById("filterGenre"),
  filterLanguage: document.getElementById("filterLanguage"),
  filterType: document.getElementById("filterType"),
  filterAccess: document.getElementById("filterAccess"),
  filterSort: document.getElementById("filterSort"),
  minPopularity: document.getElementById("minPopularity"),
  minPopularityText: document.getElementById("minPopularityText"),
  resetFiltersBtn: document.getElementById("resetFiltersBtn"),
  resultsMeta: document.getElementById("resultsMeta"),
  booksCount: document.getElementById("booksCount"),
  authorsCount: document.getElementById("authorsCount"),
  audioCount: document.getElementById("audioCount"),
  booksResults: document.getElementById("booksResults"),
  authorsResults: document.getElementById("authorsResults"),
  audioResults: document.getElementById("audioResults"),
  openDrawerBtn: document.getElementById("openDrawerBtn"),
  closeDrawerBtn: document.getElementById("closeDrawerBtn"),
  filterDrawer: document.getElementById("filterDrawer"),
  drawerFiltersMount: document.getElementById("drawerFiltersMount")
};

const state = {
  data: {
    books: [],
    authors: [],
    audiobooks: [],
    categories: [],
    trendingSearches: [],
    recommendedGenres: []
  },
  query: "",
  activeCategory: "All",
  filters: {
    genre: "all",
    language: "all",
    type: "all",
    access: "all",
    sort: "relevance",
    minPopularity: 0
  }
};

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

function normalizeText(value) {
  return String(value || "").toLowerCase();
}

function matchesQuery(item, query, extraFields = []) {
  if (!query.trim()) {
    return true;
  }

  const haystack = [
    item.title,
    item.author,
    item.genre,
    ...(item.tags || []),
    ...extraFields
  ]
    .join(" ")
    .toLowerCase();

  return haystack.includes(query.toLowerCase());
}

function applyCommonFilters(item) {
  if (state.filters.genre !== "all" && item.genre !== state.filters.genre) {
    return false;
  }

  if (state.filters.language !== "all" && item.language !== state.filters.language) {
    return false;
  }

  if (state.filters.type !== "all" && item.type !== state.filters.type) {
    return false;
  }

  if (state.filters.access !== "all" && item.access !== state.filters.access) {
    return false;
  }

  if ((item.popularity || 0) < state.filters.minPopularity) {
    return false;
  }

  if (state.activeCategory !== "All") {
    const categoryTarget = normalizeText(state.activeCategory);
    const values = [item.genre, item.type, ...(item.tags || [])].map(normalizeText);
    if (!values.includes(categoryTarget)) {
      return false;
    }
  }

  return true;
}

function sortItems(items) {
  const sorted = [...items];
  if (state.filters.sort === "title") {
    sorted.sort((a, b) => String(a.title || "").localeCompare(String(b.title || "")));
    return sorted;
  }

  if (state.filters.sort === "popularity") {
    sorted.sort((a, b) => (b.popularity || 0) - (a.popularity || 0));
    return sorted;
  }

  if (state.filters.sort === "newest") {
    sorted.sort((a, b) => new Date(b.publishedAt || 0).getTime() - new Date(a.publishedAt || 0).getTime());
    return sorted;
  }

  return sorted;
}

function createBookCard(book) {
  const card = document.createElement("article");
  card.className = "card";
  card.innerHTML = `
    <img class="cover" src="${createCoverSvg(book.title, book.genre)}" alt="${book.title} cover" loading="lazy" />
    <h3>${book.title}</h3>
    <p class="muted">${book.author}</p>
    <div class="chip-row">${(book.tags || []).slice(0, 3).map((tag) => `<span class="chip">${tag}</span>`).join("")}</div>
    <div class="actions">
      <a href="book.html?id=${encodeURIComponent(book.id)}">Open</a>
      ${book.type === "audiobook" || book.type === "both" ? `<a href="audiobook.html?book=${encodeURIComponent(book.id)}">Listen</a>` : ""}
    </div>
  `;
  return card;
}

function createAudioCard(item) {
  const card = document.createElement("article");
  card.className = "card";
  card.innerHTML = `
    <img class="cover" src="${createCoverSvg(item.title, item.genre)}" alt="${item.title} cover" loading="lazy" />
    <h3>${item.title}</h3>
    <p class="muted">${item.author}</p>
    <p class="muted">${item.trackCount} tracks</p>
    <div class="actions">
      <a href="audiobook.html?book=${encodeURIComponent(item.id)}">Play</a>
      <a href="book.html?id=${encodeURIComponent(item.id)}">Details</a>
    </div>
  `;
  return card;
}

function createAuthorCard(author) {
  const card = document.createElement("article");
  card.className = "author-card";
  card.innerHTML = `
    <h3>${author.name}</h3>
    <p class="muted">Genres: ${(author.genres || []).join(", ")}</p>
    <p class="muted">Books: ${author.bookCount}</p>
    <div class="chip-row">${(author.tags || []).map((tag) => `<span class="chip">${tag}</span>`).join("")}</div>
  `;
  return card;
}

function renderEmpty(container, message) {
  container.innerHTML = `<div class="empty">${message}</div>`;
}

function renderResults() {
  const query = state.query;

  const filteredBooks = sortItems(
    state.data.books.filter((book) => matchesQuery(book, query) && applyCommonFilters(book))
  );

  const filteredAudio = sortItems(
    state.data.audiobooks.filter((item) => {
      const asBookLike = {
        ...item,
        type: "audiobook",
        access: item.access || "paid",
        language: item.language || "English"
      };
      return matchesQuery(item, query) && applyCommonFilters(asBookLike);
    })
  );

  const filteredAuthors = sortItems(
    state.data.authors.filter((author) => {
      if (!matchesQuery({ title: author.name, author: author.name, genre: (author.genres || []).join(" "), tags: author.tags || [] }, query)) {
        return false;
      }

      if (state.filters.genre !== "all" && !(author.genres || []).includes(state.filters.genre)) {
        return false;
      }

      if (state.filters.minPopularity > 0 && (author.popularity || 0) < state.filters.minPopularity) {
        return false;
      }

      return true;
    })
  );

  elements.booksCount.textContent = String(filteredBooks.length);
  elements.audioCount.textContent = String(filteredAudio.length);
  elements.authorsCount.textContent = String(filteredAuthors.length);

  const total = filteredBooks.length + filteredAudio.length + filteredAuthors.length;
  elements.resultsMeta.textContent = `${total} total results`;

  elements.booksResults.innerHTML = "";
  elements.audioResults.innerHTML = "";
  elements.authorsResults.innerHTML = "";

  if (!filteredBooks.length) {
    renderEmpty(elements.booksResults, "No books match your search.");
  } else {
    filteredBooks.forEach((book) => elements.booksResults.appendChild(createBookCard(book)));
  }

  if (!filteredAudio.length) {
    renderEmpty(elements.audioResults, "No audiobooks found.");
  } else {
    filteredAudio.forEach((item) => elements.audioResults.appendChild(createAudioCard(item)));
  }

  if (!filteredAuthors.length) {
    renderEmpty(elements.authorsResults, "No authors match your filters.");
  } else {
    filteredAuthors.forEach((author) => elements.authorsResults.appendChild(createAuthorCard(author)));
  }
}

function populateSelect(selectEl, values, label) {
  const options = [`<option value="all">All ${label}</option>`]
    .concat([...values].sort((a, b) => a.localeCompare(b)).map((value) => `<option value="${value}">${value}</option>`));
  selectEl.innerHTML = options.join("");
}

function renderCategoryChips() {
  elements.categoryChips.innerHTML = "";
  state.data.categories.forEach((category) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = `chip ${state.activeCategory === category ? "active" : ""}`;
    button.textContent = category;
    button.addEventListener("click", () => {
      state.activeCategory = category;
      renderCategoryChips();
      renderResults();
    });
    elements.categoryChips.appendChild(button);
  });
}

function renderQuickChips() {
  elements.trendingSearches.innerHTML = "";
  state.data.trendingSearches.forEach((text) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "chip";
    button.textContent = text;
    button.addEventListener("click", () => {
      state.query = text;
      elements.searchInput.value = text;
      renderResults();
    });
    elements.trendingSearches.appendChild(button);
  });

  elements.recommendedGenres.innerHTML = "";
  state.data.recommendedGenres.forEach((genre) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "chip";
    button.textContent = genre;
    button.addEventListener("click", () => {
      state.filters.genre = genre;
      elements.filterGenre.value = genre;
      renderResults();
    });
    elements.recommendedGenres.appendChild(button);
  });
}

function syncFiltersFromForm() {
  state.filters.genre = elements.filterGenre.value;
  state.filters.language = elements.filterLanguage.value;
  state.filters.type = elements.filterType.value;
  state.filters.access = elements.filterAccess.value;
  state.filters.sort = elements.filterSort.value;
  state.filters.minPopularity = Number(elements.minPopularity.value);
  elements.minPopularityText.textContent = `${state.filters.minPopularity}+`;
}

function resetFilters() {
  state.filters = {
    genre: "all",
    language: "all",
    type: "all",
    access: "all",
    sort: "relevance",
    minPopularity: 0
  };

  elements.filterGenre.value = "all";
  elements.filterLanguage.value = "all";
  elements.filterType.value = "all";
  elements.filterAccess.value = "all";
  elements.filterSort.value = "relevance";
  elements.minPopularity.value = "0";
  elements.minPopularityText.textContent = "0+";
  state.activeCategory = "All";
  renderCategoryChips();
  renderResults();
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
    renderResults();
  });

  bind("filterLanguage", (event) => {
    elements.filterLanguage.value = event.target.value;
    syncFiltersFromForm();
    renderResults();
  });

  bind("filterType", (event) => {
    elements.filterType.value = event.target.value;
    syncFiltersFromForm();
    renderResults();
  });

  bind("filterAccess", (event) => {
    elements.filterAccess.value = event.target.value;
    syncFiltersFromForm();
    renderResults();
  });

  bind("filterSort", (event) => {
    elements.filterSort.value = event.target.value;
    syncFiltersFromForm();
    renderResults();
  });

  bind("minPopularity", (event) => {
    elements.minPopularity.value = event.target.value;
    syncFiltersFromForm();
    renderResults();
    const txt = drawerRoot.querySelector("#minPopularityText");
    if (txt) {
      txt.textContent = `${event.target.value}+`;
    }
  });

  const resetBtn = drawerRoot.querySelector("#resetFiltersBtn");
  if (resetBtn) {
    resetBtn.addEventListener("click", resetFilters);
  }
}

function bindEvents() {
  elements.searchInput.addEventListener("input", () => {
    state.query = elements.searchInput.value;
    renderResults();
  });

  [elements.filterGenre, elements.filterLanguage, elements.filterType, elements.filterAccess, elements.filterSort, elements.minPopularity].forEach((control) => {
    control.addEventListener("change", () => {
      syncFiltersFromForm();
      renderResults();
    });
    control.addEventListener("input", () => {
      syncFiltersFromForm();
      renderResults();
    });
  });

  elements.resetFiltersBtn.addEventListener("click", resetFilters);

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
}

async function loadData() {
  try {
    const response = await fetch("./data/discover.json", { cache: "no-store" });
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    const payload = await response.json();
    state.data = {
      books: Array.isArray(payload.books) ? payload.books : [],
      authors: Array.isArray(payload.authors) ? payload.authors : [],
      audiobooks: Array.isArray(payload.audiobooks) ? payload.audiobooks : [],
      categories: Array.isArray(payload.categories) ? payload.categories : ["All"],
      trendingSearches: Array.isArray(payload.trendingSearches) ? payload.trendingSearches : [],
      recommendedGenres: Array.isArray(payload.recommendedGenres) ? payload.recommendedGenres : []
    };
  } catch (error) {
    state.data = {
      books: [],
      authors: [],
      audiobooks: [],
      categories: ["All"],
      trendingSearches: [],
      recommendedGenres: []
    };
  }
}

function setupFilterOptions() {
  const genres = new Set(state.data.books.map((book) => book.genre).concat(state.data.audiobooks.map((item) => item.genre)).filter(Boolean));
  const languages = new Set(state.data.books.map((book) => book.language).concat(state.data.audiobooks.map((item) => item.language)).filter(Boolean));
  populateSelect(elements.filterGenre, genres, "Genres");
  populateSelect(elements.filterLanguage, languages, "Languages");
}

async function bootstrap() {
  await loadData();
  setupFilterOptions();
  renderCategoryChips();
  renderQuickChips();
  bindEvents();
  syncFiltersFromForm();
  renderResults();
}

bootstrap();
