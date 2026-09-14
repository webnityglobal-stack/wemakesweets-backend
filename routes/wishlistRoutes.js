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


// Add product variant
router.post(
  "/add/:productId",
  authMiddleware,
  addToWishlist
);


// Remove product variant
router.delete(
  "/remove/:productId",
  authMiddleware,
  removeFromWishlist
);


// Check product variant
router.get(
  "/check/:productId",
  authMiddleware,
  checkWishlist
);


// Toggle product variant
router.post(
  "/toggle/:productId",
  authMiddleware,
  toggleWishlist
);


module.exports = router;