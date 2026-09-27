const Collection = require("../models/Collection");
const Product = require("../models/product");
const generateShiprocketId = require("../utils/generateShiprocketId");

// =====================================================
// CREATE COLLECTION
// =====================================================

const createCollection = async (req, res) => {
  try {
    const {
      name,
      slug,
      description,
      image,
    } = req.body;

    // =================================================
    // CHECK REQUIRED FIELDS
    // =================================================

    if (!name || !slug) {
      return res.status(400).json({
        success: false,
        message: "Name and slug are required",
      });
    }

    // =================================================
    // CHECK DUPLICATE SLUG
    // =================================================

    const existingCollection =
      await Collection.findOne({
        slug: slug.trim().toLowerCase(),
      });

    if (existingCollection) {
      return res.status(400).json({
        success: false,
        message: "Collection already exists",
      });
    }

    // =================================================
    // GENERATE SHIPROCKET COLLECTION ID
    // =================================================

    const shiprocketId =
      await generateShiprocketId();

    console.log(
      "Generated Shiprocket Collection ID:",
      shiprocketId
    );

    // =================================================
    // CREATE COLLECTION
    // =================================================

    const collection =
      await Collection.create({
        shiprocketId,

        name: name.trim(),

        slug: slug.trim().toLowerCase(),

        description:
          description
            ? description.trim()
            : "",

        image: image || "",

        products: [],
      });

    // =================================================
    // RESPONSE
    // =================================================

    return res.status(201).json({
      success: true,
      message:
        "Collection created successfully",
      data: collection,
    });
  } catch (error) {
    console.error(
      "Create collection error:",
      error
    );

    // =================================================
    // DUPLICATE KEY ERROR
    // =================================================

    if (error.code === 11000) {
      if (
        error.keyPattern?.shiprocketId
      ) {
        return res.status(400).json({
          success: false,
          message:
            "Shiprocket Collection ID already exists. Please try again.",
        });
      }

      if (error.keyPattern?.slug) {
        return res.status(400).json({
          success: false,
          message:
            "Collection slug already exists.",
        });
      }

      return res.status(400).json({
        success: false,
        message:
          "Duplicate value found.",
      });
    }

    return res.status(500).json({
      success: false,
      message:
        "Unable to create collection",
      error: error.message,
    });
  }
};

// =====================================================
// ADD PRODUCT TO COLLECTION
// =====================================================

const addProductToCollection = async (
  req,
  res
) => {
  try {
    const {
      collectionId,
      productId,
    } = req.params;

    // =================================================
    // FIND COLLECTION
    // =================================================
    // collectionId can be:
    // 1. MongoDB ObjectId
    // 2. Shiprocket numeric ID
    // =================================================

    let collection = null;

    // Try MongoDB ObjectId first
    if (
      /^[0-9a-fA-F]{24}$/.test(
        collectionId
      )
    ) {
      collection =
        await Collection.findById(
          collectionId
        );
    }

    // If not found, try Shiprocket ID
    if (!collection) {
      collection =
        await Collection.findOne({
          shiprocketId:
            Number(collectionId),
        });
    }

    if (!collection) {
      return res.status(404).json({
        success: false,
        message:
          "Collection not found",
      });
    }

    // =================================================
    // FIND PRODUCT
    // =================================================

    let product = null;

    // Try MongoDB ObjectId
    if (
      /^[0-9a-fA-F]{24}$/.test(
        productId
      )
    ) {
      product =
        await Product.findById(
          productId
        );
    }

    // If not found, try Shiprocket ID
    if (!product) {
      product =
        await Product.findOne({
          shiprocketId:
            Number(productId),
        });
    }

    if (!product) {
      return res.status(404).json({
        success: false,
        message:
          "Product not found",
      });
    }

    // =================================================
    // ADD PRODUCT TO COLLECTION
    // =================================================

    if (
      !Array.isArray(
        collection.products
      )
    ) {
      collection.products = [];
    }

    const alreadyInCollection =
      collection.products.some(
        (id) =>
          String(id) ===
          String(product._id)
      );

    if (!alreadyInCollection) {
      collection.products.push(
        product._id
      );

      await collection.save();
    }

    // =================================================
    // ADD COLLECTION TO PRODUCT
    // =================================================

    if (
      !Array.isArray(
        product.collections
      )
    ) {
      product.collections = [];
    }

    const alreadyInProduct =
      product.collections.some(
        (id) =>
          String(id) ===
          String(collection._id)
      );

    if (!alreadyInProduct) {
      product.collections.push(
        collection._id
      );

      await product.save();
    }

    // =================================================
    // RESPONSE
    // =================================================

    return res.status(200).json({
      success: true,
      message:
        "Product added to collection successfully",

      data: {
        collectionId:
          collection.shiprocketId,

        collectionMongoId:
          collection._id,

        productId:
          product.shiprocketId,

        productMongoId:
          product._id,
      },
    });
  } catch (error) {
    console.error(
      "Add product to collection error:",
      error
    );

    return res.status(500).json({
      success: false,
      message:
        "Unable to add product to collection",
      error: error.message,
    });
  }
};

// =====================================================
// REMOVE PRODUCT FROM COLLECTION
// =====================================================

const removeProductFromCollection =
  async (req, res) => {
    try {
      const {
        collectionId,
        productId,
      } = req.params;

      // =================================================
      // FIND COLLECTION
      // =================================================

      let collection = null;

      // MongoDB ObjectId
      if (
        /^[0-9a-fA-F]{24}$/.test(
          collectionId
        )
      ) {
        collection =
          await Collection.findById(
            collectionId
          );
      }

      // Shiprocket numeric ID
      if (!collection) {
        collection =
          await Collection.findOne({
            shiprocketId:
              Number(collectionId),
          });
      }

      if (!collection) {
        return res.status(404).json({
          success: false,
          message:
            "Collection not found",
        });
      }

      // =================================================
      // FIND PRODUCT
      // =================================================

      let product = null;

      // MongoDB ObjectId
      if (
        /^[0-9a-fA-F]{24}$/.test(
          productId
        )
      ) {
        product =
          await Product.findById(
            productId
          );
      }

      // Shiprocket numeric ID
      if (!product) {
        product =
          await Product.findOne({
            shiprocketId:
              Number(productId),
          });
      }

      if (!product) {
        return res.status(404).json({
          success: false,
          message:
            "Product not found",
        });
      }

      // =================================================
      // REMOVE PRODUCT FROM COLLECTION
      // =================================================

      collection.products =
        collection.products.filter(
          (id) =>
            String(id) !==
            String(product._id)
        );

      await collection.save();

      // =================================================
      // REMOVE COLLECTION FROM PRODUCT
      // =================================================

      product.collections =
        product.collections.filter(
          (id) =>
            String(id) !==
            String(collection._id)
        );

      await product.save();

      // =================================================
      // RESPONSE
      // =================================================

      return res.status(200).json({
        success: true,
        message:
          "Product removed from collection successfully",

        data: {
          collectionId:
            collection.shiprocketId,

          collectionMongoId:
            collection._id,

          productId:
            product.shiprocketId,

          productMongoId:
            product._id,
        },
      });
    } catch (error) {
      console.error(
        "Remove product from collection error:",
        error
      );

      return res.status(500).json({
        success: false,
        message:
          "Unable to remove product from collection",
        error: error.message,
      });
    }
  };

// =====================================================
// EXPORT
// =====================================================

module.exports = {
  createCollection,
  addProductToCollection,
  removeProductFromCollection,
};