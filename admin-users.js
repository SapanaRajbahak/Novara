const ADMIN_AUTH_KEY = "novelread.admin.auth";
const USERS_STORE_KEY = "novelread.admin.users";

const state = {
  users: [],
  search: "",
  role: "all",
  status: "all",
  page: 1,
  pageSize: 8
};

const elements = {
  logoutBtn: document.getElementById("logoutBtn"),
  searchInput: document.getElementById("searchInput"),
  roleFilter: document.getElementById("roleFilter"),
  statusFilter: document.getElementById("statusFilter"),
  usersTableBody: document.getElementById("usersTableBody"),
  summary: document.getElementById("summary"),
  pageInfo: document.getElementById("pageInfo"),
  prevPageBtn: document.getElementById("prevPageBtn"),
  nextPageBtn: document.getElementById("nextPageBtn"),
  message: document.getElementById("message")
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

function readUsersStore() {
  try {
    const raw = localStorage.getItem(USERS_STORE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        return parsed;
      }
    }
  } catch (error) {
    return [];
  }
  return [];
}

function saveUsersStore() {
  localStorage.setItem(USERS_STORE_KEY, JSON.stringify(state.users));
}

async function loadUsers() {
  const localUsers = readUsersStore();
  if (localUsers.length) {
    state.users = localUsers;
    return;
  }

  try {
    const response = await fetch("data/admin-users.json", { cache: "no-store" });
    if (!response.ok) {
      throw new Error("Unable to load users data");
    }
    const payload = await response.json();
    state.users = Array.isArray(payload.users) ? payload.users : [];
  } catch (error) {
    state.users = [
      { id: "u-101", name: "Ari Monroe", email: "ari@novelread.app", role: "reader", joinedAt: "2025-04-10", booksRead: 18, status: "active" },
      { id: "u-102", name: "Nadia Wells", email: "nadia@novelread.app", role: "editor", joinedAt: "2025-05-18", booksRead: 24, status: "active" },
      { id: "u-103", name: "Cal Reed", email: "cal@novelread.app", role: "reader", joinedAt: "2025-07-03", booksRead: 4, status: "suspended" }
    ];
  }

  saveUsersStore();
}

function getFilteredUsers() {
  const query = state.search.toLowerCase();

  return state.users.filter((user) => {
    const matchesSearch = !query
      || user.name.toLowerCase().includes(query)
      || user.email.toLowerCase().includes(query);

    const matchesRole = state.role === "all" || user.role === state.role;
    const matchesStatus = state.status === "all" || user.status === state.status;

    return matchesSearch && matchesRole && matchesStatus;
  });
}

function render() {
  const filtered = getFilteredUsers();
  const totalPages = Math.max(1, Math.ceil(filtered.length / state.pageSize));
  state.page = Math.min(Math.max(1, state.page), totalPages);

  const start = (state.page - 1) * state.pageSize;
  const pageRows = filtered.slice(start, start + state.pageSize);

  elements.usersTableBody.innerHTML = "";

  if (!pageRows.length) {
    const tr = document.createElement("tr");
    tr.innerHTML = '<td colspan="6" class="hint">No users found for current filters.</td>';
    elements.usersTableBody.appendChild(tr);
  } else {
    pageRows.forEach((user) => {
      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td>
          <div class="user-cell">
            <span class="user-name">${user.name}</span>
            <span class="user-mail">${user.email}</span>
          </div>
        </td>
        <td>
          <select class="role-select" data-action="role" data-id="${user.id}">
            <option value="reader" ${user.role === "reader" ? "selected" : ""}>Reader</option>
            <option value="editor" ${user.role === "editor" ? "selected" : ""}>Editor</option>
            <option value="admin" ${user.role === "admin" ? "selected" : ""}>Admin</option>
          </select>
        </td>
        <td>${formatDate(user.joinedAt)}</td>
        <td>${Number(user.booksRead) || 0}</td>
        <td><span class="status-pill ${user.status}">${user.status === "active" ? "Active" : "Suspended"}</span></td>
        <td>
          <div class="row-actions">
            <button type="button" class="text-btn" data-action="view" data-id="${user.id}">View Profile</button>
            <button type="button" class="text-btn" data-action="save-role" data-id="${user.id}">Change Role</button>
            <button type="button" class="text-btn" data-action="suspend" data-id="${user.id}">Suspend Placeholder</button>
          </div>
        </td>
      `;
      elements.usersTableBody.appendChild(tr);
    });
  }

  elements.summary.textContent = `${filtered.length} users`;
  elements.pageInfo.textContent = `Page ${state.page} of ${totalPages}`;
  elements.prevPageBtn.disabled = state.page <= 1;
  elements.nextPageBtn.disabled = state.page >= totalPages;
}

function findUserById(userId) {
  return state.users.find((user) => user.id === userId) || null;
}

function handleTableClick(event) {
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

  if (action === "view") {
    const summary = `${user.name} (${user.email}) | role: ${user.role}, status: ${user.status}, books read: ${Number(user.booksRead) || 0}`;
    setMessage(summary);
    showToast("Profile preview loaded");
    return;
  }

  if (action === "save-role") {
    const roleSelect = elements.usersTableBody.querySelector(`select[data-action='role'][data-id='${userId}']`);
    if (!roleSelect) {
      setMessage("Role selector missing.");
      return;
    }

    user.role = roleSelect.value;
    saveUsersStore();
    render();
    setMessage(`Role updated for ${user.name}.`);
    showToast("Role changed");
    return;
  }

  if (action === "suspend") {
    user.status = user.status === "active" ? "suspended" : "active";
    saveUsersStore();
    render();
    setMessage(`Suspend placeholder action toggled status for ${user.name}.`);
    showToast(user.status === "suspended" ? "User suspended" : "User reactivated");
  }
}

function bindEvents() {
  elements.logoutBtn.addEventListener("click", () => {
    localStorage.removeItem(ADMIN_AUTH_KEY);
    window.location.href = "admin-login.html";
  });

  elements.searchInput.addEventListener("input", () => {
    state.search = elements.searchInput.value.trim();
    state.page = 1;
    render();
  });

  elements.roleFilter.addEventListener("change", () => {
    state.role = elements.roleFilter.value;
    state.page = 1;
    render();
  });

  elements.statusFilter.addEventListener("change", () => {
    state.status = elements.statusFilter.value;
    state.page = 1;
    render();
  });

  elements.prevPageBtn.addEventListener("click", () => {
    state.page -= 1;
    render();
  });

  elements.nextPageBtn.addEventListener("click", () => {
    state.page += 1;
    render();
  });

  elements.usersTableBody.addEventListener("click", handleTableClick);
}

async function bootstrap() {
  if (!requireAuth()) {
    return;
  }

  await loadUsers();
  bindEvents();
  render();
  setMessage("Users ready.");
}

bootstrap();
