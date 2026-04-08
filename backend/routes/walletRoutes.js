const express = require("express");
const { requireAuth } = require("../middleware/auth");
const router = express.Router();

// GET /api/wallet/me - Get wallet for current user
router.get("/me", requireAuth, async (req, res) => {
  const wallet = await req.app.get("prisma").wallet.findUnique({
    where: { userId: req.session.user.id }
  });
  res.json({ success: true, wallet });
});

module.exports = router;
