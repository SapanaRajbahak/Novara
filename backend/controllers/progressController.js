const progressService = require("../services/progressService");
const {
  validateReadingProgressBody,
  validateBookId,
} = require("../validators/progressValidator");

async function saveReadingProgress(req, res) {
  try {
    const errors = validateReadingProgressBody(req.body);
    if (errors.length) {
      return res.status(400).json({
        success: false,
        error: errors.join(". "),
      });
    }

    const result = await progressService.saveReadingProgress(req.session.user.id, req.body);

    if (result.error === "CHAPTER_NOT_FOUND") {
      return res.status(404).json({
        success: false,
        error: "Chapter not found for the given book",
      });
    }

    return res.json({
      success: true,
      message: "Reading progress saved successfully",
      data: result.data,
    });
  } catch (error) {
    console.error("saveReadingProgress error:", error);
    return res.status(500).json({
      success: false,
      error: "Failed to save reading progress",
    });
  }
}

async function getReadingProgress(req, res) {
  try {
    const errors = validateBookId(req.params.bookId);
    if (errors.length) {
      return res.status(400).json({
        success: false,
        error: errors.join(". "),
      });
    }

    const progress = await progressService.getReadingProgress(req.session.user.id, req.params.bookId);

    if (!progress) {
      return res.json({
        success: true,
        message: "No reading progress found",
        data: null,
      });
    }

    return res.json({
      success: true,
      message: "Reading progress fetched successfully",
      data: progress,
    });
  } catch (error) {
    console.error("getReadingProgress error:", error);
    return res.status(500).json({
      success: false,
      error: "Failed to fetch reading progress",
    });
  }
}

module.exports = {
  saveReadingProgress,
  getReadingProgress,
};
