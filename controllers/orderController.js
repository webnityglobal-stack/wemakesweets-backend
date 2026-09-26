// controllers/orderController.js

const mongoose = require("mongoose");

const Order = require("../models/order");
const Product = require("../models/product");
const User = require("../models/user");
const Payment = require("../models/payment");

const {
  createShiprocketOrder,
} = require("../services/shiprocketService");

const whatsappService = require("../services/whatsappService");

// =====================================================
// CREATE / PLACE ORDER
// =====================================================

const createOrder = async (req, res) => {
  try {
    const {
      items,
      shippingAddress,
    } = req.body;

    // =================================================
    // NORMALIZE PAYMENT METHOD
    // =================================================

    const paymentMethod = String(
      req.body.paymentMethod || ""
    )
      .trim()
      .toUpperCase();

    // =================================================
    // AUTHENTICATION
    // =================================================

    if (!req.user || !req.user.userId) {
      return res.status(401).json({
        success: false,
        message: "Authentication required",
      });
    }

    const userId = req.user.userId;

    const user = await User.findById(userId);

    if (!user) {
      return res.status(401).json({
        success: false,
        message: "User not found",
      });
    }

    // =================================================
    // VALIDATE ITEMS
    // =================================================

    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({
        success: false,
        message:
          "Order must contain at least one product",
      });
    }

    // =================================================
    // VALIDATE PAYMENT METHOD
    // =================================================

    if (!["ONLINE", "COD"].includes(paymentMethod)) {
      return res.status(400).json({
        success: false,
        message:
          "Invalid payment method. Use ONLINE or COD.",
      });
    }

    console.log(
      "========================================"
    );

    console.log(
      "CREATE ORDER PAYMENT METHOD:",
      paymentMethod
    );

    console.log(
      "========================================"
    );

    // =================================================
    // VALIDATE SHIPPING ADDRESS
    // =================================================

    if (!shippingAddress) {
      return res.status(400).json({
        success: false,
        message:
          "Shipping address is required",
      });
    }

    const requiredAddressFields = [
      "name",
      "phone",
      "address",
      "city",
      "state",
      "pincode",
    ];

    for (const field of requiredAddressFields) {
      if (!shippingAddress[field]) {
        return res.status(400).json({
          success: false,
          message:
            `${field} is required in shipping address`,
        });
      }
    }

    // =================================================
    // PREPARE ORDER ITEMS
    // =================================================

    const orderItems = [];

    let totalAmount = 0;

    for (const item of items) {
      console.log(
        "========== ORDER ITEM DEBUG =========="
      );

      console.log(
        "Received item:",
        JSON.stringify(item, null, 2)
      );

      console.log(
        "Product ID:",
        item.product
      );

      console.log(
        "Variant ID:",
        item.variantId
      );

      console.log(
        "Quantity:",
        item.quantity
      );

      console.log(
        "======================================"
      );

      // -----------------------------------------------
      // PRODUCT ID
      // -----------------------------------------------

      if (!item.product) {
        return res.status(400).json({
          success: false,
          message:
            "Product ID is required",
        });
      }

      // -----------------------------------------------
      // QUANTITY
      // -----------------------------------------------

      const quantity =
        Number(item.quantity);

      if (!quantity || quantity < 1) {
        return res.status(400).json({
          success: false,
          message:
            "Product quantity must be at least 1",
        });
      }

      // -----------------------------------------------
      // GET PRODUCT
      // -----------------------------------------------

      const product =
        await Product.findById(
          item.product
        );

      if (!product) {
        return res.status(404).json({
          success: false,
          message:
            `Product not found: ${item.product}`,
        });
      }

      console.log(
        "========== VARIANT DEBUG =========="
      );

      console.log(
        "Product variants:",
        product.variants.map((v) => ({
          id: String(v._id),
          title: v.title,
          salePrice: v.salePrice,
          sku: v.sku,
          stock: v.stock,
        }))
      );

      console.log(
        "Requested variantId:",
        item.variantId
      );

      console.log(
        "==================================="
      );

      // -----------------------------------------------
      // VARIANT
      // -----------------------------------------------

      let variant = null;

      if (item.variantId) {
        variant =
          product.variants.id(
            item.variantId
          );

        if (!variant) {
          return res.status(400).json({
            success: false,
            message:
              `Variant not found for ${item.variantId}`,
          });
        }

        if (
          Number(variant.stock) <
          quantity
        ) {
          return res.status(400).json({
            success: false,
            message:
              `Insufficient stock for ${product.name} - ${variant.title}`,
          });
        }
      }

      // -----------------------------------------------
      // ACTUAL PRICE
      // -----------------------------------------------

      const price = variant
        ? Number(variant.salePrice)
        : Number(product.salePrice);

      if (
        !Number.isFinite(price) ||
        price < 0
      ) {
        return res.status(400).json({
          success: false,
          message:
            `Invalid price for ${product.name}`,
        });
      }

      // -----------------------------------------------
      // ITEM TOTAL
      // -----------------------------------------------

      const itemTotal =
        price * quantity;

      totalAmount += itemTotal;

      // -----------------------------------------------
      // ADD ORDER ITEM
      // -----------------------------------------------

      orderItems.push({
        product:
          product._id,

        variantId:
          variant
            ? variant._id
            : null,

        name:
          variant
            ? `${product.name} - ${variant.title}`
            : product.name,

        sku:
          variant
            ? variant.sku
            : product._id.toString(),

        quantity,

        price,

        total:
          itemTotal,
      });
    }

    // =================================================
    // GENERATE ORDER ID
    // =================================================

    const orderId =
      `WMS-${Date.now()}`;

    // =================================================
    // CREATE ORDER
    // =================================================

    const order =
      await Order.create({
        user:
          userId,

        orderId,

        items:
          orderItems,

        totalAmount,

        // IMPORTANT
        // This will now always be the normalized
        // value: COD OR ONLINE
        paymentMethod,

        paymentStatus:
          "PENDING",

        orderStatus:
          "PENDING",

        shippingAddress: {
          name:
            shippingAddress.name,

          phone:
            shippingAddress.phone,

          email:
            shippingAddress.email ||
            req.user.email ||
            "",

          address:
            shippingAddress.address,

          address2:
            shippingAddress.address2 ||
            "",

          city:
            shippingAddress.city,

          state:
            shippingAddress.state,

          pincode:
            shippingAddress.pincode,

          country:
            shippingAddress.country ||
            "India",
        },

        shiprocket: {
          orderId: null,

          shipmentId: null,

          awbCode: null,

          courierName: null,

          courierId: null,

          status: null,

          trackingUrl: null,

          pickupScheduled: false,

          pickupDate: null,
        },
      });

    // =================================================
    // CREATE PAYMENT DOCUMENT
    // =================================================

    const payment =
      await Payment.create({
        order:
          order._id,

        orderId:
          order.orderId,

        user:
          userId,

        amount:
          totalAmount,

        currency:
          "INR",

        paymentMethod:
          paymentMethod,

        gateway:
          paymentMethod === "ONLINE"
            ? "FASTRR"
            : "COD",

        status:
          "PENDING",
      });

    // =================================================
    // SAVE PAYMENT REFERENCE
    // =================================================

    order.paymentId =
      payment._id;

    await order.save();

    console.log(
      "========================================"
    );

    console.log(
      "ORDER CREATED"
    );

    console.log(
      "Order ID:",
      order.orderId
    );

    console.log(
      "Payment Method:",
      order.paymentMethod
    );

    console.log(
      "Payment Status:",
      order.paymentStatus
    );

    console.log(
      "Payment Gateway:",
      payment.gateway
    );

    console.log(
      "Payment Method:",
      payment.paymentMethod
    );

    console.log(
      "========================================"
    );

    // =================================================
    // COD FLOW
    // =================================================

    if (
      paymentMethod === "COD"
    ) {
      try {
        const shiprocketItems =
          order.items.map(
            (item) => ({
              name:
                item.name,

              sku:
                item.sku ||
                item.product.toString(),

              units:
                Number(item.quantity),

              selling_price:
                Number(item.price),
            })
          );

        const shiprocketOrderData = {
          order_id:
            order.orderId,

          order_date:
            order.createdAt
              ? order.createdAt.toISOString()
              : new Date().toISOString(),

          pickup_location:
            process.env
              .SHIPROCKET_PICKUP_LOCATION,

          comment:
            "We Make Sweets Order",

          // ==========================================
          // BILLING
          // ==========================================

          billing_customer_name:
            shippingAddress.name,

          billing_last_name:
            "",

          billing_address:
            shippingAddress.address,

          billing_address_2:
            shippingAddress.address2 ||
            "",

          billing_city:
            shippingAddress.city,

          billing_pincode:
            shippingAddress.pincode,

          billing_state:
            shippingAddress.state,

          billing_country:
            shippingAddress.country ||
            "India",

          billing_email:
            shippingAddress.email ||
            user.email ||
            "",

          billing_phone:
            shippingAddress.phone,

          // ==========================================
          // SHIPPING
          // ==========================================

          shipping_is_billing:
            true,

          shipping_customer_name:
            shippingAddress.name,

          shipping_last_name:
            "",

          shipping_address:
            shippingAddress.address,

          shipping_address_2:
            shippingAddress.address2 ||
            "",

          shipping_city:
            shippingAddress.city,

          shipping_pincode:
            shippingAddress.pincode,

          shipping_state:
            shippingAddress.state,

          shipping_country:
            shippingAddress.country ||
            "India",

          shipping_email:
            shippingAddress.email ||
            user.email ||
            "",

          shipping_phone:
            shippingAddress.phone,

          // ==========================================
          // PRODUCTS
          // ==========================================

          order_items:
            shiprocketItems,

          // ==========================================
          // PAYMENT
          // ==========================================

          payment_method:
            "COD",

          // ==========================================
          // CHARGES
          // ==========================================

          shipping_charges:
            0,

          giftwrap_charges:
            0,

          transaction_charges:
            0,

          total_discount:
            0,

          sub_total:
            Number(totalAmount),

          // ==========================================
          // PACKAGE
          // ==========================================

          length:
            Number(
              process.env
                .SHIPROCKET_PACKAGE_LENGTH
            ) || 20,

          breadth:
            Number(
              process.env
                .SHIPROCKET_PACKAGE_BREADTH
            ) || 15,

          height:
            Number(
              process.env
                .SHIPROCKET_PACKAGE_HEIGHT
            ) || 10,

          weight:
            Number(
              process.env
                .SHIPROCKET_PACKAGE_WEIGHT
            ) || 0.5,
        };

        console.log(
          "========================================"
        );

        console.log(
          "CREATING SHIPROCKET COD ORDER"
        );

        console.log(
          JSON.stringify(
            shiprocketOrderData,
            null,
            2
          )
        );

        console.log(
          "========================================"
        );

        const shiprocketResponse =
          await createShiprocketOrder(
            shiprocketOrderData
          );

        console.log(
          "Shiprocket COD Order Response:",
          shiprocketResponse
        );

        // ==========================================
        // SAVE SHIPROCKET DETAILS
        // ==========================================

        order.shiprocket.orderId =
          shiprocketResponse?.order_id ||
          null;

        order.shiprocket.shipmentId =
          shiprocketResponse?.shipment_id ||
          null;

        order.shiprocket.status =
          "ORDER_CREATED";

        // ==========================================
        // COD ORDER CONFIRMED
        // ==========================================

        order.orderStatus =
          "CONFIRMED";

        // Payment remains PENDING
        // because COD is not paid yet.

        order.paymentStatus =
          "PENDING";

        payment.status =
          "PENDING";

        await payment.save();

        await order.save();

        // ==========================================
        // WHATSAPP
        // ==========================================

        whatsappService
          .sendOrderStatusNotification(
            order,
            "CONFIRMED"
          )
          .catch(
            (waErr) =>
              console.error(
                "WhatsApp COD confirmation notification error:",
                waErr.message
              )
          );

      } catch (
        shiprocketError
      ) {
        console.error(
          "Shiprocket COD Order Creation Failed:",
          shiprocketError
            ?.response
            ?.data ||
          shiprocketError.message
        );

        return res.status(500).json({
          success: false,

          message:
            "Order created but Shiprocket order creation failed",

          orderId:
            order.orderId,

          paymentId:
            payment._id,

          paymentMethod:
            order.paymentMethod,

          paymentStatus:
            order.paymentStatus,

          error:
            shiprocketError
              ?.response
              ?.data ||
            shiprocketError.message,
        });
      }
    }

    // =================================================
    // ONLINE PAYMENT FLOW
    // =================================================

    if (
      paymentMethod === "ONLINE"
    ) {
      return res.status(201).json({
        success: true,

        message:
          "Order created. Proceed to online payment.",

        order: {
          id:
            order._id,

          orderId:
            order.orderId,

          items:
            order.items,

          totalAmount:
            order.totalAmount,

          paymentMethod:
            order.paymentMethod,

          paymentStatus:
            order.paymentStatus,

          orderStatus:
            order.orderStatus,

          shippingAddress:
            order.shippingAddress,
        },

        payment: {
          paymentId:
            payment._id,

          amount:
            payment.amount,

          gateway:
            payment.gateway,

          paymentMethod:
            payment.paymentMethod,

          status:
            payment.status,
        },

        paymentRequired:
          true,
      });
    }

    // =================================================
    // COD SUCCESS RESPONSE
    // =================================================

    return res.status(201).json({
      success: true,

      message:
        "COD order placed successfully",

      order: {
        id:
          order._id,

        orderId:
          order.orderId,

        items:
          order.items,

        totalAmount:
          order.totalAmount,

        paymentMethod:
          order.paymentMethod,

        paymentStatus:
          order.paymentStatus,

        orderStatus:
          order.orderStatus,

        shippingAddress:
          order.shippingAddress,

        shiprocket:
          order.shiprocket,

        createdAt:
          order.createdAt,
      },

      payment: {
        paymentId:
          payment._id,

        amount:
          payment.amount,

        gateway:
          payment.gateway,

        paymentMethod:
          payment.paymentMethod,

        status:
          payment.status,
      },
    });

  } catch (error) {
    console.error(
      "Create Order Error:",
      error
    );

    return res.status(500).json({
      success: false,

      message:
        "Unable to place order",

      error:
        error.message,
    });
  }
};

