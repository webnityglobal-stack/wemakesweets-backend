const mongoose = require("mongoose");

const userSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
    },

    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
    },

    phone: {
      type: String,
      required: true,
      unique: true,
      trim: true,
    },

    password: {
      type: String,
      required: true,
      minlength: 6,
    },

    role: {
      type: String,
      enum: ["user", "admin","subadmin"],
      default: "user",
    },

    // SUB ADMIN PERMISSIONS
    permissions: {
      products: {
        type: Boolean,
        default: false,
      },

      orders: {
        type: Boolean,
        default: false,
      },

      coupons: {
        type: Boolean,
        default: false,
      },

      reels: {
        type: Boolean,
        default: false,
      },

      users: {
        type: Boolean,
        default: false,
      },
    },

    resetPasswordToken: {
      type: String,
      default: null,
    },

    resetPasswordExpire: {
      type: Date,
      default: null,
    },
  },
  {
    timestamps: true,
  }
);

const User = mongoose.model("User", userSchema);

module.exports = User;