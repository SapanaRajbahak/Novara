const elements = {
  userAvatar: document.getElementById("userAvatar"),
  userName: document.getElementById("userName"),
  userEmail: document.getElementById("userEmail"),
  userPlan: document.getElementById("userPlan"),
  userBio: document.getElementById("userBio"),
  statsGrid: document.getElementById("statsGrid"),
  savedBooksList: document.getElementById("savedBooksList"),
  downloadsPlaceholder: document.getElementById("downloadsPlaceholder"),
  achievementsPlaceholder: document.getElementById("achievementsPlaceholder"),
  settingsShortcutBtn: document.getElementById("settingsShortcutBtn")
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
  const svg = `<svg xmlns='http://www.w3.org/2000/svg' width='320' height='420'>
    <defs>
      <linearGradient id='g' x1='0' x2='1' y1='0' y2='1'>
        <stop offset='0%' stop-color='${c1}'/>
        <stop offset='100%' stop-color='${c2}'/>
      </linearGradient>
    </defs>
    <rect width='100%' height='100%' rx='22' fill='url(#g)'/>
    <rect x='22' y='24' width='276' height='372' rx='16' fill='rgba(255,255,255,0.10)'/>
    <text x='50%' y='55%' dominant-baseline='middle' text-anchor='middle' fill='rgba(255,255,255,0.9)' font-family='Arial' font-size='66' font-weight='700'>${initials}</text>
  </svg>`;
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

function renderStats(stats) {
  elements.statsGrid.innerHTML = "";

  const cards = [
    { label: "Books Completed", value: stats.booksCompleted },
    { label: "Hours Listened", value: stats.hoursListened },
    { label: "Reading Streak", value: `${stats.readingStreakDays} days` },
    { label: "Favorite Genre", value: stats.favoriteGenre }
  ];

  cards.forEach((card) => {
    const item = document.createElement("article");
    item.className = "stat-card";
    item.innerHTML = `<p>${card.label}</p><strong>${card.value}</strong>`;
    elements.statsGrid.appendChild(item);
  });
}

function renderSavedBooks(books) {
  elements.savedBooksList.innerHTML = "";

  if (!books.length) {
    elements.savedBooksList.innerHTML = "<div class=\"placeholder\">No saved books yet.</div>";
    return;
  }

  books.forEach((book) => {
    const card = document.createElement("article");
    card.className = "book-card";
    card.innerHTML = `
      <img class="book-cover" src="${createCoverSvg(book.title, book.genre)}" alt="${book.title} cover" loading="lazy" />
      <h3>${book.title}</h3>
      <p>${book.author}</p>
      <a class="btn" href="book.html?id=${encodeURIComponent(book.id)}">Open</a>
    `;
    elements.savedBooksList.appendChild(card);
  });
}

function renderProfile(data) {
  elements.userAvatar.textContent = data.user.initials;
  elements.userName.textContent = data.user.name;
  elements.userEmail.textContent = data.user.email;
  elements.userPlan.textContent = `${data.user.plan} Plan`;
  elements.userBio.textContent = data.user.bio;

  renderStats(data.stats);
  renderSavedBooks(data.savedBooks || []);

  elements.downloadsPlaceholder.textContent = data.placeholders.downloaded;
  elements.achievementsPlaceholder.textContent = data.placeholders.achievements;
}

function bindEvents() {
  elements.settingsShortcutBtn.addEventListener("click", () => {
    window.location.href = "settings.html";
  });
}

async function loadProfile() {
  try {
    const response = await fetch("./data/profile.json", { cache: "no-store" });
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    return await response.json();
  } catch (error) {
    return {
      user: {
        initials: "NR",
        name: "NovelRead User",
        email: "reader@example.com",
        plan: "Standard",
        bio: "Build your reading habits with stories and audiobooks."
      },
      stats: {
        booksCompleted: 0,
        hoursListened: 0,
        readingStreakDays: 0,
        favoriteGenre: "-"
      },
      savedBooks: [],
      placeholders: {
        downloaded: "Downloaded books will appear here for offline reading.",
        achievements: "Reading badges and milestones will appear here."
      }
    };
  }
}

async function bootstrap() {
  const data = await loadProfile();
  renderProfile(data);
  bindEvents();
}

bootstrap();
