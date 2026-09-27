const Cart = require("../models/cart");
const Product = require("../models/product");

// =====================================================
// HELPER
// =====================================================

const getUserId = (req) => {
  return (
    req.userId ||
    req.user?.userId ||
    req.user?.id ||
    req.user?._id
  );
};

// =====================================================
// ADD TO CART
// =====================================================

const addToCart = async (req, res) => {
  try {
    const {
      productId,
      quantity = 1,
      variantId,
    } = req.body;

    const userId = getUserId(req);

    if (!userId) {
      return res.status(401).json({
        success: false,
        message: "Authentication required",
      });
    }

    if (!productId) {
      return res.status(400).json({
        success: false,
        message: "Product ID is required",
      });
    }

    const requestedQuantity = Number(quantity);

    if (
      !Number.isInteger(requestedQuantity) ||
      requestedQuantity < 1
    ) {
      return res.status(400).json({
        success: false,
        message: "Quantity must be at least 1",
      });
    }

    // =================================================
    // GET PRODUCT
    // =================================================

    const product =
      await Product.findById(productId);

    if (!product) {
      return res.status(404).json({
        success: false,
        message: "Product not found",
      });
    }

    // =================================================
    // FIND VARIANT
    // =================================================

    let selectedVariant = null;

    if (variantId) {
      selectedVariant =
        product.variants?.id(variantId);

      if (!selectedVariant) {
        return res.status(404).json({
          success: false,
          message: "Variant not found",
        });
      }
    }

    // =================================================
    // STOCK
    // =================================================

    const availableStock = selectedVariant
      ? Number(selectedVariant.stock || 0)
      : Number(product.stock || 0);

    if (availableStock < requestedQuantity) {
      return res.status(400).json({
        success: false,
        message: "Not enough stock available",
        availableStock,
      });
    }

    // =================================================
    // PRICE
    // =================================================

    const price = selectedVariant
      ? Number(selectedVariant.salePrice)
      : Number(product.salePrice);

    if (!Number.isFinite(price) || price < 0) {
      return res.status(400).json({
        success: false,
        message: "Invalid product price",
      });
    }

    // =================================================
    // GET / CREATE CART
    // =================================================

    let cart =
      await Cart.findOne({
        user: userId,
      });

    if (!cart) {
      cart = new Cart({
        user: userId,
        items: [],
        totalAmount: 0,
      });
    }

    // =================================================
    // CHECK SAME PRODUCT + SAME VARIANT
    // =================================================

    const normalizedVariantId =
      selectedVariant
        ? selectedVariant._id.toString()
        : null;

    const existingItem =
      cart.items.find((item) => {
        const itemProductId =
          item.product?.toString();

        const itemVariantId =
          item.variantId
            ? item.variantId.toString()
            : null;

        return (
          itemProductId ===
            productId.toString() &&
          itemVariantId ===
            normalizedVariantId
        );
      });

    // =================================================
    // EXISTING ITEM
    // =================================================

    if (existingItem) {
      const newQuantity =
        Number(existingItem.quantity) +
        requestedQuantity;

      if (newQuantity > availableStock) {
        return res.status(400).json({
          success: false,
          message:
            "Not enough stock available",
          availableStock,
        });
      }

      existingItem.quantity =
        newQuantity;

      // Keep latest price
      existingItem.price = price;
    }

    // =================================================
    // NEW ITEM
    // =================================================

    else {
      cart.items.push({
        product:
          product._id,

        variantId:
          selectedVariant
            ? selectedVariant._id
            : null,

        quantity:
          requestedQuantity,

        price,
      });
    }

    // =================================================
    // TOTAL
    // =================================================

    cart.totalAmount =
      cart.items.reduce(
        (total, item) => {
          return (
            total +
            Number(item.price || 0) *
              Number(item.quantity || 0)
          );
        },
        0
      );

    await cart.save();

    // =================================================
    // POPULATE
    // =================================================

    await cart.populate(
      "items.product"
    );

    return res.status(200).json({
      success: true,
      message: "Product added to cart",
      cart,
    });

  } catch (error) {
    console.error(
      "Add To Cart Error:",
      error
    );

    return res.status(500).json({
      success: false,
      message: "Unable to add product to cart",
      error: error.message,
    });
  }
};

// =====================================================
// GET CART
// =====================================================

const getCart = async (req, res) => {
  try {
    const userId = getUserId(req);

    if (!userId) {
      return res.status(401).json({
        success: false,
        message: "Authentication required",
      });
    }

    const cart =
      await Cart.findOne({
        user: userId,
      }).populate(
        "items.product"
      );

    if (!cart) {
      return res.status(200).json({
        success: true,
        cart: {
          user: userId,
          items: [],
          totalAmount: 0,
        },
      });
    }

    return res.status(200).json({
      success: true,
      cart,
    });

  } catch (error) {
    console.error(
      "Get Cart Error:",
      error
    );

    return res.status(500).json({
      success: false,
      message: "Unable to fetch cart",
      error: error.message,
    });
  }
};

