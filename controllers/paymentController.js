const Order = require("../models/order");
const Payment = require("../models/payment");

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
  const value = String(
    paymentType || ""
  )
    .trim()
    .toUpperCase();

  return (
    value === "COD" ||
    value === "CASH_ON_DELIVERY" ||
    value === "CASH ON DELIVERY"
  );
};

// =====================================================
// HELPER: NORMALIZE INDIAN PHONE NUMBER
// =====================================================

const normalizePhone = (phone) => {
  if (!phone) {
    throw new Error(
      "Customer phone number is missing"
    );
  }

  const digits = String(phone).replace(
    /\D/g,
    ""
  );

  const normalized =
    digits.slice(-10);

  if (
    !/^\d{10}$/.test(
      normalized
    )
  ) {
    throw new Error(
      `Invalid customer phone number: ${phone}`
    );
  }

  return normalized;
};

// =====================================================
// HELPER: SHIPROCKET ORDER PAYLOAD
// =====================================================

const buildShiprocketOrderPayload = (
  order,
  paymentMethod
) => {
  const address =
    order.shippingAddress || {};

  const phone =
    normalizePhone(
      address.phone
    );

  const shiprocketItems =
    order.items.map((item) => ({
      name:
        item.name,

      sku:
        item.sku ||
        item.product?.toString(),

      units:
        Number(item.quantity),

      selling_price:
        Number(item.price),
    }));

  const isCOD =
    String(paymentMethod)
      .toUpperCase() === "COD";

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

    // ========================================
    // BILLING
    // ========================================

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
      address.country || "India",

    billing_email:
      address.email || "",

    billing_phone:
      phone,

    // ========================================
    // SHIPPING
    // ========================================

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
      address.country || "India",

    shipping_email:
      address.email || "",

    shipping_phone:
      phone,

    // ========================================
    // ITEMS
    // ========================================

    order_items:
      shiprocketItems,

    // ========================================
    // PAYMENT
    // ========================================

    payment_method:
      isCOD
        ? "COD"
        : "Prepaid",

    shipping_charges:
      0,

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

    // ========================================
    // PACKAGE
    // ========================================

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

    // ==========================================
    // AUTH
    // ==========================================

    if (!userId) {
      return res.status(401).json({
        success: false,
        message:
          "Unauthorized",
      });
    }

    // ==========================================
    // VALIDATE ORDER ID
    // ==========================================

    if (!orderId) {
      return res.status(400).json({
        success: false,
        message:
          "orderId is required",
      });
    }

    // ==========================================
    // FIND ORDER
    // ==========================================

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

    // ==========================================
    // ONLY ONLINE PAYMENT
    // ==========================================

    if (
      order.paymentMethod !==
      "ONLINE"
    ) {
      return res.status(400).json({
        success: false,
        message:
          "FastRR checkout is only available for ONLINE orders",
      });
    }

    // ==========================================
    // ALREADY PAID
    // ==========================================

    if (
      order.paymentStatus ===
      "PAID"
    ) {
      return res.status(400).json({
        success: false,
        message:
          "Order is already paid",
      });
    }

    // ==========================================
    // VALIDATE AMOUNT
    // ==========================================

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

    // ==========================================
    // FIND PAYMENT
    // ==========================================

    let payment =
      await Payment.findOne({
        order:
          order._id,

        user:
          userId,
      });

    // ==========================================
    // CREATE / UPDATE PAYMENT
    // ==========================================

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
            "ONLINE",

          gateway:
            "FASTRR",

          status:
            "PROCESSING",
        });
    } else {
      payment.amount =
        amount;

      payment.paymentMethod =
        "ONLINE";

      payment.gateway =
        "FASTRR";

      payment.status =
        "PROCESSING";

      payment.failureReason =
        null;

      await payment.save();
    }

    // ==========================================
    // BUILD FASTRR ITEMS
    // ==========================================

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

      if (
        !variant.shiprocketId
      ) {
        throw new Error(
          `Shiprocket variant ID missing for: ${item.name}`
        );
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
      });
    }

    // ==========================================
    // FASTRR PAYLOAD
    // ==========================================

    const frontendUrl =
      String(
        process.env.FRONTEND_URL ||
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

    // ==========================================
    // DEBUG LOG
    // ==========================================

    console.log(
      "========================================"
    );

    console.log(
      "CREATING FASTRR CHECKOUT"
    );

    console.log(
      "Order ID:",
      order.orderId
    );

    console.log(
      "Payment ID:",
      payment._id
    );

    console.log(
      "Amount:",
      amount
    );

    console.log(
      "FastRR Items:",
      JSON.stringify(
        items,
        null,
        2
      )
    );

    console.log(
      "FastRR Payload:",
      JSON.stringify(
        payload,
        null,
        2
      )
    );

    console.log(
      "========================================"
    );

    // ==========================================
    // CALL FASTRR
    // ==========================================

    const fastrrResponse =
      await createCheckout(
        payload
      );

    console.log(
      "FASTRR RESPONSE:",
      JSON.stringify(
        fastrrResponse,
        null,
        2
      )
    );

    // ==========================================
    // EXTRACT CHECKOUT TOKEN
    // ==========================================

    const checkoutToken =
      getFirstValue(
        fastrrResponse?.result?.token,

        fastrrResponse?.token,

        fastrrResponse?.data?.token
      );

    // ==========================================
    // EXTRACT FASTRR GATEWAY ORDER ID
    // ==========================================

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

    console.log(
      "FastRR Checkout Token:",
      checkoutToken
        ? "RECEIVED"
        : "MISSING"
    );

    console.log(
      "FastRR Gateway Order ID:",
      gatewayOrderId
    );

    // ==========================================
    // TOKEN VALIDATION
    // ==========================================

    if (!checkoutToken) {
      console.error(
        "FastRR token missing:",
        JSON.stringify(
          fastrrResponse,
          null,
          2
        )
      );

      return res.status(502).json({
        success: false,

        message:
          "FastRR checkout token was not received",

        fastrrResponse,
      });
    }

    // ==========================================
    // SAVE FASTRR DETAILS
    // ==========================================

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

    // ==========================================
    // UPDATE ORDER
    // ==========================================

    order.paymentStatus =
      "PROCESSING";

    await order.save();

    // ==========================================
    // RESPONSE
    // ==========================================

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
// 2. PAYMENT SUCCESS / GET PAYMENT STATUS
//
// POST /api/payment/success
//
// IMPORTANT:
// This endpoint DOES NOT mark payment as PAID.
// FastRR webhook is responsible for final confirmation.
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

    return res.status(200).json({
      success: true,

      message:
        "Payment status retrieved successfully",

      payment: {
        id:
          payment._id,

        orderId:
          payment.orderId,

        amount:
          payment.amount,

        status:
          payment.status,

        paymentId:
          payment.paymentId,

        transactionId:
          payment.transactionId,

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

// =====================================================
// 3. PAYMENT FAILED
//
// POST /api/payment/failed
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
// 4. FASTRR / SHIPROCKET CHECKOUT WEBHOOK
//
// POST /api/payment/fastrr/webhook
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

    // ==========================================
    // RAW BODY
    // ==========================================

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

    // ==========================================
    // HMAC HEADERS
    // ==========================================

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

    // ==========================================
    // HMAC VALIDATION
    // ==========================================

    if (
      requireWebhookHmac
    ) {

      if (
        !receivedApiKey ||
        receivedApiKey !==
          process.env
            .FASTRR_API_KEY
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
          process.env
            .FASTRR_API_KEY
      ) {
        return res.status(401).json({
          success: false,

          message:
            "Invalid API key",
        });
      }
    }

    // ==========================================
    // PARSE WEBHOOK
    // ==========================================

    let webhookData;

    try {

      webhookData =
        JSON.parse(
          rawBody
        );

    } catch (error) {

      console.error(
        "Invalid webhook JSON:",
        error.message
      );

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

    // ==========================================
    // EXTRACT DATA
    // ==========================================

    const webhookOrderId =
      getFirstValue(
        webhookData?.order_id,

        webhookData?.orderId
      );

    const status =
      String(
        getFirstValue(
          webhookData?.status
        ) || ""
      )
        .trim()
        .toUpperCase();

    const paymentType =
      getFirstValue(
        webhookData?.payment_type,

        webhookData?.paymentType
      );

    const totalAmount =
      Number(
        getFirstValue(
          webhookData
            ?.total_amount_payable,

          webhookData
            ?.totalAmountPayable
        )
      );

    const phone =
      getFirstValue(
        webhookData?.phone
      );

    const email =
      getFirstValue(
        webhookData?.email
      );

    const cartItems =
      Array.isArray(
        webhookData
          ?.cart_data
          ?.items
      )
        ? webhookData
            .cart_data
            .items
        : [];

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
      "Webhook Amount:",
      totalAmount
    );

    console.log(
      "Webhook Phone:",
      phone
    );

    console.log(
      "Webhook Email:",
      email
    );

    // ==========================================
    // VALIDATE ORDER ID
    // ==========================================

    if (!webhookOrderId) {
      return res.status(400).json({
        success: false,

        message:
          "order_id is missing from webhook",
      });
    }

    // ==========================================
    // FIND PAYMENT BY FASTRR GATEWAY ORDER ID
    // ==========================================

    let payment =
      await Payment.findOne({
        gatewayOrderId:
          String(
            webhookOrderId
          ),
      });

    // ==========================================
    // FALLBACK TO OUR ORDER ID
    // ==========================================

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

    console.log(
      "Payment Found:",
      payment._id
    );

    // ==========================================
    // FIND OUR ORDER
    // ==========================================

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

    // ==========================================
    // IDEMPOTENCY
    // ==========================================

    const alreadyPaid =
      payment.status ===
      "PAID";

    const shiprocketAlreadyCreated =
      !!order.shiprocket?.orderId;

    // ==========================================
    // LOG WEBHOOK ITEMS
    // ==========================================

    console.log(
      "FastRR Webhook Items:",
      JSON.stringify(
        cartItems,
        null,
        2
      )
    );

    // ==========================================
    // VALIDATE AMOUNT
    // ==========================================

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

      console.error(
        "FAST RR AMOUNT MISMATCH",
        {
          webhookAmount:
            totalAmount,

          orderAmount:
            order.totalAmount,
        }
      );

      return res.status(400).json({
        success: false,

        message:
          "Payment amount does not match order amount",
      });
    }

    // ==========================================
    // PAYMENT TYPE
    // ==========================================

    const cod =
      isCODPayment(
        paymentType
      );

    // ==========================================
    // SUCCESS WEBHOOK
    // ==========================================

    if (
      status ===
      "SUCCESS"
    ) {

      console.log(
        "FastRR SUCCESS webhook received"
      );

      // ========================================
      // FETCH FASTRR CHECKOUT ORDER DETAILS
      // ========================================
      //
      // IMPORTANT:
      // We are fetching the actual details entered
      // on FastRR Checkout.
      //
      // For now we only log the response.
      // We will map the address after confirming
      // the actual response structure.
      // ========================================

      let checkoutOrderDetails =
        null;

      try {

        checkoutOrderDetails =
          await fetchFastRROrderDetails(
            webhookOrderId
          );

        console.log(
          "========== FASTRR CHECKOUT ORDER DETAILS =========="
        );

        console.log(
          JSON.stringify(
            checkoutOrderDetails,
            null,
            2
          )
        );

        console.log(
          "===================================================="
        );

      } catch (
        checkoutDetailsError
      ) {

        console.error(
          "Unable to fetch FastRR checkout order details:",
          checkoutDetailsError.response?.data ||
          checkoutDetailsError.message
        );

        // Do NOT stop the payment flow here.
        // Payment and Shiprocket processing can continue
        // using the existing order address for now.
      }

      // ========================================
      // UPDATE PAYMENT
      // ========================================

      if (!alreadyPaid) {

        payment.status =
          cod
            ? "PENDING"
            : "PAID";

        payment.failureReason =
          null;

        if (!cod) {

          payment.paidAt =
            payment.paidAt ||
            new Date();
        }
      }

      payment.gatewayResponse =
        webhookData;

      await payment.save();

      console.log(
        "Payment Status:",
        payment.status
      );

      // ========================================
      // UPDATE ORDER
      // ========================================

      order.paymentMethod =
        cod
          ? "COD"
          : "ONLINE";

      order.paymentStatus =
        cod
          ? "PENDING"
          : "PAID";

      order.orderStatus =
        "CONFIRMED";

      await order.save();

      console.log(
        "Order Payment Status:",
        order.paymentStatus
      );

      console.log(
        "Order Status:",
        order.orderStatus
      );

      // ========================================
      // CREATE SHIPROCKET ORDER
      // ========================================

      if (
        !shiprocketAlreadyCreated
      ) {

        try {

          const shiprocketPaymentMethod =
            cod
              ? "COD"
              : "Prepaid";

          const shiprocketOrderData =
            buildShiprocketOrderPayload(
              order,
              cod
                ? "COD"
                : "ONLINE"
            );

          console.log(
            "========================================"
          );

          console.log(
            "CREATING SHIPROCKET ORDER FROM FASTRR"
          );

          console.log(
            "Our Order ID:",
            order.orderId
          );

          console.log(
            "Payment Type:",
            paymentType
          );

          console.log(
            "Shiprocket Payment Method:",
            shiprocketPaymentMethod
          );

          console.log(
            "Shiprocket Payload:",
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
            "Shiprocket Response:",
            JSON.stringify(
              shiprocketResponse,
              null,
              2
            )
          );

          // ========================================
          // SAVE SHIPROCKET IDS
          // ========================================

          order.shiprocket.orderId =
            shiprocketResponse
              ?.order_id ||
            null;

          order.shiprocket.shipmentId =
            shiprocketResponse
              ?.shipment_id ||
            null;

          order.shiprocket.status =
            "ORDER_CREATED";

          await order.save();

          console.log(
            "Shiprocket order created successfully"
          );

        } catch (
          shiprocketError
        ) {

          console.error(
            "Shiprocket order creation failed:",
            shiprocketError
              .response
              ?.data ||
            shiprocketError.message
          );

          return res.status(500).json({
            success: false,

            message:
              "Payment successful but Shiprocket order creation failed",

            orderId:
              order.orderId,

            paymentId:
              payment._id,

            paymentStatus:
              payment.status,

            orderStatus:
              order.orderStatus,

            error:
              shiprocketError
                .response
                ?.data ||
              shiprocketError.message,
          });
        }

      } else {

        console.log(
          "Shiprocket order already exists. Skipping duplicate creation."
        );
      }

      // ========================================
      // WHATSAPP
      // ========================================

      whatsappService
        .sendOrderStatusNotification(
          order,
          "CONFIRMED"
        )
        .catch(
          (waErr) =>
            console.error(
              "WhatsApp payment confirmation error:",
              waErr.message
            )
        );

      // ========================================
      // SUCCESS RESPONSE
      // ========================================

      return res.status(200).json({
        success: true,

        message:
          "FastRR order webhook processed successfully",

        orderId:
          order.orderId,

        paymentId:
          payment._id,

        paymentStatus:
          order.paymentStatus,

        orderStatus:
          order.orderStatus,

        shiprocket: {
          orderId:
            order.shiprocket
              ?.orderId,

          shipmentId:
            order.shiprocket
              ?.shipmentId,

          status:
            order.shiprocket
              ?.status,
        },
      });
    }

    // ==========================================
    // FAILED WEBHOOK
    // ==========================================

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

      console.log(
        "FastRR FAILURE webhook received"
      );

      payment.status =
        "FAILED";

      payment.failureReason =
        getFirstValue(
          webhookData
            ?.message,

          webhookData
            ?.error,

          webhookData
            ?.failure_reason,

          "FastRR checkout/payment failed"
        );

      payment.gatewayResponse =
        webhookData;

      await payment.save();

      order.paymentStatus =
        "FAILED";

      await order.save();

      return res.status(200).json({
        success: true,

        message:
          "FastRR failure webhook processed",

        orderId:
          order.orderId,

        paymentStatus:
          order.paymentStatus,
      });
    }

    // ==========================================
    // OTHER STATUS
    // ==========================================

    payment.gatewayResponse =
      webhookData;

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
// 5. GET PAYMENT
//
// GET /api/payment/:paymentId
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
          "orderId totalAmount paymentStatus orderStatus"
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
// EXPORTS
// =====================================================

module.exports = {
  createPayment,
  paymentSuccess,
  paymentFailed,
  fastrrWebhook,
  getPayment,
};