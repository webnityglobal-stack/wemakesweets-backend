// controllers/paymentController.js

const Payment = require("../models/payment");
const Order = require("../models/order");

const {
  createShiprocketOrder,
} = require("../services/shiprocketService");

// =====================================================
// CREATE PAYMENT
// =====================================================

const createPayment = async (req, res) => {
  try {
    const {
      orderId,
    } = req.body;

    // =================================================
    // AUTHENTICATION
    // =================================================

    if (!req.user || !req.userId) {
      return res.status(401).json({
        success: false,
        message: "Authentication required",
      });
    }

    // =================================================
    // VALIDATE ORDER ID
    // =================================================

    if (!orderId) {
      return res.status(400).json({
        success: false,
        message: "Order ID is required",
      });
    }

    // =================================================
    // FIND ORDER
    // =================================================

    const order = await Order.findOne({
      orderId,
      user: req.userId,
    });

    if (!order) {
      return res.status(404).json({
        success: false,
        message: "Order not found",
      });
    }

    // =================================================
    // PAYMENT METHOD CHECK
    // =================================================

    if (order.paymentMethod !== "ONLINE") {
      return res.status(400).json({
        success: false,
        message:
          "Online payment is not required for this order",
      });
    }

    // =================================================
    // CHECK EXISTING PAYMENT
    // =================================================

    let payment = await Payment.findOne({
      order: order._id,
    });

    // =================================================
    // IF ALREADY PAID
    // =================================================

    if (payment && payment.status === "PAID") {
      return res.status(400).json({
        success: false,
        message: "Order is already paid",
      });
    }

    // =================================================
    // CREATE PAYMENT RECORD
    // =================================================

    if (!payment) {
      payment = await Payment.create({
        order: order._id,

        orderId: order.orderId,

        user: req.userId,

        amount: order.totalAmount,

        currency: "INR",

        paymentMethod: "ONLINE",

        gateway: "FASTRR",

        status: "PENDING",
      });
    }

    // =================================================
    // MARK PROCESSING
    // =================================================

    payment.status = "PROCESSING";

    await payment.save();

    // =================================================
    // FASTRR PAYMENT
    // =================================================
    //
    // IMPORTANT:
    //
    // Put the actual FASTRR API call here.
    //
    // Do NOT put FASTRR secret/API key in frontend.
    //
    // Example:
    //
    // const fastrrResponse =
    //   await createFastrrPayment({...});
    //
    // =================================================

    /*
    const fastrrResponse = await createFastrrPayment({
      amount: payment.amount,
      orderId: order.orderId,
      customerName: order.shippingAddress.name,
      customerEmail: order.shippingAddress.email,
      customerPhone: order.shippingAddress.phone,
    });

    payment.gatewayOrderId =
      fastrrResponse.order_id;

    payment.paymentId =
      fastrrResponse.payment_id;

    await payment.save();
    */

    // =================================================
    // TEMPORARY RESPONSE
    // =================================================
    //
    // Until actual FASTRR API is connected, return
    // payment information.
    //
    // =================================================

    return res.status(200).json({
      success: true,

      message:
        "Payment initialized",

      payment: {
        id: payment._id,

        orderId: payment.orderId,

        amount: payment.amount,

        currency: payment.currency,

        gateway: payment.gateway,

        status: payment.status,

        gatewayOrderId:
          payment.gatewayOrderId,

        paymentId:
          payment.paymentId,
      },

      // This will be replaced by the
      // actual FASTRR checkout/session data.
      checkout: null,
    });

  } catch (error) {

    console.error(
      "Create Payment Error:",
      error.response?.data ||
      error.message ||
      error
    );

    return res.status(500).json({
      success: false,

      message:
        "Unable to initialize payment",

      error:
        error.response?.data ||
        error.message,
    });
  }
};


// =====================================================
// PAYMENT SUCCESS
// =====================================================
//
// This function should be called after FASTRR confirms
// that the payment was successfully completed.
//
// =====================================================

