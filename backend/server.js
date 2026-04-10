require("dotenv").config();
console.log('=== NOVARA BACKEND SERVER.JS STARTED ===');

const express = require('express');
const cors = require("cors");
const session = require("express-session");
const path = require("path");

// Route imports
const stripeWebhookRoutes = require("./routes/stripeWebhookRoutes");
const billingRoutes = require("./routes/billingRoutes");
const authRoutes      = require("./routes/authRoutes");
const bookRoutes      = require("./routes/bookRoutes");
const adminBookRoutes = require("./routes/adminBookRoutes");
const chapterRoutes = require("./routes/chapterRoutes");
const adminChapterRoutes = require("./routes/adminChapterRoutes");
const progressRoutes = require("./routes/progressRoutes");
const listeningProgressRoutes = require("./routes/listeningProgressRoutes");
const audioRoutes = require("./routes/audioRoutes");
const adminAudioRoutes = require("./routes/adminAudioRoutes");
const adminDashboardRoutes = require("./routes/adminDashboardRoutes");
const adminUserRoutes = require("./routes/adminUserRoutes");
const adminAnalyticsRoutes = require("./routes/adminAnalyticsRoutes");
const profileRoutes = require("./routes/profileRoutes");
const writerRoutes = require("./routes/writerRoutes");
const writerStoryRoutes = require("./routes/writerStoryRoutes");
const writerAiRoutes = require("./routes/writerAiRoutes");
const referralRoutes = require("./routes/referralRoutes");
const referralQrRoutes = require("./routes/referralQrRoutes");
const referralMeRoutes = require("./routes/referralMeRoutes");
const { requireAuth, requireAdmin, requireWriter, requireWriterOrAdmin } = require("./middleware/auth");
const { connectDatabase } = require("./config/db");
const { initializeUserStore } = require("./models/userModel");
const rewardRoutes = require('./routes/rewardRoutes');


const app = express();


// ====== CLEAN MIDDLEWARE SETUP ======
app.use(cors({
  origin: true,
  credentials: true
}));
// Stripe webhook route (must be before express.json)
app.use("/api/stripe", stripeWebhookRoutes);
// Body parsers
app.use(express.json({ limit: "5mb" }));
app.use(express.urlencoded({ extended: true }));
// Session (ONE instance)
app.use(
  session({
    secret: process.env.SESSION_SECRET || "Novara-session-secret",
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      secure: false,
      sameSite: "lax",
      maxAge: 1000 * 60 * 60 * 24,
    },
  })
);
// Static files (ONE instance)
app.use(express.static(path.join(__dirname, "public")));
app.use("/books", express.static(path.join(__dirname, "books")));
// Billing routes (after express.json)
app.use("/api/billing", billingRoutes);
// ====== END CLEAN MIDDLEWARE SETUP ======

// ✅ Test route for development
app.get('/api/test', (req, res) => {
  console.log("/api/test route hit");
  return res.json({
    success: true,
    message: "API test route is working",
    timestamp: new Date().toISOString(),
  });
});

app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

app.get("/health", (req, res) => {
  return res.json({
    success: true,
    status: "ok",
  });
});

app.use("/api/auth",        authRoutes);
app.use("/api/referrals",   referralMeRoutes);
app.use("/api/referrals",   referralQrRoutes);
app.use("/api/referrals",   referralRoutes);
app.use("/api/writer",      writerRoutes);
app.use("/api/writer",      writerStoryRoutes);
app.use("/api/writer/ai",   writerAiRoutes);
app.use("/api/books",       bookRoutes);
app.use("/api/admin/books", adminBookRoutes);
app.use("/api", chapterRoutes);
app.use("/api/admin", adminChapterRoutes);
app.use("/api/progress", progressRoutes);
app.use("/api/progress", listeningProgressRoutes);
app.use("/api", audioRoutes);
app.use("/api/admin", adminAudioRoutes);
app.use("/api/admin", adminDashboardRoutes);
app.use("/api/admin", adminUserRoutes);
app.use("/api/admin", adminAnalyticsRoutes);
app.use("/api/profile", profileRoutes);
const walletRoutes = require("./routes/walletRoutes");
app.use("/api/wallet", walletRoutes);
app.use("/api/rewards", rewardRoutes);
const PORT = process.env.PORT || 5002;
app.use((error, req, res, next) => {
  if (error && error.type === "entity.too.large") {
    return res.status(413).json({
      success: false,
      error: "Request payload too large. Please upload a smaller image.",
    });
  }

  return next(error);
});