// =====================================================
// GET MY ORDERS
// =====================================================

const getMyOrders = async (req, res) => {
  try {
    const orders =
      await Order.find({
        user: req.userId,
      })
        .populate(
          "items.product",
          "name price images sku"
        )
        .populate("paymentId")
        .sort({
          createdAt: -1,
        });

    return res.status(200).json({
      success: true,
      count: orders.length,
      orders,
    });
  } catch (error) {
    console.error(
      "Get My Orders Error:",
      error
    );

    return res.status(500).json({
      success: false,
      message:
        "Unable to fetch orders",
    });
  }
};

// =====================================================
// GET SINGLE ORDER
// =====================================================

const getOrderById = async (req, res) => {
  try {
    const { id } = req.params;

    const query = {
      user: req.user.userId,
    };

    if (mongoose.isValidObjectId(id)) {
      query._id = id;
    } else {
      query.orderId = id;
    }

    const order =
      await Order.findOne(query)
        .populate(
          "items.product",
          "name price images sku"
        )
        .populate("paymentId");

    if (!order) {
      return res.status(404).json({
        success: false,
        message:
          "Order not found",
      });
    }

    return res.status(200).json({
      success: true,
      order,
    });

  } catch (error) {
    console.error(
      "Get Order Error:",
      error
    );

    return res.status(500).json({
      success: false,
      message:
        "Unable to fetch order",
    });
  }
};

