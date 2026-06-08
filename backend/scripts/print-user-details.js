// Script to print all users with a given email and their isVerified status
require('dotenv').config({ path: '../.env' });
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const email = 'admin@novara.com';
  const users = await prisma.user.findMany({ where: { email } });
  if (users.length === 0) {
    console.log('No users found with that email.');
    return;
  }
  users.forEach(user => {
    console.log(`ID: ${user.id} | Email: ${user.email} | isVerified: ${user.isVerified} | Role: ${user.role}`);
  });
}

main().catch(console.error).finally(() => prisma.$disconnect());
