const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient();
p.$queryRaw`SELECT EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'FriendRequest')`
  .then(r => console.log('table exists check:', JSON.stringify(r)))
  .catch(e => console.log('ERR:', e.message))
  .finally(() => p.$disconnect());
