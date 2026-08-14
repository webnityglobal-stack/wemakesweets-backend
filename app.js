const express = require("express");

const app = express();

// Middleware
app.use(express.json());

// Test route
app.get("/", (req, res) => {
  res.send("We Make Sweets Backend is running!");
});

// Auth routes
app.use("/api/auth", require("./routes/authRoutes"));

module.exports = app;

