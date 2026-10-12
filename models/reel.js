const mongoose = require("mongoose");

const reelSchema = new mongoose.Schema(
  {
    filename: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      index: true,
    },
    url: {
      type: String,
      required: true,
      trim: true,
    },
    size: {
      type: Number,
      default: 0,
    },
    title: {
      type: String,
      default: "",
      trim: true,
    },
  },
  {
    timestamps: true,
  }
);

module.exports = mongoose.models.Reel || mongoose.model("Reel", reelSchema);
