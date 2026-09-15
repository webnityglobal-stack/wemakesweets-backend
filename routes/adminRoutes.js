const express = require("express");

const {
  getAdminDashboard,
  getAllOrders,
  getAdminOrderById,
  updateAdminOrderStatus,
  cancelAdminOrder,
  getAllCustomers,
  getSalesAnalytics,
  getTopProducts,
  createSubAdmin,
  getAllSubAdmins,
  updateSubAdmin,
  deleteSubAdmin,
 getPaymentSummary,
 getSalesReport,
  getCodPrepaidCancelReport,  
} = require("../controllers/adminController");

const authMiddleware = require("../middleware/authMiddleware");
const adminMiddleware = require("../middleware/adminMiddleware");

const router = express.Router();


// ========================================
// DASHBOARD
// ========================================

router.get(
  "/dashboard",
  authMiddleware,
  adminMiddleware,
  getAdminDashboard
);


// ========================================
// ORDERS
// ========================================

router.get(
  "/orders",
  authMiddleware,
  adminMiddleware,
  getAllOrders
);

router.get(
  "/orders/:id",
  authMiddleware,
  adminMiddleware,
  getAdminOrderById
);

router.put(
  "/orders/status/:id",
  authMiddleware,
  adminMiddleware,
  updateAdminOrderStatus
);

router.put(
  "/orders/cancel/:id",
  authMiddleware,
  adminMiddleware,
  cancelAdminOrder
);


// ========================================
// CUSTOMERS
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
// SUB ADMINS
// ========================================

router.post(
  "/subadmins",
  authMiddleware,
  adminMiddleware,
  createSubAdmin
);

router.get(
  "/subadmins",
  authMiddleware,
  adminMiddleware,
  getAllSubAdmins
);

router.put(
  "/subadmins/:id",
  authMiddleware,
  adminMiddleware,
  updateSubAdmin
);

router.delete(
  "/subadmins/:id",
  authMiddleware,
  adminMiddleware,
  deleteSubAdmin
);

// ========================================
// PAYMENT SUMMARY
// ======================================== 
router.get(
  "/payment-summary",
  authMiddleware,
  adminMiddleware,
  getPaymentSummary
);

// ========================================
// SALES REPORT
// ========================================
router.get(
  "/reports/sales",
  authMiddleware,
  adminMiddleware,
  getSalesReport
);

// ========================================
// COD, PREPAID, CANCEL REPORT
// ========================================
router.get(
  "/reports/cod-prepaid-cancel",
  authMiddleware,
  adminMiddleware,
  getCodPrepaidCancelReport
);

module.exports = router;