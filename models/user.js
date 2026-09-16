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
      enum: ["user", "admin", "subadmin"],
      default: "user",
    },

    resetPasswordOTP: {
      type: String,
      default: null,
    },

    resetPasswordOTPExpire: {
      type: Date,
      default: null,
    },

    resetPasswordVerified: {
      type: Boolean,
      default: false,
    },

    loginOTP: {
      type: String,
      default: null,
    },

    loginOTPExpire: {
      type: Date,
      default: null,
    },
  },
  {
    timestamps: true,
  }
);

module.exports =
  mongoose.models.User ||
  mongoose.model("User", userSchema);