// controllers/paymentController.js

const Order = require("../models/order");
const Payment = require("../models/payment");
const Product = require("../models/product");
const User = require("../models/user");

const {
  createCheckout,
  fetchFastRROrderDetails,
} = require("../services/fastrrService");

const {
  verifyHmac,
} = require("../utils/fastrrHmac");

const {
  createShiprocketOrder,
} = require("../services/shiprocketService");

const whatsappService =
  require("../services/whatsappService");

// =====================================================
// HELPER: GET USER ID
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
// HELPER: FIRST AVAILABLE VALUE
// =====================================================

const getFirstValue = (...values) => {
  for (const value of values) {
    if (
      value !== undefined &&
      value !== null &&
      value !== ""
    ) {
      return value;
    }
  }

  return null;
};

// =====================================================
// HELPER: IS COD
// =====================================================

const isCODPayment = (paymentType) => {
  if (!paymentType) return false;
  const value = String(paymentType || "")
    .trim()
    .toUpperCase();

  return (
    value === "COD" ||
    value === "CASH_ON_DELIVERY" ||
    value === "CASH ON DELIVERY" ||
    value === "CASH-ON-DELIVERY" ||
    value === "CASH" ||
    value.includes("COD") ||
    value.includes("CASH ON DELIVERY")
  );
};

// =====================================================
// HELPER: NORMALIZE PHONE
// =====================================================

const normalizePhone = (phone) => {
  if (!phone) {
    return "9999999999";
  }

  const digits = String(phone).replace(/\D/g, "");
  const normalized = digits.slice(-10);

  if (!/^\d{10}$/.test(normalized)) {
    return "9999999999";
  }

  return normalized;
};

// =====================================================
// UPDATE ORDER ADDRESS FROM FASTRR
// =====================================================

const updateOrderAddressFromFastRR = async (
  order,
  checkoutOrderDetails
) => {
  const checkoutAddress =
    checkoutOrderDetails?.result?.shipping_address ||
    checkoutOrderDetails?.shipping_address ||
    checkoutOrderDetails?.data?.shipping_address;

  console.log(
    "========================================"
  );

  console.log(
    "FASTRR SHIPPING ADDRESS"
  );

  console.log(
    JSON.stringify(
      checkoutAddress,
      null,
      2
    )
  );

  console.log(
    "========================================"
  );

  if (!checkoutAddress) {
    console.log(
      "FastRR shipping_address not found."
    );

    return false;
  }

  const fullName = [
    checkoutAddress.first_name,
    checkoutAddress.last_name,
  ]
    .filter(Boolean)
    .join(" ")
    .trim();

  order.shippingAddress = {
    name:
      fullName ||
      order.shippingAddress?.name ||
      "Valued Customer",

    phone:
      checkoutAddress.phone ||
      order.shippingAddress?.phone ||
      "9999999999",

    email:
      checkoutAddress.email ||
      order.shippingAddress?.email ||
      "",

    address:
      checkoutAddress.line1 ||
      checkoutAddress.address ||
      order.shippingAddress?.address ||
      "Customer Address",

    address2:
      checkoutAddress.line2 ||
      checkoutAddress.address2 ||
      order.shippingAddress?.address2 ||
      "",

    city:
      checkoutAddress.city ||
      order.shippingAddress?.city ||
      "Delhi",

    state:
      checkoutAddress.state ||
      order.shippingAddress?.state ||
      "Delhi",

    pincode:
      checkoutAddress.pincode ||
      checkoutAddress.zip ||
      checkoutAddress.postal_code ||
      order.shippingAddress?.pincode ||
      "110001",

    country:
      checkoutAddress.country ||
      order.shippingAddress?.country ||
      "India",
  };

  order.markModified(
    "shippingAddress"
  );

  await order.save();

  console.log(
    "FastRR checkout address saved to order:",
    order.orderId
  );

  return true;
};

// =====================================================
// FETCH + SAVE FASTRR CHECKOUT ADDRESS
// =====================================================

const fetchAndSaveCheckoutAddress = async (
  order,
  payment
) => {
  try {
    if (
      !payment?.gatewayOrderId
    ) {
      console.log(
        "FastRR gateway order ID not available. Address cannot be fetched yet."
      );

      return null;
    }

    const checkoutDetails =
      await fetchFastRROrderDetails(
        String(
          payment.gatewayOrderId
        )
      );

    console.log(
      "FastRR Checkout Details:",
      JSON.stringify(
        checkoutDetails,
        null,
        2
      )
    );

    await updateOrderAddressFromFastRR(
      order,
      checkoutDetails
    );

    return checkoutDetails;

  } catch (error) {
    console.error(
      "FETCH FASTRR CHECKOUT ADDRESS ERROR:",
      error?.response?.data ||
      error.message
    );

    return null;
  }
};

// =====================================================
// SHIPROCKET PAYLOAD
// =====================================================

