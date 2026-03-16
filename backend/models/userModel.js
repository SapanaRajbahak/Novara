const bcrypt = require("bcrypt");

// Simple in-memory store for demo purposes.
// Replace this with a real database model later.
const users = [];
let nextUserId = 1;
let isInitialized = false;

const demoAdminCredentials = {
  email: "admin@novara.com",
  password: "admin123",
};

async function initializeUserStore() {
  if (isInitialized) {
    return;
  }

  const existingAdmin = findUserByEmail(demoAdminCredentials.email);

  if (!existingAdmin) {
    const passwordHash = await bcrypt.hash(demoAdminCredentials.password, 10);

    users.push({
      id: String(nextUserId++),
      name: "Novara Admin",
      email: demoAdminCredentials.email.toLowerCase(),
      passwordHash,
      role: "ADMIN",
    });
  }

  isInitialized = true;
}

function createUser(user) {
  const newUser = {
    id: String(nextUserId++),
    name: user.name,
    email: user.email.toLowerCase(),
    passwordHash: user.passwordHash,
    role: user.role || "USER",
  };

  users.push(newUser);
  return newUser;
}

function findUserByEmail(email) {
  if (!email) {
    return undefined;
  }

  return users.find((user) => user.email === email.toLowerCase());
}

function findUserById(id) {
  return users.find((user) => user.id === String(id));
}

module.exports = {
  initializeUserStore,
  createUser,
  findUserByEmail,
  findUserById,
  demoAdminCredentials,
};