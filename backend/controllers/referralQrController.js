const QRCode = require("qrcode");
const { ensureReferralCode, buildReferralLink } = require("../services/referralService");

// Returns referral code, link, and QR code image (data URL) for the current writer
async function getReferralQr(req, res) {
  try {
    const userId = req.session.user.id;
    const userName = req.session.user.name;
    const referralCode = await ensureReferralCode(userId, userName);
    if (!referralCode) {
      return res.status(400).json({ success: false, error: "Could not generate referral code." });
    }
    const referralLink = buildReferralLink(referralCode);
    const qrCodeDataUrl = await QRCode.toDataURL(referralLink, { width: 320, margin: 2 });
    return res.json({
      success: true,
      data: {
        referralCode,
        referralLink,
        qrCodeDataUrl
      }
    });
  } catch (error) {
    return res.status(500).json({ success: false, error: "Failed to generate referral QR code." });
  }
}

module.exports = { getReferralQr };