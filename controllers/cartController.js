const Cart = require("../models/cart");
const Product = require("../models/product");


// ==========================================
// ADD TO CART
// ==========================================

const addToCart = async (req, res) => {
  try {
    const { productId, quantity = 1, variantId } = req.body;

    const userId = req.userId;

    if (!productId) {
      return res.status(400).json({
        success: false,
        message: "Product ID is required",
      });
    }

    const product = await Product.findById(productId);

    if (!product) {
      return res.status(404).json({
        success: false,
        message: "Product not found",
      });
    }

    // Find selected variant
    let selectedVariant = null;

    if (variantId) {
      selectedVariant = product.variants.find(
        (variant) =>
          variant._id.toString() === variantId
      );

      if (!selectedVariant) {
        return res.status(404).json({
          success: false,
          message: "Variant not found",
        });
      }

      if (selectedVariant.stock < quantity) {
        return res.status(400).json({
          success: false,
          message: "Not enough stock available",
        });
      }
    } else {
      if (product.stock < quantity) {
        return res.status(400).json({
          success: false,
          message: "Not enough stock available",
        });
      }
    }

    // Price
    const price = selectedVariant
      ? selectedVariant.salePrice
      : product.salePrice;

    let cart = await Cart.findOne({
      user: userId,
    });

    // Create cart if doesn't exist
    if (!cart) {
      cart = new Cart({
        user: userId,
        items: [],
      });
    }

    // Check existing item
    const existingItem = cart.items.find((item) => {
      const sameProduct =
        item.product.toString() === productId;

      const existingVariant =
        item.variant?._id || null;

      const sameVariant =
        existingVariant === (variantId || null);

      return sameProduct && sameVariant;
    });

    if (existingItem) {
      const newQuantity =
        existingItem.quantity + Number(quantity);

      const availableStock = selectedVariant
        ? selectedVariant.stock
        : product.stock;

      if (newQuantity > availableStock) {
        return res.status(400).json({
          success: false,
          message: "Not enough stock available",
        });
      }

      existingItem.quantity = newQuantity;
    } else {
      cart.items.push({
        product: productId,
        quantity: Number(quantity),
        price,
        variant: selectedVariant
          ? {
              _id: selectedVariant._id,
              title: selectedVariant.title,
              salePrice: selectedVariant.salePrice,
              mrp: selectedVariant.mrp,
              sku: selectedVariant.sku,
            }
          : undefined,
      });
    }

    // Calculate total
    cart.totalAmount = cart.items.reduce(
      (total, item) =>
        total + item.price * item.quantity,
      0
    );

    await cart.save();

    await cart.populate("items.product");

    res.status(200).json({
      success: true,
      message: "Product added to cart",
      cart,
    });

  } catch (error) {
    console.error("Add To Cart Error:", error);

    res.status(500).json({
      success: false,
      message: "Server error",
    });
  }
};


// ==========================================
// GET CART
// ==========================================

const getCart = async (req, res) => {
  try {
    const userId = req.userId;

    const cart = await Cart.findOne({
      user: userId,
    }).populate("items.product");

    if (!cart) {
      return res.status(200).json({
        success: true,
        cart: {
          items: [],
          totalAmount: 0,
        },
      });
    }

    res.status(200).json({
      success: true,
      cart,
    });

  } catch (error) {
    console.error("Get Cart Error:", error);

    res.status(500).json({
      success: false,
      message: "Server error",
    });
  }
};


// ==========================================
// UPDATE CART QUANTITY
// ==========================================

const updateCartQuantity = async (req, res) => {
  try {
    const { itemId } = req.params;
    const { quantity } = req.body;

    if (!quantity || quantity < 1) {
      return res.status(400).json({
        success: false,
        message: "Quantity must be at least 1",
      });
    }

    const cart = await Cart.findOne({
      user: req.userId,
    });

    if (!cart) {
      return res.status(404).json({
        success: false,
        message: "Cart not found",
      });
    }

    const item = cart.items.id(itemId);

    if (!item) {
      return res.status(404).json({
        success: false,
        message: "Cart item not found",
      });
    }

    const product = await Product.findById(
      item.product
    );

    if (!product) {
      return res.status(404).json({
        success: false,
        message: "Product not found",
      });
    }

    let stock = product.stock;

    if (item.variant?._id) {
      const variant = product.variants.find(
        (v) =>
          v._id.toString() ===
          item.variant._id.toString()
      );

      if (variant) {
        stock = variant.stock;
      }
    }

    if (quantity > stock) {
      return res.status(400).json({
        success: false,
        message: "Not enough stock available",
      });
    }

    item.quantity = Number(quantity);

    cart.totalAmount = cart.items.reduce(
      (total, item) =>
        total + item.price * item.quantity,
      0
    );

    await cart.save();

    await cart.populate("items.product");

    res.status(200).json({
      success: true,
      message: "Cart updated successfully",
      cart,
    });

  } catch (error) {
    console.error(
      "Update Cart Error:",
      error
    );

    res.status(500).json({
      success: false,
      message: "Server error",
    });
  }
};


// ==========================================
// REMOVE FROM CART
// ==========================================

const removeFromCart = async (req, res) => {
  try {
    const { itemId } = req.params;

    const cart = await Cart.findOne({
      user: req.userId,
    });

    if (!cart) {
      return res.status(404).json({
        success: false,
        message: "Cart not found",
      });
    }

    const item = cart.items.id(itemId);

    if (!item) {
      return res.status(404).json({
        success: false,
        message: "Cart item not found",
      });
    }

    item.deleteOne();

    cart.totalAmount = cart.items.reduce(
      (total, item) =>
        total + item.price * item.quantity,
      0
    );

    await cart.save();

    await cart.populate("items.product");

    res.status(200).json({
      success: true,
      message: "Product removed from cart",
      cart,
    });

  } catch (error) {
    console.error(
      "Remove Cart Error:",
      error
    );

    res.status(500).json({
      success: false,
      message: "Server error",
    });
  }
};


// ==========================================
// CLEAR CART
// ==========================================

const clearCart = async (req, res) => {
  try {
    const cart = await Cart.findOne({
      user: req.userId,
    });

    if (!cart) {
      return res.status(404).json({
        success: false,
        message: "Cart not found",
      });
    }

    cart.items = [];
    cart.totalAmount = 0;

    await cart.save();

    res.status(200).json({
      success: true,
      message: "Cart cleared successfully",
      cart,
    });

  } catch (error) {
    console.error(
      "Clear Cart Error:",
      error
    );

    res.status(500).json({
      success: false,
      message: "Server error",
    });
  }
};


module.exports = {
  addToCart,
  getCart,
  updateCartQuantity,
  removeFromCart,
  clearCart,
};