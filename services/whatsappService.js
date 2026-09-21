const axios = require("axios");

// WhatsApp API configuration
const getWhatsappConfig = () => {
  const token = process.env.WHATSAPP_ACCESS_TOKEN;
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
  let version = process.env.WHATSAPP_API_VERSION || "v21.0";
  if (!version.startsWith("v") || parseInt(version.slice(1)) > 23) {
    version = "v21.0";
  }

  return {
    token,
    phoneNumberId,
    version,
    url: `https://graph.facebook.com/${version}/${phoneNumberId}/messages`,
  };
};

/**
 * Format any phone number into E.164 standard without '+' or leading zeros
 * e.g., '+91 98765-43210' -> '919876543210'
 * '9876543210' (10 digits) -> '919876543210'
 */
const formatPhoneNumber = (phone) => {
  if (!phone) return "";
  let cleaned = String(phone).replace(/\D/g, "");
  if (cleaned.length === 10) {
    cleaned = "91" + cleaned;
  } else if (cleaned.length === 11 && cleaned.startsWith("0")) {
    cleaned = "91" + cleaned.substring(1);
  }
  return cleaned;
};

/**
 * Core send helper for WhatsApp Cloud API
 */
const callWhatsappApi = async (payload) => {
  const { token, url } = getWhatsappConfig();

  if (!token || !url) {
    console.error("❌ WhatsApp configuration missing in .env");
    return { success: false, error: "WhatsApp configuration missing" };
  }

  try {
    const response = await axios.post(url, payload, {
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
    });

    return { success: true, data: response.data };
  } catch (error) {
    const errorDetails = error.response ? error.response.data : error.message;
    console.error("❌ WhatsApp API Error:", JSON.stringify(errorDetails, null, 2));
    return { success: false, error: errorDetails };
  }
};

/**
 * Send standard plain text message
 */
const sendTextMessage = async (to, text) => {
  const formattedPhone = formatPhoneNumber(to);
  if (!formattedPhone) return { success: false, error: "Invalid phone number" };

  const payload = {
    messaging_product: "whatsapp",
    recipient_type: "individual",
    to: formattedPhone,
    type: "text",
    text: { body: text },
  };

  return await callWhatsappApi(payload);
};

/**
 * Send interactive buttons (up to 3 buttons)
 * @param {string} to - Recipient phone
 * @param {string} bodyText - Main text body
 * @param {Array<{id: string, title: string}>} buttons - Array of button objects (max 3)
 */
const sendInteractiveButtons = async (to, bodyText, buttons = []) => {
  const formattedPhone = formatPhoneNumber(to);
  if (!formattedPhone) return { success: false, error: "Invalid phone number" };

  const formattedButtons = buttons.slice(0, 3).map((btn) => ({
    type: "reply",
    reply: {
      id: btn.id,
      title: btn.title.slice(0, 20), // Max 20 chars
    },
  }));

  const payload = {
    messaging_product: "whatsapp",
    recipient_type: "individual",
    to: formattedPhone,
    type: "interactive",
    interactive: {
      type: "button",
      body: { text: bodyText },
      action: { buttons: formattedButtons },
    },
  };

  return await callWhatsappApi(payload);
};

/**
 * Send template message
 * @param {string} to - Recipient phone
 * @param {string} templateName - Approved template name
 * @param {Array<string>} bodyParameters - Array of text parameter strings for {{1}}, {{2}}, etc.
 * @param {string} languageCode - Default 'en_US'
 */
const sendTemplateMessage = async (
  to,
  templateName,
  bodyParameters = [],
  languageCode = "en_US"
) => {
  const formattedPhone = formatPhoneNumber(to);
  if (!formattedPhone) return { success: false, error: "Invalid phone number" };

  const components = [];

  if (bodyParameters && bodyParameters.length > 0) {
    components.push({
      type: "body",
      parameters: bodyParameters.map((param) => ({
        type: "text",
        text: String(param || ""),
      })),
    });
  }

  const payload = {
    messaging_product: "whatsapp",
    recipient_type: "individual",
    to: formattedPhone,
    type: "template",
    template: {
      name: templateName,
      language: { code: languageCode },
      components: components.length > 0 ? components : undefined,
    },
  };

  return await callWhatsappApi(payload);
};

// =====================================================
// 7 SPECIFIC TEMPLATE METHODS
// =====================================================

/**
 * 1. Welcome Message
 * Template: wms_welcome
 * {{1}} = Customer Name
 */
const sendWelcomeTemplate = async (to, customerName) => {
  return await sendTemplateMessage(to, "wms_welcome", [customerName || "Friend"]);
};

