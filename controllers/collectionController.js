const Collection = require("../models/Collection");
const Product = require("../models/product");

// CREATE COLLECTION
const createCollection = async (req, res) => {
  try {
    const { name, slug, description, image } = req.body;

    if (!name || !slug) {
      return res.status(400).json({
        success: false,
        message: "Name and slug are required",
      });
    }

    const existingCollection = await Collection.findOne({ slug });

    if (existingCollection) {
      return res.status(400).json({
        success: false,
        message: "Collection already exists",
      });
    }

    const collection = await Collection.create({
      name,
      slug,
      description: description || "",
      image: image || "",
      products: [],
    });

    res.status(201).json({
      success: true,
      message: "Collection created successfully",
      data: collection,
    });
  } catch (error) {
    console.error("Create collection error:", error);

    res.status(500).json({
      success: false,
      message: "Unable to create collection",
      error: error.message,
    });
  }
};

// ADD PRODUCT TO COLLECTION
const addProductToCollection = async (req, res) => {
  try {
    const { collectionId, productId } = req.params;

    const collection = await Collection.findById(collectionId);
    const product = await Product.findById(productId);

    if (!collection) {
      return res.status(404).json({
        success: false,
        message: "Collection not found",
      });
    }

    if (!product) {
      return res.status(404).json({
        success: false,
        message: "Product not found",
      });
    }

    if (!collection.products.includes(product._id)) {
      collection.products.push(product._id);
      await collection.save();
    }

    res.status(200).json({
      success: true,
      message: "Product added to collection successfully",
      data: collection,
    });
  } catch (error) {
    console.error("Add product to collection error:", error);

    res.status(500).json({
      success: false,
      message: "Unable to add product to collection",
      error: error.message,
    });
  }
};

module.exports = {
  createCollection,
  addProductToCollection,
};