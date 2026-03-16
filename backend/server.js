const express = require("express");
const cors = require("cors");
const session = require("express-session");

const authRoutes      = require("./routes/authRoutes");
const bookRoutes      = require("./routes/bookRoutes");
const adminBookRoutes = require("./routes/adminBookRoutes");
const chapterRoutes = require("./routes/chapterRoutes");
const adminChapterRoutes = require("./routes/adminChapterRoutes");
const progressRoutes = require("./routes/progressRoutes");
const listeningProgressRoutes = require("./routes/listeningProgressRoutes");
const audioRoutes = require("./routes/audioRoutes");
const adminAudioRoutes = require("./routes/adminAudioRoutes");
const { connectDatabase } = require("./config/db");
const { initializeUserStore } = require("./models/userModel");

const app = express();
const PORT = Number(process.env.PORT) || 5000;

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
app.use("/api/books",       bookRoutes);
app.use("/api/admin/books", adminBookRoutes);
app.use("/api", chapterRoutes);
app.use("/api/admin", adminChapterRoutes);
app.use("/api/progress", progressRoutes);
app.use("/api/progress", listeningProgressRoutes);
app.use("/api", audioRoutes);
app.use("/api/admin", adminAudioRoutes);

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