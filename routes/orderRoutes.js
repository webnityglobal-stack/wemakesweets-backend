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

const router = express.Router();


// ==========================================
// CUSTOMER ROUTES
// ==========================================

// Create new order
router.post(
  "/create",
  authMiddleware,
  createOrder
);

// Update order shipping address
router.patch(
  "/:id/shipping-address",
  authMiddleware,
  updateShippingAddress
);

// Get logged-in user's orders
router.get(
  "/my-orders",
  authMiddleware,
  getMyOrders
);

// Get single order
router.get(
  "/:id",
  authMiddleware,
  getOrderById
);

// Cancel order
router.put(
  "/cancel/:id",
  authMiddleware,
  cancelOrder
);

router.post(
  "/cancel/:id",
  authMiddleware,
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