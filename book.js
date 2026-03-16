const SAVE_KEY = "novelread.savedBooks";
const FAVORITE_KEY = "novelread.favoriteBooks";

const elements = {
  coverImage: document.getElementById("coverImage"),
  readBtn: document.getElementById("readBtn"),
  listenBtn: document.getElementById("listenBtn"),
  saveBtn: document.getElementById("saveBtn"),
  favoriteBtn: document.getElementById("favoriteBtn"),
  shareBtn: document.getElementById("shareBtn"),
  bookTitle: document.getElementById("bookTitle"),
  bookAuthor: document.getElementById("bookAuthor"),
  genreTags: document.getElementById("genreTags"),
  ratingPlaceholder: document.getElementById("ratingPlaceholder"),
  bookDescription: document.getElementById("bookDescription"),
  aboutText: document.getElementById("aboutText"),
  metaLanguage: document.getElementById("metaLanguage"),
  metaChapters: document.getElementById("metaChapters"),
  metaFormat: document.getElementById("metaFormat"),
  metaAudio: document.getElementById("metaAudio"),
  chapterList: document.getElementById("chapterList"),
  audioTracksWrap: document.getElementById("audioTracksWrap"),
  trackList: document.getElementById("trackList"),
  reviewsList: document.getElementById("reviewsList"),
  relatedList: document.getElementById("relatedList"),
  tabButtons: [...document.querySelectorAll(".tab-btn")],
  tabPanels: [...document.querySelectorAll(".tab-panel")]
};

const fallbackData = {
  books: [
    {
      id: "book-last-lantern",
      title: "The Last Lantern",
      author: "M. K. Vale",
      genre: ["Mystery", "Thriller"],
      rating: null,
      description: "A detective returns to a coastal town where every answer is hidden in lighthouse logs and tide charts.",
      about: "The Last Lantern blends investigative suspense with atmospheric coastal fiction. As clues emerge from journals and forgotten boat ledgers, the story explores grief, legacy, and what people protect when the town is watching.",
      language: "English",
      chapters: [
        { number: 1, title: "A Light on the Water" },
        { number: 2, title: "Old Harbor Notes" },
        { number: 3, title: "The Keeper's Name" },
        { number: 4, title: "Storm Ledger" },
        { number: 5, title: "Signal in the Fog" }
      ],
      format: "eBook + Audiobook",
      hasAudiobook: true,
      audiobookTracks: [
        { number: 1, title: "Track 1 - A Light on the Water" },
        { number: 2, title: "Track 2 - Old Harbor Notes" },
        { number: 3, title: "Track 3 - The Keeper's Name" }
      ],
      reviews: [
        { name: "Rina", text: "Perfect pacing and an ending that lands." },
        { name: "Joel", text: "Loved the maritime setting and mystery threads." }
      ],
      relatedBooks: [
        { title: "Below Quiet Waters", author: "Adrian Poe" },
        { title: "Copper Rain", author: "Elio Park" }
      ]
    }
  ]
};

let books = [];
let currentBook = null;
let savedBooks = loadSet(SAVE_KEY);
let favoriteBooks = loadSet(FAVORITE_KEY);

function loadSet(key) {
  try {
    const raw = localStorage.getItem(key);
    const parsed = JSON.parse(raw || "[]");
    return new Set(Array.isArray(parsed) ? parsed : []);
  } catch (error) {
    return new Set();
  }
}

function persistSet(key, setValue) {
  localStorage.setItem(key, JSON.stringify([...setValue]));
}

function getBookIdFromUrl() {
  const params = new URLSearchParams(window.location.search);
  return params.get("id") || "book-last-lantern";
}

function getInitialTabFromUrl() {
  const params = new URLSearchParams(window.location.search);
  const requestedTab = params.get("tab");
  if (["about", "chapters", "reviews", "related"].includes(requestedTab)) {
    return requestedTab;
  }
  return "about";
}

function getModeFromUrl() {
  const params = new URLSearchParams(window.location.search);
  return params.get("mode") || "read";
}

