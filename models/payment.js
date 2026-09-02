const mongoose = require("mongoose");

// =====================================================
// PAYMENT SCHEMA
// =====================================================

const paymentSchema = new mongoose.Schema(
  {
    // =================================================
    // ORDER REFERENCE
    // =================================================

    order: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Order",
      required: true,
      index: true,
    },

    // Your own order ID
    // Example: WMS-1756440000000
    orderId: {
      type: String,
      required: true,
      index: true,
    },


    // =================================================
    // USER REFERENCE
    // =================================================

    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },


    // =================================================
    // PAYMENT AMOUNT
    // =================================================

    amount: {
      type: Number,
      required: true,
      min: 0,
    },

    currency: {
      type: String,
      default: "INR",
      uppercase: true,
    },


    // =================================================
    // PAYMENT METHOD
    // =================================================

    paymentMethod: {
      type: String,
      enum: [
        "ONLINE",
        "COD",
      ],
      required: true,
    },


    // =================================================
    // PAYMENT GATEWAY
    // =================================================

    gateway: {
      type: String,
      enum: [
        "FASTRR",
        "COD",
      ],
      required: true,
    },


    // =================================================
    // PAYMENT STATUS
    // =================================================

    status: {
      type: String,
      enum: [
        "PENDING",
        "PROCESSING",
        "PAID",
        "FAILED",
        "REFUNDED",
      ],
      default: "PENDING",
      index: true,
    },


    // =================================================
    // FASTRR PAYMENT ID
    // =================================================

    paymentId: {
      type: String,
      default: null,
      index: true,
    },


    // =================================================
    // FASTRR TRANSACTION ID
    // =================================================

    transactionId: {
      type: String,
      default: null,
      index: true,
    },


    // =================================================
    // FASTRR / GATEWAY ORDER ID
    // =================================================

    gatewayOrderId: {
      type: String,
      default: null,
      index: true,
    },


    // =================================================
    // PAYMENT FAILURE REASON
    // =================================================

    failureReason: {
      type: String,
      default: null,
    },


    // =================================================
    // PAYMENT RESPONSE
    // =================================================

    gatewayResponse: {
      type: mongoose.Schema.Types.Mixed,
      default: null,
    },


    // =================================================
    // PAID DATE
    // =================================================

    paidAt: {
      type: Date,
      default: null,
    },


    // =================================================
    // REFUND INFORMATION
    // =================================================

    refundId: {
      type: String,
      default: null,
    },

    refundedAt: {
      type: Date,
      default: null,
    },
  },
  {
    timestamps: true,
  }
);


// =====================================================
// PREVENT OVERWRITE MODEL ERROR
// =====================================================

module.exports =
  mongoose.models.Payment ||
  mongoose.model("Payment", paymentSchema);