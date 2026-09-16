const Product = require("../models/product");
const Collection = require("../models/Collection");
const generateShiprocketId = require("../utils/generateShiprocketId");
const fs = require("fs");
const path = require("path");

// =====================================================
// NORMALIZE VARIANTS
// =====================================================

const normalizeVariants = (variants) => {
  if (!Array.isArray(variants)) {
    return [];
  }

  return variants.map((variant) => ({
    ...variant,

    shiprocketId:
      Number(variant.shiprocketId),

    title:
      variant.title || "",

    weight:
      Number(variant.weight),

    salePrice:
      Number(variant.salePrice),

    mrp:
      Number(variant.mrp),

    stock:
      Number(variant.stock ?? 0),

    sku:
      variant.sku || "",
  }));
};

// =====================================================
// GET PRODUCT BY ID
// =====================================================

const getProductById = async (req, res) => {
  try {
    const { id } = req.params;

    const product =
      await Product.findById(id);

    if (!product) {
      return res.status(404).json({
        success: false,
        message:
          "Product not found",
      });
    }

    return res.status(200).json({
      success: true,
      message:
        "Product fetched successfully",
      product,
    });
  } catch (error) {
    console.error(
      "Get product by ID error:",
      error
    );

    if (error.name === "CastError") {
      return res.status(400).json({
        success: false,
        message:
          "Invalid product ID",
      });
    }

    return res.status(500).json({
      success: false,
      message:
        "Server error",
      error:
        error.message,
    });
  }
};

// =====================================================
// GET ALL PRODUCTS
// =====================================================

const getAllProducts = async (
  req,
  res
) => {
  try {
    const products =
      await Product.find().sort({
        createdAt: -1,
      });

    return res.status(200).json({
      success: true,
      count:
        products.length,
      products,
    });
  } catch (error) {
    console.error(
      "Get Products Error:",
      error
    );

    return res.status(500).json({
      success: false,
      message:
        "Failed to fetch products",
    });
  }
};

// =====================================================
// ADD PRODUCT
// =====================================================

