// scripts/syncFastrrCatalog.js
require("dotenv").config();
const mongoose = require("mongoose");
const { syncProductToFastRR } = require("../services/fastrrService");
const Product = require("../models/product");

const syncAllProducts = async () => {
  try {
    const mongoUri =
      process.env.MONGO_URI ||
      "mongodb+srv://webnityglobal_db_user:Test%401234@cluster0.eotvftq.mongodb.net/?appName=Cluster0";

    await mongoose.connect(mongoUri);
    console.log("Connected to MongoDB Atlas");

    const products = await Product.find({});
    console.log(`Found ${products.length} products to sync to FastRR Checkout`);

    for (const product of products) {
      console.log(`Syncing "${product.name}" (Shiprocket ID: ${product.shiprocketId})...`);
      const res = await syncProductToFastRR(product);
      console.log(`Result:`, res || "Done");
    }

    console.log("All products successfully synced to FastRR Checkout!");
    process.exit(0);
  } catch (error) {
    console.error("FastRR Catalog Sync Error:", error);
    process.exit(1);
  }
};

syncAllProducts();
