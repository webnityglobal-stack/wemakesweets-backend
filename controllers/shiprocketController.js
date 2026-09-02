const Order = require("../models/Order");

const {
  createShiprocketOrder,
  generateAWB,
  trackByShipment,
  cancelShiprocketOrder,
} = require("../services/shiprocketService");


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
      // user: req.user._id,
    });

    if (!order) {
      return res.status(404).json({
        success: false,
        message: "Order not found",
      });
    }

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
    // CHECK PAYMENT
    // -----------------------------------------------

    if (order.paymentMethod === "ONLINE") {
      if (order.paymentStatus !== "PAID") {
        return res.status(400).json({
          success: false,
          message:
            "Online payment is not completed. Shiprocket order cannot be created.",
        });
      }
    }


    // -----------------------------------------------
    // CHECK IF SHIPROCKET ORDER ALREADY EXISTS
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
    // PREPARE SHIPROCKET PAYLOAD
    // -----------------------------------------------

    const shiprocketOrderData = {
      order_id: order.orderId,

      order_date: order.createdAt
        .toISOString()
        .split("T")[0],

      pickup_location: process.env.SHIPROCKET_PICKUP_LOCATION,

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

      order_items: order.items.map((item) => ({
        name: item.name,
        sku: item.sku,
        units: item.quantity,
        selling_price: item.price,
        discount: 0,
      })),


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

      sub_total: order.totalAmount,


      // ==============================================
      // PACKAGE
      // ==============================================

      length: 10,

      breadth: 10,

      height: 10,

      weight: 0.5,
    };


    console.log(
      "Shiprocket Order Payload:",
      shiprocketOrderData
    );


    // -----------------------------------------------
    // CREATE SHIPROCKET ORDER
    // -----------------------------------------------

    console.log(
      "SHIPROCKET ORDER PAYLOAD:",
      JSON.stringify(shiprocketOrderData, null, 2)
    );

    const response =
      await createShiprocketOrder(
        shiprocketOrderData
      );


    console.log(
      "Shiprocket Create Order Response:",
      response
    );


    // -----------------------------------------------
    // SAVE SHIPROCKET DETAILS
    // -----------------------------------------------

    order.shiprocket.orderId =
      response.order_id || null;

    order.shiprocket.shipmentId =
      response.shipment_id || null;

    order.shiprocket.status =
      "ORDER_CREATED";


    // -----------------------------------------------
    // UPDATE ORDER STATUS
    // -----------------------------------------------

    order.orderStatus =
      "CONFIRMED";


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
      shipmentId: order.shiprocket.shipmentId,
    });


    console.log(
      "AWB Response:",
      response
    );


    // -----------------------------------------------
    // SAVE AWB DETAILS
    // -----------------------------------------------

    const awbDetails =
      response?.response?.data ||
      response?.data ||
      response;

    console.log(
      "AWB Details:",
      awbDetails
    );


    if (awbDetails?.awb_code) {

      order.shiprocket.awbCode =
        awbDetails.awb_code;

    }


    if (awbDetails?.courier_name) {

      order.shiprocket.courierName =
        awbDetails.courier_name;

    }


    if (awbDetails?.courier_company_id) {

      order.shiprocket.courierId =
        String(
          awbDetails.courier_company_id
        );

    }


    order.shiprocket.status =
      "AWB_GENERATED";


    await order.save();


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
// TRACK SHIPMENT
// ==================================================

const getShipmentTracking = async (
  req,
  res
) => {

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


    return res.status(200).json({

      success: true,

      orderId:
        order.orderId,

      shipmentId:
        order.shiprocket.shipmentId,

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

const cancelShipment = async (
  req,
  res
) => {

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
    // UPDATE ORDER
    // -----------------------------------------------

    order.shiprocket.status =
      "CANCELLED";

    order.orderStatus =
      "CANCELLED";


    await order.save();


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
// EXPORT
// ==================================================

module.exports = {
  createShipment,
  assignAWB,
  getShipmentTracking,
  cancelShipment,
};