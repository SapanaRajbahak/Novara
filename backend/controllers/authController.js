const bcrypt = require("bcrypt");
const crypto = require("crypto");
const jwt = require("jsonwebtoken");
const { enableWriterAccess, findUserByEmail } = require("../models/userModel");
const {
  ensureReferralCode,
  attachReferralToSignup,
  evaluateReferralForReferredUser,
} = require("../services/referralService");
const {
  normalizeEmail,
  isValidEmail,
  generateOtp,
  checkSendOtpCooldown,
  saveOtpRecord,
  deleteOtpRecord,
  verifyOtpCode,
  getOtpRecord,
  markOtpVerified,
} = require("../services/otpService");
const { prisma } = require("../config/db");
const { sendVerificationEmail } = require("../utils/email");
const { sendOtpEmail } = require("../utils/otpEmail");

const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || "7d";
const RESET_TOKEN_EXPIRES_IN = process.env.RESET_TOKEN_EXPIRES_IN || "15m";
const OTP_VERIFY_WINDOW_MS = 10 * 60 * 1000;

function getJwtSecret() {
  return process.env.JWT_SECRET || process.env.SESSION_SECRET || "";
}

function buildSafeUser(user) {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    avatarUrl: user.avatarUrl || "",
    role: user.role,
    isWriter: Boolean(user.isWriter),
    coins: Number(user.coins || 0),
    writerProfile: {
      penName: user.penName || "",
      bio: user.bio || "",
      preferredGenres: Array.isArray(user.preferredGenres) ? user.preferredGenres : [],
    },
    referral: {
      code: user.referralCode || "",
      referredBy: user.referredBy || "",
      cashEarned: Number(user.referralCashEarned || 0),
      coins: Number(user.coins || 0),
      aiCredits: Number(user.aiCredits || 0),
    },
  };
}

function parsePreferredGenres(value) {
  if (Array.isArray(value)) {
    return value
      .map((item) => String(item || "").trim())
      .filter(Boolean)
      .slice(0, 8);
  }

  if (typeof value !== "string") {
    return [];
  }

  return value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean)
    .slice(0, 8);
}

function generateToken() {
  return crypto.randomBytes(48).toString("hex");
}

function validatePassword(password) {
  const value = String(password || "");
  const strongPasswordRegex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z0-9]).{8,}$/;

  if (!strongPasswordRegex.test(value)) {
    return "Password must be at least 8 characters and include uppercase, lowercase, number, and special character.";
  }

  if (value.length > 128) {
    return "Password is too long.";
  }
  return "";
}

function signJwtToken(user) {
  const secret = getJwtSecret();
  if (!secret) {
    throw new Error("JWT_SECRET_MISSING");
  }

  return jwt.sign(
    {
      sub: user.id,
      email: user.email,
      role: user.role,
      isWriter: Boolean(user.isWriter),
    },
    secret,
    { expiresIn: JWT_EXPIRES_IN }
  );
}

function signResetToken(email) {
  const secret = getJwtSecret();
  if (!secret) {
    throw new Error("JWT_SECRET_MISSING");
  }

  return jwt.sign(
    {
      email,
      purpose: "password-reset",
      nonce: crypto.randomBytes(8).toString("hex"),
    },
    secret,
    { expiresIn: RESET_TOKEN_EXPIRES_IN }
  );
}

