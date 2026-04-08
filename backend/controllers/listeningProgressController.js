const listeningProgressService = require("../services/listeningProgressService");
const {
  validateListeningProgressBody,
  validateBookId,
} = require("../validators/listeningProgressValidator");

async function saveListeningProgress(req, res) {
  try {
    const errors = validateListeningProgressBody(req.body);
    if (errors.length) {
      return res.status(400).json({
        success: false,
        error: errors.join(". "),
      });
    }

    const result = await listeningProgressService.saveListeningProgress(req.session.user.id, req.body);

    if (result.error === "AUDIO_TRACK_NOT_FOUND") {
      return res.status(404).json({
        success: false,
        error: "audioTrackId was not found for this book",
      });
    }

    return res.json({
      success: true,
      message: "Listening progress saved successfully",
      data: result.data,
    });
  } catch (error) {
    console.error("saveListeningProgress error:", error);
    return res.status(500).json({
      success: false,
      error: "Failed to save listening progress",
    });
  }
}

async function getListeningProgress(req, res) {
  try {
    const errors = validateBookId(req.params.bookId);
    if (errors.length) {
      return res.status(400).json({
        success: false,
        error: errors.join(". "),
      });
    }

    const progress = await listeningProgressService.getListeningProgress(req.session.user.id, req.params.bookId);

    if (!progress) {
      return res.json({
        success: true,
        message: "No listening progress found",
        data: null,
      });
    }

    return res.json({
      success: true,
      message: "Listening progress fetched successfully",
      data: progress,
    });
  } catch (error) {
    console.error("getListeningProgress error:", error);
    return res.status(500).json({
      success: false,
      error: "Failed to fetch listening progress",
    });
  }
}

module.exports = {
  saveListeningProgress,
  getListeningProgress,
};
