const ADMIN_AUTH_KEY = "novelread.admin.auth";
const API_BASE_URL = `${window.location.protocol}//${window.location.hostname || "localhost"}:5001`;
const PAGE_SIZE = 8;

const elements = {
  logoutBtn: document.getElementById("logoutBtn"),
  searchInput: document.getElementById("searchInput"),
  statusFilter: document.getElementById("statusFilter"),
  sourceFilter: document.getElementById("sourceFilter"),
  viewMode: document.getElementById("viewMode"),
  resultsMeta: document.getElementById("resultsMeta"),
  tableView: document.getElementById("tableView"),
  gridView: document.getElementById("gridView"),
  booksTableBody: document.getElementById("booksTableBody"),
  prevPageBtn: document.getElementById("prevPageBtn"),
  nextPageBtn: document.getElementById("nextPageBtn"),
  pageMeta: document.getElementById("pageMeta"),
  editModal: document.getElementById("editModal"),
  closeEditModalBtn: document.getElementById("closeEditModalBtn"),
  editBookForm: document.getElementById("editBookForm"),
  editTitle: document.getElementById("editTitle"),
  editAuthor: document.getElementById("editAuthor"),
  editGenre: document.getElementById("editGenre"),
  editFileType: document.getElementById("editFileType"),
  editStatus: document.getElementById("editStatus"),
  editTags: document.getElementById("editTags"),
  editDescription: document.getElementById("editDescription"),
  editIsAudiobookAvailable: document.getElementById("editIsAudiobookAvailable"),
  editIsAiGenerated: document.getElementById("editIsAiGenerated"),
  editFormError: document.getElementById("editFormError"),
};

const state = {
  books: [],
  currentPage: 1,
  query: "",
  status: "all",
  source: "all",
  view: "table",
  editingBookId: "",
};

function requireAuth() {
  const auth = localStorage.getItem(ADMIN_AUTH_KEY);
  if (auth !== "1") {
    const next = encodeURIComponent("admin-books.html");
    window.location.href = `admin-login.html?next=${next}`;
    return false;
  }
  return true;
}

function showToast(message) {
  const toast = document.createElement("div");
  toast.className = "toast";
  toast.textContent = message;
  document.body.appendChild(toast);
  window.setTimeout(() => toast.remove(), 1400);
}

function createCoverSvg(title, genre) {
  const initials = String(title || "Book")
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
    default: ["#2d3b3a", "#608982"],
  };

  const [c1, c2] = palette[genre] || palette.default;
  const svg = `<svg xmlns='http://www.w3.org/2000/svg' width='220' height='300'>
    <defs>
      <linearGradient id='g' x1='0' x2='1' y1='0' y2='1'>
        <stop offset='0%' stop-color='${c1}'/>
        <stop offset='100%' stop-color='${c2}'/>
      </linearGradient>
    </defs>
    <rect width='100%' height='100%' rx='16' fill='url(#g)'/>
    <rect x='14' y='16' width='192' height='268' rx='12' fill='rgba(255,255,255,0.10)'/>
    <text x='50%' y='56%' dominant-baseline='middle' text-anchor='middle' fill='rgba(255,255,255,0.92)' font-family='Arial' font-size='52' font-weight='700'>${initials}</text>
  </svg>`;

  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

function formatDate(value) {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return "-";
  }
  return parsed.toLocaleString();
}

function formatStatus(value) {
  return String(value || "DRAFT").toUpperCase() === "PUBLISHED" ? "published" : "draft";
}

function getSource(value) {
  return value ? "ai-generated" : "uploaded-manually";
}

function getTypeLabel(book) {
  const fileTypeMap = {
    TXT: "Text Chapters",
    EPUB: "EPUB",
    PDF: "PDF",
  };

  const base = fileTypeMap[book.fileType] || "Text Chapters";
  return book.isAudiobookAvailable ? `${base} + Audio` : base;
}

function normalizeBook(book) {
  return {
    id: book.id,
    title: book.title || "Untitled",
    author: book.authorName || "Unknown Author",
    genre: book.genre || "General",
    coverUrl: book.coverUrl || "",
    status: formatStatus(book.status),
    source: getSource(book.isAiGenerated),
    type: getTypeLabel(book),
    createdDate: formatDate(book.createdAt),
    createdAt: book.createdAt || "",
    description: book.description || "",
    tags: Array.isArray(book.tags) ? book.tags : [],
    fileType: book.fileType || "TXT",
    isAudiobookAvailable: Boolean(book.isAudiobookAvailable),
    isAiGenerated: Boolean(book.isAiGenerated),
  };
}

async function apiFetch(path, options = {}) {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    credentials: "include",
    cache: "no-store",
    ...options,
  });

  const payload = await response.json().catch(() => ({ success: false }));
  if (response.status === 401 || response.status === 403) {
    localStorage.removeItem(ADMIN_AUTH_KEY);
    const next = encodeURIComponent("admin-books.html");
    window.location.href = `admin-login.html?next=${next}`;
    throw new Error("Authentication required");
  }

  if (!response.ok || !payload.success) {
    throw new Error(payload.error || `HTTP ${response.status}`);
  }

  return payload;
}

