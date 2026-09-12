const express = require("express");

const {
  getMyAddresses,
  addAddress,
  updateAddress,
  deleteAddress,
  setDefaultAddress,
} = require("../controllers/addressController");

const authMiddleware = require("../middleware/authMiddleware");

const router = express.Router();

// ==========================================
// GET ALL MY ADDRESSES
// ==========================================

router.get(
  "/",
  authMiddleware,
  getMyAddresses
);

// ==========================================
// ADD ADDRESS
// ==========================================

router.post(
  "/",
  authMiddleware,
  addAddress
);

// ==========================================
// UPDATE ADDRESS
// ==========================================

router.put(
  "/:id",
  authMiddleware,
  updateAddress
);

// ==========================================
// DELETE ADDRESS
// ==========================================

router.delete(
  "/:id",
  authMiddleware,
  deleteAddress
);

// ==========================================
// SET DEFAULT ADDRESS
// ==========================================

router.patch(
  "/:id/default",
  authMiddleware,
  setDefaultAddress
);

module.exports = router;