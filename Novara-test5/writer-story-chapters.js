const elements = {
  dashboardSwitcher: document.getElementById("dashboardSwitcher"),
  writerSignOutBtn: document.getElementById("writerSignOutBtn"),
  storyTitle: document.getElementById("storyTitle"),
  storyMeta: document.getElementById("storyMeta"),
  chapterForm: document.getElementById("chapterForm"),
  formError: document.getElementById("formError"),
  chapterNumber: document.getElementById("chapterNumber"),
  chapterTitle: document.getElementById("chapterTitle"),
  chapterContent: document.getElementById("chapterContent"),
  isPublished: document.getElementById("isPublished"),
  chapterList: document.getElementById("chapterList"),
  previewBtn: document.getElementById("previewBtn"),
  publishBtn: document.getElementById("publishBtn"),
};

let storyId = "";
let story = null;

function getStoryIdFromPath() {
  const queryStoryId = new URLSearchParams(window.location.search).get("storyId");
  if (queryStoryId) {
    return queryStoryId;
  }

  const match = window.location.pathname.match(/\/writer\/stories\/([^/]+)\/chapters$/i);
  return match ? decodeURIComponent(match[1]) : "";
}

function showError(message) {
  elements.formError.textContent = message;
}

async function guardAccess() {
  if (!window.NovelReadSession) {
    return false;
  }

  const user = await window.NovelReadSession.fetchCurrentUser();
  if (!user) {
    window.location.href = "./index.html";
    return false;
  }

  const allowed = window.NovelReadSession.canUseWriter(user) || user.role === "ADMIN";
  if (!allowed) {
    window.location.href = "./writer-onboarding.html";
    return false;
  }

  window.NovelReadSession.renderDashboardSwitcher(elements.dashboardSwitcher, {
    currentDashboard: "writer",
    readerHref: window.NovelReadSession.APP_ROUTES.readerDashboard,
    writerHref: window.NovelReadSession.APP_ROUTES.writerDashboard,
  });

  return true;
}

async function fetchStory() {
  const response = await fetch(`${window.NovelReadSession.API_BASE_URL}/api/writer/stories/${storyId}`, {
    credentials: "include",
    cache: "no-store",
  });
  if (!response.ok) {
    throw new Error("Unable to load story");
  }
  const payload = await response.json();
  if (!payload.success || !payload.data) {
    throw new Error("Unable to load story");
  }
  story = payload.data;
}

async function fetchChapters() {
  const response = await fetch(`${window.NovelReadSession.API_BASE_URL}/api/writer/stories/${storyId}/chapters`, {
    credentials: "include",
    cache: "no-store",
  });
  if (!response.ok) {
    throw new Error("Unable to load chapters");
  }
  const payload = await response.json();
  if (!payload.success || !Array.isArray(payload.data)) {
    throw new Error("Unable to load chapters");
  }
  return payload.data;
}

function renderStoryHeader() {
  if (!story) {
    return;
  }
  elements.storyTitle.textContent = story.title || "Story Chapters";
  elements.storyMeta.textContent = `${story.genre || "General"} · ${story.status} · Chapters: ${Number(story.chapters || 0)}`;
}

function renderChapters(chapters) {
  if (!chapters.length) {
    elements.chapterList.innerHTML = "<p class=\"subcopy\">No chapters added yet.</p>";
    return;
  }

  elements.chapterList.innerHTML = chapters
    .map((chapter) => `
      <article class="chapter-row" data-chapter-id="${chapter.id}">
        <div>
          <h3>Chapter ${chapter.chapterNumber}: ${chapter.title}</h3>
          <p>${chapter.isPublished ? "Published" : "Draft"} · Updated ${new Date(chapter.updatedAt).toLocaleDateString()}</p>
        </div>
        <div class="row-actions">
          <button type="button" data-action="edit">Edit</button>
          <button type="button" data-action="delete">Delete</button>
        </div>
      </article>
    `)
    .join("");
}

function resetForm() {
  elements.chapterNumber.value = "";
  elements.chapterTitle.value = "";
  elements.chapterContent.value = "";
  elements.isPublished.checked = false;
}

