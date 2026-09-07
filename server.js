require("dotenv").config();

console.log("FASTRR API KEY:", process.env.FASTRR_API_KEY ? "LOADED" : "MISSING");
console.log("FASTRR API SECRET:", process.env.FASTRR_API_SECRET ? "LOADED" : "MISSING");
console.log("FASTRR BASE URL:", process.env.FASTRR_BASE_URL);

const app = require("./app");
const connectDB = require("./config/db");

const PORT = process.env.PORT || 5000;

// Connect MongoDB
connectDB();

// Start Server
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});