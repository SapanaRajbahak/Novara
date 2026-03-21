const express = require("express");
const { requireAdmin } = require("../middleware/auth");
const {
  getAdminUsers,
  getAdminUserById,
  patchAdminUser,
  deleteAdminUser,
} = require("../controllers/adminUserController");

const router = express.Router();

router.use(requireAdmin);
router.get("/users", getAdminUsers);
router.get("/users/:id", getAdminUserById);
router.patch("/users/:id", patchAdminUser);
router.delete("/users/:id", deleteAdminUser);

module.exports = router;
