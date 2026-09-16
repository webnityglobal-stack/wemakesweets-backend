const mongoose = require("mongoose");
const Product = require("../models/product");
const Collection = require("../models/Collection");

// =====================================================
// BACKEND URL
// =====================================================

const getBackendUrl = (req) => {
  return (
    process.env.BACKEND_URL ||
    `${req.protocol}://${req.get("host")}`
  ).replace(/\/$/, "");
};

// =====================================================
// IMAGE URL HELPER
// =====================================================

const getImageUrl = (image, req) => {
  if (!image) {
    return "";
  }

  // Already full URL
  if (
    typeof image === "string" &&
    /^https?:\/\//i.test(image)
  ) {
    return image;
  }

  const backendUrl = getBackendUrl(req);

  const cleanImage = String(image).startsWith("/")
    ? image
    : `/${image}`;

  return `${backendUrl}${cleanImage}`;
};

// =====================================================
// DATE FORMATTER
// =====================================================

const formatDate = (date) => {
  if (!date) {
    return "";
  }

  const parsedDate = new Date(date);

  if (Number.isNaN(parsedDate.getTime())) {
    return "";
  }

  return parsedDate.toISOString();
};

// =====================================================
// WEIGHT HELPER
// =====================================================

const getWeight = (product) => {
  if (
    product?.weight === null ||
    product?.weight === undefined ||
    product?.weight === ""
  ) {
    return 0;
  }

  const weight = parseFloat(product.weight);

  return Number.isFinite(weight)
    ? weight
    : 0;
};

// =====================================================
// OPTION VALUES
// =====================================================
//
// Tumhare current Variant schema me separate option_values
// field nahi hai. Isliye jab tak model me option values
// available nahi hain, blank object bhej rahe hain.
// =====================================================

const getOptionValues = (variant) => {
  if (
    variant?.option_values &&
    typeof variant.option_values === "object"
  ) {
    return variant.option_values;
  }

  if (
    variant?.optionValues &&
    typeof variant.optionValues === "object"
  ) {
    return variant.optionValues;
  }

  return {};
};

// =====================================================
// PRODUCT OPTIONS
// =====================================================
//
// Agar variants me option data available ho to usko derive
// kiya ja sakta hai. Current schema me option name/value
// structure nahi hai, isliye empty array safe hai.
// =====================================================

const getProductOptions = (product) => {
  if (
    Array.isArray(product?.options)
  ) {
    return product.options;
  }

  return [];
};

// =====================================================
// HELPER: FORMAT PRODUCT
// =====================================================

const formatProduct = (product, req) => {
  const productImage = getImageUrl(
    product.images?.[0],
    req
  );

  const productCreatedAt =
    formatDate(product.createdAt);

  const productUpdatedAt =
    formatDate(product.updatedAt);

  const productWeight =
    getWeight(product);

  const variants =
    Array.isArray(product.variants)
      ? product.variants
      : [];

  return {
    // ==========================================
    // PRODUCT ID
    // ==========================================

    id: Number(product.shiprocketId),

    // ==========================================
    // PRODUCT BASIC DETAILS
    // ==========================================

    title: product.name || "",

    body_html:
      product.description || "",

    vendor: "",

    product_type: "",

    created_at:
      productCreatedAt,

    handle:
      product.slug || "",

    updated_at:
      productUpdatedAt,

    tags: "",

    // Shiprocket catalog status
    status: "active",

    // ==========================================
    // VARIANTS
    // ==========================================

    variants: variants.map(
      (variant) => {
        const variantImage =
          getImageUrl(
            product.images?.[0],
            req
          );

        return {
          // ====================================
          // UNIQUE VARIANT ID
          // ====================================

          id: Number(
            variant.shiprocketId
          ),

          title:
            variant.title || "",

          price: String(
            variant.salePrice ?? 0
          ),

          compare_at_price:
            String(
              variant.mrp ?? 0
            ),

          sku:
            variant.sku || "",

          created_at:
            productCreatedAt,

          updated_at:
            productUpdatedAt,

          // Your current schema does not
          // contain taxable, so default true.
          taxable: true,

          quantity: Number(
            variant.stock ?? 0
          ),

          // Shiprocket expects grams.
          grams: Number(
            productWeight || 0
          ),

          image: {
            src:
              variantImage
          },

          option_values:
            getOptionValues(
              variant
            ),

          weight:
            Number(
              productWeight || 0
            ),

          weight_unit: "g"
        };
      }
    ),

    // ==========================================
    // PRODUCT IMAGE
    // ==========================================

    image: {
      src:
        productImage
    },

    // ==========================================
    // PRODUCT OPTIONS
    // ==========================================

    options:
      getProductOptions(product)
  };
};

// =====================================================
// PAGINATION HELPER
// =====================================================

const getPagination = (req) => {
  const page = Math.max(
    parseInt(req.query.page, 10) || 1,
    1
  );

  const limit = Math.min(
    Math.max(
      parseInt(req.query.limit, 10) || 100,
      1
    ),
    100
  );

  const skip =
    (page - 1) * limit;

  return {
    page,
    limit,
    skip
  };
};

// =====================================================
// 1. FETCH PRODUCTS
//
// GET /api/catalog/products?page=1&limit=100
// =====================================================

