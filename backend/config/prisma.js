// backend/config/prisma.js
// Centralized Prisma client for the Novara backend

const { PrismaClient } = require('@prisma/client');

// Instantiate a single PrismaClient instance
const prisma = new PrismaClient();

module.exports = prisma;
