const express = require("express");

const router = express.Router();

const {
  signup,
  login,
  forgotPassword,
  resetPassword,
} = require("../controllers/authController");

// Signup
router.post("/signup", signup);

// Login
router.post("/login", login);

router.post("/forgot-password", forgotPassword);

router.put("/reset-password/:token", resetPassword);

module.exports = router;