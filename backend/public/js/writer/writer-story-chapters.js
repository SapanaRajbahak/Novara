const AI_ENDPOINTS = {
  "story-idea": "story-idea",
  "generate-chapter": "generate-chapter",
  "rewrite-scene": "rewrite-scene",
  "improve-dialogue": "improve-dialogue",
  "continue-writing": "continue-writing",
  "expand-scene": "expand-scene",
  "create-chapter-title": "create-chapter-title",
};

const AI_TOOLS_REQUIRING_SELECTION = new Set([
  "rewrite-scene",
  "improve-dialogue",
  "expand-scene",
]);

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
  chapterEditorModal: document.getElementById("chapterEditorModal"),
  chapterEditorForm: document.getElementById("chapterEditorForm"),
  chapterEditorMeta: document.getElementById("chapterEditorMeta"),
  chapterEditorMessage: document.getElementById("chapterEditorMessage"),
  closeChapterEditorBtn: document.getElementById("closeChapterEditorBtn"),
  cancelChapterEditBtn: document.getElementById("cancelChapterEditBtn"),
  saveChapterChangesBtn: document.getElementById("saveChapterChangesBtn"),
  editChapterNumber: document.getElementById("editChapterNumber"),
  editChapterTitle: document.getElementById("editChapterTitle"),
  editChapterContent: document.getElementById("editChapterContent"),
  editIsPublished: document.getElementById("editIsPublished"),
  editorSelectionStatus: document.getElementById("editorSelectionStatus"),
  aiToolGrid: document.getElementById("aiToolGrid"),
  aiInstructions: document.getElementById("aiInstructions"),
  aiContextSummary: document.getElementById("aiContextSummary"),
  aiSelectedTextPreview: document.getElementById("aiSelectedTextPreview"),
  generateAiPreviewBtn: document.getElementById("generateAiPreviewBtn"),
  aiGenerationStatus: document.getElementById("aiGenerationStatus"),
  aiPreviewOutput: document.getElementById("aiPreviewOutput"),
  replaceContentBtn: document.getElementById("replaceContentBtn"),
  insertAtCursorBtn: document.getElementById("insertAtCursorBtn"),
  appendToChapterBtn: document.getElementById("appendToChapterBtn"),
  useAsTitleBtn: document.getElementById("useAsTitleBtn"),
  regenerateAiBtn: document.getElementById("regenerateAiBtn"),
  cancelAiPreviewBtn: document.getElementById("cancelAiPreviewBtn"),
};

let storyId = "";
let story = null;
const writerState = {
  chapters: [],
  editingChapterId: "",
  isSavingEdit: false,
  isGeneratingAi: false,
  activeAiTool: "generate-chapter",
  activeChapter: null,
  editorSelection: {
    start: 0,
    end: 0,
    direction: "none",
  },
  aiPreviewText: "",
  lastAiRequest: null,
};

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

function setEditorMessage(message, tone = "") {
  elements.chapterEditorMessage.textContent = message;
  elements.chapterEditorMessage.classList.remove("is-error", "is-success");

  if (tone === "error") {
    elements.chapterEditorMessage.classList.add("is-error");
  }

  if (tone === "success") {
    elements.chapterEditorMessage.classList.add("is-success");
  }
}

function setAiStatus(message, tone = "") {
  elements.aiGenerationStatus.textContent = message;
  elements.aiGenerationStatus.classList.remove("is-error", "is-success");

  if (tone === "error") {
    elements.aiGenerationStatus.classList.add("is-error");
  }

  if (tone === "success") {
    elements.aiGenerationStatus.classList.add("is-success");
  }
}

function getSelectedEditorText() {
  const { start, end } = writerState.editorSelection;
  if (end <= start) {
    return "";
  }

  return elements.editChapterContent.value.slice(start, end);
}

function getTrimmedSelectedEditorText() {
  return getSelectedEditorText().trim();
}

function getPreviewTitleValue() {
  const firstLine = String(writerState.aiPreviewText || "")
    .split("\n")
    .map((line) => line.trim())
    .find(Boolean);

  return firstLine ? firstLine.slice(0, 180) : "";
}

