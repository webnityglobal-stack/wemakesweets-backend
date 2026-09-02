const express = require("express");

const {
  addReview,
  getProductReviews,
  getReviewById,
  updateReview,
  deleteReview,
} = require("../controllers/reviewController");

const authMiddleware = require("../middleware/authMiddleware");

const router = express.Router();


// ==================================================
// ADD REVIEW
// ==================================================
// Logged-in user can add review to any product

router.post(
  "/add",
  authMiddleware,
  addReview
);


// ==================================================
// GET ALL REVIEWS OF A PRODUCT
// ==================================================
// Public API

router.get(
  "/product/:productId",
  getProductReviews
);


// ==================================================
// GET SINGLE REVIEW
// ==================================================
// Public API

router.get(
  "/:id",
  getReviewById
);


// ==================================================
// UPDATE OWN REVIEW
// ==================================================
// Only the user who created the review can update it

router.put(
  "/update/:id",
  authMiddleware,
  updateReview
);


// ==================================================
// DELETE OWN REVIEW
// ==================================================
// Only the user who created the review can delete it

router.delete(
  "/delete/:id",
  authMiddleware,
  deleteReview
);


module.exports = router;