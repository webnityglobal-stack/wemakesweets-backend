const mongoose = require("mongoose");
const generateShiprocketId = require("../utils/generateShiprocketId");

const collectionSchema = new mongoose.Schema(
  {
    shiprocketId: {
      type: Number,
      unique: true,
      index: true,
      default: generateShiprocketId,
    },
    name: {
      type: String,
      required: true,
      trim: true,
    },

    slug: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      lowercase: true,
    },

    description: {
      type: String,
      default: "",
      trim: true,
    },

    image: {
      type: String,
      default: "",
    },

    products: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Product",
      },
    ],
  },
  {
    timestamps: true,
  }
);

module.exports =
  mongoose.models.Collection ||
  mongoose.model(
    "Collection",
    collectionSchema
  );