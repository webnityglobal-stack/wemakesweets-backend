const Order = require("../models/order");

const {
  createShiprocketOrder,
  generatePickup,
  generateAWB,
  trackByShipment,
  cancelShiprocketOrder,
  getShiprocketOrderDetails,
} = require("../services/shiprocketService");

// ==================================================
// HELPER: SYNC SHIPROCKET STATUS FOR AN ORDER
// ==================================================
const syncOrderShiprocketStatus = async (order, trackingRes = null) => {
  if (!order || !order.shiprocket) return order;

  let response = trackingRes;
  let statusUpdated = false;

  try {
    // 1. If tracking response not provided, fetch tracking if shipmentId exists
    if (!response && order.shiprocket.shipmentId) {
      try {
        response = await trackByShipment(order.shiprocket.shipmentId);
      } catch (trackErr) {
        console.warn(`[Shiprocket Sync] Tracking fetch failed for shipment ${order.shiprocket.shipmentId}:`, trackErr.message);
      }
    }

    const trackingData =
      response?.[order.shiprocket.shipmentId]?.tracking_data ||
      response?.tracking_data ||
      (response && typeof response === "object" ? Object.values(response)[0]?.tracking_data : null) ||
      null;

    const trackingError = typeof trackingData?.error === "string" ? trackingData.error : "";
    const currentStatus = (trackingData?.shipment_track?.[0]?.current_status || "").toUpperCase();
    const shipmentStatus = Number(trackingData?.shipment_status || 0);

    // Check cancellation signals from tracking
    const isCancelledFromTracking =
      shipmentStatus === 8 ||
      /cancel/i.test(trackingError) ||
      /cancel/i.test(currentStatus);

    if (isCancelledFromTracking) {
      if (order.orderStatus !== "CANCELLED" || order.shiprocket.status !== "CANCELLED") {
        order.orderStatus = "CANCELLED";
        order.shiprocket.status = "CANCELLED";
        if (!order.cancelledAt) order.cancelledAt = new Date();
        if (!order.cancellationReason) {
          order.cancellationReason = trackingError || "Order cancelled via Shiprocket";
        }
        statusUpdated = true;
      }
    } else if (order.shiprocket.orderId && order.orderStatus !== "CANCELLED" && order.orderStatus !== "DELIVERED") {
      // 2. Also verify order status via Shiprocket orders/show API
      try {
        const orderDetails = await getShiprocketOrderDetails(order.shiprocket.orderId);
        const srStatus = (orderDetails?.data?.status || orderDetails?.status || "").toUpperCase();
        if (srStatus === "CANCELED" || srStatus === "CANCELLED") {
          order.orderStatus = "CANCELLED";
          order.shiprocket.status = "CANCELLED";
          if (!order.cancelledAt) order.cancelledAt = new Date();
          if (!order.cancellationReason) {
            order.cancellationReason = "Order cancelled via Shiprocket Dashboard";
          }
          statusUpdated = true;
        }
      } catch (srErr) {
        console.warn(`[Shiprocket Sync] Order details check failed for SR order ${order.shiprocket.orderId}:`, srErr.message);
      }
    }

    // If still not cancelled, check for delivery or transit updates
    if (order.orderStatus !== "CANCELLED") {
      if (shipmentStatus === 7 || /DELIVERED/.test(currentStatus)) {
        if (order.orderStatus !== "DELIVERED") {
          order.orderStatus = "DELIVERED";
          order.shiprocket.status = "DELIVERED";
          statusUpdated = true;
        }
      } else if (shipmentStatus === 17 || shipmentStatus === 46 || /OUT.*DELIV/.test(currentStatus)) {
        if (order.orderStatus !== "OUT_FOR_DELIVERY") {
          order.orderStatus = "OUT_FOR_DELIVERY";
          order.shiprocket.status = "OUT_FOR_DELIVERY";
          statusUpdated = true;
        }
      } else if (
        shipmentStatus === 6 ||
        shipmentStatus === 18 ||
        shipmentStatus === 42 ||
        /TRANSIT|SHIPP|PICKED/.test(currentStatus)
      ) {
        if (order.orderStatus !== "SHIPPED") {
          order.orderStatus = "SHIPPED";
          order.shiprocket.status = "IN_TRANSIT";
          statusUpdated = true;
        }
      }

      // Sync AWB & Courier Name
      const awb = trackingData?.shipment_track?.[0]?.awb_code;
      if (awb && !order.shiprocket.awbCode) {
        order.shiprocket.awbCode = awb;
        statusUpdated = true;
      }
      const courier = trackingData?.shipment_track?.[0]?.courier_name;
      if (courier && !order.shiprocket.courierName) {
        order.shiprocket.courierName = courier;
        statusUpdated = true;
      }
    }

    if (statusUpdated) {
      await order.save();
    }
  } catch (err) {
    console.warn(`[Shiprocket Sync] Error syncing status for order ${order.orderId}:`, err.message);
  }

  return order;
};


