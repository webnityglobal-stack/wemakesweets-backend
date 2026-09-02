const express = require("express");
const uploadMiddleware = require("../middleware/uploadMiddleware");

const router = express.Router();

const { uploadReel } = require("../controllers/reelController");

const {
  uploadReel: reelUpload,
} = require("../middleware/uploadMiddleware");

const authMiddleware = require("../middleware/authMiddleware");
const adminMiddleware = require("../middleware/adminMiddleware");

// Upload reels
router.post(
  "/upload",
  authMiddleware,
  adminMiddleware,
  reelUpload.array("reels", 5),
  uploadReel,
);


module.exports = router;