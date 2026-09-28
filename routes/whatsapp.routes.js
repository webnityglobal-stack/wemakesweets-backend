const express = require("express");

const {
  verifyWebhook,
  handleWebhook,
} = require("../controllers/whatsapp.controller");
const {
  sendWelcomeTemplate,
  sendTextMessage,
} = require("../services/whatsappService");

const router = express.Router();

// Meta webhook verification
router.get("/webhook", verifyWebhook);

// WhatsApp incoming messages
router.post("/webhook", handleWebhook);

// Diagnostic test endpoint to test WhatsApp message sending and unblock 24-hr session
router.get("/test-send", async (req, res) => {
  try {
    const phone = req.query.phone || "917248881677";
    const name = req.query.name || "Ajay";
    console.log(`🧪 WhatsApp Test Send requested for ${phone}`);
    const result = await sendWelcomeTemplate(phone, name);
    return res.json({
      success: result.success,
      recipient: phone,
      configuredPhoneId: process.env.WHATSAPP_PHONE_NUMBER_ID,
      apiVersion: process.env.WHATSAPP_API_VERSION || "v21.0",
      result,
    });
  } catch (error) {
    return res.status(500).json({ success: false, error: error.message });
  }
});

module.exports = router;