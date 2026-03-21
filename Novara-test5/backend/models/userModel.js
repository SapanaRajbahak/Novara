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
    avatarUrl: user.avatarUrl || "",
    role: user.role,
    isWriter: Boolean(user.isWriter),
    penName: user.penName || "",
    bio: user.bio || "",
    preferredGenres: Array.isArray(user.preferredGenres) ? user.preferredGenres : [],
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
      avatarUrl: null,
      role: "ADMIN",
      isWriter: false,
      penName: null,
      bio: null,
      preferredGenres: [],
    },
    create: {
      name: "Novara Admin",
      email: demoAdminCredentials.email.toLowerCase(),
      password: passwordHash,
      avatarUrl: null,
      role: "ADMIN",
      isWriter: false,
      penName: null,
      bio: null,
      preferredGenres: [],
    },
  });
}

async function createUser(user) {
  const createdUser = await prisma.user.create({
    data: {
      name: user.name,
      email: user.email.toLowerCase(),
      password: user.passwordHash,
      avatarUrl: user.avatarUrl || null,
      role: user.role || "USER",
      isWriter: Boolean(user.isWriter),
      penName: user.penName || null,
      bio: user.bio || null,
      preferredGenres: Array.isArray(user.preferredGenres) ? user.preferredGenres : [],
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

async function enableWriterAccess(userId, profile) {
  const updatedUser = await prisma.user.update({
    where: {
      id: String(userId),
    },
    data: {
      isWriter: true,
      penName: profile.penName,
      bio: profile.bio,
      preferredGenres: profile.preferredGenres,
    },
  });

  return mapUser(updatedUser);
}

module.exports = {
  initializeUserStore,
  createUser,
  findUserByEmail,
  findUserById,
  enableWriterAccess,
  demoAdminCredentials,
};