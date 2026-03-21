const bcrypt = require("bcrypt");

const { createUser, enableWriterAccess, findUserByEmail } = require("../models/userModel");

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

async function signup(req, res) {
  try {
    const { name, email, password } = req.body;

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

    const passwordHash = await bcrypt.hash(password, 10);
    const user = await createUser({
      name: name.trim(),
      email: normalizedEmail,
      passwordHash,
      role: "USER",
    });

    return res.status(201).json({
      success: true,
      message: "Account created successfully",
      user: buildSafeUser(user),
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      error: "Unable to create account",
    });
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

    const normalizedEmail = email.trim().toLowerCase();
    const user = await findUserByEmail(normalizedEmail);

    if (!user) {
      return res.status(401).json({
        success: false,
        error: "Invalid email or password",
      });
    }

    const isPasswordValid = await bcrypt.compare(password, user.passwordHash);

    if (!isPasswordValid) {
      return res.status(401).json({
        success: false,
        error: "Invalid email or password",
      });
    }

    const sessionUser = buildSafeUser(user);
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

    const sessionUser = buildSafeUser(user);
    req.session.user = sessionUser;

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
};