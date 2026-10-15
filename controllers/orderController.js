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
        product: product._id,
        variantId: variant ? variant._id : null,

        name: variant
          ? `${product.name} - ${variant.title}`
          : product.name,

        sku: variant
          ? variant.sku
          : product._id.toString(),

        quantity,
        price,
        total: itemTotal,

        // =================================================
        // SHIPPING PACKAGE DETAILS
        // =================================================

        weight: variant
          ? Number(variant.weight)
          : 0,

        length: variant
          ? Number(variant.length)
          : 0,

        breadth: variant
          ? Number(variant.breadth)
          : 0,

        height: variant
          ? Number(variant.height)
          : 0,
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
    // RESOLVE INITIAL SHIPPING ADDRESS
    // =================================================
    let initialShippingAddress = null;

    if (
      req.body.shippingAddress &&
      typeof req.body.shippingAddress === "object" &&
      req.body.shippingAddress.address &&
      req.body.shippingAddress.address !== "Customer Address"
    ) {
      initialShippingAddress = {
        name: req.body.shippingAddress.name || user.name || "Customer",
        phone: req.body.shippingAddress.phone || user.phone || "9999999999",
        email: req.body.shippingAddress.email || user.email || "",
        address: req.body.shippingAddress.address,
        address2: req.body.shippingAddress.address2 || "",
        city: req.body.shippingAddress.city || "Meerut",
        state: req.body.shippingAddress.state || "Uttar Pradesh",
        pincode: String(req.body.shippingAddress.pincode || "250002"),
        country: req.body.shippingAddress.country || "India",
      };
    } else {
      const Address = require("../models/address");
      const savedAddress = await Address.findOne({ user: userId })
        .sort({ isDefault: -1, updatedAt: -1 })
        .lean();

      if (
        savedAddress &&
        savedAddress.address &&
        savedAddress.address !== "Customer Address"
      ) {
        initialShippingAddress = {
          name: savedAddress.name || user.name || "Customer",
          phone: savedAddress.phone || user.phone || "9999999999",
          email: savedAddress.email || user.email || "",
          address: savedAddress.address,
          address2: savedAddress.address2 || "",
          city: savedAddress.city || "Meerut",
          state: savedAddress.state || "Uttar Pradesh",
          pincode: String(savedAddress.pincode || "250002"),
          country: savedAddress.country || "India",
        };
      } else {
        const lastOrder = await Order.findOne({
          user: userId,
          "shippingAddress.address": {
            $exists: true,
            $nin: [null, "", "Customer Address"],
          },
        })
          .sort({ createdAt: -1 })
          .lean();

        if (lastOrder?.shippingAddress?.address) {
          initialShippingAddress = lastOrder.shippingAddress;
        }
      }
    }

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

        subtotal,

        shippingCharge,

        totalAmount:
          finalTotalAmount,

        paymentMethod,

        paymentStatus:
          "PENDING",

        orderStatus:
          "PENDING",

        shippingAddress:
          initialShippingAddress || null,

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

    // Auto-sync active orders with FastRR (if pending online payments or missing shiprocket order)
    const pendingFastrrOrders = orders.filter(
      (o) =>
        (o.paymentMethod === "ONLINE" && o.paymentStatus === "PROCESSING") ||
        (o.orderStatus === "CONFIRMED" && !o.shiprocket?.orderId)
    );

    if (pendingFastrrOrders.length > 0) {
      try {
        const {
          syncFastrrOrder,
          isPaymentSuccessful,
          isPaymentFailed,
          markOrderAndPaymentFailed,
        } = require("./paymentController");
        for (const o of pendingFastrrOrders) {
          const payment = await Payment.findOne({ order: o._id });
          if (payment && payment.gatewayOrderId) {
            try {
              const checkoutDetails = await fetchFastRROrderDetails(
                String(payment.gatewayOrderId)
              );
              if (isPaymentSuccessful(null, checkoutDetails, null)) {
                await syncFastrrOrder(o, payment, checkoutDetails, null);
              } else if (isPaymentFailed(null, checkoutDetails, null)) {
                await markOrderAndPaymentFailed(
                  o,
                  payment,
                  checkoutDetails?.result?.error ||
                    checkoutDetails?.message ||
                    "Payment cancelled / failed in FastRR",
                  checkoutDetails
                );
              }
            } catch (_) {}
          }
        }
      } catch (fastrrSyncErr) {
        console.warn("Could not auto-sync FastRR in getMyOrders:", fastrrSyncErr.message);
      }
    }

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

    // Auto-resolve missing delivery addresses
    const ordersMissingAddress = orders.filter(
      (o) =>
        !o.shippingAddress ||
        !o.shippingAddress.address ||
        o.shippingAddress.address === "Customer Address"
    );

    if (ordersMissingAddress.length > 0) {
      try {
        const { resolveAndSaveOrderAddress } = require("./paymentController");
        for (const o of ordersMissingAddress) {
          const resolved = await resolveAndSaveOrderAddress(o);
          if (resolved) {
            const refreshed = await Order.findById(o._id).lean();
            if (refreshed?.shippingAddress) {
              o.shippingAddress = refreshed.shippingAddress;
            }
          }
        }
      } catch (addrErr) {
        console.warn("Could not auto-resolve address in getMyOrders:", addrErr.message);
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
          const {
            syncFastrrOrder,
            isPaymentSuccessful,
            isPaymentFailed,
            markOrderAndPaymentFailed,
          } = require("./paymentController");
          let checkoutDetails = await fetchFastRROrderDetails(
            String(payment.gatewayOrderId)
          );

          let isSuccess = isPaymentSuccessful(null, checkoutDetails, null);

          // If still INITIATED / PROCESSING and this is ONLINE payment, wait 2s and retry once
          // (card 3DS payment settlements typically take 1-2 seconds after bank OTP redirect)
          const cdStatus = String(
            checkoutDetails?.result?.status || checkoutDetails?.status || ""
          ).toUpperCase();

          if (
            !isSuccess &&
            order.paymentMethod === "ONLINE" &&
            (cdStatus === "INITIATED" || cdStatus === "PROCESSING" || cdStatus === "")
          ) {
            console.log(
              `[Order Sync] Order ${order.orderId} in FastRR is ${cdStatus}, waiting 2s for 3DS settlement...`
            );
            await new Promise((resolve) => setTimeout(resolve, 2000));
            try {
              checkoutDetails = await fetchFastRROrderDetails(
                String(payment.gatewayOrderId)
              );
              isSuccess = isPaymentSuccessful(null, checkoutDetails, null);
            } catch (_) {}
          }

          if (isSuccess) {
            await syncFastrrOrder(order, payment, checkoutDetails, null);
            const syncedOrder = await Order.findById(order._id)
              .populate("items.product", "name salePrice images sku variants")
              .populate("paymentId");
            if (syncedOrder) {
              return res.status(200).json({
                success: true,
                order: syncedOrder,
              });
            }
          } else if (isPaymentFailed(null, checkoutDetails, null)) {
            await markOrderAndPaymentFailed(
              order,
              payment,
              checkoutDetails?.result?.error ||
                checkoutDetails?.message ||
                "Payment cancelled / failed in FastRR",
              checkoutDetails
            );
            const syncedOrder = await Order.findById(order._id)
              .populate("items.product", "name salePrice images sku variants")
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

    // Auto-resolve missing delivery address
    if (
      !order.shippingAddress ||
      !order.shippingAddress.address ||
      order.shippingAddress.address === "Customer Address"
    ) {
      try {
        const { resolveAndSaveOrderAddress } = require("./paymentController");
        const resolved = await resolveAndSaveOrderAddress(order);
        if (resolved) {
          const refreshed = await Order.findById(order._id)
            .populate("items.product", "name salePrice images sku variants")
            .populate("paymentId");
          if (refreshed) order = refreshed;
        }
      } catch (addrErr) {
        console.warn("Could not auto-resolve address in getOrderById:", addrErr.message);
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
    const userId =
      req.user?.userId ||
      req.userId;

    const id = req.params.id;

    const query = {
      user: userId,
    };

    if (mongoose.isValidObjectId(id)) {
      query._id = id;
    } else {
      query.orderId = id;
    }

    const order =
      await Order.findOne(query);

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
        "OUT_FOR_DELIVERY",
        "DELIVERED",
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

    if (order.orderStatus === "CANCELLED") {
      return res.status(200).json({
        success: true,
        message: "Order is already cancelled",
        order,
      });
    }

    const reason =
      req.body?.reason ||
      req.body?.cancellationReason ||
      "Cancelled by user";

    order.orderStatus =
      "CANCELLED";

    order.cancelledAt =
      new Date();

    order.cancellationReason =
      reason;

    if (
      order.paymentStatus === "PROCESSING" ||
      order.paymentStatus === "PENDING"
    ) {
      order.paymentStatus = "FAILED";
    }

    await order.save();

    const payment = await Payment.findOne({ order: order._id });
    if (
      payment &&
      (payment.status === "PROCESSING" || payment.status === "PENDING")
    ) {
      payment.status = "FAILED";
      payment.failureReason = reason;
      await payment.save();
    }

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
      error: error.message,
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
// UPDATE ORDER SHIPPING ADDRESS (From FastRR Checkout Modal)
// =====================================================

const updateShippingAddress = async (req, res) => {
  try {
    const userId = req.user?.userId;
    const { id } = req.params;
    const { shippingAddress } = req.body;

    if (!userId) {
      return res.status(401).json({
        success: false,
        message: "Unauthorized",
      });
    }

    const order = await Order.findOne({
      $or: [
        { orderId: id },
        { _id: mongoose.isValidObjectId(id) ? id : null },
      ],
      user: userId,
    });

    if (!order) {
      return res.status(404).json({
        success: false,
        message: "Order not found",
      });
    }

    if (shippingAddress && typeof shippingAddress === "object") {
      const line1 =
        shippingAddress.line1 ||
        shippingAddress.address1 ||
        shippingAddress.address ||
        shippingAddress.address_line1 ||
        "";

      if (line1 && line1 !== "Customer Address") {
        const rawFullName = [
          shippingAddress.first_name || shippingAddress.firstName,
          shippingAddress.last_name || shippingAddress.lastName,
        ]
          .filter(Boolean)
          .join(" ")
          .trim();

        order.shippingAddress = {
          name:
            shippingAddress.name ||
            rawFullName ||
            order.shippingAddress?.name ||
            "Customer",
          phone:
            String(
              shippingAddress.phone ||
              shippingAddress.mobile ||
              shippingAddress.phone_number ||
              order.shippingAddress?.phone ||
              "9999999999"
            ).replace(/\D/g, "").slice(-10) || "9999999999",
          email:
            shippingAddress.email ||
            order.shippingAddress?.email ||
            "",
          address: line1,
          address2:
            shippingAddress.line2 ||
            shippingAddress.address2 ||
            shippingAddress.address_line2 ||
            "",
          city: shippingAddress.city || "Meerut",
          state:
            shippingAddress.state ||
            shippingAddress.province ||
            "Uttar Pradesh",
          pincode: String(
            shippingAddress.pincode ||
            shippingAddress.zip ||
            shippingAddress.postal_code ||
            "250002"
          ).trim(),
          country: shippingAddress.country || "India",
        };

        order.markModified("shippingAddress");
        await order.save();
      }
    }

    return res.status(200).json({
      success: true,
      message: "Order shipping address updated",
      shippingAddress: order.shippingAddress,
    });
  } catch (error) {
    console.error("UPDATE SHIPPING ADDRESS ERROR:", error);
    return res.status(500).json({
      success: false,
      message: "Unable to update shipping address",
      error: error.message,
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

  updateShippingAddress,
};