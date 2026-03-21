const express = require("express");
const { requireAdmin } = require("../middleware/auth");
const { getAdminAnalytics } = require("../controllers/adminAnalyticsController");

const router = express.Router();

router.use(requireAdmin);
router.get("/analytics", getAdminAnalytics);

module.exports = router;