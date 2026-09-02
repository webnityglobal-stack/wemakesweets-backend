const mongoose = require("mongoose");

const heroBannerSchema = new mongoose.Schema(
  {
    slot: {
      type: Number,
      required: true,
      unique: true,
      enum: [1, 2, 3],
    },

    image: {
      type: String,
      default: null,
    },

    isActive: {
      type: Boolean,
      default: true,
    },
  },
  {
    timestamps: true,
  }
);

module.exports = mongoose.model(
  "HeroBanner",
  heroBannerSchema
);