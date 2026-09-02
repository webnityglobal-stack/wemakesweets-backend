const express = require("express");

const {
  createShipment,
  assignAWB,
  getShipmentTracking,
  cancelShipment,
} = require("../controllers/shiprocketController");

const authMiddleware = require("../middleware/authMiddleware");

const router = express.Router();


// Create Shiprocket shipment
router.post(
  "/create/:orderId",
  authMiddleware,
  createShipment
);


// Generate AWB
router.post(
  "/awb/:orderId",
  authMiddleware,
  assignAWB
);


// Track shipment
router.get(
  "/track/:orderId",
  authMiddleware,
  getShipmentTracking
);


// Cancel shipment
router.put(
  "/cancel/:orderId",
  authMiddleware,
  cancelShipment
);


module.exports = router;