function setAiPreviewText(value) {
  writerState.aiPreviewText = String(value || "");
  elements.aiPreviewOutput.value = writerState.aiPreviewText;
  syncAiPreviewActions();
}

function clearAiPreview() {
  writerState.lastAiRequest = null;
  setAiPreviewText("");
  setAiStatus("AI preview cleared.");
}

function syncAiPreviewActions() {
  const hasPreview = Boolean(writerState.aiPreviewText.trim());
  elements.replaceContentBtn.disabled = !hasPreview;
  elements.insertAtCursorBtn.disabled = !hasPreview;
  elements.appendToChapterBtn.disabled = !hasPreview;
  elements.useAsTitleBtn.disabled = !hasPreview;
  elements.regenerateAiBtn.disabled = !writerState.lastAiRequest || writerState.isGeneratingAi;
  elements.cancelAiPreviewBtn.disabled = !hasPreview;
}

function setAiTool(tool) {
  writerState.activeAiTool = tool in AI_ENDPOINTS ? tool : "generate-chapter";
  elements.aiToolGrid.querySelectorAll("[data-ai-tool]").forEach((button) => {
    button.classList.toggle("is-active", button.dataset.aiTool === writerState.activeAiTool);
  });
  updateAiContextSummary();
}

function getSelectionPreview(value, maxLength = 220) {
  const compact = String(value || "").replace(/\s+/g, " ").trim();
  if (!compact) {
    return "No text selected yet.";
  }
  if (compact.length <= maxLength) {
    return compact;
  }
  return `${compact.slice(0, maxLength)}...`;
}

function updateSelectionStatus() {
  const selectedText = getTrimmedSelectedEditorText();
  const { start, end } = writerState.editorSelection;
  const hasSelection = Boolean(selectedText);

  if (hasSelection) {
    elements.editorSelectionStatus.textContent = `Selected ${end - start} characters for AI-assisted rewrite tools.`;
    elements.editorSelectionStatus.classList.add("has-selection");
  } else {
    elements.editorSelectionStatus.textContent = `Cursor ready at character ${start}. Select text to unlock rewrite, dialogue, and expansion tools.`;
    elements.editorSelectionStatus.classList.remove("has-selection");
  }

  elements.aiSelectedTextPreview.textContent = getSelectionPreview(selectedText);
}

function updateAiContextSummary() {
  const chapterNumber = Number(elements.editChapterNumber.value) || writerState.activeChapter?.chapterNumber || "";
  const chapterTitle = elements.editChapterTitle.value.trim() || writerState.activeChapter?.title || "Untitled chapter";
  const genre = story?.genre || "General";
  const contentLength = elements.editChapterContent.value.trim().length;
  const selectedText = getTrimmedSelectedEditorText();
  const selectionNeeded = AI_TOOLS_REQUIRING_SELECTION.has(writerState.activeAiTool);

  elements.aiContextSummary.textContent = [
    `Book: ${story?.title || "Story workspace"}`,
    `Genre: ${genre}`,
    `Chapter ${chapterNumber || "?"}: ${chapterTitle}`,
    `Draft length: ${contentLength.toLocaleString()} characters`,
    selectionNeeded
      ? (selectedText ? "Selection detected for this AI tool." : "This AI tool needs selected text from the chapter editor.")
      : "This AI tool will use the current chapter draft and writing context.",
  ].join("\n");
}

function captureEditorSelection() {
  writerState.editorSelection = {
    start: elements.editChapterContent.selectionStart || 0,
    end: elements.editChapterContent.selectionEnd || 0,
    direction: elements.editChapterContent.selectionDirection || "none",
  };
  updateSelectionStatus();
  updateAiContextSummary();
}

function restoreEditorSelection() {
  const length = elements.editChapterContent.value.length;
  const start = Math.min(writerState.editorSelection.start || 0, length);
  const end = Math.min(writerState.editorSelection.end || start, length);
  elements.editChapterContent.focus();
  elements.editChapterContent.setSelectionRange(start, end, writerState.editorSelection.direction || "none");
}

function insertTextAtPosition(baseValue, insertValue, index) {
  return `${baseValue.slice(0, index)}${insertValue}${baseValue.slice(index)}`;
}