// ==================================================
// CREATE SHIPROCKET ORDER
// ==================================================

const createShipment = async (req, res) => {
  try {
    const { orderId } = req.params;

    // -----------------------------------------------
    // FIND ORDER
    // -----------------------------------------------

    const order = await Order.findOne({
      orderId,
      user: req.user.userId,
    });

    // -----------------------------------------------
    // CHECK ORDER
    // -----------------------------------------------

    if (!order) {
      return res.status(404).json({
        success: false,
        message: "Order not found",
      });
    }

    console.log("SHIPROCKET ORDER CHECK:", {
      orderId: order.orderId,
      paymentMethod: order.paymentMethod,
      paymentStatus: order.paymentStatus,
      orderStatus: order.orderStatus,
    });

    // -----------------------------------------------
    // CHECK ONLINE PAYMENT
    // -----------------------------------------------

    if (
      order.paymentMethod === "ONLINE" &&
      order.paymentStatus !== "PAID"
    ) {
      return res.status(400).json({
        success: false,
        message:
          "Online payment is not completed. Shiprocket order cannot be created.",
        paymentStatus: order.paymentStatus,
      });
    }

    // -----------------------------------------------
    // CHECK EXISTING SHIPROCKET ORDER
    // -----------------------------------------------

    if (order.shiprocket?.orderId) {
      return res.status(400).json({
        success: false,
        message: "Shiprocket order already exists",
        shiprocketOrderId: order.shiprocket.orderId,
        shipmentId: order.shiprocket.shipmentId,
      });
    }

    // -----------------------------------------------
    // SHIPPING ADDRESS
    // -----------------------------------------------

    const address = order.shippingAddress;

    if (!address) {
      return res.status(400).json({
        success: false,
        message: "Shipping address is missing",
      });
    }

    // -----------------------------------------------
    // PREPARE ORDER ITEMS
    // -----------------------------------------------

    const orderItems = order.items.map((item) => ({
      name: item.name,
      sku: item.sku,
      units: item.quantity,
      selling_price: item.price,
      discount: 0,
    }));

    // -----------------------------------------------
    // PREPARE SUB TOTAL
    // -----------------------------------------------

    const subTotal = order.items.reduce(
      (sum, item) => sum + item.total,
      0
    );

    // -----------------------------------------------
    // PREPARE SHIPROCKET PAYLOAD
    // -----------------------------------------------

    const shiprocketOrderData = {
      order_id: order.orderId,

      order_date: order.createdAt
        .toISOString()
        .split("T")[0],

      pickup_location:
        process.env.SHIPROCKET_PICKUP_LOCATION,

      comment: "We Make Sweets Order",

      // ==============================================
      // BILLING
      // ==============================================

      billing_customer_name: address.name,

      billing_last_name: "",

      billing_address: address.address,

      billing_address_2: "",

      billing_city: address.city,

      billing_pincode: address.pincode,

      billing_state: address.state,

      billing_country:
        address.country || "India",

      billing_email:
        address.email || "",

      billing_phone: address.phone,

      // ==============================================
      // SHIPPING
      // ==============================================

      shipping_is_billing: true,

      shipping_customer_name: address.name,

      shipping_last_name: "",

      shipping_address: address.address,

      shipping_address_2: "",

      shipping_city: address.city,

      shipping_pincode: address.pincode,

      shipping_state: address.state,

      shipping_country:
        address.country || "India",

      shipping_email:
        address.email || "",

      shipping_phone: address.phone,

      // ==============================================
      // PRODUCTS
      // ==============================================

      order_items: orderItems,

      // ==============================================
      // PAYMENT
      // ==============================================

      payment_method:
        order.paymentMethod === "COD"
          ? "COD"
          : "Prepaid",

      // ==============================================
      // CHARGES
      // ==============================================

      shipping_charges: 0,

      giftwrap_charges: 0,

      transaction_charges: 0,

      total_discount: 0,

      sub_total: subTotal,

      // ==============================================
      // PACKAGE
      // ==============================================

      length: 10,

      breadth: 10,

      height: 10,

      weight: 0.5,
    };

    // -----------------------------------------------
    // LOG PAYLOAD
    // -----------------------------------------------

    console.log(
      "SHIPROCKET ORDER PAYLOAD:",
      JSON.stringify(
        shiprocketOrderData,
        null,
        2
      )
    );

    // -----------------------------------------------
    // CREATE SHIPROCKET ORDER
    // -----------------------------------------------

    const response =
      await createShiprocketOrder(
        shiprocketOrderData
      );

    console.log(
      "SHIPROCKET CREATE RESPONSE:",
      response
    );

    // -----------------------------------------------
    // VALIDATE RESPONSE
    // -----------------------------------------------

    if (
      !response ||
      !response.order_id ||
      !response.shipment_id
    ) {
      return res.status(500).json({
        success: false,
        message:
          "Shiprocket order was not created successfully",
        data: response,
      });
    }

    // -----------------------------------------------
    // SAVE SHIPROCKET DETAILS
    // -----------------------------------------------

    order.shiprocket.orderId =
      String(response.order_id);

    order.shiprocket.shipmentId =
      String(response.shipment_id);

    order.shiprocket.status =
      "ORDER_CREATED";

    // -----------------------------------------------
    // UPDATE ORDER STATUS
    // -----------------------------------------------

    order.orderStatus = "CONFIRMED";

    await order.save();

    // -----------------------------------------------
    // SUCCESS RESPONSE
    // -----------------------------------------------

    return res.status(200).json({
      success: true,

      message:
        "Shiprocket shipment created successfully",

      order: {
        orderId: order.orderId,

        shiprocketOrderId:
          order.shiprocket.orderId,

        shipmentId:
          order.shiprocket.shipmentId,

        orderStatus:
          order.orderStatus,

        paymentStatus:
          order.paymentStatus,

        shiprocketStatus:
          order.shiprocket.status,
      },
    });

  } catch (error) {
    console.error(
      "Create Shipment Error:",
      error.response?.data ||
      error.message
    );

    return res.status(500).json({
      success: false,

      message:
        "Unable to create Shiprocket shipment",

      error:
        error.response?.data ||
        error.message,
    });
  }
};


