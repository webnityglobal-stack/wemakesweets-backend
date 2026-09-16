const Collection = require("../models/Collection");
const Product = require("../models/product");

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

    if (!name || !slug) {
      return res.status(400).json({
        success: false,
        message: "Name and slug are required",
      });
    }

    const existingCollection =
      await Collection.findOne({ slug });

    if (existingCollection) {
      return res.status(400).json({
        success: false,
        message: "Collection already exists",
      });
    }

    const collection =
      await Collection.create({
        name: name.trim(),
        slug: slug.trim(),
        description:
          description || "",
        image: image || "",
        products: [],
      });

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

    // ==============================================
    // FIND COLLECTION
    // ==============================================

    const collection =
      await Collection.findById(
        collectionId
      );

    if (!collection) {
      return res.status(404).json({
        success: false,
        message:
          "Collection not found",
      });
    }

    // ==============================================
    // FIND PRODUCT
    // ==============================================

    const product =
      await Product.findById(
        productId
      );

    if (!product) {
      return res.status(404).json({
        success: false,
        message:
          "Product not found",
      });
    }

    // ==============================================
    // ADD PRODUCT TO COLLECTION
    // ==============================================

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

    // ==============================================
    // ADD COLLECTION TO PRODUCT
    // ==============================================

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

    // ==============================================
    // RESPONSE
    // ==============================================

    return res.status(200).json({
      success: true,
      message:
        "Product added to collection successfully",
      data: collection,
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

      const collection =
        await Collection.findById(
          collectionId
        );

      if (!collection) {
        return res.status(404).json({
          success: false,
          message:
            "Collection not found",
        });
      }

      const product =
        await Product.findById(
          productId
        );

      if (!product) {
        return res.status(404).json({
          success: false,
          message:
            "Product not found",
        });
      }

      // Remove product from collection
      collection.products =
        collection.products.filter(
          (id) =>
            String(id) !==
            String(product._id)
        );

      await collection.save();

      // Remove collection from product
      product.collections =
        product.collections.filter(
          (id) =>
            String(id) !==
            String(collection._id)
        );

      await product.save();

      return res.status(200).json({
        success: true,
        message:
          "Product removed from collection successfully",
        data: collection,
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