async function issueOtpForEmail(email) {
  const cooldown = await checkSendOtpCooldown(email);
  if (!cooldown.canSend) {
    return {
      ok: false,
      status: 429,
      error: "Please wait before requesting another OTP.",
      retryAfterSec: cooldown.retryAfterSec,
    };
  }

  const otpCode = generateOtp();
  let saved;

  try {
    saved = await saveOtpRecord(email, otpCode);
  } catch (error) {
    if (error.message === "OTP_SECRET_MISSING") {
      return {
        ok: false,
        status: 500,
        error: "Server OTP configuration is missing.",
      };
    }
    throw error;
  }

  try {
    await sendOtpEmail(email, otpCode);
  } catch (error) {
    console.error("issueOtpForEmail send error:", error.message || error);
    await deleteOtpRecord(email);
    if (error.message === "RESEND_API_KEY_MISSING") {
      return {
        ok: false,
        status: 500,
        error: "Server email configuration is missing.",
      };
    }

    const providerMessage = String(error?.message || "").trim();
    if (providerMessage) {
      return {
        ok: false,
        status: 502,
        error: providerMessage,
      };
    }

    return {
      ok: false,
      status: 502,
      error: "Unable to send OTP email right now.",
    };
  }

  return {
    ok: true,
    data: {
      expiresInSec: saved.expiresInSec,
      cooldownSec: saved.cooldownSec,
    },
  };
}

async function signup(req, res) {
  try {
    const { name, email, password } = req.body;
    const referralToken = String(req.body.ref || req.body.referralCode || req.body.referral || "").trim();

    if (!name || !email || !password) {
      return res.status(400).json({
        success: false,
        error: "Name, email, and password are required",
      });
    }

    const normalizedEmail = normalizeEmail(email);
    if (!isValidEmail(normalizedEmail)) {
      return res.status(400).json({ success: false, error: "A valid email is required." });
    }

    const passwordError = validatePassword(password);
    if (passwordError) {
      return res.status(400).json({ success: false, error: passwordError });
    }

    const existingUser = await findUserByEmail(normalizedEmail);
    if (existingUser && existingUser.isVerified) {
      return res.status(409).json({ success: false, error: "An account with this email already exists" });
    }

    const passwordHash = await bcrypt.hash(password, 12);
    let user;

    if (existingUser && !existingUser.isVerified) {
      user = await prisma.user.update({
        where: { id: existingUser.id },
        data: {
          name: String(name).trim(),
          password: passwordHash,
          signupIp: req.ip || null,
          verificationToken: null,
          verificationTokenExpiry: null,
        },
      });
    } else {
      user = await prisma.user.create({
        data: {
          name: String(name).trim(),
          email: normalizedEmail,
          password: passwordHash,
          isVerified: false,
          role: "USER",
          signupIp: req.ip || null,
        },
      });

      await ensureReferralCode(user.id, user.name);

      if (referralToken) {
        try {
          await attachReferralToSignup({
            refToken: referralToken,
            referredUserId: user.id,
            referredEmail: normalizedEmail,
            signupIp: req.ip || null,
          });
        } catch (_error) {
          // Keep signup successful even if referral link fails.
        }
      }
    }

    const otpResult = await issueOtpForEmail(normalizedEmail);
    if (!otpResult.ok) {
      return res.status(otpResult.status).json({
        success: false,
        error: otpResult.error,
        retryAfterSec: otpResult.retryAfterSec,
      });
    }

    return res.status(201).json({
      success: true,
      message: "Signup successful. Verify OTP to activate your account.",
      data: {
        email: normalizedEmail,
        userId: user.id,
        expiresInSec: otpResult.data.expiresInSec,
        cooldownSec: otpResult.data.cooldownSec,
      },
    });
  } catch (error) {
    if (error && error.code === "P2002") {
      return res.status(409).json({
        success: false,
        error: "An account with this email already exists",
      });
    }

    console.error("signup error:", error);
    return res.status(500).json({
      success: false,
      error: "Unable to create account",
    });
  }
}

