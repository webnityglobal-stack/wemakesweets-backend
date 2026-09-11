const mongoose = require("mongoose");
const Wishlist = require("../models/wishlist");
const Product = require("../models/product");

// =====================================================
// ADD PRODUCT VARIANT TO WISHLIST
// =====================================================

const addToWishlist = async (req, res) => {
  try {
    const userId = req.userId;
    const { productId } = req.params;
    const { variantId } = req.body || {};

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

    // Check product
    const product = await Product.findById(productId);

    if (!product) {
      return res.status(404).json({
        success: false,
        message: "Product not found",
      });
    }

    let selectedVariant = null;

    // If variantId is provided
    if (variantId) {
      if (!mongoose.isValidObjectId(variantId)) {
        return res.status(400).json({
          success: false,
          message: "Invalid variant ID",
        });
      }

      selectedVariant = product.variants.id(variantId);

      if (!selectedVariant) {
        return res.status(404).json({
          success: false,
          message: "Variant not found for this product",
        });
      }
    }

    // Find wishlist
    let wishlist = await Wishlist.findOne({
      user: userId,
    });

    // Create wishlist
    if (!wishlist) {
      wishlist = await Wishlist.create({
        user: userId,
        products: [
          {
            product: productId,
            variantId: variantId || null,
          },
        ],
      });

      return res.status(201).json({
        success: true,
        message: "Product added to wishlist",
        wishlist,
      });
    }

    // Check same product + same variant
    const alreadyExists = wishlist.products.some((item) => {
      const sameProduct =
        item.product.toString() === productId;

      const sameVariant =
        String(item.variantId || "") === String(variantId || "");

      return sameProduct && sameVariant;
    });

    if (alreadyExists) {
      return res.status(400).json({
        success: false,
        message: "This product variant is already in wishlist",
      });
    }

    // Add item
    wishlist.products.push({
      product: productId,
      variantId: variantId || null,
    });

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
// REMOVE PRODUCT VARIANT FROM WISHLIST
// =====================================================

const removeFromWishlist = async (req, res) => {
  try {
    const userId = req.userId;
    const { productId } = req.params;
    const { variantId } = req.body|| {};

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
      return res.status(404).json({
        success: false,
        message: "Wishlist not found",
      });
    }

    const itemIndex = wishlist.products.findIndex((item) => {
      const sameProduct =
        item.product.toString() === productId;

      const sameVariant =
        String(item.variantId || "") === String(variantId || "");

      return sameProduct && sameVariant;
    });

    if (itemIndex === -1) {
      return res.status(400).json({
        success: false,
        message: "Product variant is not in wishlist",
      });
    }

    wishlist.products.splice(itemIndex, 1);

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
    }).populate("products.product");

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
// CHECK PRODUCT VARIANT IN WISHLIST
// =====================================================

const checkWishlist = async (req, res) => {
  try {
    const userId = req.userId;
    const { productId } = req.params;
    const { variantId } = req.query|| {};

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

    const isWishlisted = wishlist.products.some((item) => {
      const sameProduct =
        item.product.toString() === productId;

      const sameVariant =
        String(item.variantId || "") === String(variantId || "");

      return sameProduct && sameVariant;
    });

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
// TOGGLE PRODUCT VARIANT IN WISHLIST
// =====================================================

const toggleWishlist = async (req, res) => {
  try {
    const userId = req.userId;
    const { productId } = req.params;
    const { variantId } = req.body|| {};

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

    // Check product
    const product = await Product.findById(productId);

    if (!product) {
      return res.status(404).json({
        success: false,
        message: "Product not found",
      });
    }

    // Check variant
    if (variantId) {
      if (!mongoose.isValidObjectId(variantId)) {
        return res.status(400).json({
          success: false,
          message: "Invalid variant ID",
        });
      }

      const selectedVariant = product.variants.id(variantId);

      if (!selectedVariant) {
        return res.status(404).json({
          success: false,
          message: "Variant not found for this product",
        });
      }
    }

    let wishlist = await Wishlist.findOne({
      user: userId,
    });

    // Create wishlist
    if (!wishlist) {
      wishlist = await Wishlist.create({
        user: userId,
        products: [
          {
            product: productId,
            variantId: variantId || null,
          },
        ],
      });

      return res.status(200).json({
        success: true,
        message: "Product added to wishlist",
        isWishlisted: true,
      });
    }

    // Find same product + variant
    const itemIndex = wishlist.products.findIndex((item) => {
      const sameProduct =
        item.product.toString() === productId;

      const sameVariant =
        String(item.variantId || "") === String(variantId || "");

      return sameProduct && sameVariant;
    });

    // Exists → remove
    if (itemIndex !== -1) {
      wishlist.products.splice(itemIndex, 1);

      await wishlist.save();

      return res.status(200).json({
        success: true,
        message: "Product removed from wishlist",
        isWishlisted: false,
      });
    }

    // Doesn't exist → add
    wishlist.products.push({
      product: productId,
      variantId: variantId || null,
    });

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