// ==================================================
// GENERATE AWB
// ==================================================

const assignAWB = async (req, res) => {
  try {
    const { orderId } = req.params;

    // -----------------------------------------------
    // FIND ORDER
    // -----------------------------------------------

    const order = await Order.findOne({
      orderId,
      user: req.user.userId,
    });

    if (!order) {
      return res.status(404).json({
        success: false,
        message: "Order not found",
      });
    }

    // -----------------------------------------------
    // CHECK SHIPMENT
    // -----------------------------------------------

    if (!order.shiprocket?.shipmentId) {
      return res.status(400).json({
        success: false,
        message:
          "Shiprocket shipment has not been created",
      });
    }

    // -----------------------------------------------
    // GENERATE AWB
    // -----------------------------------------------

    const response = await generateAWB({
      shipmentId:
        order.shiprocket.shipmentId,
    });

    console.log(
      "AWB Response:",
      response
    );

    // -----------------------------------------------
    // EXTRACT AWB DETAILS
    // -----------------------------------------------

    const awbDetails =
      response?.response?.data ||
      response?.data ||
      response;

    console.log(
      "AWB Details:",
      awbDetails
    );

    // -----------------------------------------------
    // CHECK AWB
    // -----------------------------------------------

    if (!awbDetails?.awb_code) {
      return res.status(400).json({
        success: false,
        message:
          "AWB was not generated",
        data: response,
      });
    }

    // -----------------------------------------------
    // SAVE AWB DETAILS
    // -----------------------------------------------

    order.shiprocket.awbCode =
      awbDetails.awb_code;

    if (awbDetails.courier_name) {
      order.shiprocket.courierName =
        awbDetails.courier_name;
    }

    if (awbDetails.courier_company_id) {
      order.shiprocket.courierId =
        String(
          awbDetails.courier_company_id
        );
    }

    order.shiprocket.status =
      "AWB_GENERATED";

    await order.save();

    // -----------------------------------------------
    // SUCCESS
    // -----------------------------------------------

    return res.status(200).json({
      success: true,

      message:
        "AWB generated successfully",

      data: response,

      shiprocket: {
        orderId:
          order.shiprocket.orderId,

        shipmentId:
          order.shiprocket.shipmentId,

        awbCode:
          order.shiprocket.awbCode,

        courierName:
          order.shiprocket.courierName,

        courierId:
          order.shiprocket.courierId,

        status:
          order.shiprocket.status,
      },
    });

  } catch (error) {
    console.error(
      "Generate AWB Error:",
      error.response?.data ||
      error.message
    );

    return res.status(500).json({
      success: false,

      message:
        "Unable to generate AWB",

      error:
        error.response?.data ||
        error.message,
    });
  }
};


