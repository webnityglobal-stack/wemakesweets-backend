const express = require("express");

const {
  verifyWebhook,
  handleWebhook,
} = require("../controllers/whatsapp.controller");
const {
  sendWelcomeTemplate,
  sendTextMessage,
  setActivePhoneNumberId,
  getActiveProductionPhoneId,
  getActiveProductionDisplayPhone,
  loadProductionPhoneIdFromDb,
} = require("../services/whatsappService");

const router = express.Router();

// Meta webhook verification
router.get("/webhook", verifyWebhook);

// WhatsApp incoming messages
router.post("/webhook", handleWebhook);

// Get current active WhatsApp bot status and phone IDs
router.get("/status", async (req, res) => {
  try {
    await loadProductionPhoneIdFromDb();
    const activeId = getActiveProductionPhoneId();
    const activeDisplay = getActiveProductionDisplayPhone();
    const envPhoneId = process.env.WHATSAPP_PHONE_NUMBER_ID;

    return res.json({
      status: "online",
      envPhoneId,
      activeProductionPhoneId: activeId,
      activeProductionDisplayPhone: activeDisplay,
      effectiveSendingPhoneId: activeId || envPhoneId,
      isProductionActive: Boolean(activeId && activeId !== envPhoneId),
      apiVersion: process.env.WHATSAPP_API_VERSION || "v21.0",
    });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

// Explicitly set / override the production phone number ID
router.get("/set-production-id", async (req, res) => {
  try {
    const { id, display } = req.query;
    if (!id) {
      return res.status(400).json({
        success: false,
        error: "Missing required query parameter: 'id' (Phone Number ID)",
      });
    }

    await setActivePhoneNumberId(id, display || "916358271511");

    return res.json({
      success: true,
      message: `Production WhatsApp Phone Number ID updated successfully to: ${id}`,
      activeProductionPhoneId: getActiveProductionPhoneId(),
      activeProductionDisplayPhone: getActiveProductionDisplayPhone(),
    });
  } catch (error) {
    return res.status(500).json({ success: false, error: error.message });
  }
});

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
      activeSendingPhoneId:
        getActiveProductionPhoneId() || process.env.WHATSAPP_PHONE_NUMBER_ID,
      configuredEnvPhoneId: process.env.WHATSAPP_PHONE_NUMBER_ID,
      apiVersion: process.env.WHATSAPP_API_VERSION || "v21.0",
      result,
    });
  } catch (error) {
    return res.status(500).json({ success: false, error: error.message });
  }
});

module.exports = router;