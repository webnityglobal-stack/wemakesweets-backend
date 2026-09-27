const express = require("express");
const adminMiddleware = require("../middleware/adminMiddleware");

const {
  uploadHeroImage:uploadHeroImageController,
  getHeroImages,
  deleteHeroImage,
} = require("../controllers/heroBannerController");

const authMiddleware = require("../middleware/authMiddleware");

const {
  uploadHeroImage: uploadHeroImageMiddleware,
} = require("../middleware/uploadMiddleware");

const router = express.Router();


// ==========================================
// PUBLIC
// ==========================================

router.get(
  "/",
  getHeroImages
);


// ==========================================
// ADMIN
// ==========================================

router.post(
  "/upload",
  authMiddleware,
  adminMiddleware,
    uploadHeroImageMiddleware.single("image"),
  uploadHeroImageController
);


router.delete(
  "/:slot",
  authMiddleware,
  adminMiddleware,
  deleteHeroImage
);


module.exports = router;