const audioService = require("../services/audioService");
const {
  createAudioSchema,
  updateAudioSchema,
} = require("../validators/audioValidator");

async function getBookAudio(req, res) {
  try {
    const tracks = await audioService.listBookAudio(req.params.id);

    return res.json({
      success: true,
      message: "Audio tracks fetched successfully",
      data: tracks,
    });
  } catch (error) {
    console.error("getBookAudio error:", error);
    return res.status(500).json({
      success: false,
      error: "Failed to fetch audio tracks",
    });
  }
}

async function createAudioTrack(req, res) {
  try {
    const errors = createAudioSchema(req.body);
    if (errors.length) {
      return res.status(400).json({
        success: false,
        error: errors.join(". "),
      });
    }

    const result = await audioService.createAudioTrack(req.params.id, req.body);

    if (result.error === "BOOK_NOT_FOUND") {
      return res.status(404).json({
        success: false,
        error: "Book not found",
      });
    }

    if (result.error === "INVALID_CHAPTER") {
      return res.status(400).json({
        success: false,
        error: "chapterId must belong to the same book",
      });
    }

    return res.status(201).json({
      success: true,
      message: "Audio track created successfully",
      data: result.data,
    });
  } catch (error) {
    if (error.code === "P2002") {
      return res.status(409).json({
        success: false,
        error: "An audio track with this order already exists for the book",
      });
    }

    console.error("createAudioTrack error:", error);
    return res.status(500).json({
      success: false,
      error: "Failed to create audio track",
    });
  }
}

async function updateAudioTrack(req, res) {
  try {
    const errors = updateAudioSchema(req.body);
    if (errors.length) {
      return res.status(400).json({
        success: false,
        error: errors.join(". "),
      });
    }

    const result = await audioService.updateAudioTrack(req.params.id, req.body);

    if (result.error === "AUDIO_NOT_FOUND") {
      return res.status(404).json({
        success: false,
        error: "Audio track not found",
      });
    }

    if (result.error === "INVALID_CHAPTER") {
      return res.status(400).json({
        success: false,
        error: "chapterId must belong to the same parent book",
      });
    }

    return res.json({
      success: true,
      message: "Audio track updated successfully",
      data: result.data,
    });
  } catch (error) {
    if (error.code === "P2002") {
      return res.status(409).json({
        success: false,
        error: "An audio track with this order already exists for the book",
      });
    }

    console.error("updateAudioTrack error:", error);
    return res.status(500).json({
      success: false,
      error: "Failed to update audio track",
    });
  }
}

async function deleteAudioTrack(req, res) {
  try {
    const result = await audioService.deleteAudioTrack(req.params.id);

    if (result.error === "AUDIO_NOT_FOUND") {
      return res.status(404).json({
        success: false,
        error: "Audio track not found",
      });
    }

    return res.json({
      success: true,
      message: "Audio track deleted successfully",
    });
  } catch (error) {
    console.error("deleteAudioTrack error:", error);
    return res.status(500).json({
      success: false,
      error: "Failed to delete audio track",
    });
  }
}

module.exports = {
  getBookAudio,
  createAudioTrack,
  updateAudioTrack,
  deleteAudioTrack,
};
