
const bcrypt = require("bcrypt");
const crypto = require("crypto");
const { createUser, enableWriterAccess, findUserByEmail } = require("../models/userModel");
const {
  ensureReferralCode,
  attachReferralToSignup,
  evaluateReferralForReferredUser,
} = require("../services/referralService");
const { prisma } = require("../config/db");
const { sendVerificationEmail } = require("../utils/email");

function buildSafeUser(user) {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    avatarUrl: user.avatarUrl || "",
    role: user.role,
    isWriter: Boolean(user.isWriter),
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


// Helper: Generate secure token
function generateToken() {
  return crypto.randomBytes(48).toString("hex");
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

    const normalizedEmail = email.trim().toLowerCase();
    const existingUser = await findUserByEmail(normalizedEmail);

    if (existingUser) {
      return res.status(409).json({
        success: false,
        error: "An account with this email already exists",
      });
    }


    const passwordHash = await bcrypt.hash(password, 12);
    // TEMPORARY: Skip email verification, set user as verified
    const user = await prisma.user.create({
      data: {
        name: name.trim(),
        email: normalizedEmail,
        password: passwordHash,
        isVerified: true, // allow immediate access
        role: "USER",
        signupIp: req.ip || null,
      },
    });

    const referralCode = await ensureReferralCode(user.id, user.name);
    if (referralToken) {
      try {
        await attachReferralToSignup({
          refToken: referralToken,
          referredUserId: user.id,
          referredEmail: normalizedEmail,
          signupIp: req.ip || null,
        });
      } catch (referralError) {
        // Signup should remain successful even if referral attribution fails.
      }
    }

    return res.status(201).json({
      success: true,
      message: "Signup successful. Please check your email to verify your account.",
    });
  } catch (error) {
    if (error && error.code === "P2002") {
      return res.status(409).json({
        success: false,
        error: "An account with this email or referral code already exists",
      });
    }
    return res.status(500).json({
      success: false,
      error: "Unable to create account",
    });
  }
}

// Email verification controller
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
  } catch (error) {
    return res.redirect(`${process.env.FRONTEND_URL}/verification-failed.html`);
  }
}

// Resend verification email
async function resendVerification(req, res) {
  const { email } = req.body;
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) return res.status(404).json({ error: 'User not found.' });
  if (user.isVerified) return res.status(400).json({ error: 'Email already verified.' });
  const verificationToken = generateToken();
  const verificationTokenExpiry = new Date(Date.now() + 1000 * 60 * 60 * 24);
  await prisma.user.update({ where: { id: user.id }, data: { verificationToken, verificationTokenExpiry } });
  await sendVerificationEmail(email, verificationToken);
  res.json({ message: 'Verification email resent.' });
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

    const normalizedEmail = email.trim().toLowerCase();
    const user = await findUserByEmail(normalizedEmail);
    console.log('User:', user);
    if (!user) {
      console.log('No user found for email:', normalizedEmail);
      return res.status(401).json({
        success: false,
        error: "Invalid email or password",
      });
    }
    if (!user.isVerified) {
      console.log('User not verified:', user.email);
      return res.status(403).json({
        success: false,
        error: "Please verify your email before logging in.",
      });
    }
    console.log('Password entered:', password);
    console.log('Password hash:', user.passwordHash);
    const isPasswordValid = await bcrypt.compare(password, user.passwordHash);
    console.log('Password valid:', isPasswordValid);
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

    return res.json({
      success: true,
      message: "Logged in successfully",
      user: sessionUser,
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      error: "Unable to sign in",
    });
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
  } catch (error) {
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
  } catch (error) {
    return res.status(500).json({
      success: false,
      error: "Unable to enable writer access",
    });
  }
}

module.exports = {
  signup,
  signin,
  signout,
  onboardWriter,
  verifyEmail,
  resendVerification,
};