const fetchProducts = async (
  req,
  res
) => {
  try {
    const {
      page,
      limit,
      skip
    } = getPagination(req);

    // ==========================================
    // FETCH PRODUCTS
    // ==========================================

    const products =
      await Product.find({})
        .sort({
          updatedAt: -1
        })
        .skip(skip)
        .limit(limit)
        .lean();

    // ==========================================
    // TOTAL
    // ==========================================

    const total =
      await Product.countDocuments({});

    // ==========================================
    // FORMAT
    // ==========================================

    const formattedProducts =
      products.map(
        (product) =>
          formatProduct(
            product,
            req
          )
      );

    // ==========================================
    // RESPONSE
    // ==========================================

    return res.status(200).json({
      data: {
        total,
        products:
          formattedProducts
      }
    });

  } catch (error) {
    console.error(
      "FETCH PRODUCTS ERROR:",
      error
    );

    return res.status(500).json({
      success: false,
      message:
        "Unable to fetch products",
      error:
        error.message
    });
  }
};

// =====================================================
// 2. FETCH PRODUCTS BY COLLECTION
//
// GET /api/catalog/collection-products
// ?collection_id=COLLECTION_ID&page=1&limit=100
// =====================================================

const fetchProductsByCollection =
  async (
    req,
    res
  ) => {
    try {
      const {
        collection_id
      } = req.query;

      // ==========================================
      // VALIDATE COLLECTION ID
      // ==========================================

      if (
        !collection_id ||
        !String(
          collection_id
        ).trim()
      ) {
        return res.status(400).json({
          success: false,
          message:
            "collection_id is required"
        });
      }

      const {
        page,
        limit,
        skip
      } = getPagination(req);

      // ==========================================
      // FIND COLLECTION
      // ==========================================

      let collection = null;

      // First try MongoDB _id
      if (
        mongoose.isValidObjectId(
          collection_id
        )
      ) {
        collection =
          await Collection.findById(
            collection_id
          ).lean();
      }

      // ==========================================
      // OPTIONAL: SUPPORT SHIPROCKET ID
      // ==========================================
      //
      // Agar future me Collection model me
      // shiprocketId add karte ho to ye automatically
      // support karega.
      // ==========================================

      if (!collection) {
        try {
          collection =
            await Collection.findOne({
              shiprocketId:
                Number(
                  collection_id
                )
            }).lean();
        } catch (error) {
          // Ignore if shiprocketId field
          // doesn't exist in schema.
        }
      }

      // ==========================================
      // NOT FOUND
      // ==========================================

      if (!collection) {
        return res.status(404).json({
          success: false,
          message:
            "Collection not found"
        });
      }

      // ==========================================
      // COLLECTION PRODUCTS
      // ==========================================

      const productIds =
        Array.isArray(
          collection.products
        )
          ? collection.products
          : [];

      const filter = {
        _id: {
          $in: productIds
        }
      };

      // ==========================================
      // FETCH PRODUCTS
      // ==========================================

      const products =
        await Product.find(filter)
          .sort({
            updatedAt: -1
          })
          .skip(skip)
          .limit(limit)
          .lean();

      // ==========================================
      // TOTAL
      // ==========================================

      const total =
        await Product.countDocuments(
          filter
        );

      // ==========================================
      // FORMAT
      // ==========================================

      const formattedProducts =
        products.map(
          (product) =>
            formatProduct(
              product,
              req
            )
        );

      // ==========================================
      // RESPONSE
      // ==========================================

      return res.status(200).json({
        data: {
          total,
          products:
            formattedProducts
        }
      });

    } catch (error) {
      console.error(
        "COLLECTION PRODUCTS ERROR:",
        error
      );

      return res.status(500).json({
        success: false,
        message:
          "Unable to fetch collection products",
        error:
          error.message
      });
    }
  };

// =====================================================
// 3. FETCH COLLECTIONS
//
// GET /api/catalog/collections?page=1&limit=100
// =====================================================

const fetchCollections =
  async (
    req,
    res
  ) => {
    try {
      const {
        page,
        limit,
        skip
      } = getPagination(req);

      // ==========================================
      // FETCH COLLECTIONS
      // ==========================================

      const collections =
        await Collection.find({})
          .sort({
            updatedAt: -1
          })
          .skip(skip)
          .limit(limit)
          .lean();

      // ==========================================
      // TOTAL
      // ==========================================

      const total =
        await Collection.countDocuments({});

      // ==========================================
      // FORMAT COLLECTIONS
      // ==========================================

      const formattedCollections =
        collections.map(
          (collection) => {

            const collectionImage =
              getImageUrl(
                collection.image,
                req
              );

            return {
              // ==================================
              // UNIQUE COLLECTION ID
              // ==================================

              id:
                String(
                  collection._id
                ),

              updated_at:
                formatDate(
                  collection.updatedAt
                ),

              body_html:
                collection.description ||
                "",

              handle:
                collection.slug ||
                "",

              image: {
                src:
                  collectionImage
              },

              title:
                collection.name ||
                "",

              created_at:
                formatDate(
                  collection.createdAt
                )
            };
          }
        );

      // ==========================================
      // RESPONSE
      // ==========================================

      return res.status(200).json({
        data: {
          total,
          collections:
            formattedCollections
        }
      });

    } catch (error) {
      console.error(
        "FETCH COLLECTIONS ERROR:",
        error
      );

      return res.status(500).json({
        success: false,
        message:
          "Unable to fetch collections",
        error:
          error.message
      });
    }
  };

// =====================================================
// EXPORT
// =====================================================

module.exports = {
  fetchProducts,
  fetchProductsByCollection,
  fetchCollections
};