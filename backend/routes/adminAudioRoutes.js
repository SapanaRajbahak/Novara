const express = require("express");
const { requireAdmin } = require("../middleware/auth");
const {
  createAudioTrack,
  updateAudioTrack,
  deleteAudioTrack,
} = require("../controllers/audioController");

const router = express.Router();

router.use(requireAdmin);

router.post("/books/:id/audio", createAudioTrack);
router.put("/audio/:id", updateAudioTrack);
router.delete("/audio/:id", deleteAudioTrack);

module.exports = router;
