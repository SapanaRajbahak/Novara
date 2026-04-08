// Delete all users except admins using Prisma
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const deleted = await prisma.user.deleteMany({
    where: {
      NOT: { role: 'ADMIN' }
    }
  });
  console.log(`Deleted ${deleted.count} non-admin users.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