// =====================================================
// CANCEL ORDER
// =====================================================

const cancelOrder = async (req, res) => {
  try {
    const order =
      await Order.findOne({
        _id:
          req.params.id,

        user:
          req.user.userId,
      });

    if (!order) {
      return res.status(404).json({
        success: false,
        message:
          "Order not found",
      });
    }

    const nonCancellableStatuses = [
      "SHIPPED",
      "DELIVERED",
      "CANCELLED",
    ];

    if (
      nonCancellableStatuses.includes(
        order.orderStatus
      )
    ) {
      return res.status(400).json({
        success: false,
        message:
          "This order cannot be cancelled",
      });
    }

    order.orderStatus =
      "CANCELLED";

    await order.save();

    return res.status(200).json({
      success: true,
      message:
        "Order cancelled successfully",
      order,
    });

  } catch (error) {
    console.error(
      "Cancel Order Error:",
      error
    );

    return res.status(500).json({
      success: false,
      message:
        "Unable to cancel order",
    });
  }
};

// =====================================================
// ADMIN - GET ALL ORDERS
// =====================================================

const getAllOrders = async (req, res) => {
  try {
    const orders =
      await Order.find()
        .populate(
          "user",
          "name email phone"
        )
        .populate(
          "items.product",
          "name price images sku"
        )
        .populate("paymentId")
        .sort({
          createdAt: -1,
        });

    return res.status(200).json({
      success: true,
      count:
        orders.length,
      orders,
    });

  } catch (error) {
    console.error(
      "Get All Orders Error:",
      error
    );

    return res.status(500).json({
      success: false,
      message:
        "Unable to fetch orders",
    });
  }
};

