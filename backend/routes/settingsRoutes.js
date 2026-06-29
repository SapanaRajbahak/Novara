const express = require("express");
const router = express.Router();

const { requireAuth } = require("../middleware/auth");
const { getSettings, patchSettings } = require("../controllers/settingsController");

router.use(requireAuth);

router.get("/", getSettings);
router.patch("/", patchSettings);

module.exports = router;
