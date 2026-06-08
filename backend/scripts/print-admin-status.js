// Script to print all admin users and their isVerified status
require('dotenv').config({ path: '../.env' });
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const admins = await prisma.user.findMany({ where: { role: 'ADMIN' } });
  if (admins.length === 0) {
    console.log('No admin users found.');
    return;
  }
  admins.forEach(admin => {
    console.log(`Email: ${admin.email} | isVerified: ${admin.isVerified}`);
  });
}

main().catch(console.error).finally(() => prisma.$disconnect());
