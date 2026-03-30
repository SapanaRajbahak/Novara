const express = require("express");

const { getReferralSummary, getReferralList } = require("../controllers/referralController");
const { requireWriterOrAdmin } = require("../middleware/auth");

const router = express.Router();

router.use(requireWriterOrAdmin);

router.get("/summary", getReferralSummary);
router.get("/list", getReferralList);

module.exports = router;
