// Script to set isVerified=true for the admin user
require('dotenv').config({ path: '../.env' });
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const email = 'admin@novara.com';
  const admin = await prisma.user.findUnique({ where: { email } });
  if (!admin) {
    console.log('Admin user not found.');
    return;
  }
  if (admin.isVerified) {
    console.log('Admin is already verified.');
    return;
  }
  await prisma.user.update({
    where: { email },
    data: { isVerified: true },
  });
  console.log('Admin user is now verified.');
}

main().catch(console.error).finally(() => prisma.$disconnect());
