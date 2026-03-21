const express = require("express");

const { requireAuth } = require("../middleware/auth");
const {
  getProfile,
  patchProfile,
  getProfileStats,
  getProfileLibrary,
  getProfileActivity,
  getProfileAnnotations,
  patchBookmarkAnnotation,
  removeBookmarkAnnotation,
  patchHighlightAnnotation,
  removeHighlightAnnotation,
  patchNoteAnnotation,
  removeNoteAnnotation,
} = require("../controllers/profileController");

const router = express.Router();

router.use(requireAuth);

router.get("/", getProfile);
router.patch("/", patchProfile);
router.get("/stats", getProfileStats);
router.get("/library", getProfileLibrary);
router.get("/activity", getProfileActivity);
router.get("/annotations", getProfileAnnotations);
router.patch("/annotations/bookmarks/:id", patchBookmarkAnnotation);
router.delete("/annotations/bookmarks/:id", removeBookmarkAnnotation);
router.patch("/annotations/highlights/:id", patchHighlightAnnotation);
router.delete("/annotations/highlights/:id", removeHighlightAnnotation);
router.patch("/annotations/notes/:id", patchNoteAnnotation);
router.delete("/annotations/notes/:id", removeNoteAnnotation);

module.exports = router;