const express = require("express");

const {
  signup,
  verifySignupOtp,
  signin,
  login,
  signout,
  forgotPassword,
  verifyResetOtp,
  resetPassword,
  onboardWriter,
  verifyEmail,
  resendVerification,
  sendOtp,
  verifyOtp,
  buildSafeUser,
} = require("../controllers/authController");
const { ensureReferralCode } = require("../services/referralService");
const { requireAuth, requireAdmin } = require("../middleware/auth");

const router = express.Router();


// Auth and verification routes
router.post("/signup", signup);
router.post("/verify-signup-otp", verifySignupOtp);
router.post("/login", login);
router.post("/signin", signin);
router.post("/signout", signout);
router.post("/forgot-password", forgotPassword);
router.post("/verify-reset-otp", verifyResetOtp);
router.post("/reset-password", resetPassword);
router.post("/send-otp", sendOtp);
router.post("/verify-otp", verifyOtp);
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

    const dbUser = await prisma.user.findUnique({
      where: { id: userId },
    });

    if (!dbUser) {
      return res.status(404).json({ success: false, message: "User not found" });
    }

    const referralCode = await ensureReferralCode(dbUser.id, dbUser.name);
    const safeUser = buildSafeUser({ ...dbUser, referralCode });
    req.session.user = safeUser;

    return res.json({ success: true, user: safeUser });
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