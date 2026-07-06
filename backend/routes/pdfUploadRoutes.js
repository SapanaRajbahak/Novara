/**
 * PDF Upload Routes
 * Routes for uploading and processing PDF books
 */

const express = require('express');
const multer = require('multer');
const path = require('path');
const { uploadPDF } = require('../controllers/pdfUploadController');
const { requireAuth, requireAdmin } = require('../middleware/auth');

const router = express.Router();

// Configure multer for PDF uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, 'uploads/pdfs/');
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, 'book-' + uniqueSuffix + path.extname(file.originalname));
  }
});

const fileFilter = (req, file, cb) => {
  if (file.mimetype === 'application/pdf') {
    cb(null, true);
  } else {
    cb(new Error('Only PDF files are allowed'), false);
  }
};

const upload = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: 50 * 1024 * 1024 // 50MB limit
  }
});

// POST /api/admin/books/upload-pdf
router.post(
  '/upload-pdf',
  requireAuth,
  requireAdmin,
  upload.single('pdf'),
  uploadPDF
);

module.exports = router;
