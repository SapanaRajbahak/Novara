const express = require("express");
const { requireAuth } = require("../middleware/auth");
const {
  saveListeningProgress,
  getListeningProgress,
} = require("../controllers/listeningProgressController");

const router = express.Router();

router.use(requireAuth);

router.post("/listening", saveListeningProgress);
router.get("/listening/:bookId", getListeningProgress);

module.exports = router;
