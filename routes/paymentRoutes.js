const express = require("express");

const router = express.Router();

const {
  createPayment,
  paymentSuccess,
  verifyPayment,
  paymentFailed,
  fastrrWebhook,
  getPayment,
  getCheckoutAddress,
} = require("../controllers/paymentController");

const optionalAuthMiddleware = require("../middleware/optionalAuthMiddleware");

// =====================================================
// CREATE ONLINE PAYMENT (Logged-in & Guest)
//
// POST /api/payment/create
// =====================================================

router.post(
  "/create",
  optionalAuthMiddleware,
  createPayment
);

// =====================================================
// PAYMENT SUCCESS / GET STATUS (Logged-in & Guest)
//
// POST /api/payment/success
// =====================================================

router.post(
  "/success",
  optionalAuthMiddleware,
  paymentSuccess
);

// =====================================================
// VERIFY PAYMENT & SYNC FASTRR ORDER (Logged-in & Guest)
//
// POST /api/payment/verify
// =====================================================

router.post(
  "/verify",
  optionalAuthMiddleware,
  verifyPayment
);

// =====================================================
// PAYMENT FAILED / CANCEL (Logged-in & Guest)
//
// POST /api/payment/failed
// POST /api/payment/cancel
// =====================================================

router.post(
  "/failed",
  optionalAuthMiddleware,
  paymentFailed
);

router.post(
  "/cancel",
  optionalAuthMiddleware,
  paymentFailed
);

// =====================================================
// FASTRR WEBHOOK
//
// POST /api/payment/fastrr/webhook
//
// NO AUTH MIDDLEWARE
// FastRR directly calls this endpoint.
// =====================================================

router.post(
  "/fastrr/webhook",
  fastrrWebhook
);

// =====================================================
// GET FASTRR CHECKOUT DETAILS (Logged-in & Guest)
//
// GET /api/payment/checkout-address/:orderId
// =====================================================

router.get(
  "/checkout-address/:orderId",
  optionalAuthMiddleware,
  getCheckoutAddress
);

// =====================================================
// GET PAYMENT (Logged-in & Guest)
//
// GET /api/payment/:paymentId
// =====================================================

router.get(
  "/:paymentId",
  optionalAuthMiddleware,
  getPayment
);

module.exports = router;
