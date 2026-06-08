const express = require("express");
const router = express.Router();
const prisma = require("../prisma/client");
const Stripe = require("stripe");
const stripe = Stripe(process.env.STRIPE_SECRET_KEY);

const { getWriterDashboard, getWriterReferrals } = require("../controllers/writerController");
const { requireAuth, requireWriter } = require("../middleware/auth");

router.use(requireAuth);

// GET /api/writer/books/me - Get books for current writer
router.get("/books/me", async (req, res) => {
	try {
		const books = await prisma.book.findMany({
			where: { createdBy: req.session.user.id },
			orderBy: { updatedAt: "desc" },
		});
		return res.json({ success: true, books });
	} catch (error) {
		console.error("writer /books/me error:", error);
		return res.status(500).json({ success: false, error: "Failed to fetch writer books" });
	}
});

// GET /api/writer/earnings/me - Get earnings for current writer
router.get("/earnings/me", async (req, res) => {
	try {
		const user = await prisma.user.findUnique({
			where: { id: req.session.user.id },
			select: { coins: true },
		});
		return res.json({
			success: true,
			earnings: {
				coins: user ? user.coins : 0,
			},
		});
	} catch (error) {
		console.error("writer /earnings/me error:", error);
		return res.status(500).json({ success: false, error: "Failed to fetch writer earnings" });
	}
});

router.get("/dashboard", requireWriter, getWriterDashboard);
router.get("/referrals", requireWriter, getWriterReferrals);

// ── Stripe Connect Onboarding ─────────────────────────────────────────────────

// POST /api/writer/payout/stripe-connect/onboard
// Creates (or reuses) a Stripe Connect Express account and returns an onboarding link.
router.post("/payout/stripe-connect/onboard", async (req, res) => {
	try {
		const user = await prisma.user.findUnique({
			where: { id: req.session.user.id },
			select: { id: true, email: true, stripeConnectAccountId: true },
		});

		let accountId = user.stripeConnectAccountId;

		if (!accountId) {
			// Create a new Express connected account
			const account = await stripe.accounts.create({
				type: "express",
				email: user.email,
				capabilities: { transfers: { requested: true } },
			});
			accountId = account.id;
			await prisma.user.update({
				where: { id: user.id },
				data: { stripeConnectAccountId: accountId },
			});
		}

		const appUrl = process.env.APP_URL || "http://localhost:5002";
		const returnUrl  = `${appUrl}/writer/writer-monetization-ai.html?stripe_return=1`;
		const refreshUrl = `${appUrl}/writer/writer-monetization-ai.html?stripe_refresh=1`;

		const accountLink = await stripe.accountLinks.create({
			account: accountId,
			return_url:  returnUrl,
			refresh_url: refreshUrl,
			type: "account_onboarding",
		});

		return res.json({ success: true, url: accountLink.url });
	} catch (err) {
		console.error("Stripe Connect onboard error:", err);
		return res.status(500).json({ success: false, error: err.message || "Failed to start Stripe onboarding" });
	}
});

// GET /api/writer/payout/stripe-connect/status
// Returns whether the connected account has completed onboarding.
router.get("/payout/stripe-connect/status", async (req, res) => {
	try {
		const user = await prisma.user.findUnique({
			where: { id: req.session.user.id },
			select: { stripeConnectAccountId: true },
		});
		if (!user || !user.stripeConnectAccountId) {
			return res.json({ success: true, connected: false });
		}
		const account = await stripe.accounts.retrieve(user.stripeConnectAccountId);
		const connected = account.details_submitted && !account.requirements?.disabled_reason;
		// If newly connected, upsert the PayoutMethod record
		if (connected) {
			const label = `Stripe · ${account.email || user.stripeConnectAccountId.slice(-6)}`;
			await prisma.payoutMethod.upsert({
				where: { userId: req.session.user.id },
				update: { method: "stripe", label, details: JSON.stringify({ accountId: user.stripeConnectAccountId }) },
				create: { userId: req.session.user.id, method: "stripe", label, details: JSON.stringify({ accountId: user.stripeConnectAccountId }) },
			});
		}
		return res.json({ success: true, connected, accountId: user.stripeConnectAccountId });
	} catch (err) {
		console.error("Stripe Connect status error:", err);
		return res.status(500).json({ success: false, error: err.message || "Failed to check Stripe status" });
	}
});

// ── Payout Method ─────────────────────────────────────────────────────────────

// GET /api/writer/payout/method
router.get("/payout/method", async (req, res) => {
	try {
		const method = await prisma.payoutMethod.findUnique({
			where: { userId: req.session.user.id },
		});
		return res.json({ success: true, method: method || null });
	} catch (err) {
		console.error("GET /payout/method error:", err);
		return res.status(500).json({ success: false, error: "Failed to fetch payout method" });
	}
});

// POST /api/writer/payout/method  { method, label, details }
router.post("/payout/method", async (req, res) => {
	try {
		const { method, label, details } = req.body;
		if (!method || !label) return res.status(400).json({ success: false, error: "method and label are required" });
		const saved = await prisma.payoutMethod.upsert({
			where: { userId: req.session.user.id },
			update: { method, label, details: typeof details === "string" ? details : JSON.stringify(details || {}) },
			create: { userId: req.session.user.id, method, label, details: typeof details === "string" ? details : JSON.stringify(details || {}) },
		});
		return res.json({ success: true, method: saved });
	} catch (err) {
		console.error("POST /payout/method error:", err);
		return res.status(500).json({ success: false, error: "Failed to save payout method" });
	}
});

// GET /api/writer/payout/history
router.get("/payout/history", async (req, res) => {
	try {
		const requests = await prisma.payoutRequest.findMany({
			where: { userId: req.session.user.id },
			orderBy: { createdAt: "desc" },
			take: 10,
		});
		return res.json({ success: true, requests });
	} catch (err) {
		console.error("GET /payout/history error:", err);
		return res.status(500).json({ success: false, error: "Failed to fetch payout history" });
	}
});

// POST /api/writer/payout/request  { amount }
router.post("/payout/request", async (req, res) => {
	try {
		const amount = parseFloat(req.body.amount);
		if (!amount || amount <= 0) {
			return res.status(400).json({ success: false, error: "Amount must be greater than 0" });
		}

		// Verify the user has a payout method connected
		const payoutMethod = await prisma.payoutMethod.findUnique({ where: { userId: req.session.user.id } });
		if (!payoutMethod) {
			return res.status(400).json({ success: false, error: "No payout method connected" });
		}

		// Check available balance (referralCashEarned)
		const user = await prisma.user.findUnique({ where: { id: req.session.user.id }, select: { referralCashEarned: true } });
		const available = user ? user.referralCashEarned : 0;
		if (amount > available) {
			return res.status(400).json({ success: false, error: "Amount exceeds available balance" });
		}

		// Deduct balance and create request record atomically
		const [request] = await prisma.$transaction([
			prisma.payoutRequest.create({
				data: { userId: req.session.user.id, amount, method: payoutMethod.method, status: "PENDING" },
			}),
			prisma.user.update({
				where: { id: req.session.user.id },
				data: { referralCashEarned: { decrement: amount } },
			}),
		]);

		return res.json({ success: true, request });
	} catch (err) {
		console.error("POST /payout/request error:", err);
		return res.status(500).json({ success: false, error: "Failed to submit payout request" });
	}
});

module.exports = router;
