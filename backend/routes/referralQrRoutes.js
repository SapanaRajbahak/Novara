const express = require("express");
const { getReferralQr } = require("../controllers/referralQrController");
const { requireWriterOrAdmin } = require("../middleware/auth");

const router = express.Router();

router.use(requireWriterOrAdmin);

router.get("/qr", getReferralQr);

module.exports = router;
