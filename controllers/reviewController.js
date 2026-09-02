const Review = require("../models/Review");
const Product = require("../models/Product");


// ==================================================
// ADD REVIEW
// ==================================================

const addReview = async (req, res) => {
  try {
    const {
      productId,
      rating,
      comment,
    } = req.body;

    // ------------------------------------------
    // VALIDATION
    // ------------------------------------------

    if (!productId) {
      return res.status(400).json({
        success: false,
        message: "Product ID is required",
      });
    }

    if (
      rating === undefined ||
      rating < 1 ||
      rating > 5
    ) {
      return res.status(400).json({
        success: false,
        message: "Rating must be between 1 and 5",
      });
    }

    if (
      !comment ||
      comment.trim() === ""
    ) {
      return res.status(400).json({
        success: false,
        message: "Comment is required",
      });
    }

    // ------------------------------------------
    // CHECK PRODUCT
    // ------------------------------------------

    const product =
      await Product.findById(productId);

    if (!product) {
      return res.status(404).json({
        success: false,
        message: "Product not found",
      });
    }

    // ------------------------------------------
    // CREATE REVIEW
    // ------------------------------------------

    const review = await Review.create({
      product: productId,

      user: req.user._id,

      name: req.user.name || "Customer",

      rating: Number(rating),

      comment: comment.trim(),
    });

    // ------------------------------------------
    // UPDATE PRODUCT RATING
    // ------------------------------------------

    await updateProductRating(productId);

    // ------------------------------------------
    // RESPONSE
    // ------------------------------------------

    return res.status(201).json({
      success: true,

      message: "Review added successfully",

      review,
    });

  } catch (error) {
    console.error(
      "Add Review Error:",
      error.message
    );

    return res.status(500).json({
      success: false,

      message: "Unable to add review",
    });
  }
};


// ==================================================
// GET ALL REVIEWS OF A PRODUCT
// ==================================================

const getProductReviews = async (req, res) => {
  try {
    const {
      productId,
    } = req.params;

    // ------------------------------------------
    // CHECK PRODUCT
    // ------------------------------------------

    const product =
      await Product.findById(productId);

    if (!product) {
      return res.status(404).json({
        success: false,

        message: "Product not found",
      });
    }

    // ------------------------------------------
    // GET REVIEWS
    // ------------------------------------------

    const reviews =
      await Review.find({
        product: productId,

        isApproved: true,
      })
        .populate(
          "user",
          "name email"
        )
        .sort({
          createdAt: -1,
        });

    // ------------------------------------------
    // RESPONSE
    // ------------------------------------------

    return res.status(200).json({
      success: true,

      count: reviews.length,

      rating: product.rating,

      numReviews: product.numReviews,

      reviews,
    });

  } catch (error) {
    console.error(
      "Get Product Reviews Error:",
      error.message
    );

    return res.status(500).json({
      success: false,

      message: "Unable to fetch product reviews",
    });
  }
};


// ==================================================
// GET SINGLE REVIEW
// ==================================================

const getReviewById = async (req, res) => {
  try {
    const review =
      await Review.findById(
        req.params.id
      ).populate(
        "user",
        "name email"
      );

    if (!review) {
      return res.status(404).json({
        success: false,

        message: "Review not found",
      });
    }

    return res.status(200).json({
      success: true,

      review,
    });

  } catch (error) {
    console.error(
      "Get Review Error:",
      error.message
    );

    return res.status(500).json({
      success: false,

      message: "Unable to fetch review",
    });
  }
};


// ==================================================
// UPDATE REVIEW
// ==================================================

