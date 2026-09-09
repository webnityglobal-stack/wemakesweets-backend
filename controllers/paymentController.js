const crypto = require("crypto");

const Order = require("../models/order");
const Payment = require("../models/payment");

const { createCheckout } = require("../services/fastrrService");
const { verifyHmac } = require("../utils/fastrrHmac");

// =====================================================
// HELPER: GET USER ID
// =====================================================

const getUserId = (req) => {
  return req.userId || req.user?.id || req.user?._id;
};

// =====================================================
// HELPER: EXTRACT VALUE FROM OBJECT
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
// CREATE ONLINE PAYMENT / FASTRR CHECKOUT
// =====================================================

const createPayment = async (req, res) => {
  try {
    const userId = getUserId(req);

    const { orderId } = req.body;

    // -------------------------------------------------
    // VALIDATION
    // -------------------------------------------------

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

    // -------------------------------------------------
    // FIND ORDER
    // -------------------------------------------------

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

    // -------------------------------------------------
    // CHECK ORDER AMOUNT
    // -------------------------------------------------

    if (
      order.totalAmount === undefined ||
      order.totalAmount === null ||
      Number(order.totalAmount) <= 0
    ) {
      return res.status(400).json({
        success: false,
        message: "Invalid order amount",
      });
    }

    const amount = Number(order.totalAmount);

    // -------------------------------------------------
    // FIND EXISTING PAYMENT
    // -------------------------------------------------

    let payment = await Payment.findOne({
      order: order._id,
      user: userId,
    });

    // -------------------------------------------------
    // CREATE PAYMENT DOCUMENT
    // -------------------------------------------------

    if (!payment) {
      payment = new Payment({
        order: order._id,
        orderId: order.orderId,
        user: userId,

        amount,
        currency: "INR",

        paymentMethod: "ONLINE",
        gateway: "FASTRR",

        status: "PROCESSING",
      });
    } else {
      payment.amount = amount;
      payment.paymentMethod = "ONLINE";
      payment.gateway = "FASTRR";
      payment.status = "PROCESSING";
      payment.failureReason = null;
    }

    await payment.save();

    // -------------------------------------------------
    // FASTRR ITEMS
    // -------------------------------------------------

    const items = order.items.map((item) => {

  if (!item.variantId) {
    throw new Error(
      `Variant ID missing for order item: ${item.name}`
    );
  }

  return {
    variant_id: String(item.variantId),
    quantity: Number(item.quantity),
  };

});

    // -------------------------------------------------
    // FASTRR CHECKOUT PAYLOAD
    // -------------------------------------------------

    const payload = {
      cart_data: {
        items,
      },

      redirect_url:
        `${process.env.FRONTEND_URL}/payment/success` +
        `?orderId=${encodeURIComponent(order.orderId)}`,
      timestamp: new Date().toISOString(),
    };

    console.log(
      "========================================"
    );

    console.log(
      "CREATING FASTRR PAYMENT"
    );

    console.log(
      "Order ID:",
      order.orderId
    );

    console.log(
      "Amount:",
      amount
    );

    console.log(
      "Payload:",
      JSON.stringify(payload, null, 2)
    );

    console.log(
      "========================================"
    );

    // -------------------------------------------------
    // CALL FASTRR
    // -------------------------------------------------

    const fastrrResponse =
      await createCheckout(payload);

    console.log(
      "FASTRR RESPONSE:",
      JSON.stringify(
        fastrrResponse,
        null,
        2
      )
    );

    // -------------------------------------------------
    // EXTRACT FASTRR DATA
    // -------------------------------------------------

    const responseData =
      fastrrResponse?.data ||
      fastrrResponse;

    const checkoutToken = getFirstValue(
      responseData?.token,
      responseData?.access_token,
      responseData?.checkout_token,

      responseData?.data?.token,
      responseData?.data?.access_token,
      responseData?.data?.checkout_token
    );

    const gatewayOrderId = getFirstValue(
      responseData?.order_id,
      responseData?.gateway_order_id,

      responseData?.data?.order_id,
      responseData?.data?.gateway_order_id
    );

    const paymentId = getFirstValue(
      responseData?.payment_id,

      responseData?.data?.payment_id
    );

    const transactionId = getFirstValue(
      responseData?.transaction_id,

      responseData?.data?.transaction_id
    );

    // -------------------------------------------------
    // SAVE FASTRR RESPONSE
    // -------------------------------------------------

    payment.gatewayOrderId =
      gatewayOrderId;

    payment.paymentId =
      paymentId;

    payment.transactionId =
      transactionId;

    payment.gatewayResponse =
      fastrrResponse;

    await payment.save();

    // -------------------------------------------------
    // RESPONSE
    // -------------------------------------------------

    return res.status(200).json({
      success: true,

      message:
        "FASTRR checkout created successfully",

      paymentId: payment._id,

      orderId: order.orderId,

      amount: payment.amount,

      currency: payment.currency,

      status: payment.status,

      checkoutToken,

      gatewayOrderId:
        payment.gatewayOrderId,

      transactionId:
        payment.transactionId,

      fastrrResponse,
    });

  } catch (error) {
    console.error(
      "CREATE PAYMENT ERROR:",
      error.response?.data ||
      error.message
    );

    return res.status(
      error.response?.status || 500
    ).json({
      success: false,

      message:
        "Unable to create payment",

      error:
        error.response?.data ||
        error.message,
    });
  }
};

