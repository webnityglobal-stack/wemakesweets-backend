const mongoose = require("mongoose");

const Order = require("../models/order");
const Product = require("../models/product");
const User = require("../models/user");
const Payment = require("../models/payment");

const {
  createShiprocketOrder,
} = require("../services/shiprocketService");
const {
  fetchFastRROrderDetails,
} = require("../services/fastrrService");
const whatsappService = require("../services/whatsappService");

// =====================================================
// CREATE / PLACE ORDER
// =====================================================

const createOrder = async (req, res) => {
  try {
    const {
      items,
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

    if (
      !req.user ||
      !req.user.userId
    ) {
      return res.status(401).json({
        success: false,
        message:
          "Authentication required",
      });
    }

    const userId =
      req.user.userId;

    const user =
      await User.findById(
        userId
      );

    if (!user) {
      return res.status(401).json({
        success: false,
        message:
          "User not found",
      });
    }

    // =================================================
    // VALIDATE ITEMS
    // =================================================

    if (
      !Array.isArray(items) ||
      items.length === 0
    ) {
      return res.status(400).json({
        success: false,
        message:
          "Order must contain at least one product",
      });
    }

    // =================================================
    // VALIDATE PAYMENT METHOD
    // =================================================

    if (
      ![
        "ONLINE",
        "COD",
      ].includes(
        paymentMethod
      )
    ) {
      return res.status(400).json({
        success: false,
        message:
          "Invalid payment method. Use ONLINE or COD.",
      });
    }

    // =================================================
    // PREPARE ORDER ITEMS
    // =================================================

    const orderItems = [];

    let totalAmount = 0;

    for (
      const item of items
    ) {
      console.log(
        "========== ORDER ITEM DEBUG =========="
      );

      console.log(
        "Received item:",
        JSON.stringify(
          item,
          null,
          2
        )
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
        Number(
          item.quantity
        );

      if (
        !quantity ||
        quantity < 1
      ) {
        return res.status(400).json({
          success: false,
          message:
            "Product quantity must be at least 1",
        });
      }

      // -----------------------------------------------
      // PRODUCT
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
          Number(
            variant.stock
          ) <
          quantity
        ) {
          return res.status(400).json({
            success: false,
            message:
              `Insufficient stock for ${product.name} - ${variant.title}`,
          });
        }
      } else {
        if (
          Number(
            product.stock
          ) <
          quantity
        ) {
          return res.status(400).json({
            success: false,
            message:
              `Insufficient stock for ${product.name}`,
          });
        }
      }

      // -----------------------------------------------
      // PRICE
      // -----------------------------------------------

      const price =
        variant
          ? Number(
              variant.salePrice
            )
          : Number(
              product.salePrice
            );

      if (
        !Number.isFinite(
          price
        ) ||
        price < 0
      ) {
        return res.status(400).json({
          success: false,
          message:
            `Invalid price for ${product.name}`,
        });
      }

      // -----------------------------------------------
      // TOTAL
      // -----------------------------------------------

      const itemTotal =
        price * quantity;

      totalAmount +=
        itemTotal;

      // -----------------------------------------------
      // ORDER ITEM
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
    // CALCULATE SUBTOTAL & SHIPPING CHARGE
    // =================================================

    const subtotal = totalAmount;

    // Delivery charge rule:
    // If passed explicitly from client, use it; otherwise standard rule: free if subtotal >= 350, else 49.
    const shippingCharge =
      req.body.shippingCharge !== undefined
        ? Math.max(0, Number(req.body.shippingCharge) || 0)
        : subtotal >= 350 || subtotal === 0
        ? 0
        : 49;

    const finalTotalAmount = subtotal + shippingCharge;

    // =================================================
    // GENERATE ORDER ID
    // =================================================

    const orderId =
      `WMS-${Date.now()}`;

    // =================================================
    // CREATE ORDER
    // =================================================
    //
    // IMPORTANT:
    // NO SHIPPING ADDRESS HERE.
    //
    // FastRR Checkout will collect address.
    //
    // =================================================

    const order =
      await Order.create({
        user:
          userId,

        orderId,

        items:
          orderItems,

        subtotal,

        shippingCharge,

        totalAmount:
          finalTotalAmount,

        paymentMethod,

        paymentStatus:
          "PENDING",

        orderStatus:
          "PENDING",

        // Address will come from FastRR webhook
        shippingAddress:
          null,

        shiprocket: {
          orderId:
            null,

          shipmentId:
            null,

          awbCode:
            null,

          courierName:
            null,

          courierId:
            null,

          status:
            null,

          trackingUrl:
            null,

          pickupScheduled:
            false,

          pickupDate:
            null,
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
          finalTotalAmount,

        currency:
          "INR",

        paymentMethod:
          paymentMethod,

        gateway:
          "FASTRR",

        status:
          "PENDING",
      });

    // =================================================
    // SAVE PAYMENT REFERENCE
    // =================================================

    order.paymentId =
      payment._id;

    await order.save();

    // =================================================
    // RESPONSE
    // =================================================

    return res.status(201).json({
      success: true,

      message:
        "Order created. Proceed to FastRR checkout.",

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
          null,
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

      checkoutRequired:
        true,
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

const getMyOrders = async (
  req,
  res
) => {
  try {
    const userId =
      req.userId ||
      req.user?.userId;

    const orders =
      await Order.find({
        user:
          userId,
      })
        .populate(
          "items.product",
          "name salePrice images sku variants"
        )
        .populate(
          "paymentId"
        )
        .sort({
          createdAt: -1,
        });

    // Auto-sync active orders with Shiprocket (if cancelled or updated on Shiprocket)
    const activeOrders = orders.filter(
      (o) =>
        o.orderStatus !== "CANCELLED" &&
        o.orderStatus !== "DELIVERED" &&
        (o.shiprocket?.shipmentId || o.shiprocket?.orderId)
    );

    if (activeOrders.length > 0) {
      try {
        const { syncOrderShiprocketStatus } = require("./shiprocketController");
        await Promise.allSettled(
          activeOrders.map((o) => syncOrderShiprocketStatus(o))
        );
      } catch (syncErr) {
        console.warn("Could not auto-sync Shiprocket in getMyOrders:", syncErr.message);
      }
    }

    return res.status(200).json({
      success: true,

      count:
        orders.length,

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

const getOrderById = async (
  req,
  res
) => {
  try {
    const {
      id,
    } = req.params;

    const userId =
      req.user?.userId ||
      req.userId;

    const query = {
      user:
        userId,
    };

    if (
      mongoose.isValidObjectId(
        id
      )
    ) {
      query._id =
        id;
    } else {
      query.orderId =
        id;
    }

    const order =
      await Order.findOne(
        query
      )
        .populate(
          "items.product",
          "name salePrice images sku variants"
        )
        .populate(
          "paymentId"
        );

    if (!order) {
      return res.status(404).json({
        success: false,
        message:
          "Order not found",
      });
    }

    // Auto-sync with FastRR if order is not confirmed or shiprocket not created
    if (order.orderStatus !== "CONFIRMED" || !order.shiprocket?.orderId) {
      try {
        const payment = await Payment.findOne({ order: order._id });
        if (payment && payment.gatewayOrderId) {
          const checkoutDetails = await fetchFastRROrderDetails(
            String(payment.gatewayOrderId)
          );
          const status = String(
            checkoutDetails?.result?.status || checkoutDetails?.status || ""
          ).toUpperCase();

          if (status === "SUCCESS") {
            const { syncFastrrOrder } = require("./paymentController");
            await syncFastrrOrder(order, payment, checkoutDetails, null);
            const syncedOrder = await Order.findById(order._id)
              .populate("items.product", "name price images sku")
              .populate("paymentId");
            if (syncedOrder) {
              return res.status(200).json({
                success: true,
                order: syncedOrder,
              });
            }
          }
        }
      } catch (syncErr) {
        console.warn("Could not auto-sync FastRR in getOrderById:", syncErr.message);
      }
    }

    // Auto-sync with Shiprocket if order is not delivered and not cancelled
    if (
      order.orderStatus !== "CANCELLED" &&
      order.orderStatus !== "DELIVERED" &&
      (order.shiprocket?.shipmentId || order.shiprocket?.orderId)
    ) {
      try {
        const { syncOrderShiprocketStatus } = require("./shiprocketController");
        await syncOrderShiprocketStatus(order);
      } catch (srSyncErr) {
        console.warn("Could not auto-sync Shiprocket in getOrderById:", srSyncErr.message);
      }
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

const cancelOrder = async (
  req,
  res
) => {
  try {
    const order =
      await Order.findOne({
        _id:
          req.params.id,

        user:
          req.user?.userId ||
          req.userId,
      });

    if (!order) {
      return res.status(404).json({
        success: false,
        message:
          "Order not found",
      });
    }

    const nonCancellableStatuses =
      [
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

    order.cancelledAt =
      new Date();

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

const getAllOrders = async (
  req,
  res
) => {
  try {
    const orders =
      await Order.find()
        .populate(
          "user",
          "name email phone"
        )
        .populate(
          "items.product",
          "name salePrice images sku variants"
        )
        .populate(
          "paymentId"
        )
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

const updateOrderStatus =
  async (
    req,
    res
  ) => {
    try {
      const {
        orderStatus,
      } = req.body;

      const allowedStatuses =
        [
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