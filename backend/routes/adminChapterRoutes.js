const express = require("express");
const { requireAdmin } = require("../middleware/auth");
const {
  createChapter,
  updateChapter,
  deleteChapter,
} = require("../controllers/chapterController");

const router = express.Router();

router.use(requireAdmin);

router.post("/books/:bookId/chapters", createChapter);
router.put("/chapters/:id", updateChapter);
router.delete("/chapters/:id", deleteChapter);

module.exports = router;