// =====================================================
// PAYMENT SUCCESS
// =====================================================

const paymentSuccess = async (req, res) => {
  try {
    const userId = getUserId(req);

    const {
      paymentId,
      transactionId,
      gatewayOrderId,
      orderId,
    } = req.body;

    if (!userId) {
      return res.status(401).json({
        success: false,
        message: "Unauthorized",
      });
    }

    // -------------------------------------------------
    // FIND PAYMENT
    // -------------------------------------------------

    let payment = null;

    if (paymentId) {
      payment = await Payment.findOne({
        _id: paymentId,
        user: userId,
      });
    }

    if (!payment && gatewayOrderId) {
      payment = await Payment.findOne({
        gatewayOrderId,
        user: userId,
      });
    }

    if (!payment && orderId) {
      payment = await Payment.findOne({
        orderId,
        user: userId,
      });
    }

    if (!payment) {
      return res.status(404).json({
        success: false,
        message: "Payment not found",
      });
    }

    // -------------------------------------------------
    // UPDATE PAYMENT
    // -------------------------------------------------

    payment.status = "PAID";

    if (transactionId) {
      payment.transactionId =
        transactionId;
    }

    if (gatewayOrderId) {
      payment.gatewayOrderId =
        gatewayOrderId;
    }

    payment.failureReason = null;
    payment.paidAt = new Date();

    await payment.save();

    // -------------------------------------------------
    // UPDATE ORDER
    // -------------------------------------------------

    await Order.findByIdAndUpdate(
      payment.order,
      {
        paymentStatus: "PAID",
        orderStatus: "CONFIRMED",
      }
    );

    return res.status(200).json({
      success: true,

      message:
        "Payment marked as successful",

      payment: {
        id: payment._id,
        orderId: payment.orderId,
        amount: payment.amount,
        status: payment.status,
        paymentId: payment.paymentId,
        transactionId:
          payment.transactionId,
        gatewayOrderId:
          payment.gatewayOrderId,
        paidAt: payment.paidAt,
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
        "Unable to update payment success",
      error: error.message,
    });
  }
};

// =====================================================
// PAYMENT FAILED
// =====================================================

const paymentFailed = async (req, res) => {
  try {
    const userId = getUserId(req);

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
        message: "Unauthorized",
      });
    }

    // -------------------------------------------------
    // FIND PAYMENT
    // -------------------------------------------------

    let payment = null;

    if (paymentId) {
      payment = await Payment.findOne({
        _id: paymentId,
        user: userId,
      });
    }

    if (!payment && gatewayOrderId) {
      payment = await Payment.findOne({
        gatewayOrderId,
        user: userId,
      });
    }

    if (!payment && orderId) {
      payment = await Payment.findOne({
        orderId,
        user: userId,
      });
    }

    if (!payment) {
      return res.status(404).json({
        success: false,
        message: "Payment not found",
      });
    }

    // -------------------------------------------------
    // UPDATE PAYMENT
    // -------------------------------------------------

    payment.status = "FAILED";

    payment.failureReason =
      failureReason ||
      reason ||
      "Payment failed";

    await payment.save();

    // -------------------------------------------------
    // UPDATE ORDER
    // -------------------------------------------------

    await Order.findByIdAndUpdate(
      payment.order,
      {
        paymentStatus: "FAILED",
      }
    );

    return res.status(200).json({
      success: true,

      message:
        "Payment marked as failed",

      payment: {
        id: payment._id,
        orderId: payment.orderId,
        status: payment.status,
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

      error: error.message,
    });
  }
};

// =====================================================
// FASTRR WEBHOOK
// =====================================================

