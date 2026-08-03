require("dotenv").config();
console.log('=== NOVARA BACKEND SERVER.JS STARTED ===');

const express = require('express');
const http = require('http');
const { Server: SocketIOServer } = require('socket.io');
const cors = require("cors");
const session = require("express-session");
const PgSession = require("connect-pg-simple")(session);
const path = require("path");

const CANONICAL_APP_URL = process.env.APP_URL || "https://readnovara.ca";
let canonicalOrigin = "https://readnovara.ca";
let canonicalHost = "readnovara.ca";

try {
  const parsedCanonicalUrl = new URL(CANONICAL_APP_URL);
  canonicalOrigin = parsedCanonicalUrl.origin;
  canonicalHost = parsedCanonicalUrl.host.toLowerCase();
} catch (error) {
  console.warn("Invalid APP_URL for canonical redirects. Falling back to https://readnovara.ca");
}

// Route imports
const stripeWebhookRoutes = require("./routes/stripeWebhookRoutes");
const billingRoutes = require("./routes/billingRoutes");
const authRoutes      = require("./routes/authRoutes");
const bookRoutes      = require("./routes/bookRoutes");
const adminBookRoutes = require("./routes/adminBookRoutes");
const pdfUploadRoutes = require("./routes/pdfUploadRoutes");
const bookContentRoutes = require("./routes/bookContentRoutes");
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
const savedBooksRoutes = require('./routes/savedBooksRoutes');
const chatRoutes = require('./routes/chatRoutes');
const friendRoutes = require('./routes/friendRoutes');
const adminMonetizationRoutes = require("./routes/adminMonetizationRoutes");
const monetizationRoutes = require("./routes/monetizationRoutes");
const giftRoutes = require("./routes/giftRoutes");
const contactRoutes = require("./routes/contactRoutes");

const isProduction = process.env.NODE_ENV === "production";

const app = express();

if (isProduction) {
  // Allow express-session to recognize HTTPS when the app is behind a proxy.
  app.set("trust proxy", 1);
}

if (isProduction) {
  // Keep non-API traffic on one canonical host so session cookies remain consistent.
  app.use((req, res, next) => {
    const requestHost = (req.hostname || "").toLowerCase();
    const isApiRequest = req.path.startsWith("/api");
    const isHealthCheck = req.path === "/health";

    if (!isApiRequest && !isHealthCheck && requestHost && requestHost !== canonicalHost) {
      return res.redirect(308, `${canonicalOrigin}${req.originalUrl}`);
    }

    return next();
  });
}

const sessionStore = new PgSession({
  conString: process.env.DATABASE_URL,
  tableName: "sessions",
  createTableIfMissing: true,
});

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
    store: sessionStore,
    secret: process.env.SESSION_SECRET || "Novara-session-secret",
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      secure: isProduction,
      sameSite: isProduction ? "none" : "lax",
      maxAge: 1000 * 60 * 60 * 24 * 30,
    },
  })
);

const LEGAL_CANONICAL_PATHS = {
  "/community": "/community/",
  "/community/index.html": "/community/",
  "/privacy": "/privacy/",
  "/privacy/index.html": "/privacy/",
  "/terms": "/terms/",
  "/terms/index.html": "/terms/",
  "/contact": "/contact/",
  "/contact/index.html": "/contact/",
};

app.use((req, res, next) => {
  if (req.method !== "GET" && req.method !== "HEAD") {
    return next();
  }

  const target = LEGAL_CANONICAL_PATHS[req.path.toLowerCase()];
  if (target) {
    return res.redirect(301, target);
  }

  return next();
});

// Static files (ONE instance)
app.use(express.static(path.join(__dirname, "public")));
app.use("/books", express.static(path.join(__dirname, "books")));
app.use("/books", express.static(path.join(__dirname, "..", "books")));
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
app.use("/auth",            authRoutes);
app.use("/api/referrals",   referralMeRoutes);
app.use("/api/referrals",   referralQrRoutes);
app.use("/api/referrals",   referralRoutes);
app.use("/api/writer",      writerRoutes);
app.use("/api/writer",      writerStoryRoutes);
app.use("/api/writer/ai",   writerAiRoutes);
app.use("/api/books",       bookRoutes);
app.use("/api/books",       bookContentRoutes);
app.use("/api/admin/books", adminBookRoutes);
app.use("/api/admin/books", pdfUploadRoutes);
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
app.use("/api/profile", savedBooksRoutes);
const settingsRoutes = require("./routes/settingsRoutes");
app.use("/api/settings", settingsRoutes);
const walletRoutes = require("./routes/walletRoutes");
app.use("/api/wallet", walletRoutes);
app.use("/api/rewards", rewardRoutes);
app.use("/api/gift", giftRoutes);
app.use("/api/chat",    chatRoutes);
app.use("/api/friends", friendRoutes);
app.use("/api/admin", adminMonetizationRoutes);
app.use("/api/monetization", monetizationRoutes);
app.use("/api/contact", contactRoutes);
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
app.get(/^\/(?!api|css|js|assets|books|privacy|terms|contact)(.*)/, (req, res) => {
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

    const httpServer = http.createServer(app);
    const io = new SocketIOServer(httpServer, {
      cors: { origin: true, credentials: true },
    });

    const { registerChatHandlers } = require('./sockets/chatSocket');
    registerChatHandlers(io);

    httpServer.listen(PORT, () => {
      console.log(`Server is running on port ${PORT}`);
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
