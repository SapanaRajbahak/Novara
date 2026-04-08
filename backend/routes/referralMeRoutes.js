const express = require("express");
const { getMyReferral } = require("../controllers/referralMeController");
const { requireWriterOrAdmin } = require("../middleware/auth");

const router = express.Router();

router.use(requireWriterOrAdmin);
router.get("/me", getMyReferral);

module.exports = router;