function applyPreviewToEditor(mode) {
  const previewText = writerState.aiPreviewText.trim();
  if (!previewText) {
    setAiStatus("Generate an AI preview before inserting it into the chapter.", "error");
    return;
  }

  if (mode === "replace") {
    elements.editChapterContent.value = writerState.aiPreviewText;
    writerState.editorSelection = {
      start: 0,
      end: 0,
      direction: "none",
    };
    setAiStatus("AI preview replaced the chapter content in the editor. Save Changes to keep it.", "success");
  } else if (mode === "insert") {
    const insertIndex = Math.min(writerState.editorSelection.end || 0, elements.editChapterContent.value.length);
    const nextValue = insertTextAtPosition(elements.editChapterContent.value, writerState.aiPreviewText, insertIndex);
    elements.editChapterContent.value = nextValue;
    const nextCursor = insertIndex + writerState.aiPreviewText.length;
    writerState.editorSelection = {
      start: nextCursor,
      end: nextCursor,
      direction: "none",
    };
    restoreEditorSelection();
    setAiStatus("AI preview inserted at the saved cursor position. Save Changes to keep it.", "success");
  } else if (mode === "append") {
    const currentValue = elements.editChapterContent.value;
    const joiner = currentValue && !currentValue.endsWith("\n") ? "\n\n" : (currentValue ? "\n" : "");
    elements.editChapterContent.value = `${currentValue}${joiner}${writerState.aiPreviewText}`;
    const nextCursor = elements.editChapterContent.value.length;
    writerState.editorSelection = {
      start: nextCursor,
      end: nextCursor,
      direction: "none",
    };
    restoreEditorSelection();
    setAiStatus("AI preview appended to the chapter draft. Save Changes to keep it.", "success");
  } else if (mode === "title") {
    const titleValue = getPreviewTitleValue();
    if (!titleValue) {
      setAiStatus("The AI preview does not contain a usable title yet.", "error");
      return;
    }
    elements.editChapterTitle.value = titleValue;
    setAiStatus("AI preview applied to the chapter title. Save Changes to keep it.", "success");
  }

  updateAiContextSummary();
  captureEditorSelection();
}

function resetForm() {
  elements.chapterNumber.value = "";
  elements.chapterTitle.value = "";
  elements.chapterContent.value = "";
  elements.isPublished.checked = false;
}