async function verifySignupOtp(req, res) {
  try {
    const email = normalizeEmail(req.body?.email);
    const otp = String(req.body?.otp || "").trim();

    if (!email || !isValidEmail(email)) {
      return res.status(400).json({ success: false, error: "A valid email is required." });
    }
    if (!/^\d{6}$/.test(otp)) {
      return res.status(400).json({ success: false, error: "OTP must be a 6-digit code." });
    }

    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) {
      return res.status(404).json({ success: false, error: "User not found." });
    }
    if (user.isVerified) {
      return res.status(400).json({ success: false, error: "Email already verified." });
    }

    const result = await verifyOtpCode(email, otp, new Date(), { consumeOnSuccess: true });
    if (!result.ok) {
      return res.status(result.status).json({ success: false, error: result.error, code: result.code });
    }

    const updated = await prisma.user.update({
      where: { id: user.id },
      data: {
        isVerified: true,
        verificationToken: null,
        verificationTokenExpiry: null,
      },
    });

    const referralCode = await ensureReferralCode(updated.id, updated.name);
    const safeUser = buildSafeUser({ ...updated, referralCode });

    return res.json({
      success: true,
      message: "Email verified successfully.",
      user: safeUser,
    });
  } catch (error) {
    console.error("verifySignupOtp error:", error);
    return res.status(500).json({ success: false, error: "Unable to verify OTP." });
  }
}

async function signin(req, res) {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({
        success: false,
        error: "Email and password are required",
      });
    }

    const normalizedEmail = normalizeEmail(email);
    const user = await findUserByEmail(normalizedEmail);
    if (!user) {
      return res.status(401).json({
        success: false,
        error: "Invalid email or password",
      });
    }

    if (!user.isVerified) {
      return res.status(403).json({
        success: false,
        error: "Please verify your email before logging in.",
      });
    }

    const isPasswordValid = await bcrypt.compare(String(password), user.passwordHash);
    if (!isPasswordValid) {
      return res.status(401).json({
        success: false,
        error: "Invalid email or password",
      });
    }

    const referralCode = await ensureReferralCode(user.id, user.name);
    const sessionUser = buildSafeUser({
      ...user,
      referralCode,
    });

    req.session.user = sessionUser;

    let token;
    try {
      token = signJwtToken(sessionUser);
    } catch (error) {
      if (error.message === "JWT_SECRET_MISSING") {
        return res.status(500).json({ success: false, error: "Server JWT configuration is missing." });
      }
      throw error;
    }

    return res.json({
      success: true,
      message: "Logged in successfully",
      token,
      user: sessionUser,
    });
  } catch (error) {
    console.error("signin error:", error);
    return res.status(500).json({
      success: false,
      error: "Unable to sign in",
    });
  }
}

const login = signin;

async function forgotPassword(req, res) {
  try {
    const email = normalizeEmail(req.body?.email);
    if (!email || !isValidEmail(email)) {
      return res.status(400).json({ success: false, error: "A valid email is required." });
    }

    const user = await prisma.user.findUnique({ where: { email } });
    if (!user || !user.isVerified) {
      return res.json({
        success: true,
        message: "If the account exists, an OTP has been sent.",
      });
    }

    const otpResult = await issueOtpForEmail(email);
    if (!otpResult.ok) {
      return res.status(otpResult.status).json({
        success: false,
        error: otpResult.error,
        retryAfterSec: otpResult.retryAfterSec,
      });
    }

    return res.json({
      success: true,
      message: "If the account exists, an OTP has been sent.",
      data: {
        expiresInSec: otpResult.data.expiresInSec,
        cooldownSec: otpResult.data.cooldownSec,
      },
    });
  } catch (error) {
    console.error("forgotPassword error:", error);
    return res.status(500).json({ success: false, error: "Unable to process forgot password request." });
  }
}

async function verifyResetOtp(req, res) {
  try {
    const email = normalizeEmail(req.body?.email);
    const otp = String(req.body?.otp || "").trim();

    if (!email || !isValidEmail(email)) {
      return res.status(400).json({ success: false, error: "A valid email is required." });
    }
    if (!/^\d{6}$/.test(otp)) {
      return res.status(400).json({ success: false, error: "OTP must be a 6-digit code." });
    }

    const user = await prisma.user.findUnique({ where: { email } });
    if (!user || !user.isVerified) {
      return res.status(400).json({ success: false, error: "Invalid OTP request." });
    }

    const result = await verifyOtpCode(email, otp, new Date(), { consumeOnSuccess: false });
    if (!result.ok) {
      return res.status(result.status).json({ success: false, error: result.error, code: result.code });
    }

    await markOtpVerified(email);

    let resetToken;
    try {
      resetToken = signResetToken(email);
    } catch (error) {
      if (error.message === "JWT_SECRET_MISSING") {
        return res.status(500).json({ success: false, error: "Server JWT configuration is missing." });
      }
      throw error;
    }

    return res.json({
      success: true,
      message: "OTP verified. You can now reset your password.",
      data: { resetToken },
    });
  } catch (error) {
    console.error("verifyResetOtp error:", error);
    return res.status(500).json({ success: false, error: "Unable to verify reset OTP." });
  }
}

