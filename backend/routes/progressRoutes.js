const express = require("express");
const { requireAuth } = require("../middleware/auth");
const {
  saveReadingProgress,
  getReadingProgress,
} = require("../controllers/progressController");

const router = express.Router();

router.use(requireAuth);

router.post("/reading", saveReadingProgress);
router.get("/reading/:bookId", getReadingProgress);

module.exports = router;
