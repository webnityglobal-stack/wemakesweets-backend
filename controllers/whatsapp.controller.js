const Order = require("../models/order");
const mongoose = require("mongoose");
const {
  sendTextMessage,
  sendInteractiveButtons,
  sendWelcomeTemplate,
  setActivePhoneNumberId,
  getActiveProductionPhoneId,
} = require("../services/whatsappService");

// In-memory conversation session store (phone -> { step, time })
const userSessions = new Map();
const SESSION_TTL = 15 * 60 * 1000; // 15 minutes

const getSession = (phone) => {
  const session = userSessions.get(phone);
  if (!session) return null;
  if (Date.now() - session.time > SESSION_TTL) {
    userSessions.delete(phone);
    return null;
  }
  return session;
};

const setSession = (phone, data) => {
  userSessions.set(phone, { ...data, time: Date.now() });
};

const clearSession = (phone) => {
  userSessions.delete(phone);
};

// =====================================================
// META WEBHOOK VERIFICATION (GET)
// =====================================================
const verifyWebhook = (req, res) => {
  const mode = req.query["hub.mode"];
  const token = req.query["hub.verify_token"];
  const challenge = req.query["hub.challenge"];

  console.log("======================================");
  console.log("WEBHOOK VERIFICATION REQUEST");
  console.log("======================================");

  if (mode === "subscribe" && token === process.env.WHATSAPP_VERIFY_TOKEN) {
    console.log("✅ WhatsApp Webhook Verified Successfully");
    return res.status(200).send(challenge);
  }

  console.log("❌ Webhook Verification Failed");
  return res.sendStatus(403);
};

// =====================================================
// BOT INTERACTION HANDLERS
// =====================================================

/**
 * Send the main Welcome menu with 3 interactive buttons
 */
const sendMainMenu = async (to, name, phoneId) => {
  clearSession(to);

  const greetingName = name ? ` ${name}` : "";
  const bodyText = `🍬 Welcome to WeMake Sweets & Snacks${greetingName}! 👋\n\nHow can we help you today?`;

  const buttons = [
    { id: "VIEW_PRODUCTS", title: "🛍️ View Products" },
    { id: "TRACK_ORDER", title: "📦 Track Order" },
    { id: "CONTACT_QUERY", title: "📞 Contact / Query" },
  ];

  const res = await sendInteractiveButtons(to, bodyText, buttons, phoneId);
  if (!res.success) {
    console.warn("⚠️ sendInteractiveButtons failed, sending fallback text menu...");
    const websiteUrl =
      process.env.FRONTEND_URL || "https://wemakesweets.com";
    const textMenu =
      `🍬 *Welcome to WeMake Sweets & Snacks${greetingName}!* 👋\n\n` +
      `How can we help you today?\n\n` +
      `1️⃣ *Browse Products:*\n${websiteUrl}/products\n\n` +
      `2️⃣ *Track Order:*\nReply with your Order ID\n\n` +
      `3️⃣ *Contact Us:*\n${process.env.SUPPORT_PHONE || "+91 98765 43210"}\n\n` +
      `_Reply with your Order ID or *Hi* anytime._`;
    return await sendTextMessage(to, textMenu, phoneId);
  }
  return res;
};

/**
 * Handle "🛍️ View Products" button click or text
 */
const handleViewProducts = async (to, phoneId) => {
  clearSession(to);

  const websiteUrl =
    process.env.FRONTEND_URL || "https://wemakesweets.com";

  const message =
    `🍬 *Explore Our Products*\n\n` +
    `Discover our delicious range of traditional sweets and tasty snacks, crafted to bring sweetness to every celebration!\n\n` +
    `🛍️ *Browse & Order Online:*\n` +
    `${websiteUrl}/products\n\n` +
    `_Reply *Hi* anytime to return to the main menu._`;

  return await sendTextMessage(to, message, phoneId);
};

/**
 * Handle "📞 Contact / Query" button click or text
 */
const handleContactQuery = async (to, phoneId) => {
  clearSession(to);

  const supportPhone = process.env.SUPPORT_PHONE || "+91 98765 43210";
  const supportEmail = process.env.SUPPORT_EMAIL || "support@wemakesweets.com";
  const websiteUrl =
    process.env.FRONTEND_URL || "https://wemakesweets.com";

  const message =
    `📞 *Contact WeMake Sweets & Snacks*\n\n` +
    `For any query, assistance, or bulk orders, please feel free to reach out to us:\n\n` +
    `📱 *Customer Care:* ${supportPhone}\n` +
    `📧 *Email Support:* ${supportEmail}\n` +
    `🌐 *Website:* ${websiteUrl}\n\n` +
    `_Reply *Hi* anytime to return to the main menu._`;

  return await sendTextMessage(to, message, phoneId);
};

/**
 * Handle "📦 Track Order" button click: Prompt customer for Order ID
 */
