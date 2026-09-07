const express = require("express");

const router = express.Router();

const authMiddleware = require("../middleware/authMiddleware");

const {
  addToWishlist,
  removeFromWishlist,
  getWishlist,
  checkWishlist,
  toggleWishlist,
} = require("../controllers/wishlistController");


// Get user's wishlist
router.get(
  "/",
  authMiddleware,
  getWishlist
);


// Add product to wishlist
router.post(
  "/add/:productId",
  authMiddleware,
  addToWishlist
);


// Remove product from wishlist
router.delete(
  "/remove/:productId",
  authMiddleware,
  removeFromWishlist
);


// Check if product is wishlisted
router.get(
  "/check/:productId",
  authMiddleware,
  checkWishlist
);


// Toggle wishlist
router.post(
  "/toggle/:productId",
  authMiddleware,
  toggleWishlist
);


module.exports = router;