const addProduct = async (
  req,
  res
) => {
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

    // =================================================
    // CHECK REQUIRED FIELDS
    // =================================================

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
        message:
          "Please fill all required fields",
      });
    }

    // =================================================
    // CHECK DUPLICATE SLUG
    // =================================================

    const existingProduct =
      await Product.findOne({
        slug,
      });

    if (existingProduct) {
      return res.status(400).json({
        success: false,
        message:
          "Product already exists",
      });
    }

    // =================================================
    // GENERATE UNIQUE SHIPROCKET ID
    // =================================================

    const shiprocketId =
      await generateShiprocketId();

    console.log(
      "Generated Shiprocket Product ID:",
      shiprocketId
    );

    // =================================================
    // PRODUCT IMAGES
    // =================================================

    const images =
      req.files?.map(
        (file) =>
          `/uploads/products/images/${file.filename}`
      ) || [];

    // =================================================
    // PARSE JSON FIELDS
    // =================================================

    let parsedIngredients = [];
    let parsedNutrition = {};
    let parsedVariants = [];
    let parsedCoupons = [];

    try {
      if (ingredients !== undefined) {
        parsedIngredients =
          JSON.parse(ingredients);
      }

      if (nutrition !== undefined) {
        parsedNutrition =
          JSON.parse(nutrition);
      }

      if (variants !== undefined) {
        parsedVariants =
          JSON.parse(variants);
      }

      if (coupons !== undefined) {
        parsedCoupons =
          JSON.parse(coupons);
      }
    } catch (parseError) {
      console.error(
        "JSON Parse Error:",
        parseError
      );

      return res.status(400).json({
        success: false,
        message:
          "Invalid JSON format in ingredients, nutrition, variants or coupons",
      });
    }

    // =================================================
    // NORMALIZE VARIANTS
    // =================================================

    const normalizedVariants =
      normalizeVariants(
        parsedVariants
      );

    // =================================================
    // CREATE PRODUCT DATA
    // =================================================

    const productData = {
      shiprocketId,

      slug,

      name,

      shortDescription,

      description,

      salePrice:
        Number(salePrice),

      mrp:
        Number(mrp),

      rating:
        rating !== undefined &&
        rating !== ""
          ? Number(rating)
          : 0,

      stock:
        Number(stock),

      isBestSeller:
        isBestSeller === "true" ||
        isBestSeller === true,

      images,

      ingredients:
        parsedIngredients,

      nutrition:
        parsedNutrition,

      weight,

      shelfLife,

      storage,

      countryOfOrigin:
        countryOfOrigin ||
        "India",

      variants:
        normalizedVariants,

      coupons:
        parsedCoupons,
    };

    // =================================================
    // HIGHLIGHTS
    // =================================================

    if (
      highlights !== undefined &&
      highlights !== ""
    ) {
      try {
        productData.highlights =
          JSON.parse(
            highlights
          );
      } catch (error) {
        return res.status(400).json({
          success: false,
          message:
            "Invalid highlights JSON format",
        });
      }
    }

    // =================================================
    // CREATE PRODUCT
    // =================================================

    const product =
      await Product.create(
        productData
      );

    console.log(
      "Product created:",
      product._id
    );

    // =================================================
    // AUTOMATICALLY ADD PRODUCT TO SWEETS
    // =================================================

    const sweetsCollection =
      await Collection.findOne({
        slug: "sweets",
      });

    console.log(
      "Sweets Collection:",
      sweetsCollection
        ? sweetsCollection._id
        : "NOT FOUND"
    );

    if (!sweetsCollection) {
      console.error(
        "Sweets collection not found. Product created without collection."
      );
    } else {
      // -----------------------------------------------
      // ADD PRODUCT TO COLLECTION
      // -----------------------------------------------

      if (
        !Array.isArray(
          sweetsCollection.products
        )
      ) {
        sweetsCollection.products =
          [];
      }

      const productExistsInCollection =
        sweetsCollection.products.some(
          (productId) =>
            String(productId) ===
            String(product._id)
        );

      if (
        !productExistsInCollection
      ) {
        sweetsCollection.products.push(
          product._id
        );

        await sweetsCollection.save();

        console.log(
          "Product added to Sweets collection:",
          product._id
        );
      }

      // -----------------------------------------------
      // ADD COLLECTION TO PRODUCT
      // -----------------------------------------------

      if (
        !Array.isArray(
          product.collections
        )
      ) {
        product.collections =
          [];
      }

      const collectionExistsInProduct =
        product.collections.some(
          (collectionId) =>
            String(collectionId) ===
            String(
              sweetsCollection._id
            )
        );

      if (
        !collectionExistsInProduct
      ) {
        product.collections.push(
          sweetsCollection._id
        );

        await product.save();

        console.log(
          "Sweets collection added to product:",
          product._id
        );
      }
    }

    // =================================================
    // RE-FETCH PRODUCT
    // =================================================

    const finalProduct =
      await Product.findById(
        product._id
      );

    console.log(
      "Final Product Collections:",
      finalProduct.collections
    );

    return res.status(201).json({
      success: true,
      message:
        "Product added successfully",
      product:
        finalProduct,
    });
  } catch (error) {
    console.error(
      "Add Product Error:",
      error
    );

    // =================================================
    // DUPLICATE KEY ERROR
    // =================================================

    if (error.code === 11000) {
      if (
        error.keyPattern
          ?.shiprocketId
      ) {
        return res.status(400).json({
          success: false,
          message:
            "Shiprocket ID already exists. Please try again.",
        });
      }

      if (
        error.keyPattern?.slug
      ) {
        return res.status(400).json({
          success: false,
          message:
            "Slug already exists. Please use a unique slug.",
        });
      }

      return res.status(400).json({
        success: false,
        message:
          "Duplicate value found. Please use unique data.",
      });
    }

    // =================================================
    // MONGOOSE VALIDATION ERROR
    // =================================================

    if (
      error.name ===
      "ValidationError"
    ) {
      return res.status(400).json({
        success: false,
        message:
          error.message,
      });
    }

    return res.status(500).json({
      success: false,
      message:
        error.message,
    });
  }
};

// =====================================================
// UPDATE PRODUCT
// =====================================================