// ==================================================
// GENERATE PICKUP
// ==================================================

const pickupShipment = async (req, res) => {
  try {
    const { orderId } = req.params;

    // -----------------------------------------------
    // FIND ORDER
    // -----------------------------------------------

    const order = await Order.findOne({
      orderId,
      user: req.user.userId,
    });

    if (!order) {
      return res.status(404).json({
        success: false,
        message: "Order not found",
      });
    }

    // -----------------------------------------------
    // CHECK SHIPMENT
    // -----------------------------------------------

    if (!order.shiprocket?.shipmentId) {
      return res.status(400).json({
        success: false,
        message:
          "Shiprocket shipment has not been created",
      });
    }

    // -----------------------------------------------
    // CHECK AWB
    // -----------------------------------------------

    if (!order.shiprocket?.awbCode) {
      return res.status(400).json({
        success: false,
        message:
          "AWB has not been generated yet",
      });
    }

    // -----------------------------------------------
    // GENERATE PICKUP
    // -----------------------------------------------

    const response =
      await generatePickup(
        order.shiprocket.shipmentId
      );

    console.log(
      "Pickup Response:",
      response
    );

    // -----------------------------------------------
    // UPDATE DATABASE
    // -----------------------------------------------

    order.shiprocket.pickupScheduled =
      true;

    order.shiprocket.status =
      "PICKUP_REQUESTED";

    await order.save();

    // -----------------------------------------------
    // SUCCESS
    // -----------------------------------------------

    return res.status(200).json({
      success: true,

      message:
        "Pickup request generated successfully",

      data: response,

      shiprocket: {
        orderId:
          order.shiprocket.orderId,

        shipmentId:
          order.shiprocket.shipmentId,

        awbCode:
          order.shiprocket.awbCode,

        status:
          order.shiprocket.status,
      },
    });

  } catch (error) {
    console.error(
      "Generate Pickup Error:",
      error.response?.data ||
      error.message
    );

    return res.status(500).json({
      success: false,

      message:
        "Unable to generate pickup",

      error:
        error.response?.data ||
        error.message,
    });
  }
};


// ==================================================
// TRACK SHIPMENT
// ==================================================

const getShipmentTracking = async (req, res) => {
  try {
    const { orderId } = req.params;

    // -----------------------------------------------
    // FIND ORDER
    // -----------------------------------------------

    const order = await Order.findOne({
      orderId,
      user: req.user.userId,
    });

    if (!order) {
      return res.status(404).json({
        success: false,
        message: "Order not found",
      });
    }

    // -----------------------------------------------
    // CHECK SHIPMENT
    // -----------------------------------------------

    if (!order.shiprocket?.shipmentId) {
      return res.status(400).json({
        success: false,
        message:
          "Shipment has not been created",
      });
    }

    // -----------------------------------------------
    // GET TRACKING
    // -----------------------------------------------

    const response =
      await trackByShipment(
        order.shiprocket.shipmentId
      );

    // -----------------------------------------------
    // SYNC ORDER STATUS WITH SHIPROCKET TRACKING
    // -----------------------------------------------

    await syncOrderShiprocketStatus(order, response);

    // -----------------------------------------------
    // SUCCESS
    // -----------------------------------------------

    return res.status(200).json({
      success: true,

      orderId:
        order.orderId,

      shipmentId:
        order.shiprocket.shipmentId,

      orderStatus:
        order.orderStatus,

      shiprocketStatus:
        order.shiprocket.status,

      isCancelled:
        order.orderStatus === "CANCELLED",

      cancellationReason:
        order.cancellationReason || null,

      tracking:
        response,
    });

  } catch (error) {
    console.error(
      "Tracking Error:",
      error.response?.data ||
      error.message
    );

    return res.status(500).json({
      success: false,

      message:
        "Unable to track shipment",

      error:
        error.response?.data ||
        error.message,
    });
  }
};


// ==================================================
// CANCEL SHIPROCKET ORDER
// ==================================================