async function resetPassword(req, res) {
  try {
    const email = normalizeEmail(req.body?.email);
    const newPassword = String(req.body?.newPassword || "");
    const resetToken = String(req.body?.resetToken || "").trim();

    if (!email || !isValidEmail(email)) {
      return res.status(400).json({ success: false, error: "A valid email is required." });
    }
    if (!resetToken) {
      return res.status(400).json({ success: false, error: "resetToken is required." });
    }

    const passwordError = validatePassword(newPassword);
    if (passwordError) {
      return res.status(400).json({ success: false, error: passwordError });
    }

    let payload;
    try {
      payload = jwt.verify(resetToken, getJwtSecret());
    } catch (_error) {
      return res.status(401).json({ success: false, error: "Invalid or expired reset token." });
    }

    if (payload.purpose !== "password-reset" || normalizeEmail(payload.email) !== email) {
      return res.status(401).json({ success: false, error: "Invalid reset token." });
    }

    const otpRecord = await getOtpRecord(email);
    if (!otpRecord || !otpRecord.verifiedAt) {
      return res.status(400).json({ success: false, error: "OTP verification is required before resetting password." });
    }

    const now = new Date();
    if (otpRecord.expiresAt <= now || now.getTime() - new Date(otpRecord.verifiedAt).getTime() > OTP_VERIFY_WINDOW_MS) {
      await deleteOtpRecord(email);
      return res.status(400).json({ success: false, error: "OTP verification has expired. Please restart forgot password." });
    }

    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) {
      return res.status(404).json({ success: false, error: "User not found." });
    }

    const passwordHash = await bcrypt.hash(newPassword, 12);
    await prisma.user.update({
      where: { id: user.id },
      data: { password: passwordHash },
    });

    await deleteOtpRecord(email);

    return res.json({
      success: true,
      message: "Password reset successfully.",
    });
  } catch (error) {
    console.error("resetPassword error:", error);
    return res.status(500).json({ success: false, error: "Unable to reset password." });
  }
}

// Email verification controller (token-based link flow kept for compatibility)
async function verifyEmail(req, res) {
  try {
    const { token } = req.query;
    if (!token) return res.redirect(`${process.env.FRONTEND_URL}/verification-failed.html`);

    const user = await prisma.user.findFirst({
      where: {
        verificationToken: token,
        verificationTokenExpiry: { gt: new Date() },
      },
    });

    if (!user) return res.redirect(`${process.env.FRONTEND_URL}/verification-failed.html`);

    await prisma.user.update({
      where: { id: user.id },
      data: {
        isVerified: true,
        verificationToken: null,
        verificationTokenExpiry: null,
      },
    });

    return res.redirect(`${process.env.FRONTEND_URL}/verification-success.html`);
  } catch (_error) {
    return res.redirect(`${process.env.FRONTEND_URL}/verification-failed.html`);
  }
}

// Legacy verification resend route kept for compatibility.
async function resendVerification(req, res) {
  const email = normalizeEmail(req.body?.email);
  if (!email || !isValidEmail(email)) {
    return res.status(400).json({ success: false, error: "A valid email is required." });
  }

  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) return res.status(404).json({ success: false, error: "User not found." });
  if (user.isVerified) return res.status(400).json({ success: false, error: "Email already verified." });

  const verificationToken = generateToken();
  const verificationTokenExpiry = new Date(Date.now() + 1000 * 60 * 60 * 24);
  await prisma.user.update({
    where: { id: user.id },
    data: { verificationToken, verificationTokenExpiry },
  });
  await sendVerificationEmail(email, verificationToken);

  return res.json({ success: true, message: "Verification email resent." });
}

