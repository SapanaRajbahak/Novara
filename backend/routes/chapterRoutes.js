const express = require("express");
const {
  getBookChapters,
  getChapterById,
  translateChapter,
  saveUserTranslation,
} = require("../controllers/chapterController");
const { usageGuard } = require("../middleware/usageGuard");
const { requireAuth } = require("../middleware/auth");

const router = express.Router();

router.use(usageGuard);

router.get("/books/:bookId/chapters", getBookChapters);
router.get("/chapters/:id", getChapterById);
router.post("/chapters/:id/translate", translateChapter);
router.post("/books/:bookId/translations/save", requireAuth, saveUserTranslation);

module.exports = router;
