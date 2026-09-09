const express = require("express");

const {
  createCollection,
  addProductToCollection,
} = require("../controllers/collectionController");

const router = express.Router();

router.post("/", createCollection);

router.post(
  "/:collectionId/products/:productId",
  addProductToCollection
);

module.exports = router;