const updateReview = async (req, res) => {
  try {
    const {
      rating,
      comment,
    } = req.body;

    // ------------------------------------------
    // FIND REVIEW
    // ------------------------------------------

    const review =
      await Review.findOne({
        _id: req.params.id,

        user: req.user._id,
      });

    if (!review) {
      return res.status(404).json({
        success: false,

        message:
          "Review not found or you are not authorized to update it",
      });
    }

    // ------------------------------------------
    // VALIDATE RATING
    // ------------------------------------------

    if (
      rating !== undefined &&
      (rating < 1 || rating > 5)
    ) {
      return res.status(400).json({
        success: false,

        message:
          "Rating must be between 1 and 5",
      });
    }

    // ------------------------------------------
    // VALIDATE COMMENT
    // ------------------------------------------

    if (
      comment !== undefined &&
      comment.trim() === ""
    ) {
      return res.status(400).json({
        success: false,

        message:
          "Comment cannot be empty",
      });
    }

    // ------------------------------------------
    // UPDATE RATING
    // ------------------------------------------

    if (rating !== undefined) {
      review.rating = Number(rating);
    }

    // ------------------------------------------
    // UPDATE COMMENT
    // ------------------------------------------

    if (comment !== undefined) {
      review.comment = comment.trim();
    }

    await review.save();

    // ------------------------------------------
    // UPDATE PRODUCT RATING
    // ------------------------------------------

    await updateProductRating(
      review.product
    );

    // ------------------------------------------
    // RESPONSE
    // ------------------------------------------

    return res.status(200).json({
      success: true,

      message:
        "Review updated successfully",

      review,
    });

  } catch (error) {
    console.error(
      "Update Review Error:",
      error.message
    );

    return res.status(500).json({
      success: false,

      message:
        "Unable to update review",
    });
  }
};


// ==================================================
// DELETE REVIEW
// ==================================================

const deleteReview = async (req, res) => {
  try {
    // ------------------------------------------
    // FIND USER'S REVIEW
    // ------------------------------------------

    const review =
      await Review.findOne({
        _id: req.params.id,

        user: req.user._id,
      });

    if (!review) {
      return res.status(404).json({
        success: false,

        message:
          "Review not found or you are not authorized to delete it",
      });
    }

    // Save product ID before deleting
    const productId =
      review.product;

    // ------------------------------------------
    // DELETE REVIEW
    // ------------------------------------------

    await Review.findByIdAndDelete(
      review._id
    );

    // ------------------------------------------
    // UPDATE PRODUCT RATING
    // ------------------------------------------

    await updateProductRating(
      productId
    );

    // ------------------------------------------
    // RESPONSE
    // ------------------------------------------

    return res.status(200).json({
      success: true,

      message:
        "Review deleted successfully",
    });

  } catch (error) {
    console.error(
      "Delete Review Error:",
      error.message
    );

    return res.status(500).json({
      success: false,

      message:
        "Unable to delete review",
    });
  }
};


// ==================================================
// UPDATE PRODUCT RATING
// ==================================================

const updateProductRating = async (
  productId
) => {
  try {
    const ratingData =
      await Review.aggregate([
        // --------------------------------------
        // GET REVIEWS OF PRODUCT
        // --------------------------------------

        {
          $match: {
            product: productId,

            isApproved: true,
          },
        },

        // --------------------------------------
        // CALCULATE AVERAGE
        // --------------------------------------

        {
          $group: {
            _id: "$product",

            averageRating: {
              $avg: "$rating",
            },

            totalReviews: {
              $sum: 1,
            },
          },
        },
      ]);

    // ------------------------------------------
    // FIND PRODUCT
    // ------------------------------------------

    const product =
      await Product.findById(productId);

    if (!product) {
      return;
    }

    // ------------------------------------------
    // NO REVIEWS
    // ------------------------------------------

    if (ratingData.length === 0) {
      product.rating = 0;

      product.numReviews = 0;
    }

    // ------------------------------------------
    // REVIEWS EXIST
    // ------------------------------------------

    else {
      product.rating =
        Number(
          ratingData[0]
            .averageRating
            .toFixed(1)
        );

      product.numReviews =
        ratingData[0]
          .totalReviews;
    }

    await product.save();

  } catch (error) {
    console.error(
      "Update Product Rating Error:",
      error.message
    );

    throw error;
  }
};


// ==================================================
// EXPORT
// ==================================================

module.exports = {
  addReview,
  getProductReviews,
  getReviewById,
  updateReview,
  deleteReview,
};