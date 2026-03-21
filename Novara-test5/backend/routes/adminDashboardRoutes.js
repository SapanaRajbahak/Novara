const express = require("express");
const { requireAdmin } = require("../middleware/auth");
const {
  getAdminStats,
  getRecentUploads,
  getRecentAiContent,
} = require("../controllers/adminDashboardController");

const router = express.Router();

router.use(requireAdmin);
router.get("/stats", getAdminStats);
router.get("/recent-uploads", getRecentUploads);
router.get("/recent-ai-content", getRecentAiContent);

module.exports = router;
