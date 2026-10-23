const Review = require("../models/review");
const Product = require("../models/product");
const Order = require("../models/order");
const mongoose = require("mongoose");

// ==================================================
// ADD REVIEW
// ==================================================
// unchaged review part only verified buyer can addd review 
// const addReview = async (req, res) => {
//   try {
//     const {
//       productId,
//       rating,
//       comment,
//     } = req.body;

//     // ------------------------------------------
//     // VALIDATION
//     // ------------------------------------------

//     if (!productId) {
//       return res.status(400).json({
//         success: false,
//         message: "Product ID is required",
//       });
//     }

//     if (
//       rating === undefined ||
//       Number(rating) < 1 ||
//       Number(rating) > 5
//     ) {
//       return res.status(400).json({
//         success: false,
//         message: "Rating must be between 1 and 5",
//       });
//     }

//     if (
//       !comment ||
//       comment.trim() === ""
//     ) {
//       return res.status(400).json({
//         success: false,
//         message: "Comment is required",
//       });
//     }

//     // ------------------------------------------
//     // CHECK PRODUCT
//     // ------------------------------------------

//     const product = await Product.findById(productId);

//     if (!product) {
//       return res.status(404).json({
//         success: false,
//         message: "Product not found",
//       });
//     }

//     // ------------------------------------------
//     // CHECK PURCHASE
//     // ------------------------------------------

//     const purchasedOrder = await Order.findOne({
//       user: req.user.userId,

//       paymentStatus: "PAID",

//       orderStatus: "DELIVERED",

//       "items.product": productId,
//     });

//     // ------------------------------------------
//     // USER DID NOT PURCHASE PRODUCT
//     // ------------------------------------------

//     if (!purchasedOrder) {
//       return res.status(403).json({
//         success: false,
//         message:
//           "You can only review a product after purchasing and receiving it",
//       });
//     }

//     // ------------------------------------------
//     // CHECK IF USER ALREADY REVIEWED
//     // ------------------------------------------

//     const existingReview = await Review.findOne({
//       product: productId,
//       user: req.user.userId,
//     });

//     if (existingReview) {
//       return res.status(400).json({
//         success: false,
//         message:
//           "You have already reviewed this product",
//       });
//     }

//     // ------------------------------------------
//     // CREATE REVIEW
//     // ------------------------------------------

//     const review = await Review.create({
//       product: productId,

//       user: req.user.userId,

//       name: req.user.name || "Customer",

//       rating: Number(rating),

//       comment: comment.trim(),

//       verifiedPurchase: true,

//       isApproved: true,
//     });

//     // ------------------------------------------
//     // UPDATE PRODUCT RATING
//     // ------------------------------------------

//     await updateProductRating(productId);

//     // ------------------------------------------
//     // RESPONSE
//     // ------------------------------------------

//     return res.status(201).json({
//       success: true,

//       message: "Review added successfully",

//       review,
//     });

//   } catch (error) {
//     console.error(
//       "Add Review Error:",
//       error.message
//     );

//     return res.status(500).json({
//       success: false,

//       message: "Unable to add review",
//     });
//   }
// };



// changed add reivew part anyone can add reivew 

const addReview = async (req, res) => {
  try {
    const { productId, rating, comment } = req.body;

    // ------------------------------------------
    // VALIDATE AUTHENTICATION
    // ------------------------------------------

    if (!req.user || !req.user.userId) {
      return res.status(401).json({
        success: false,
        message: "Please login to add a review",
      });
    }

    const userId = req.user.userId;
    const userName = req.user.name || "Customer";

    // ------------------------------------------
    // VALIDATION
    // ------------------------------------------

    if (!productId) {
      return res.status(400).json({
        success: false,
        message: "Product ID is required",
      });
    }

    const numericRating = Number(rating);

    if (
      rating === undefined ||
      rating === null ||
      rating === "" ||
      !Number.isFinite(numericRating) ||
      numericRating < 1 ||
      numericRating > 5
    ) {
      return res.status(400).json({
        success: false,
        message: "Rating must be between 1 and 5",
      });
    }

    if (
      typeof comment !== "string" ||
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

    const product = await Product.findById(productId);

    if (!product) {
      return res.status(404).json({
        success: false,
        message: "Product not found",
      });
    }

    // ------------------------------------------
    // TEMPORARY PURCHASE VERIFICATION TOGGLE
    // ------------------------------------------

    const allowUnpurchasedReviews =
      process.env.ALLOW_UNPURCHASED_REVIEWS === "true";

    let verifiedPurchase = false;

    if (!allowUnpurchasedReviews) {
      const purchasedOrder = await Order.findOne({
        user: userId,
        paymentStatus: "PAID",
        orderStatus: "DELIVERED",
        "items.product": productId,
      });

      if (!purchasedOrder) {
        return res.status(403).json({
          success: false,
          message:
            "You can only review a product after purchasing and receiving it",
        });
      }

      verifiedPurchase = true;
    }

    // ------------------------------------------
    // CHECK EXISTING REVIEW
    // ------------------------------------------

    const existingReview = await Review.findOne({
      product: productId,
      user: userId,
    });

    if (existingReview) {
      return res.status(400).json({
        success: false,
        message: "You have already reviewed this product",
      });
    }

    // ------------------------------------------
    // CREATE REVIEW
    // ------------------------------------------

    const review = await Review.create({
      product: productId,
      user: userId,
      name: userName,
      rating: numericRating,
      comment: comment.trim(),
      verifiedPurchase,
      isApproved: true,
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
    console.error("Add Review Error:", error);

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


/**
 * GET ALL LATEST 12 APPROVED REVIEWS
 */
const getAllReviews = async (req, res) => {
  try {
    const reviews = await Review.find({
      isApproved: true,
    })
      .populate("user", "name email")
      .populate("product", "name images")
      .sort({ createdAt: -1, _id: -1 })
      .limit(12)
      .lean();

    return res.status(200).json({
      success: true,
      count: reviews.length,
      reviews,
    });
  } catch (error) {
    console.error("Get All Reviews Error:", error.message);

    return res.status(500).json({
      success: false,
      message: "Unable to fetch reviews",
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

        user: req.user.userId,
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

        user: req.user.userId,
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

const updateProductRating = async (productId) => {
  try {
    const ratingData = await Review.aggregate([
      {
        $match: {
          product: new mongoose.Types.ObjectId(productId),
          isApproved: true,
        },
      },
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

    if (ratingData.length === 0) {
      await Product.updateOne(
        { _id: productId },
        {
          $set: {
            rating: 0,
            numReviews: 0,
          },
        }
      );
    } else {
      const averageRating = Number(
        ratingData[0].averageRating.toFixed(1)
      );

      const totalReviews =
        ratingData[0].totalReviews;

      await Product.updateOne(
        { _id: productId },
        {
          $set: {
            rating: averageRating,
            numReviews: totalReviews,
          },
        }
      );
    }
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
  getAllReviews,
  getReviewById,
  updateReview,
  deleteReview,
};