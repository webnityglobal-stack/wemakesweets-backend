// controllers/paymentController.js

const Order = require("../models/order");
const Payment = require("../models/payment");
const Product = require("../models/product");
const User = require("../models/user");
const Address = require("../models/address");

const {
  createCheckout,
  fetchFastRROrderDetails,
} = require("../services/fastrrService");

const { verifyHmac } = require("../utils/fastrrHmac");

const {
  createShiprocketOrder,
} = require("../services/shiprocketService");

const whatsappService = require("../services/whatsappService");

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
// HELPER: PARSE ADDRESS DATA
// =====================================================

const parseAddressData = (sourceAddress, fallbackUser = null) => {
  if (!sourceAddress && !fallbackUser) return null;

  const addr = sourceAddress || {};
  const user = fallbackUser || {};

  const rawAddress =
    addr.line1 ||
    addr.address1 ||
    addr.address_1 ||
    addr.address ||
    addr.address_line1 ||
    addr.street ||
    "";

  // If there's no real address or it's just the placeholder "Customer Address",
  // do NOT invent a fake static address.
  if (!rawAddress || rawAddress === "Customer Address") {
    return null;
  }

  const rawFullName = [
    addr.first_name || addr.firstName,
    addr.last_name || addr.lastName,
  ]
    .filter(Boolean)
    .join(" ")
    .trim();

  const name =
    addr.name ||
    rawFullName ||
    addr.customer_name ||
    addr.customerName ||
    user.name ||
    "Customer";

  const phone = normalizePhone(
    addr.phone ||
    addr.mobile ||
    addr.phone_number ||
    addr.phoneNumber ||
    user.phone ||
    "9999999999"
  );

  const email =
    addr.email ||
    user.email ||
    "";

  const address = rawAddress;

  const address2 =
    addr.line2 ||
    addr.address2 ||
    addr.address_2 ||
    addr.address_line2 ||
    "";

  const city =
    addr.city ||
    "Meerut";

  const state =
    addr.state ||
    addr.province ||
    "Uttar Pradesh";

  const pincode =
    String(
      addr.pincode ||
      addr.zip ||
      addr.postal_code ||
      addr.postalCode ||
      addr.zipcode ||
      "250002"
    ).trim();

  const country =
    addr.country ||
    "India";

  return {
    name,
    phone,
    email,
    address,
    address2,
    city,
    state,
    pincode,
    country,
  };
};

// =====================================================
// HELPER: RESOLVE & SAVE ORDER ADDRESS
// =====================================================

const resolveAndSaveOrderAddress = async (
  order,
  checkoutOrderDetails = null,
  webhookData = null
) => {
  try {
    // 1. Try checkoutOrderDetails (FastRR checkout order details)
    const checkoutAddress =
      checkoutOrderDetails?.result?.shipping_address ||
      checkoutOrderDetails?.shipping_address ||
      checkoutOrderDetails?.data?.shipping_address ||
      checkoutOrderDetails?.result?.data?.shipping_address ||
      checkoutOrderDetails?.result?.billing_address ||
      checkoutOrderDetails?.billing_address ||
      checkoutOrderDetails?.data?.billing_address;

    // 2. Try webhookData (FastRR webhook)
    const webhookAddress =
      webhookData?.shipping_address ||
      webhookData?.result?.shipping_address ||
      webhookData?.data?.shipping_address ||
      webhookData?.billing_address ||
      webhookData?.result?.billing_address ||
      webhookData?.data?.billing_address;

    // 3. Try payment gatewayResponse
    let paymentAddress = null;
    if (order.paymentId) {
      const p = await Payment.findById(order.paymentId).lean();
      paymentAddress =
        p?.gatewayResponse?.shipping_address ||
        p?.gatewayResponse?.result?.shipping_address ||
        p?.gatewayResponse?.billing_address;
    }

    // 4. Try order.shippingAddress IF it has a real address
    const orderAddress =
      order.shippingAddress &&
        order.shippingAddress.address &&
        order.shippingAddress.address !== "Customer Address"
        ? order.shippingAddress
        : null;

    // // 5. Try saved Address in DB
    // let dbAddress = null;
    // if (order.user) {
    //   dbAddress = await Address.findOne({ user: order.user })
    //     .sort({ isDefault: -1, updatedAt: -1 })
    //     .lean();
    // }

    // // 6. Try user's previous order with a valid address
    // let lastOrderAddress = null;
    // if (order.user) {
    //   const lastOrder = await Order.findOne({
    //     user: order.user,
    //     _id: { $ne: order._id },
    //     "shippingAddress.address": {
    //       $exists: true,
    //       $nin: [null, "", "Customer Address"],
    //     },
    //   })
    //     .sort({ createdAt: -1 })
    //     .lean();

    //   if (lastOrder?.shippingAddress?.address) {
    //     lastOrderAddress = lastOrder.shippingAddress;
    //   }
    // }

    // 7. Try user profile
    let userDoc = null;
    if (order.user) {
      userDoc = await User.findById(order.user).lean();
    }

    const hasValidAddress = (a) => {
      if (!a || typeof a !== "object") return false;
      const line =
        a.line1 ||
        a.address1 ||
        a.address_1 ||
        a.address ||
        a.address_line1 ||
        a.street;
      return Boolean(line && line !== "Customer Address");
    };

    // Precedence:
    // 1. Live FastRR Checkout Address (user selected/confirmed in the checkout modal)
    // 2. FastRR Webhook Address
    // 3. Payment Gateway Response Address
    // 4. Order's existing address (if valid)
    // 5. User's saved DB address
    // 6. User's last order address
    const candidate =
      (hasValidAddress(checkoutAddress) ? checkoutAddress : null) ||
      (hasValidAddress(webhookAddress) ? webhookAddress : null) ||
      (hasValidAddress(paymentAddress) ? paymentAddress : null) ||
      (hasValidAddress(orderAddress) ? orderAddress : null);

    if (!candidate) {
      console.log(`[Address] No valid address candidate found yet for order ${order.orderId}`);
      return false;
    }

    const parsed = parseAddressData(candidate, userDoc);

    if (parsed) {
      order.shippingAddress = parsed;
      order.markModified("shippingAddress");
      await order.save();
      // Address collection mein yahan kuch save NAHI hoga
      return true;
    }
    return false;
  } catch (err) {
    console.warn(
      `[Address] Failed to resolve address for ${order.orderId}:`,
      err.message
    );
    return false;
  }
};

