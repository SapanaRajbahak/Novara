const ADMIN_AUTH_KEY = "novara.admin.auth";
function resolveApiBaseUrl() {
  const explicitBase = window.localStorage.getItem("Novara.apiBaseUrl");
  if (explicitBase) {
    return explicitBase.replace(/\/$/, "");
  }

  const isFileProtocol = window.location.protocol === "file:";
  const protocol = isFileProtocol ? "http:" : window.location.protocol;
  const host = !isFileProtocol && window.location.hostname ? window.location.hostname : "localhost";
  return `${protocol}//${host}:5002`;
}

const API_BASE_URL = resolveApiBaseUrl();

const state = {
  users: [],
  search: "",
  role: "all",
  sort: "newest",
  page: 1,
  pageSize: 8,
  totalPages: 1,
  totalUsers: 0,
};

const elements = {
  logoutBtn: document.getElementById("logoutBtn"),
  searchInput: document.getElementById("searchInput"),
  roleFilter: document.getElementById("roleFilter"),
  sortFilter: document.getElementById("sortFilter"),
  usersTableBody: document.getElementById("usersTableBody"),
  summary: document.getElementById("summary"),
  pageInfo: document.getElementById("pageInfo"),
  prevPageBtn: document.getElementById("prevPageBtn"),
  nextPageBtn: document.getElementById("nextPageBtn"),
  message: document.getElementById("message"),
};

function requireAuth() {
  const auth = localStorage.getItem(ADMIN_AUTH_KEY);
  if (auth !== "1") {
    const next = encodeURIComponent("admin-users.html");
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

function setMessage(text) {
  elements.message.textContent = text;
}

function formatDate(value) {
  if (!value) {
    return "-";
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "-";
  }
  return date.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "2-digit" });
}

function createStatusPill(value, label) {
  return `<span class="status-pill ${value}">${label}</span>`;
}

function formatDisplayRole(user) {
  if (user.displayRole === "admin") {
    return "Admin";
  }
  if (user.displayRole === "writer") {
    return "Writer";
  }
  return "Reader";
}

function formatAccountStatus(user) {
  if (!user.accountStatus) {
    return createStatusPill("na", "Not available");
  }
  return createStatusPill(user.accountStatus === "active" ? "active" : "suspended", user.accountStatus);
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
    const next = encodeURIComponent("admin-users.html");
    window.location.href = `admin-login.html?next=${next}`;
    throw new Error("Authentication required");
  }

  if (!response.ok || !payload.success) {
    throw new Error(payload.error || `HTTP ${response.status}`);
  }

  return payload;
}

function buildQueryString() {
  const params = new URLSearchParams({
    page: String(state.page),
    limit: String(state.pageSize),
    sort: state.sort,
  });

  if (state.search) {
    params.set("search", state.search);
  }
  if (state.role !== "all") {
    params.set("role", state.role);
  }

  return params.toString();
}

async function loadUsers() {
  const payload = await apiFetch(`/api/admin/users?${buildQueryString()}`);
  state.users = Array.isArray(payload.data) ? payload.data : [];
  state.totalUsers = payload.pagination && typeof payload.pagination.total === "number"
    ? payload.pagination.total
    : state.users.length;
  state.totalPages = payload.pagination && typeof payload.pagination.totalPages === "number"
    ? payload.pagination.totalPages
    : 1;
}

