// --- SPA Sidebar Navigation Logic ---
const sidebarNav = document.querySelector(".writer-dashboard-sidebar");
const sectionContent = document.getElementById("writerSectionContent");
const writerHomeDashboard = document.getElementById("writerHomeDashboard");
const dashboardTitle = document.getElementById("writerHeading");

const WRITER_SECTIONS = [
  {
    key: "home",
    label: "Writer Dashboard",
    render: () => "",
  },
  {
    key: "stories",
    label: "My Books",
    render: renderWriterStoriesSection,
  },
  {
    key: "earnings",
    label: "Earnings",
    render: () => '<div id="writerEarningsLoading">Loading earnings...</div>',
  },
  {
    key: "ai-tools",
    label: "AI Assistant",
    render: renderWriterAIToolsSection,
  },
  {
    key: "analytics",
    label: "Analytics",
    render: renderWriterAnalyticsSection,
  },
];

let currentSection = "home";
const sectionFromUrl = new URLSearchParams(window.location.search).get("section");
if (sectionFromUrl === "referrals") {
  window.location.replace("/writer/writer-referrals.html");
}
const allowedSections = new Set(["home", "stories", "earnings", "ai-tools", "analytics"]);
if (sectionFromUrl && allowedSections.has(sectionFromUrl)) {
  currentSection = sectionFromUrl;
}

function setActiveSidebar(sectionKey) {
  const links = sidebarNav.querySelectorAll(".sidebar-link");
  links.forEach((btn) => {
    if (btn.dataset.section === sectionKey) {
      btn.classList.add("is-active");
      btn.classList.add("active");
    } else {
      btn.classList.remove("is-active");
      btn.classList.remove("active");
    }
  });
}

function switchSection(sectionKey) {
  const section = WRITER_SECTIONS.find((s) => s.key === sectionKey) || WRITER_SECTIONS[0];
  currentSection = section.key;
  setActiveSidebar(section.key);

  if (dashboardTitle) {
    dashboardTitle.textContent = section.key === "home" ? "Writer Dashboard" : section.label;
  }

  if (section.key === "home") {
    if (writerHomeDashboard) {
      writerHomeDashboard.hidden = false;
    }
    if (sectionContent) {
      sectionContent.hidden = true;
      sectionContent.innerHTML = "";
    }
    return;
  }

  if (writerHomeDashboard) {
    writerHomeDashboard.hidden = true;
  }
  if (!sectionContent) {
    return;
  }

  sectionContent.hidden = false;
  sectionContent.style.opacity = 0;
  window.setTimeout(() => {
    sectionContent.innerHTML = typeof section.render === "function" ? section.render() : "";
    sectionContent.style.opacity = 1;

    if (section.key === "stories") {
      bindWriterStoriesControls();
      updateMyBooksBannerAndStats();
      loadWriterStoriesSectionData();
    }

    if (section.key === "earnings") {
      loadWriterEarningsData();
    }

    if (section.key === "analytics") {
      loadWriterAnalyticsData();
    }
  }, 180);
}
// Fetch real earnings data from backend and render
async function loadWriterEarningsData() {
  try {
    const base = window.NovaraSession && window.NovaraSession.API_BASE_URL ? window.NovaraSession.API_BASE_URL : "";

    // Fetch both writer dashboard data and platform monetization settings in parallel
    const [response, settingsRes] = await Promise.all([
      fetch(`${base}/api/writer/dashboard`, { credentials: "include" }),
      fetch(`${base}/api/monetization/settings`),
    ]);

    const payload      = await response.json();
    let platformSettings = {};
    try { const s = await settingsRes.json(); if (s.success) platformSettings = s.data; } catch {}

    if (platformSettings.monetizationMaintMode) {
      sectionContent.innerHTML = `
        <div class="notice notice-warning" style="padding:18px 22px;background:#fff8e8;border:1px solid #e8c84a;border-radius:10px;margin:20px 0;">
          <strong>⚠ Monetization Maintenance</strong><br>
          Payouts and earnings features are temporarily unavailable. Please check back shortly.
        </div>`;
      return;
    }

    if (!platformSettings.writerPayoutsEnabled) {
      sectionContent.innerHTML += `
        <div class="notice notice-info" style="padding:14px 18px;background:#eef4ff;border:1px solid #a4c0f4;border-radius:10px;margin:0 0 16px;">
          ℹ Writer payouts are currently disabled by the platform. Contact support for details.
        </div>`;
    }

    if (payload.success && payload.data && payload.data.monetization) {
      sectionContent.innerHTML = renderWriterEarningsSection(payload.data, platformSettings);
      injectGiftEarnedCard(payload.data);
    } else {
      sectionContent.innerHTML = renderWriterEarningsSection({}, platformSettings);
      injectGiftEarnedCard({});
    }
  } catch (e) {
    sectionContent.innerHTML = '<div class="error">Unable to load earnings data.</div>';
  }
}

async function loadWriterAnalyticsData() {
  try {
    const base = window.NovaraSession && window.NovaraSession.API_BASE_URL ? window.NovaraSession.API_BASE_URL : "";
    const response = await fetch(`${base}/api/writer/dashboard`, { credentials: "include" });
    const payload = await response.json();

    if (payload.success && payload.data) {
      const data = payload.data;
      const books = Array.isArray(data.books) ? data.books : [];
      const stats = data.stats || {};

      // Update stats cards
      const totalReadsEl = document.getElementById("analyticsTotalReads");
      const uniqueReadersEl = document.getElementById("analyticsUniqueReaders");
      const totalLikesEl = document.getElementById("analyticsTotalLikes");
      const followersEl = document.getElementById("analyticsFollowers");

      if (totalReadsEl) totalReadsEl.textContent = stats.totalReads || 0;
      if (uniqueReadersEl) uniqueReadersEl.textContent = stats.uniqueReaders || 0;
      if (totalLikesEl) totalLikesEl.textContent = stats.totalFavorites || 0;
      if (followersEl) followersEl.textContent = stats.totalFollowers || 0;

      // Update book table
      const tableBody = document.getElementById("analyticsBookTable");
      if (tableBody) {
        if (books.length === 0) {
          tableBody.innerHTML = '<tr><td colspan="5">No books published yet</td></tr>';
        } else {
          tableBody.innerHTML = books.map(book => `
            <tr>
              <td>${book.title || 'Untitled'}</td>
              <td>${book._count?.readingProgress || 0}</td>
              <td>${book._count?.listeningProgress || 0}</td>
              <td>${book._count?.bookmarks || 0}</td>
              <td>${book._count?.notes || 0}</td>
            </tr>
          `).join('');
        }
      }

      // Render chart
      const canvas = document.getElementById("analyticsChart");
      if (canvas && window.Chart) {
        const readingProgress = Array.isArray(data.readingProgress) ? data.readingProgress : [];
        const monthsBack = 6;
        const labels = [];
        const dataPoints = [];

        for (let i = monthsBack - 1; i >= 0; i--) {
          const date = new Date();
          date.setMonth(date.getMonth() - i);
          const monthLabel = date.toLocaleString(undefined, { month: 'short' });
          labels.push(monthLabel);
          dataPoints.push(0);
        }

        readingProgress.forEach(row => {
          const date = new Date(row.updatedAt);
          const monthIndex = monthsBack - 1 - ((new Date().getMonth() - date.getMonth() + 12) % 12);
          if (monthIndex >= 0 && monthIndex < monthsBack) {
            dataPoints[monthIndex]++;
          }
        });

        new Chart(canvas, {
          type: 'line',
          data: {
            labels: labels,
            datasets: [{
              label: 'Reading Progress Updates',
              data: dataPoints,
              borderColor: '#6366f1',
              backgroundColor: 'rgba(99, 102, 241, 0.1)',
              fill: true,
              tension: 0.4
            }]
          },
          options: {
            responsive: true,
            plugins: {
              legend: {
                display: false
              }
            },
            scales: {
              y: {
                beginAtZero: true,
                ticks: {
                  stepSize: 1
                }
              }
            }
          }
        });
      }
    } else {
      // Show empty state
      const totalReadsEl = document.getElementById("analyticsTotalReads");
      const uniqueReadersEl = document.getElementById("analyticsUniqueReaders");
      const totalLikesEl = document.getElementById("analyticsTotalLikes");
      const followersEl = document.getElementById("analyticsFollowers");
      const tableBody = document.getElementById("analyticsBookTable");

      if (totalReadsEl) totalReadsEl.textContent = "0";
      if (uniqueReadersEl) uniqueReadersEl.textContent = "0";
      if (totalLikesEl) totalLikesEl.textContent = "0";
      if (followersEl) followersEl.textContent = "0";
      if (tableBody) tableBody.innerHTML = '<tr><td colspan="5">No data available</td></tr>';
    }
  } catch (e) {
    console.error("Failed to load analytics data:", e);
    const tableBody = document.getElementById("analyticsBookTable");
    if (tableBody) {
      tableBody.innerHTML = '<tr><td colspan="5">Unable to load analytics data</td></tr>';
    }
  }
}

sidebarNav.addEventListener("click", (e) => {
  const btn = e.target.closest(".sidebar-link");
  if (!btn) return;
  const sectionKey = btn.dataset.section;
  if (sectionKey && sectionKey !== currentSection) {
    switchSection(sectionKey);
  }
});

// --- Section Renderers (with mock data) ---
function renderWriterHomeSection() {
  return `
    <section class="writer-home">
      <div class="writer-hero-card">
        <h2>Your next chapter is waiting</h2>
        <p class="writer-home-cta">Ready to create? <button class="btn btn-primary" onclick="switchSection('stories')">Continue Writing</button> <button class="btn btn-secondary" onclick="switchSection('stories')">New Story</button></p>
      </div>
      <div class="writer-home-row">
        <div class="writer-home-recent">
          <h3>Continue Writing</h3>
          <ul class="writer-home-drafts">
            <li>"The Lost City" <span class="progress">Draft 3/10</span> <button class="btn btn-soft">Resume</button></li>
            <li>"Midnight Sun" <span class="progress">Draft 7/12</span> <button class="btn btn-soft">Resume</button></li>
          </ul>
        </div>
        <div class="writer-home-stats">
          <div class="mini-stat"><span>Total Reads</span><strong>12,340</strong></div>
          <div class="mini-stat"><span>Earnings</span><strong>$128.50</strong></div>
          <div class="mini-stat"><span>Followers</span><strong>1,024</strong></div>
          <div class="mini-stat"><span>Chapters</span><strong>34</strong></div>
        </div>
      </div>
      <div class="writer-home-streak">Youâ€™ve written <strong>5 days</strong> in a row ðŸ”¥</div>
      <div class="writer-home-ai-tools">
        <button class="btn btn-soft">AI: Generate Idea</button>
        <button class="btn btn-soft">AI: Improve Dialogue</button>
      </div>
      <div class="writer-home-monetization-cta">Start earning â†’ <button class="btn btn-secondary" onclick="switchSection('earnings')">Go to Earnings</button></div>
    </section>
  `;
}

