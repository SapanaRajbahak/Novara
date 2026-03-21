const express = require("express");

const { getWriterDashboard } = require("../controllers/writerController");
const { requireWriter } = require("../middleware/auth");

const router = express.Router();

router.use(requireWriter);

router.get("/dashboard", getWriterDashboard);

module.exports = router;