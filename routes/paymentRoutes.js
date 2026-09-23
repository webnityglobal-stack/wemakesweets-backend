const express = require("express");

const router = express.Router();

const {
  createPayment,
  paymentSuccess,
  paymentFailed,
  fastrrWebhook,
  getPayment,
  getCheckoutAddress,
} = require("../controllers/paymentController");

const authMiddleware =
  require("../middleware/authMiddleware");


// =====================================================
// CREATE ONLINE PAYMENT
//
// POST /api/payment/create
// =====================================================

router.post(
  "/create",
  authMiddleware,
  createPayment
);


// =====================================================
// PAYMENT SUCCESS / GET STATUS
//
// POST /api/payment/success
// =====================================================

router.post(
  "/success",
  authMiddleware,
  paymentSuccess
);


// =====================================================
// PAYMENT FAILED
//
// POST /api/payment/failed
// =====================================================

router.post(
  "/failed",
  authMiddleware,
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
// GET FASTRR CHECKOUT DETAILS
//
// GET /api/payment/checkout-address/:orderId
//
// IMPORTANT:
// This must come BEFORE /:paymentId
// =====================================================

router.get(
  "/checkout-address/:orderId",
  authMiddleware,
  getCheckoutAddress
);


// =====================================================
// GET PAYMENT
//
// GET /api/payment/:paymentId
// =====================================================

router.get(
  "/:paymentId",
  authMiddleware,
  getPayment
);


module.exports = router;