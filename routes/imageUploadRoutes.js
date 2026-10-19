
const express = require("express");
const router = express.Router();

const {
  uploadSingleImage,
  deleteImage,
} = require("../controllers/imageUploadController");

// Upload one image
router.post("/", uploadSingleImage);

// Delete an uploaded image by filename
router.delete("/:filename", deleteImage);

module.exports = router;
