const express = require("express");

const { requireWriterOrAdmin } = require("../middleware/auth");
const {
  storyIdea,
  generateChapter,
  rewriteScene,
  improveDialogue,
  continueWriting,
  expandScene,
  createChapterTitle,
} = require("../controllers/writerAiController");

const router = express.Router();

router.use(requireWriterOrAdmin);

router.post("/story-idea", storyIdea);
router.post("/generate-chapter", generateChapter);
router.post("/rewrite-scene", rewriteScene);
router.post("/improve-dialogue", improveDialogue);
router.post("/continue-writing", continueWriting);
router.post("/expand-scene", expandScene);
router.post("/create-chapter-title", createChapterTitle);

module.exports = router;
