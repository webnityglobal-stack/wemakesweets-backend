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
const {
  linkGuestDataToUser,
  autoLinkSingleOrderIfUserExists,
} = require("../utils/guestOrderLinker");

// =====================================================
// CREATE / PLACE ORDER
// =====================================================

const extractObjectId = (value) => {
  if (!value) return null;
  if (typeof value === "object") {
    const nested = value._id || value.id || null;
    return nested ? String(nested).trim() : null;
  }
  const str = String(value).trim();
  if (!str || ["null", "undefined"].includes(str.toLowerCase())) {
    return null;
  }
  return str;
};

const toNonNegativeNumber = (value, fallback = 0) => {
  const num = Number(value);
  return Number.isFinite(num) && num >= 0 ? num : fallback;
};

const normalizeOrderShippingAddress = (rawAddress, fallback = null) => {
  if (!rawAddress || typeof rawAddress !== "object") return null;

  const line1 = String(
    rawAddress.line1 ||
      rawAddress.address1 ||
      rawAddress.address ||
      rawAddress.address_line1 ||
      ""
  ).trim();

  if (!line1 || line1 === "Customer Address") return null;

  const rawFullName = [
    rawAddress.first_name || rawAddress.firstName,
    rawAddress.last_name || rawAddress.lastName,
  ]
    .filter(Boolean)
    .join(" ")
    .trim();

  const digits = String(
    rawAddress.phone ||
      rawAddress.mobile ||
      rawAddress.phone_number ||
      fallback?.phone ||
      "9999999999"
  )
    .replace(/\D/g, "")
    .slice(-10);

  return {
    name:
      String(rawAddress.name || rawFullName || fallback?.name || "").trim() ||
      "Customer",
    phone: /^\d{10}$/.test(digits) ? digits : "9999999999",
    email: String(rawAddress.email || fallback?.email || "").trim(),
    address: line1,
    address2: String(
      rawAddress.line2 || rawAddress.address2 || rawAddress.address_line2 || ""
    ).trim(),
    city: String(rawAddress.city || "").trim() || "Meerut",
    state:
      String(rawAddress.state || rawAddress.province || "").trim() ||
      "Uttar Pradesh",
    pincode:
      String(
        rawAddress.pincode ||
          rawAddress.zip ||
          rawAddress.postal_code ||
          ""
      ).trim() || "250002",
    country: String(rawAddress.country || "").trim() || "India",
  };
};

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
    // AUTHENTICATION & GUEST CHECK
    // =================================================

    const userId =
      req.userId ||
      req.user?.userId ||
      null;

    let user = null;
    if (userId) {
      const validUserId = userId && mongoose.isValidObjectId(userId) ? userId : null;
      user = validUserId ? await User.findById(validUserId) : null;
    }

    const validOrderUserId = userId && mongoose.isValidObjectId(userId) ? userId : null;
    const isGuest = !validOrderUserId;
    let guestId = isGuest
      ? (req.guestId ||
          req.headers["x-guest-id"] ||
          req.headers["guest-id"] ||
          req.body?.guestId ||
          req.query?.guestId ||
          `guest_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`)
      : null;

    // =================================================
    if (isGuest) {
      const cleanedGuest = guestId ? String(guestId).trim() : "";
      guestId =
        cleanedGuest && !["null", "undefined"].includes(cleanedGuest.toLowerCase())
          ? cleanedGuest
          : `guest_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
    }

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

      const resolvedProductId = extractObjectId(item?.product) || extractObjectId(item?.productId);
      if (!resolvedProductId) {
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

      if (!mongoose.isValidObjectId(resolvedProductId)) {
        return res.status(400).json({
          success: false,
          message: `Invalid product ID: ${resolvedProductId}`,
        });
      }

      const product =
        await Product.findById(
          resolvedProductId
        );

      if (!product) {
        return res.status(404).json({
          success: false,
          message:
            `Product not found: ${resolvedProductId}`,
        });
      }

      // -----------------------------------------------
      // VARIANT
      // -----------------------------------------------

      let variant = null;

      const resolvedVariantId = extractObjectId(item?.variantId);
      if (resolvedVariantId) {
        variant =
          product.variants.id(
            resolvedVariantId
          );

        if (!variant) {
          return res.status(400).json({
            success: false,
            message:
              `Variant not found for ${resolvedVariantId}`,
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
          ? (String(variant.sku || "").trim() || product._id.toString())
          : product._id.toString(),

        quantity,
        price,
        total: itemTotal,

        // =================================================
        // SHIPPING PACKAGE DETAILS
        // =================================================

        weight: variant
          ? toNonNegativeNumber(variant.weight)
          : 0,

        length: variant
          ? toNonNegativeNumber(variant.length)
          : 0,

        breadth: variant
          ? toNonNegativeNumber(variant.breadth)
          : 0,

        height: variant
          ? toNonNegativeNumber(variant.height)
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
      String(req.body.shippingAddress.address || "").trim() &&
      req.body.shippingAddress.address !== "Customer Address"
    ) {
      initialShippingAddress = {
        name: req.body.shippingAddress.name || user?.name || "Customer",
        phone: req.body.shippingAddress.phone || user?.phone || "9999999999",
        email: req.body.shippingAddress.email || user?.email || "",
        address: req.body.shippingAddress.address,
        address2: req.body.shippingAddress.address2 || "",
        city: req.body.shippingAddress.city || "Meerut",
        state: req.body.shippingAddress.state || "Uttar Pradesh",
        pincode: String(req.body.shippingAddress.pincode || "250002"),
        country: req.body.shippingAddress.country || "India",
      };
    } else if (validOrderUserId) {
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
          name: savedAddress.name || user?.name || "Customer",
          phone: savedAddress.phone || user?.phone || "9999999999",
          email: savedAddress.email || user?.email || "",
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
    initialShippingAddress = normalizeOrderShippingAddress(initialShippingAddress, user);

    // CREATE ORDER
    // =================================================

    const order =
      await Order.create({
        user:
          validOrderUserId || null,

        isGuest,

        guestId,

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
          validOrderUserId || null,

        isGuest,

        guestId,

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

    // Auto-link guest order if an account already exists for this mobile number
    if (isGuest && order.shippingAddress?.phone) {
      await autoLinkSingleOrderIfUserExists(order);
    }

    // =================================================
    // RESPONSE
    // =================================================

    return res.status(201).json({
      success: true,

      message:
        "Order created. Proceed to FastRR checkout.",

      isGuest,

      guestId,

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

    // Auto-link any guest orders placed with this user's mobile number
    if (userId && mongoose.isValidObjectId(userId)) {
      const currentUser = await User.findById(userId).select("_id phone name email");
      if (currentUser) {
        await linkGuestDataToUser(currentUser, null, { mergeCart: false });
      }
    }

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

    // Auto-sync active orders with FastRR (if pending online payments, missing shiprocket order, or not synced)
    const pendingFastrrOrders = orders.filter(
      (o) =>
        (o.paymentMethod === "ONLINE" &&
          (o.paymentStatus === "PROCESSING" || o.paymentStatus === "PENDING") &&
          (o.orderStatus === "PENDING" || o.orderStatus === "PROCESSING")) ||
        (o.orderStatus === "CONFIRMED" && (!o.shiprocket?.orderId || !o.fastrrSyncedAt))
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
                // FastRR ne explicitly failed bataya
                await markOrderAndPaymentFailed(
                  o,
                  payment,
                  checkoutDetails?.result?.error ||
                    checkoutDetails?.message ||
                    "Payment cancelled / failed in FastRR",
                  checkoutDetails
                );
                o.orderStatus = "CANCELLED";
                o.paymentStatus = "FAILED";
              } else if (
                (o.paymentStatus === "PROCESSING" || o.paymentStatus === "PENDING") &&
                o.paymentMethod === "ONLINE"
              ) {
                // Payment complete nahi hui (user ne cancel kiya ya timeout) — FAILED mark karo
                await markOrderAndPaymentFailed(
                  o,
                  payment,
                  "Payment not completed / cancelled by user",
                  checkoutDetails
                );
                o.orderStatus = "CANCELLED";
                o.paymentStatus = "FAILED";
              }
            } catch (syncErr) {
              // FastRR se connect nahi ho saka — PROCESSING orders ko bhi fail karo
              if (
                (o.paymentStatus === "PROCESSING" || o.paymentStatus === "PENDING") &&
                o.paymentMethod === "ONLINE"
              ) {
                await markOrderAndPaymentFailed(
                  o,
                  payment,
                  "Payment not completed / checkout cancelled"
                );
                o.orderStatus = "CANCELLED";
                o.paymentStatus = "FAILED";
              }
            }
          } else if (
            (o.paymentStatus === "PROCESSING" || o.paymentStatus === "PENDING") &&
            o.paymentMethod === "ONLINE"
          ) {
            // Gateway order ID bhi nahi hai — payment kab tak initiate nahi hua
            await markOrderAndPaymentFailed(
              o,
              payment,
              "Checkout abandoned before payment gateway initialization"
            );
            o.orderStatus = "CANCELLED";
            o.paymentStatus = "FAILED";
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
      req.userId ||
      req.user?.userId ||
      null;

    const query = {};

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

    let order =
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

    if (order.user && userId && order.user.toString() !== userId.toString() && req.user?.role !== "admin") {
      return res.status(403).json({
        success: false,
        message: "Access denied to this order",
      });
    }

    // If logged-in customer views their own previously-guest order, link it on the fly
    if (!order.user && userId && mongoose.isValidObjectId(userId)) {
      const currentUser = await User.findById(userId).select("_id phone name email");
      if (currentUser) {
        const linked = await linkGuestDataToUser(currentUser, req.guestId || null, {
          mergeCart: false,
        });
        if (linked.linkedOrderIds.some((oid) => oid.toString() === order._id.toString())) {
          order.user = currentUser._id;
          order.isGuest = false;
        }
      }
    }

    // Auto-sync with FastRR if order is not confirmed, shiprocket not created, or not synced
    if (order.orderStatus !== "CONFIRMED" || !order.shiprocket?.orderId || !order.fastrrSyncedAt) {
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
            // FastRR ne explicitly failed bataya
            await markOrderAndPaymentFailed(
              order,
              payment,
              checkoutDetails?.result?.error ||
                checkoutDetails?.message ||
                "Payment cancelled / checkout backed out",
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
          } else if (
            (order.paymentStatus === "PROCESSING" || order.paymentStatus === "PENDING") &&
            order.paymentMethod === "ONLINE"
          ) {
            // User ne cancel kiya — payment complete nahi hui, FAILED mark karo
            console.log(
              `[OrderById] ONLINE payment not completed for ${order.orderId}, marking FAILED.`
            );
            await markOrderAndPaymentFailed(
              order,
              payment,
              checkoutDetails?.result?.error ||
                checkoutDetails?.message ||
                "Payment not completed / cancelled by user",
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
      req.userId ||
      req.user?.userId ||
      null;

    const id = req.params.id;

    const query = {};
    if (userId && req.user?.role !== "admin") {
      if (mongoose.isValidObjectId(userId)) {
        const currentUser = await User.findById(userId).select("_id phone name email");
        if (currentUser) {
          await linkGuestDataToUser(currentUser, req.guestId || null, {
            mergeCart: false,
          });
        }
      }
      query.user = userId;
    }

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

      // Trigger WhatsApp Status Notification
      whatsappService
        .sendOrderStatusNotification(order, orderStatus)
        .catch((waErr) =>
          console.error("WhatsApp status notification error in orderController:", waErr.message)
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
// UPDATE ORDER SHIPPING ADDRESS (From FastRR Checkout Modal)
// =====================================================

const updateShippingAddress = async (req, res) => {
  try {
    const userId = req.userId || req.user?.userId || null;
    const { id } = req.params;
    const { shippingAddress } = req.body;

    const query = {
      $or: [
        { orderId: id },
        { _id: mongoose.isValidObjectId(id) ? id : null },
      ],
    };

    if (userId && req.user?.role !== "admin") {
      query.user = userId;
    }

    const order = await Order.findOne(query);

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
          address: String(line1).trim(),
          address2:
            shippingAddress.line2 ||
            shippingAddress.address2 ||
            shippingAddress.address_line2 ||
            "",
          city: String(shippingAddress.city || "").trim() || "Meerut",
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

        // Auto-link guest order if an account already exists for this mobile number
        if (!order.user && order.shippingAddress?.phone) {
          await autoLinkSingleOrderIfUserExists(order);
        }
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