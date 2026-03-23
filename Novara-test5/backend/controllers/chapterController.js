const chapterService = require("../services/chapterService");
const {
  validateId,
  validateCreateChapter,
  validateUpdateChapter,
} = require("../validators/chapterValidator");

async function getBookChapters(req, res) {
  try {
    const idErrors = validateId(req.params.bookId, "bookId");
    if (idErrors.length) {
      return res.status(400).json({ success: false, error: idErrors.join(". ") });
    }

    const chapters = await chapterService.listPublishedChapters(req.params.bookId);
    const isAuthenticated = Boolean(req.session && req.session.user);
    const chapterPayload = chapters.map((chapter) => ({
      ...chapter,
      isLockedForGuest: !isAuthenticated && Number(chapter.chapterNumber) > 1,
    }));

    return res.json({
      success: true,
      message: "Chapters fetched successfully",
      data: chapterPayload,
    });
  } catch (error) {
    console.error("getBookChapters error:", error);
    return res.status(500).json({ success: false, error: "Failed to fetch chapters" });
  }
}

async function getChapterById(req, res) {
  try {
    const idErrors = validateId(req.params.id, "chapter id");
    if (idErrors.length) {
      return res.status(400).json({ success: false, error: idErrors.join(". ") });
    }

    const chapter = await chapterService.getChapterById(req.params.id);
    if (!chapter) {
      return res.status(404).json({ success: false, error: "Chapter not found" });
    }

    const isAuthenticated = Boolean(req.session && req.session.user);
    if (!isAuthenticated && Number(chapter.chapterNumber) > 1) {
      return res.status(403).json({
        success: false,
        error: "Login is required to access this chapter",
        code: "CHAPTER_LOCKED",
        loginRequired: true,
      });
    }

    return res.json({
      success: true,
      message: "Chapter fetched successfully",
      data: chapter,
    });
  } catch (error) {
    console.error("getChapterById error:", error);
    return res.status(500).json({ success: false, error: "Failed to fetch chapter" });
  }
}

async function createChapter(req, res) {
  try {
    const idErrors = validateId(req.params.bookId, "bookId");
    const bodyErrors = validateCreateChapter(req.body);
    const errors = [...idErrors, ...bodyErrors];

    if (errors.length) {
      return res.status(400).json({ success: false, error: errors.join(". ") });
    }

    const chapter = await chapterService.createChapter(req.params.bookId, req.body);
    if (!chapter) {
      return res.status(404).json({ success: false, error: "Book not found" });
    }

    return res.status(201).json({
      success: true,
      message: "Chapter created successfully",
      data: chapter,
    });
  } catch (error) {
    if (error.code === "P2002") {
      return res.status(409).json({
        success: false,
        error: "chapterNumber already exists for this book",
      });
    }

    console.error("createChapter error:", error);
    return res.status(500).json({ success: false, error: "Failed to create chapter" });
  }
}

async function updateChapter(req, res) {
  try {
    const idErrors = validateId(req.params.id, "chapter id");
    const bodyErrors = validateUpdateChapter(req.body);
    const errors = [...idErrors, ...bodyErrors];

    if (errors.length) {
      return res.status(400).json({ success: false, error: errors.join(". ") });
    }

    const chapter = await chapterService.updateChapter(req.params.id, req.body);
    if (!chapter) {
      return res.status(404).json({ success: false, error: "Chapter not found" });
    }

    return res.json({
      success: true,
      message: "Chapter updated successfully",
      data: chapter,
    });
  } catch (error) {
    if (error.code === "P2002") {
      return res.status(409).json({
        success: false,
        error: "chapterNumber already exists for this book",
      });
    }

    console.error("updateChapter error:", error);
    return res.status(500).json({ success: false, error: "Failed to update chapter" });
  }
}

async function deleteChapter(req, res) {
  try {
    const idErrors = validateId(req.params.id, "chapter id");
    if (idErrors.length) {
      return res.status(400).json({ success: false, error: idErrors.join(". ") });
    }

    const deleted = await chapterService.deleteChapter(req.params.id);
    if (!deleted) {
      return res.status(404).json({ success: false, error: "Chapter not found" });
    }

    return res.json({
      success: true,
      message: "Chapter deleted successfully",
    });
  } catch (error) {
    console.error("deleteChapter error:", error);
    return res.status(500).json({ success: false, error: "Failed to delete chapter" });
  }
}

module.exports = {
  getBookChapters,
  getChapterById,
  createChapter,
  updateChapter,
  deleteChapter,
};
