const mongoose = require("mongoose");

// ==================== REVIEW SCHEMA ====================

const reviewSchema = new mongoose.Schema(
  {
    // ------------------------------------------
    // PRODUCT
    // ------------------------------------------

    product: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Product",
      required: true,
      index: true,
    },

    // ------------------------------------------
    // USER / CUSTOMER
    // ------------------------------------------

    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },

    // ------------------------------------------
    // CUSTOMER NAME
    // ------------------------------------------

    name: {
      type: String,
      required: true,
      trim: true,
    },

    // ------------------------------------------
    // RATING
    // ------------------------------------------

    rating: {
      type: Number,
      required: true,
      min: 1,
      max: 5,
    },

    // ------------------------------------------
    // REVIEW COMMENT
    // ------------------------------------------

    comment: {
      type: String,
      required: true,
      trim: true,
      maxlength: 1000,
    },

    // ------------------------------------------
    // REVIEW DATE
    // ------------------------------------------

    date: {
      type: Date,
      default: Date.now,
    },

    // ------------------------------------------
    // VERIFIED PURCHASE
    // ------------------------------------------

    verifiedPurchase: {
      type: Boolean,
      default: false,
    },

    // ------------------------------------------
    // REVIEW APPROVAL
    // ------------------------------------------

    isApproved: {
      type: Boolean,
      default: true,
    },

    // ------------------------------------------
    // HELPFUL COUNT
    // ------------------------------------------

    helpfulCount: {
      type: Number,
      default: 0,
      min: 0,
    },

    // ------------------------------------------
    // ADMIN REPLY
    // ------------------------------------------

    adminReply: {
      type: String,
      default: null,
      trim: true,
    },
  },
  {
    timestamps: true,
  }
);


const Review = mongoose.model(
  "Review",
  reviewSchema
);

module.exports = Review;