function applyFilters(source) {
  const q = state.query.trim().toLowerCase();
  return source.filter((book) => {
    if (state.status !== "all" && book.status !== state.status) {
      return false;
    }

    if (state.source !== "all" && book.source !== state.source) {
      return false;
    }

    if (!q) {
      return true;
    }

    const haystack = [book.title, book.author, book.genre, book.type, ...(book.tags || [])].join(" ").toLowerCase();
    return haystack.includes(q);
  });
}

function paginate(items) {
  const totalPages = Math.max(1, Math.ceil(items.length / PAGE_SIZE));
  state.currentPage = Math.min(state.currentPage, totalPages);
  const start = (state.currentPage - 1) * PAGE_SIZE;
  const visible = items.slice(start, start + PAGE_SIZE);
  return { visible, totalPages, total: items.length };
}

function createActions(book) {
  const publishLabel = book.status === "published" ? "Unpublish" : "Publish";
  return `
    <div class="actions">
      <button type="button" data-action="edit" data-id="${book.id}">Edit</button>
      <button type="button" data-action="delete" data-id="${book.id}">Delete</button>
      <button type="button" data-action="toggle-publish" data-id="${book.id}">${publishLabel}</button>
      <button type="button" data-action="chapters" data-id="${book.id}">Manage Chapters</button>
      <button type="button" data-action="audio" data-id="${book.id}">Upload Audio</button>
      <a href="book.html?id=${encodeURIComponent(book.id)}" data-action="preview" data-id="${book.id}">Preview</a>
    </div>
  `;
}