// Backward compatible wrapper
const updateOrderAddressFromFastRR = async (
  order,
  checkoutOrderDetails
) => {
  return await resolveAndSaveOrderAddress(order, checkoutOrderDetails, null);
};

// =====================================================
// HELPER: CHECK PAYMENT SUCCESS STATUS
// =====================================================

const isPaymentSuccessful = (
  statusStr,
  checkoutDetails = null,
  webhookData = null
) => {
  const successValues = [
    "SUCCESS",
    "PAID",
    "COMPLETED",
    "SUCCESSFUL",
    "CHARGED",
    "CAPTURED",
    "ORDER_CREATED",
  ];

  if (
    statusStr &&
    successValues.includes(String(statusStr).trim().toUpperCase())
  ) {
    return true;
  }

  const cdStatus = String(
    checkoutDetails?.result?.status || checkoutDetails?.status || ""
  ).trim().toUpperCase();
  if (successValues.includes(cdStatus)) return true;

  const cdPaymentStatus = String(
    checkoutDetails?.result?.payment_status ||
    checkoutDetails?.payment_status ||
    ""
  ).trim().toUpperCase();
  if (successValues.includes(cdPaymentStatus)) return true;

  const payments =
    checkoutDetails?.result?.payments || checkoutDetails?.payments;
  if (Array.isArray(payments) && payments.length > 0) {
    const hasSuccess = payments.some((p) => {
      const pStatus = String(
        p?.payment_status || p?.status || ""
      ).trim().toUpperCase();
      return successValues.includes(pStatus);
    });
    if (hasSuccess) return true;
  }

  const whStatus = String(
    webhookData?.status || webhookData?.result?.status || ""
  ).trim().toUpperCase();
  if (successValues.includes(whStatus)) return true;

  const whPaymentStatus = String(
    webhookData?.payment_status ||
    webhookData?.result?.payment_status ||
    ""
  ).trim().toUpperCase();
  if (successValues.includes(whPaymentStatus)) return true;

  const whEvent = String(
    webhookData?.event || webhookData?.event_type || ""
  ).trim().toLowerCase();
  if (
    whEvent.includes("order.paid") ||
    whEvent.includes("payment.success") ||
    whEvent.includes("checkout.completed")
  ) {
    return true;
  }

  return false;
};

// =====================================================
// HELPER: CHECK PAYMENT FAILED STATUS
// =====================================================

const isPaymentFailed = (
  statusStr,
  checkoutDetails = null,
  webhookData = null
) => {
  const failValues = [
    "FAILED",
    "FAILURE",
    "CANCELLED",
    "CANCELED",
    "DECLINED",
    "EXPIRED",
    "USER_DROPPED",
    "DROPPED",
    "ABORTED",
    "PAYMENT_FAILED",
    "ORDER_CANCELLED",
    "REJECTED",
    "BOUNCED",
    "DISMISSED",
    "CANCEL",
    "VOID",
  ];

  if (
    statusStr &&
    failValues.includes(String(statusStr).trim().toUpperCase())
  ) {
    return true;
  }

  const cdPaymentStatus = String(
    checkoutDetails?.result?.payment_status ||
    checkoutDetails?.payment_status ||
    ""
  ).trim().toUpperCase();
  if (failValues.includes(cdPaymentStatus)) return true;

  const cdStatus = String(
    checkoutDetails?.result?.status || checkoutDetails?.status || ""
  ).trim().toUpperCase();
  if (failValues.includes(cdStatus)) return true;

  const payments =
    checkoutDetails?.result?.payments || checkoutDetails?.payments;
  if (Array.isArray(payments) && payments.length > 0) {
    const hasFailed = payments.some((p) => {
      const pStatus = String(
        p?.payment_status || p?.status || ""
      ).trim().toUpperCase();
      return failValues.includes(pStatus);
    });
    if (hasFailed) return true;
  }

  const whStatus = String(
    webhookData?.status || webhookData?.result?.status || ""
  ).trim().toUpperCase();
  if (failValues.includes(whStatus)) return true;

  const whPaymentStatus = String(
    webhookData?.payment_status ||
    webhookData?.result?.payment_status ||
    ""
  ).trim().toUpperCase();
  if (failValues.includes(whPaymentStatus)) return true;

  const whEvent = String(
    webhookData?.event || webhookData?.event_type || ""
  ).trim().toLowerCase();
  if (
    whEvent.includes("cancelled") ||
    whEvent.includes("canceled") ||
    whEvent.includes("failed") ||
    whEvent.includes("dismissed") ||
    whEvent.includes("declined") ||
    whEvent.includes("expired") ||
    whEvent.includes("dropped")
  ) {
    return true;
  }

  return false;
};

// =====================================================
// HELPER: MARK ORDER AND PAYMENT FAILED & CANCELLED
// =====================================================