async function sendOtp(req, res) {
  try {
    const email = normalizeEmail(req.body?.email);
    if (!email || !isValidEmail(email)) {
      return res.status(400).json({ success: false, error: "A valid email is required." });
    }

    const otpResult = await issueOtpForEmail(email);
    if (!otpResult.ok) {
      return res.status(otpResult.status).json({
        success: false,
        error: otpResult.error,
        retryAfterSec: otpResult.retryAfterSec,
      });
    }

    return res.json({
      success: true,
      message: "OTP sent successfully.",
      data: {
        email,
        expiresInSec: otpResult.data.expiresInSec,
        cooldownSec: otpResult.data.cooldownSec,
      },
    });
  } catch (error) {
    console.error("sendOtp error:", error);
    return res.status(500).json({ success: false, error: "Unable to process OTP request." });
  }
}

async function verifyOtp(req, res) {
  try {
    const email = normalizeEmail(req.body?.email);
    const otpCode = String(req.body?.otp || "").trim();

    if (!email || !isValidEmail(email)) {
      return res.status(400).json({ success: false, error: "A valid email is required." });
    }

    if (!/^\d{6}$/.test(otpCode)) {
      return res.status(400).json({ success: false, error: "OTP must be a 6-digit code." });
    }

    const result = await verifyOtpCode(email, otpCode, new Date(), { consumeOnSuccess: true });
    if (!result.ok) {
      return res.status(result.status).json({ success: false, error: result.error, code: result.code });
    }

    await prisma.user.updateMany({
      where: { email },
      data: {
        isVerified: true,
        verificationToken: null,
        verificationTokenExpiry: null,
      },
    });

    return res.json({
      success: true,
      message: "OTP verified successfully.",
      data: {
        email,
        verified: true,
      },
    });
  } catch (error) {
    console.error("verifyOtp error:", error);
    return res.status(500).json({ success: false, error: "Unable to verify OTP." });
  }
}

async function signout(req, res) {
  try {
    req.session.destroy((error) => {
      if (error) {
        return res.status(500).json({
          success: false,
          error: "Unable to sign out",
        });
      }

      res.clearCookie("connect.sid");

      return res.json({
        success: true,
        message: "Signed out successfully",
      });
    });
  } catch (_error) {
    return res.status(500).json({
      success: false,
      error: "Unable to sign out",
    });
  }
}

async function onboardWriter(req, res) {
  try {
    const { penName, bio, preferredGenres } = req.body;

    if (!req.session || !req.session.user) {
      return res.status(401).json({
        success: false,
        error: "Authentication required",
      });
    }

    if (req.session.user.role === "ADMIN") {
      return res.status(403).json({
        success: false,
        error: "Admin accounts cannot use writer onboarding",
      });
    }

    const normalizedPenName = typeof penName === "string" ? penName.trim() : "";
    const normalizedBio = typeof bio === "string" ? bio.trim() : "";
    const normalizedGenres = parsePreferredGenres(preferredGenres);

    if (!normalizedPenName || !normalizedBio || normalizedGenres.length === 0) {
      return res.status(400).json({
        success: false,
        error: "Pen name, bio, and at least one preferred genre are required",
      });
    }

    const user = await enableWriterAccess(req.session.user.id, {
      penName: normalizedPenName,
      bio: normalizedBio,
      preferredGenres: normalizedGenres,
    });

    const referralCode = await ensureReferralCode(user.id, user.name);
    const sessionUser = buildSafeUser({
      ...user,
      referralCode,
    });
    req.session.user = sessionUser;

    await evaluateReferralForReferredUser(user.id);

    return res.json({
      success: true,
      message: "Writer access enabled",
      user: sessionUser,
    });
  } catch (_error) {
    return res.status(500).json({
      success: false,
      error: "Unable to enable writer access",
    });
  }
}

module.exports = {
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
};