/**
 * 2. Login OTP
 * Template: wms_login_otp
 * {{1}} = OTP
 */
const sendLoginOtpTemplate = async (to, otp) => {
  return await sendTemplateMessage(to, "wms_login_otp", [otp]);
};

/**
 * 3. Order Confirmed
 * Template: wms_order_confirmed
 * {{1}} = Customer Name, {{2}} = Order ID
 */
const sendOrderConfirmedTemplate = async (to, customerName, orderId) => {
  return await sendTemplateMessage(to, "wms_order_confirmed", [
    customerName || "Valued Customer",
    orderId,
  ]);
};

/**
 * 4. Order Packed
 * Template: wms_order_packed
 * {{1}} = Customer Name, {{2}} = Order ID
 */
const sendOrderPackedTemplate = async (to, customerName, orderId) => {
  return await sendTemplateMessage(to, "wms_order_packed", [
    customerName || "Valued Customer",
    orderId,
  ]);
};

/**
 * 5. Order Shipped
 * Template: wms_order_shipped
 * {{1}} = Customer Name, {{2}} = Order ID
 */
const sendOrderShippedTemplate = async (to, customerName, orderId) => {
  return await sendTemplateMessage(to, "wms_order_shipped", [
    customerName || "Valued Customer",
    orderId,
  ]);
};

/**
 * 6. Out for Delivery
 * Template: wms_out_for_delivery
 * {{1}} = Customer Name, {{2}} = Order ID
 */
const sendOutForDeliveryTemplate = async (to, customerName, orderId) => {
  return await sendTemplateMessage(to, "wms_out_for_delivery", [
    customerName || "Valued Customer",
    orderId,
  ]);
};

/**
 * 7. Delivered
 * Template: wms_order_delivered
 * {{1}} = Customer Name, {{2}} = Order ID
 */
const sendOrderDeliveredTemplate = async (to, customerName, orderId) => {
  return await sendTemplateMessage(to, "wms_order_delivered", [
    customerName || "Valued Customer",
    orderId,
  ]);
};

// =====================================================
// UNIFIED ORDER STATUS NOTIFIER
// =====================================================

/**
 * Unified helper to trigger appropriate WhatsApp notification on order status change
 * Safely resolves phone and customer name from order object or DB
 */
const sendOrderStatusNotification = async (orderOrId, newStatus) => {
  try {
    let order = orderOrId;
    if (typeof orderOrId === "string") {
      const Order = require("../models/order");
      order = await Order.findById(orderOrId).populate("user", "name phone");
    }

    if (!order) {
      console.warn("⚠️ sendOrderStatusNotification: Order not found");
      return;
    }

    // Determine phone and customer name
    const phone =
      order.shippingAddress?.phone ||
      (order.user && order.user.phone) ||
      null;

    const customerName =
      order.shippingAddress?.name ||
      (order.user && order.user.name) ||
      "Customer";

    if (!phone) {
      console.warn(`⚠️ No phone number found for order ${order.orderId || order._id}`);
      return;
    }

    const orderId = order.orderId || String(order._id);
    const normalizedStatus = String(newStatus || "").toUpperCase().trim();

    console.log(`📲 WhatsApp Status Update: Order ${orderId} -> ${normalizedStatus} for ${phone}`);

    switch (normalizedStatus) {
      case "CONFIRMED":
        return await sendOrderConfirmedTemplate(phone, customerName, orderId);
      case "PACKED":
        return await sendOrderPackedTemplate(phone, customerName, orderId);
      case "SHIPPED":
        return await sendOrderShippedTemplate(phone, customerName, orderId);
      case "OUT_FOR_DELIVERY":
        return await sendOutForDeliveryTemplate(phone, customerName, orderId);
      case "DELIVERED":
        return await sendOrderDeliveredTemplate(phone, customerName, orderId);
      default:
        console.log(`ℹ️ No WhatsApp template configured for status: ${normalizedStatus}`);
        return null;
    }
  } catch (error) {
    console.error("❌ Failed to send WhatsApp order status notification:", error.message);
  }
};

module.exports = {
  formatPhoneNumber,
  sendTextMessage,
  sendInteractiveButtons,
  sendTemplateMessage,
  sendWelcomeTemplate,
  sendLoginOtpTemplate,
  sendOrderConfirmedTemplate,
  sendOrderPackedTemplate,
  sendOrderShippedTemplate,
  sendOutForDeliveryTemplate,
  sendOrderDeliveredTemplate,
  sendOrderStatusNotification,
};