const markOrderAndPaymentFailed = async (
  order,
  payment,
  reason = "Payment cancelled / failed",
  gatewayResponse = null
) => {
  try {
    const failReason = reason || "Payment cancelled / failed";

    // Do not override already confirmed / paid / delivered / shipped orders
    if (
      order &&
      ["CONFIRMED", "SHIPPED", "OUT_FOR_DELIVERY", "DELIVERED"].includes(
        String(order.orderStatus || "").toUpperCase()
      ) &&
      String(order.paymentStatus || "").toUpperCase() === "PAID"
    ) {
      console.warn(
        `[markOrderAndPaymentFailed] Skipped: Order ${order.orderId} is already PAID / ${order.orderStatus}`
      );
      return;
    }

    if (payment) {
      payment.status = "FAILED";
      payment.failureReason = failReason;
      if (gatewayResponse) {
        payment.gatewayResponse = gatewayResponse;
      }
      await payment.save();
    }

    if (order) {
      order.paymentStatus = "FAILED";
      order.orderStatus = "CANCELLED";
      order.cancellationReason = failReason;
      if (!order.cancelledAt) {
        order.cancelledAt = new Date();
      }
      await order.save();

      // Ensure delivery address is resolved if missing
      if (
        !order.shippingAddress ||
        !order.shippingAddress.address ||
        order.shippingAddress.address === "Customer Address"
      ) {
        await resolveAndSaveOrderAddress(order, null, gatewayResponse);
      }
    }

    console.log(
      `[markOrderAndPaymentFailed] Order ${order?.orderId} marked CANCELLED, payment marked FAILED. Reason: ${failReason}`
    );
  } catch (err) {
    console.error("[markOrderAndPaymentFailed] Error:", err.message);
  }
};

// =====================================================
// FETCH + SAVE FASTRR CHECKOUT ADDRESS
// =====================================================

const fetchAndSaveCheckoutAddress = async (order, payment) => {
  try {
    if (!payment?.gatewayOrderId) {
      console.log(
        "FastRR gateway order ID not available. Address cannot be fetched yet."
      );
      return null;
    }

    const checkoutDetails = await fetchFastRROrderDetails(
      String(payment.gatewayOrderId)
    );

    await resolveAndSaveOrderAddress(order, checkoutDetails, null);

    return checkoutDetails;
  } catch (error) {
    console.error(
      "FETCH FASTRR CHECKOUT ADDRESS ERROR:",
      error?.response?.data || error.message
    );
    return null;
  }
};

// =====================================================
// SHIPROCKET PAYLOAD
// =====================================================

const buildShiprocketOrderPayload = (order, paymentMethod) => {
  const address = order.shippingAddress || {};

  const phone = normalizePhone(
    address.phone || order.user?.phone || ""
  );

  const shippableItems = (order.items || []).filter(
    (item) =>
      !/delivery/i.test(item.name || "") &&
      !/shipping/i.test(item.name || "") &&
      String(item.variantId) !== "9999999999"
  );

  const itemsToShip =
    shippableItems.length > 0 ? shippableItems : order.items || [];

  if (!itemsToShip.length) {
    throw new Error(`No shippable items found for order ${order.orderId}`);
  }

  const shiprocketItems = itemsToShip.map((item) => ({
    name: item.name || "Sweet Item",
    sku:
      item.sku ||
      item.product?.toString() ||
      `SKU-${item.variantId || order.orderId}`,
    units: Number(item.quantity) || 1,
    selling_price: Number(item.price) || 0,
  }));

  const totalPackageWeight = itemsToShip.reduce((total, item) => {
    const weight = Number(item.weight || 0);
    const quantity = Number(item.quantity || 1);
    return total + weight * quantity;
  }, 0);

  const firstPackageItem = itemsToShip[0] || {};

  const packageLength =
    Number.isFinite(Number(firstPackageItem.length)) &&
      Number(firstPackageItem.length) > 0
      ? Number(firstPackageItem.length)
      : Number(process.env.SHIPROCKET_PACKAGE_LENGTH) || 10;

  const packageBreadth =
    Number.isFinite(Number(firstPackageItem.breadth)) &&
      Number(firstPackageItem.breadth) > 0
      ? Number(firstPackageItem.breadth)
      : Number(process.env.SHIPROCKET_PACKAGE_BREADTH) || 10;

  const packageHeight =
    Number.isFinite(Number(firstPackageItem.height)) &&
      Number(firstPackageItem.height) > 0
      ? Number(firstPackageItem.height)
      : Number(process.env.SHIPROCKET_PACKAGE_HEIGHT) || 10;

  const packageWeight =
    Number.isFinite(Number(totalPackageWeight)) &&
      Number(totalPackageWeight) > 0
      ? Number(totalPackageWeight)
      : Number(process.env.SHIPROCKET_PACKAGE_WEIGHT) || 0.5;

  const isCOD =
    String(paymentMethod || "")
      .trim()
      .toUpperCase() === "COD";

  const billingName = address.name || order.user?.name || "Customer";
  const billingAddr = address.address || "";
  const billingCity = address.city || "Meerut";
  const billingPincode = String(address.pincode || "250002");
  const billingState = address.state || "Uttar Pradesh";

  const shippingCharge = Number(order.shippingCharge || 0);
  const totalDiscount = Number(order.discount || order.couponDiscount || 0);
  const subTotal = Number(
    order.subtotal ||
    Math.max(0, Number(order.totalAmount || 0) + totalDiscount - shippingCharge)
  );

  return {
    order_id: order.orderId,
    order_date: order.createdAt
      ? order.createdAt.toISOString()
      : new Date().toISOString(),
    pickup_location: process.env.SHIPROCKET_PICKUP_LOCATION || "warehouse",
    comment: "We Make Sweets Order",

    // BILLING
    billing_customer_name: billingName,
    billing_last_name: "",
    billing_address: billingAddr,
    billing_address_2: address.address2 || "",
    billing_city: billingCity,
    billing_pincode: billingPincode,
    billing_state: billingState,
    billing_country: address.country || "India",
    billing_email: address.email || "",
    billing_phone: phone,

    // SHIPPING
    shipping_is_billing: true,
    shipping_customer_name: billingName,
    shipping_last_name: "",
    shipping_address: billingAddr,
    shipping_address_2: address.address2 || "",
    shipping_city: billingCity,
    shipping_pincode: billingPincode,
    shipping_state: billingState,
    shipping_country: address.country || "India",
    shipping_email: address.email || "",
    shipping_phone: phone,

    // ITEMS
    order_items: shiprocketItems,

    // PAYMENT: Shiprocket expects "Prepaid" or "COD"
    payment_method: isCOD ? "COD" : "Prepaid",

    // CHARGES
    shipping_charges: shippingCharge,
    giftwrap_charges: 0,
    transaction_charges: 0,
    total_discount: totalDiscount,
    sub_total: subTotal,

    // PACKAGE
    length: packageLength,
    breadth: packageBreadth,
    height: packageHeight,
    weight: packageWeight,
  };
};