// =====================================================
// ADMIN - UPDATE ORDER STATUS
// =====================================================

const updateOrderStatus = async (req, res) => {
  try {
    const {
      orderStatus,
    } = req.body;

    const allowedStatuses = [
      "PENDING",
      "CONFIRMED",
      "PROCESSING",
      "SHIPPED",
      "DELIVERED",
      "CANCELLED",
    ];

    if (
      !allowedStatuses.includes(
        orderStatus
      )
    ) {
      return res.status(400).json({
        success: false,
        message:
          "Invalid order status",
      });
    }

    const order =
      await Order.findById(
        req.params.id
      );

    if (!order) {
      return res.status(404).json({
        success: false,
        message:
          "Order not found",
      });
    }

    order.orderStatus =
      orderStatus;

    await order.save();

    whatsappService
      .sendOrderStatusNotification(
        order,
        orderStatus
      )
      .catch(
        (waErr) =>
          console.error(
            "WhatsApp status update notification error:",
            waErr.message
          )
      );

    return res.status(200).json({
      success: true,
      message:
        "Order status updated successfully",
      order,
    });

  } catch (error) {
    console.error(
      "Update Order Status Error:",
      error
    );

    return res.status(500).json({
      success: false,
      message:
        "Unable to update order status",
    });
  }
};

// =====================================================
// EXPORT
// =====================================================

module.exports = {
  createOrder,
  getMyOrders,
  getOrderById,
  cancelOrder,
  getAllOrders,
  updateOrderStatus,
};