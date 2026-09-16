const express = require("express");

const router = express.Router();

const {
  signup,
  login,
  forgotPassword,
  verifyResetOTP,
  resetPassword,
} = require("../controllers/authController");

// Signup
router.post("/signup", signup);

// Login
router.post("/login", login);

// Forgot Password - Send OTP
router.post("/forgot-password", forgotPassword);

// Verify OTP
router.post("/verify-reset-otp", verifyResetOTP);

// Reset Password
router.put("/reset-password", resetPassword);

module.exports = router;