const express = require("express");
const { getBookAudio } = require("../controllers/audioController");

const router = express.Router();

router.get("/books/:id/audio", getBookAudio);

module.exports = router;
