const express = require("express");
const errorMiddleware = require("./middleware/errorMiddleware");
const path = require("path");
const app = express();

// Middleware
app.use(express.json());

// Uploaded files
app.use(
  "/uploads",express.static(path.join(__dirname, "uploads"))
);

//Reels routes
// Reels
app.use(
  "/api/reels",
  require("./routes/reelRoutes")
);


// Test route
app.get("/", (req, res) => {
  res.send("We Make Sweets Backend is running!");
});

// Auth routes
app.use("/api/auth", require("./routes/authRoutes"));

// Product Routes
app.use("/api/products", require("./routes/productRoutes"));


// Cart routes
app.use(
  "/api/cart",
  require("./routes/cartRoutes")
);

// Order routes
app.use("/api/orders", require("./routes/orderRoutes"));

//payment routes
app.use("/api/payment",  require("./routes/paymentRoutes"));

// Shiprocket routes
app.use("/api/shiprocket", require("./routes/shiprocketRoutes"));

// Review routes
app.use("/api/reviews", require("./routes/reviewRoutes"));

// Hero Banner routes
app.use("/api/hero-banner", require("./routes/heroBannerRoutes"));

// User routes
app.use("/api/users", require("./routes/userRoutes"));

// Admin routes
app.use("/api/admin", require("./routes/adminRoutes"));

// Error Middleware
app.use(errorMiddleware);

module.exports = app;

