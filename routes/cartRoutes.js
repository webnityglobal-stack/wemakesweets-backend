const express = require("express");

const router = express.Router();

const {
  addToCart,
  getCart,
  updateCartQuantity,
  removeFromCart,
  clearCart,
} = require("../controllers/cartController");

const authMiddleware = require("../middleware/authMiddleware");

// Add product to cart
router.post(
  "/add",
  authMiddleware,
  addToCart
);

// Get current user's cart
router.get(
  "/",
  authMiddleware,
  getCart
);

// Update quantity
router.put(
  "/:itemId",
  authMiddleware,
  updateCartQuantity
);

// Remove item
router.delete(
  "/:itemId",
  authMiddleware,
  removeFromCart
);

// Clear cart
router.delete(
  "/",
  authMiddleware,
  clearCart
);

module.exports = router;