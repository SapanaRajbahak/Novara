const express = require("express");
const {
  getBookChapters,
  getChapterById,
} = require("../controllers/chapterController");
const { usageGuard } = require("../middleware/usageGuard");

const router = express.Router();

router.use(usageGuard);

router.get("/books/:bookId/chapters", getBookChapters);
router.get("/chapters/:id", getChapterById);

module.exports = router;