function createCoverSvg(title, genreList) {
  const initials = title
    .split(" ")
    .map((word) => word[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();

  const primaryGenre = Array.isArray(genreList) && genreList.length ? genreList[0] : "default";
  const palette = {
    Mystery: ["#23323f", "#46667b"],
    Fantasy: ["#553458", "#9d6aa6"],
    Thriller: ["#3f2a1b", "#ab6a3a"],
    Romance: ["#6a3047", "#bf6e91"],
    "Sci-Fi": ["#1f3d55", "#53a2d8"],
    Historical: ["#4f412d", "#a58a5a"],
    Epic: ["#253b2f", "#6a9f74"],
    Drama: ["#3f3348", "#8672a1"],
    Horror: ["#282225", "#7f4f59"],
    Adventure: ["#2b4337", "#5f9267"],
    Contemporary: ["#2f3945", "#7191b1"],
    Audiobook: ["#4a3325", "#b67c4b"],
    default: ["#2d3b3a", "#608982"]
  };

  const [c1, c2] = palette[primaryGenre] || palette.default;
  const svg = `<svg xmlns='http://www.w3.org/2000/svg' width='500' height='680'>
    <defs>
      <linearGradient id='g' x1='0' x2='1' y1='0' y2='1'>
        <stop offset='0%' stop-color='${c1}'/>
        <stop offset='100%' stop-color='${c2}'/>
      </linearGradient>
    </defs>
    <rect width='100%' height='100%' rx='28' fill='url(#g)'/>
    <rect x='30' y='32' width='440' height='616' rx='18' fill='rgba(255,255,255,0.1)'/>
    <text x='50%' y='55%' dominant-baseline='middle' text-anchor='middle' fill='rgba(255,255,255,0.92)' font-family='Arial' font-size='92' font-weight='700'>${initials}</text>
  </svg>`;

  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

function showToast(message) {
  const toast = document.createElement("div");
  toast.className = "toast";
  toast.textContent = message;
  document.body.appendChild(toast);

  window.setTimeout(() => {
    toast.remove();
  }, 1500);
}

function renderGenres(genres) {
  elements.genreTags.innerHTML = "";
  genres.forEach((genre) => {
    const chip = document.createElement("span");
    chip.className = "tag";
    chip.textContent = genre;
    elements.genreTags.appendChild(chip);
  });
}

function renderChapterList(chapters) {
  elements.chapterList.innerHTML = "";
  chapters.forEach((chapter) => {
    const li = document.createElement("li");
    li.innerHTML = `
      <button class="chapter-item" type="button" data-chapter-number="${chapter.number}">
        <span>Chapter ${chapter.number}</span>
        ${chapter.title}
      </button>
    `;
    elements.chapterList.appendChild(li);
  });
}

function renderAudioTracks(book) {
  if (!book.hasAudiobook || !Array.isArray(book.audiobookTracks) || !book.audiobookTracks.length) {
    elements.audioTracksWrap.classList.add("hidden");
    elements.trackList.innerHTML = "";
    return;
  }

  elements.audioTracksWrap.classList.remove("hidden");
  elements.trackList.innerHTML = "";

  book.audiobookTracks.forEach((track) => {
    const li = document.createElement("li");
    li.innerHTML = `
      <button class="chapter-item" type="button" data-track-number="${track.number}">
        <span>Track ${track.number}</span>
        ${track.title}
      </button>
    `;
    elements.trackList.appendChild(li);
  });
}

function renderReviews(reviews) {
  elements.reviewsList.innerHTML = "";
  if (!reviews.length) {
    elements.reviewsList.innerHTML = "<p>No reviews yet.</p>";
    return;
  }

  reviews.forEach((review) => {
    const card = document.createElement("article");
    card.className = "review-card";
    card.innerHTML = `<strong>${review.name}</strong><p>${review.text}</p>`;
    elements.reviewsList.appendChild(card);
  });
}

function renderRelatedBooks(relatedBooks) {
  elements.relatedList.innerHTML = "";
  if (!relatedBooks.length) {
    elements.relatedList.innerHTML = "<p>No related books available.</p>";
    return;
  }

  relatedBooks.forEach((book) => {
    const card = document.createElement("article");
    card.className = "related-card";
    card.innerHTML = `<strong>${book.title}</strong><p>${book.author}</p>`;
    elements.relatedList.appendChild(card);
  });
}

function renderBook(book) {
  currentBook = book;
  document.title = `${book.title} | NovelRead`;

  elements.coverImage.src = createCoverSvg(book.title, book.genre);
  elements.coverImage.alt = `${book.title} cover`;
  elements.bookTitle.textContent = book.title;
  elements.bookAuthor.textContent = `by ${book.author}`;
  renderGenres(book.genre);
  elements.ratingPlaceholder.textContent = `Rating: ${book.rating === null ? "--.--" : book.rating.toFixed(1)} / 5.0`;
  elements.bookDescription.textContent = book.description;
  elements.aboutText.textContent = book.about;

  elements.metaLanguage.textContent = book.language;
  elements.metaChapters.textContent = String(book.chapters.length);
  elements.metaFormat.textContent = book.format;
  elements.metaAudio.textContent = book.hasAudiobook ? "Available" : "Not available";

  renderChapterList(book.chapters);
  renderAudioTracks(book);
  renderReviews(book.reviews || []);
  renderRelatedBooks(book.relatedBooks || []);

  const saved = savedBooks.has(book.id);
  elements.saveBtn.textContent = saved ? "Saved in Library" : "Save to Library";

  const favored = favoriteBooks.has(book.id);
  elements.favoriteBtn.textContent = favored ? "Favorited" : "Bookmark/Favorite";

  elements.listenBtn.disabled = !book.hasAudiobook;
}

function setActiveTab(tabName) {
  elements.tabButtons.forEach((button) => {
    const active = button.dataset.tab === tabName;
    button.classList.toggle("active", active);
    button.setAttribute("aria-selected", String(active));
  });

  elements.tabPanels.forEach((panel) => {
    const active = panel.dataset.panel === tabName;
    panel.classList.toggle("active", active);
  });
}

function setupTabEvents() {
  elements.tabButtons.forEach((button) => {
    button.addEventListener("click", () => {
      setActiveTab(button.dataset.tab);
    });
  });
}

function openReader(chapterNumber) {
  window.location.href = `reader.html?book=${encodeURIComponent(currentBook.id)}&chapter=${encodeURIComponent(chapterNumber)}`;
}

function setupChapterEvents() {
  elements.chapterList.addEventListener("click", (event) => {
    const button = event.target.closest("button[data-chapter-number]");
    if (!button) {
      return;
    }
    openReader(button.dataset.chapterNumber);
  });

  elements.trackList.addEventListener("click", (event) => {
    const button = event.target.closest("button[data-track-number]");
    if (!button) {
      return;
    }
    showToast(`Opening track ${button.dataset.trackNumber}`);
  });
}

function setupPrimaryActions() {
  elements.readBtn.addEventListener("click", () => {
    openReader(1);
  });

  elements.listenBtn.addEventListener("click", () => {
    if (!currentBook.hasAudiobook) {
      return;
    }
    window.location.href = `audiobook.html?book=${encodeURIComponent(currentBook.id)}`;
  });

  elements.saveBtn.addEventListener("click", () => {
    if (savedBooks.has(currentBook.id)) {
      savedBooks.delete(currentBook.id);
      elements.saveBtn.textContent = "Save to Library";
      showToast("Removed from your library");
    } else {
      savedBooks.add(currentBook.id);
      elements.saveBtn.textContent = "Saved in Library";
      showToast("Saved to your library");
    }
    persistSet(SAVE_KEY, savedBooks);
  });

  elements.favoriteBtn.addEventListener("click", () => {
    if (favoriteBooks.has(currentBook.id)) {
      favoriteBooks.delete(currentBook.id);
      elements.favoriteBtn.textContent = "Bookmark/Favorite";
      showToast("Removed from favorites");
    } else {
      favoriteBooks.add(currentBook.id);
      elements.favoriteBtn.textContent = "Favorited";
      showToast("Added to favorites");
    }
    persistSet(FAVORITE_KEY, favoriteBooks);
  });

  elements.shareBtn.addEventListener("click", async () => {
    const shareUrl = window.location.href;

    if (navigator.share) {
      try {
        await navigator.share({
          title: currentBook.title,
          text: `Check out ${currentBook.title} on NovelRead`,
          url: shareUrl
        });
      } catch (error) {
        showToast("Share canceled");
      }
      return;
    }

    try {
      await navigator.clipboard.writeText(shareUrl);
      showToast("Book link copied");
    } catch (error) {
      showToast("Unable to copy link");
    }
  });
}

async function loadData() {
  try {
    const response = await fetch("./data/book-details.json", { cache: "no-store" });
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    const data = await response.json();
    books = Array.isArray(data.books) ? data.books : fallbackData.books;
  } catch (error) {
    books = fallbackData.books;
  }
}

function findBookById(bookId) {
  return books.find((book) => book.id === bookId) || books[0];
}

async function bootstrap() {
  await loadData();
  const bookId = getBookIdFromUrl();
  renderBook(findBookById(bookId));
  setupTabEvents();
  setupChapterEvents();
  setupPrimaryActions();
  setActiveTab(getInitialTabFromUrl());
  if (getModeFromUrl() === "audio" && currentBook.hasAudiobook) {
    showToast("Audiobook tracks ready");
  }
}

bootstrap();
