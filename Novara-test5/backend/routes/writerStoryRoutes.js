const express = require("express");

const { requireWriterOrAdmin } = require("../middleware/auth");
const {
  listWriterStories,
  createWriterStory,
  getWriterStoryById,
  updateWriterStory,
  deleteWriterStory,
  publishWriterStory,
  unpublishWriterStory,
  listWriterStoryChapters,
  createWriterStoryChapter,
  updateWriterStoryChapter,
  deleteWriterStoryChapter,
  getWriterStoryAnalytics,
} = require("../controllers/writerStoryController");

const router = express.Router();

router.use(requireWriterOrAdmin);

router.get("/stories", listWriterStories);
router.post("/stories", createWriterStory);
router.get("/stories/:id", getWriterStoryById);
router.put("/stories/:id", updateWriterStory);
router.delete("/stories/:id", deleteWriterStory);
router.post("/stories/:id/publish", publishWriterStory);
router.post("/stories/:id/unpublish", unpublishWriterStory);
router.get("/stories/:id/analytics", getWriterStoryAnalytics);

router.get("/stories/:id/chapters", listWriterStoryChapters);
router.post("/stories/:id/chapters", createWriterStoryChapter);
router.put("/chapters/:chapterId", updateWriterStoryChapter);
router.delete("/chapters/:chapterId", deleteWriterStoryChapter);

module.exports = router;
