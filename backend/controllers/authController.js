const bcrypt = require("bcrypt");

const { createUser, findUserByEmail } = require("../models/userModel");

function buildSafeUser(user) {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
  };
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
    const existingUser = findUserByEmail(normalizedEmail);

    if (existingUser) {
      return res.status(409).json({
        success: false,
        error: "An account with this email already exists",
      });
    }

    const passwordHash = await bcrypt.hash(password, 10);
    const user = createUser({
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
    const user = findUserByEmail(normalizedEmail);

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

module.exports = {
  signup,
  signin,
  signout,
};