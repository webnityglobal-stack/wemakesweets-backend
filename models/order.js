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
    // Shiprocket order ID
    orderId: {
      type: String,
      default: null,
    },

    // Shiprocket shipment ID
    shipmentId: {
      type: String,
      default: null,
    },

    // AWB number
    awbCode: {
      type: String,
      default: null,
    },

    // Courier name
    courierName: {
      type: String,
      default: null,
    },

    // Courier ID
    courierId: {
      type: String,
      default: null,
    },

    // Shiprocket shipment status
    status: {
      type: String,
      default: null,
    },

    // Tracking URL
    trackingUrl: {
      type: String,
      default: null,
    },

    // Pickup information
    pickupScheduled: {
      type: Boolean,
      default: false,
    },

    pickupDate: {
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
      enum: ["ONLINE", "COD"],
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
        "SHIPPED",
        "DELIVERED",
        "CANCELLED",
      ],
      default: "PENDING",
    },


    // =================================================
    // SHIPPING ADDRESS
    // =================================================

    shippingAddress: {
      type: shippingAddressSchema,
      required: true,
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
  mongoose.model.Order ||
  mongoose.model("Order", orderSchema);