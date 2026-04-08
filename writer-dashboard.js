// --- SPA Sidebar Navigation Logic ---
const sidebarNav = document.querySelector(".writer-dashboard-sidebar");
const sectionContent = document.getElementById("writerSectionContent");
const dashboardTitle = document.getElementById("writerDashboardTitle");

const WRITER_SECTIONS = [
  {
    key: "home",
    label: "Home",
    render: renderWriterHomeSectionV2,
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
    label: "AI Tools",
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
  window.location.replace("./writer-referrals.html");
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
  dashboardTitle.textContent = section.label;
  // Smooth fade out/in
  sectionContent.style.opacity = 0;
  setTimeout(() => {
    sectionContent.innerHTML = section.render();
    sectionContent.style.opacity = 1;

    if (section.key === "stories") {
      bindWriterStoriesControls();
      loadWriterStoriesSectionData();
    }

    if (section.key === "earnings") {
      loadWriterEarningsData();
    }
  }, 180);
}
// Fetch real earnings data from backend and render
async function loadWriterEarningsData() {
  try {
    const response = await fetch('/api/writer/dashboard', { credentials: 'include' });
    const payload = await response.json();
    if (payload.success && payload.data && payload.data.monetization) {
      sectionContent.innerHTML = renderWriterEarningsSection(payload.data.monetization);
    } else {
      sectionContent.innerHTML = '<div class="error">Unable to load earnings data.</div>';
    }
  } catch (e) {
    sectionContent.innerHTML = '<div class="error">Unable to load earnings data.</div>';
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
    <section class="writer-stories">
      <div class="stories-workspace-head">
        <div>
          <div class="section-eyebrow">Workspace</div>
          <h2>Your Books</h2>
        </div>
        <div class="stories-workspace-controls">
          <div class="stories-filter-tabs" id="storiesFilterTabs" role="tablist" aria-label="Story status filters">
            <button class="stories-filter-tab is-active" type="button" data-filter="ALL">All</button>
            <button class="stories-filter-tab" type="button" data-filter="DRAFT">Drafts</button>
            <button class="stories-filter-tab" type="button" data-filter="PUBLISHED">Published</button>
            <button class="stories-filter-tab" type="button" data-filter="SCHEDULED">Scheduled</button>
          </div>
          <label class="stories-sort-control">
            <span>Sort</span>
            <select id="storiesSortSelect">
              <option value="last-edited">Last Edited</option>
              <option value="title-asc">Title A-Z</option>
              <option value="title-desc">Title Z-A</option>
              <option value="most-reads">Most Reads</option>
            </select>
          </label>
        </div>
      </div>
      <div class="stories-search-wrap">
        <label class="section-eyebrow" for="storiesSearchInput">Search your books</label>
        <input id="storiesSearchInput" class="stories-search-input" type="search" placeholder="Search your books" />
      </div>
      <div class="stories-create-row">
        <a class="btn btn-primary" href="writer-stories-new.html">Create Book</a>
      </div>
      <div id="writerStoriesDynamicList" class="writer-stories-list"></div>
    </section>
  `;
}
function renderWriterHomeSectionV2() {
  return `
    <section class="writer-home">
      <div class="home-welcome-card">
        <div class="section-eyebrow">Writer Dashboard</div>
        <h2 class="home-welcome-title">Welcome back, Estella.</h2>
        <p class="home-welcome-subtitle">
          Manage your author profile, books, and publishing flow while switching between reader and writer
          dashboards from one account.
        </p>
        <div class="home-welcome-actions">
          <button class="btn btn-primary" onclick="window.location.href='writer-stories-new.html'">Create New Story</button>
          <button class="btn btn-secondary" onclick="switchSection('stories')">New Chapter</button>
          <button class="btn btn-soft" onclick="window.location.href='profile.html'">Preview Author Profile</button>
        </div>
      </div>
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
};

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
    function renderWriterEarningsSection(monetization = {}) {
      // Use real backend data for earnings
      return `
        <section class="writer-earnings">
          <div class="page-header">
            <div class="section-eyebrow">Monetization</div>
            <div class="page-title">Earnings Overview</div>
            <div class="page-subtitle">Track revenue, payouts, and performance across all your books</div>
          </div>
          <div class="stats-grid">
            <div class="stat-card">
              <div class="stat-icon-row"><div class="stat-label">Total Earnings</div><div class="stat-icon-pill pill-gold">💰</div></div>
              <div class="stat-value">$${monetization.estimatedRevenue ?? 0}</div>
              <span class="stat-change up">▲ 18.4% vs last period</span>
            </div>
            <div class="stat-card">
              <div class="stat-icon-row"><div class="stat-label">Coins Earned</div><div class="stat-icon-pill pill-green">🪙</div></div>
              <div class="stat-value">${monetization.coinsEarned ?? 0}</div>
              <span class="stat-change up">▲ 12.1% vs last month</span>
            </div>
            <!-- Add more cards as needed, using monetization fields -->
          </div>
          <!-- ...rest of your section... -->
        </section>
      `;
    }
      </div>
    `;
  }
}
function renderWriterEarningsSection() {
  // Premium Monetization/Earnings SPA Section
  return `
    <section class="writer-earnings">
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
                <div style="font-size:11px;color:var(--text3);">Min. threshold: $20</div>
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
      <h2>Analytics (Coming Soon)</h2>
      <div class="analytics-placeholder">Deeper insights, engagement charts, and growth metrics will appear here.</div>
    </section>
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
  const isFileProtocol = window.location.protocol === "file:";
  const protocol = isFileProtocol ? "http:" : window.location.protocol;
  const host = !isFileProtocol && window.location.hostname ? window.location.hostname : "localhost";
  return `${protocol}//${host}:5002`;
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

// Initial load
window.addEventListener("DOMContentLoaded", () => {
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
    writerOnboarding: "./writer-onboarding.html",
  }
  : {
    readerDashboard: "./reader-dashboard.html",
    writerDashboard: "./writer-dashboard.html",
    writerOnboarding: "./writer-onboarding.html",
    writerStudio: "./writer-stories-new.html",
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
  const values = Array.isArray(genres) && genres.length ? genres : ["General Fiction", "Contemporary"];
  elements.writerGenres.innerHTML = values
    .map((genre) => `<span class="genre-chip">${genre}</span>`)
    .join("");
}

function renderStats(stats) {
  const cards = [
    { label: "Total Books", value: Number(stats.totalBooks || 0).toLocaleString() },
    { label: "Published", value: Number(stats.publishedBooks || 0).toLocaleString() },
    { label: "Drafts", value: Number(stats.drafts || 0).toLocaleString() },
    { label: "Total Chapters", value: Number(stats.totalChapters || 0).toLocaleString() },
    { label: "Total Reads", value: Number(stats.totalReads || 0).toLocaleString() },
    { label: "Likes / Favorites", value: Number(stats.totalFavorites || 0).toLocaleString() },
    { label: "Comments", value: Number(stats.totalComments || 0).toLocaleString() },
    { label: "Genres", value: Number(stats.totalGenres || 0).toLocaleString() },
  ];

  elements.writerStats.innerHTML = cards
    .map((card) => `
      <article class="stat-card">
        <p>${card.label}</p>
        <strong>${card.value}</strong>
      </article>
    `)
    .join("");
}

function renderFilterTabs() {
  elements.storyFilterTabs.innerHTML = filterTabs
    .map((tab) => `
      <button
        type="button"
        class="tab-btn ${uiState.activeFilter === tab.key ? "is-active" : ""}"
        role="tab"
        aria-selected="${uiState.activeFilter === tab.key ? "true" : "false"}"
        data-filter="${tab.key}"
      >
        ${tab.label}
      </button>
    `)
    .join("");
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
  elements.writerContent.innerHTML = `
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
  if (!books.length) {
    renderEmptyState(uiState.profile);
    return;
  }

  elements.writerContent.innerHTML = `
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
  const toolCards = [
    { label: "Word Count Today", value: `${Number(tools.wordCountToday || 0).toLocaleString()} words` },
    { label: "Weekly Writing Streak", value: `${Number(tools.weeklyWritingStreak || 0).toLocaleString()} days` },
    { label: "Draft Completion %", value: `${Number(tools.draftCompletionPercent || 0).toLocaleString()}%` },
    { label: "Auto-save Status", value: tools.autoSaveStatus || "Active - waiting for your first draft" },
  ];

  elements.writingTools.innerHTML = toolCards
    .map((tool) => `
      <article class="tool-item">
        <p>${tool.label}</p>
        <strong>${tool.value}</strong>
      </article>
    `)
    .join("");
}

function renderReadsChart(readsOverTime) {
  const series = Array.isArray(readsOverTime) ? readsOverTime : [];
  const values = series.map((item) => Number(item.value || 0));
  const maxValue = Math.max(...values, 1);

  elements.readsChart.innerHTML = values
    .map((value, index) => {
      const height = Math.max(18, Math.round((Number(value || 0) / maxValue) * 120));
      return `
        <div class="chart-bar" style="height:${height}px">
          <span>${series[index] ? series[index].month : "-"}</span>
        </div>
      `;
    })
    .join("");

  return values;
}

function renderAnalytics(analytics) {
  renderReadsChart(analytics.readsOverTime || []);
  const trendValue = Number(analytics.engagementTrend || 0);

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
  const activityRows = Array.isArray(recentActivity) ? recentActivity : [];

  if (!activityRows.length) {
    elements.recentActivity.innerHTML = `
      <article class="activity-item">
        <strong>No recent reader activity yet</strong>
        <p>As readers engage with your stories, real-time events will appear here.</p>
      </article>
    `;
    return;
  }

  elements.recentActivity.innerHTML = activityRows
    .slice(0, 7)
    .map((activity) => `
      <article class="activity-item">
        <strong>${activity.title}</strong>
        <p>${activity.note}${activity.dateLabel ? ` Â· ${activity.dateLabel}` : ""}</p>
      </article>
    `)
    .join("");
}

function renderAssistantActions() {
  elements.assistantActions.innerHTML = aiActions
    .map((label) => `<button type="button" class="assistant-btn" data-action="ai-tool">${label}</button>`)
    .join("");
}

function renderAccessNotice(message, linkHref, linkLabel) {
  elements.accessNotice.hidden = false;
  elements.accessNotice.innerHTML = `<p>${message} <a href="${linkHref}">${linkLabel}</a></p>`;
}

function clearAccessNotice() {
  elements.accessNotice.hidden = true;
  elements.accessNotice.innerHTML = "";
}

function refreshStoriesWorkspace() {
  renderFilterTabs();
  renderBooks(getFilteredBooks());
}

function bindStoryControls() {
  elements.storyFilterTabs.addEventListener("click", (event) => {
    const button = event.target.closest("button[data-filter]");
    if (!button) {
      return;
    }
    uiState.activeFilter = button.dataset.filter;
    refreshStoriesWorkspace();
  });

  elements.storySort.addEventListener("change", (event) => {
    uiState.sortBy = event.target.value;
    refreshStoriesWorkspace();
  });

  elements.storySearch.addEventListener("input", (event) => {
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
    window.location.href = "./profile.html";
    return;
  }

  if (action === "edit-profile") {
    window.location.href = appRoutes.writerOnboarding;
    return;
  }

  if (action === "create-story" || action === "new-chapter" || action === "continue-writing") {
    window.location.href = appRoutes.writerStudio;
    return;
  }

  if (action === "manage-chapters" && storyId) {
    window.location.href = `./writer-story-chapters.html?storyId=${encodeURIComponent(storyId)}`;
    return;
  }

  if (action === "preview-story" && storyId) {
    window.location.href = `./book.html?id=${encodeURIComponent(storyId)}`;
    return;
  }

  if (action === "edit-story" && storyId) {
    window.location.href = `./writer-story-chapters.html?storyId=${encodeURIComponent(storyId)}`;
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
  elements.heroActions.addEventListener("click", onActionClick);
  document.addEventListener("click", onActionClick);
  renderAssistantActions();

  if (elements.writerSignOutBtn) {
    elements.writerSignOutBtn.addEventListener("click", async () => {
      if (window.NovaraSession && typeof window.NovaraSession.signOut === "function") {
        await window.NovaraSession.signOut("./index.html");
        return;
      }
      window.location.href = "./index.html";
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

  elements.writerHeading.textContent = `Welcome back, ${profile.penName}.`;
  elements.writerSubtitle.textContent = "Manage your author profile, books, and publishing flow while switching between reader and writer dashboards from one account.";
  elements.writerPenName.textContent = profile.penName;
  elements.writerBio.textContent = profile.bio || "Add a short author bio to build trust with your readers and highlight your writing voice.";
  elements.authorAvatar.textContent = extractInitials(profile.penName || profile.name || "Novara");

  renderGenres(profile.preferredGenres || []);
  renderStats(stats);
  renderWritingTools(tools);
  renderAnalytics(analytics);
  renderMonetization(monetization);
  renderActivity(recentActivity);
  refreshStoriesWorkspace();
}

async function loadDashboard() {
  initializePageInteractions();

  const user = window.NovaraSession ? await window.NovaraSession.fetchCurrentUser() : null;

  if (!user) {
    elements.writerHeading.textContent = "Writer access requires a signed-in reader account.";
    elements.writerSubtitle.textContent = "Sign in first, then enable writer access from the same account.";
    renderAccessNotice(
      "This dashboard is hidden until writer access is enabled on your reader profile.",
      appRoutes.readerDashboard,
      "Return to Reader Dashboard"
    );
    return;
  }

  if (window.NovaraSession) {
    window.NovaraSession.renderDashboardSwitcher(elements.dashboardSwitcher, {
      currentDashboard: "writer",
      readerHref: appRoutes.readerDashboard,
      writerHref: appRoutes.writerDashboard,
    });
  }

  if (!window.NovaraSession.canUseWriter(user)) {
    elements.writerHeading.textContent = "Writer access has not been enabled yet.";
    elements.writerSubtitle.textContent = "Complete onboarding to unlock your writer dashboard without opening a second account.";
    renderAccessNotice(
      "You can start the writer journey from your reader account in one step.",
      appRoutes.writerOnboarding,
      "Open Writer Onboarding"
    );
    return;
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
  } catch (error) {
    elements.writerHeading.textContent = "Your writer dashboard could not be loaded.";
    elements.writerSubtitle.textContent = "The account is writer-enabled, but the dashboard data request failed.";
    renderAccessNotice(
      "Try returning to your reader dashboard and re-open the writer workspace.",
      appRoutes.readerDashboard,
      "Open Reader Dashboard"
    );
  }
}

loadDashboard();


