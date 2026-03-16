const bcrypt = require("bcrypt");
const { prisma } = require("../config/db");

const demoAdminCredentials = {
  email: "admin@novara.com",
  password: "admin123",
};

function mapUser(user) {
  if (!user) {
    return undefined;
  }

  return {
    id: user.id,
    name: user.name,
    email: user.email,
    passwordHash: user.password,
    role: user.role,
  };
}

async function initializeUserStore() {
  const passwordHash = await bcrypt.hash(demoAdminCredentials.password, 10);

  await prisma.user.upsert({
    where: {
      email: demoAdminCredentials.email.toLowerCase(),
    },
    update: {
      name: "Novara Admin",
      password: passwordHash,
      role: "ADMIN",
    },
    create: {
      name: "Novara Admin",
      email: demoAdminCredentials.email.toLowerCase(),
      password: passwordHash,
      role: "ADMIN",
    },
  });
}

async function createUser(user) {
  const createdUser = await prisma.user.create({
    data: {
      name: user.name,
      email: user.email.toLowerCase(),
      password: user.passwordHash,
      role: user.role || "USER",
    },
  });

  return mapUser(createdUser);
}

async function findUserByEmail(email) {
  if (!email) {
    return undefined;
  }

  const user = await prisma.user.findUnique({
    where: {
      email: email.toLowerCase(),
    },
  });

  return mapUser(user);
}

async function findUserById(id) {
  const user = await prisma.user.findUnique({
    where: {
      id: String(id),
    },
  });

  return mapUser(user);
}

module.exports = {
  initializeUserStore,
  createUser,
  findUserByEmail,
  findUserById,
  demoAdminCredentials,
};