const cancelShipment = async (req, res) => {
  try {
    const { orderId } = req.params;

    // -----------------------------------------------
    // FIND ORDER
    // -----------------------------------------------

    const order = await Order.findOne({
      orderId,
      user: req.user.userId,
    });

    if (!order) {
      return res.status(404).json({
        success: false,
        message: "Order not found",
      });
    }

    // -----------------------------------------------
    // CHECK SHIPROCKET ORDER
    // -----------------------------------------------

    if (!order.shiprocket?.orderId) {
      return res.status(400).json({
        success: false,
        message:
          "Shiprocket order does not exist",
      });
    }

    // -----------------------------------------------
    // CANCEL SHIPROCKET ORDER
    // -----------------------------------------------

    const response =
      await cancelShiprocketOrder(
        order.shiprocket.orderId
      );

    // -----------------------------------------------
    // UPDATE ORDER STATUS
    // -----------------------------------------------

    order.shiprocket.status =
      "CANCELLED";

    order.orderStatus =
      "CANCELLED";

    await order.save();

    // -----------------------------------------------
    // SUCCESS
    // -----------------------------------------------

    return res.status(200).json({
      success: true,

      message:
        "Shiprocket order cancelled successfully",

      data:
        response,

      order: {
        orderId:
          order.orderId,

        shiprocketOrderId:
          order.shiprocket.orderId,

        shipmentId:
          order.shiprocket.shipmentId,

        status:
          order.shiprocket.status,

        orderStatus:
          order.orderStatus,
      },
    });

  } catch (error) {
    console.error(
      "Cancel Shipment Error:",
      error.response?.data ||
      error.message
    );

    return res.status(500).json({
      success: false,

      message:
        "Unable to cancel Shiprocket order",

      error:
        error.response?.data ||
        error.message,
    });
  }
};


// ==================================================
// SHIPROCKET WEBHOOK HANDLER
// ==================================================
const handleShiprocketWebhook = async (req, res) => {
  try {
    console.log("SHIPROCKET WEBHOOK RECEIVED:", JSON.stringify(req.body, null, 2));

    const payload = req.body || {};
    const shipmentId = String(payload.shipment_id || payload.shipmentId || "");
    const srOrderId = String(payload.order_id || payload.orderId || "");
    const awb = String(payload.awb || payload.awb_code || "");
    const customOrderId = String(payload.channel_order_id || payload.custom_order_id || "");
    const status = String(payload.current_status || payload.status || "").toUpperCase();
    const statusId = Number(payload.current_status_id || payload.shipment_status || 0);

    const query = { $or: [] };
    if (shipmentId) query.$or.push({ "shiprocket.shipmentId": shipmentId });
    if (srOrderId) query.$or.push({ "shiprocket.orderId": srOrderId });
    if (awb) query.$or.push({ "shiprocket.awbCode": awb });
    if (customOrderId) query.$or.push({ orderId: customOrderId });

    if (query.$or.length === 0) {
      return res.status(200).json({ success: true, message: "No identifier found in webhook payload" });
    }

    const order = await Order.findOne(query);
    if (!order) {
      console.warn("Order not found for Shiprocket webhook query:", query);
      return res.status(200).json({ success: true, message: "Order not found" });
    }

    if (statusId === 8 || /CANCEL/.test(status)) {
      order.orderStatus = "CANCELLED";
      order.shiprocket.status = "CANCELLED";
      if (!order.cancelledAt) order.cancelledAt = new Date();
      if (!order.cancellationReason) order.cancellationReason = "Cancelled via Shiprocket Webhook";
    } else if (statusId === 7 || /DELIVERED/.test(status)) {
      order.orderStatus = "DELIVERED";
      order.shiprocket.status = "DELIVERED";
    } else if (statusId === 17 || statusId === 46 || /OUT.*DELIV/.test(status)) {
      order.orderStatus = "OUT_FOR_DELIVERY";
      order.shiprocket.status = "OUT_FOR_DELIVERY";
    } else if (statusId === 6 || statusId === 18 || statusId === 42 || /TRANSIT|SHIPP|PICKED/.test(status)) {
      order.orderStatus = "SHIPPED";
      order.shiprocket.status = "IN_TRANSIT";
    }

    if (awb && !order.shiprocket.awbCode) {
      order.shiprocket.awbCode = awb;
    }

    await order.save();
    console.log(`Order ${order.orderId} updated via Shiprocket webhook: orderStatus=${order.orderStatus}, shiprocket.status=${order.shiprocket.status}`);

    return res.status(200).json({ success: true, message: "Webhook processed successfully" });
  } catch (error) {
    console.error("Shiprocket Webhook Error:", error);
    return res.status(200).json({ success: false, error: error.message });
  }
};


// ==================================================
// EXPORT
// ==================================================

module.exports = {
  createShipment,
  assignAWB,
  pickupShipment,
  getShipmentTracking,
  cancelShipment,
  syncOrderShiprocketStatus,
  handleShiprocketWebhook,
};