require("dotenv").config();
const mongoose = require("mongoose");
const Product = require("../models/product");

// Apna actual MongoDB connection string use karo
const MONGO_URI = process.env.MONGO_URI;

const assignShiprocketIds = async () => {
  try {
    if (!MONGO_URI) {
      throw new Error("MONGO_URI is not defined in .env");
    }

    await mongoose.connect(MONGO_URI);

    console.log("MongoDB connected");

    const products = await Product.find({});

    console.log(`Found ${products.length} products`);

    // Product IDs start
    let productId = 1000000001;

    // Variant IDs start
    let variantId = 2000000001;

    for (const product of products) {
      // -----------------------------------
      // PRODUCT SHIPROCKET ID
      // -----------------------------------

      if (!product.shiprocketId) {
        product.shiprocketId = productId;

        console.log(
          `Product: ${product.name} → ${product.shiprocketId}`
        );

        productId++;
      }

      // -----------------------------------
      // VARIANT SHIPROCKET IDS
      // -----------------------------------

      for (const variant of product.variants || []) {
        if (!variant.shiprocketId) {
          variant.shiprocketId = variantId;

          console.log(
            `Variant: ${variant.title} → ${variant.shiprocketId}`
          );

          variantId++;
        }
      }

      await product.save();
    }

    console.log("\n================================");
    console.log("Shiprocket IDs assigned successfully");
    console.log("================================\n");

    process.exit(0);
  } catch (error) {
    console.error("Error assigning Shiprocket IDs:", error);
    process.exit(1);
  }
};

assignShiprocketIds();