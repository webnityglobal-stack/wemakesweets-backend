const express = require("express");
const router = express.Router();
const {
  submitContact,
  getAllContacts,
} = require("../controllers/contactController");

// Public route to submit contact inquiry
router.post("/", submitContact);
router.post("/send", submitContact);

// Route to get all inquiries
router.get("/", getAllContacts);

module.exports = router;
