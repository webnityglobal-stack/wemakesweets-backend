// controllers/paymentController.js

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
  const value =
    String(paymentType || "")
      .trim()
      .toUpperCase();

  return (
    value === "COD" ||
    value === "CASH_ON_DELIVERY" ||
    value === "CASH ON DELIVERY"
  );
};

// =====================================================
// HELPER: NORMALIZE PHONE
// =====================================================

const normalizePhone = (phone) => {
  if (!phone) {
    throw new Error(
      "Customer phone number is missing"
    );
  }

  const digits =
    String(phone).replace(
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
// UPDATE ORDER ADDRESS FROM FASTRR
// =====================================================

const updateOrderAddressFromFastRR = async (
  order,
  checkoutOrderDetails
) => {
  const checkoutAddress =
    checkoutOrderDetails
      ?.result
      ?.shipping_address;

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
      "",

    phone:
      checkoutAddress.phone ||
      order.shippingAddress?.phone ||
      "",

    email:
      checkoutAddress.email ||
      order.shippingAddress?.email ||
      "",

    address:
      checkoutAddress.line1 ||
      order.shippingAddress?.address ||
      "",

    address2:
      checkoutAddress.line2 ||
      order.shippingAddress?.address2 ||
      "",

    city:
      checkoutAddress.city ||
      order.shippingAddress?.city ||
      "",

    state:
      checkoutAddress.state ||
      order.shippingAddress?.state ||
      "",

    pincode:
      checkoutAddress.pincode ||
      order.shippingAddress?.pincode ||
      "",

    country:
      checkoutAddress.country ||
      order.shippingAddress?.country ||
      "India",
  };

  order.markModified(
    "shippingAddress"
  );

  await order.save();

  return true;
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

  const phone =
    normalizePhone(
      address.phone
    );

  const shiprocketItems =
    order.items.map(
      (item) => ({
        name:
          item.name,

        sku:
          item.sku ||
          item.product?.toString(),

        units:
          Number(item.quantity),

        selling_price:
          Number(item.price),
      })
    );

  const isCOD =
    String(paymentMethod)
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

    // BILLING

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

    // SHIPPING

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

    // ITEMS

    order_items:
      shiprocketItems,

    // PAYMENT

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

    // PACKAGE

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
// CREATE ONLINE PAYMENT / FASTRR CHECKOUT
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

    // ========================================
    // FASTRR ONLY FOR ONLINE
    // ========================================

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

    // ========================================
    // FASTRR ITEMS
    // ========================================

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

    // ========================================
    // FASTRR PAYLOAD
    // ========================================

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
      "CREATING FASTRR CHECKOUT",
      JSON.stringify(
        payload,
        null,
        2
      )
    );

    const fastrrResponse =
      await createCheckout(
        payload
      );

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

// =====================================================
// PAYMENT FAILED
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

    // ========================================
    // COD PAYMENT SHOULD NOT BE MARKED FAILED
    // THROUGH FASTRR
    // ========================================

    if (
      payment.paymentMethod ===
      "COD"
    ) {
      return res.status(400).json({
        success: false,
        message:
          "COD order does not use online payment",
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

    // ========================================
    // RAW BODY
    // ========================================

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

    // ========================================
    // HMAC
    // ========================================

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

    // ========================================
    // PARSE WEBHOOK
    // ========================================

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

    // ========================================
    // EXTRACT DATA
    // ========================================

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

    // ========================================
    // VALIDATE ORDER ID
    // ========================================

    if (!webhookOrderId) {
      return res.status(400).json({
        success: false,
        message:
          "order_id is missing from webhook",
      });
    }

    // ========================================
    // FIND PAYMENT
    // ========================================

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

    // ========================================
    // FIND ORDER
    // ========================================

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

    // ========================================
    // CRITICAL PROTECTION
    //
    // FASTRR MUST NEVER CHANGE COD ORDER
    // TO ONLINE
    // ========================================

    if (
      order.paymentMethod ===
      "COD" ||
      payment.paymentMethod ===
      "COD"
    ) {
      console.log(
        "FastRR webhook received for COD order."
      );

      console.log(
        "COD order will NOT be converted to ONLINE."
      );

      return res.status(200).json({
        success: true,

        message:
          "COD order ignored by FastRR webhook",

        orderId:
          order.orderId,

        paymentMethod:
          order.paymentMethod,

        paymentStatus:
          order.paymentStatus,
      });
    }

    // ========================================
    // ONLINE ORDER PROTECTION
    // ========================================

    if (
      order.paymentMethod !==
      "ONLINE"
    ) {
      return res.status(400).json({
        success: false,

        message:
          "Invalid payment method for FastRR webhook",
      });
    }

    // ========================================
    // VALIDATE AMOUNT
    // ========================================

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

    if (
      status ===
      "SUCCESS"
    ) {
      console.log(
        "========================================"
      );

      console.log(
        "FASTRR SUCCESS WEBHOOK"
      );

      console.log(
        "Our Order:",
        order.orderId
      );

      console.log(
        "Gateway Order:",
        payment.gatewayOrderId
      );

      console.log(
        "========================================"
      );

      // ======================================
      // FETCH FASTRR DETAILS
      // ======================================

      let checkoutOrderDetails =
        null;

      try {
        const fastRRGatewayOrderId =
          payment.gatewayOrderId;

        if (
          !fastRRGatewayOrderId
        ) {
          throw new Error(
            "FastRR gateway order ID is missing"
          );
        }

        checkoutOrderDetails =
          await fetchFastRROrderDetails(
            String(
              fastRRGatewayOrderId
            )
          );

        await updateOrderAddressFromFastRR(
          order,
          checkoutOrderDetails
        );

      } catch (
        checkoutDetailsError
      ) {
        console.error(
          "Unable to fetch FastRR checkout details:",
          checkoutDetailsError
            ?.response
            ?.data ||
          checkoutDetailsError.message
        );
      }

      // ======================================
      // ONLINE PAYMENT
      // ======================================

      payment.status =
        "PAID";

      payment.failureReason =
        null;

      payment.paidAt =
        payment.paidAt ||
        new Date();

      payment.gatewayResponse =
        webhookData;

      await payment.save();

      // ======================================
      // ORDER
      // ======================================

      // IMPORTANT:
      // Keep ONLINE.
      // Never set COD here.

      order.paymentMethod =
        "ONLINE";

      order.paymentStatus =
        "PAID";

      order.orderStatus =
        "CONFIRMED";

      await order.save();

      // ======================================
      // CREATE SHIPROCKET
      // ======================================

      const shiprocketAlreadyCreated =
        !!order.shiprocket?.orderId;

      if (
        !shiprocketAlreadyCreated
      ) {
        try {
          const shiprocketOrderData =
            buildShiprocketOrderPayload(
              order,
              "ONLINE"
            );

          console.log(
            "========================================"
          );

          console.log(
            "CREATING SHIPROCKET PREPAID ORDER"
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

          order.shiprocket.createdAt =
            order.shiprocket.createdAt ||
            new Date();

          order.shiprocket.updatedAt =
            new Date();

          await order.save();

        } catch (
          shiprocketError
        ) {
          console.error(
            "Shiprocket order creation failed:",
            shiprocketError
              ?.response
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
                ?.response
                ?.data ||
              shiprocketError.message,
          });
        }
      }

      // ======================================
      // WHATSAPP
      // ======================================

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

      // ======================================
      // RESPONSE
      // ======================================

      return res.status(200).json({
        success: true,

        message:
          "FastRR order webhook processed successfully",

        orderId:
          order.orderId,

        paymentId:
          payment._id,

        paymentMethod:
          order.paymentMethod,

        paymentStatus:
          order.paymentStatus,

        orderStatus:
          order.orderStatus,

        shippingAddress:
          order.shippingAddress,

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

    // ========================================
    // FAILED WEBHOOK
    // ========================================

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

    // ========================================
    // OTHER STATUS
    // ========================================

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
          "orderId totalAmount paymentStatus orderStatus paymentMethod"
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
// GET FASTRR CHECKOUT DETAILS
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

    // ========================================
    // COD DOES NOT HAVE FASTRR DETAILS
    // ========================================

    if (
      payment.paymentMethod ===
      "COD"
    ) {
      return res.status(400).json({
        success: false,

        message:
          "COD order does not have FastRR checkout details",
      });
    }

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

    return res.status(200).json({
      success: true,

      message:
        "Checkout details fetched successfully",

      orderId:
        order.orderId,

      gatewayOrderId:
        gatewayOrderId,

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
  paymentFailed,
  fastrrWebhook,
  getPayment,
  getCheckoutAddress,
};