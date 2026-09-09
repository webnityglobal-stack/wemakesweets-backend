const express = require("express");

const {
  fetchProducts,
  fetchProductsByCollection,
  fetchCollections,
} = require("../controllers/catalogController");

const router = express.Router();


// Fetch Products
router.get(
  "/products",
  fetchProducts
);


// Fetch Products By Collection
router.get(
  "/collection-products",
  fetchProductsByCollection
);


// Fetch Collections
router.get(
  "/collections",
  fetchCollections
);


module.exports = router;