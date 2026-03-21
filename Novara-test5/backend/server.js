const express = require("express");
const cors = require("cors");
const session = require("express-session");
const path = require("path");

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
const { requireAuth, requireAdmin, requireWriter, requireWriterOrAdmin } = require("./middleware/auth");
const { connectDatabase } = require("./config/db");
const { initializeUserStore } = require("./models/userModel");

const app = express();
const PORT = Number(process.env.PORT) || 5001;

function getFrontendOrigin(req) {
  return `${req.protocol}://${req.hostname}:5500`;
}

app.use(
  cors({
    origin: true,
    credentials: true,
  })
);

app.use(express.json({ limit: "5mb" }));
app.use(express.static(path.join(__dirname, "..")));

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

app.get("/", (req, res) => {
  return res.json({
    success: true,
    message: "Novara backend is running",
    routes: {
      health:          "GET  /health",
      signup:          "POST /api/auth/signup",
      signin:          "POST /api/auth/signin",
      signout:         "POST /api/auth/signout",
      currentUser:     "GET  /api/auth/me",
      books:           "GET  /api/books",
      discoverBooks:   "GET  /api/books/discover",
      featuredBooks:   "GET  /api/books/featured",
      trendingBooks:   "GET  /api/books/trending",
      recentBooks:     "GET  /api/books/recent",
      book:            "GET  /api/books/:id",
      adminCreateBook: "POST /api/admin/books",
      adminUpdateBook: "PUT  /api/admin/books/:id",
      adminDeleteBook: "DELETE /api/admin/books/:id",
      adminPublish:    "POST /api/admin/books/:id/publish",
      adminUnpublish:  "POST /api/admin/books/:id/unpublish",
      chaptersByBook:  "GET  /api/books/:bookId/chapters",
      chapterById:     "GET  /api/chapters/:id",
      adminCreateChapter: "POST /api/admin/books/:bookId/chapters",
      adminUpdateChapter: "PUT  /api/admin/chapters/:id",
      adminDeleteChapter: "DELETE /api/admin/chapters/:id",
      saveReadingProgress: "POST /api/progress/reading",
      getReadingProgress: "GET  /api/progress/reading/:bookId",
      saveListeningProgress: "POST /api/progress/listening",
      getListeningProgress: "GET  /api/progress/listening/:bookId",
      bookAudio: "GET  /api/books/:id/audio",
      adminCreateAudio: "POST /api/admin/books/:id/audio",
      adminUpdateAudio: "PUT  /api/admin/audio/:id",
      adminDeleteAudio: "DELETE /api/admin/audio/:id",
      adminUsers: "GET  /api/admin/users",
      adminUser: "GET  /api/admin/users/:id",
      adminPatchUser: "PATCH /api/admin/users/:id",
      adminDeleteUser: "DELETE /api/admin/users/:id",
      adminAnalytics: "GET  /api/admin/analytics",
      profile: "GET  /api/profile",
      profileUpdate: "PATCH /api/profile",
      profileStats: "GET  /api/profile/stats",
      profileLibrary: "GET  /api/profile/library",
      profileActivity: "GET  /api/profile/activity",
      profileAnnotations: "GET  /api/profile/annotations",
      profileUpdateBookmarkAnnotation: "PATCH /api/profile/annotations/bookmarks/:id",
      profileDeleteBookmarkAnnotation: "DELETE /api/profile/annotations/bookmarks/:id",
      profileUpdateHighlightAnnotation: "PATCH /api/profile/annotations/highlights/:id",
      profileDeleteHighlightAnnotation: "DELETE /api/profile/annotations/highlights/:id",
      profileUpdateNoteAnnotation: "PATCH /api/profile/annotations/notes/:id",
      profileDeleteNoteAnnotation: "DELETE /api/profile/annotations/notes/:id",
      writerOnboarding: "POST /api/auth/writer/onboarding",
      writerDashboard: "GET  /api/writer/dashboard",
    },
  });
});

app.get("/health", (req, res) => {
  return res.json({
    success: true,
    status: "ok",
  });
});

app.use("/api/auth",        authRoutes);
app.use("/api/writer",      writerRoutes);
app.use("/api/writer",      writerStoryRoutes);
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