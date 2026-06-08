const express = require("express");
const router = express.Router();
const { getPublicSettings } = require("../controllers/adminMonetizationController");

// Public endpoint — reader and writer dashboards fetch this to apply platform rules
router.get("/settings", getPublicSettings);

module.exports = router;