function renderWriterStoriesSection() {
  return `
    <section class="writer-stories writer-my-books">
      <div class="mb-hero-banner">
        <p id="myBooksBannerText" class="mb-hero-text"></p>
        <div class="mb-hero-actions">
          <button type="button" class="mb-hero-btn" data-action="create-story">
            <span class="mb-hero-btn-ic" aria-hidden="true">+</span> New Book
          </button>
          <button type="button" class="mb-hero-btn" data-action="new-chapter">
            <span class="mb-hero-btn-ic mb-hero-btn-ic-doc" aria-hidden="true"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg></span>
            Publish Chapter
          </button>
        </div>
      </div>

      <div id="myBooksStatsGrid" class="stats-grid mb-stats-row" aria-label="Library overview"></div>

      <div class="mb-toolbar">
        <input
          id="storiesSearchInput"
          class="mb-search-input"
          type="search"
          placeholder="Search your books..."
          autocomplete="off"
        />
        <div class="mb-filters-row">
          <div class="stories-filter-tabs mb-filter-tabs" id="storiesFilterTabs" role="tablist" aria-label="Story status filters">
            <button class="stories-filter-tab is-active" type="button" data-filter="ALL">All</button>
            <button class="stories-filter-tab" type="button" data-filter="DRAFT">Drafts</button>
            <button class="stories-filter-tab" type="button" data-filter="PUBLISHED">Published</button>
            <button class="stories-filter-tab" type="button" data-filter="SCHEDULED">Scheduled</button>
          </div>
          <label class="mb-sort-wrap">
            <span class="mb-sort-label">Sort</span>
            <select id="storiesSortSelect" class="mb-sort-select">
              <option value="last-edited">Last edited</option>
              <option value="title-asc">Title A-Z</option>
              <option value="title-desc">Title Z-A</option>
              <option value="most-reads">Most reads</option>
            </select>
          </label>
        </div>
      </div>

      <div id="writerStoriesDynamicList" class="mb-books-grid"></div>
    </section>
  `;
}
function escapeStoryHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

const writerStoriesViewState = {
  stories: [],
  filter: "ALL",
  sort: "last-edited",
  search: "",
  stats: null,
  monetization: null,
};

const MY_BOOKS_COVER_EMOJIS = ["🍃", "🌙", "🔥", "⚡", "📖", "✨", "🌿", "🕯️"];

function getTimeOfDayGreeting() {
  const h = new Date().getHours();
  if (h < 12) return "Good morning";
  if (h < 17) return "Good afternoon";
  return "Good evening";
}

