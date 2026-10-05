const mongoose = require("mongoose");

const connectDB = async () => {
  try {
    const connection = await mongoose.connect(process.env.MONGO_URI);

    console.log(`MongoDB connected: ${connection.connection.host}`);

    // Pre-load active WhatsApp production phone ID from MongoDB
    try {
      const { loadProductionPhoneIdFromDb } = require("../services/whatsappService");
      await loadProductionPhoneIdFromDb();
    } catch (e) {
      console.warn("⚠️ Could not pre-load WhatsApp config on DB connect:", e.message);
    }
  } catch (error) {
    console.error("MongoDB connection failed:", error.message);
    process.exit(1);
  }
};

module.exports = connectDB;