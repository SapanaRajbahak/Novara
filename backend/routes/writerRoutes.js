const express = require("express");

const { getWriterDashboard, getWriterReferrals } = require("../controllers/writerController");
const { requireWriter } = require("../middleware/auth");

const router = express.Router();

router.use(requireWriter);

router.get("/dashboard", getWriterDashboard);
router.get("/referrals", getWriterReferrals);

module.exports = router;
