require("dotenv").config();

console.log("FASTRR API KEY:", process.env.FASTRR_API_KEY ? "LOADED" : "MISSING");
console.log("FASTRR API SECRET:", process.env.FASTRR_API_SECRET ? "LOADED" : "MISSING");
console.log("FASTRR BASE URL:", process.env.FASTRR_BASE_URL);
console.log("WHATSAPP API VERSION:", process.env.WHATSAPP_API_VERSION || "v21.0");
console.log("WHATSAPP PHONE ID:", process.env.WHATSAPP_PHONE_NUMBER_ID);
console.log("FRONTEND URL:", process.env.FRONTEND_URL);
console.log("WHATSAPP TOKEN PREFIX:", process.env.WHATSAPP_ACCESS_TOKEN ? process.env.WHATSAPP_ACCESS_TOKEN.slice(0, 15) + "..." : "MISSING");

const app = require("./app");
const connectDB = require("./config/db");

const PORT = process.env.PORT || 5000;

// Connect MongoDB
connectDB();

// Start Server
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});