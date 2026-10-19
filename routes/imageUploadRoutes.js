
const express = require("express");
const router = express.Router();

const {
  uploadSingleImage,
  deleteImage,
    getAllImages,
  getImageByFilename,
} = require("../controllers/imageUploadController");

// Get all uploaded images
router.get("/", getAllImages);

// Get one image by filename
router.get("/:filename", getImageByFilename);

// Upload one image
router.post("/", uploadSingleImage);

// Delete an uploaded image by filename
router.delete("/:filename", deleteImage);

module.exports = router;
