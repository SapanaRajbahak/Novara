const express = require("express");
const router = express.Router();

const { getWriterDashboard, getWriterReferrals } = require("../controllers/writerController");
const { requireWriter } = require("../middleware/auth");

// GET /api/writer/books/me - Get books for current writer
router.get("/books/me", async (req, res) => {
	const books = await req.app.get("prisma").book.findMany({
		where: { authorId: req.session.user.id }
	});
	res.json({ success: true, books });
});

// GET /api/writer/earnings/me - Get earnings for current writer
router.get("/earnings/me", async (req, res) => {
	const earnings = await req.app.get("prisma").earnings.findUnique({
		where: { userId: req.session.user.id }
	});
	res.json({ success: true, earnings });
});

router.use(requireWriter);

router.get("/dashboard", getWriterDashboard);
router.get("/referrals", getWriterReferrals);

module.exports = router;