const handleTrackOrderPrompt = async (to, phoneId) => {
  setSession(to, { step: "AWAITING_ORDER_ID" });

  const message =
    `📦 *Track Your Order*\n\n` +
    `Please reply with your *Order ID* (for example: *WMS12345* or your Order Number).\n\n` +
    `_Or reply *Hi* to cancel and return to the main menu._`;

  return await sendTextMessage(to, message, phoneId);
};

/**
 * Look up order in MongoDB and reply with live status
 */
const handleOrderStatusLookup = async (to, orderQuery, phoneId) => {
  const cleanId = String(orderQuery || "").trim();

  if (!cleanId) {
    return await handleTrackOrderPrompt(to, phoneId);
  }

  try {
    // Search by orderId (case-insensitive) or MongoDB _id if valid
    const query = [{ orderId: { $regex: new RegExp(`^${cleanId}$`, "i") } }];
    if (mongoose.Types.ObjectId.isValid(cleanId)) {
      query.push({ _id: cleanId });
    }

    const order = await Order.findOne({ $or: query });

    if (!order) {
      const notFoundMessage =
        `❌ *Order not found.*\n\n` +
        `We couldn't find any order matching "*${cleanId}*".\n\n` +
        `Please check your Order ID and try again, or reply *Hi* to return to the main menu.`;

      return await sendTextMessage(to, notFoundMessage, phoneId);
    }

    // Clear tracking session on match
    clearSession(to);

    // Map status to friendly emoji and label
    const statusMap = {
      PENDING: "⏳ Pending Confirmation",
      CONFIRMED: "✅ Confirmed",
      PROCESSING: "⚙️ Processing & In Kitchen",
      PACKED: "📦 Packed & Ready for Dispatch",
      SHIPPED: "🚚 Shipped & On the way",
      OUT_FOR_DELIVERY: "🛵 Out for Delivery today",
      DELIVERED: "🎉 Delivered successfully",
      CANCELLED: "❌ Cancelled",
    };

    const statusLabel =
      statusMap[order.orderStatus?.toUpperCase()] ||
      `📦 ${order.orderStatus || "Pending"}`;

    // Format items list (up to 3 items shown clearly)
    const itemsList = (order.items || [])
      .map((item) => `• ${item.name} (${item.quantity}x)`)
      .slice(0, 5)
      .join("\n");

    const orderDate = order.createdAt
      ? new Date(order.createdAt).toLocaleDateString("en-IN", {
          day: "numeric",
          month: "short",
          year: "numeric",
        })
      : "N/A";

    const city = order.shippingAddress?.city || "India";
    const pincode = order.shippingAddress?.pincode || "";

    let trackingInfo = "";
    if (order.shiprocket?.awbCode) {
      trackingInfo += `\n🚚 *AWB Number:* ${order.shiprocket.awbCode}`;
    }
    if (order.shiprocket?.courierName) {
      trackingInfo += `\n📦 *Courier:* ${order.shiprocket.courierName}`;
    }
    if (order.shiprocket?.trackingUrl) {
      trackingInfo += `\n🔗 *Live Tracking:* ${order.shiprocket.trackingUrl}`;
    }

    const responseMessage =
      `📦 *Order Status Details*\n\n` +
      `🆔 *Order ID:* ${order.orderId}\n` +
      `📅 *Order Date:* ${orderDate}\n` +
      `📊 *Status:* ${statusLabel}\n` +
      `💰 *Total Amount:* ₹${order.totalAmount}\n` +
      `📍 *Delivering To:* ${city} ${pincode}\n\n` +
      `🛍️ *Items:*\n${itemsList}\n` +
      `${trackingInfo}\n\n` +
      `Thank you for shopping with WeMake Sweets & Snacks! ❤️\n\n` +
      `_Reply *Hi* anytime to return to the main menu._`;

    return await sendTextMessage(to, responseMessage, phoneId);
  } catch (err) {
    console.error("Error looking up order in WhatsApp bot:", err);
    return await sendTextMessage(
      to,
      "⚠️ An error occurred while retrieving your order. Please try again or contact support.",
      phoneId
    );
  }
};

