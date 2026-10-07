const mongoose = require("mongoose");

// =====================================================
// ORDER ITEM SCHEMA
// =====================================================

const orderItemSchema = new mongoose.Schema(
  {
    product: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Product",
      required: true,
    },

    variantId: {
      type: mongoose.Schema.Types.ObjectId,
      default: null,
    },

    name: {
      type: String,
      required: true,
      trim: true,
    },

    sku: {
      type: String,
      required: true,
      trim: true,
    },

    quantity: {
      type: Number,
      required: true,
      min: 1,
    },

    price: {
      type: Number,
      required: true,
      min: 0,
    },

    total: {
      type: Number,
      required: true,
      min: 0,
    },
    weight: {
      type: Number,
      required: true,
      min: 0,
    },

    length: {
      type: Number,
      required: true,
      min: 0,
    },

    breadth: {
      type: Number,
      required: true,
      min: 0,
    },

    height: {
      type: Number,
      required: true,
      min: 0,
    },
  },
  {
    _id: false,
  }
);

// =====================================================
// SHIPPING ADDRESS SCHEMA
// =====================================================

const shippingAddressSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
    },

    phone: {
      type: String,
      required: true,
      trim: true,
    },

    email: {
      type: String,
      default: "",
      trim: true,
    },

    address: {
      type: String,
      required: true,
      trim: true,
    },

    address2: {
      type: String,
      default: "",
      trim: true,
    },

    city: {
      type: String,
      required: true,
      trim: true,
    },

    state: {
      type: String,
      required: true,
      trim: true,
    },

    pincode: {
      type: String,
      required: true,
      trim: true,
    },

    country: {
      type: String,
      default: "India",
      trim: true,
    },
  },
  {
    _id: false,
  }
);

// =====================================================
// SHIPROCKET SCHEMA
// =====================================================

const shiprocketSchema = new mongoose.Schema(
  {
    orderId: {
      type: String,
      default: null,
    },

    shipmentId: {
      type: String,
      default: null,
    },

    awbCode: {
      type: String,
      default: null,
    },

    courierName: {
      type: String,
      default: null,
    },

    courierId: {
      type: String,
      default: null,
    },

    status: {
      type: String,
      default: null,
    },

    trackingUrl: {
      type: String,
      default: null,
    },

    pickupScheduled: {
      type: Boolean,
      default: false,
    },

    pickupDate: {
      type: Date,
      default: null,
    },

    rtoStatus: {
      type: String,
      default: null,
    },

    rtoReason: {
      type: String,
      default: null,
    },

    rtoDate: {
      type: Date,
      default: null,
    },

    createdAt: {
      type: Date,
      default: null,
    },

    updatedAt: {
      type: Date,
      default: null,
    },
  },
  {
    _id: false,
  }
);

// =====================================================
// MAIN ORDER SCHEMA
// =====================================================

const orderSchema = new mongoose.Schema(
  {
    // =================================================
    // USER
    // =================================================

    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },

    // =================================================
    // ORDER ID
    // =================================================

    orderId: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },

    // =================================================
    // ORDER ITEMS
    // =================================================

    items: {
      type: [orderItemSchema],
      required: true,

      validate: {
        validator: function (items) {
          return items.length > 0;
        },

        message:
          "Order must contain at least one item",
      },
    },

    // =================================================
    // SUBTOTAL & SHIPPING CHARGE
    // =================================================

    subtotal: {
      type: Number,
      default: 0,
      min: 0,
    },

    shippingCharge: {
      type: Number,
      default: 0,
      min: 0,
    },

    // =================================================
    // TOTAL AMOUNT
    // =================================================

    totalAmount: {
      type: Number,
      required: true,
      min: 0,
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
    // PAYMENT STATUS
    // =================================================

    paymentStatus: {
      type: String,

      enum: [
        "PENDING",
        "PROCESSING",
        "PAID",
        "FAILED",
        "REFUNDED",
      ],

      default: "PENDING",
    },

    // =================================================
    // PAYMENT REFERENCE
    // =================================================

    paymentId: {
      type: mongoose.Schema.Types.ObjectId,

      ref: "Payment",

      default: null,
    },

    // =================================================
    // ORDER STATUS
    // =================================================

    orderStatus: {
      type: String,

      enum: [
        "PENDING",
        "CONFIRMED",
        "PROCESSING",
        "PACKED",
        "SHIPPED",
        "OUT_FOR_DELIVERY",
        "DELIVERED",
        "CANCELLED",
      ],

      default: "PENDING",
    },

    // =================================================
    // SHIPPING ADDRESS
    // =================================================
    //
    // IMPORTANT:
    // Address FastRR Checkout se aayega.
    // Webhook ke baad ye field populate hogi.
    //
    // =================================================

    shippingAddress: {
      type: shippingAddressSchema,

      required: false,

      default: null,
    },

    // =================================================
    // CANCELLATION
    // =================================================

    cancellationReason: {
      type: String,

      default: null,

      trim: true,
    },

    cancelledAt: {
      type: Date,

      default: null,
    },

    // =================================================
    // SHIPROCKET INFORMATION
    // =================================================

    shiprocket: {
      type: shiprocketSchema,

      default: () => ({}),
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
  mongoose.models.Order ||
  mongoose.model(
    "Order",
    orderSchema
  );