function formatPenNameDisplay(name) {
  const s = String(name || "Writer").trim();
  if (!s) return "Writer";
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function updateMyBooksBannerAndStats() {
  const bannerEl = document.getElementById("myBooksBannerText");
  const statsEl = document.getElementById("myBooksStatsGrid");
  const allStories = Array.isArray(writerStoriesViewState.stories) ? writerStoriesViewState.stories : [];
  const draftCount = allStories.filter((b) => normalizeStoryStatus(b.status) === "DRAFT").length;
  const pubCount = allStories.filter((b) => normalizeStoryStatus(b.status) === "PUBLISHED").length;
  const schedCount = allStories.filter((b) => normalizeStoryStatus(b.status) === "SCHEDULED").length;
  const totalBooks = allStories.length;

  let pen = "Writer";
  if (window.NovaraSession && typeof window.NovaraSession.getCurrentUser === "function") {
    const u = window.NovaraSession.getCurrentUser();
    pen = (u && u.writerProfile && u.writerProfile.penName) || (u && u.name) || pen;
  }
  const displayName = formatPenNameDisplay(pen);

  if (bannerEl) {
    const draftPhrase =
      draftCount === 0
        ? "You have no drafts right now."
        : draftCount === 1
          ? "You have 1 book in draft."
          : `You have ${draftCount} books in draft.`;
    bannerEl.textContent = `${getTimeOfDayGreeting()}, ${displayName}. ${draftPhrase} Keep writing — your readers are waiting.`;
  }

  if (!statsEl) {
    return;
  }

  const stats = writerStoriesViewState.stats || {};
  const mon = writerStoriesViewState.monetization || {};
  const totalReads = Number(stats.totalReads || 0);
  const earnings = Number(mon.estimatedRevenue || 0);
  const followerBase = Number(mon.subscriptionReaders || stats.totalFavorites || 0);
  const followers =
    followerBase > 0 ? followerBase : totalReads > 0 ? Math.max(8, Math.round(totalReads * 0.14)) : 0;

  const cards = [
    {
      label: "Total reads",
      value: totalReads.toLocaleString(),
      trend: "↗ 12% this month",
      trendClass: "up",
      pill: "pill-green",
    },
    {
      label: "Earnings",
      value: `$${earnings.toLocaleString()}`,
      trend: "↗ 8% this month",
      trendClass: "up",
      pill: "pill-gold",
    },
    {
      label: "Followers",
      value: followers.toLocaleString(),
      trend: `↗ ${Math.max(0, Math.round(followers * 0.02))} new`,
      trendClass: "up",
      pill: "pill-purple",
    },
    {
      label: "Books",
      value: String(totalBooks),
      trend: `${draftCount} drafts · ${pubCount} published${schedCount ? ` · ${schedCount} scheduled` : ""}`,
      trendClass: "neutral",
      pill: "pill-blue",
    },
  ];

  statsEl.innerHTML = cards
    .map(
      (card) => `
      <article class="stat-card wd-stat-mock mb-stat-card">
        <div class="stat-icon-row">
          <span class="stat-label">${card.label}</span>
          <span class="stat-icon-pill ${card.pill}" aria-hidden="true"></span>
        </div>
        <div class="stat-value">${card.value}</div>
        <span class="stat-change ${card.trendClass}">${card.trend}</span>
      </article>
    `
    )
    .join("");
}

function storyDraftProgressPercent(story) {
  const chapters = Number(story.chapters || 0);
  if (chapters <= 0) return 8;
  return Math.min(100, Math.round((chapters / 36) * 100));
}

function normalizeStoryStatus(status) {
  const value = String(status || "DRAFT").toUpperCase();
  if (value === "PUBLISHED" || value === "SCHEDULED" || value === "DRAFT") {
    return value;
  }
  return "DRAFT";
}

function storyStatusLabel(status) {
  const normalized = normalizeStoryStatus(status);
  if (normalized === "PUBLISHED") return "Published";
  if (normalized === "SCHEDULED") return "Scheduled";
  return "Draft";
}

function getStoryStatusBadgeClass(status) {
  const normalized = normalizeStoryStatus(status);
  if (normalized === "PUBLISHED") return "badge badge-published";
  if (normalized === "SCHEDULED") return "badge badge-scheduled";
  return "badge badge-draft";
}

function parseStoryDate(story) {
  const raw = story.updatedAt || story.createdAt || story.updated_at || story.created_at || story.lastEditedAt;
  const parsed = raw ? new Date(raw) : null;
  return parsed && Number.isFinite(parsed.getTime()) ? parsed : null;
}

function formatStoryDate(story) {
  const date = parseStoryDate(story);
  if (!date) return "N/A";
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

function getStoryGenre(story) {
  const genre = story.genre || story.category || story.primaryGenre || "";
  return genre ? String(genre) : "General";
}

function genreCoverClass(genre) {
  const key = String(genre || "").toLowerCase();
  if (key.includes("romance")) return "story-cover story-cover-romance";
  if (key.includes("thriller") || key.includes("mystery")) return "story-cover story-cover-thriller";
  if (key.includes("sci")) return "story-cover story-cover-scifi";
  return "story-cover story-cover-fantasy";
}

function getStoryCoverUrl(story) {
  const raw = String(story?.coverUrl || "").trim();
  if (!raw) {
    return "";
  }

  if (/^(https?:)?\/\//i.test(raw) || raw.startsWith("data:")) {
    return raw;
  }

  const baseUrl = resolveWriterApiBaseUrl();
  return `${baseUrl}${raw.startsWith("/") ? raw : `/${raw}`}`;
}

function bindWriterStoriesControls() {
  const tabs = document.getElementById("storiesFilterTabs");
  const sortSelect = document.getElementById("storiesSortSelect");
  const searchInput = document.getElementById("storiesSearchInput");

  if (tabs && tabs.dataset.bound !== "true") {
    tabs.dataset.bound = "true";
    tabs.addEventListener("click", (event) => {
      const button = event.target.closest("button[data-filter]");
      if (!button) {
        return;
      }
      writerStoriesViewState.filter = button.dataset.filter;
      tabs.querySelectorAll(".stories-filter-tab").forEach((tabBtn) => {
        tabBtn.classList.toggle("is-active", tabBtn === button);
      });
      applyWriterStoriesView();
    });
  }

  if (sortSelect && sortSelect.dataset.bound !== "true") {
    sortSelect.dataset.bound = "true";
    sortSelect.addEventListener("change", () => {
      writerStoriesViewState.sort = sortSelect.value;
      applyWriterStoriesView();
    });
  }

  if (searchInput && searchInput.dataset.bound !== "true") {
    searchInput.dataset.bound = "true";
    searchInput.addEventListener("input", () => {
      writerStoriesViewState.search = searchInput.value.trim().toLowerCase();
      applyWriterStoriesView();
    });
  }
}

function getVisibleStories() {
  const list = Array.isArray(writerStoriesViewState.stories) ? writerStoriesViewState.stories.slice() : [];
  const filtered = list.filter((story) => {
    const status = normalizeStoryStatus(story.status);
    if (writerStoriesViewState.filter !== "ALL" && status !== writerStoriesViewState.filter) {
      return false;
    }
    if (!writerStoriesViewState.search) {
      return true;
    }
    const title = String(story.title || "").toLowerCase();
    const genre = String(story.genre || "").toLowerCase();
    const description = String(story.description || "").toLowerCase();
    return title.includes(writerStoriesViewState.search)
      || genre.includes(writerStoriesViewState.search)
      || description.includes(writerStoriesViewState.search);
  });

  const sorted = filtered.sort((a, b) => {
    if (writerStoriesViewState.sort === "title-asc") {
      return String(a.title || "").localeCompare(String(b.title || ""));
    }
    if (writerStoriesViewState.sort === "title-desc") {
      return String(b.title || "").localeCompare(String(a.title || ""));
    }
    if (writerStoriesViewState.sort === "most-reads") {
      return Number(b.reads || 0) - Number(a.reads || 0);
    }

    const dateA = parseStoryDate(a);
    const dateB = parseStoryDate(b);
    const tsA = dateA ? dateA.getTime() : 0;
    const tsB = dateB ? dateB.getTime() : 0;
    return tsB - tsA;
  });

  return sorted;
}

function renderWriterStoriesList(stories) {
  const host = document.getElementById("writerStoriesDynamicList");
  if (!host) {
    return;
  }

  const createCard = `
    <a class="mb-book-card mb-book-card--create" href="/writer/writer-stories-new.html">
      <span class="mb-create-plus" aria-hidden="true">+</span>
      <span class="mb-create-label">Create new book</span>
    </a>
  `;

  if (!Array.isArray(stories) || !stories.length) {
    const all = writerStoriesViewState.stories || [];
    const hasBooks = Array.isArray(all) && all.length > 0;
    const msg = hasBooks
      ? "No books match your search or filters."
      : "You have not created a book yet. Start with your first story.";
    host.innerHTML = `
      <div class="mb-empty-hint">${msg}</div>
      ${createCard}
    `;
    return;
  }

  const cardsHtml = stories
    .map((story, index) => {
      const id = escapeStoryHtml(story.id);
      const title = escapeStoryHtml(story.title || "Untitled");
      const status = normalizeStoryStatus(story.status);
      const statusLabel = storyStatusLabel(status);
      const badgeClass = getStoryStatusBadgeClass(status);
      const dateStr = escapeStoryHtml(formatStoryDate(story));
      const reads = Number(story.reads || 0);
      const readsLabel = reads.toLocaleString();
      const genre = escapeStoryHtml(getStoryGenre(story));
      const chapters = Number(story.chapters || 0);
      const chapterLabel = chapters === 1 ? "1 chapter" : `${chapters} chapters`;
      const emoji = MY_BOOKS_COVER_EMOJIS[index % MY_BOOKS_COVER_EMOJIS.length];
      const coverUrl = getStoryCoverUrl(story);
      const coverStyle = coverUrl ? `background-image:url(${JSON.stringify(coverUrl)})` : "";

      const showProgress = status === "DRAFT" || status === "SCHEDULED";
      const pct = storyDraftProgressPercent(story);
      const progressBlock = showProgress
        ? `<div class="mb-book-progress"><div class="mb-book-progress-fill" style="width:${pct}%"></div></div>`
        : "";

      const footerPublished =
        `<button type="button" class="mb-book-footer-btn" data-action="edit-story">Edit</button>` +
        `<button type="button" class="mb-book-footer-btn" data-action="create-chapter">+ Chapter</button>` +
        `<button type="button" class="mb-book-footer-btn mb-book-footer-btn--danger" data-action="delete-story">Delete</button>` +
        `<button type="button" class="mb-book-footer-btn mb-book-footer-btn--primary" data-action="book-stats">Stats</button>`;
      const footerDraft =
        `<button type="button" class="mb-book-footer-btn" data-action="edit-story">Edit</button>` +
        `<button type="button" class="mb-book-footer-btn" data-action="create-chapter">+ Chapter</button>` +
        `<button type="button" class="mb-book-footer-btn mb-book-footer-btn--danger" data-action="delete-story">Delete</button>` +
        `<button type="button" class="mb-book-footer-btn mb-book-footer-btn--primary" data-action="publish-story">Publish</button>`;
      const footer = status === "PUBLISHED" ? footerPublished : footerDraft;

      const coverInner = coverUrl
        ? `<div class="mb-book-cover mb-book-cover--photo" style="${coverStyle}" role="img" aria-label=""></div>`
        : `<div class="mb-book-cover mb-book-cover--emoji" aria-hidden="true">${emoji}</div>`;

      return `
        <article class="mb-book-card story-card" data-story-id="${id}">
          <span class="mb-book-badge ${badgeClass}">${statusLabel}</span>
          ${coverInner}
          <div class="mb-book-body">
            <h3 class="mb-book-title">${title}</h3>
            <p class="mb-book-meta">${genre} · ${chapterLabel}</p>
            <p class="mb-book-stats-line">${readsLabel} reads · ${dateStr}</p>
            ${progressBlock}
            <div class="mb-book-footer">${footer}</div>
          </div>
        </article>
      `;
    })
    .join("");

  host.innerHTML = cardsHtml + createCard;
}

function applyWriterStoriesView() {
  updateMyBooksBannerAndStats();
  renderWriterStoriesList(getVisibleStories());
}

async function loadWriterStoriesSectionData() {
  try {
    const base = window.NovaraSession && window.NovaraSession.API_BASE_URL ? window.NovaraSession.API_BASE_URL : "";
    const response = await fetch(`${base}/api/writer/dashboard`, {
      cache: "no-store",
      credentials: "include",
    });

    if (!response.ok) {
      writerStoriesViewState.stories = [];
      writerStoriesViewState.stats = null;
      writerStoriesViewState.monetization = null;
      applyWriterStoriesView();
      return;
    }

    const payload = await response.json();
    const books = payload && payload.success && payload.data && Array.isArray(payload.data.books)
      ? payload.data.books
      : [];

    writerStoriesViewState.stories = books;
    writerStoriesViewState.stats = (payload.data && payload.data.stats) || writerStoriesViewState.stats;
    writerStoriesViewState.monetization =
      (payload.data && payload.data.monetization) || writerStoriesViewState.monetization;
    applyWriterStoriesView();
  } catch (_) {
    writerStoriesViewState.stories = [];
    writerStoriesViewState.stats = null;
    writerStoriesViewState.monetization = null;
    applyWriterStoriesView();
  }
}

function renderWriterEarningsSection(data, platformSettings) {
  const monetization = data?.monetization || data || {};
  const recentActivity = Array.isArray(data?.recentActivity) ? data.recentActivity : [];
  const ps = platformSettings || {};
  const revenueShare   = ps.writerRevenueShare  ?? 70;
  const minPayout      = ps.minPayoutThreshold  ?? 20;
  const payoutSchedule = ps.payoutSchedule      ?? 'Monthly';
  const referralCoins  = ps.referralRewardCoins ?? 100;
  const payoutsOn      = ps.writerPayoutsEnabled !== false;
  const referralOn     = ps.referralProgramEnabled !== false;
  const coinSystemOn   = ps.coinSystemEnabled    !== false;
  const giftCoinsEarned = Number(monetization.giftCoinsEarned || 0);
  const giftCount = Number(monetization.giftCount || 0);

  const platformInfoBar = `
    <div class="platform-rules-bar" style="display:flex;flex-wrap:wrap;gap:10px;padding:12px 16px;background:var(--card2,#f5f0e8);border:1px solid var(--border,#e8e2d8);border-radius:10px;margin-bottom:16px;font-size:12.5px;">
      <span title="Your revenue share set by the platform">💸 Revenue share: <strong>${revenueShare}%</strong> writer / ${100 - revenueShare}% platform</span>
      <span style="color:var(--text3)">·</span>
      <span title="Minimum balance required to request a payout">💳 Min. payout: <strong>$${minPayout}</strong></span>
      <span style="color:var(--text3)">·</span>
      <span title="How often payouts are processed">📅 Schedule: <strong>${payoutSchedule}</strong></span>
      <span style="color:var(--text3)">·</span>
      <span title="Coin system status">🪙 Coins: <strong style="color:${coinSystemOn ? 'var(--green,#2b5839)' : 'var(--rust,#8a3824)'}">${coinSystemOn ? 'Active' : 'Disabled'}</strong></span>
      <span style="color:var(--text3)">·</span>
      <span title="Payout availability">💰 Payouts: <strong style="color:${payoutsOn ? 'var(--green,#2b5839)' : 'var(--rust,#8a3824)'}">${payoutsOn ? 'Enabled' : 'Disabled'}</strong></span>
    </div>`;

  // Premium Monetization/Earnings SPA Section
  return `
    <section class="writer-earnings">
      ${platformInfoBar}
      <div class="page-header">
        <div class="section-eyebrow">Monetization</div>
        <div class="page-title">Earnings Overview</div>
        <div class="page-subtitle">Track revenue, payouts, and performance across all your books</div>
      </div>
      <div class="stats-grid">
        <div class="stat-card">
          <div class="stat-icon-row"><div class="stat-label">Total Earnings</div><div class="stat-icon-pill pill-gold">ðŸ’µ</div></div>
          <div class="stat-value">$4,821</div>
          <span class="stat-change up">â–² 18.4% vs last period</span>
        </div>
        <div class="stat-card">
          <div class="stat-icon-row"><div class="stat-label">This Month</div><div class="stat-icon-pill pill-green">ðŸ“…</div></div>
          <div class="stat-value">$632</div>
          <span class="stat-change up">â–² 12.1% vs last month</span>
        </div>
        <div class="stat-card">
          <div class="stat-icon-row"><div class="stat-label">Pending Payout</div><div class="stat-icon-pill pill-purple">â³</div></div>
          <div class="stat-value">$248</div>
          <span class="stat-change neutral">Next payout: Apr 1</span>
        </div>
        <div class="stat-card">
          <div class="stat-icon-row"><div class="stat-label">Available to Withdraw</div><div class="stat-icon-pill pill-blue">âœ“</div></div>
          <div class="stat-value">$384</div>
          <span class="stat-change up">â–² Threshold met</span>
        </div>
      </div>
      <div class="row row-2">
        <div class="card">
          <div class="card-header"><span class="card-title">Gift Activity</span></div>
          <div style="font-size:12px;color:var(--text2);margin-bottom:10px;">
            Gift total: <strong>${Number(monetization.giftCoinsEarned || 0).toLocaleString()} coins</strong>
            from <strong>${Number(monetization.giftCount || 0).toLocaleString()}</strong> gift${Number(monetization.giftCount || 0) === 1 ? "" : "s"}
          </div>
          <div class="activity-list">
            ${recentActivity.filter((item) => /gift/i.test(`${item?.title || ""} ${item?.note || ""}`)).slice(0, 5).map((item) => `
              <article class="activity-item wd-activity-row">
                <span class="wd-activity-dot dot-red" aria-hidden="true"></span>
                <div class="wd-activity-body">
                  <strong>${item.title}</strong>
                  <p>${item.note}${item.dateLabel ? ` · ${item.dateLabel}` : ""}</p>
                </div>
              </article>
            `).join("") || `
              <article class="activity-item wd-activity-row">
                <span class="wd-activity-dot dot-green" aria-hidden="true"></span>
                <div class="wd-activity-body">
                  <strong>No gift activity yet</strong>
                  <p>Reader gifts will appear here once your audience starts sending support.</p>
                </div>
              </article>
            `}
          </div>
        </div>
      </div>
      <div class="row row-3">
        <div class="card">
          <div class="card-header">
            <span class="card-title">Revenue Over Time</span>
            <div class="chart-tabs">
              <div class="chart-tab active" onclick="window.writerEarningsChart && window.writerEarningsChart.switchChart('revenue',this)">Revenue</div>
              <div class="chart-tab" onclick="window.writerEarningsChart && window.writerEarningsChart.switchChart('reads',this)">Reads</div>
              <div class="chart-tab" onclick="window.writerEarningsChart && window.writerEarningsChart.switchChart('unlocks',this)">Unlocks</div>
            </div>
          </div>
          <div class="chart-wrap"><canvas id="mainChart"></canvas></div>
        </div>
        <div class="card">
          <div class="card-header"><span class="card-title">Revenue Sources</span></div>
          <div style="position:relative;height:144px;margin-bottom:14px;"><canvas id="donutChart"></canvas></div>
          <div class="breakdown-list">
            <div class="breakdown-item">
              <div class="breakdown-meta"><span class="breakdown-label">Chapter Unlocks</span><span class="breakdown-amount">$318</span></div>
              <div class="breakdown-bar"><div class="breakdown-fill" style="width:72%;background:var(--gold2);"></div></div>
            </div>
            <div class="breakdown-item">
              <div class="breakdown-meta"><span class="breakdown-label">Subscription Share</span><span class="breakdown-amount">$207</span></div>
              <div class="breakdown-bar"><div class="breakdown-fill" style="width:47%;background:var(--purple);"></div></div>
            </div>
            <div class="breakdown-item">
              <div class="breakdown-meta"><span class="breakdown-label">Reader Tips</span><span class="breakdown-amount">$64</span></div>
              <div class="breakdown-bar"><div class="breakdown-fill" style="width:14%;background:var(--rust);"></div></div>
            </div>
            <div class="breakdown-item">
              <div class="breakdown-meta"><span class="breakdown-label">Bonuses & Promos</span><span class="breakdown-amount">$43</span></div>
              <div class="breakdown-bar"><div class="breakdown-fill" style="width:10%;background:var(--green);"></div></div>
            </div>
          </div>
        </div>
      </div>
      <div class="row row-2">
        <div class="card">
          <div class="card-header"><span class="card-title">Top Earning Books</span><a class="card-action">View all</a></div>
          <div class="book-list">
            <div class="book-item">
              <div class="book-rank top">1</div>
              <div class="book-cover" style="background:linear-gradient(135deg,#3a1a5e,#7b3fa0);">ðŸŒ™</div>
              <div class="book-info"><div class="book-title">Midnight Inheritance</div><div class="book-meta">Fantasy Â· 47 ch Â· 12.4k reads</div></div>
              <div><div class="book-earnings">$1,842</div><div class="book-trend up">â–² 22%</div></div>
            </div>
            <div class="book-item">
              <div class="book-rank top">2</div>
              <div class="book-cover" style="background:linear-gradient(135deg,#1a2e3a,#2a7a8a);">ðŸŒŠ</div>
              <div class="book-info"><div class="book-title">The Abyssal Pact</div><div class="book-meta">Dark Romance Â· 32 ch Â· 9.1k reads</div></div>
              <div><div class="book-earnings">$1,204</div><div class="book-trend up">â–² 8%</div></div>
            </div>
            <div class="book-item">
              <div class="book-rank">3</div>
              <div class="book-cover" style="background:linear-gradient(135deg,#3a2010,#a05020);">ðŸ”¥</div>
              <div class="book-info"><div class="book-title">Ember & Ash</div><div class="book-meta">Romance Â· 28 ch Â· 7.3k reads</div></div>
              <div><div class="book-earnings">$917</div><div class="book-trend down">â–¼ 3%</div></div>
            </div>
            <div class="book-item">
              <div class="book-rank">4</div>
              <div class="book-cover" style="background:linear-gradient(135deg,#1a3a2a,#2a8a5a);">ðŸ—¡ï¸</div>
              <div class="book-info"><div class="book-title">Crown of Thorns</div><div class="book-meta">Epic Fantasy Â· 21 ch Â· 4.8k reads</div></div>
              <div><div class="book-earnings">$858</div><div class="book-trend up">â–² 41%</div></div>
            </div>
          </div>
        </div>
        <div class="card">
          <div class="card-header"><span class="card-title">Monthly Goals</span><span class="badge badge-green">3 / 5 Met</span></div>
          <div class="goals-list">
            <div class="goal-item">
              <div class="goal-header"><span class="goal-name">Revenue Goal</span><span class="goal-progress">$632 / $750</span></div>
              <div class="goal-bar"><div class="goal-fill" style="width:84%;background:var(--gold2);"></div></div>
            </div>
            <div class="goal-item">
              <div class="goal-header"><span class="goal-name">Chapter Uploads</span><span class="goal-progress">11 / 12</span></div>
              <div class="goal-bar"><div class="goal-fill" style="width:92%;background:var(--purple);"></div></div>
            </div>
            <div class="goal-item">
              <div class="goal-header"><span class="goal-name">Read Target</span><span class="goal-progress">18.2k / 20k</span></div>
              <div class="goal-bar"><div class="goal-fill" style="width:91%;background:var(--blue);"></div></div>
            </div>
            <div class="goal-item">
              <div class="goal-header"><span class="goal-name">New Followers</span><span class="goal-progress">143 / 200</span></div>
              <div class="goal-bar"><div class="goal-fill" style="width:72%;background:var(--teal);"></div></div>
            </div>
            <div class="goal-item">
              <div class="goal-header"><span class="goal-name">Unlocks Target</span><span class="goal-progress">94 / 100</span></div>
              <div class="goal-bar"><div class="goal-fill" style="width:94%;background:var(--rust);"></div></div>
            </div>
          </div>
          <hr class="divider" style="margin-top:16px;">
          <div class="card-title" style="font-size:12px;margin-bottom:10px;">Milestone Rewards</div>
          <div>
            <div class="milestone-row"><span style="color:var(--text2)">ðŸ† 10k Readers</span><span class="badge badge-gold">Unlocked</span></div>
            <div class="milestone-row">
              <span style="color:var(--text2)">ðŸ¥ˆ $5,000 Earned</span>
              <div style="display:flex;align-items:center;gap:5px;"><span style="font-size:11px;color:var(--text3)">$4,821 / $5,000</span><span class="badge badge-purple">96%</span></div>
            </div>
            <div class="milestone-row"><span style="color:var(--text2)">âœ¨ Trending Badge</span><span class="badge badge-neutral">Locked</span></div>
          </div>
        </div>
      </div>
      <div class="row row-3">
        <div class="card">
          <div class="card-header">
            <span class="card-title">Recent Transactions</span>
            <select class="period-select" style="font-size:11px;padding:4px 9px;" onchange="window.writerEarningsChart && window.writerEarningsChart.filterTxns(this.value)">
              <option value="all">All types</option>
              <option value="unlock">Unlocks</option>
              <option value="sub">Subscription</option>
              <option value="bonus">Bonuses</option>
              <option value="payout">Payouts</option>
            </select>
          </div>
          <table class="txn-table">
            <thead><tr><th>Date</th><th>Type</th><th>Book</th><th>Amount</th></tr></thead>
            <tbody id="txnBody"></tbody>
          </table>
          <div style="text-align:center;margin-top:12px;">
            <a class="card-action" style="font-size:11.5px;" onclick="window.writerEarningsChart && window.writerEarningsChart.loadMoreTxns()">Load more transactions â†“</a>
          </div>
        </div>
        <div style="display:flex;flex-direction:column;gap:12px;">
          <div class="card">
            <div class="card-header"><span class="card-title">AI Writing Assistant</span><span class="badge badge-purple">Pro Plan</span></div>
            <div class="ai-meter">
              <div class="ai-meter-header"><span class="ai-meter-label">Credits Used</span><span class="ai-meter-value">6,840 / 10,000</span></div>
              <div class="ai-meter-bar"><div class="ai-meter-fill" style="width:68%;background:var(--purple);"></div></div>
            </div>
            <div class="ai-meter">
              <div class="ai-meter-header"><span class="ai-meter-label">Generations This Month</span><span class="ai-meter-value">247</span></div>
              <div class="ai-meter-bar"><div class="ai-meter-fill" style="width:49%;background:var(--blue);"></div></div>
            </div>
            <div style="display:flex;justify-content:space-between;font-size:12px;margin-bottom:6px;">
              <span style="color:var(--text2)">Estimated AI Cost</span><span style="color:var(--text);font-weight:600;">$12.40</span>
            </div>
            <div style="display:flex;justify-content:space-between;font-size:12px;">
              <span style="color:var(--text2)">Net AI ROI</span><span style="color:var(--green);font-weight:600;">+$619.60</span>
            </div>
            <div class="ai-insight"><strong>AI is working for you.</strong> AI-assisted books earned <strong>38% more</strong> per chapter than unassisted ones this month.</div>
          </div>
          <div class="card">
            <div class="card-header"><span class="card-title">Payout</span></div>
            <div class="payout-balance">
              <div>
                <div class="payout-balance-label">Available to withdraw</div>
                <div class="payout-balance-amount">$384.00</div>
              </div>
              <button class="btn btn-green" onclick="window.writerEarningsChart && window.writerEarningsChart.requestPayout()">Withdraw</button>
            </div>
            <div class="payout-method">
              <div class="payout-method-icon">ðŸ’³</div>
              <div>
                <div style="font-size:12.5px;color:var(--text);font-weight:500;">Stripe Â· â€¢â€¢â€¢â€¢ 4291</div>
                <div style="font-size:11px;color:var(--text3);">Min. threshold: $${minPayout}</div>
              </div>
              <a class="card-action" style="margin-left:auto;">Change</a>
            </div>
            <div id="payoutHistory"></div>
          </div>
        </div>
      </div>
      <div class="card">
        <div class="card-header"><span class="card-title">Grow your earnings with referrals</span><span class="badge badge-gold">Active</span></div>
        <div class="referral-stats">
          <div class="ref-stat"><div class="ref-stat-val" id="refStatInvited">0</div><div class="ref-stat-label">Writers Invited</div></div>
          <div class="ref-stat"><div class="ref-stat-val" id="refStatCompleted">0</div><div class="ref-stat-label">Completed Referrals</div></div>
          <div class="ref-stat"><div class="ref-stat-val" id="refStatEarned">$0</div><div class="ref-stat-label">Total Earnings</div></div>
        </div>
        <div style="font-size:12px;color:var(--text2);margin-bottom:8px;">Your referral link</div>
        <div class="referral-code-box" id="referralLinkBox">novara.app/signup?ref=YOUR_CODE<button class="copy-btn" id="refCopyBtn">Copy Link</button></div>
        <div style="font-size:11.5px;color:var(--text3);margin-bottom:8px;">Earn rewards when invited writers publish and gain readers.</div>
        <div style="font-size:11.5px;color:var(--text2);" id="refPendingText">0 referrals pending completion</div>
      </div>
    </section>
  `;
}

function renderWriterAIToolsSection() {
  return `
    <section class="writer-ai-tools">
      <h2>Creative Acceleration Toolkit</h2>
      <div class="ai-tools-grid">
        <div class="ai-tool-card"><strong>Generate Story Idea</strong><button class="btn btn-primary">Try</button></div>
        <div class="ai-tool-card"><strong>Generate Chapter</strong><button class="btn btn-primary">Try</button></div>
        <div class="ai-tool-card"><strong>Rewrite Scene</strong><button class="btn btn-primary">Try</button></div>
        <div class="ai-tool-card"><strong>Improve Dialogue</strong><button class="btn btn-primary">Try</button></div>
      </div>
    </section>
  `;
}

function renderWriterAnalyticsSection() {
  return `
    <section class="writer-analytics">
      <h2>Analytics</h2>
      <div class="analytics-grid">
        <div class="analytics-card">
          <h3>Total Reads</h3>
          <div class="analytics-value" id="analyticsTotalReads">-</div>
          <div class="analytics-label">All time</div>
        </div>
        <div class="analytics-card">
          <h3>Unique Readers</h3>
          <div class="analytics-value" id="analyticsUniqueReaders">-</div>
          <div class="analytics-label">All time</div>
        </div>
        <div class="analytics-card">
          <h3>Total Likes</h3>
          <div class="analytics-value" id="analyticsTotalLikes">-</div>
          <div class="analytics-label">All time</div>
        </div>
        <div class="analytics-card">
          <h3>Followers</h3>
          <div class="analytics-value" id="analyticsFollowers">-</div>
          <div class="analytics-label">All time</div>
        </div>
      </div>

      <div class="analytics-chart-container">
        <h3>Reading Progress (Last 6 Months)</h3>
        <canvas id="analyticsChart"></canvas>
      </div>

      <div class="analytics-table-container">
        <h3>Book Performance</h3>
        <table class="analytics-table">
          <thead>
            <tr>
              <th>Book</th>
              <th>Reads</th>
              <th>Progress</th>
              <th>Bookmarks</th>
              <th>Notes</th>
            </tr>
          </thead>
          <tbody id="analyticsBookTable">
            <tr><td colspan="5">Loading...</td></tr>
          </tbody>
        </table>
      </div>
    </section>
  `;
}

function injectGiftEarnedCard(monetization) {
  const card = sectionContent?.querySelector?.(".writer-earnings .card .card-title");
  if (!card || card.textContent !== "Gift Activity") {
    return;
  }

  const giftCoinsEarned = Number(monetization?.monetization?.giftCoinsEarned || monetization?.giftCoinsEarned || 0);
  const giftCount = Number(monetization?.monetization?.giftCount || monetization?.giftCount || 0);
  const recentActivity = Array.isArray(monetization?.recentActivity) ? monetization.recentActivity : [];
  const gifts = recentActivity.filter((item) => /gift/i.test(`${item?.title || ""} ${item?.note || ""}`)).slice(0, 5);
  const parentCard = card.closest(".card");
  if (!parentCard) {
    return;
  }

  parentCard.innerHTML = `
    <div class="card-header"><span class="card-title">Gift earning</span></div>
    <div style="font-size:12px;color:var(--text2);margin-bottom:12px;">
      Current Balance: <strong>${giftCoinsEarned.toLocaleString()} coins</strong>
    </div>
    <div style="font-size:11.5px;color:var(--text3);margin-bottom:10px;">
      ${giftCount > 0 ? `${giftCount} gift${giftCount === 1 ? "" : "s"} received` : "No gifts yet"}
    </div>
    <div style="font-size:12px;color:var(--text2);margin:0 0 10px;font-weight:600;">Recent Gifts</div>
    <div class="activity-list">
      ${
        gifts.length
          ? gifts.map((item) => `
            <article class="activity-item wd-activity-row">
              <span class="wd-activity-dot dot-red" aria-hidden="true"></span>
              <div class="wd-activity-body">
                <strong>${item.title || "Gift received"}</strong>
                <p>${item.note || ""}${item.dateLabel ? ` · ${item.dateLabel}` : ""}</p>
              </div>
            </article>
          `).join("")
          : `
            <article class="activity-item wd-activity-row">
              <span class="wd-activity-dot dot-green" aria-hidden="true"></span>
              <div class="wd-activity-body">
                <strong>No recent gifts yet</strong>
                <p>Reader gifts will show up here once they start sending support.</p>
              </div>
            </article>
          `
      }
    </div>
  `;
}

function renderWriterReferralsSection() {
  return `
    <section class="writer-earnings">
      <div class="page-header">
        <div class="section-eyebrow">Growth</div>
        <div class="page-title">Grow your earnings with referrals</div>
        <div class="page-subtitle">Earn rewards only when invited writers publish and gain real readers</div>
      </div>
      <div class="card">
        <div class="referral-stats">
          <div class="ref-stat"><div class="ref-stat-val" id="refStatInvited">0</div><div class="ref-stat-label">Writers Invited</div></div>
          <div class="ref-stat"><div class="ref-stat-val" id="refStatCompleted">0</div><div class="ref-stat-label">Completed Referrals</div></div>
          <div class="ref-stat"><div class="ref-stat-val" id="refStatEarned">$0</div><div class="ref-stat-label">Total Earnings</div></div>
        </div>
        <div style="font-size:12px;color:var(--text2);margin-bottom:8px;">Referral link</div>
        <div class="referral-code-box" id="referralLinkBox">novara.app/signup?ref=YOUR_CODE<button class="copy-btn" id="refCopyBtn">Copy Link</button></div>
        <div style="font-size:11.5px;color:var(--text3);margin-bottom:8px;" id="refRewardConfig">Earn $0 + 0 AI credits when your referral becomes an active writer.</div>
        <div style="font-size:11.5px;color:var(--text2);" id="refPendingText">0 referrals pending completion</div>
      </div>
    </section>
  `;
}


// --- Earnings Section Chart.js and Logic ---
window.writerEarningsChart = {
  DATA: {
    revenue: [142,98,175,210,188,230,264,195,278,312,290,335],
    reads: [3200,2800,4100,4900,4400,5200,6100,4700,6400,7100,6800,7900],
    unlocks: [24,18,31,38,33,42,49,36,52,61,57,68],
    labels: ['Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec','Jan','Feb']
  },
  TRANSACTIONS: [
    {date:'Mar 24',type:'unlock',book:'Midnight Inheritance',amount:'+$4.99',cls:'positive'},
    {date:'Mar 24',type:'sub',book:'The Abyssal Pact',amount:'+$2.30',cls:'positive'},
    {date:'Mar 23',type:'tip',book:'Ember & Ash',amount:'+$5.00',cls:'positive'},
    {date:'Mar 23',type:'unlock',book:'Crown of Thorns',amount:'+$4.99',cls:'positive'},
    {date:'Mar 22',type:'sub',book:'Midnight Inheritance',amount:'+$1.80',cls:'positive'},
    {date:'Mar 22',type:'bonus',book:'Trending Bonus',amount:'+$25.00',cls:'positive'},
    {date:'Mar 21',type:'unlock',book:'The Abyssal Pact',amount:'+$4.99',cls:'positive'},
    {date:'Mar 20',type:'payout',book:'Payout to Stripe',amount:'-$200.00',cls:'negative'},
  ],
  TYPE_MAP: {
    unlock: ['unlock','ðŸ”“ Unlock'],
    sub: ['sub','â­ Sub Share'],
    bonus: ['bonus','ðŸŽ Bonus'],
    payout: ['payout','â†— Payout'],
    tip: ['tip','ðŸ’ Tip']
  },
  PAYOUTS: [
    {date:'Mar 1, 2026',amount:'$200.00',status:'paid',statusLabel:'Paid'},
    {date:'Feb 1, 2026',amount:'$180.00',status:'paid',statusLabel:'Paid'},
    {date:'Jan 1, 2026',amount:'$155.00',status:'paid',statusLabel:'Paid'},
  ],
  mainChart: null,
  currentChartType: 'revenue',
  initMainChart() {
    if (!window.Chart) return;
    const ctx = document.getElementById('mainChart').getContext('2d');
    this.mainChart = new Chart(ctx, {
      type: 'line',
      data: { labels: this.DATA.labels, datasets: [{
        data: this.DATA.revenue,
        borderColor: '#8a6a2a',
        backgroundColor: 'rgba(138,106,42,0.06)',
        borderWidth: 1.5, fill: true, tension: 0.4,
        pointBackgroundColor: '#8a6a2a', pointRadius: 3, pointHoverRadius: 5
      }]},
      options: { responsive: true, maintainAspectRatio: false,
        plugins: { legend: { display: false }, tooltip: {
          backgroundColor: '#faf8f4', borderColor: 'rgba(60,45,20,0.15)', borderWidth: 1,
          titleColor: '#9a8e7a', bodyColor: '#1e1a14', bodyFont: { size: 12, weight: '600' }, padding: 8,
          callbacks: { label: ctx => this.currentChartType === 'revenue' ? ' $' + ctx.raw : ' ' + ctx.raw }
        }},
        scales: {
          x: { grid: { color: 'rgba(60,45,20,0.05)' }, ticks: { color: '#9a8e7a', font: { size: 11 } } },
          y: { grid: { color: 'rgba(60,45,20,0.05)' }, ticks: { color: '#9a8e7a', font: { size: 11 }, callback: v => this.currentChartType === 'revenue' ? '$' + v : v }, border: { dash: [3,3], color: 'transparent' } }
        }
      }
    });
  },
  initDonutChart() {
    if (!window.Chart) return;
    const ctx = document.getElementById('donutChart').getContext('2d');
    new Chart(ctx, {
      type: 'doughnut',
      data: { labels: ['Unlocks','Subscription','Tips','Bonuses'], datasets: [{
        data: [318,207,64,43], backgroundColor: ['#b08838','#5a4a8a','#8a3a2a','#2d5a3d'],
        borderColor: '#faf8f4', borderWidth: 3, hoverBorderWidth: 3
      }]},
      options: { responsive: true, maintainAspectRatio: false, cutout: '68%',
        plugins: { legend: { display: false }, tooltip: {
          backgroundColor: '#faf8f4', borderColor: 'rgba(60,45,20,0.15)', borderWidth: 1,
          titleColor: '#9a8e7a', bodyColor: '#1e1a14',
          callbacks: { label: ctx => ' $' + ctx.raw + ' (' + Math.round(ctx.raw/632*100) + '%)' }
        }}
      }
    });
  },
  switchChart(type, el) {
    document.querySelectorAll('.chart-tab').forEach(t => t.classList.remove('active'));
    el.classList.add('active');
    this.currentChartType = type;
    const colors = { revenue: '#8a6a2a', reads: '#2a4a7a', unlocks: '#5a4a8a' };
    if (this.mainChart) {
      this.mainChart.data.datasets[0].data = this.DATA[type];
      this.mainChart.data.datasets[0].borderColor = colors[type];
      this.mainChart.data.datasets[0].backgroundColor = colors[type] + '18';
      this.mainChart.update('active');
    }
  },
  renderTxns(filter = 'all') {
    const tbody = document.getElementById('txnBody');
    if (!tbody) return;
    tbody.innerHTML = this.TRANSACTIONS
      .filter(t => filter === 'all' || t.type === filter)
      .map(t => { const [cls, label] = this.TYPE_MAP[t.type]; return `<tr>
        <td style="color:var(--text3)">${t.date}</td>
        <td><span class="txn-type ${cls}">${label}</span></td>
        <td style="max-width:120px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:var(--text)">${t.book}</td>
        <td class="txn-amount ${t.cls}">${t.amount}</td></tr>`; }).join('');
  },
  filterTxns(val) { this.renderTxns(val); },
  loadMoreTxns() { alert('Full transaction history export available.'); },
  renderPayouts() {
    const el = document.getElementById('payoutHistory');
    if (!el) return;
    el.innerHTML =
      `<div style="font-size:10px;color:var(--text3);margin:10px 0 6px;text-transform:uppercase;letter-spacing:0.8px;font-weight:600;">Payout History</div>` +
      this.PAYOUTS.map(p => `<div class="payout-history-row">
        <span style="color:var(--text2)">${p.date}</span>
        <span style="font-weight:600;color:var(--text)">${p.amount}</span>
        <span class="payout-status ${p.status}">${p.statusLabel}</span></div>`).join('');
  },
  requestPayout() { alert('Payout of $384.00 requested! Arriving in 2â€“3 business days to your Stripe account.'); },
  exportData() { alert('CSV export generated! Check your downloads.'); },
  copyCode(event) {
    navigator.clipboard.writeText('https://novara.app/join?ref=ELENA2025').catch(() => {});
    const btn = event.target; btn.textContent = 'Copied!'; setTimeout(() => btn.textContent = 'Copy Link', 2000);
  }
};

function resolveWriterApiBaseUrl() {
  if (window.NovaraSession && window.NovaraSession.API_BASE_URL) {
    return window.NovaraSession.API_BASE_URL;
  }
  return "https://readnovara.ca";
}

function bindReferralCopy(referralLink) {
  const copyBtn = document.getElementById("refCopyBtn");
  if (!copyBtn) {
    return;
  }

  if (copyBtn.dataset.bound === "true") {
    return;
  }

  copyBtn.dataset.bound = "true";
  copyBtn.addEventListener("click", () => {
    navigator.clipboard.writeText(referralLink).catch(() => {});
    copyBtn.textContent = "Copied!";
    setTimeout(() => {
      copyBtn.textContent = "Copy Link";
    }, 1800);
  });
}

function applyReferralSummary(summary) {
  if (!summary) {
    return;
  }

  const invited = document.getElementById("refStatInvited");
  const completed = document.getElementById("refStatCompleted");
  const earned = document.getElementById("refStatEarned");
  const pendingText = document.getElementById("refPendingText");
  const linkBox = document.getElementById("referralLinkBox");
  const rewardConfig = document.getElementById("refRewardConfig");

  if (invited) invited.textContent = String(summary.stats.total || 0);
  if (completed) completed.textContent = String(summary.stats.completed || 0);
  if (earned) earned.textContent = `$${Number(summary.stats.totalEarned || 0).toFixed(2)}`;
  if (pendingText) pendingText.textContent = `${Number(summary.stats.pending || 0)} referrals pending completion`;
  if (rewardConfig) {
    rewardConfig.textContent = `Earn $${Number(summary.rewardConfig.cashAmount || 0).toFixed(2)} + ${Number(summary.rewardConfig.aiCredits || 0)} AI credits when your referral becomes an active writer.`;
  }

  const referralLink = summary.referralLink || `novara.app/signup?ref=${summary.referralCode || ""}`;
  if (linkBox) {
    linkBox.innerHTML = `${referralLink}<button class="copy-btn" id="refCopyBtn">Copy Link</button>`;
  }
  bindReferralCopy(referralLink);
}

async function loadReferralSummary() {
  try {
    const response = await fetch(`${resolveWriterApiBaseUrl()}/api/writer/referrals`, {
      cache: "no-store",
      credentials: "include",
    });

    if (!response.ok) {
      return;
    }

    const payload = await response.json();
    if (!payload || !payload.success || !payload.data) {
      return;
    }

    applyReferralSummary(payload.data);
  } catch (error) {
    // Leave default UI values if the request fails.
  }
}

// Initial load — session and guards before section HTML (welcome uses pen name).
window.addEventListener("DOMContentLoaded", async () => {
  const proceed = await loadDashboard();
  if (proceed === false) {
    return;
  }
  switchSection(currentSection);
  // Chart.js logic for Earnings section
  if (typeof Chart !== 'undefined') {
    setTimeout(() => {
      if (document.getElementById('mainChart')) window.writerEarningsChart.initMainChart();
      if (document.getElementById('donutChart')) window.writerEarningsChart.initDonutChart();
      window.writerEarningsChart.renderTxns();
      window.writerEarningsChart.renderPayouts();
    }, 350);
  }
  loadReferralSummary();
});
const elements = {
  dashboardSwitcher: document.getElementById("dashboardSwitcher"),
  writerSignOutBtn: document.getElementById("writerSignOutBtn"),
  writerHeading: document.getElementById("writerHeading"),
  writerSubtitle: document.getElementById("writerSubtitle"),
  writerPenName: document.getElementById("writerPenName"),
  writerBio: document.getElementById("writerBio"),
  writerGenres: document.getElementById("writerGenres"),
  writerStats: document.getElementById("writerStats"),
  writerContent: document.getElementById("writerContent"),
  accessNotice: document.getElementById("accessNotice"),
  authorAvatar: document.getElementById("authorAvatar"),
  storyFilterTabs: document.getElementById("storyFilterTabs"),
  storySort: document.getElementById("storySort"),
  storySearch: document.getElementById("storySearch"),
  writingTools: document.getElementById("writingTools"),
  readsChart: document.getElementById("readsChart"),
  analyticsStats: document.getElementById("analyticsStats"),
  recentActivity: document.getElementById("recentActivity"),
  monetizationStats: document.getElementById("monetizationStats"),
  assistantActions: document.getElementById("assistantActions"),
  heroActions: document.getElementById("heroActions"),
  editPenNameBtn: document.getElementById("editPenNameBtn"),
  penNameEditModal: document.getElementById("penNameEditModal"),
  penNameEditInput: document.getElementById("penNameEditInput"),
  cancelPenNameEdit: document.getElementById("cancelPenNameEdit"),
  savePenNameEdit: document.getElementById("savePenNameEdit"),
  penNameEditMessage: document.getElementById("penNameEditMessage"),
};

const uiState = {
  activeFilter: "ALL",
  searchTerm: "",
  sortBy: "last-edited",
  books: [],
  profile: null,
  insights: null,
};

const filterTabs = [
  { key: "ALL", label: "All" },
  { key: "DRAFT", label: "Drafts" },
  { key: "PUBLISHED", label: "Published" },
  { key: "SCHEDULED", label: "Scheduled" },
];

const aiActions = [
  "Generate Story Idea",
  "Generate Chapter",
  "Rewrite Scene",
  "Improve Dialogue",
  "Expand Description",
  "Translate Chapter",
];

const appRoutes = window.NovaraSession && window.NovaraSession.APP_ROUTES
  ? {
    ...window.NovaraSession.APP_ROUTES,
    writerOnboarding: "/writer/writer-onboarding.html",
  }
  : {
    readerDashboard: "/reader/reader-dashboard.html",
    writerDashboard: "/writer/writer-dashboard.html",
    writerOnboarding: "/writer/writer-onboarding.html",
    writerStudio: "/writer/writer-stories-new.html",
    adminDashboard: "/admin/admin.html",
  };

function normalizeBookStatus(status) {
  const value = String(status || "DRAFT").toUpperCase();
  if (value === "SCHEDULED" || value === "PUBLISHED" || value === "DRAFT") {
    return value;
  }
  return "DRAFT";
}

function formatStatusLabel(status) {
  const normalized = normalizeBookStatus(status);
  if (normalized === "PUBLISHED") {
    return "Published";
  }
  if (normalized === "SCHEDULED") {
    return "Scheduled";
  }
  return "Draft";
}

function getStatusBadgeClass(status) {
  const normalized = normalizeBookStatus(status);
  if (normalized === "PUBLISHED") {
    return "badge badge-published";
  }
  if (normalized === "SCHEDULED") {
    return "badge badge-scheduled";
  }
  return "badge badge-draft";
}

function formatDate(value) {
  if (!value) {
    return "Recently";
  }
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return "Recently";
  }
  return parsed.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function extractInitials(name) {
  if (!name || typeof name !== "string") {
    return "NR";
  }
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (!words.length) {
    return "NR";
  }
  return words
    .slice(0, 2)
    .map((word) => word.charAt(0).toUpperCase())
    .join("");
}

function renderGenres(genres) {
  if (!elements.writerGenres) {
    return;
  }
  const values = Array.isArray(genres) && genres.length ? genres : [];
  if (!values.length) {
    elements.writerGenres.innerHTML = "";
    return;
  }
  elements.writerGenres.innerHTML = values
    .map((genre) => `<span class="genre-chip">${genre}</span>`)
    .join("");
}

function renderStats(stats) {
  if (!elements.writerStats) {
    return;
  }
  const data = uiState.insights || {};
  const mon = data.monetization || {};
  const an = data.analytics || {};
  const totalReads = Number(stats.totalReads || 0);
  const earnings = Number(mon.estimatedRevenue || 0);
  const followerBase = Number(mon.subscriptionReaders || stats.totalFavorites || 0);
  const followers =
    followerBase > 0 ? followerBase : totalReads > 0 ? Math.max(8, Math.round(totalReads * 0.14)) : 0;
  const published = Number(stats.publishedBooks || 0);
  const drafts = Number(stats.drafts || 0);

  const cards = [
    {
      label: "Total reads",
      value: totalReads.toLocaleString(),
      trend: "↗ 12% this month",
      trendClass: "up",
      pill: "pill-green",
    },
    {
      label: "Earnings",
      value: `$${earnings.toLocaleString()}`,
      trend: "↗ 8% this month",
      trendClass: "up",
      pill: "pill-gold",
    },
    {
      label: "Followers",
      value: followers.toLocaleString(),
      trend: `${Math.max(0, Math.round(followers * 0.02))} new`,
      trendClass: "up",
      pill: "pill-purple",
    },
    {
      label: "Published books",
      value: String(published),
      trend: drafts ? `${drafts} in progress` : "On track",
      trendClass: drafts ? "up" : "neutral",
      pill: "pill-blue",
    },
  ];

  elements.writerStats.innerHTML = cards
    .map(
      (card) => `
      <article class="stat-card wd-stat-mock">
        <div class="stat-icon-row">
          <span class="stat-label">${card.label}</span>
          <span class="stat-icon-pill ${card.pill}" aria-hidden="true"></span>
        </div>
        <div class="stat-value">${card.value}</div>
        <span class="stat-change ${card.trendClass}">${card.trend}</span>
      </article>
    `
    )
    .join("");
}

function renderTopBooks(books) {
  const el = document.getElementById("wdTopBooks");
  if (!el) {
    return;
  }
  const sorted = [...(books || [])].sort((a, b) => Number(b.reads || 0) - Number(a.reads || 0)).slice(0, 5);
  if (!sorted.length) {
    el.innerHTML = `<p class="wd-muted">Publish a story to see your top titles here.</p>`;
    return;
  }
  el.innerHTML = sorted
    .map((book, index) => {
      const title = escapeStoryHtml(book.title || "Untitled");
      const genre = escapeStoryHtml(book.genre || "Fiction");
      const reads = Number(book.reads || 0);
      const readsLabel = reads >= 1000 ? `${(reads / 1000).toFixed(1)}k reads` : `${reads} reads`;
      return `
        <div class="wd-top-book-row">
          <div class="wd-top-book-cover" style="background:${getBookCoverStyle(index)}"></div>
          <div>
            <div class="wd-top-book-title">${title}</div>
            <div class="wd-top-book-meta">${genre} · ${readsLabel}</div>
          </div>
        </div>
      `;
    })
    .join("");
}

function renderFilterTabs() {
  const host = document.getElementById("storiesFilterTabs") || elements.storyFilterTabs;
  if (!host) {
    return;
  }
  host.innerHTML = filterTabs
    .map((tab) => `
      <button
        type="button"
        class="stories-filter-tab ${uiState.activeFilter === tab.key ? "is-active" : ""}"
        role="tab"
        aria-selected="${uiState.activeFilter === tab.key ? "true" : "false"}"
        data-filter="${tab.key}"
      >
        ${tab.label}
      </button>
    `)
    .join("");
}

function getStoriesListHost() {
  return document.getElementById("writerStoriesDynamicList") || elements.writerContent;
}

function getBookCoverStyle(index) {
  const palettes = [
    "linear-gradient(145deg, #3f665b, #c37f59)",
    "linear-gradient(145deg, #c37b52, #7b4c3a)",
    "linear-gradient(145deg, #4f6f62, #947243)",
    "linear-gradient(145deg, #6d4b38, #b9874f)",
  ];
  return palettes[index % palettes.length];
}

function getStoryDescription(book) {
  const genre = book.genre || "Literary";
  return `${genre} narrative exploring layered characters, emotional tension, and a polished chapter flow for publication.`;
}

function getFilteredBooks() {
  return uiState.books
    .filter((book) => {
      if (uiState.activeFilter === "ALL") {
        return true;
      }
      return normalizeBookStatus(book.status) === uiState.activeFilter;
    })
    .filter((book) => {
      if (!uiState.searchTerm) {
        return true;
      }
      const term = uiState.searchTerm.toLowerCase();
      return String(book.title || "").toLowerCase().includes(term);
    })
    .sort((a, b) => {
      if (uiState.sortBy === "a-z") {
        return String(a.title || "").localeCompare(String(b.title || ""));
      }
      if (uiState.sortBy === "most-read") {
        return Number(b.reads || 0) - Number(a.reads || 0);
      }
      const dateA = new Date(a.updatedAt).getTime() || 0;
      const dateB = new Date(b.updatedAt).getTime() || 0;
      return dateB - dateA;
    });
}

function renderEmptyState(profile) {
  const host = getStoriesListHost();
  if (!host) {
    return;
  }
  host.innerHTML = `
    <section class="empty-state">
      <h3>Your writer space is ready.</h3>
      <p class="helper-text">${profile.penName}, your premium writing workspace is active. Start your creation flow with your first concept, then move to chapters, preview, and publish.</p>
      <button type="button" class="btn btn-primary" data-action="create-story">Create Your First Story</button>
      <div class="empty-checklist">
        <article class="empty-step">
          <span class="empty-step-index">1</span>
          <div>
            <strong>Shape your first concept</strong>
            <p class="helper-text">Define your story core, themes, and genre promise for readers.</p>
          </div>
        </article>
        <article class="empty-step">
          <span class="empty-step-index">2</span>
          <div>
            <strong>Prepare your first manuscript</strong>
            <p class="helper-text">Create chapters and iterate with your writing tools before release.</p>
          </div>
        </article>
        <article class="empty-step">
          <span class="empty-step-index">3</span>
          <div>
            <strong>Publish when ready</strong>
            <p class="helper-text">Preview your story experience and publish with confidence.</p>
          </div>
        </article>
      </div>
    </section>
  `;
}

function renderBooks(books) {
  const host = getStoriesListHost();
  if (!host) {
    return;
  }
  if (!books.length) {
    renderEmptyState(uiState.profile);
    return;
  }

  host.innerHTML = `
    <div class="story-list">
      ${books
        .map((book, index) => {
          const statusLabel = formatStatusLabel(book.status);
          const badgeClass = getStatusBadgeClass(book.status);
          const genreLabel = book.genre || "Genre pending";
          return `
          <article class="story-card" data-story-id="${book.id}">
            <div class="story-cover" style="background:${getBookCoverStyle(index)}">
              ${genreLabel}
            </div>
            <div class="story-main">
              <div class="story-title-row">
                <h3 class="story-title">${book.title || "Untitled Story"}</h3>
                <span class="${badgeClass}">${statusLabel}</span>
              </div>
              <p class="story-excerpt">${getStoryDescription(book)}</p>
              <div class="genre-list">
                <span class="genre-chip">${genreLabel}</span>
              </div>
              <div class="story-meta">
                <span>Last edited: ${formatDate(book.updatedAt)}</span>
                <span>Chapters: ${Number(book.chapters || 0)}</span>
                <span>Reads: ${Number(book.reads || 0).toLocaleString()}</span>
                <span>Favorites: ${Number(book.likes || 0).toLocaleString()}</span>
              </div>
              <div class="story-actions">
                <button type="button" class="btn btn-soft" data-action="edit-story">Edit</button>
                <button type="button" class="btn btn-soft" data-action="manage-chapters">Manage Chapters</button>
                <button type="button" class="btn btn-soft" data-action="preview-story">Preview</button>
                <button type="button" class="btn btn-primary" data-action="publish-story">Publish</button>
              </div>
            </div>
          </article>
        `;
        })
        .join("")}
    </div>
  `;
}

function renderWritingTools(tools) {
  if (!elements.writingTools) {
    return;
  }
  const books = (uiState.books || []).slice(0, 4);
  if (!books.length) {
    elements.writingTools.innerHTML = `
      <p class="wd-muted">Start a draft to track chapter progress here.</p>
      <p class="helper-text" style="margin-top:8px;font-size:12px;color:var(--text-muted, #6f6258)">
        Word count today: <strong>${Number(tools.wordCountToday || 0).toLocaleString()}</strong>
      </p>`;
    return;
  }

  elements.writingTools.innerHTML = books
    .map((book) => {
      const chapters = Number(book.chapters || 0);
      const pct = Math.min(100, Math.max(8, chapters === 0 ? 12 : Math.min(100, chapters * 14)));
      const label = escapeStoryHtml(book.title || "Untitled");
      return `
        <div class="wd-progress-row">
          <div class="wd-progress-label"><span>${label}</span><span>${pct}%</span></div>
          <div class="wd-progress-track"><div class="wd-progress-fill" style="width:${pct}%"></div></div>
        </div>
      `;
    })
    .join("");
}

function renderReadsChart(readsOverTime) {
  if (!elements.readsChart) {
    return [];
  }
  const dayLabels = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
  const series = Array.isArray(readsOverTime) ? readsOverTime : [];
  let values = series.map((item) => Number(item.value || 0));
  if (values.length < 7) {
    const pad = new Array(7 - values.length).fill(0);
    values = [...pad, ...values].slice(-7);
  } else if (values.length > 7) {
    values = values.slice(-7);
  }
  const maxValue = Math.max(...values, 1);

  elements.readsChart.innerHTML = values
    .map((value, index) => {
      const height = Math.max(18, Math.round((Number(value || 0) / maxValue) * 120));
      const label = dayLabels[index] || series[index]?.month || "—";
      return `
        <div class="chart-bar" style="height:${height}px">
          <span>${label}</span>
        </div>
      `;
    })
    .join("");

  return values;
}

function renderAnalytics(analytics) {
  renderReadsChart(analytics.readsOverTime || []);
  const trendValue = Number(analytics.engagementTrend || 0);

  if (!elements.analyticsStats) {
    return;
  }

  const analyticsCards = [
    { label: "Engagement Trend", value: `${trendValue >= 0 ? "+" : ""}${trendValue}%` },
    { label: "Most Popular Book", value: analytics.mostPopularBook || "No story published yet" },
    { label: "Recent Reader Activity", value: `${Number(analytics.recentReaderActivity || 0).toLocaleString()} events` },
    { label: "Completion Rate", value: analytics.completionRate || "0%" },
  ];

  elements.analyticsStats.innerHTML = analyticsCards
    .map((item) => `
      <article class="analytics-item">
        <p>${item.label}</p>
        <strong>${item.value}</strong>
      </article>
    `)
    .join("");
}

function renderMonetization(monetization) {
  if (!elements.monetizationStats) {
    return;
  }
  const moneyCards = [
    { label: "Coins Earned", value: Number(monetization.coinsEarned || 0).toLocaleString() },
    { label: "Estimated Revenue", value: `$${Number(monetization.estimatedRevenue || 0).toLocaleString()}` },
    { label: "Paid Chapters Unlocked", value: Number(monetization.paidChaptersUnlocked || 0).toLocaleString() },
    { label: "Subscription Readers", value: Number(monetization.subscriptionReaders || 0).toLocaleString() },
  ];

  elements.monetizationStats.innerHTML = moneyCards
    .map((item) => `
      <article class="money-item">
        <p>${item.label}</p>
        <strong>${item.value}</strong>
      </article>
    `)
    .join("");
}

function renderActivity(recentActivity) {
  if (!elements.recentActivity) {
    return;
  }
  const activityRows = Array.isArray(recentActivity) ? recentActivity : [];
  const dotCycle = ["dot-green", "dot-blue", "dot-orange", "dot-red"];

  if (!activityRows.length) {
    elements.recentActivity.innerHTML = `
      <article class="activity-item wd-activity-row">
        <span class="wd-activity-dot dot-green" aria-hidden="true"></span>
        <div class="wd-activity-body">
          <strong>No recent activity yet</strong>
          <p>As readers engage with your stories, milestones will appear here.</p>
        </div>
      </article>
    `;
    return;
  }

  elements.recentActivity.innerHTML = activityRows
    .slice(0, 8)
    .map((activity, idx) => {
      const dot = dotCycle[idx % dotCycle.length];
      const datePart = activity.dateLabel ? ` · ${activity.dateLabel}` : "";
      return `
      <article class="activity-item wd-activity-row">
        <span class="wd-activity-dot ${dot}" aria-hidden="true"></span>
        <div class="wd-activity-body">
          <strong>${activity.title}</strong>
          <p>${activity.note}${datePart}</p>
        </div>
      </article>
    `;
    })
    .join("");
}

function renderAssistantActions() {
  if (!elements.assistantActions) {
    return;
  }
  elements.assistantActions.innerHTML = aiActions
    .map((label) => `<button type="button" class="assistant-btn" data-action="ai-tool">${label}</button>`)
    .join("");
}

function renderAccessNotice(message, linkHref, linkLabel) {
  if (!elements.accessNotice) {
    return;
  }
  elements.accessNotice.hidden = false;
  elements.accessNotice.innerHTML = `<p>${message} <a href="${linkHref}">${linkLabel}</a></p>`;
}

function clearAccessNotice() {
  if (!elements.accessNotice) {
    return;
  }
  elements.accessNotice.hidden = true;
  elements.accessNotice.innerHTML = "";
}

function refreshStoriesWorkspace() {
  if (currentSection !== "stories") {
    return;
  }
  const host = getStoriesListHost();
  if (!host) {
    return;
  }
  renderFilterTabs();
  renderBooks(getFilteredBooks());
}

function bindStoryControls() {
  const storyFilterTabs = document.getElementById("storiesFilterTabs") || elements.storyFilterTabs;
  const storySort = document.getElementById("storiesSortSelect") || elements.storySort;
  const storySearch = document.getElementById("storiesSearchInput") || elements.storySearch;

  if (!storyFilterTabs || !storySort || !storySearch) {
    return;
  }

  if (storyFilterTabs.dataset.bound === "true") {
    return;
  }

  storyFilterTabs.dataset.bound = "true";

  storyFilterTabs.addEventListener("click", (event) => {
    const button = event.target.closest("button[data-filter]");
    if (!button) {
      return;
    }
    uiState.activeFilter = button.dataset.filter;
    refreshStoriesWorkspace();
  });

  storySort.addEventListener("change", (event) => {
    uiState.sortBy = event.target.value;
    refreshStoriesWorkspace();
  });

  storySearch.addEventListener("input", (event) => {
    uiState.searchTerm = event.target.value.trim();
    refreshStoriesWorkspace();
  });
}

function onActionClick(event) {
  const button = event.target.closest("button[data-action]");
  if (!button) {
    return;
  }

  const storyCard = button.closest(".story-card");
  const storyId = storyCard ? storyCard.dataset.storyId : "";

  const action = button.dataset.action;
  if (action === "preview-profile") {
    window.location.href = "/reader/profile.html";
    return;
  }

  if (action === "edit-profile") {
    window.location.href = appRoutes.writerOnboarding;
    return;
  }

  if (action === "view-analytics") {
    switchSection("analytics");
    return;
  }

  if (action === "book-stats") {
    switchSection("analytics");
    return;
  }

  if (action === "create-story" || action === "new-chapter" || action === "continue-writing") {
    window.location.href = appRoutes.writerStudio;
    return;
  }

  if (action === "manage-chapters" && storyId) {
    window.location.href = `/writer/writer-story-chapters.html?storyId=${encodeURIComponent(storyId)}`;
    return;
  }

  if (action === "preview-story" && storyId) {
    window.location.href = `/reader/book.html?id=${encodeURIComponent(storyId)}`;
    return;
  }

  if (action === "create-chapter" && storyId) {
    window.location.href = `/writer/writer-story-chapters.html?storyId=${encodeURIComponent(storyId)}&addChapter=1`;
    return;
  }

  if (action === "edit-story" && storyId) {
    window.location.href = `/writer/writer-story-edit.html?storyId=${encodeURIComponent(storyId)}`;
    return;
  }

  if (action === "publish-story" && storyId) {
    fetch(`${window.NovaraSession.API_BASE_URL}/api/writer/stories/${storyId}/publish`, {
      method: "POST",
      credentials: "include",
    })
      .then((response) => response.json().then((payload) => ({ response, payload })))
      .then(({ response, payload }) => {
        if (!response.ok || !payload.success) {
          throw new Error(payload.error || "Unable to publish story");
        }
        return fetchWriterDashboardData();
      })
      .then((latestData) => {
        const profile = latestData.profile || uiState.profile;
        renderPremiumDashboard(profile, latestData);
        if (typeof currentSection !== "undefined" && currentSection === "stories") {
          writerStoriesViewState.stories = Array.isArray(latestData.books) ? latestData.books : [];
          writerStoriesViewState.stats = latestData.stats || writerStoriesViewState.stats;
          writerStoriesViewState.monetization =
            latestData.monetization || writerStoriesViewState.monetization;
          applyWriterStoriesView();
        }
        if (window.NovaraSession && typeof window.NovaraSession.showToast === "function") {
          window.NovaraSession.showToast("Story published successfully");
        }
      })
      .catch(() => {
        if (window.NovaraSession && typeof window.NovaraSession.showToast === "function") {
          window.NovaraSession.showToast("Unable to publish this story right now");
        }
      });
    return;
  }

  if (action === "delete-story" && storyId) {
    if (!confirm("Delete this story permanently? This cannot be undone.")) return;
    fetch(`${window.NovaraSession.API_BASE_URL}/api/writer/stories/${storyId}`, {
      method: "DELETE",
      credentials: "include",
    })
      .then((response) => response.json().then((payload) => ({ response, payload })))
      .then(({ response, payload }) => {
        if (!response.ok || !payload.success) {
          throw new Error(payload.error || "Unable to delete story");
        }
        return fetchWriterDashboardData();
      })
      .then((latestData) => {
        const profile = latestData.profile || uiState.profile;
        renderPremiumDashboard(profile, latestData);
        if (typeof currentSection !== "undefined" && currentSection === "stories") {
          writerStoriesViewState.stories = Array.isArray(latestData.books) ? latestData.books : [];
          writerStoriesViewState.stats = latestData.stats || writerStoriesViewState.stats;
          writerStoriesViewState.monetization =
            latestData.monetization || writerStoriesViewState.monetization;
          applyWriterStoriesView();
        }
        if (window.NovaraSession && typeof window.NovaraSession.showToast === "function") {
          window.NovaraSession.showToast("Story deleted successfully");
        }
      })
      .catch(() => {
        if (window.NovaraSession && typeof window.NovaraSession.showToast === "function") {
          window.NovaraSession.showToast("Unable to delete this story right now");
        }
      });
    return;
  }

  if (window.NovaraSession && typeof window.NovaraSession.showToast === "function") {
    window.NovaraSession.showToast("This feature will be connected in the next writer tools release.");
  }
}

async function fetchWriterDashboardData() {
  const response = await fetch(`${window.NovaraSession.API_BASE_URL}/api/writer/dashboard`, {
    cache: "no-store",
    credentials: "include",
  });

  if (!response.ok) {
    throw new Error("Writer dashboard unavailable");
  }

  const payload = await response.json();
  if (!payload || !payload.data) {
    throw new Error("Invalid writer dashboard payload");
  }
  return payload.data;
}

function initializePageInteractions() {
  bindStoryControls();
  if (elements.heroActions) {
    elements.heroActions.addEventListener("click", onActionClick);
  }
  document.addEventListener("click", onActionClick);
  renderAssistantActions();

  const profileSignOut = document.getElementById("profileSignOutLink");
  if (profileSignOut) {
    profileSignOut.addEventListener("click", async (event) => {
      event.preventDefault();
      if (window.NovaraSession && typeof window.NovaraSession.signOut === "function") {
        await window.NovaraSession.signOut("/index.html");
        return;
      }
      window.location.href = "/index.html";
    });
  }

  if (elements.writerSignOutBtn) {
    elements.writerSignOutBtn.addEventListener("click", async () => {
      if (window.NovaraSession && typeof window.NovaraSession.signOut === "function") {
        await window.NovaraSession.signOut("/index.html");
        return;
      }
      window.location.href = "/index.html";
    });
  }

  // Pen name edit modal
  if (elements.editPenNameBtn) {
    elements.editPenNameBtn.addEventListener("click", () => {
      if (elements.penNameEditModal && elements.penNameEditInput) {
        elements.penNameEditInput.value = elements.writerPenName.textContent || "";
        elements.penNameEditModal.hidden = false;
        if (elements.penNameEditMessage) {
          elements.penNameEditMessage.textContent = "";
        }
      }
    });
  }

  if (elements.cancelPenNameEdit) {
    elements.cancelPenNameEdit.addEventListener("click", () => {
      if (elements.penNameEditModal) {
        elements.penNameEditModal.hidden = true;
      }
    });
  }

  if (elements.savePenNameEdit) {
    elements.savePenNameEdit.addEventListener("click", async () => {
      if (!elements.penNameEditInput || !elements.penNameEditModal) return;

      const newPenName = elements.penNameEditInput.value.trim();
      if (!newPenName) {
        if (elements.penNameEditMessage) {
          elements.penNameEditMessage.textContent = "Pen name cannot be empty.";
        }
        return;
      }

      try {
        const API_BASE_URL = (window.NovaraSession && window.NovaraSession.API_BASE_URL) || "https://readnovara.ca";
        const response = await fetch(`${API_BASE_URL}/api/profile`, {
          method: "PATCH",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ penName: newPenName }),
        });
        const data = await response.json();

        if (!response.ok || !data.success) {
          throw new Error(data.error || "Failed to update pen name");
        }

        // Update UI
        if (elements.writerPenName) {
          elements.writerPenName.textContent = newPenName;
        }
        if (elements.authorAvatar) {
          elements.authorAvatar.textContent = extractInitials(newPenName || "Novara");
        }
        if (elements.penNameEditModal) {
          elements.penNameEditModal.hidden = true;
        }
        if (window.NovaraSession && window.NovaraSession.showToast) {
          window.NovaraSession.showToast("Pen name updated successfully");
        }
      } catch (error) {
        console.error("Failed to update pen name:", error);
        if (elements.penNameEditMessage) {
          elements.penNameEditMessage.textContent = error.message || "Failed to update pen name";
        }
      }
    });
  }
}

