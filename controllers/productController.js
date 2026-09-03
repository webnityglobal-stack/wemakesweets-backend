const Product = require("../models/product");
const fs = require("fs");
const path = require("path");

// GET PRODUCT BY ID
const getProductById = async (req, res) => {
  try {
    const { id } = req.params;

    const product = await Product.findById(id);

    if (!product) {
      return res.status(404).json({
        success: false,
        message: "Product not found",
      });
    }

    return res.status(200).json({
      success: true,
      message: "Product fetched successfully",
      product,
    });
  } catch (error) {
    console.error("Get product by ID error:", error);

    // Invalid MongoDB ObjectId
    if (error.name === "CastError") {
      return res.status(400).json({
        success: false,
        message: "Invalid product ID",
      });
    }

    return res.status(500).json({
      success: false,
      message: "Server error",
      error: error.message,
    });
  }
};

//Get all products

const getAllProducts = async (req, res) => {
  try {
    const products = await Product.find().sort({
      createdAt: -1,
    });

    res.status(200).json({
      success: true,
      count: products.length,
      products,
    });
  } catch (error) {
    console.error("Get Products Error:", error);

    res.status(500).json({
      success: false,
      message: "Failed to fetch products",
    });
  }
};

//Add Product

const addProduct = async (req, res) => {
  try {

    const {
      slug,
      name,
      shortDescription,
      description,
      salePrice,
      mrp,
      rating,
      stock,
      isBestSeller,
      highlights,
      ingredients,
      nutrition,
      weight,
      shelfLife,
      storage,
      countryOfOrigin,
      variants,
      coupons,
    } = req.body;


    // Check required fields
    if (
      !slug ||
      !name ||
      !shortDescription ||
      !description ||
      salePrice === undefined ||
      mrp === undefined ||
      stock === undefined ||
      !weight ||
      !shelfLife ||
      !storage
    ) {
      return res.status(400).json({
        success: false,
        message: "Please fill all required fields",
      });
    }


    // Check duplicate slug
    const existingProduct =
      await Product.findOne({ slug });

    if (existingProduct) {
      return res.status(400).json({
        success: false,
        message: "Product already exists",
      });
    }


    // Get uploaded images
    const images =
      req.files?.map(
        (file) =>
          `/uploads/products/${file.filename}`
      ) || [];


    // Create product
    const product = await Product.create({

      slug,

      name,

      shortDescription,

      description,

      salePrice: Number(salePrice),

      mrp: Number(mrp),

      rating: rating
        ? Number(rating)
        : 0,

      stock: Number(stock),

      isBestSeller:
        isBestSeller === "true" ||
        isBestSeller === true,

      images,

      highlights: highlights
        ? JSON.parse(highlights)
        : [],

      ingredients: ingredients
        ? JSON.parse(ingredients)
        : [],

      nutrition: nutrition
        ? JSON.parse(nutrition)
        : {},

      weight,

      shelfLife,

      storage,

      countryOfOrigin:
        countryOfOrigin || "India",

      variants: variants
        ? JSON.parse(variants)
        : [],

      coupons: coupons
        ? JSON.parse(coupons)
        : [],
    });


    res.status(201).json({
      success: true,
      message: "Product added successfully",
      product,
    });

  } catch (error) {

    console.error(
      "Add Product Error:",
      error
    );

    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

//update Product

const updateProduct = async (req, res) => {
  try {
    const { id } = req.params;

    const product = await Product.findById(id);

    if (!product) {
      return res.status(404).json({
        success: false,
        message: "Product not found",
      });
    }

    const {
      slug,
      name,
      shortDescription,
      description,
      salePrice,
      mrp,
      rating,
      stock,
      isBestSeller,
      highlights,
      ingredients,
      nutrition,
      weight,
      shelfLife,
      storage,
      countryOfOrigin,
      variants,
      coupons,
    } = req.body;

    // Check duplicate slug
    if (slug && slug !== product.slug) {
      const existingProduct = await Product.findOne({
        slug,
        _id: { $ne: id },
      });

      if (existingProduct) {
        return res.status(400).json({
          success: false,
          message: "Another product already uses this slug",
        });
      }
    }

    // Update only fields that are provided
    if (slug !== undefined) product.slug = slug;
    if (name !== undefined) product.name = name;

    if (shortDescription !== undefined) {
      product.shortDescription = shortDescription;
    }

    if (description !== undefined) {
      product.description = description;
    }

    if (salePrice !== undefined) {
      product.salePrice = Number(salePrice);
    }

    if (mrp !== undefined) {
      product.mrp = Number(mrp);
    }

    if (rating !== undefined) {
      product.rating = Number(rating);
    }

    if (stock !== undefined) {
      product.stock = Number(stock);
    }

    if (isBestSeller !== undefined) {
      product.isBestSeller =
        isBestSeller === "true" ||
        isBestSeller === true;
    }

    if (weight !== undefined) {
      product.weight = weight;
    }

    if (shelfLife !== undefined) {
      product.shelfLife = shelfLife;
    }

    if (storage !== undefined) {
      product.storage = storage;
    }

    if (countryOfOrigin !== undefined) {
      product.countryOfOrigin = countryOfOrigin;
    }

    // Arrays sent through FormData
    if (highlights !== undefined) {
      product.highlights = JSON.parse(highlights);
    }

    if (ingredients !== undefined) {
      product.ingredients = JSON.parse(ingredients);
    }

    if (nutrition !== undefined) {
      product.nutrition = JSON.parse(nutrition);
    }

    if (variants !== undefined) {
      product.variants = JSON.parse(variants);
    }

    if (coupons !== undefined) {
      product.coupons = JSON.parse(coupons);
    }

    // =========================
    // UPDATE IMAGES
    // =========================

    if (req.files && req.files.length > 0) {
      const newImages = req.files.map(
        (file) =>
          `/uploads/products/${file.filename}`
      );

      product.images = [
        ...product.images,
        ...newImages,
      ];
    }

    await product.save();

    res.status(200).json({
      success: true,
      message: "Product updated successfully",
      product,
    });

  } catch (error) {
    console.error("Update Product Error:", error);

    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

// Delete Product

const deleteProduct = async (req, res) => {
  try {
    const { id } = req.params;

    // Find product
    const product = await Product.findById(id);

    if (!product) {
      return res.status(404).json({
        success: false,
        message: "Product not found",
      });
    }

    // Delete all product images from server
    if (product.images && product.images.length > 0) {
      product.images.forEach((image) => {
        const imagePath = path.join(
          __dirname,
          "..",
          image
        );

        if (fs.existsSync(imagePath)) {
          fs.unlinkSync(imagePath);
        }
      });
    }

    // Delete product from MongoDB
    await Product.findByIdAndDelete(id);

    res.status(200).json({
      success: true,
      message: "Product deleted successfully",
    });

  } catch (error) {
    console.error("Delete Product Error:", error);

    res.status(500).json({
      success: false,
      message: "Failed to delete product",
    });
  }
};

//delete Product Image

const deleteProductImage = async (req, res) => {
  try {
    const { id } = req.params;
    const { image } = req.body;

    if (!image) {
      return res.status(400).json({
        success: false,
        message: "Image path is required",
      });
    }

    // Find product
    const product = await Product.findById(id);

    if (!product) {
      return res.status(404).json({
        success: false,
        message: "Product not found",
      });
    }

    // Check whether image exists in product
    if (!product.images.includes(image)) {
      return res.status(404).json({
        success: false,
        message: "Image not found in this product",
      });
    }

    // Remove image from MongoDB
    product.images = product.images.filter(
      (img) => img !== image
    );

    await product.save();

    // Remove actual image from uploads folder
    const imagePath = path.join(
      __dirname,
      "..",
      image
    );

    if (fs.existsSync(imagePath)) {
      fs.unlinkSync(imagePath);
    }

    res.status(200).json({
      success: true,
      message: "Product image deleted successfully",
      images: product.images,
    });

  } catch (error) {
    console.error("Delete Product Image Error:", error);

    res.status(500).json({
      success: false,
      message: "Failed to delete product image",
    });
  }
};

module.exports = {
  getProductById,
  getAllProducts,
  addProduct,
  updateProduct,
  deleteProduct,
  deleteProductImage,
};