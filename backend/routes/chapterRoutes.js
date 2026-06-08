const express = require("express");
const {
  getBookChapters,
  getChapterById,
} = require("../controllers/chapterController");

const router = express.Router();

router.get("/books/:bookId/chapters", getBookChapters);
router.get("/chapters/:id", getChapterById);

module.exports = router;