// =====================================================
// HELPER: SYNC FASTRR ORDER (COD vs ONLINE)
// =====================================================

const syncFastrrOrder = async (
  order,
  payment,
  checkoutOrderDetails = null,
  webhookData = null
) => {
  if (!order || !payment) return null;

  // Extract payment type
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

  const cod =
    isCODPayment(webhookPaymentType) || isCODPayment(fastrrPaymentType);
  const targetPaymentMethod = cod ? "COD" : "ONLINE";
  const targetPaymentStatus = cod ? "PENDING" : "PAID";

  console.log("========================================");
  console.log("SYNCING FASTRR ORDER:", order.orderId);
  console.log("Determined isCOD:", cod);
  console.log("Target Payment Method:", targetPaymentMethod);
  console.log("Target Payment Status:", targetPaymentStatus);
  console.log("========================================");

  // 1. Resolve & save address
  await resolveAndSaveOrderAddress(order, checkoutOrderDetails, webhookData);

  // 2. Extract final payable amount, discount, and coupon codes from FastRR
  const finalPayable = getFirstValue(
    checkoutOrderDetails?.result?.total_amount_payable,
    checkoutOrderDetails?.total_amount_payable,
    webhookData?.result?.total_amount_payable,
    webhookData?.total_amount_payable,
    webhookData?.cart_data?.total_amount_payable,
    webhookData?.amount
  );

  const totalDiscount = getFirstValue(
    checkoutOrderDetails?.result?.total_discount,
    checkoutOrderDetails?.result?.coupon_discount,
    checkoutOrderDetails?.total_discount,
    checkoutOrderDetails?.coupon_discount,
    webhookData?.result?.total_discount,
    webhookData?.result?.coupon_discount,
    webhookData?.total_discount,
    webhookData?.coupon_discount
  );

  const subtotalPrice = getFirstValue(
    checkoutOrderDetails?.result?.subtotal_price,
    checkoutOrderDetails?.subtotal_price,
    webhookData?.result?.subtotal_price,
    webhookData?.subtotal_price,
    webhookData?.cart_data?.subtotal_price
  );

  const rawCouponCodes =
    checkoutOrderDetails?.result?.coupon_codes ||
    checkoutOrderDetails?.coupon_codes ||
    webhookData?.result?.coupon_codes ||
    webhookData?.coupon_codes;

  let couponCode = null;
  if (Array.isArray(rawCouponCodes) && rawCouponCodes.length > 0) {
    couponCode = String(rawCouponCodes[0]).trim();
  } else if (typeof rawCouponCodes === "string" && rawCouponCodes.trim()) {
    couponCode = rawCouponCodes.trim();
  }

  if (
    subtotalPrice !== null &&
    Number.isFinite(Number(subtotalPrice)) &&
    Number(subtotalPrice) > 0
  ) {
    order.subtotal = Number(subtotalPrice);
  }

  let numericDiscount = 0;
  if (
    totalDiscount !== null &&
    Number.isFinite(Number(totalDiscount)) &&
    Number(totalDiscount) >= 0
  ) {
    numericDiscount = Number(totalDiscount);
  }

  if (
    finalPayable !== null &&
    Number.isFinite(Number(finalPayable)) &&
    Number(finalPayable) > 0
  ) {
    const numericPayable = Number(finalPayable);
    order.totalAmount = numericPayable;
    payment.amount = numericPayable;

    if (numericDiscount === 0 && order.subtotal > numericPayable) {
      numericDiscount = Number(
        (order.subtotal + (order.shippingCharge || 0) - numericPayable).toFixed(2)
      );
      if (numericDiscount < 0) numericDiscount = 0;
    }
  } else if (numericDiscount > 0 && order.subtotal > 0) {
    order.totalAmount = Math.max(
      0,
      Number((order.subtotal + (order.shippingCharge || 0) - numericDiscount).toFixed(2))
    );
    payment.amount = order.totalAmount;
  }

  order.discount = numericDiscount;
  order.couponDiscount = numericDiscount;
  if (couponCode) {
    order.couponCode = couponCode;
  }
  order.fastrrSyncedAt = new Date();

  console.log("FASTRR FINANCIAL SYNC:", {
    orderId: order.orderId,
    subtotal: order.subtotal,
    discount: order.discount,
    couponCode: order.couponCode,
    totalAmount: order.totalAmount,
    paymentAmount: payment.amount,
  });

  // 3. Update Payment
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

  // 4. Update Order
  order.paymentMethod = targetPaymentMethod;
  order.paymentStatus = targetPaymentStatus;
  order.orderStatus = "CONFIRMED";
  await order.save();

  // 4. Create Shiprocket Order if not created yet
  if (!order.shiprocket?.orderId) {
    try {
      // Ensure address is present before calling Shiprocket
      if (!order.shippingAddress || !order.shippingAddress.address) {
        await resolveAndSaveOrderAddress(
          order,
          checkoutOrderDetails,
          webhookData
        );
      }

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

      order.shiprocket.orderId = String(
        shiprocketResponse?.order_id || shiprocketResponse?.orderId || ""
      );
      order.shiprocket.shipmentId = String(
        shiprocketResponse?.shipment_id ||
        shiprocketResponse?.shipmentId ||
        ""
      );
      order.shiprocket.status = "ORDER_CREATED";
      order.shiprocket.createdAt =
        order.shiprocket.createdAt || new Date();
      order.shiprocket.updatedAt = new Date();
      await order.save();
    } catch (srErr) {
      console.error(
        "Shiprocket order creation failed in syncFastrrOrder:",
        srErr.response?.data || srErr.message
      );
    }
  }

  // 5. Trigger WhatsApp notification
  whatsappService
    .sendOrderStatusNotification(order, "CONFIRMED")
    .catch((waErr) =>
      console.error(
        "WhatsApp confirmation notification error:",
        waErr.message
      )
    );

  return order;
};

