const express = require("express");

const {
  verifyWebhook,
  handleWebhook,
} = require("../controllers/whatsapp.controller");

const router = express.Router();

// Meta webhook verification
router.get("/webhook", verifyWebhook);

// WhatsApp incoming messages
router.post("/webhook", handleWebhook);

module.exports = router;