const paymentSuccess = async (req, res) => {
  try {

    const {
      paymentId,
      transactionId,
      gatewayOrderId,
    } = req.body;


    // =================================================
    // VALIDATE
    // =================================================

    if (!paymentId) {
      return res.status(400).json({
        success: false,
        message: "Payment ID is required",
      });
    }


    // =================================================
    // FIND PAYMENT
    // =================================================

    const payment =
      await Payment.findOne({
        _id: paymentId,
      });


    if (!payment) {
      return res.status(404).json({
        success: false,
        message: "Payment not found",
      });
    }


    // =================================================
    // ALREADY PAID
    // =================================================

    if (payment.status === "PAID") {
      return res.status(200).json({
        success: true,
        message: "Payment already processed",
        payment,
      });
    }


    // =================================================
    // UPDATE PAYMENT
    // =================================================

    payment.status = "PAID";

    payment.paymentId =
      paymentId;

    payment.transactionId =
      transactionId || null;

    payment.gatewayOrderId =
      gatewayOrderId ||
      payment.gatewayOrderId ||
      null;

    payment.paidAt =
      new Date();


    await payment.save();


    // =================================================
    // FIND ORDER
    // =================================================

    const order =
      await Order.findById(
        payment.order
      );


    if (!order) {

      return res.status(404).json({
        success: false,
        message:
          "Order associated with payment not found",
      });

    }


    // =================================================
    // UPDATE ORDER PAYMENT STATUS
    // =================================================

    order.paymentStatus =
      "PAID";


    order.orderStatus =
      "CONFIRMED";


    await order.save();


    // =================================================
    // CREATE SHIPROCKET ORDER
    // =================================================

    try {

      // -----------------------------------------------
      // PREPARE ITEMS
      // -----------------------------------------------

      const shiprocketItems =
        order.items.map(
          (item) => ({

            name:
              item.name,

            sku:
              item.sku ||
              item.product.toString(),

            units:
              item.quantity,

            selling_price:
              item.price,

          })
        );


      // -----------------------------------------------
      // SHIPROCKET PAYLOAD
      // -----------------------------------------------

      const shiprocketOrderData = {

        order_id:
          order.orderId,

        order_date:
          order.createdAt.toISOString(),

        pickup_location:
          process.env
            .SHIPROCKET_PICKUP_LOCATION,

        comment:
          "We Make Sweets Order",


        // ============================================
        // BILLING
        // ============================================

        billing_customer_name:
          order.shippingAddress.name,

        billing_last_name:
          "",

        billing_address:
          order.shippingAddress.address,

        billing_address_2:
          "",

        billing_city:
          order.shippingAddress.city,

        billing_pincode:
          order.shippingAddress.pincode,

        billing_state:
          order.shippingAddress.state,

        billing_country:
          order.shippingAddress.country ||
          "India",

        billing_email:
          order.shippingAddress.email ||
          "",

        billing_phone:
          order.shippingAddress.phone,


        // ============================================
        // SHIPPING
        // ============================================

        shipping_is_billing:
          true,

        shipping_customer_name:
          order.shippingAddress.name,

        shipping_last_name:
          "",

        shipping_address:
          order.shippingAddress.address,

        shipping_address_2:
          "",

        shipping_city:
          order.shippingAddress.city,

        shipping_pincode:
          order.shippingAddress.pincode,

        shipping_state:
          order.shippingAddress.state,

        shipping_country:
          order.shippingAddress.country ||
          "India",

        shipping_email:
          order.shippingAddress.email ||
          "",

        shipping_phone:
          order.shippingAddress.phone,


        // ============================================
        // PRODUCTS
        // ============================================

        order_items:
          shiprocketItems,


        // ============================================
        // PAYMENT
        // ============================================

        payment_method:
          "Prepaid",


        // ============================================
        // CHARGES
        // ============================================

        shipping_charges:
          0,

        giftwrap_charges:
          0,

        transaction_charges:
          0,

        total_discount:
          0,

        sub_total:
          order.totalAmount,


        // ============================================
        // PACKAGE
        // ============================================

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


      // -----------------------------------------------
      // CREATE SHIPROCKET ORDER
      // -----------------------------------------------

      const shiprocketResponse =
        await createShiprocketOrder(
          shiprocketOrderData
        );


      console.log(
        "Shiprocket Order Created:",
        shiprocketResponse
      );


      // -----------------------------------------------
      // SAVE SHIPROCKET DETAILS
      // -----------------------------------------------

      order.shiprocket.orderId =
        shiprocketResponse.order_id ||
        null;

      order.shiprocket.shipmentId =
        shiprocketResponse.shipment_id ||
        null;

      order.shiprocket.status =
        "ORDER_CREATED";


      await order.save();


    } catch (shiprocketError) {

      console.error(
        "Shiprocket Order Creation Failed:",
        shiprocketError.response?.data ||
        shiprocketError.message
      );


      // IMPORTANT:
      //
      // Payment is already successful.
      //
      // Therefore DON'T mark payment failed.
      //
      // Order remains PAID/CONFIRMED.
      //
      // Shiprocket can be retried separately.
      //

      return res.status(200).json({

        success: true,

        message:
          "Payment successful but Shiprocket order creation failed",

        paymentStatus:
          payment.status,

        orderStatus:
          order.orderStatus,

        orderId:
          order.orderId,

        shiprocketCreated:
          false,

        shiprocketError:
          shiprocketError.response?.data ||
          shiprocketError.message,

      });

    }


    // =================================================
    // FINAL RESPONSE
    // =================================================

    return res.status(200).json({

      success: true,

      message:
        "Payment successful and order confirmed",

      payment: {

        id:
          payment._id,

        status:
          payment.status,

        amount:
          payment.amount,

        paymentId:
          payment.paymentId,

        transactionId:
          payment.transactionId,

        gatewayOrderId:
          payment.gatewayOrderId,

        paidAt:
          payment.paidAt,

      },

      order: {

        id:
          order._id,

        orderId:
          order.orderId,

        paymentStatus:
          order.paymentStatus,

        orderStatus:
          order.orderStatus,

        shiprocket:
          order.shiprocket,

      },

    });

  } catch (error) {

    console.error(
      "Payment Success Error:",
      error
    );

    return res.status(500).json({

      success: false,

      message:
        "Unable to process payment",

      error:
        error.message,

    });

  }
};


// =====================================================
// PAYMENT FAILED
// =====================================================

const paymentFailed = async (req, res) => {

  try {

    const {
      paymentId,
      reason,
    } = req.body;


    if (!paymentId) {

      return res.status(400).json({

        success: false,

        message:
          "Payment ID is required",

      });

    }


    const payment =
      await Payment.findById(
        paymentId
      );


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
      reason ||
      "Payment failed";


    await payment.save();


    // =================================================
    // UPDATE ORDER
    // =================================================

    const order =
      await Order.findById(
        payment.order
      );


    if (order) {

      order.paymentStatus =
        "FAILED";

      order.orderStatus =
        "PENDING";

      await order.save();

    }


    return res.status(200).json({

      success: true,

      message:
        "Payment marked as failed",

      payment: {

        id:
          payment._id,

        status:
          payment.status,

        failureReason:
          payment.failureReason,

      },

    });

  } catch (error) {

    console.error(
      "Payment Failed Error:",
      error
    );


    return res.status(500).json({

      success: false,

      message:
        "Unable to update payment status",

      error:
        error.message,

    });

  }

};


// =====================================================
// FASTRR WEBHOOK
// =====================================================
//
// FASTRR should call this endpoint after payment.
//
// IMPORTANT:
// Verify the webhook signature according to FASTRR
// documentation before trusting payment status.
//
// =====================================================

const fastrrWebhook = async (req, res) => {

  try {

    console.log(
      "FASTRR Webhook:",
      req.body
    );


    const {
      paymentId,
      transactionId,
      gatewayOrderId,
      status,
    } = req.body;


    // =================================================
    // VALIDATE PAYMENT ID
    // =================================================

    if (!paymentId) {

      return res.status(400).json({

        success: false,

        message:
          "Payment ID missing",

      });

    }


    // =================================================
    // PAYMENT SUCCESS
    // =================================================

    if (
      status === "SUCCESS" ||
      status === "PAID" ||
      status === "COMPLETED"
    ) {

      // Find payment using our MongoDB payment ID
      const payment =
        await Payment.findById(
          paymentId
        );


      if (!payment) {

        return res.status(404).json({

          success: false,

          message:
            "Payment not found",

        });

      }


      // Already processed
      if (
        payment.status === "PAID"
      ) {

        return res.status(200).json({

          success: true,

          message:
            "Payment already processed",

        });

      }


      // Update payment
      payment.status =
        "PAID";

      payment.transactionId =
        transactionId || null;

      payment.gatewayOrderId =
        gatewayOrderId ||
        payment.gatewayOrderId ||
        null;

      payment.paidAt =
        new Date();


      await payment.save();


      // -----------------------------------------------
      // UPDATE ORDER
      // -----------------------------------------------

      const order =
        await Order.findById(
          payment.order
        );


      if (!order) {

        return res.status(404).json({

          success: false,

          message:
            "Order not found",

        });

      }


      order.paymentStatus =
        "PAID";

      order.orderStatus =
        "CONFIRMED";


      await order.save();


      return res.status(200).json({

        success: true,

        message:
          "Payment webhook processed",

      });

    }


    // =================================================
    // PAYMENT FAILED
    // =================================================

    if (
      status === "FAILED"
    ) {

      const payment =
        await Payment.findById(
          paymentId
        );


      if (payment) {

        payment.status =
          "FAILED";

        payment.failureReason =
          "FASTRR payment failed";

        await payment.save();


        const order =
          await Order.findById(
            payment.order
          );


        if (order) {

          order.paymentStatus =
            "FAILED";

          await order.save();

        }

      }


      return res.status(200).json({

        success: true,

        message:
          "Failed payment webhook processed",

      });

    }


    // =================================================
    // UNKNOWN STATUS
    // =================================================

    return res.status(200).json({

      success: true,

      message:
        "Webhook received",

    });

  } catch (error) {

    console.error(
      "FASTRR Webhook Error:",
      error
    );


    return res.status(500).json({

      success: false,

      message:
        "Webhook processing failed",

    });

  }

};


// =====================================================
// GET PAYMENT
// =====================================================

const getPayment = async (req, res) => {

  try {

    const payment =
      await Payment.findOne({

        _id:
          req.params.paymentId,

        user:
          req.user._id,

      })

        .populate(
          "order"
        )

        .populate(
          "user",
          "name email phone"
        );


    if (!payment) {

      return res.status(404).json({

        success: false,

        message:
          "Payment not found",

      });

    }


    return res.status(200).json({

      success: true,

      payment,

    });

  } catch (error) {

    console.error(
      "Get Payment Error:",
      error
    );


    return res.status(500).json({

      success: false,

      message:
        "Unable to fetch payment",

    });

  }

};


// =====================================================
// EXPORT
// =====================================================

module.exports = {

  createPayment,
  paymentSuccess,
  paymentFailed,
  fastrrWebhook,
  getPayment,

};