// =====================================================
// 1. CREATE ONLINE PAYMENT / FASTRR CHECKOUT
//
// POST /api/payment/create
// =====================================================

const createPayment = async (req, res) => {
  try {
    const userId = getUserId(req);
    const { orderId } = req.body;

    if (!userId) {
      return res.status(401).json({
        success: false,
        message: "Unauthorized",
      });
    }

    if (!orderId) {
      return res.status(400).json({
        success: false,
        message: "orderId is required",
      });
    }

    const order = await Order.findOne({
      orderId,
      user: userId,
    }).populate("items.product");

    if (!order) {
      return res.status(404).json({
        success: false,
        message: "Order not found",
      });
    }

    if (!["ONLINE", "COD"].includes(order.paymentMethod)) {
      return res.status(400).json({
        success: false,
        message: "FastRR checkout is only available for ONLINE or COD orders",
      });
    }

    if (order.paymentMethod === "ONLINE" && order.paymentStatus === "PAID") {
      return res.status(400).json({
        success: false,
        message: "Order is already paid",
      });
    }

    const amount = Number(order.totalAmount);
    if (!Number.isFinite(amount) || amount <= 0) {
      return res.status(400).json({
        success: false,
        message: "Invalid order amount",
      });
    }

    let payment = await Payment.findOne({
      order: order._id,
      user: userId,
    });

    if (!payment) {
      payment = await Payment.create({
        order: order._id,
        orderId: order.orderId,
        user: userId,
        amount,
        currency: "INR",
        paymentMethod: order.paymentMethod,
        gateway: "FASTRR",
        status: "PROCESSING",
      });
    } else {
      payment.amount = amount;
      payment.paymentMethod = order.paymentMethod;
      payment.gateway = "FASTRR";
      payment.status = "PROCESSING";
      payment.failureReason = null;
      await payment.save();
    }

    // Prepare FastRR items
    const items = [];
    for (const item of order.items) {
      if (!item.variantId) {
        throw new Error(`Variant ID missing for order item: ${item.name}`);
      }

      const product = item.product;
      if (!product) {
        throw new Error(`Product missing for order item: ${item.name}`);
      }

      const variant = product.variants?.id(item.variantId);
      if (!variant) {
        throw new Error(`Variant not found for order item: ${item.name}`);
      }

      if (!variant.shiprocketId) {
        throw new Error(`Shiprocket variant ID missing for: ${item.name}`);
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
        variant_id: String(variant.shiprocketId),
        quantity: Number(item.quantity),
        catalog_data: {
          price: itemPrice,
          name: itemName,
          image_url: itemImage,
        },
      });
    }

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

    const frontendUrl = String(
      process.env.FRONTEND_URL || "https://wemakesweets.com"
    ).replace(/\/+$/, "");

    const userDoc = await User.findById(userId).lean();
    const customerPhone = normalizePhone(userDoc?.phone || "");
    const customerEmail = userDoc?.email || "";
    const customerName = userDoc?.name || "";

    const payload = {
      cart_data: {
        items,
      },
      customer: {
        phone: customerPhone,
        email: customerEmail,
        name: customerName,
      },
      redirect_url:
        `${frontendUrl}/payment/success` +
        `?orderId=${encodeURIComponent(order.orderId)}`,
      timestamp: new Date().toISOString(),
    };

    console.log("========================================");
    console.log("CREATING FASTRR CHECKOUT");
    console.log("Order:", order.orderId);
    console.log("Order Payment Method:", order.paymentMethod);
    console.log(JSON.stringify(payload, null, 2));
    console.log("========================================");

    const fastrrResponse = await createCheckout(payload);

    const checkoutToken = getFirstValue(
      fastrrResponse?.result?.token,
      fastrrResponse?.token,
      fastrrResponse?.data?.token
    );

    const gatewayOrderId = getFirstValue(
      fastrrResponse?.result?.data?.order_id,
      fastrrResponse?.result?.order_id,
      fastrrResponse?.order_id,
      fastrrResponse?.data?.order_id,
      fastrrResponse?.gateway_order_id,
      fastrrResponse?.data?.gateway_order_id
    );

    if (!checkoutToken) {
      return res.status(502).json({
        success: false,
        message: "FastRR checkout token was not received",
        fastrrResponse,
      });
    }

    payment.gatewayOrderId = gatewayOrderId ? String(gatewayOrderId) : null;
    payment.gatewayResponse = fastrrResponse;
    payment.status = "PROCESSING";
    await payment.save();

    order.paymentStatus = "PROCESSING";
    await order.save();

    return res.status(200).json({
      success: true,
      message: "FASTRR checkout created successfully",
      paymentId: payment._id,
      orderId: order.orderId,
      amount: payment.amount,
      currency: payment.currency,
      status: payment.status,
      paymentMethod: order.paymentMethod,
      checkoutToken,
      gatewayOrderId: payment.gatewayOrderId,
      fastrrResponse,
    });
  } catch (error) {
    console.error(
      "CREATE PAYMENT ERROR:",
      error.response?.data || error.message
    );
    return res.status(error.response?.status || 500).json({
      success: false,
      message: "Unable to create FastRR payment",
      error: error.response?.data || error.message,
    });
  }
};