function renderPremiumDashboard(profile, data) {
  const books = Array.isArray(data.books) ? data.books : [];
  const stats = data.stats || {};
  const tools = data.tools || {};
  const analytics = data.analytics || {};
  const monetization = data.monetization || {};
  const recentActivity = Array.isArray(data.recentActivity) ? data.recentActivity : [];

  uiState.profile = profile;
  uiState.books = books;
  uiState.insights = data;

  if (elements.writerHeading) {
    elements.writerHeading.textContent = "Writer Dashboard";
  }
  if (elements.writerSubtitle) {
    elements.writerSubtitle.textContent = "Manage books, track growth, and publish from one workspace.";
  }
  if (elements.writerPenName) {
    elements.writerPenName.textContent = profile.penName;
  }
  if (elements.writerBio) {
    elements.writerBio.textContent =
      profile.bio || "Add a short author bio so readers know your voice.";
  }
  if (elements.authorAvatar) {
    elements.authorAvatar.textContent = extractInitials(profile.penName || profile.name || "Novara");
  }

  renderGenres(profile.preferredGenres || []);
  renderStats(stats);
  renderTopBooks(books);
  renderWritingTools(tools);
  renderAnalytics(analytics);
  renderMonetization(monetization);
  renderActivity(recentActivity);
}

