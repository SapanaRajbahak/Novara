const express = require("express");

const { signup, signin, signout, onboardWriter } = require("../controllers/authController");
const { requireAuth, requireAdmin } = require("../middleware/auth");

const router = express.Router();

router.post("/signup", signup);
router.post("/signin", signin);
router.post("/signout", signout);
router.post("/writer/onboarding", requireAuth, onboardWriter);

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