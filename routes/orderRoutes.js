const express = require("express");

const {
  createOrder,
  getMyOrders,
  getOrderById,
  cancelOrder,
  getAllOrders,
  updateOrderStatus,
  updateShippingAddress,
} = require("../controllers/orderController");

const authMiddleware = require("../middleware/authMiddleware");
const optionalAuthMiddleware = require("../middleware/optionalAuthMiddleware");

const router = express.Router();

// ==========================================
// CUSTOMER ROUTES (Logged-in & Guest)
// ==========================================

// Create new order (Buy Now or Cart Checkout)
router.post(
  "/create",
  optionalAuthMiddleware,
  createOrder
);

// Update order shipping address
router.patch(
  "/:id/shipping-address",
  optionalAuthMiddleware,
  updateShippingAddress
);

// Get logged-in user's order history
router.get(
  "/my-orders",
  authMiddleware,
  getMyOrders
);

// Get single order details (Order Success page / Tracking)
router.get(
  "/:id",
  optionalAuthMiddleware,
  getOrderById
);

// Cancel order
router.put(
  "/cancel/:id",
  optionalAuthMiddleware,
  cancelOrder
);

router.post(
  "/cancel/:id",
  optionalAuthMiddleware,
  cancelOrder
);

// ==========================================
// ADMIN ROUTES
// ==========================================

// Get all orders
router.get(
  "/admin/all",
  authMiddleware,
  getAllOrders
);

// Update order status
router.put(
  "/admin/status/:id",
  authMiddleware,
  updateOrderStatus
);

module.exports = router;
