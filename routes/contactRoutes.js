const express = require("express");
const router = express.Router();
const {
  submitContact,
  submitFAQQuestion,
  getAllContacts,
} = require("../controllers/contactController");

// Public route to submit contact inquiry
router.post("/", submitContact);
router.post("/send", submitContact);

// Public route to submit FAQ question
router.post("/faq-question", submitFAQQuestion);
router.post("/ask-question", submitFAQQuestion);

// Route to get all inquiries
router.get("/", getAllContacts);

module.exports = router;
