const mongoose = require("mongoose");
const Wishlist = require("../models/wishlist");
const Product = require("../models/product");

// console.log("Wishlist:", Wishlist);
// console.log("Wishlist findOne:", typeof Wishlist.findOne);
// console.log("Wishlist create:", typeof Wishlist.create);

// =====================================================
// ADD PRODUCT TO WISHLIST
// =====================================================

const addToWishlist = async (req, res) => {
  try {
    const userId = req.userId;
    const { productId } = req.params;

    // Check user authentication
    if (!userId) {
      return res.status(401).json({
        success: false,
        message: "User not authenticated",
      });
    }

    // Check product ID
    if (!mongoose.isValidObjectId(productId)) {
      return res.status(400).json({
        success: false,
        message: "Invalid product ID",
      });
    }

    // Check product exists
    const product = await Product.findById(productId);

    if (!product) {
      return res.status(404).json({
        success: false,
        message: "Product not found",
      });
    }

    // Find user's wishlist
    let wishlist = await Wishlist.findOne({ user: userId });

    // Create wishlist if it doesn't exist
    if (!wishlist) {
      wishlist = await Wishlist.create({
        user: userId,
        products: [productId],
      });

      return res.status(201).json({
        success: true,
        message: "Product added to wishlist",
        wishlist,
      });
    }

    // Check if product already exists
    if (wishlist.products.some((id) => id.toString() === productId)) {
      return res.status(400).json({
        success: false,
        message: "Product already exists in wishlist",
      });
    }

    // Add product
    wishlist.products.push(productId);

    await wishlist.save();

    return res.status(200).json({
      success: true,
      message: "Product added to wishlist",
      wishlist,
    });

  } catch (error) {
    console.error("Add Wishlist Error:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to add product to wishlist",
      error: error.message,
    });
  }
};


// =====================================================
// REMOVE PRODUCT FROM WISHLIST
// =====================================================

const removeFromWishlist = async (req, res) => {
  try {
    const userId = req.userId;
    const { productId } = req.params;

    if (!userId) {
      return res.status(401).json({
        success: false,
        message: "User not authenticated",
      });
    }

    if (!mongoose.isValidObjectId(productId)) {
      return res.status(400).json({
        success: false,
        message: "Invalid product ID",
      });
    }

    const wishlist = await Wishlist.findOne({ user: userId });

    if (!wishlist) {
      return res.status(404).json({
        success: false,
        message: "Wishlist not found",
      });
    }

    const productExists = wishlist.products.some(
      (id) => id.toString() === productId
    );

    if (!productExists) {
      return res.status(400).json({
        success: false,
        message: "Product is not in wishlist",
      });
    }

    wishlist.products = wishlist.products.filter(
      (id) => id.toString() !== productId
    );

    await wishlist.save();

    return res.status(200).json({
      success: true,
      message: "Product removed from wishlist",
      wishlist,
    });

  } catch (error) {
    console.error("Remove Wishlist Error:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to remove product from wishlist",
      error: error.message,
    });
  }
};


// =====================================================
// GET USER WISHLIST
// =====================================================

const getWishlist = async (req, res) => {
  try {
    const userId = req.userId;

    if (!userId) {
      return res.status(401).json({
        success: false,
        message: "User not authenticated",
      });
    }

    const wishlist = await Wishlist.findOne({
      user: userId,
    }).populate("products");

    // User doesn't have wishlist yet
    if (!wishlist) {
      return res.status(200).json({
        success: true,
        message: "Wishlist is empty",
        wishlist: {
          products: [],
        },
      });
    }

    return res.status(200).json({
      success: true,
      message: "Wishlist fetched successfully",
      wishlist,
    });

  } catch (error) {
    console.error("Get Wishlist Error:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to fetch wishlist",
      error: error.message,
    });
  }
};


// =====================================================
// CHECK PRODUCT IN WISHLIST
// =====================================================

const checkWishlist = async (req, res) => {
  try {
    const userId = req.userId;
    const { productId } = req.params;

    if (!userId) {
      return res.status(401).json({
        success: false,
        message: "User not authenticated",
      });
    }

    if (!mongoose.isValidObjectId(productId)) {
      return res.status(400).json({
        success: false,
        message: "Invalid product ID",
      });
    }

    const wishlist = await Wishlist.findOne({
      user: userId,
    });

    if (!wishlist) {
      return res.status(200).json({
        success: true,
        isWishlisted: false,
      });
    }

    const isWishlisted = wishlist.products.some(
      (id) => id.toString() === productId
    );

    return res.status(200).json({
      success: true,
      isWishlisted,
    });

  } catch (error) {
    console.error("Check Wishlist Error:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to check wishlist",
      error: error.message,
    });
  }
};


// =====================================================
// TOGGLE WISHLIST
// =====================================================

const toggleWishlist = async (req, res) => {
  try {
    const userId = req.userId;
    const { productId } = req.params;

    if (!userId) {
      return res.status(401).json({
        success: false,
        message: "User not authenticated",
      });
    }

    if (!mongoose.isValidObjectId(productId)) {
      return res.status(400).json({
        success: false,
        message: "Invalid product ID",
      });
    }

    // Check product exists
    const product = await Product.findById(productId);

    if (!product) {
      return res.status(404).json({
        success: false,
        message: "Product not found",
      });
    }

    let wishlist = await Wishlist.findOne({
      user: userId,
    });

    // If wishlist doesn't exist → create it
    if (!wishlist) {
      wishlist = await Wishlist.create({
        user: userId,
        products: [productId],
      });

      return res.status(200).json({
        success: true,
        message: "Product added to wishlist",
        isWishlisted: true,
      });
    }

    const productIndex = wishlist.products.findIndex(
      (id) => id.toString() === productId
    );

    // Product exists → remove
    if (productIndex !== -1) {
      wishlist.products.splice(productIndex, 1);

      await wishlist.save();

      return res.status(200).json({
        success: true,
        message: "Product removed from wishlist",
        isWishlisted: false,
      });
    }

    // Product doesn't exist → add
    wishlist.products.push(productId);

    await wishlist.save();

    return res.status(200).json({
      success: true,
      message: "Product added to wishlist",
      isWishlisted: true,
    });

  } catch (error) {
    console.error("Toggle Wishlist Error:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to update wishlist",
      error: error.message,
    });
  }
};


module.exports = {
  addToWishlist,
  removeFromWishlist,
  getWishlist,
  checkWishlist,
  toggleWishlist,
};