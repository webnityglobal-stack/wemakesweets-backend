const express = require("express");

const router = express.Router();

const {
  createPayment,
  paymentSuccess,
  paymentFailed,
  fastrrWebhook,
  getPayment,
} = require("../controllers/paymentController");

const authMiddleware =
  require("../middleware/authMiddleware");

// =====================================================
// CREATE ONLINE PAYMENT
// =====================================================

router.post(
  "/create",
  authMiddleware,
  createPayment
);


// =====================================================
// PAYMENT SUCCESS
// =====================================================

router.post(
  "/success",
  authMiddleware,
  paymentSuccess
);


// =====================================================
// PAYMENT FAILED
// =====================================================

router.post(
  "/failed",
  authMiddleware,
  paymentFailed
);


// =====================================================
// FASTRR WEBHOOK
// =====================================================

// No authMiddleware here.
// FASTRR calls this endpoint.

router.post(
  "/fastrr/webhook",
  fastrrWebhook
);


// =====================================================
// GET PAYMENT
// =====================================================

router.get(
  "/:paymentId",
  authMiddleware,
  getPayment
);


module.exports = router;