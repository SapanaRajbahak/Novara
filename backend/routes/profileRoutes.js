

const express = require("express");
const router = express.Router();

// GET /api/profile/me - Get profile for current user only
router.get("/me", async (req, res) => {
  const profile = await req.app.get("prisma").profile.findUnique({
    where: { userId: req.session.user.id }
  });
  res.json({ success: true, profile });
});

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