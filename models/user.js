const mongoose = require("mongoose");

const userSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      trim: true,
    },

    fullName: {
      type: String,
      trim: true,
    },

    employeeId: {
      type: String,
      trim: true,
      sparse: true,
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
      trim: true,
      sparse: true,
    },

    mobile: {
      type: String,
      trim: true,
      sparse: true,
    },

    password: {
      type: String,
      required: true,
      minlength: 6,
    },

    state: {
      type: String,
      trim: true,
      default: "",
    },

    district: {
      type: String,
      trim: true,
      default: "",
    },

    role: {
      type: String,
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
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
);

// Virtual getters to ensure name and phone always resolve cleanly
userSchema.virtual("displayName").get(function () {
  return this.name || this.fullName || "";
});

userSchema.pre("save", function (next) {
  if (!this.name && this.fullName) {
    this.name = this.fullName;
  }
  if (!this.fullName && this.name) {
    this.fullName = this.name;
  }
  if (!this.phone && this.mobile) {
    this.phone = this.mobile;
  }
  if (!this.mobile && this.phone) {
    this.mobile = this.phone;
  }
  next();
});

module.exports =
  mongoose.models.User ||
  mongoose.model("User", userSchema);