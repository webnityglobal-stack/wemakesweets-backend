const express = require("express");

const router = express.Router();

const optionalAuthMiddleware = require("../middleware/optionalAuthMiddleware");

const {
  signup,
  login,
  forgotPassword,
  verifyResetOTP,
  resetPassword,
  sendLoginOTP,
  verifyLoginOTP,
  resendLoginOTP,
} = require("../controllers/authController");

// =====================================================
// CUSTOMER MOBILE OTP LOGIN (MSG91)
// Direct mobile number -> OTP -> auto-login / auto-account
// =====================================================

router.post("/send-otp", optionalAuthMiddleware, sendLoginOTP);
router.post("/verify-otp", optionalAuthMiddleware, verifyLoginOTP);
router.post("/resend-otp", optionalAuthMiddleware, resendLoginOTP);

// Aliases for frontend compatibility
router.post("/send-login-otp", optionalAuthMiddleware, sendLoginOTP);
router.post("/verify-login-otp", optionalAuthMiddleware, verifyLoginOTP);
router.post("/resend-login-otp", optionalAuthMiddleware, resendLoginOTP);
router.post("/otp/send", optionalAuthMiddleware, sendLoginOTP);
router.post("/otp/verify", optionalAuthMiddleware, verifyLoginOTP);
router.post("/otp/resend", optionalAuthMiddleware, resendLoginOTP);
router.post("/whatsapp/send-otp", optionalAuthMiddleware, sendLoginOTP);
router.post("/whatsapp/verify-otp", optionalAuthMiddleware, verifyLoginOTP);

// =====================================================
// ADMIN / SUBADMIN PASSWORD LOGIN & LEGACY ROUTES
// =====================================================

router.post("/admin-login", login);
router.post("/login", optionalAuthMiddleware, login);
router.post("/signup", signup);

// Forgot Password - Send OTP (Admin / Subadmin recovery)
router.post("/forgot-password", forgotPassword);

// Verify Reset OTP
router.post("/verify-reset-otp", verifyResetOTP);

// Reset Password (supports both PUT and POST)
router.put("/reset-password", resetPassword);
router.post("/reset-password", resetPassword);

module.exports = router;