function validateChapterInput() {
  const title = elements.chapterTitle.value.trim();
  const content = elements.chapterContent.value.trim();
  const chapterNumber = Number(elements.chapterNumber.value);

  if (!title) {
    return "Chapter title is required.";
  }
  if (!content) {
    return "Chapter content is required.";
  }
  if (!Number.isInteger(chapterNumber) || chapterNumber < 1) {
    return "Chapter number must be a positive integer.";
  }
  return "";
}

async function reloadAll() {
  await fetchStory();
  renderStoryHeader();
  const chapters = await fetchChapters();
  renderChapters(chapters);
}

function bindChapterForm() {
  elements.chapterForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    showError("");

    const validationError = validateChapterInput();
    if (validationError) {
      showError(validationError);
      return;
    }

    try {
      const response = await fetch(`${window.NovelReadSession.API_BASE_URL}/api/writer/stories/${storyId}/chapters`, {
        method: "POST",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          chapterNumber: Number(elements.chapterNumber.value),
          title: elements.chapterTitle.value.trim(),
          content: elements.chapterContent.value.trim(),
          isPublished: elements.isPublished.checked,
        }),
      });

      const payload = await response.json().catch(() => ({ success: false, error: "Unable to add chapter" }));
      if (!response.ok || !payload.success) {
        showError(payload.error || "Unable to add chapter");
        return;
      }

      resetForm();
      await reloadAll();
      window.NovelReadSession.showToast("Chapter saved");
    } catch (error) {
      showError("Unable to save chapter right now.");
    }
  });
}

function bindChapterActions() {
  elements.chapterList.addEventListener("click", async (event) => {
    const button = event.target.closest("button[data-action]");
    if (!button) {
      return;
    }

    const row = button.closest("[data-chapter-id]");
    if (!row) {
      return;
    }

    const chapterId = row.dataset.chapterId;

    if (button.dataset.action === "delete") {
      const response = await fetch(`${window.NovelReadSession.API_BASE_URL}/api/writer/chapters/${chapterId}`, {
        method: "DELETE",
        credentials: "include",
      });
      if (response.ok) {
        await reloadAll();
        window.NovelReadSession.showToast("Chapter deleted");
      }
      return;
    }

    if (button.dataset.action === "edit") {
      const nextTitle = window.prompt("New chapter title:");
      if (!nextTitle) {
        return;
      }
      const response = await fetch(`${window.NovelReadSession.API_BASE_URL}/api/writer/chapters/${chapterId}`, {
        method: "PUT",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ title: nextTitle.trim() }),
      });
      if (response.ok) {
        await reloadAll();
        window.NovelReadSession.showToast("Chapter updated");
      }
    }
  });
}

function bindStoryActions() {
  elements.previewBtn.addEventListener("click", () => {
    window.location.href = `book.html?id=${encodeURIComponent(storyId)}`;
  });

  elements.publishBtn.addEventListener("click", async () => {
    const response = await fetch(`${window.NovelReadSession.API_BASE_URL}/api/writer/stories/${storyId}/publish`, {
      method: "POST",
      credentials: "include",
    });

    const payload = await response.json().catch(() => ({ success: false }));
    if (!response.ok || !payload.success) {
      showError(payload.error || "Unable to publish story");
      return;
    }

    await reloadAll();
    window.NovelReadSession.showToast("Story published");
  });
}

async function bootstrap() {
  storyId = getStoryIdFromPath();
  if (!storyId) {
    window.location.href = window.NovelReadSession.APP_ROUTES.writerDashboard;
    return;
  }

  const allowed = await guardAccess();
  if (!allowed) {
    return;
  }

  if (elements.writerSignOutBtn) {
    elements.writerSignOutBtn.addEventListener("click", async () => {
      if (window.NovelReadSession && typeof window.NovelReadSession.signOut === "function") {
        await window.NovelReadSession.signOut("./index.html");
        return;
      }
      window.location.href = "./index.html";
    });
  }

  try {
    await reloadAll();
  } catch (error) {
    showError("Unable to load story workspace.");
  }

  bindChapterForm();
  bindChapterActions();
  bindStoryActions();
}

bootstrap();
