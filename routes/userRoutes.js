const express = require("express");

const {
  getAllUsers,
  getMyProfile,
  updateMyProfile,
  getDashboard,
    getAccount,
} = require("../controllers/userController");

const authMiddleware = require("../middleware/authMiddleware");
const adminMiddleware = require("../middleware/adminMiddleware");

const router = express.Router();

// ==========================================
// CUSTOMER - DASHBOARD
// ==========================================

router.get(
  "/dashboard",
  authMiddleware,
  getDashboard
);

// ==========================================
// CUSTOMER - MY PROFILE
// ==========================================

router.get(
  "/profile",
  authMiddleware,
  getMyProfile
);


//=========================================
// GET ACCOUNT DETAILS
//  =========================================
router.get(
  "/account",
  authMiddleware,
  getAccount
);


// ==========================================
// CUSTOMER - UPDATE PROFILE
// ==========================================

router.put(
  "/profile",
  authMiddleware,
  updateMyProfile
);

// ==========================================
// ADMIN - GET ALL USERS
// ==========================================

router.get(
  "/all",
  authMiddleware,
  adminMiddleware,
  getAllUsers
);

module.exports = router;