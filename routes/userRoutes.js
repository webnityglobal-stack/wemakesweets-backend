const express = require("express");

const {
  getAllUsers,
} = require("../controllers/userController");

const authMiddleware = require("../middleware/authMiddleware");
const adminMiddleware = require("../middleware/adminMiddleware");

const router = express.Router();

// ==========================================
// ADMIN - GET ALL USERS
// ==========================================

router.get(
  "/all",
  authMiddleware,
  adminMiddleware,
  getAllUsers
);

module.exports = router;