// =====================================================
// PAYMENT SUCCESS / GET PAYMENT STATUS
// =====================================================

const paymentSuccess = async (req, res) => {
  try {
    const userId = getUserId(req);
    const { paymentId, orderId, gatewayOrderId } = req.body;

    if (!userId) {
      return res.status(401).json({
        success: false,
        message: "Unauthorized",
      });
    }

    let payment = null;
    if (paymentId) {
      payment = await Payment.findOne({ _id: paymentId, user: userId });
    }
    if (!payment && gatewayOrderId) {
      payment = await Payment.findOne({
        gatewayOrderId: String(gatewayOrderId),
        user: userId,
      });
    }
    if (!payment && orderId) {
      payment = await Payment.findOne({ orderId, user: userId });
    }

    if (!payment) {
      return res.status(404).json({
        success: false,
        message: "Payment not found",
      });
    }

    let order = await Order.findById(payment.order).populate("items.product");
    if (
      order &&
      payment.gatewayOrderId &&
      (order.orderStatus !== "CONFIRMED" || !order.shiprocket?.orderId || !order.fastrrSyncedAt)
    ) {
      try {
        const checkoutDetails = await fetchFastRROrderDetails(
          String(payment.gatewayOrderId)
        );

        if (isPaymentSuccessful(null, checkoutDetails, null)) {
          await syncFastrrOrder(order, payment, checkoutDetails, null);
          order = await Order.findById(order._id).populate("items.product");
        } else if (isPaymentFailed(null, checkoutDetails, null)) {
          console.log(
            `[PaymentSuccess] Payment failed/cancelled in FastRR for ${order.orderId}`
          );
          await markOrderAndPaymentFailed(
            order,
            payment,
            checkoutDetails?.result?.error ||
            checkoutDetails?.message ||
            "Payment cancelled / failed in FastRR",
            checkoutDetails
          );
          order = await Order.findById(order._id).populate("items.product");
        }
      } catch (fastrrErr) {
        console.warn(
          "Could not sync with FastRR in paymentSuccess:",
          fastrrErr.message
        );
      }
    }

    return res.status(200).json({
      success: true,
      message: "Payment status retrieved successfully",
      order,
      payment: {
        id: payment._id,
        orderId: payment.orderId,
        amount: payment.amount,
        status: payment.status,
        paymentMethod: payment.paymentMethod,
        paymentId: payment.paymentId,
        transactionId: payment.transactionId,
        gateway: payment.gateway,
        gatewayOrderId: payment.gatewayOrderId,
        paidAt: payment.paidAt,
      },
    });
  } catch (error) {
    console.error("PAYMENT SUCCESS ERROR:", error);
    return res.status(500).json({
      success: false,
      message: "Unable to get payment status",
      error: error.message,
    });
  }
};

