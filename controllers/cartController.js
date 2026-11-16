const Cart = require("../models/cart");
const Product = require("../models/product");

// =====================================================
// HELPERS
// =====================================================

const getUserId = (req) => {
  return (
    req.userId ||
    req.user?.userId ||
    req.user?.id ||
    req.user?._id ||
    null
  );
};

const getGuestId = (req) => {
  return (
    req.guestId ||
    req.headers["x-guest-id"] ||
    req.headers["guest-id"] ||
    req.headers["x-session-id"] ||
    req.query?.guestId ||
    req.body?.guestId ||
    null
  );
};

const resolveCartIdentity = (req) => {
  const userId = getUserId(req);
  let guestId = getGuestId(req);

  if (!userId && !guestId) {
    guestId = `guest_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
  }

  return { userId, guestId };
};

const getCartQuery = (userId, guestId) => {
  if (userId) return { user: userId };
  if (guestId) return { guestId };
  return null;
};

// =====================================================
// ADD TO CART (Supports Logged-in & Guest Users)
// =====================================================

const addToCart = async (req, res) => {
  try {
    const { productId, quantity = 1, variantId } = req.body;
    const { userId, guestId } = resolveCartIdentity(req);

    if (!productId) {
      return res.status(400).json({
        success: false,
        message: "Product ID is required",
      });
    }

    const requestedQuantity = Number(quantity);
    if (!Number.isInteger(requestedQuantity) || requestedQuantity < 1) {
      return res.status(400).json({
        success: false,
        message: "Quantity must be at least 1",
      });
    }

    // =================================================
    // GET PRODUCT
    // =================================================

    const product = await Product.findById(productId);
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
      selectedVariant = product.variants?.id(variantId);
      if (!selectedVariant) {
        return res.status(404).json({
          success: false,
          message: "Variant not found",
        });
      }
    }

    // =================================================
    // STOCK CHECK
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

    const query = getCartQuery(userId, guestId);
    let cart = query ? await Cart.findOne(query) : null;

    if (!cart) {
      cart = new Cart({
        user: userId || null,
        guestId: userId ? null : guestId,
        items: [],
        totalAmount: 0,
      });
    }

    // =================================================
    // CHECK SAME PRODUCT + SAME VARIANT
    // =================================================

    const normalizedVariantId = selectedVariant
      ? selectedVariant._id.toString()
      : null;

    const existingItem = cart.items.find((item) => {
      const itemProductId = item.product?.toString();
      const itemVariantId = item.variantId ? item.variantId.toString() : null;

      return (
        itemProductId === productId.toString() &&
        itemVariantId === normalizedVariantId
      );
    });

    if (existingItem) {
      const newQuantity = Number(existingItem.quantity) + requestedQuantity;

      if (newQuantity > availableStock) {
        return res.status(400).json({
          success: false,
          message: "Not enough stock available",
          availableStock,
        });
      }

      existingItem.quantity = newQuantity;
      existingItem.price = price;
    } else {
      cart.items.push({
        product: product._id,
        variantId: selectedVariant ? selectedVariant._id : null,
        quantity: requestedQuantity,
        price,
      });
    }

    // =================================================
    // TOTAL
    // =================================================

    cart.totalAmount = cart.items.reduce((total, item) => {
      return total + Number(item.price || 0) * Number(item.quantity || 0);
    }, 0);

    await cart.save();
    await cart.populate("items.product");

    return res.status(200).json({
      success: true,
      message: "Product added to cart",
      cart,
      guestId: cart.guestId || guestId,
    });
  } catch (error) {
    console.error("Add To Cart Error:", error);
    return res.status(500).json({
      success: false,
      message: "Unable to add product to cart",
      error: error.message,
    });
  }
};

// =====================================================
// GET CART (Supports Logged-in & Guest Users)
// =====================================================

const getCart = async (req, res) => {
  try {
    const { userId, guestId } = resolveCartIdentity(req);
    const query = getCartQuery(userId, guestId);

    const cart = query
      ? await Cart.findOne(query).populate("items.product")
      : null;

    if (!cart) {
      return res.status(200).json({
        success: true,
        cart: {
          user: userId || null,
          guestId: userId ? null : guestId,
          items: [],
          totalAmount: 0,
        },
        guestId: userId ? null : guestId,
      });
    }

    return res.status(200).json({
      success: true,
      cart,
      guestId: cart.guestId || guestId,
    });
  } catch (error) {
    console.error("Get Cart Error:", error);
    return res.status(500).json({
      success: false,
      message: "Unable to fetch cart",
      error: error.message,
    });
  }
};

// =====================================================
// UPDATE CART QUANTITY (Supports Logged-in & Guest Users)
// =====================================================

const updateCartQuantity = async (req, res) => {
  try {
    const { itemId } = req.params;
    const { quantity } = req.body;
    const { userId, guestId } = resolveCartIdentity(req);

    const newQuantity = Number(quantity);
    if (!Number.isInteger(newQuantity) || newQuantity < 1) {
      return res.status(400).json({
        success: false,
        message: "Quantity must be at least 1",
      });
    }

    const query = getCartQuery(userId, guestId);
    if (!query) {
      return res.status(404).json({
        success: false,
        message: "Cart not found",
      });
    }

    const cart = await Cart.findOne(query);
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

    const product = await Product.findById(item.product);
    if (!product) {
      return res.status(404).json({
        success: false,
        message: "Product not found",
      });
    }

    let stock = Number(product.stock || 0);
    let variant = null;

    if (item.variantId) {
      variant = product.variants?.id(item.variantId);
      if (!variant) {
        return res.status(404).json({
          success: false,
          message: "Variant no longer exists",
        });
      }
      stock = Number(variant.stock || 0);
    }

    if (newQuantity > stock) {
      return res.status(400).json({
        success: false,
        message: "Not enough stock available",
        availableStock: stock,
      });
    }

    item.quantity = newQuantity;
    item.price = variant
      ? Number(variant.salePrice)
      : Number(product.salePrice);

    cart.totalAmount = cart.items.reduce((total, cartItem) => {
      return total + Number(cartItem.price || 0) * Number(cartItem.quantity || 0);
    }, 0);

    await cart.save();
    await cart.populate("items.product");

    return res.status(200).json({
      success: true,
      message: "Cart updated successfully",
      cart,
      guestId: cart.guestId || guestId,
    });
  } catch (error) {
    console.error("Update Cart Error:", error);
    return res.status(500).json({
      success: false,
      message: "Unable to update cart",
      error: error.message,
    });
  }
};

// =====================================================
// REMOVE FROM CART (Supports Logged-in & Guest Users)
// =====================================================

const removeFromCart = async (req, res) => {
  try {
    const { itemId } = req.params;
    const { userId, guestId } = resolveCartIdentity(req);

    const query = getCartQuery(userId, guestId);
    if (!query) {
      return res.status(404).json({
        success: false,
        message: "Cart not found",
      });
    }

    const cart = await Cart.findOne(query);
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

    cart.totalAmount = cart.items.reduce((total, cartItem) => {
      return total + Number(cartItem.price || 0) * Number(cartItem.quantity || 0);
    }, 0);

    await cart.save();
    await cart.populate("items.product");

    return res.status(200).json({
      success: true,
      message: "Product removed from cart",
      cart,
      guestId: cart.guestId || guestId,
    });
  } catch (error) {
    console.error("Remove Cart Error:", error);
    return res.status(500).json({
      success: false,
      message: "Unable to remove product",
      error: error.message,
    });
  }
};

// =====================================================
// CLEAR CART (Supports Logged-in & Guest Users)
// =====================================================

const clearCart = async (req, res) => {
  try {
    const { userId, guestId } = resolveCartIdentity(req);

    const query = getCartQuery(userId, guestId);
    if (!query) {
      return res.status(404).json({
        success: false,
        message: "Cart not found",
      });
    }

    const cart = await Cart.findOne(query);
    if (!cart) {
      return res.status(404).json({
        success: false,
        message: "Cart not found",
      });
    }

    cart.items = [];
    cart.totalAmount = 0;

    await cart.save();

    return res.status(200).json({
      success: true,
      message: "Cart cleared successfully",
      cart,
      guestId: cart.guestId || guestId,
    });
  } catch (error) {
    console.error("Clear Cart Error:", error);
    return res.status(500).json({
      success: false,
      message: "Unable to clear cart",
      error: error.message,
    });
  }
};

// =====================================================
// MERGE GUEST CART INTO USER CART (When logging in)
// =====================================================

const mergeCart = async (req, res) => {
  try {
    const userId = getUserId(req);
    const guestId = getGuestId(req);

    if (!userId) {
      return res.status(401).json({
        success: false,
        message: "Authentication required to merge cart",
      });
    }

    if (!guestId) {
      const userCart = await Cart.findOne({ user: userId }).populate("items.product");
      return res.status(200).json({
        success: true,
        message: "No guest cart specified",
        cart: userCart,
      });
    }

    const guestCart = await Cart.findOne({ guestId });
    if (!guestCart || !guestCart.items?.length) {
      const userCart = await Cart.findOne({ user: userId }).populate("items.product");
      return res.status(200).json({
        success: true,
        message: "No guest items to merge",
        cart: userCart,
      });
    }

    let userCart = await Cart.findOne({ user: userId });
    if (!userCart) {
      userCart = new Cart({
        user: userId,
        items: [],
        totalAmount: 0,
      });
    }

    for (const gItem of guestCart.items) {
      const gProdId = gItem.product.toString();
      const gVarId = gItem.variantId ? gItem.variantId.toString() : null;

      const existingItem = userCart.items.find((uItem) => {
        const uProdId = uItem.product.toString();
        const uVarId = uItem.variantId ? uItem.variantId.toString() : null;
        return uProdId === gProdId && uVarId === gVarId;
      });

      if (existingItem) {
        existingItem.quantity = Number(existingItem.quantity) + Number(gItem.quantity);
        existingItem.price = gItem.price;
      } else {
        userCart.items.push({
          product: gItem.product,
          variantId: gItem.variantId,
          quantity: gItem.quantity,
          price: gItem.price,
        });
      }
    }

    userCart.totalAmount = userCart.items.reduce((total, item) => {
      return total + Number(item.price || 0) * Number(item.quantity || 0);
    }, 0);

    await userCart.save();
    await Cart.deleteOne({ _id: guestCart._id });

    await userCart.populate("items.product");

    return res.status(200).json({
      success: true,
      message: "Guest cart merged successfully into user cart",
      cart: userCart,
    });
  } catch (error) {
    console.error("Merge Cart Error:", error);
    return res.status(500).json({
      success: false,
      message: "Unable to merge cart",
      error: error.message,
    });
  }
};

// =====================================================
// EXPORTS
// =====================================================

module.exports = {
  addToCart,
  getCart,
  updateCartQuantity,
  removeFromCart,
  clearCart,
  mergeCart,
};
