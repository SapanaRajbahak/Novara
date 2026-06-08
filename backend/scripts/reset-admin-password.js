// Script to reset the admin password
require('dotenv').config({ path: '../.env' });
const bcrypt = require('bcrypt');
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const email = 'admin@novara.com';
  const newPassword = 'Novara123'; // Change this to your desired password
  const hash = await bcrypt.hash(newPassword, 12);

  const admin = await prisma.user.findUnique({ where: { email } });
  if (!admin) {
    console.log('Admin user not found.');
    return;
  }
  await prisma.user.update({
    where: { email },
    data: { password: hash },
  });
  console.log(`Admin password has been reset to: ${newPassword}`);
}

main().catch(console.error).finally(() => prisma.$disconnect());