// =====================================================
// MAIN WEBHOOK INCOMING EVENT HANDLER (POST)
// =====================================================
const handleWebhook = async (req, res) => {
  // Respond 200 OK immediately to satisfy Meta's webhook delivery requirement
  res.sendStatus(200);

  try {
    const body = req.body;

    if (body.object !== "whatsapp_business_account") {
      return;
    }

    const entries = body.entry || [];

    for (const entry of entries) {
      const changes = entry.changes || [];

      for (const change of changes) {
        const value = change.value || {};
        const metadata = value.metadata || {};
        const receivingPhoneId = metadata.phone_number_id;
        const receivingDisplayPhone = metadata.display_phone_number;

        if (receivingPhoneId) {
          console.log(
            `📱 Incoming Webhook on Phone ID: ${receivingPhoneId} (${receivingDisplayPhone})`
          );

          // If incoming message is on production number (not a 1555 sandbox test number), auto-persist as active production phone ID
          const isTestNumber = String(receivingDisplayPhone || "").startsWith("1555");
          if (!isTestNumber && receivingPhoneId !== getActiveProductionPhoneId()) {
            console.log(
              `🌟 [WhatsApp Bot] Detected Production Number: ${receivingPhoneId} (${receivingDisplayPhone}). Setting as default active ID for all outbound triggers!`
            );
            setActivePhoneNumberId(receivingPhoneId, receivingDisplayPhone).catch(
              (err) => console.warn("Failed to save active phone ID:", err.message)
            );
          }
        }

        // ---------------------------------------------
        // PROCESS INCOMING MESSAGES
        // ---------------------------------------------
        if (value.messages && value.messages.length > 0) {
          for (const msg of value.messages) {
            const senderPhone = msg.from;
            const contact = (value.contacts && value.contacts[0]) || {};
            const senderName = contact.profile ? contact.profile.name : "";
            const msgType = msg.type;

            console.log("\n==============================================");
            console.log("📩 INCOMING WHATSAPP MESSAGE:");
            console.log(`   👤 From: ${senderName} (${senderPhone})`);
            console.log(`   💬 Type: ${msgType}`);
            console.log(`   📲 Target Phone ID: ${receivingPhoneId}`);

            // 1. INTERACTIVE BUTTON CLICK
            if (msgType === "interactive") {
              const interactiveType = msg.interactive?.type;

              if (interactiveType === "button_reply") {
                const buttonId = msg.interactive.button_reply?.id;
                console.log(`   🔘 Button Pressed: ${buttonId}`);

                if (buttonId === "VIEW_PRODUCTS") {
                  await handleViewProducts(senderPhone, receivingPhoneId);
                } else if (buttonId === "TRACK_ORDER") {
                  await handleTrackOrderPrompt(senderPhone, receivingPhoneId);
                } else if (buttonId === "CONTACT_QUERY") {
                  await handleContactQuery(senderPhone, receivingPhoneId);
                } else {
                  await sendMainMenu(senderPhone, senderName, receivingPhoneId);
                }
              }
              continue;
            }

            // 2. TEXT MESSAGES
            if (msgType === "text") {
              const rawText = msg.text?.body || "";
              const text = rawText.trim();
              const lowerText = text.toLowerCase();
              console.log(`   📝 Text: "${text}"`);

              // Check for greeting / restart commands
              const isGreeting = [
                "hi",
                "hello",
                "hey",
                "start",
                "menu",
                "namaste",
                "wms",
                "help",
              ].includes(lowerText);

              if (isGreeting) {
                await sendMainMenu(senderPhone, senderName, receivingPhoneId);
                continue;
              }

              // Check for direct keywords
              if (lowerText.includes("product") || lowerText.includes("sweet")) {
                await handleViewProducts(senderPhone, receivingPhoneId);
                continue;
              }

              if (
                lowerText.includes("contact") ||
                lowerText.includes("support") ||
                lowerText.includes("call")
              ) {
                await handleContactQuery(senderPhone, receivingPhoneId);
                continue;
              }

              if (
                lowerText === "track" ||
                lowerText === "track order" ||
                lowerText === "order status"
              ) {
                await handleTrackOrderPrompt(senderPhone, receivingPhoneId);
                continue;
              }

              // Check if user is currently awaiting Order ID or text looks like an Order ID
              const session = getSession(senderPhone);
              const looksLikeOrderId =
                /^(WMS|ORD|#)?[a-zA-Z0-9_-]{4,}$/i.test(text) &&
                text.split(" ").length === 1;

              if (session?.step === "AWAITING_ORDER_ID" || looksLikeOrderId) {
                await handleOrderStatusLookup(senderPhone, text, receivingPhoneId);
                continue;
              }

              // Fallback: If not recognized, send main menu
              await sendMainMenu(senderPhone, senderName, receivingPhoneId);
            }
          }
        }

        // ---------------------------------------------
        // PROCESS MESSAGE STATUS UPDATES (Sent, Delivered, Read, Failed)
        // ---------------------------------------------
        if (value.statuses && value.statuses.length > 0) {
          for (const status of value.statuses) {
            console.log(
              `📊 STATUS: To: ${status.recipient_id} | Status: ${status.status}`
            );
            if (status.status === "failed" && status.errors) {
              console.error(
                `❌ STATUS DELIVERY FAILED DETAILS:`,
                JSON.stringify(status.errors, null, 2)
              );

              // Auto-Recovery for Error 131047 (Re-engagement message / >24 hours passed)
              const is24HrError = status.errors.some(
                (err) =>
                  err.code === 131047 ||
                  String(err.details || "").includes("24 hours")
              );

              if (is24HrError) {
                console.log(
                  `🔄 [Auto-Recovery] Detected Error 131047 for ${status.recipient_id}. Sending approved welcome template to re-establish session...`
                );
                await sendWelcomeTemplate(
                  status.recipient_id,
                  "Valued Customer",
                  receivingPhoneId
                );
              }
            }
          }
        }
      }
    }
  } catch (error) {
    console.error("❌ WhatsApp Webhook Processing Error:", error);
  }
};

module.exports = {
  verifyWebhook,
  handleWebhook,
};