const { PrismaClient } = require("@prisma/client");

const prisma = new PrismaClient();

async function connectDatabase() {
  await prisma.$connect();
  console.log("Connected to PostgreSQL with Prisma.");
}

module.exports = {
  prisma,
  connectDatabase,
};