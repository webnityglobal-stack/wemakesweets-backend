const express = require("express");

const router = express.Router();

const {
  addProduct,
  getProductById,
  updateProduct,
  deleteProduct,
  deleteProductImage,
  getAllProducts,
} = require("../controllers/productController");

const {uploadProductImage} = require("../middleware/uploadMiddleware");

const authMiddleware = require("../middleware/authMiddleware");
const adminMiddleware = require("../middleware/adminMiddleware");

//get single product by id 
router.get("/:id", getProductById);

// Get all products
router.get(
  "/",
  getAllProducts
);

// Add product with multiple images
router.post(
  "/",
  authMiddleware,
  adminMiddleware,
  uploadProductImage.array("images", 10),
  addProduct
);

// Update product
router.put(
  "/:id",
  authMiddleware,
  adminMiddleware,
  uploadProductImage.array("images", 10),
  updateProduct
);

// Delete product image
router.delete(
  "/:id/image",
  authMiddleware,
  adminMiddleware,
  deleteProductImage
);

// Delete product
router.delete(
  "/:id",
  authMiddleware,
  adminMiddleware,
  deleteProduct
);


module.exports = router;