// =====================================================
// UPDATE CART QUANTITY
// =====================================================

const updateCartQuantity = async (
  req,
  res
) => {
  try {
    const {
      itemId,
    } = req.params;

    const {
      quantity,
    } = req.body;

    const userId =
      getUserId(req);

    if (!userId) {
      return res.status(401).json({
        success: false,
        message: "Authentication required",
      });
    }

    const newQuantity =
      Number(quantity);

    if (
      !Number.isInteger(newQuantity) ||
      newQuantity < 1
    ) {
      return res.status(400).json({
        success: false,
        message:
          "Quantity must be at least 1",
      });
    }

    // =================================================
    // CART
    // =================================================

    const cart =
      await Cart.findOne({
        user: userId,
      });

    if (!cart) {
      return res.status(404).json({
        success: false,
        message: "Cart not found",
      });
    }

    // =================================================
    // ITEM
    // =================================================

    const item =
      cart.items.id(itemId);

    if (!item) {
      return res.status(404).json({
        success: false,
        message:
          "Cart item not found",
      });
    }

    // =================================================
    // PRODUCT
    // =================================================

    const product =
      await Product.findById(
        item.product
      );

    if (!product) {
      return res.status(404).json({
        success: false,
        message:
          "Product not found",
      });
    }

    // =================================================
    // STOCK
    // =================================================

    let stock =
      Number(product.stock || 0);

    let variant = null;

    if (item.variantId) {
      variant =
        product.variants?.id(
          item.variantId
        );

      if (!variant) {
        return res.status(404).json({
          success: false,
          message:
            "Variant no longer exists",
        });
      }

      stock =
        Number(variant.stock || 0);
    }

    if (newQuantity > stock) {
      return res.status(400).json({
        success: false,
        message:
          "Not enough stock available",
        availableStock: stock,
      });
    }

    // =================================================
    // UPDATE
    // =================================================

    item.quantity =
      newQuantity;

    // Update price from current product
    item.price = variant
      ? Number(variant.salePrice)
      : Number(product.salePrice);

    // =================================================
    // TOTAL
    // =================================================

    cart.totalAmount =
      cart.items.reduce(
        (total, cartItem) =>
          total +
          Number(cartItem.price || 0) *
            Number(cartItem.quantity || 0),
        0
      );

    await cart.save();

    await cart.populate(
      "items.product"
    );

    return res.status(200).json({
      success: true,
      message:
        "Cart updated successfully",
      cart,
    });

  } catch (error) {
    console.error(
      "Update Cart Error:",
      error
    );

    return res.status(500).json({
      success: false,
      message:
        "Unable to update cart",
      error: error.message,
    });
  }
};

// =====================================================
// REMOVE FROM CART
// =====================================================

const removeFromCart = async (
  req,
  res
) => {
  try {
    const {
      itemId,
    } = req.params;

    const userId =
      getUserId(req);

    if (!userId) {
      return res.status(401).json({
        success: false,
        message:
          "Authentication required",
      });
    }

    const cart =
      await Cart.findOne({
        user: userId,
      });

    if (!cart) {
      return res.status(404).json({
        success: false,
        message:
          "Cart not found",
      });
    }

    const item =
      cart.items.id(itemId);

    if (!item) {
      return res.status(404).json({
        success: false,
        message:
          "Cart item not found",
      });
    }

    item.deleteOne();

    cart.totalAmount =
      cart.items.reduce(
        (total, cartItem) =>
          total +
          Number(cartItem.price || 0) *
            Number(cartItem.quantity || 0),
        0
      );

    await cart.save();

    await cart.populate(
      "items.product"
    );

    return res.status(200).json({
      success: true,
      message:
        "Product removed from cart",
      cart,
    });

  } catch (error) {
    console.error(
      "Remove Cart Error:",
      error
    );

    return res.status(500).json({
      success: false,
      message:
        "Unable to remove product",
      error: error.message,
    });
  }
};

// =====================================================
// CLEAR CART
// =====================================================

const clearCart = async (
  req,
  res
) => {
  try {
    const userId =
      getUserId(req);

    if (!userId) {
      return res.status(401).json({
        success: false,
        message:
          "Authentication required",
      });
    }

    const cart =
      await Cart.findOne({
        user: userId,
      });

    if (!cart) {
      return res.status(404).json({
        success: false,
        message:
          "Cart not found",
      });
    }

    cart.items = [];
    cart.totalAmount = 0;

    await cart.save();

    return res.status(200).json({
      success: true,
      message:
        "Cart cleared successfully",
      cart,
    });

  } catch (error) {
    console.error(
      "Clear Cart Error:",
      error
    );

    return res.status(500).json({
      success: false,
      message:
        "Unable to clear cart",
      error: error.message,
    });
  }
};

// =====================================================
// EXPORT
// =====================================================

module.exports = {
  addToCart,
  getCart,
  updateCartQuantity,
  removeFromCart,
  clearCart,
};