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
  getWriterStoryChapterById,
  updateWriterStoryChapter,
  deleteWriterStoryChapter,
  reorderWriterStoryChapters,
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
router.get("/books/:bookId", getWriterStoryById);
router.get("/books/:bookId/chapters", listWriterStoryChapters);
router.post("/books/:bookId/chapters", createWriterStoryChapter);
router.put("/books/:bookId/chapters/reorder", reorderWriterStoryChapters);
router.get("/chapters/:chapterId", getWriterStoryChapterById);
router.put("/chapters/:chapterId", updateWriterStoryChapter);
router.delete("/chapters/:chapterId", deleteWriterStoryChapter);

module.exports = router;