// =====================================================
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

    // Auto-sync with FastRR if not confirmed or shiprocket order not created yet or not synced
    if (
      payment.gatewayOrderId &&
      (order.orderStatus !== "CONFIRMED" || !order.shiprocket?.orderId || !order.fastrrSyncedAt)
    ) {
      try {
        console.log("Verifying order with FastRR:", payment.gatewayOrderId);
        let checkoutDetails = await fetchFastRROrderDetails(
          String(payment.gatewayOrderId)
        );

        let isSuccess = isPaymentSuccessful(null, checkoutDetails, null);

        // If card payment is still INITIATED or PROCESSING, wait 2s and retry once
        const cdStatus = String(
          checkoutDetails?.result?.status || checkoutDetails?.status || ""
        ).toUpperCase();
        if (
          !isSuccess &&
          order.paymentMethod === "ONLINE" &&
          (cdStatus === "INITIATED" || cdStatus === "PROCESSING" || cdStatus === "")
        ) {
          console.log(`[Verify] Waiting 2s for 3DS settlement for ${order.orderId}...`);
          await new Promise((resolve) => setTimeout(resolve, 2000));
          try {
            checkoutDetails = await fetchFastRROrderDetails(
              String(payment.gatewayOrderId)
            );
            isSuccess = isPaymentSuccessful(null, checkoutDetails, null);
          } catch (_) { }
        }

        if (isSuccess) {
          await syncFastrrOrder(order, payment, checkoutDetails, null);
        } else if (
          isPaymentFailed(null, checkoutDetails, null) ||
          (order.orderStatus === "PENDING" &&
            order.paymentMethod === "ONLINE" &&
            Date.now() - new Date(order.createdAt).getTime() > 60 * 1000)
        ) {
          console.log(
            `[Verify] Payment failed/cancelled for order ${order.orderId}`
          );
          await markOrderAndPaymentFailed(
            order,
            payment,
            checkoutDetails?.result?.error ||
            checkoutDetails?.message ||
            "Payment cancelled / checkout backed out",
            checkoutDetails
          );
        }
      } catch (fastrrErr) {
        console.warn(
          "Could not sync with FastRR in verifyPayment:",
          fastrrErr.message
        );
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
// 3. PAYMENT FAILED / CANCELLED
// =====================================================

const paymentFailed = async (req, res) => {
  try {
    const userId = getUserId(req);
    const { paymentId, orderId, gatewayOrderId, reason, failureReason } =
      req.body;

    if (!userId) {
      return res.status(401).json({
        success: false,
        message: "Unauthorized",
      });
    }

    let payment = null;
    if (paymentId) {
      payment = await Payment.findOne({ _id: paymentId, user: userId });
    }
    if (!payment && gatewayOrderId) {
      payment = await Payment.findOne({
        gatewayOrderId: String(gatewayOrderId),
        user: userId,
      });
    }
    if (!payment && orderId) {
      payment = await Payment.findOne({ orderId, user: userId });
    }

    let order = null;
    if (payment) {
      order = await Order.findById(payment.order);
    }
    if (!order && orderId) {
      order = await Order.findOne({ orderId, user: userId });
      if (order && !payment) {
        payment = await Payment.findOne({ order: order._id, user: userId });
      }
    }

    if (!payment && !order) {
      return res.status(404).json({
        success: false,
        message: "Payment or Order not found",
      });
    }

    if (payment && payment.paymentMethod === "COD") {
      return res.status(400).json({
        success: false,
        message: "COD order does not use online payment failure flow",
      });
    }

    const failReason =
      failureReason || reason || "Payment cancelled by user / failed";

    await markOrderAndPaymentFailed(order, payment, failReason, req.body);

    return res.status(200).json({
      success: true,
      message: "Payment marked as FAILED and order marked as CANCELLED",
      orderId: order?.orderId || payment?.orderId,
      orderStatus: order?.orderStatus || "CANCELLED",
      paymentStatus: payment?.status || "FAILED",
      payment: payment
        ? {
          id: payment._id,
          orderId: payment.orderId,
          status: payment.status,
          failureReason: payment.failureReason,
        }
        : null,
      order: order
        ? {
          id: order._id,
          orderId: order.orderId,
          orderStatus: order.orderStatus,
          paymentStatus: order.paymentStatus,
          cancellationReason: order.cancellationReason,
          cancelledAt: order.cancelledAt,
        }
        : null,
    });
  } catch (error) {
    console.error("PAYMENT FAILED ERROR:", error);
    return res.status(500).json({
      success: false,
      message: "Unable to update payment failure",
      error: error.message,
    });
  }
};

// =====================================================
// FASTRR WEBHOOK
// =====================================================

const fastrrWebhook = async (req, res) => {
  try {
    console.log("========================================");
    console.log("FASTRR CHECKOUT WEBHOOK RECEIVED");
    console.log("========================================");

    let rawBody;
    if (Buffer.isBuffer(req.body)) {
      rawBody = req.body.toString("utf8");
    } else if (typeof req.body === "string") {
      rawBody = req.body;
    } else {
      rawBody = JSON.stringify(req.body);
    }

    console.log("Webhook Raw Body:", rawBody);

    const receivedApiKey =
      req.headers["x-api-key"] || req.headers["api-key"];
    const receivedHmac =
      req.headers["x-api-hmac-sha256"] ||
      req.headers["x-hmac-sha256"] ||
      req.headers["x-fastrr-hmac"];

    const requireWebhookHmac =
      String(process.env.REQUIRE_FASTRR_WEBHOOK_HMAC).toLowerCase() === "true";

    if (requireWebhookHmac) {
      if (!receivedApiKey || receivedApiKey !== process.env.FASTRR_API_KEY) {
        return res.status(401).json({
          success: false,
          message: "Invalid API key",
        });
      }

      if (!receivedHmac || !verifyHmac(rawBody, receivedHmac)) {
        return res.status(401).json({
          success: false,
          message: "Invalid HMAC",
        });
      }
    } else if (receivedHmac) {
      const validHmac = verifyHmac(rawBody, receivedHmac);
      if (!validHmac) {
        console.warn(
          "[Webhook Warning] HMAC present but did not match secret, proceeding since REQUIRE_FASTRR_WEBHOOK_HMAC is false"
        );
      }
    }

    let webhookData;
    try {
      webhookData = JSON.parse(rawBody);
    } catch (error) {
      return res.status(400).json({
        success: false,
        message: "Invalid webhook JSON",
      });
    }

    console.log("Webhook Data:", JSON.stringify(webhookData, null, 2));

    const webhookOrderId = getFirstValue(
      webhookData?.order_id,
      webhookData?.orderId,
      webhookData?.platform_order_id,
      webhookData?.platformOrderId,
      webhookData?.fastrr_order_id,
      webhookData?.result?.order_id,
      webhookData?.result?.orderId,
      webhookData?.result?.platform_order_id
    );

    if (!webhookOrderId) {
      return res.status(400).json({
        success: false,
        message: "order_id is missing from webhook",
      });
    }

    let payment = await Payment.findOne({
      gatewayOrderId: String(webhookOrderId),
    });

    if (!payment) {
      payment = await Payment.findOne({
        orderId: String(webhookOrderId),
      });
    }

    if (!payment) {
      payment = await Payment.findOne({
        transactionId: String(webhookOrderId),
      });
    }

    if (!payment) {
      console.error(
        "Payment not found for FastRR webhook:",
        webhookOrderId
      );
      return res.status(404).json({
        success: false,
        message: "Payment not found for webhook order",
      });
    }

    const order = await Order.findById(payment.order).populate(
      "items.product"
    );

    if (!order) {
      return res.status(404).json({
        success: false,
        message: "Order not found for payment",
      });
    }

    const status = String(
      getFirstValue(
        webhookData?.status,
        webhookData?.result?.status,
        webhookData?.payment_status,
        webhookData?.result?.payment_status
      ) || ""
    )
      .trim()
      .toUpperCase();

    const paymentType = getFirstValue(
      webhookData?.payment_type,
      webhookData?.paymentType,
      webhookData?.result?.payment_type,
      webhookData?.result?.paymentType
    );

    const totalAmount = Number(
      getFirstValue(
        webhookData?.total_amount_payable,
        webhookData?.totalAmountPayable,
        webhookData?.amount,
        webhookData?.result?.total_amount_payable
      )
    );

    // Validate amount ONLY if positive number was actually supplied
    if (
      Number.isFinite(totalAmount) &&
      totalAmount > 0 &&
      Math.abs(totalAmount - Number(order.totalAmount)) > 1.0
    ) {
      console.warn(
        `[Webhook Warning] Amount discrepancy: webhook ${totalAmount} vs order ${order.totalAmount}`
      );
    }

    // SUCCESS CASE
    if (isPaymentSuccessful(status, null, webhookData)) {
      console.log("FASTRR SUCCESS WEBHOOK for order:", order.orderId);

      let checkoutOrderDetails = null;
      try {
        if (payment.gatewayOrderId) {
          checkoutOrderDetails = await fetchFastRROrderDetails(
            String(payment.gatewayOrderId)
          );
        }
      } catch (checkoutDetailsError) {
        console.warn(
          "Unable to fetch FastRR checkout order details in webhook:",
          checkoutDetailsError?.response?.data ||
          checkoutDetailsError.message
        );
      }

      await syncFastrrOrder(
        order,
        payment,
        checkoutOrderDetails,
        webhookData
      );

      return res.status(200).json({
        success: true,
        message: "FastRR order webhook processed successfully",
        orderId: order.orderId,
        paymentId: payment._id,
        paymentMethod: order.paymentMethod,
        paymentStatus: order.paymentStatus,
        orderStatus: order.orderStatus,
        shippingAddress: order.shippingAddress,
        shiprocket: order.shiprocket,
      });
    }

    // FAILED CASE
    if (isPaymentFailed(status, null, webhookData)) {
      console.log("FASTRR FAILURE WEBHOOK for order:", order.orderId);
      const failReason = getFirstValue(
        webhookData?.message,
        webhookData?.error,
        webhookData?.failure_reason,
        "FastRR checkout/payment failed"
      );

      await markOrderAndPaymentFailed(order, payment, failReason, webhookData);

      return res.status(200).json({
        success: true,
        message: "FastRR failure webhook processed",
        orderId: order.orderId,
        paymentMethod: order.paymentMethod,
        paymentStatus: order.paymentStatus,
        orderStatus: order.orderStatus,
      });
    }

    // PROCESSING / PENDING CASE
    payment.gatewayResponse = webhookData;
    if (status === "PROCESSING") {
      payment.status = "PROCESSING";
      order.paymentStatus = "PROCESSING";
    } else {
      payment.status = "PENDING";
    }
    await payment.save();
    await order.save();

    return res.status(200).json({
      success: true,
      message: "FastRR webhook received",
      status,
      orderId: order.orderId,
      paymentStatus: payment.status,
    });
  } catch (error) {
    console.error("FASTRR WEBHOOK ERROR:", error);
    return res.status(500).json({
      success: false,
      message: "Unable to process FastRR webhook",
      error: error.message,
    });
  }
};

// =====================================================
// GET PAYMENT
// =====================================================

const getPayment = async (req, res) => {
  try {
    const userId = getUserId(req);
    const { paymentId } = req.params;

    if (!userId) {
      return res.status(401).json({
        success: false,
        message: "Unauthorized",
      });
    }

    const payment = await Payment.findOne({
      _id: paymentId,
      user: userId,
    })
      .populate(
        "order",
        "orderId totalAmount paymentStatus orderStatus paymentMethod shippingAddress"
      )
      .lean();

    if (!payment) {
      return res.status(404).json({
        success: false,
        message: "Payment not found",
      });
    }

    return res.status(200).json({
      success: true,
      payment: {
        id: payment._id,
        orderId: payment.orderId,
        amount: payment.amount,
        currency: payment.currency,
        paymentMethod: payment.paymentMethod,
        gateway: payment.gateway,
        status: payment.status,
        paymentId: payment.paymentId,
        transactionId: payment.transactionId,
        gatewayOrderId: payment.gatewayOrderId,
        failureReason: payment.failureReason,
        paidAt: payment.paidAt,
        createdAt: payment.createdAt,
        updatedAt: payment.updatedAt,
        shippingAddress: payment.order?.shippingAddress || null,
      },
    });
  } catch (error) {
    console.error("GET PAYMENT ERROR:", error);
    return res.status(500).json({
      success: false,
      message: "Unable to get payment",
      error: error.message,
    });
  }
};

// =====================================================
// GET FASTRR CHECKOUT DETAILS / ADDRESS
// =====================================================

const getCheckoutAddress = async (req, res) => {
  try {
    const userId = getUserId(req);
    const { orderId } = req.params;

    if (!userId) {
      return res.status(401).json({
        success: false,
        message: "Unauthorized",
      });
    }

    if (!orderId) {
      return res.status(400).json({
        success: false,
        message: "Order ID is required",
      });
    }

    const order = await Order.findOne({
      orderId: String(orderId),
      user: userId,
    });

    if (!order) {
      return res.status(404).json({
        success: false,
        message: "Order not found",
      });
    }

    const payment = await Payment.findOne({
      order: order._id,
      user: userId,
    });

    if (!payment) {
      return res.status(404).json({
        success: false,
        message: "Payment not found for this order",
      });
    }

    const gatewayOrderId = payment.gatewayOrderId;
    if (!gatewayOrderId) {
      return res.status(400).json({
        success: false,
        message: "FastRR gateway order ID not found for this payment",
      });
    }

    const checkoutDetails = await fetchFastRROrderDetails(
      String(gatewayOrderId)
    );

    await resolveAndSaveOrderAddress(order, checkoutDetails, null);

    return res.status(200).json({
      success: true,
      message: "Checkout details fetched successfully",
      orderId: order.orderId,
      gatewayOrderId,
      paymentMethod: order.paymentMethod,
      shippingAddress: order.shippingAddress,
      checkoutDetails,
    });
  } catch (error) {
    console.error(
      "GET CHECKOUT DETAILS ERROR:",
      error.response?.data || error.message
    );
    return res.status(error.response?.status || 500).json({
      success: false,
      message: "Unable to fetch checkout details",
      error: error.response?.data || error.message,
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
  isPaymentSuccessful,
  isPaymentFailed,
  markOrderAndPaymentFailed,
  resolveAndSaveOrderAddress,
  updateOrderAddressFromFastRR,
  buildShiprocketOrderPayload,
  parseAddressData,
};