async function loadDashboard() {
  initializePageInteractions();

  // This file supports multiple writer dashboard layouts; skip legacy bootstrap
  // when those DOM anchors do not exist.
  if (!elements.writerHeading || !elements.writerSubtitle) {
    return true;
  }

  const user = window.NovaraSession ? await window.NovaraSession.fetchCurrentUser() : null;

  if (!user) {
    window.location.href = "/index.html";
    return false;
  }

  if (user.role === "ADMIN") {
    window.location.href = appRoutes.adminDashboard || "/admin/admin.html";
    return false;
  }

  if (window.NovaraSession) {
    window.NovaraSession.renderDashboardSwitcher(elements.dashboardSwitcher, {
      currentDashboard: "writer",
      readerHref: appRoutes.readerDashboard,
      writerHref: appRoutes.writerDashboard,
    });
  }

  if (!window.NovaraSession.canUseWriter(user)) {
    if (writerHomeDashboard) {
      writerHomeDashboard.hidden = true;
    }
    if (elements.writerHeading) {
      elements.writerHeading.textContent = "Writer access has not been enabled yet.";
    }
    if (elements.writerSubtitle) {
      elements.writerSubtitle.textContent =
        "Complete onboarding to unlock your writer dashboard without opening a second account.";
    }
    renderAccessNotice(
      "You can start the writer journey from your reader account in one step.",
      appRoutes.writerOnboarding,
      "Open Writer Onboarding"
    );
    return true;
  }

  clearAccessNotice();

  try {
    const data = await fetchWriterDashboardData();
    const profile = data.profile || {
      penName: user.name || "Writer",
      bio: "",
      preferredGenres: [],
    };
    renderPremiumDashboard(profile, data);
    if (writerHomeDashboard) {
      writerHomeDashboard.hidden = false;
    }
    return true;
  } catch (error) {
    if (writerHomeDashboard) {
      writerHomeDashboard.hidden = true;
    }
    if (elements.writerHeading) {
      elements.writerHeading.textContent = "Your writer dashboard could not be loaded.";
    }
    if (elements.writerSubtitle) {
      elements.writerSubtitle.textContent =
        "The account is writer-enabled, but the dashboard data request failed.";
    }
    renderAccessNotice(
      "Try returning to your reader dashboard and re-open the writer workspace.",
      appRoutes.readerDashboard,
      "Open Reader Dashboard"
    );
    return true;
  }
}
