const express = require("express");

const router = express.Router();

const {
  uploadReel,
  getReels,
  deleteReel,
} = require("../controllers/reelController");

const {
  uploadReel: reelUpload,
} = require("../middleware/uploadMiddleware");

const authMiddleware = require("../middleware/authMiddleware");
const adminMiddleware = require("../middleware/adminMiddleware");

// =====================================================
// GET ALL REELS
// GET /api/reels
// =====================================================

router.get(
  "/",
  getReels
);

// =====================================================
// UPLOAD REELS
// POST /api/reels/upload
// =====================================================

router.post(
  "/upload",
  authMiddleware,
  adminMiddleware,
  reelUpload.array("reels", 12),
  uploadReel
);

// =====================================================
// DELETE REEL
// DELETE /api/reels/:filename
// =====================================================

router.delete(
  "/:filename",
  authMiddleware,
  adminMiddleware,
  deleteReel
);

module.exports = router;