function resetEditorForm() {
  writerState.editingChapterId = "";
  writerState.activeChapter = null;
  writerState.editorSelection = {
    start: 0,
    end: 0,
    direction: "none",
  };
  writerState.lastAiRequest = null;
  elements.editChapterNumber.value = "";
  elements.editChapterTitle.value = "";
  elements.editChapterContent.value = "";
  elements.editIsPublished.checked = false;
  elements.aiInstructions.value = "";
  elements.chapterEditorMeta.textContent = "Loading chapter details...";
  elements.editorSelectionStatus.textContent = "Select text in the chapter editor to unlock rewrite, dialogue, and expansion tools.";
  elements.editorSelectionStatus.classList.remove("has-selection");
  elements.aiContextSummary.textContent = "Chapter details will appear here after the editor loads.";
  elements.aiSelectedTextPreview.textContent = "No text selected yet.";
  setEditorMessage("");
  setAiStatus("");
  setAiPreviewText("");
  setAiTool("generate-chapter");
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

function validateEditorInput() {
  const title = elements.editChapterTitle.value.trim();
  const content = elements.editChapterContent.value.trim();
  const chapterNumber = Number(elements.editChapterNumber.value);

  if (!Number.isInteger(chapterNumber) || chapterNumber < 1) {
    return "Chapter number must be a positive integer.";
  }
  if (!title) {
    return "Chapter title is required.";
  }
  if (!content) {
    return "Chapter content is required.";
  }

  return "";
}

async function guardAccess() {
  if (!window.NovaraSession) {
    return false;
  }

  const user = await window.NovaraSession.fetchCurrentUser();
  if (!user) {
    window.location.href = "/index.html";
    return false;
  }

  const allowed = window.NovaraSession.canUseWriter(user) || user.role === "ADMIN";
  if (!allowed) {
    window.location.href = "/writer/writer-onboarding.html";
    return false;
  }

  window.NovaraSession.renderDashboardSwitcher(elements.dashboardSwitcher, {
    currentDashboard: "writer",
    readerHref: window.NovaraSession.APP_ROUTES.readerDashboard,
    writerHref: window.NovaraSession.APP_ROUTES.writerDashboard,
  });

  return true;
}

async function fetchStory() {
  const response = await fetch(`${window.NovaraSession.API_BASE_URL}/api/writer/stories/${storyId}`, {
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
  const response = await fetch(`${window.NovaraSession.API_BASE_URL}/api/writer/stories/${storyId}/chapters`, {
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

async function fetchChapterById(chapterId) {
  const response = await fetch(`${window.NovaraSession.API_BASE_URL}/api/writer/chapters/${chapterId}`, {
    credentials: "include",
    cache: "no-store",
  });

  const payload = await response.json().catch(() => ({ success: false }));
  if (!response.ok || !payload.success || !payload.data) {
    throw new Error(payload.error || "Unable to load chapter");
  }

  return payload.data;
}

function renderStoryHeader() {
  if (!story) {
    return;
  }
  elements.storyTitle.textContent = story.title || "Story Chapters";
  elements.storyMeta.textContent = `${story.genre || "General"} | ${story.status} | Chapters: ${Number(story.chapters || 0)}`;
}

function renderChapters(chapters) {
  writerState.chapters = chapters;

  if (!chapters.length) {
    elements.chapterList.innerHTML = "<p class=\"subcopy\">No chapters added yet.</p>";
    return;
  }

  elements.chapterList.innerHTML = chapters
    .map((chapter) => `
      <article class="chapter-row" data-chapter-id="${chapter.id}">
        <div>
          <h3>Chapter ${chapter.chapterNumber}: ${chapter.title}</h3>
          <p>${chapter.isPublished ? "Published" : "Draft"} | Updated ${new Date(chapter.updatedAt).toLocaleDateString()}</p>
        </div>
        <div class="row-actions">
          <button type="button" data-action="edit">Edit</button>
          <button type="button" data-action="delete">Delete</button>
        </div>
      </article>
    `)
    .join("");
}

async function reloadAll() {
  await fetchStory();
  renderStoryHeader();
  const chapters = await fetchChapters();
  renderChapters(chapters);
}

function setEditorOpenState(isOpen) {
  elements.chapterEditorModal.hidden = !isOpen;
  document.body.classList.toggle("editor-open", isOpen);
}

function closeEditor() {
  setEditorOpenState(false);
  resetEditorForm();
}

async function openEditor(chapterId) {
  resetEditorForm();
  writerState.editingChapterId = chapterId;
  setEditorOpenState(true);
  setEditorMessage("Loading chapter details...");
  setAiStatus("Connecting chapter context to your AI assistant...");
  elements.chapterEditorMeta.textContent = "Preparing your chapter workspace...";
  elements.saveChapterChangesBtn.disabled = true;
  let editorReady = false;

  try {
    const chapter = await fetchChapterById(chapterId);

    if (writerState.editingChapterId !== chapterId) {
      return;
    }

    writerState.activeChapter = chapter;
    elements.editChapterNumber.value = String(chapter.chapterNumber || "");
    elements.editChapterTitle.value = chapter.title || "";
    elements.editChapterContent.value = chapter.content || "";
    elements.editIsPublished.checked = Boolean(chapter.isPublished);
    elements.chapterEditorMeta.textContent = `${chapter.book?.title || story?.title || "Story"} | Last updated ${new Date(chapter.updatedAt).toLocaleString()}`;
    writerState.editorSelection = {
      start: elements.editChapterContent.value.length,
      end: elements.editChapterContent.value.length,
      direction: "none",
    };
    setEditorMessage("Chapter loaded. Review your draft, use AI when you want help, and save only when you are ready.");
    setAiStatus("AI assistant connected. Pick a tool and generate a preview.");
    updateSelectionStatus();
    updateAiContextSummary();
    syncAiPreviewActions();
    restoreEditorSelection();
    editorReady = true;
  } catch (error) {
    setEditorMessage(error.message || "Unable to load chapter details.", "error");
    setAiStatus("AI assistant is waiting for a chapter to load.", "error");
  } finally {
    if (writerState.editingChapterId === chapterId) {
      elements.saveChapterChangesBtn.disabled = !editorReady;
    }
  }
}

function buildAiPayload() {
  const content = elements.editChapterContent.value;
  const cursorPosition = Math.min(writerState.editorSelection.end || 0, content.length);
  const selectedText = getSelectedEditorText();

  return {
    chapterId: writerState.editingChapterId,
    chapterNumber: Number(elements.editChapterNumber.value),
    chapterTitle: elements.editChapterTitle.value.trim(),
    chapterContent: content,
    bookTitle: story?.title || "",
    genre: story?.genre || "",
    instructions: elements.aiInstructions.value.trim(),
    selectedText,
    selectionStart: writerState.editorSelection.start || 0,
    selectionEnd: writerState.editorSelection.end || 0,
    cursorPosition,
    textBeforeCursor: content.slice(Math.max(0, cursorPosition - 3200), cursorPosition),
    textAfterCursor: content.slice(cursorPosition, Math.min(content.length, cursorPosition + 1600)),
  };
}

async function requestAiPreview(tool) {
  if (!writerState.editingChapterId) {
    setAiStatus("Open a chapter before using the AI assistant.", "error");
    return;
  }

  if (AI_TOOLS_REQUIRING_SELECTION.has(tool) && !getTrimmedSelectedEditorText()) {
    setAiStatus("Select part of the chapter text before using this AI tool.", "error");
    return;
  }

  writerState.isGeneratingAi = true;
  elements.generateAiPreviewBtn.disabled = true;
  syncAiPreviewActions();
  setAiStatus("Generating AI preview...");

  const payload = buildAiPayload();
  writerState.lastAiRequest = {
    tool,
    payload,
  };

  try {
    const response = await fetch(`${window.NovaraSession.API_BASE_URL}/api/writer/ai/${AI_ENDPOINTS[tool]}`, {
      method: "POST",
      credentials: "include",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    const result = await response.json().catch(() => ({ success: false, error: "Unable to generate AI output" }));
    if (!response.ok || !result.success || !result.data) {
      throw new Error(result.error || "Unable to generate AI output");
    }

    setAiPreviewText(result.data.outputText || "");
    setAiStatus(`Preview ready from ${result.data.provider === "openai" ? "live AI" : "development AI"}. Review it before applying anything to the chapter.`, "success");
  } catch (error) {
    setAiStatus(error.message || "Unable to generate AI output right now.", "error");
  } finally {
    writerState.isGeneratingAi = false;
    elements.generateAiPreviewBtn.disabled = false;
    syncAiPreviewActions();
  }
}

async function regenerateAiPreview() {
  if (!writerState.lastAiRequest) {
    setAiStatus("Generate a preview first so the assistant knows what to regenerate.", "error");
    return;
  }

  await requestAiPreview(writerState.lastAiRequest.tool);
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
      const response = await fetch(`${window.NovaraSession.API_BASE_URL}/api/writer/stories/${storyId}/chapters`, {
        method: "POST",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          chapterNumber: Number(elements.chapterNumber.value),
          title: elements.chapterTitle.value.trim(),
          content: elements.chapterContent.value,
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
      window.NovaraSession.showToast("Chapter saved successfully.");
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
      const response = await fetch(`${window.NovaraSession.API_BASE_URL}/api/writer/chapters/${chapterId}`, {
        method: "DELETE",
        credentials: "include",
      });
      if (response.ok) {
        await reloadAll();
        window.NovaraSession.showToast("Chapter deleted successfully.");
      } else {
        showError("Unable to delete chapter right now.");
      }
      return;
    }

    if (button.dataset.action === "edit") {
      await openEditor(chapterId);
    }
  });
}

function bindEditorActions() {
  elements.closeChapterEditorBtn.addEventListener("click", closeEditor);
  elements.cancelChapterEditBtn.addEventListener("click", closeEditor);

  elements.chapterEditorModal.addEventListener("click", (event) => {
    const closeTarget = event.target.closest("[data-close-editor=\"true\"]");
    if (closeTarget && !writerState.isSavingEdit && !writerState.isGeneratingAi) {
      closeEditor();
    }
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && !elements.chapterEditorModal.hidden && !writerState.isSavingEdit && !writerState.isGeneratingAi) {
      closeEditor();
    }
  });

  elements.chapterEditorForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (!writerState.editingChapterId || writerState.isSavingEdit) {
      return;
    }

    const validationError = validateEditorInput();
    if (validationError) {
      setEditorMessage(validationError, "error");
      return;
    }

    writerState.isSavingEdit = true;
    elements.saveChapterChangesBtn.disabled = true;
    setEditorMessage("Saving your chapter changes...");

    try {
      const response = await fetch(`${window.NovaraSession.API_BASE_URL}/api/writer/chapters/${writerState.editingChapterId}`, {
        method: "PUT",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          chapterNumber: Number(elements.editChapterNumber.value),
          title: elements.editChapterTitle.value.trim(),
          content: elements.editChapterContent.value,
          isPublished: elements.editIsPublished.checked,
        }),
      });

      const payload = await response.json().catch(() => ({ success: false, error: "Unable to save changes" }));
      if (!response.ok || !payload.success) {
        setEditorMessage(payload.error || "Unable to save changes right now.", "error");
        return;
      }

      await reloadAll();
      window.NovaraSession.showToast("Chapter updated successfully.");
      closeEditor();
    } catch (error) {
      setEditorMessage("Unable to save changes right now.", "error");
    } finally {
      writerState.isSavingEdit = false;
      elements.saveChapterChangesBtn.disabled = false;
    }
  });

  ["click", "keyup", "select", "focus"].forEach((eventName) => {
    elements.editChapterContent.addEventListener(eventName, captureEditorSelection);
  });

  elements.editChapterTitle.addEventListener("input", updateAiContextSummary);
  elements.editChapterNumber.addEventListener("input", updateAiContextSummary);
  elements.editChapterContent.addEventListener("input", () => {
    captureEditorSelection();
    updateAiContextSummary();
  });
  elements.aiInstructions.addEventListener("input", updateAiContextSummary);

  elements.aiToolGrid.addEventListener("click", (event) => {
    const button = event.target.closest("[data-ai-tool]");
    if (!button) {
      return;
    }
    setAiTool(button.dataset.aiTool);
  });

  elements.generateAiPreviewBtn.addEventListener("click", async () => {
    await requestAiPreview(writerState.activeAiTool);
  });

  elements.regenerateAiBtn.addEventListener("click", regenerateAiPreview);
  elements.cancelAiPreviewBtn.addEventListener("click", clearAiPreview);
  elements.replaceContentBtn.addEventListener("click", () => applyPreviewToEditor("replace"));
  elements.insertAtCursorBtn.addEventListener("click", () => applyPreviewToEditor("insert"));
  elements.appendToChapterBtn.addEventListener("click", () => applyPreviewToEditor("append"));
  elements.useAsTitleBtn.addEventListener("click", () => applyPreviewToEditor("title"));

  syncAiPreviewActions();
}

function bindStoryActions() {
  elements.previewBtn.addEventListener("click", () => {
    window.location.href = `/reader/book.html?id=${encodeURIComponent(storyId)}`;
  });

  elements.publishBtn.addEventListener("click", async () => {
    const response = await fetch(`${window.NovaraSession.API_BASE_URL}/api/writer/stories/${storyId}/publish`, {
      method: "POST",
      credentials: "include",
    });

    const payload = await response.json().catch(() => ({ success: false }));
    if (!response.ok || !payload.success) {
      showError(payload.error || "Unable to publish story");
      return;
    }

    await reloadAll();
    window.NovaraSession.showToast("Story published");
  });
}

async function bootstrap() {
  storyId = getStoryIdFromPath();
  if (!storyId) {
    window.location.href = window.NovaraSession.APP_ROUTES.writerDashboard;
    return;
  }

  const allowed = await guardAccess();
  if (!allowed) {
    return;
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

  try {
    await reloadAll();
  } catch (error) {
    showError("Unable to load story workspace.");
  }

  bindChapterForm();
  bindChapterActions();
  bindEditorActions();
  bindStoryActions();
}

bootstrap();
