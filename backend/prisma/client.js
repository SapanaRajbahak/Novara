/**
 * Prisma client singleton.
 * Re-exports the shared instance from config/db.js so the entire
 * app uses one database connection pool.
 */
const { prisma } = require("../config/db");

module.exports = prisma;
