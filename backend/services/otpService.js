const crypto = require("crypto");
const { prisma } = require("../config/db");

const OTP_TTL_MS = 10 * 60 * 1000;
const OTP_COOLDOWN_MS = 60 * 1000;
const MAX_VERIFY_ATTEMPTS = 5;

function normalizeEmail(email) {
  return String(email || "").trim().toLowerCase();
}

function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function generateOtp() {
  return String(crypto.randomInt(0, 1000000)).padStart(6, "0");
}

function getOtpSecret() {
  return (
    process.env.OTP_SECRET ||
    process.env.SESSION_SECRET ||
    ""
  );
}

function hashOtp(email, otpCode) {
  const secret = getOtpSecret();
  if (!secret) {
    throw new Error("OTP_SECRET_MISSING");
  }

  return crypto
    .createHmac("sha256", secret)
    .update(`${normalizeEmail(email)}:${String(otpCode)}`)
    .digest("hex");
}

function timingSafeEqualHex(leftHex, rightHex) {
  const left = Buffer.from(String(leftHex || ""), "hex");
  const right = Buffer.from(String(rightHex || ""), "hex");

  if (left.length !== right.length) {
    return false;
  }

  return crypto.timingSafeEqual(left, right);
}

async function getOtpRecord(email) {
  return prisma.emailOtp.findUnique({
    where: { email: normalizeEmail(email) },
  });
}

async function saveOtpRecord(email, otpCode, now = new Date()) {
  const expiresAt = new Date(now.getTime() + OTP_TTL_MS);
  const cooldownUntil = new Date(now.getTime() + OTP_COOLDOWN_MS);
  const otpHash = hashOtp(email, otpCode);

  await prisma.emailOtp.upsert({
    where: { email: normalizeEmail(email) },
    update: {
      otpHash,
      expiresAt,
      cooldownUntil,
      attempts: 0,
      verifiedAt: null,
      lastSentAt: now,
      updatedAt: now,
    },
    create: {
      email: normalizeEmail(email),
      otpHash,
      expiresAt,
      cooldownUntil,
      attempts: 0,
      lastSentAt: now,
      createdAt: now,
      updatedAt: now,
    },
  });

  return {
    expiresAt,
    cooldownUntil,
    expiresInSec: Math.floor(OTP_TTL_MS / 1000),
    cooldownSec: Math.floor(OTP_COOLDOWN_MS / 1000),
  };
}

async function deleteOtpRecord(email) {
  await prisma.emailOtp.delete({ where: { email: normalizeEmail(email) } }).catch(() => {});
}

async function checkSendOtpCooldown(email, now = new Date()) {
  const record = await getOtpRecord(email);
  if (!record) {
    return { canSend: true, retryAfterSec: 0 };
  }

  if (record.cooldownUntil > now) {
    const retryAfterSec = Math.ceil((record.cooldownUntil.getTime() - now.getTime()) / 1000);
    return { canSend: false, retryAfterSec: Math.max(1, retryAfterSec) };
  }

  return { canSend: true, retryAfterSec: 0 };
}

async function verifyOtpCode(email, otpCode, now = new Date(), options = {}) {
  const consumeOnSuccess = options.consumeOnSuccess !== false;
  const normalizedEmail = normalizeEmail(email);
  const record = await getOtpRecord(normalizedEmail);

  if (!record) {
    return {
      ok: false,
      status: 400,
      error: "No OTP found for this email. Request a new code.",
      code: "OTP_NOT_FOUND",
    };
  }

  if (record.expiresAt <= now) {
    await prisma.emailOtp.delete({ where: { email: normalizedEmail } }).catch(() => {});
    return {
      ok: false,
      status: 400,
      error: "OTP has expired. Request a new code.",
      code: "OTP_EXPIRED",
    };
  }

  if (record.attempts >= MAX_VERIFY_ATTEMPTS) {
    return {
      ok: false,
      status: 429,
      error: "Too many failed attempts. Please request a new OTP.",
      code: "OTP_ATTEMPTS_EXCEEDED",
    };
  }

  let inputHash;
  try {
    inputHash = hashOtp(normalizedEmail, otpCode);
  } catch (error) {
    if (error.message === "OTP_SECRET_MISSING") {
      return {
        ok: false,
        status: 500,
        error: "Server OTP configuration is missing.",
        code: "OTP_CONFIG_MISSING",
      };
    }
    throw error;
  }

  const isValid = timingSafeEqualHex(inputHash, record.otpHash);
  if (!isValid) {
    await prisma.emailOtp.update({
      where: { email: normalizedEmail },
      data: { attempts: { increment: 1 }, updatedAt: now },
    });

    return {
      ok: false,
      status: 400,
      error: "Invalid OTP code.",
      code: "OTP_INVALID",
    };
  }

  if (consumeOnSuccess) {
    await prisma.emailOtp.delete({ where: { email: normalizedEmail } }).catch(() => {});
  }

  return { ok: true, record };
}

async function markOtpVerified(email, now = new Date()) {
  return prisma.emailOtp.update({
    where: { email: normalizeEmail(email) },
    data: {
      verifiedAt: now,
      updatedAt: now,
    },
  });
}

module.exports = {
  OTP_TTL_MS,
  OTP_COOLDOWN_MS,
  normalizeEmail,
  isValidEmail,
  generateOtp,
  checkSendOtpCooldown,
  saveOtpRecord,
  deleteOtpRecord,
  verifyOtpCode,
  getOtpRecord,
  markOtpVerified,
  MAX_VERIFY_ATTEMPTS,
};
