const express = require("express");

const {
  createShipment,
  assignAWB,
  pickupShipment,
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

// Pickup shipment
router.post(
  "/pickup/:orderId",
  authMiddleware,
  pickupShipment
);

router.post("/test", (req, res) => {
  res.json({
    success: true,
    message: "Shiprocket route is working"
  });
});


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