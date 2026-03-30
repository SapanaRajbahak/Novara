const { ensureReferralCode, buildReferralLink } = require("../services/referralCodeService");

// GET /api/referrals/me
async function getMyReferral(req, res) {
  try {
    const user = req.session.user;
    if (!user || !user.id) return res.status(401).json({ success: false, error: "Not authenticated" });
    const referralCode = await ensureReferralCode(user.id, user.name);
    if (!referralCode) return res.status(500).json({ success: false, error: "Could not generate referral code" });
    const referralLink = buildReferralLink(referralCode);
    return res.json({
      success: true,
      referralCode,
      referralLink
    });
  } catch (error) {
    return res.status(500).json({ success: false, error: "Failed to load referral data" });
  }
}

module.exports = { getMyReferral };