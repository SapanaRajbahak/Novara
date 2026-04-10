const express = require("express");

const { signup, signin, signout, onboardWriter, verifyEmail, resendVerification } = require("../controllers/authController");
const { requireAuth, requireAdmin } = require("../middleware/auth");

const router = express.Router();


// Auth and verification routes
router.post("/signup", signup);
router.post("/signin", signin);
router.post("/signout", signout);
router.post("/writer/onboarding", requireAuth, onboardWriter);
router.get("/verify-email", verifyEmail);
router.post("/resend-verification", resendVerification);


const { prisma } = require("../config/db");

router.get("/me", requireAuth, async (req, res) => {
  try {
    const userId = req.session.user?.id;
    if (!userId) {
      return res.status(401).json({ success: false, message: "Not authenticated" });
    }

    // Only select fields needed for frontend
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        name: true,
        email: true,
        coins: true,
        avatarUrl: true,
        isSubscribed: true,
        subscriptionPlan: true,
        subscriptionStatus: true,
        // add other fields as needed
      },
    });

    if (!user) {
      return res.status(404).json({ success: false, message: "User not found" });
    }

    return res.json({ success: true, user });
  } catch (err) {
    console.error("/api/auth/me error:", err);
    return res.status(500).json({ success: false, message: "Server error" });
  }
});

router.get("/admin", requireAdmin, (req, res) => {
  return res.json({
    success: true,
    message: "Welcome Admin",
  });
});

module.exports = router;