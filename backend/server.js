const express = require("express");
const cors = require("cors");
const session = require("express-session");

const authRoutes = require("./routes/authRoutes");
const { connectDatabase } = require("./config/db");
const { initializeUserStore } = require("./models/userModel");

const app = express();
const PORT = 5000;

app.use(
  cors({
    origin: true,
    credentials: true,
  })
);

app.use(express.json());

app.use(
  session({
    secret: process.env.SESSION_SECRET || "novara-session-secret",
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      maxAge: 1000 * 60 * 60 * 24,
    },
  })
);

app.use("/api/auth", authRoutes);

app.use((req, res) => {
  return res.status(404).json({
    success: false,
    error: "Route not found",
  });
});

async function startServer() {
  try {
    await connectDatabase();
    await initializeUserStore();

    app.listen(PORT, () => {
      console.log(`Auth server is running on http://localhost:${PORT}`);
    });
  } catch (error) {
    console.error("Failed to start server:", error);
    process.exit(1);
  }
}

startServer();

module.exports = app;