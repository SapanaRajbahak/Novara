const elements = {
  dashboardSwitcher: document.getElementById("dashboardSwitcher"),
  writerSignOutBtn: document.getElementById("writerSignOutBtn"),
  storyForm: document.getElementById("storyForm"),
  formError: document.getElementById("formError"),
  title: document.getElementById("title"),
  description: document.getElementById("description"),
  genre: document.getElementById("genre"),
  tags: document.getElementById("tags"),
  status: document.getElementById("status"),
  bookType: document.getElementById("bookType"),
  coverUpload: document.getElementById("coverUpload"),
  coverName: document.getElementById("coverName"),
};

let coverDataUrl = "";
const MAX_COVER_SIZE_BYTES = 2 * 1024 * 1024;

function parseTags(value) {
  return String(value || "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function showError(message) {
  elements.formError.textContent = message;
}

async function guardWriterAccess() {
  if (!window.NovelReadSession) {
    return false;
  }

  const user = await window.NovelReadSession.fetchCurrentUser();
  if (!user) {
    window.location.href = "index.html";
    return false;
  }

  const hasWriterAccess = window.NovelReadSession.canUseWriter(user) || user.role === "ADMIN";
  if (!hasWriterAccess) {
    window.location.href = "writer-onboarding.html";
    return false;
  }

  window.NovelReadSession.renderDashboardSwitcher(elements.dashboardSwitcher, {
    currentDashboard: "writer",
    readerHref: window.NovelReadSession.APP_ROUTES.readerDashboard,
    writerHref: window.NovelReadSession.APP_ROUTES.writerDashboard,
  });

  return true;
}

function wireCoverInput() {
  elements.coverUpload.addEventListener("change", () => {
    const file = elements.coverUpload.files && elements.coverUpload.files[0];

    if (!file) {
      coverDataUrl = "";
      elements.coverName.textContent = "No cover selected yet.";
      return;
    }

    elements.coverName.textContent = `Selected: ${file.name}`;
    if (!file.type.startsWith("image/")) {
      coverDataUrl = "";
      elements.coverName.textContent = "Invalid file type. Please select an image.";
      return;
    }

    if (file.size > MAX_COVER_SIZE_BYTES) {
      coverDataUrl = "";
      elements.coverUpload.value = "";
      elements.coverName.textContent = "Image is too large. Max size is 2 MB.";
      showError("Cover image is too large. Please choose an image smaller than 2 MB.");
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      coverDataUrl = typeof reader.result === "string" ? reader.result : "";
    };
    reader.onerror = () => {
      coverDataUrl = "";
      elements.coverName.textContent = "Unable to read this file.";
    };
    reader.readAsDataURL(file);
  });
}

function getPayload() {
  return {
    title: elements.title.value.trim(),
    description: elements.description.value.trim(),
    genre: elements.genre.value,
    tags: parseTags(elements.tags.value),
    status: elements.status.value,
    bookType: elements.bookType.value,
    coverUrl: coverDataUrl,
  };
}

function validatePayload(payload) {
  if (!payload.title) {
    return "Title is required.";
  }
  if (!payload.description) {
    return "Description is required.";
  }
  if (!payload.genre) {
    return "Genre is required.";
  }
  return "";
}

function bindForm() {
  elements.storyForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    showError("");

    const payload = getPayload();
    const validationError = validatePayload(payload);
    if (validationError) {
      showError(validationError);
      return;
    }

    try {
      const response = await fetch(`${window.NovelReadSession.API_BASE_URL}/api/writer/stories`, {
        method: "POST",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });

      const result = await response.json().catch(() => ({ success: false, error: "Unable to create story" }));
      if (!response.ok || !result.success || !result.data || !result.data.id) {
        showError(result.error || `Unable to create story (HTTP ${response.status})`);
        return;
      }

      window.location.href = `./writer-story-chapters.html?storyId=${encodeURIComponent(result.data.id)}`;
    } catch (error) {
      showError("Unable to create story right now. Please try again.");
    }
  });
}

async function bootstrap() {
  const allowed = await guardWriterAccess();
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

  wireCoverInput();
  bindForm();
}

bootstrap();
