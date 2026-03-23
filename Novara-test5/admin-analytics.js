const ADMIN_AUTH_KEY = "novara.admin.auth";
function resolveApiBaseUrl() {
  const explicitBase = window.localStorage.getItem("Novara.apiBaseUrl");
  if (explicitBase) {
    return explicitBase.replace(/\/$/, "");
  }

  const isFileProtocol = window.location.protocol === "file:";
  const protocol = isFileProtocol ? "http:" : window.location.protocol;
  const host = !isFileProtocol && window.location.hostname ? window.location.hostname : "localhost";
  return `${protocol}//${host}:5001`;
}

const API_BASE_URL = resolveApiBaseUrl();

const elements = {
  logoutBtn: document.getElementById("logoutBtn"),
  totalReads: document.getElementById("totalReads"),
  listeningHours: document.getElementById("listeningHours"),
  activeUsers: document.getElementById("activeUsers"),
  readsSparkline: document.getElementById("readsSparkline"),
  hoursSparkline: document.getElementById("hoursSparkline"),
  usersSparkline: document.getElementById("usersSparkline"),
  popularBooksList: document.getElementById("popularBooksList"),
  completedBooksList: document.getElementById("completedBooksList"),
  recentActivityList: document.getElementById("recentActivityList")
};

function requireAuth() {
  const auth = localStorage.getItem(ADMIN_AUTH_KEY);
  if (auth !== "1") {
    const next = encodeURIComponent("admin-analytics.html");
    window.location.href = `admin-login.html?next=${next}`;
    return false;
  }
  return true;
}

function readJson(key, fallback) {
  return fallback;
}

function redirectToLogin() {
  localStorage.removeItem(ADMIN_AUTH_KEY);
  const next = encodeURIComponent("admin-analytics.html");
  window.location.href = `admin-login.html?next=${next}`;
}

async function apiFetch(path) {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    cache: "no-store",
    credentials: "include",
  });

  const payload = await response.json().catch(() => ({ success: false }));

  if (response.status === 401 || response.status === 403) {
    redirectToLogin();
    throw new Error("Authentication required");
  }

  if (!response.ok || !payload.success) {
    throw new Error(payload.error || `HTTP ${response.status}`);
  }

  return payload;
}

function formatNumber(value) {
  return new Intl.NumberFormat().format(Number(value) || 0);
}

function formatHours(value) {
  const numeric = Number(value) || 0;
  return `${numeric.toLocaleString(undefined, { minimumFractionDigits: numeric % 1 ? 1 : 0, maximumFractionDigits: 1 })}h`;
}

function renderEmptyList(target, message) {
  target.innerHTML = "";
  const li = document.createElement("li");
  li.className = "empty-item";
  li.textContent = message;
  target.appendChild(li);
}

function buildSparklineSvg(series) {
  const width = 220;
  const height = 36;
  const max = Math.max(...series.map((point) => Number(point.value) || 0), 1);
  const step = series.length > 1 ? width / (series.length - 1) : width;
  const points = series.map((point, index) => {
    const x = step * index;
    const y = height - ((Number(point.value) || 0) / max) * (height - 6) - 3;
    return `${x},${y}`;
  }).join(" ");

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" preserveAspectRatio="none">
    <polyline fill="none" stroke="rgba(40,81,79,0.95)" stroke-width="2.75" stroke-linecap="round" stroke-linejoin="round" points="${points}" />
  </svg>`;
}

function renderSparkline(target, series) {
  if (!Array.isArray(series) || !series.length || series.every((point) => (Number(point.value) || 0) === 0)) {
    target.classList.add("empty");
    target.style.backgroundImage = "none";
    target.innerHTML = '<span class="sparkline-empty">No activity yet</span>';
    return;
  }

  target.classList.remove("empty");
  target.innerHTML = buildSparklineSvg(series);
}

function renderRankList(target, rows, metricFormatter, emptyMessage) {
  if (!Array.isArray(rows) || !rows.length) {
    renderEmptyList(target, emptyMessage);
    return;
  }

  target.innerHTML = "";
  rows.forEach((row, index) => {
    const li = document.createElement("li");
    li.className = "rank-item";
    li.innerHTML = `
      <span class="rank-index">${index + 1}</span>
      <span>
        <strong>${row.title}</strong>
        ${row.authorName ? `<small class="rank-sub">${row.authorName}</small>` : ""}
      </span>
      <span class="rank-metric">${metricFormatter(row)}</span>
    `;
    target.appendChild(li);
  });
}

function renderActivity(items) {
  if (!Array.isArray(items) || !items.length) {
    renderEmptyList(elements.recentActivityList, "No recent activity recorded yet.");
    return;
  }

  elements.recentActivityList.innerHTML = "";
  items.forEach((item) => {
    const li = document.createElement("li");
    li.className = "activity-item";
    li.innerHTML = `
      <span class="activity-main">
        <strong>${item.title}</strong>
        <small>${item.note}</small>
      </span>
      <span class="activity-meta">${item.dateLabel || "Recently"}</span>
    `;
    elements.recentActivityList.appendChild(li);
  });
}

function bindEvents() {
  elements.logoutBtn.addEventListener("click", () => {
    localStorage.removeItem(ADMIN_AUTH_KEY);
    window.location.href = "index.html";
  });
}

async function bootstrap() {
  if (!requireAuth()) {
    return;
  }

  bindEvents();

  try {
    const payload = await apiFetch("/api/admin/analytics");
    const analytics = payload.data || {};
    const stats = analytics.stats || {};
    const trends = analytics.trends || {};

    elements.totalReads.textContent = formatNumber(stats.totalReads);
    elements.listeningHours.textContent = formatHours(stats.totalListeningHours);
    elements.activeUsers.textContent = formatNumber(stats.activeUsers);

    renderSparkline(elements.readsSparkline, trends.totalReads || []);
    renderSparkline(elements.hoursSparkline, trends.totalListeningHours || []);
    renderSparkline(elements.usersSparkline, trends.activeUsers || []);

    renderRankList(
      elements.popularBooksList,
      analytics.popularBooks || [],
      (row) => `${formatNumber(row.reads)} reads`,
      "No published reading activity yet."
    );
    renderRankList(
      elements.completedBooksList,
      analytics.completedBooks || [],
      (row) => `${formatNumber(row.completionRate)}% complete`,
      "No completion data recorded yet."
    );
    renderActivity(analytics.recentActivity || []);
  } catch (error) {
    elements.totalReads.textContent = "0";
    elements.listeningHours.textContent = "0h";
    elements.activeUsers.textContent = "0";
    renderSparkline(elements.readsSparkline, []);
    renderSparkline(elements.hoursSparkline, []);
    renderSparkline(elements.usersSparkline, []);
    renderEmptyList(elements.popularBooksList, "Unable to load popular books.");
    renderEmptyList(elements.completedBooksList, "Unable to load completion data.");
    renderEmptyList(elements.recentActivityList, error.message || "Unable to load recent activity.");
  }
}

bootstrap();

