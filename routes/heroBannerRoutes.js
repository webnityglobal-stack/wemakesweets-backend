const express = require("express");

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
    uploadHeroImageMiddleware.single("image"),
  uploadHeroImageController
);


router.delete(
  "/:slot",
  authMiddleware,
  deleteHeroImage
);


module.exports = router;