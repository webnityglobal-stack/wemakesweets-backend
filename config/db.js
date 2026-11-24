const mongoose = require("mongoose");

const connectDB = async () => {
  try {
    const connection = await mongoose.connect(process.env.MONGO_URI);

    console.log(`MongoDB connected: ${connection.connection.host}`);
console.log("Database Name:", connection.connection.name);
console.log("Database Host:", connection.connection.host);
    // Pre-load active WhatsApp production phone ID from MongoDB
    try {
      const { loadProductionPhoneIdFromDb } = require("../services/whatsappService");
      await loadProductionPhoneIdFromDb();
    } catch (e) {
      console.warn("⚠️ Could not pre-load WhatsApp config on DB connect:", e.message);
    }

    // Safely sync Cart indexes to allow guest carts (sparse user index)
    try {
      const cartsCollection = mongoose.connection.collection("carts");
      const indexes = await cartsCollection.indexes();
      const userIndex = indexes.find((idx) => idx.name === "user_1");
      if (userIndex && userIndex.unique && !userIndex.sparse) {
        console.log("Dropping non-sparse user_1 index on carts collection to support guest carts...");
        await cartsCollection.dropIndex("user_1");
        console.log("Dropped non-sparse user_1 index successfully.");
      }
    } catch (idxErr) {
      // Index drop error ignored if not exists
    }

    // Safely sync User email index to be sparse so mobile-OTP users without email don't collide
    try {
      const usersCollection = mongoose.connection.collection("users");
      const userIndexes = await usersCollection.indexes();
      const emailIndex = userIndexes.find((idx) => idx.name === "email_1");
      if (emailIndex && emailIndex.unique && !emailIndex.sparse) {
        console.log("Dropping non-sparse email_1 index on users collection to support mobile-OTP users...");
        await usersCollection.dropIndex("email_1");
        await usersCollection.createIndex({ email: 1 }, { unique: true, sparse: true });
        console.log("Recreated sparse unique email_1 index on users collection.");
      }
    } catch (idxErr) {
      console.warn("⚠️ Could not sync users email_1 index:", idxErr.message);
    }
  } catch (error) {
    console.error("MongoDB connection failed:", error.message);
    process.exit(1);
  }
};

module.exports = connectDB;
