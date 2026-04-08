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

router.get("/me", requireAuth, (req, res) => {
  return res.json({
    success: true,
    user: req.session.user,
  });
});

router.get("/admin", requireAdmin, (req, res) => {
  return res.json({
    success: true,
    message: "Welcome Admin",
  });
});

module.exports = router;