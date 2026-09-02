const express = require("express");

const router = express.Router();

const {
  getDashboard,
  getAllOrders,
  getAllCustomers,
  getSalesAnalytics,
  getTopProducts,
  createSubAdmin,
  getAllSubAdmins,
  updateSubAdmin,
  deleteSubAdmin,
} = require("../controllers/adminController");

const authMiddleware = require("../middleware/authMiddleware");
const adminMiddleware = require("../middleware/adminMiddleware");


// ========================================
// ADMIN DASHBOARD
// ========================================

router.get(
  "/dashboard",
  authMiddleware,
  adminMiddleware,
  getDashboard
);


// ========================================
// ALL ORDERS
// ========================================

router.get(
  "/orders",
  authMiddleware,
  adminMiddleware,
  getAllOrders
);


// ========================================
// ALL CUSTOMERS
// ========================================

router.get(
  "/customers",
  authMiddleware,
  adminMiddleware,
  getAllCustomers
);


// ========================================
// SALES ANALYTICS
// ========================================

router.get(
  "/sales",
  authMiddleware,
  adminMiddleware,
  getSalesAnalytics
);


// ========================================
// TOP PRODUCTS
// ========================================

router.get(
  "/top-products",
  authMiddleware,
  adminMiddleware,
  getTopProducts
);

// ========================================
// SUB-ADMIN MANAGEMENT
// ========================================

// Create subadmin
router.post(
  "/subadmins",
  authMiddleware,
  adminMiddleware,
  createSubAdmin
);

// Get all subadmins
router.get(
  "/subadmins",
  authMiddleware,
  adminMiddleware,
  getAllSubAdmins
);

// Update subadmin
router.put(
  "/subadmins/:id",
  authMiddleware,
  adminMiddleware,
  updateSubAdmin
);

// Delete subadmin
router.delete(
  "/subadmins/:id",
  authMiddleware,
  adminMiddleware,
  deleteSubAdmin
);


module.exports = router;