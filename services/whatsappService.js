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
  // Strip leading zeros
  if (cleaned.startsWith("0")) {
    cleaned = cleaned.replace(/^0+/, "");
  }
  // Standard 10-digit Indian phone number
  if (cleaned.length === 10) {
    cleaned = "91" + cleaned;
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
 * Send template message with auto-retry across language codes (en <-> en_US)
 * @param {string} to - Recipient phone
 * @param {string} templateName - Approved template name
 * @param {Array<string>} bodyParameters - Array of text parameter strings for {{1}}, {{2}}, etc.
 * @param {string} languageCode - Preferred language code (default 'en')
 */
const sendTemplateMessage = async (
  to,
  templateName,
  bodyParameters = [],
  languageCode = "en"
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

  const buildPayload = (lang) => ({
    messaging_product: "whatsapp",
    recipient_type: "individual",
    to: formattedPhone,
    type: "template",
    template: {
      name: templateName,
      language: { code: lang },
      components: components.length > 0 ? components : undefined,
    },
  });

  // Try with preferred language (e.g. "en")
  let result = await callWhatsappApi(buildPayload(languageCode));

  // If failed due to language translation mismatch (Error 132001 or language mismatch), retry with alternate
  const errStr = JSON.stringify(result.error || "");
  if (
    !result.success &&
    (errStr.includes("132001") ||
      errStr.toLowerCase().includes("language") ||
      errStr.toLowerCase().includes("does not exist"))
  ) {
    const alternateCode = languageCode === "en" ? "en_US" : "en";
    console.log(
      `🔄 Retrying template '${templateName}' with alternate language code: '${alternateCode}'...`
    );
    result = await callWhatsappApi(buildPayload(alternateCode));
  }

  return result;
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
  return await sendTemplateMessage(to, "wms_welcome", [customerName || "Friend"], "en");
};

/**
 * Comprehensive Welcome Notification:
 * Attempts approved template 'wms_welcome' first (with en/en_US auto-retry).
 * If template fails (e.g. pending Meta approval), falls back to rich text message.
 */
const sendWelcomeNotification = async (to, customerName) => {
  const formattedPhone = formatPhoneNumber(to);
  if (!formattedPhone) {
    console.warn("⚠️ Invalid phone number for welcome message:", to);
    return { success: false, error: "Invalid phone number" };
  }

  const name = customerName || "Friend";
  console.log(`📩 Initiating WhatsApp Welcome message to ${formattedPhone} (${name})...`);

  // 1. Try sending the official wms_welcome template
  const templateResult = await sendWelcomeTemplate(formattedPhone, name);
  if (templateResult.success) {
    console.log(`✅ [WhatsApp Welcome] Template 'wms_welcome' sent successfully to ${formattedPhone}`);
    return templateResult;
  }

  // Check if error is because user is not on WhatsApp (Error 131026)
  const errStr = JSON.stringify(templateResult.error || "");
  if (errStr.includes("131026") || errStr.toLowerCase().includes("not a valid whatsapp user")) {
    console.log(`ℹ️ [WhatsApp Welcome] Recipient ${formattedPhone} is not registered on WhatsApp.`);
    return { success: false, notOnWhatsApp: true, error: templateResult.error };
  }

  console.warn(
    `⚠️ [WhatsApp Welcome] Template 'wms_welcome' failed. Attempting text message fallback...`
  );

  // 2. Fallback: If template failed, try sending a rich text message
  // (Works if user already chatted with the bot within the 24-hr customer service window)
  const websiteUrl =
    process.env.FRONTEND_URL || "https://wemakesweets.vercel.app";
  const fallbackMessage =
    `🍬 *Welcome to WeMake Sweets & Snacks, ${name}!* 👋\n\n` +
    `We're delighted to have you with us! Discover our delicious range of authentic, traditional sweets and snacks, made fresh to bring sweetness to every celebration.\n\n` +
    `🛍️ *Browse & Order Online:*\n${websiteUrl}/products\n\n` +
    `Thank you for joining WeMake Sweets & Snacks! ❤️\n` +
    `_Reply *Hi* anytime to browse products, track orders, or get help._`;

  const textResult = await sendTextMessage(formattedPhone, fallbackMessage);
  if (textResult.success) {
    console.log(
      `✅ [WhatsApp Welcome] Fallback text message sent successfully to ${formattedPhone}`
    );
    return textResult;
  }

  console.error(`❌ [WhatsApp Welcome] Both template and text fallback failed to send to ${formattedPhone}`);
  return {
    success: false,
    templateError: templateResult.error,
    textError: textResult.error,
  };
};

/**
 * 2. Login OTP
 * Template: wms_login_otp
 * {{1}} = OTP
 */
const sendLoginOtpTemplate = async (to, otp) => {
  return await sendTemplateMessage(to, "wms_login_otp", [otp], "en");
};

/**
 * Send Password Reset OTP via WhatsApp:
 * 1. Tries wms_login_otp template (with en/en_US auto-retry)
 * 2. If template fails/pending, falls back to rich formatted text message
 */
const sendResetPasswordOtp = async (to, otp, customerName) => {
  const formattedPhone = formatPhoneNumber(to);
  if (!formattedPhone) {
    return { success: false, error: "Invalid phone number" };
  }

  const name = customerName || "Customer";
  console.log(`🔐 [WhatsApp Reset OTP] Sending OTP to ${formattedPhone} (${name})...`);

  // 1. Try sending the official OTP template (wms_login_otp)
  const templateResult = await sendLoginOtpTemplate(formattedPhone, otp);
  if (templateResult.success) {
    console.log(`✅ [WhatsApp Reset OTP] Template 'wms_login_otp' sent successfully to ${formattedPhone}`);
    return templateResult;
  }

  // Check if error is because user is not on WhatsApp (Error 131026)
  const errStr = JSON.stringify(templateResult.error || "");
  if (errStr.includes("131026") || errStr.toLowerCase().includes("not a valid whatsapp user")) {
    console.log(`ℹ️ [WhatsApp Reset OTP] Recipient ${formattedPhone} is not registered on WhatsApp.`);
    return { success: false, notOnWhatsApp: true, error: templateResult.error };
  }

  console.warn(`⚠️ [WhatsApp Reset OTP] Template failed, attempting text message fallback...`);

  // 2. Fallback: formatted text message (works if user has interacted with the bot within 24h)
  const fallbackMessage =
    `🔐 *WeMake Sweets & Snacks - Password Reset*\n\n` +
    `Hello ${name},\n\n` +
    `Your password reset verification code is:\n\n` +
    `👉 *${otp}*\n\n` +
    `This code is valid for 10 minutes.\n` +
    `For your security, please do not share this code with anyone.\n\n` +
    `_If you did not request a password reset, please ignore this message._`;

  const textResult = await sendTextMessage(formattedPhone, fallbackMessage);
  if (textResult.success) {
    console.log(`✅ [WhatsApp Reset OTP] Fallback text message sent successfully to ${formattedPhone}`);
    return textResult;
  }

  console.error(`❌ [WhatsApp Reset OTP] Both template and text fallback failed to send to ${formattedPhone}`);
  return {
    success: false,
    templateError: templateResult.error,
    textError: textResult.error,
  };
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
  sendWelcomeNotification,
  sendLoginOtpTemplate,
  sendResetPasswordOtp,
  sendOrderConfirmedTemplate,
  sendOrderPackedTemplate,
  sendOrderShippedTemplate,
  sendOutForDeliveryTemplate,
  sendOrderDeliveredTemplate,
  sendOrderStatusNotification,
};