function render() {
  elements.usersTableBody.innerHTML = "";

  if (!state.users.length) {
    const tr = document.createElement("tr");
    tr.innerHTML = '<td colspan="9" class="hint">No real users found for current filters.</td>';
    elements.usersTableBody.appendChild(tr);
  } else {
    state.users.forEach((user) => {
      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td>
          <div class="user-cell">
            <span class="user-name">${user.name}</span>
            <span class="user-mail">${user.email}</span>
          </div>
        </td>
        <td>
          <div class="user-cell">
            <span class="user-name">${formatDisplayRole(user)}</span>
            <select class="role-select" data-role-select="${user.id}">
              <option value="USER" ${user.role === "USER" ? "selected" : ""}>Reader Base</option>
              <option value="ADMIN" ${user.role === "ADMIN" ? "selected" : ""}>Admin</option>
            </select>
          </div>
        </td>
        <td>${createStatusPill(user.isWriter ? "yes" : "no", user.isWriter ? "Enabled" : "Disabled")}</td>
        <td>${createStatusPill(user.isAdmin ? "yes" : "no", user.isAdmin ? "Yes" : "No")}</td>
        <td>${formatAccountStatus(user)}</td>
        <td>${formatDate(user.joinedAt)}</td>
        <td>${Number(user.booksCount) || 0}</td>
        <td>${Number(user.publishedBooksCount) || 0}</td>
        <td>
          <div class="row-actions">
            <button type="button" class="text-btn" data-action="view" data-id="${user.id}">View Details</button>
            <button type="button" class="text-btn" data-action="save-role" data-id="${user.id}">Save Role</button>
            <button type="button" class="text-btn" data-action="toggle-writer" data-id="${user.id}">${user.isWriter ? "Disable Writer" : "Enable Writer"}</button>
            <button type="button" class="text-btn" data-action="delete" data-id="${user.id}">Delete</button>
          </div>
        </td>
      `;
      elements.usersTableBody.appendChild(tr);
    });
  }

  elements.summary.textContent = `${state.totalUsers} users`;
  elements.pageInfo.textContent = `Page ${state.page} of ${state.totalPages}`;
  elements.prevPageBtn.disabled = state.page <= 1;
  elements.nextPageBtn.disabled = state.page >= state.totalPages;
}

function findUserById(userId) {
  return state.users.find((user) => user.id === userId) || null;
}

async function refreshAndRender(successMessage = "") {
  await loadUsers();
  render();
  if (successMessage) {
    setMessage(successMessage);
  }
}

async function handleTableClick(event) {
  const button = event.target.closest("button[data-action][data-id]");
  if (!button) {
    return;
  }

  const userId = button.dataset.id;
  const action = button.dataset.action;
  const user = findUserById(userId);

  if (!user) {
    setMessage("User not found.");
    return;
  }

  try {
    if (action === "view") {
      const payload = await apiFetch(`/api/admin/users/${encodeURIComponent(userId)}`);
      const detail = payload.data;
      const summary = [
        `${detail.name} (${detail.email})`,
        `role: ${formatDisplayRole(detail)}`,
        `writer: ${detail.isWriter ? "enabled" : "disabled"}`,
        `books: ${detail.booksCount}`,
        `published: ${detail.publishedBooksCount}`,
        `genres: ${Array.isArray(detail.preferredGenres) && detail.preferredGenres.length ? detail.preferredGenres.join(", ") : "Not available"}`,
      ].join(" | ");
      setMessage(summary);
      showToast("User details loaded");
      return;
    }

    if (action === "save-role") {
      const roleSelect = elements.usersTableBody.querySelector(`[data-role-select='${userId}']`);
      if (!roleSelect) {
        setMessage("Role selector missing.");
        return;
      }

      await apiFetch(`/api/admin/users/${encodeURIComponent(userId)}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ role: roleSelect.value }),
      });
      await refreshAndRender(`Role updated for ${user.name}.`);
      showToast("Role changed");
      return;
    }

    if (action === "toggle-writer") {
      await apiFetch(`/api/admin/users/${encodeURIComponent(userId)}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ isWriter: !user.isWriter }),
      });
      await refreshAndRender(`Writer access updated for ${user.name}.`);
      showToast(user.isWriter ? "Writer access removed" : "Writer access enabled");
      return;
    }

    if (action === "delete") {
      if (!window.confirm(`Delete ${user.name}? This removes the account and related records.`)) {
        return;
      }

      await apiFetch(`/api/admin/users/${encodeURIComponent(userId)}`, {
        method: "DELETE",
      });
      await refreshAndRender(`Deleted ${user.name}.`);
      showToast("User deleted");
    }
  } catch (error) {
    setMessage(error.message || "Unable to process user action.");
    showToast(error.message || "User action failed");
  }
}

function bindEvents() {
  elements.logoutBtn.addEventListener("click", () => {
    localStorage.removeItem(ADMIN_AUTH_KEY);
    window.location.href = "index.html";
  });

  elements.searchInput.addEventListener("input", async () => {
    state.search = elements.searchInput.value.trim();
    state.page = 1;
    await refreshAndRender();
  });

  elements.roleFilter.addEventListener("change", async () => {
    state.role = elements.roleFilter.value;
    state.page = 1;
    await refreshAndRender();
  });

  elements.sortFilter.addEventListener("change", async () => {
    state.sort = elements.sortFilter.value;
    state.page = 1;
    await refreshAndRender();
  });

  elements.prevPageBtn.addEventListener("click", async () => {
    if (state.page <= 1) {
      return;
    }
    state.page -= 1;
    await refreshAndRender();
  });

  elements.nextPageBtn.addEventListener("click", async () => {
    if (state.page >= state.totalPages) {
      return;
    }
    state.page += 1;
    await refreshAndRender();
  });

  elements.usersTableBody.addEventListener("click", (event) => {
    handleTableClick(event);
  });
}

async function bootstrap() {
  if (!requireAuth()) {
    return;
  }

  bindEvents();
  try {
    await loadUsers();
    render();
    setMessage("Real users loaded.");
  } catch (error) {
    state.users = [];
    state.totalUsers = 0;
    state.totalPages = 1;
    render();
    setMessage(error.message || "Unable to load real users.");
  }
}

bootstrap();

