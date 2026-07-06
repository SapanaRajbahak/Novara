#!/usr/bin/env node

/**
 * Setup Script for PDF Import System
 * Creates necessary directories and runs database migration
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

console.log('=== PDF Import System Setup ===\n');

// Create upload directories
const directories = [
  'uploads',
  'uploads/pdfs'
];

console.log('Creating upload directories...');
directories.forEach(dir => {
  const fullPath = path.join(__dirname, '..', dir);
  if (!fs.existsSync(fullPath)) {
    fs.mkdirSync(fullPath, { recursive: true });
    console.log(`✓ Created: ${dir}`);
  } else {
    console.log(`✓ Already exists: ${dir}`);
  }
});

console.log('\nChecking dependencies...');

// Check if pdfjs-dist is installed
try {
  require.resolve('pdfjs-dist');
  console.log('✓ pdfjs-dist is installed');
} catch (e) {
  console.log('✗ pdfjs-dist is NOT installed');
  console.log('\nPlease run: npm install pdfjs-dist');
  process.exit(1);
}

// Check if multer is installed
try {
  require.resolve('multer');
  console.log('✓ multer is installed');
} catch (e) {
  console.log('✗ multer is NOT installed');
  console.log('\nPlease run: npm install multer');
  process.exit(1);
}

console.log('\n=== Setup Complete ===\n');
console.log('Next steps:');
console.log('1. Run database migration:');
console.log('   npx prisma migrate dev --name add-continuous-reading-mode');
console.log('\n2. Generate Prisma client:');
console.log('   npx prisma generate');
console.log('\n3. Start the server and test PDF upload');
console.log('\nSee backend/docs/PDF_IMPORT_MIGRATION_GUIDE.md for full documentation.');
