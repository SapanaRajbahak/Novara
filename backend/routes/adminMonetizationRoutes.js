const express = require("express");
const router = express.Router();
const { requireAdmin } = require("../middleware/auth");
const {
  getSettings,
  upsertSettings,
  quickAction,
} = require("../controllers/adminMonetizationController");

// All routes require admin auth
router.get("/monetization/settings", requireAdmin, getSettings);
router.put("/monetization/settings", requireAdmin, upsertSettings);
router.post("/monetization/quick-action", requireAdmin, quickAction);

module.exports = router;