app.use("/admin", requireAdmin);

app.get("/admin/dashboard", (req, res) => {
  if (!req.session || !req.session.user || req.session.user.role !== "ADMIN") {
    return res.redirect(`${getFrontendOrigin(req)}/admin-login.html?next=${encodeURIComponent("/admin/dashboard")}`);
  }

  return res.redirect(`${getFrontendOrigin(req)}/admin.html`);
});

app.get("/writer/dashboard", (req, res) => {
  if (!req.session || !req.session.user) {
    return res.redirect(`${getFrontendOrigin(req)}/index.html`);
  }

  if (req.session.user.role === "ADMIN") {
    return res.redirect(`${getFrontendOrigin(req)}/admin.html`);
  }

  if (!req.session.user.isWriter) {
    return res.redirect(`${getFrontendOrigin(req)}/writer-onboarding.html`);
  }

  return res.redirect(`${getFrontendOrigin(req)}/writer-dashboard.html`);
});

app.get("/reader/dashboard", (req, res) => {
  if (!req.session || !req.session.user) {
    return res.redirect(`${getFrontendOrigin(req)}/index.html`);
  }

  if (req.session.user.role === "ADMIN") {
    return res.redirect(`${getFrontendOrigin(req)}/admin.html`);
  }

  return res.redirect(`${getFrontendOrigin(req)}/reader-dashboard.html`);
});

app.get("/admin/books/upload", (req, res) => {
  if (!req.session || !req.session.user || req.session.user.role !== "ADMIN") {
    return res.redirect(`${getFrontendOrigin(req)}/admin-login.html?next=${encodeURIComponent("/admin/books/upload")}`);
  }

  return res.redirect(`${getFrontendOrigin(req)}/admin-upload.html`);
});

app.get("/writer/stories/new", (req, res) => {
  if (!req.session || !req.session.user) {
    return res.redirect(`${getFrontendOrigin(req)}/index.html`);
  }

  if (req.session.user.role !== "ADMIN" && !req.session.user.isWriter) {
    return res.redirect(`${getFrontendOrigin(req)}/writer-onboarding.html`);
  }

  return res.redirect(`${getFrontendOrigin(req)}/writer-stories-new.html`);
});

app.get("/writer/stories/:id/chapters", (req, res) => {
  if (!req.session || !req.session.user) {
    return res.redirect(`${getFrontendOrigin(req)}/index.html`);
  }

  if (req.session.user.role !== "ADMIN" && !req.session.user.isWriter) {
    return res.redirect(`${getFrontendOrigin(req)}/writer-onboarding.html`);
  }

  const storyId = encodeURIComponent(req.params.id);
  return res.redirect(`${getFrontendOrigin(req)}/writer-story-chapters.html?storyId=${storyId}`);
});

app.get("/join/:code", (req, res) => {
  const referralCode = encodeURIComponent(String(req.params.code || "").trim());
  return res.redirect(`${getFrontendOrigin(req)}/index.html?auth=signup&ref=${referralCode}`);
});

// SPA fallback (after all API and page routes, before 404)
app.get(/^\/(?!api|css|js|assets|books)(.*)/, (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

// 404 handler LAST
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

function getFrontendOrigin(req) {
  return `${req.protocol}://${req.get("host")}`;
}