function renderTable(items) {
  elements.booksTableBody.innerHTML = "";

  if (!items.length) {
    const tr = document.createElement("tr");
    tr.innerHTML = '<td colspan="7">No real books found for the current filters.</td>';
    elements.booksTableBody.appendChild(tr);
    return;
  }

  items.forEach((book) => {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td><img class="cover-thumb" src="${book.coverUrl || createCoverSvg(book.title, book.genre)}" alt="${book.title} cover" loading="lazy" /></td>
      <td>
        <strong>${book.title}</strong>
        <div class="source-chip">${book.source === "ai-generated" ? "AI-generated" : book.genre}</div>
      </td>
      <td>${book.author}</td>
      <td>${book.type}</td>
      <td><span class="status ${book.status}">${book.status}</span></td>
      <td>${book.createdDate}</td>
      <td>${createActions(book)}</td>
    `;
    elements.booksTableBody.appendChild(tr);
  });
}

function renderGrid(items) {
  elements.gridView.innerHTML = "";

  if (!items.length) {
    elements.gridView.innerHTML = "<article class=\"book-card\"><h3>No real books found</h3><p>Change filters or create a book from the upload page.</p></article>";
    return;
  }

  items.forEach((book) => {
    const card = document.createElement("article");
    card.className = "book-card";
    card.innerHTML = `
      <img class="cover-thumb" src="${book.coverUrl || createCoverSvg(book.title, book.genre)}" alt="${book.title} cover" loading="lazy" />
      <h3>${book.title}</h3>
      <p>${book.author} • ${book.type}</p>
      <p>${book.createdDate}</p>
      <span class="status ${book.status}">${book.status}</span>
      <span class="source-chip">${book.source === "ai-generated" ? "AI-generated" : book.genre}</span>
      ${createActions(book)}
    `;
    elements.gridView.appendChild(card);
  });
}

function render() {
  const filtered = applyFilters(state.books);
  const { visible, totalPages, total } = paginate(filtered);

  elements.resultsMeta.textContent = `${total} results`;
  elements.pageMeta.textContent = `Page ${state.currentPage} of ${totalPages}`;
  elements.prevPageBtn.disabled = state.currentPage === 1;
  elements.nextPageBtn.disabled = state.currentPage === totalPages;

  elements.tableView.classList.toggle("hidden", state.view !== "table");
  elements.gridView.classList.toggle("hidden", state.view !== "grid");

  renderTable(visible);
  renderGrid(visible);
}

function setEditError(message) {
  elements.editFormError.textContent = message;
}

function openEditModal(book) {
  state.editingBookId = book.id;
  elements.editTitle.value = book.title;
  elements.editAuthor.value = book.author;
  elements.editGenre.value = book.genre;
  elements.editFileType.value = book.fileType;
  elements.editStatus.value = book.status === "published" ? "PUBLISHED" : "DRAFT";
  elements.editTags.value = (book.tags || []).join(", ");
  elements.editDescription.value = book.description || "";
  elements.editIsAudiobookAvailable.checked = book.isAudiobookAvailable;
  elements.editIsAiGenerated.checked = book.source === "ai-generated";
  setEditError("");
  elements.editModal.classList.remove("hidden");
  elements.editModal.setAttribute("aria-hidden", "false");
}

function closeEditModal() {
  state.editingBookId = "";
  elements.editModal.classList.add("hidden");
  elements.editModal.setAttribute("aria-hidden", "true");
  setEditError("");
}

async function refreshBooks() {
  const allBooks = [];
  let page = 1;
  let totalPages = 1;

  while (page <= totalPages) {
    const payload = await apiFetch(`/api/admin/books?page=${page}&limit=100&sort=newest`);
    const pageItems = Array.isArray(payload.data) ? payload.data : [];
    allBooks.push(...pageItems.map(normalizeBook));
    totalPages = payload.pagination && payload.pagination.totalPages ? payload.pagination.totalPages : 1;
    page += 1;
  }

  state.books = allBooks;
}

async function handleAction(action, id) {
  const book = state.books.find((item) => item.id === id);
  if (!book) {
    return;
  }

  if (action === "delete") {
    if (!window.confirm(`Delete ${book.title}? This removes the book and its related content.`)) {
      return;
    }

    await apiFetch(`/api/admin/books/${encodeURIComponent(id)}`, { method: "DELETE" });
    state.books = state.books.filter((item) => item.id !== id);
    showToast("Book deleted");
    render();
    return;
  }

  if (action === "toggle-publish") {
    const endpoint = book.status === "published"
      ? `/api/admin/books/${encodeURIComponent(id)}/unpublish`
      : `/api/admin/books/${encodeURIComponent(id)}/publish`;
    await apiFetch(endpoint, { method: "POST" });
    await refreshBooks();
    showToast("Publication status updated");
    render();
    return;
  }

  if (action === "edit") {
    openEditModal(book);
    return;
  }

  if (action === "chapters") {
    window.location.href = `admin-chapters.html?bookId=${encodeURIComponent(book.id)}`;
    return;
  }

  if (action === "audio") {
    window.location.href = `admin-audiobooks.html?bookId=${encodeURIComponent(book.id)}`;
  }
}

function bindEvents() {
  elements.logoutBtn.addEventListener("click", () => {
    localStorage.removeItem(ADMIN_AUTH_KEY);
    window.location.href = "index.html";
  });

  elements.searchInput.addEventListener("input", () => {
    state.query = elements.searchInput.value;
    state.currentPage = 1;
    render();
  });

  elements.statusFilter.addEventListener("change", () => {
    state.status = elements.statusFilter.value;
    state.currentPage = 1;
    render();
  });

  elements.sourceFilter.addEventListener("change", () => {
    state.source = elements.sourceFilter.value;
    state.currentPage = 1;
    render();
  });

  elements.viewMode.addEventListener("change", () => {
    state.view = elements.viewMode.value;
    render();
  });

  elements.prevPageBtn.addEventListener("click", () => {
    if (state.currentPage > 1) {
      state.currentPage -= 1;
      render();
    }
  });

  elements.nextPageBtn.addEventListener("click", () => {
    state.currentPage += 1;
    render();
  });

  document.addEventListener("click", async (event) => {
    const closeTarget = event.target.closest("[data-close-modal]");
    if (closeTarget) {
      closeEditModal();
      return;
    }

    const actionEl = event.target.closest("[data-action][data-id]");
    if (!actionEl || actionEl.tagName === "A") {
      return;
    }

    try {
      await handleAction(actionEl.dataset.action, actionEl.dataset.id);
    } catch (error) {
      showToast(error.message || "Unable to complete book action");
    }
  });

  elements.closeEditModalBtn.addEventListener("click", closeEditModal);

  elements.editBookForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    setEditError("");

    if (!state.editingBookId) {
      setEditError("No book selected.");
      return;
    }

    const payload = {
      title: elements.editTitle.value.trim(),
      authorName: elements.editAuthor.value.trim(),
      genre: elements.editGenre.value.trim() || null,
      fileType: elements.editFileType.value,
      status: elements.editStatus.value,
      description: elements.editDescription.value.trim() || null,
      tags: elements.editTags.value.split(",").map((item) => item.trim()).filter(Boolean),
      isAudiobookAvailable: elements.editIsAudiobookAvailable.checked,
      isAiGenerated: elements.editIsAiGenerated.checked,
    };

    if (!payload.title || !payload.authorName) {
      setEditError("Title and author are required.");
      return;
    }

    try {
      await apiFetch(`/api/admin/books/${encodeURIComponent(state.editingBookId)}`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });
      await refreshBooks();
      render();
      closeEditModal();
      showToast("Book updated");
    } catch (error) {
      setEditError(error.message || "Unable to save changes.");
    }
  });
}

async function bootstrap() {
  if (!requireAuth()) {
    return;
  }

  bindEvents();
  try {
    await refreshBooks();
  } catch (error) {
    state.books = [];
    showToast("Unable to load real book data");
  }
  render();
}

bootstrap();

