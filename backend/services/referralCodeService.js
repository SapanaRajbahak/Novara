const prisma = require("../prisma/client");

function sanitizeReferralToken(value) {
  if (typeof value !== "string") return "";
  return value.trim();
}

function buildReferralLink(referralCode) {
  const baseUrl = process.env.PUBLIC_APP_URL || "https://novara.app";
  const safeCode = sanitizeReferralToken(referralCode);
  return safeCode ? `${baseUrl.replace(/\/+$/, "")}/signup?ref=${encodeURIComponent(safeCode)}` : "";
}

function buildReferralCodeCandidates(name = "") {
  const base = String(name || "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "")
    .slice(0, 8);
  const prefix = base || "novara";
  return [
    `${prefix}${Math.floor(100 + Math.random() * 900)}`,
    `${prefix}${Date.now().toString().slice(-5)}`,
    `${prefix}${Math.floor(1000 + Math.random() * 9000)}`,
    `${prefix}${Math.random().toString(36).slice(-4)}`,
  ];
}

async function ensureReferralCode(userId, name) {
  const existing = await prisma.user.findUnique({
    where: { id: String(userId) },
    select: { id: true, referralCode: true },
  });
  if (!existing) return null;
  if (existing.referralCode) return existing.referralCode;
  const candidates = buildReferralCodeCandidates(name);
  for (const candidate of candidates) {
    const found = await prisma.user.findUnique({ where: { referralCode: candidate }, select: { id: true } });
    if (!found) {
      const updated = await prisma.user.update({ where: { id: String(userId) }, data: { referralCode: candidate }, select: { referralCode: true } });
      return updated.referralCode;
    }
  }
  // fallback
  const fallback = `novara${Date.now().toString().slice(-6)}`;
  const updated = await prisma.user.update({ where: { id: String(userId) }, data: { referralCode: fallback }, select: { referralCode: true } });
  return updated.referralCode;
}

module.exports = { ensureReferralCode, buildReferralLink };