const updateProduct = async (
  req,
  res
) => {
  try {
    const { id } =
      req.params;

    // =================================================
    // FIND PRODUCT
    // =================================================

    const product =
      await Product.findById(id);

    if (!product) {
      return res.status(404).json({
        success: false,
        message:
          "Product not found",
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

    // =================================================
    // CHECK DUPLICATE SLUG
    // =================================================

    if (
      slug &&
      slug !== product.slug
    ) {
      const existingProduct =
        await Product.findOne({
          slug,
          _id: {
            $ne: id,
          },
        });

      if (existingProduct) {
        return res.status(400).json({
          success: false,
          message:
            "Another product already uses this slug",
        });
      }
    }

    // =================================================
    // UPDATE BASIC FIELDS
    // =================================================

    if (slug !== undefined) {
      product.slug =
        slug;
    }

    if (name !== undefined) {
      product.name =
        name;
    }

    if (
      shortDescription !==
      undefined
    ) {
      product.shortDescription =
        shortDescription;
    }

    if (
      description !==
      undefined
    ) {
      product.description =
        description;
    }

    if (
      salePrice !==
      undefined
    ) {
      product.salePrice =
        Number(salePrice);
    }

    if (mrp !== undefined) {
      product.mrp =
        Number(mrp);
    }

    if (
      rating !==
      undefined
    ) {
      product.rating =
        Number(rating);
    }

    if (
      stock !==
      undefined
    ) {
      product.stock =
        Number(stock);
    }

    if (
      isBestSeller !==
      undefined
    ) {
      product.isBestSeller =
        isBestSeller ===
          "true" ||
        isBestSeller === true;
    }

    if (
      weight !==
      undefined
    ) {
      product.weight =
        weight;
    }

    if (
      shelfLife !==
      undefined
    ) {
      product.shelfLife =
        shelfLife;
    }

    if (
      storage !==
      undefined
    ) {
      product.storage =
        storage;
    }

    if (
      countryOfOrigin !==
      undefined
    ) {
      product.countryOfOrigin =
        countryOfOrigin;
    }

    // =================================================
    // UPDATE HIGHLIGHTS
    // =================================================

    try {
      if (
        highlights !==
          undefined &&
        highlights !== ""
      ) {
        product.highlights =
          JSON.parse(
            highlights
          );
      }
    } catch (error) {
      return res.status(400).json({
        success: false,
        message:
          "Invalid highlights JSON format",
      });
    }

    // =================================================
    // UPDATE INGREDIENTS
    // =================================================

    try {
      if (
        ingredients !==
        undefined
      ) {
        product.ingredients =
          JSON.parse(
            ingredients
          );
      }
    } catch (error) {
      return res.status(400).json({
        success: false,
        message:
          "Invalid ingredients JSON format",
      });
    }

    // =================================================
    // UPDATE NUTRITION
    // =================================================

    try {
      if (
        nutrition !==
        undefined
      ) {
        product.nutrition =
          JSON.parse(
            nutrition
          );
      }
    } catch (error) {
      return res.status(400).json({
        success: false,
        message:
          "Invalid nutrition JSON format",
      });
    }

    // =================================================
    // UPDATE VARIANTS
    // =================================================

    try {
      if (
        variants !==
        undefined
      ) {
        const parsedVariants =
          JSON.parse(
            variants
          );

        product.variants =
          normalizeVariants(
            parsedVariants
          );
      }
    } catch (error) {
      return res.status(400).json({
        success: false,
        message:
          "Invalid variants JSON format",
      });
    }

    // =================================================
    // UPDATE COUPONS
    // =================================================

    try {
      if (
        coupons !==
        undefined
      ) {
        product.coupons =
          JSON.parse(
            coupons
          );
      }
    } catch (error) {
      return res.status(400).json({
        success: false,
        message:
          "Invalid coupons JSON format",
      });
    }

    // =================================================
    // ADD MULTIPLE NEW IMAGES
    // =================================================

    if (
      req.files &&
      req.files.length > 0
    ) {
      const newImages =
        req.files.map(
          (file) =>
            `${req.protocol}://${req.get(
              "host"
            )}/uploads/products/images/${file.filename}`
        );

      product.images = [
        ...(product.images ||
          []),
        ...newImages,
      ];
    }

    // =================================================
    // ENSURE PRODUCT IS IN SWEETS COLLECTION
    // =================================================

    const sweetsCollection =
      await Collection.findOne({
        slug: "sweets",
      });

    if (sweetsCollection) {
      // -----------------------------------------------
      // Product → Sweets
      // -----------------------------------------------

      if (
        !Array.isArray(
          product.collections
        )
      ) {
        product.collections =
          [];
      }

      const collectionExists =
        product.collections.some(
          (collectionId) =>
            String(collectionId) ===
            String(
              sweetsCollection._id
            )
        );

      if (!collectionExists) {
        product.collections.push(
          sweetsCollection._id
        );
      }

      // -----------------------------------------------
      // Sweets → Product
      // -----------------------------------------------

      if (
        !Array.isArray(
          sweetsCollection.products
        )
      ) {
        sweetsCollection.products =
          [];
      }

      const productExists =
        sweetsCollection.products.some(
          (productId) =>
            String(productId) ===
            String(product._id)
        );

      if (!productExists) {
        sweetsCollection.products.push(
          product._id
        );

        await sweetsCollection.save();
      }
    } else {
      console.error(
        "Sweets collection not found during product update."
      );
    }

    // =================================================
    // SAVE PRODUCT
    // =================================================

    await product.save();

    // =================================================
    // RE-FETCH UPDATED PRODUCT
    // =================================================

    const updatedProduct =
      await Product.findById(
        product._id
      );

    return res.status(200).json({
      success: true,
      message:
        "Product updated successfully",
      product:
        updatedProduct,
    });
  } catch (error) {
    console.error(
      "Update Product Error:",
      error
    );

    // =================================================
    // DUPLICATE KEY ERROR
    // =================================================

    if (error.code === 11000) {
      if (
        error.keyPattern
          ?.shiprocketId
      ) {
        return res.status(400).json({
          success: false,
          message:
            "Shiprocket ID already exists.",
        });
      }

      if (
        error.keyPattern?.slug
      ) {
        return res.status(400).json({
          success: false,
          message:
            "Slug already exists. Please use a unique slug.",
        });
      }

      return res.status(400).json({
        success: false,
        message:
          "Duplicate value found. Please use unique data.",
      });
    }

    // =================================================
    // VALIDATION ERROR
    // =================================================

    if (
      error.name ===
      "ValidationError"
    ) {
      return res.status(400).json({
        success: false,
        message:
          error.message,
      });
    }

    return res.status(500).json({
      success: false,
      message:
        error.message,
    });
  }
};

// =====================================================
// DELETE PRODUCT
// =====================================================

const deleteProduct = async (
  req,
  res
) => {
  try {
    const { id } =
      req.params;

    // =================================================
    // FIND PRODUCT
    // =================================================

    const product =
      await Product.findById(id);

    if (!product) {
      return res.status(404).json({
        success: false,
        message:
          "Product not found",
      });
    }

    // =================================================
    // REMOVE PRODUCT FROM ALL COLLECTIONS
    // =================================================

    await Collection.updateMany(
      {
        products:
          product._id,
      },
      {
        $pull: {
          products:
            product._id,
        },
      }
    );

    // =================================================
    // DELETE ALL PRODUCT IMAGES
    // =================================================

    if (
      product.images &&
      product.images.length > 0
    ) {
      product.images.forEach(
        (image) => {
          const imagePath =
            path.join(
              __dirname,
              "..",
              image
            );

          if (
            fs.existsSync(
              imagePath
            )
          ) {
            fs.unlinkSync(
              imagePath
            );
          }
        }
      );
    }

    // =================================================
    // DELETE PRODUCT
    // =================================================

    await Product.findByIdAndDelete(
      id
    );

    return res.status(200).json({
      success: true,
      message:
        "Product deleted successfully",
    });
  } catch (error) {
    console.error(
      "Delete Product Error:",
      error
    );

    return res.status(500).json({
      success: false,
      message:
        "Failed to delete product",
    });
  }
};

// =====================================================
// DELETE PRODUCT IMAGE
// =====================================================

const deleteProductImage = async (
  req,
  res
) => {
  try {
    const { id } =
      req.params;

    const { image } =
      req.body;

    // =================================================
    // CHECK IMAGE
    // =================================================

    if (!image) {
      return res.status(400).json({
        success: false,
        message:
          "Image path is required",
      });
    }

    // =================================================
    // FIND PRODUCT
    // =================================================

    const product =
      await Product.findById(id);

    if (!product) {
      return res.status(404).json({
        success: false,
        message:
          "Product not found",
      });
    }

    // =================================================
    // CHECK IMAGE EXISTS
    // =================================================

    if (
      !product.images.includes(
        image
      )
    ) {
      return res.status(404).json({
        success: false,
        message:
          "Image not found in this product",
      });
    }

    // =================================================
    // REMOVE IMAGE FROM MONGODB
    // =================================================

    product.images =
      product.images.filter(
        (img) =>
          img !== image
      );

    await product.save();

    // =================================================
    // REMOVE IMAGE FROM UPLOADS FOLDER
    // =================================================

    const imagePath =
      path.join(
        __dirname,
        "..",
        image
      );

    if (
      fs.existsSync(
        imagePath
      )
    ) {
      fs.unlinkSync(
        imagePath
      );
    }

    return res.status(200).json({
      success: true,
      message:
        "Product image deleted successfully",
      images:
        product.images,
    });
  } catch (error) {
    console.error(
      "Delete Product Image Error:",
      error
    );

    return res.status(500).json({
      success: false,
      message:
        "Failed to delete product image",
    });
  }
};

// =====================================================
// EXPORT CONTROLLERS
// =====================================================

module.exports = {
  getProductById,
  getAllProducts,
  addProduct,
  updateProduct,
  deleteProduct,
  deleteProductImage,
};