const buildShiprocketOrderPayload = (
  order,
  paymentMethod
) => {
  const address =
    order.shippingAddress || {};

  const phone = normalizePhone(address.phone || order.user?.phone || "");

  const shiprocketItems = order.items
    .filter(
      (item) =>
        !/delivery/i.test(item.name || "") &&
        !/shipping/i.test(item.name || "") &&
        String(item.variantId) !== "9999999999"
    )
    .map((item) => ({
      name: item.name,
      sku: item.sku || item.product?.toString(),
      units: Number(item.quantity),
      selling_price: Number(item.price),
    }));

  const isCOD =
    String(paymentMethod || "")
      .trim()
      .toUpperCase() ===
    "COD";

  return {
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

    // =================================================
    // BILLING
    // =================================================

    billing_customer_name:
      address.name,

    billing_last_name:
      "",

    billing_address:
      address.address,

    billing_address_2:
      address.address2 || "",

    billing_city:
      address.city,

    billing_pincode:
      address.pincode,

    billing_state:
      address.state,

    billing_country:
      address.country ||
      "India",

    billing_email:
      address.email || "",

    billing_phone:
      phone,

    // =================================================
    // SHIPPING
    // =================================================

    shipping_is_billing:
      true,

    shipping_customer_name:
      address.name,

    shipping_last_name:
      "",

    shipping_address:
      address.address,

    shipping_address_2:
      address.address2 || "",

    shipping_city:
      address.city,

    shipping_pincode:
      address.pincode,

    shipping_state:
      address.state,

    shipping_country:
      address.country ||
      "India",

    shipping_email:
      address.email || "",

    shipping_phone:
      phone,

    // =================================================
    // ITEMS
    // =================================================

    order_items:
      shiprocketItems,

    // =================================================
    // PAYMENT
    // =================================================

    payment_method:
      isCOD
        ? "COD"
        : "Prepaid",

    // =================================================
    // CHARGES
    // =================================================

    shipping_charges:
      Number(order.shippingCharge || 0),

    giftwrap_charges:
      0,

    transaction_charges:
      0,

    total_discount:
      0,

    sub_total:
      Number(
        order.totalAmount
      ),

    // =================================================
    // PACKAGE
    // =================================================

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
};

// =====================================================
// HELPER: SYNC FASTRR ORDER (COD vs ONLINE)
// =====================================================

const syncFastrrOrder = async (
  order,
  payment,
  checkoutOrderDetails,
  webhookData = null
) => {
  if (!order || !payment) return null;

  // Extract payment type from both webhook and checkout details
  const webhookPaymentType = getFirstValue(
    webhookData?.payment_type,
    webhookData?.paymentType,
    webhookData?.payment_method,
    webhookData?.paymentMethod,
    webhookData?.payment_mode,
    webhookData?.paymentMode,
    webhookData?.cart_data?.payment_type,
    webhookData?.cart_data?.payment_method,
    webhookData?.result?.payment_type,
    webhookData?.result?.payment_method
  );

  const fastrrPaymentType = getFirstValue(
    checkoutOrderDetails?.result?.payment_type,
    checkoutOrderDetails?.result?.paymentType,
    checkoutOrderDetails?.result?.payment_method,
    checkoutOrderDetails?.result?.paymentMethod,
    checkoutOrderDetails?.result?.payment_mode,
    checkoutOrderDetails?.result?.paymentMode,
    checkoutOrderDetails?.result?.payments?.[0]?.payment_method,
    checkoutOrderDetails?.result?.payments?.[0]?.paymentMethod,
    checkoutOrderDetails?.payment_type
  );

  const cod = isCODPayment(webhookPaymentType) || isCODPayment(fastrrPaymentType);
  const targetPaymentMethod = cod ? "COD" : "ONLINE";
  const targetPaymentStatus = cod ? "PENDING" : "PAID";

  console.log("========================================");
  console.log("SYNCING FASTRR ORDER:", order.orderId);
  console.log("Webhook Payment Type:", webhookPaymentType);
  console.log("FastRR Order Details Payment Type:", fastrrPaymentType);
  console.log("Determined isCOD:", cod);
  console.log("Target Payment Method:", targetPaymentMethod);
  console.log("Target Payment Status:", targetPaymentStatus);
  console.log("========================================");

  // Update Address from FastRR
  if (checkoutOrderDetails) {
    try {
      await updateOrderAddressFromFastRR(order, checkoutOrderDetails);
    } catch (addrErr) {
      console.warn("Could not update address from FastRR:", addrErr.message);
    }
  }

  // Update Payment
  const alreadyPaid = payment.status === "PAID";
  if (!alreadyPaid) {
    payment.status = targetPaymentStatus;
    payment.failureReason = null;
    if (!cod) {
      payment.paidAt = payment.paidAt || new Date();
    }
  }
  payment.paymentMethod = targetPaymentMethod;
  payment.gateway = cod ? "COD" : "FASTRR";
  if (webhookData) {
    payment.gatewayResponse = webhookData;
  } else if (checkoutOrderDetails) {
    payment.gatewayResponse = checkoutOrderDetails;
  }
  await payment.save();

  // Update Order
  order.paymentMethod = targetPaymentMethod;
  order.paymentStatus = targetPaymentStatus;
  order.orderStatus = "CONFIRMED";
  await order.save();

  // Create Shiprocket Order if not created yet
  if (!order.shiprocket?.orderId) {
    try {
      const shiprocketPaymentMethod = cod ? "COD" : "ONLINE";
      const shiprocketOrderData = buildShiprocketOrderPayload(
        order,
        shiprocketPaymentMethod
      );

      console.log(
        "CREATING SHIPROCKET ORDER FOR:",
        order.orderId,
        "payment_method:",
        shiprocketOrderData.payment_method
      );

      const shiprocketResponse = await createShiprocketOrder(
        shiprocketOrderData
      );

      console.log("Shiprocket Order Created:", shiprocketResponse);

      order.shiprocket.orderId = shiprocketResponse?.order_id || null;
      order.shiprocket.shipmentId = shiprocketResponse?.shipment_id || null;
      order.shiprocket.status = "ORDER_CREATED";
      order.shiprocket.createdAt = order.shiprocket.createdAt || new Date();
      order.shiprocket.updatedAt = new Date();
      await order.save();
    } catch (srErr) {
      console.error(
        "Shiprocket order creation failed in syncFastrrOrder:",
        srErr.response?.data || srErr.message
      );
    }
  }

  // Trigger WhatsApp notification
  whatsappService
    .sendOrderStatusNotification(order, "CONFIRMED")
    .catch((waErr) =>
      console.error("WhatsApp confirmation notification error:", waErr.message)
    );

  return order;
};

// =====================================================
// 1. CREATE ONLINE PAYMENT / FASTRR CHECKOUT
//
// POST /api/payment/create
// =====================================================

const createPayment = async (
  req,
  res
) => {
  try {
    const userId =
      getUserId(req);

    const {
      orderId,
    } = req.body;

    if (!userId) {
      return res.status(401).json({
        success: false,
        message:
          "Unauthorized",
      });
    }

    if (!orderId) {
      return res.status(400).json({
        success: false,
        message:
          "orderId is required",
      });
    }

    // =================================================
    // FIND ORDER
    // =================================================

    const order =
      await Order.findOne({
        orderId,
        user: userId,
      }).populate(
        "items.product"
      );

    if (!order) {
      return res.status(404).json({
        success: false,
        message:
          "Order not found",
      });
    }

    // =================================================
    // BOTH ONLINE + COD USE FASTRR CHECKOUT
    // =================================================

    if (!["ONLINE", "COD"].includes(order.paymentMethod)) {
      return res.status(400).json({
        success: false,
        message: "FastRR checkout is only available for ONLINE or COD orders",
      });
    }

    // =================================================
    // ONLINE PAID PROTECTION
    // =================================================

    if (
      order.paymentMethod ===
        "ONLINE" &&
      order.paymentStatus ===
        "PAID"
    ) {
      return res.status(400).json({
        success: false,
        message:
          "Order is already paid",
      });
    }

    // =================================================
    // AMOUNT
    // =================================================

    const amount =
      Number(
        order.totalAmount
      );

    if (
      !Number.isFinite(amount) ||
      amount <= 0
    ) {
      return res.status(400).json({
        success: false,
        message:
          "Invalid order amount",
      });
    }

    // =================================================
    // GET / CREATE PAYMENT
    // =================================================

    let payment =
      await Payment.findOne({
        order:
          order._id,

        user:
          userId,
      });

    if (!payment) {
      payment =
        await Payment.create({
          order:
            order._id,

          orderId:
            order.orderId,

          user:
            userId,

          amount,

          currency:
            "INR",

          paymentMethod:
            order.paymentMethod,

          gateway:
            "FASTRR",

          status:
            "PROCESSING",
        });
    } else {
      payment.amount =
        amount;

      payment.paymentMethod =
        order.paymentMethod;

      payment.gateway =
        "FASTRR";

      payment.status =
        "PROCESSING";

      payment.failureReason =
        null;

      await payment.save();
    }

    // =================================================
    // FASTRR ITEMS
    // =================================================

    const items = [];

    for (
      const item of order.items
    ) {
      if (!item.variantId) {
        throw new Error(
          `Variant ID missing for order item: ${item.name}`
        );
      }

      const product =
        item.product;

      if (!product) {
        throw new Error(
          `Product missing for order item: ${item.name}`
        );
      }

      const variant =
        product.variants?.id(
          item.variantId
        );

      if (!variant) {
        throw new Error(
          `Variant not found for order item: ${item.name}`
        );
      }

      if (!variant.shiprocketId) {
        throw new Error(
          `Shiprocket variant ID missing for: ${item.name}`
        );
      }

      const itemPrice = Number(
        item.price ??
        variant.salePrice ??
        product.salePrice ??
        product.price ??
        0
      );

      const itemName = variant.title
        ? `${product.name} - ${variant.title}`
        : product.name || item.name || "Sweet Item";

      let itemImage =
        product.images?.[0] ||
        item.image ||
        "https://wemakesweets.com/product1.webp";

      if (typeof itemImage === "string" && !/^https?:\/\//i.test(itemImage)) {
        const backendUrl = (
          process.env.BACKEND_URL ||
          "https://salmon-coyote-671066.hostingersite.com"
        ).replace(/\/$/, "");
        itemImage = `${backendUrl}${itemImage.startsWith("/") ? "" : "/"}${itemImage}`;
      }

      items.push({
        variant_id:
          String(
            variant.shiprocketId
          ),

        quantity:
          Number(
            item.quantity
          ),

        catalog_data: {
          price: itemPrice,
          name: itemName,
          image_url: itemImage,
        },
      });
    }

    // =================================================
    // DELIVERY / SHIPPING CHARGE FOR FASTRR
    // =================================================

    const deliveryCharge = Number(
      order.shippingCharge !== undefined && order.shippingCharge !== null
        ? order.shippingCharge
        : order.totalAmount && order.items?.length
        ? Math.max(
            0,
            order.totalAmount -
              order.items.reduce(
                (acc, it) =>
                  acc + (Number(it.price) * Number(it.quantity) || 0),
                0
              )
          )
        : 0
    );

    if (deliveryCharge > 0) {
      items.push({
        variant_id: "9999999999",
        quantity: 1,
        catalog_data: {
          price: deliveryCharge,
          name: "Delivery Charges",
          image_url: "https://wemakesweets.com/delivery.png",
        },
      });
    }

    // =================================================
    // FASTRR CHECKOUT PAYLOAD
    //
    // IMPORTANT:
    // We DO NOT force COD / ONLINE here.
    // Customer selects payment option
    // inside FastRR checkout.
    // Webhook will tell us payment_type.
    // =================================================

    const frontendUrl =
      String(
        process.env
          .FRONTEND_URL ||
        ""
      ).replace(
        /\/+$/,
        ""
      );

    const payload = {
      cart_data: {
        items,
      },

      redirect_url:
        `${frontendUrl}/payment/success` +
        `?orderId=${encodeURIComponent(
          order.orderId
        )}`,

      timestamp:
        new Date().toISOString(),
    };

    console.log(
      "========================================"
    );

    console.log(
      "CREATING FASTRR CHECKOUT"
    );

    console.log(
      "Order:",
      order.orderId
    );

    console.log(
      "Order Payment Method:",
      order.paymentMethod
    );

    console.log(
      JSON.stringify(
        payload,
        null,
        2
      )
    );

    console.log(
      "========================================"
    );

    const fastrrResponse =
      await createCheckout(
        payload
      );

    // =================================================
    // CHECKOUT TOKEN
    // =================================================

    const checkoutToken =
      getFirstValue(
        fastrrResponse
          ?.result
          ?.token,

        fastrrResponse?.token,

        fastrrResponse
          ?.data
          ?.token
      );

    // =================================================
    // GATEWAY ORDER ID
    // =================================================

    const gatewayOrderId =
      getFirstValue(
        fastrrResponse
          ?.result
          ?.data
          ?.order_id,

        fastrrResponse
          ?.result
          ?.order_id,

        fastrrResponse
          ?.order_id,

        fastrrResponse
          ?.data
          ?.order_id,

        fastrrResponse
          ?.gateway_order_id,

        fastrrResponse
          ?.data
          ?.gateway_order_id
      );

    if (!checkoutToken) {
      return res.status(502).json({
        success: false,

        message:
          "FastRR checkout token was not received",

        fastrrResponse,
      });
    }

    // =================================================
    // SAVE FASTRR DETAILS
    // =================================================

    payment.gatewayOrderId =
      gatewayOrderId
        ? String(
            gatewayOrderId
          )
        : null;

    payment.gatewayResponse =
      fastrrResponse;

    payment.status =
      "PROCESSING";

    await payment.save();

    order.paymentStatus =
      "PROCESSING";

    await order.save();

    // =================================================
    // TRY TO FETCH CHECKOUT ADDRESS
    //
    // If FastRR already exposes checkout details,
    // save address immediately.
    //
    // Webhook will fetch/update it again later.
    // =================================================

    if (payment.gatewayOrderId) {
      await fetchAndSaveCheckoutAddress(
        order,
        payment
      );
    }

    // =================================================
    // RESPONSE
    // =================================================

    return res.status(200).json({
      success: true,

      message:
        "FASTRR checkout created successfully",

      paymentId:
        payment._id,

      orderId:
        order.orderId,

      amount:
        payment.amount,

      currency:
        payment.currency,

      status:
        payment.status,

      paymentMethod:
        order.paymentMethod,

      checkoutToken,

      gatewayOrderId:
        payment.gatewayOrderId,

      fastrrResponse,
    });

  } catch (error) {
    console.error(
      "CREATE PAYMENT ERROR:",
      error.response?.data ||
      error.message
    );

    return res.status(
      error.response?.status ||
      500
    ).json({
      success: false,

      message:
        "Unable to create FastRR payment",

      error:
        error.response?.data ||
        error.message,
    });
  }
};

// =====================================================
// PAYMENT SUCCESS / GET PAYMENT STATUS
// =====================================================

const paymentSuccess = async (
  req,
  res
) => {
  try {
    const userId =
      getUserId(req);

    const {
      paymentId,
      orderId,
      gatewayOrderId,
    } = req.body;

    if (!userId) {
      return res.status(401).json({
        success: false,
        message:
          "Unauthorized",
      });
    }

    let payment = null;

    if (paymentId) {
      payment =
        await Payment.findOne({
          _id:
            paymentId,

          user:
            userId,
        });
    }

    if (
      !payment &&
      gatewayOrderId
    ) {
      payment =
        await Payment.findOne({
          gatewayOrderId:
            String(
              gatewayOrderId
            ),

          user:
            userId,
        });
    }

    if (
      !payment &&
      orderId
    ) {
      payment =
        await Payment.findOne({
          orderId,

          user:
            userId,
        });
    }

    if (!payment) {
      return res.status(404).json({
        success: false,
        message:
          "Payment not found",
      });
    }

    // Auto-sync with FastRR if order is still PENDING or shiprocket order not created yet
    let order = await Order.findById(payment.order).populate("items.product");
    if (order && payment.gatewayOrderId && (order.orderStatus !== "CONFIRMED" || !order.shiprocket?.orderId)) {
      try {
        const checkoutDetails = await fetchFastRROrderDetails(
          String(payment.gatewayOrderId)
        );
        const status = String(
          checkoutDetails?.result?.status || checkoutDetails?.status || ""
        ).toUpperCase();

        if (status === "SUCCESS") {
          await syncFastrrOrder(order, payment, checkoutDetails, null);
          order = await Order.findById(order._id).populate("items.product");
        }
      } catch (fastrrErr) {
        console.warn("Could not sync with FastRR in paymentSuccess:", fastrrErr.message);
      }
    }

    return res.status(200).json({
      success: true,

      message:
        "Payment status retrieved successfully",

      order,

      payment: {
        id:
          payment._id,

        orderId:
          payment.orderId,

        amount:
          payment.amount,

        status:
          payment.status,

        paymentMethod:
          payment.paymentMethod,

        paymentId:
          payment.paymentId,

        transactionId:
          payment.transactionId,

        gateway:
          payment.gateway,

        gatewayOrderId:
          payment.gatewayOrderId,

        paidAt:
          payment.paidAt,
      },
    });

  } catch (error) {
    console.error(
      "PAYMENT SUCCESS ERROR:",
      error
    );

    return res.status(500).json({
      success: false,

      message:
        "Unable to get payment status",

      error:
        error.message,
    });
  }
};

// 2B. VERIFY PAYMENT & SYNC FASTRR ORDER
//
// POST /api/payment/verify
// =====================================================

const verifyPayment = async (req, res) => {
  try {
    const userId = getUserId(req);
    const { orderId, paymentId } = req.body;

    if (!orderId && !paymentId) {
      return res.status(400).json({
        success: false,
        message: "orderId or paymentId is required",
      });
    }

    let order = null;
    if (orderId) {
      const query = { orderId: String(orderId) };
      if (userId) query.user = userId;
      order = await Order.findOne(query).populate("items.product");
    }

    let payment = null;
    if (paymentId) {
      payment = await Payment.findOne({ _id: paymentId });
    } else if (order) {
      payment = await Payment.findOne({ order: order._id });
    }

    if (!order && payment) {
      order = await Order.findById(payment.order).populate("items.product");
    }

    if (!order) {
      return res.status(404).json({
        success: false,
        message: "Order not found",
      });
    }

    if (!payment) {
      return res.status(404).json({
        success: false,
        message: "Payment record not found",
      });
    }

    // Auto-sync with FastRR if not confirmed or shiprocket order not created yet
    if (payment.gatewayOrderId && (order.orderStatus !== "CONFIRMED" || !order.shiprocket?.orderId)) {
      try {
        console.log("Verifying order with FastRR:", payment.gatewayOrderId);
        const checkoutDetails = await fetchFastRROrderDetails(
          String(payment.gatewayOrderId)
        );

        const status = String(
          checkoutDetails?.result?.status || checkoutDetails?.status || ""
        ).toUpperCase();

        if (status === "SUCCESS") {
          await syncFastrrOrder(order, payment, checkoutDetails, null);
        }
      } catch (fastrrErr) {
        console.warn("Could not sync with FastRR in verifyPayment:", fastrrErr.message);
      }
    }

    const updatedOrder = await Order.findById(order._id)
      .populate("items.product")
      .populate("paymentId");

    return res.status(200).json({
      success: true,
      message: "Order verified successfully",
      order: updatedOrder,
      payment,
    });
  } catch (error) {
    console.error("VERIFY PAYMENT ERROR:", error);
    return res.status(500).json({
      success: false,
      message: "Unable to verify payment",
      error: error.message,
    });
  }
};

// =====================================================
// 3. PAYMENT FAILED
// =====================================================

const paymentFailed = async (
  req,
  res
) => {
  try {
    const userId =
      getUserId(req);

    const {
      paymentId,
      orderId,
      gatewayOrderId,
      reason,
      failureReason,
    } = req.body;

    if (!userId) {
      return res.status(401).json({
        success: false,
        message:
          "Unauthorized",
      });
    }

    let payment = null;

    if (paymentId) {
      payment =
        await Payment.findOne({
          _id:
            paymentId,

          user:
            userId,
        });
    }

    if (
      !payment &&
      gatewayOrderId
    ) {
      payment =
        await Payment.findOne({
          gatewayOrderId:
            String(
              gatewayOrderId
            ),

          user:
            userId,
        });
    }

    if (
      !payment &&
      orderId
    ) {
      payment =
        await Payment.findOne({
          orderId,

          user:
            userId,
        });
    }

    if (!payment) {
      return res.status(404).json({
        success: false,
        message:
          "Payment not found",
      });
    }

    // =================================================
    // COD PROTECTION
    //
    // COD should never become FAILED through
    // online payment failure endpoint.
    // =================================================

    if (
      payment.paymentMethod ===
      "COD"
    ) {
      return res.status(400).json({
        success: false,

        message:
          "COD order does not use online payment failure flow",
      });
    }

    payment.status =
      "FAILED";

    payment.failureReason =
      failureReason ||
      reason ||
      "Payment failed";

    await payment.save();

    await Order.findByIdAndUpdate(
      payment.order,
      {
        paymentStatus:
          "FAILED",
      }
    );

    return res.status(200).json({
      success: true,

      message:
        "Payment marked as failed",

      payment: {
        id:
          payment._id,

        orderId:
          payment.orderId,

        status:
          payment.status,

        failureReason:
          payment.failureReason,
      },
    });

  } catch (error) {
    console.error(
      "PAYMENT FAILED ERROR:",
      error
    );

    return res.status(500).json({
      success: false,

      message:
        "Unable to update payment failure",

      error:
        error.message,
    });
  }
};

// =====================================================
// FASTRR WEBHOOK
// =====================================================

const fastrrWebhook = async (
  req,
  res
) => {
  try {
    console.log(
      "========================================"
    );

    console.log(
      "FASTRR CHECKOUT WEBHOOK RECEIVED"
    );

    console.log(
      "========================================"
    );

    // =================================================
    // RAW BODY
    // =================================================

    let rawBody;

    if (
      Buffer.isBuffer(
        req.body
      )
    ) {
      rawBody =
        req.body.toString(
          "utf8"
        );

    } else if (
      typeof req.body ===
      "string"
    ) {
      rawBody =
        req.body;

    } else {
      rawBody =
        JSON.stringify(
          req.body
        );
    }

    console.log(
      "Webhook Raw Body:",
      rawBody
    );

    // =================================================
    // HMAC
    // =================================================

    const receivedApiKey =
      req.headers[
        "x-api-key"
      ];

    const receivedHmac =
      req.headers[
        "x-api-hmac-sha256"
      ];

    const requireWebhookHmac =
      String(
        process.env
          .REQUIRE_FASTRR_WEBHOOK_HMAC
      ).toLowerCase() ===
      "true";

    if (
      requireWebhookHmac
    ) {
      if (
        !receivedApiKey ||
        receivedApiKey !==
          process.env.FASTRR_API_KEY
      ) {
        return res.status(401).json({
          success: false,
          message:
            "Invalid API key",
        });
      }

      if (!receivedHmac) {
        return res.status(401).json({
          success: false,
          message:
            "Missing HMAC",
        });
      }

      const validHmac =
        verifyHmac(
          rawBody,
          receivedHmac
        );

      if (!validHmac) {
        return res.status(401).json({
          success: false,
          message:
            "Invalid HMAC",
        });
      }

    } else if (
      receivedHmac
    ) {
      const validHmac =
        verifyHmac(
          rawBody,
          receivedHmac
        );

      if (!validHmac) {
        return res.status(401).json({
          success: false,
          message:
            "Invalid HMAC",
        });
      }

      if (
        receivedApiKey &&
        receivedApiKey !==
          process.env.FASTRR_API_KEY
      ) {
        return res.status(401).json({
          success: false,
          message:
            "Invalid API key",
        });
      }
    }

    // =================================================
    // PARSE WEBHOOK
    // =================================================

    let webhookData;

    try {
      webhookData =
        JSON.parse(
          rawBody
        );
    } catch (error) {
      return res.status(400).json({
        success: false,
        message:
          "Invalid webhook JSON",
      });
    }

    console.log(
      "Webhook Data:",
      JSON.stringify(
        webhookData,
        null,
        2
      )
    );

    // =================================================
    // EXTRACT DATA
    // =================================================

    const webhookOrderId =
      getFirstValue(
        webhookData?.order_id,

        webhookData?.orderId,

        webhookData
          ?.result
          ?.order_id,

        webhookData
          ?.result
          ?.orderId
      );

    const status =
      String(
        getFirstValue(
          webhookData?.status,

          webhookData
            ?.result
            ?.status
        ) || ""
      )
        .trim()
        .toUpperCase();

    const paymentType =
      getFirstValue(
        webhookData?.payment_type,

        webhookData?.paymentType,

        webhookData
          ?.result
          ?.payment_type,

        webhookData
          ?.result
          ?.paymentType
      );

    const totalAmount =
      Number(
        getFirstValue(
          webhookData
            ?.total_amount_payable,

          webhookData
            ?.totalAmountPayable,

          webhookData
            ?.result
            ?.total_amount_payable
        )
      );

    const webhookIsCOD =
      isCODPayment(
        paymentType
      );

    console.log(
      "========================================"
    );

    console.log(
      "Webhook Order ID:",
      webhookOrderId
    );

    console.log(
      "Webhook Status:",
      status
    );

    console.log(
      "Webhook Payment Type:",
      paymentType
    );

    console.log(
      "Webhook Is COD:",
      webhookIsCOD
    );

    console.log(
      "Webhook Amount:",
      totalAmount
    );

    console.log(
      "========================================"
    );

    // =================================================
    // VALIDATE ORDER ID
    // =================================================

    if (!webhookOrderId) {
      return res.status(400).json({
        success: false,
        message:
          "order_id is missing from webhook",
      });
    }

    // =================================================
    // FIND PAYMENT
    // =================================================

    let payment =
      await Payment.findOne({
        gatewayOrderId:
          String(
            webhookOrderId
          ),
      });

    if (!payment) {
      payment =
        await Payment.findOne({
          orderId:
            String(
              webhookOrderId
            ),
        });
    }

    if (!payment) {
      console.error(
        "Payment not found for FastRR webhook:",
        webhookOrderId
      );

      return res.status(404).json({
        success: false,
        message:
          "Payment not found for webhook order",
      });
    }

    // =================================================
    // FIND ORDER
    // =================================================

    const order =
      await Order.findById(
        payment.order
      ).populate(
        "items.product"
      );

    if (!order) {
      return res.status(404).json({
        success: false,
        message:
          "Order not found for payment",
      });
    }

    console.log(
      "Order Found:",
      order.orderId
    );

    console.log(
      "Order Payment Method:",
      order.paymentMethod
    );

    console.log(
      "Payment Payment Method:",
      payment.paymentMethod
    );

    // =================================================
    // IMPORTANT:
    //
    // FastRR WEBHOOK payment_type is the final
    // payment mode selected by customer.
    //
    // For COD:
    // paymentType = COD
    //
    // For ONLINE:
    // paymentType = ONLINE / other non-COD value
    //
    // We do NOT ignore COD webhook.
    // =================================================

    const finalPaymentMethod =
      webhookIsCOD
        ? "COD"
        : "ONLINE";

    console.log(
      "FINAL PAYMENT METHOD:",
      finalPaymentMethod
    );

    // =================================================
    // VALIDATE AMOUNT
    // =================================================

    if (
      Number.isFinite(
        totalAmount
      ) &&
      Math.abs(
        totalAmount -
        Number(
          order.totalAmount
        )
      ) > 0.01
    ) {
      return res.status(400).json({
        success: false,

        message:
          "Payment amount does not match order amount",
      });
    }

    // ========================================
    // SUCCESS WEBHOOK
    // ========================================

    if (status === "SUCCESS") {
      console.log("========================================");
      console.log("FASTRR SUCCESS WEBHOOK");
      console.log("Our Order:", order.orderId);
      console.log("Gateway Order:", payment.gatewayOrderId);
      console.log("========================================");

      let checkoutOrderDetails = null;

      try {
        const fastRRGatewayOrderId = payment.gatewayOrderId;
        if (fastRRGatewayOrderId) {
          console.log(
            "Fetching FastRR details using gateway order ID:",
            fastRRGatewayOrderId
          );
          checkoutOrderDetails = await fetchFastRROrderDetails(
            String(fastRRGatewayOrderId)
          );
        }
      } catch (checkoutDetailsError) {
        console.error(
          "Unable to fetch FastRR checkout order details:",
          checkoutDetailsError?.response?.data || checkoutDetailsError.message
        );
      }

      await syncFastrrOrder(order, payment, checkoutOrderDetails, webhookData);

      return res.status(200).json({
        success: true,
        message: "FastRR order webhook processed successfully",
        orderId: order.orderId,
        paymentId: payment._id,
        paymentMethod: order.paymentMethod,
        paymentStatus: order.paymentStatus,
        orderStatus: order.orderStatus,
        shippingAddress: order.shippingAddress,
        shiprocket: {
          orderId: order.shiprocket?.orderId,
          shipmentId: order.shiprocket?.shipmentId,
          status: order.shiprocket?.status,
        },
      });
    }

    // =================================================
    // FAILED WEBHOOK
    //
    // Only ONLINE payment should be marked FAILED.
    // COD failure/cancel from checkout should not
    // become an online payment failure.
    // =================================================

    const failedStatuses = [
      "FAILED",
      "FAILURE",
      "CANCELLED",
      "CANCELED",
    ];

    if (
      failedStatuses.includes(
        status
      )
    ) {
      // =================================================
      // COD
      // =================================================

      if (
        finalPaymentMethod ===
        "COD"
      ) {
        payment.paymentMethod =
          "COD";

        payment.status =
          "FAILED";

        payment.failureReason =
          getFirstValue(
            webhookData?.message,

            webhookData?.error,

            webhookData
              ?.failure_reason,

            "FastRR COD checkout was cancelled or failed"
          );

        payment.gatewayResponse =
          webhookData;

        await payment.save();

        order.paymentMethod =
          "COD";

        order.paymentStatus =
          "FAILED";

        await order.save();

        return res.status(200).json({
          success: true,

          message:
            "FastRR COD checkout failure webhook processed",

          orderId:
            order.orderId,

          paymentMethod:
            order.paymentMethod,

          paymentStatus:
            order.paymentStatus,
        });
      }

      // =================================================
      // ONLINE
      // =================================================

      payment.paymentMethod =
        "ONLINE";

      payment.status =
        "FAILED";

      payment.failureReason =
        getFirstValue(
          webhookData?.message,

          webhookData?.error,

          webhookData
            ?.failure_reason,

          "FastRR checkout/payment failed"
        );

      payment.gatewayResponse =
        webhookData;

      await payment.save();

      order.paymentMethod =
        "ONLINE";

      order.paymentStatus =
        "FAILED";

      await order.save();

      return res.status(200).json({
        success: true,

        message:
          "FastRR failure webhook processed",

        orderId:
          order.orderId,

        paymentMethod:
          order.paymentMethod,

        paymentStatus:
          order.paymentStatus,
      });
    }

    // =================================================
    // PROCESSING WEBHOOK
    // =================================================

    payment.gatewayResponse =
      webhookData;

    payment.paymentMethod =
      finalPaymentMethod;

    if (
      status ===
      "PROCESSING"
    ) {
      payment.status =
        "PROCESSING";

      order.paymentStatus =
        "PROCESSING";

    } else {
      payment.status =
        "PENDING";
    }

    await payment.save();

    await order.save();

    return res.status(200).json({
      success: true,

      message:
        "FastRR webhook received",

      status,

      paymentMethod:
        finalPaymentMethod,

      orderId:
        order.orderId,

      paymentStatus:
        payment.status,
    });

  } catch (error) {
    console.error(
      "========================================"
    );

    console.error(
      "FASTRR WEBHOOK ERROR:",
      error
    );

    console.error(
      "========================================"
    );

    return res.status(500).json({
      success: false,

      message:
        "Unable to process FastRR webhook",

      error:
        error.message,
    });
  }
};

// =====================================================
// GET PAYMENT
// =====================================================

const getPayment = async (
  req,
  res
) => {
  try {
    const userId =
      getUserId(req);

    const {
      paymentId,
    } = req.params;

    if (!userId) {
      return res.status(401).json({
        success: false,
        message:
          "Unauthorized",
      });
    }

    const payment =
      await Payment.findOne({
        _id:
          paymentId,

        user:
          userId,
      })
        .populate(
          "order",
          "orderId totalAmount paymentStatus orderStatus paymentMethod shippingAddress"
        )
        .lean();

    if (!payment) {
      return res.status(404).json({
        success: false,
        message:
          "Payment not found",
      });
    }

    return res.status(200).json({
      success: true,

      payment: {
        id:
          payment._id,

        orderId:
          payment.orderId,

        amount:
          payment.amount,

        currency:
          payment.currency,

        paymentMethod:
          payment.paymentMethod,

        gateway:
          payment.gateway,

        status:
          payment.status,

        paymentId:
          payment.paymentId,

        transactionId:
          payment.transactionId,

        gatewayOrderId:
          payment.gatewayOrderId,

        failureReason:
          payment.failureReason,

        paidAt:
          payment.paidAt,

        createdAt:
          payment.createdAt,

        updatedAt:
          payment.updatedAt,

        shippingAddress:
          payment.order?.shippingAddress ||
          null,
      },
    });

  } catch (error) {
    console.error(
      "GET PAYMENT ERROR:",
      error
    );

    return res.status(500).json({
      success: false,

      message:
        "Unable to get payment",

      error:
        error.message,
    });
  }
};

// =====================================================
// GET FASTRR CHECKOUT DETAILS / ADDRESS
// =====================================================

const getCheckoutAddress = async (
  req,
  res
) => {
  try {
    const userId =
      getUserId(req);

    const {
      orderId,
    } = req.params;

    if (!userId) {
      return res.status(401).json({
        success: false,
        message:
          "Unauthorized",
      });
    }

    if (!orderId) {
      return res.status(400).json({
        success: false,
        message:
          "Order ID is required",
      });
    }

    const order =
      await Order.findOne({
        orderId:
          String(orderId),

        user:
          userId,
      });

    if (!order) {
      return res.status(404).json({
        success: false,
        message:
          "Order not found",
      });
    }

    const payment =
      await Payment.findOne({
        order:
          order._id,

        user:
          userId,
      });

    if (!payment) {
      return res.status(404).json({
        success: false,
        message:
          "Payment not found for this order",
      });
    }

    // =================================================
    // BOTH COD + ONLINE CAN FETCH FASTRR DETAILS
    // =================================================

    const gatewayOrderId =
      payment.gatewayOrderId;

    if (!gatewayOrderId) {
      return res.status(400).json({
        success: false,

        message:
          "FastRR gateway order ID not found for this payment",
      });
    }

    const checkoutDetails =
      await fetchFastRROrderDetails(
        String(
          gatewayOrderId
        )
      );

    // =================================================
    // UPDATE ORDER ADDRESS
    // =================================================

    await updateOrderAddressFromFastRR(
      order,
      checkoutDetails
    );

    return res.status(200).json({
      success: true,

      message:
        "Checkout details fetched successfully",

      orderId:
        order.orderId,

      gatewayOrderId:
        gatewayOrderId,

      paymentMethod:
        order.paymentMethod,

      shippingAddress:
        order.shippingAddress,

      checkoutDetails,
    });

  } catch (error) {
    console.error(
      "GET CHECKOUT DETAILS ERROR:",
      error.response?.data ||
      error.message
    );

    return res.status(
      error.response?.status ||
      500
    ).json({
      success: false,

      message:
        "Unable to fetch checkout details",

      error:
        error.response?.data ||
        error.message,
    });
  }
};

// =====================================================
// EXPORTS
// =====================================================

module.exports = {
  createPayment,
  paymentSuccess,
  verifyPayment,
  paymentFailed,
  fastrrWebhook,
  getPayment,
  getCheckoutAddress,
  syncFastrrOrder,
};