const fastrrWebhook = async (req, res) => {
  try {
    console.log(
      "========================================"
    );

    console.log(
      "FASTRR WEBHOOK RECEIVED"
    );

    // -------------------------------------------------
    // API KEY CHECK
    // -------------------------------------------------

    const receivedApiKey =
      req.headers["x-api-key"];

    if (
      receivedApiKey !==
      process.env.FASTRR_API_KEY
    ) {
      console.error(
        "Invalid FASTRR API Key"
      );

      return res.status(401).json({
        success: false,
        message: "Invalid API key",
      });
    }

    // -------------------------------------------------
    // RAW BODY
    // -------------------------------------------------

    let rawBody;

    if (Buffer.isBuffer(req.body)) {
      rawBody =
        req.body.toString("utf8");
    } else if (typeof req.body === "string") {
      rawBody = req.body;
    } else {
      rawBody =
        JSON.stringify(req.body);
    }

    // -------------------------------------------------
    // HMAC
    // -------------------------------------------------

    const receivedHmac =
      req.headers[
        "x-api-hmac-sha256"
      ];

    if (!receivedHmac) {
      console.error(
        "Missing FASTRR HMAC"
      );

      return res.status(401).json({
        success: false,
        message: "Missing HMAC",
      });
    }

    const validHmac =
      verifyHmac(
        rawBody,
        receivedHmac
      );

    if (!validHmac) {
      console.error(
        "Invalid FASTRR HMAC"
      );

      return res.status(401).json({
        success: false,
        message: "Invalid HMAC",
      });
    }

    // -------------------------------------------------
    // PARSE BODY
    // -------------------------------------------------

    let webhookData;

    try {
      webhookData =
        JSON.parse(rawBody);
    } catch (parseError) {
      console.error(
        "Invalid webhook JSON"
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

    // -------------------------------------------------
    // EXTRACT STATUS
    // -------------------------------------------------

    const data =
      webhookData?.data ||
      webhookData;

    const statusRaw =
      getFirstValue(
        data?.status,
        data?.payment_status,
        data?.paymentStatus,

        webhookData?.status,
        webhookData?.payment_status
      );

    const status =
      String(
        statusRaw || ""
      ).toUpperCase();

    // -------------------------------------------------
    // EXTRACT IDS
    // -------------------------------------------------

    const gatewayOrderId =
      getFirstValue(
        data?.order_id,
        data?.gateway_order_id,

        webhookData?.order_id,
        webhookData?.gateway_order_id
      );

    const paymentId =
      getFirstValue(
        data?.payment_id,
        webhookData?.payment_id
      );

    const transactionId =
      getFirstValue(
        data?.transaction_id,
        webhookData?.transaction_id
      );

    const orderId =
      getFirstValue(
        data?.custom_attributes?.order_id,
        data?.orderId,

        webhookData?.custom_attributes?.order_id,
        webhookData?.orderId
      );

    // -------------------------------------------------
    // FIND PAYMENT
    // -------------------------------------------------

    let payment = null;

    if (gatewayOrderId) {
      payment =
        await Payment.findOne({
          gatewayOrderId:
            String(gatewayOrderId),
        });
    }

    if (!payment && paymentId) {
      payment =
        await Payment.findOne({
          paymentId:
            String(paymentId),
        });
    }

    if (!payment && orderId) {
      payment =
        await Payment.findOne({
          orderId:
            String(orderId),
        });
    }

    if (!payment) {
      console.error(
        "Payment not found for webhook"
      );

      return res.status(404).json({
        success: false,
        message:
          "Payment not found",
      });
    }

    // -------------------------------------------------
    // SAVE GATEWAY DATA
    // -------------------------------------------------

    if (gatewayOrderId) {
      payment.gatewayOrderId =
        String(gatewayOrderId);
    }

    if (paymentId) {
      payment.paymentId =
        String(paymentId);
    }

    if (transactionId) {
      payment.transactionId =
        String(transactionId);
    }

    payment.gatewayResponse =
      webhookData;

    // -------------------------------------------------
    // SUCCESS
    // -------------------------------------------------

    const successStatuses = [
      "SUCCESS",
      "SUCCESSFUL",
      "PAID",
      "COMPLETED",
    ];

    if (
      successStatuses.includes(status)
    ) {
      payment.status = "PAID";

      payment.failureReason = null;

      payment.paidAt =
        payment.paidAt ||
        new Date();

      await payment.save();

      await Order.findByIdAndUpdate(
        payment.order,
        {
          paymentStatus: "PAID",
          orderStatus: "CONFIRMED",
        }
      );

      console.log(
        "Payment successfully marked PAID"
      );

      return res.status(200).json({
        success: true,
        message:
          "Webhook processed successfully",
      });
    }

    // -------------------------------------------------
    // FAILED
    // -------------------------------------------------

    const failedStatuses = [
      "FAILED",
      "FAILURE",
      "CANCELLED",
      "CANCELED",
    ];

    if (
      failedStatuses.includes(status)
    ) {
      payment.status = "FAILED";

      payment.failureReason =
        getFirstValue(
          data?.message,
          data?.error,
          data?.failure_reason,
          webhookData?.message,
          "Payment failed"
        );

      await payment.save();

      await Order.findByIdAndUpdate(
        payment.order,
        {
          paymentStatus: "FAILED",
        }
      );

      console.log(
        "Payment marked FAILED"
      );

      return res.status(200).json({
        success: true,
        message:
          "Webhook processed successfully",
      });
    }

    // -------------------------------------------------
    // PROCESSING / PENDING
    // -------------------------------------------------

    payment.status =
      status === "PROCESSING"
        ? "PROCESSING"
        : "PENDING";

    await payment.save();

    console.log(
      "Payment status:",
      payment.status
    );

    return res.status(200).json({
      success: true,
      message:
        "Webhook received successfully",
      status: payment.status,
    });

  } catch (error) {
    console.error(
      "FASTRR WEBHOOK ERROR:",
      error
    );

    return res.status(500).json({
      success: false,

      message:
        "Unable to process FASTRR webhook",

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

    // -------------------------------------------------
    // FIND PAYMENT
    // -------------------------------------------------

    const payment =
      await Payment.findOne({
        _id: paymentId,
        user: userId,
      })
        .populate(
          "order",
          "orderId totalAmount paymentStatus orderStatus"
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

      error: error.message,
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