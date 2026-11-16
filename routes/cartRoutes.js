const express = require("express");

const router = express.Router();

const {
  addToCart,
  getCart,
  updateCartQuantity,
  removeFromCart,
  clearCart,
  mergeCart,
} = require("../controllers/cartController");

const optionalAuthMiddleware = require("../middleware/optionalAuthMiddleware");

// Add product to cart (Logged-in or Guest)
router.post(
  "/add",
  optionalAuthMiddleware,
  addToCart
);

// Get cart (Logged-in or Guest)
router.get(
  "/",
  optionalAuthMiddleware,
  getCart
);

// Update quantity (Logged-in or Guest)
router.put(
  "/:itemId",
  optionalAuthMiddleware,
  updateCartQuantity
);

// Remove item (Logged-in or Guest)
router.delete(
  "/:itemId",
  optionalAuthMiddleware,
  removeFromCart
);

// Clear cart (Logged-in or Guest)
router.delete(
  "/",
  optionalAuthMiddleware,
  clearCart
);

// Merge guest cart into user cart (When user logs in)
router.post(
  "/merge",
  optionalAuthMiddleware,
  mergeCart
);

module.exports = router;
