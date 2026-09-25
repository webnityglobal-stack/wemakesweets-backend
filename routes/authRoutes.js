const express = require("express");

const router = express.Router();

const {
  signup,
  login,
  forgotPassword,
  verifyResetOTP,
  resetPassword,
  sendWhatsAppLoginOTP,
  verifyWhatsAppLoginOTP,
} = require("../controllers/authController");

// Signup
router.post("/signup", signup);

// Login (Password)
router.post("/login", login);

// OTP Login (Dual WhatsApp + Email)
router.post("/send-login-otp", sendWhatsAppLoginOTP);
router.post("/verify-login-otp", verifyWhatsAppLoginOTP);
router.post("/whatsapp/send-otp", sendWhatsAppLoginOTP);
router.post("/whatsapp/verify-otp", verifyWhatsAppLoginOTP);

// Forgot Password - Send OTP
router.post("/forgot-password", forgotPassword);

// Verify OTP
router.post("/verify-reset-otp", verifyResetOTP);

// Reset Password (supports both PUT and POST)
router.put("/reset-password", resetPassword);
router.post("/reset-password", resetPassword);

module.exports = router;