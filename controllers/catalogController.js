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
// VARIANT WEIGHT HELPER
// =====================================================

const getVariantWeight = (variant, product) => {
  // First priority: variant weight
  if (
    variant?.weight !== null &&
    variant?.weight !== undefined &&
    variant?.weight !== ""
  ) {
    const variantWeight =
      Number(variant.weight);

    if (Number.isFinite(variantWeight)) {
      return variantWeight;
    }
  }

  // Fallback: product weight
  return getWeight(product);
};

// =====================================================
// OPTION VALUES
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

const getProductOptions = (product) => {
  if (Array.isArray(product?.options)) {
    return product.options;
  }

  return [];
};

// =====================================================
// FORMAT PRODUCT
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

  const variants =
    Array.isArray(product.variants)
      ? product.variants
      : [];

  return {
    // ==========================================
    // PRODUCT ID
    // ==========================================

    id: Number(
      product.shiprocketId
    ),

    // ==========================================
    // PRODUCT BASIC DETAILS
    // ==========================================

    title:
      product.name || "",

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

        // ======================================
        // GET ACTUAL VARIANT WEIGHT
        // ======================================

        const variantWeight =
          getVariantWeight(
            variant,
            product
          );

        return {
          // ====================================
          // UNIQUE VARIANT ID
          // ====================================

          id: Number(
            variant.shiprocketId
          ),

          // ====================================
          // VARIANT TITLE
          // ====================================

          title:
            variant.title || "",

          // ====================================
          // PRICE
          // ====================================

          price:
            String(
              variant.salePrice ?? 0
            ),

          // ====================================
          // MRP
          // ====================================

          compare_at_price:
            String(
              variant.mrp ?? 0
            ),

          // ====================================
          // SKU
          // ====================================

          sku:
            variant.sku || "",

          // ====================================
          // DATES
          // ====================================

          created_at:
            productCreatedAt,

          updated_at:
            productUpdatedAt,

          // ====================================
          // TAXABLE
          // ====================================

          taxable: true,

          // ====================================
          // STOCK
          // ====================================

          quantity:
            Number(
              variant.stock ?? 0
            ),

          // ====================================
          // WEIGHT IN GRAMS
          // ====================================

          grams:
            variantWeight,

          // ====================================
          // IMAGE
          // ====================================

          image: {
            src:
              variantImage
          },

          // ====================================
          // OPTION VALUES
          // ====================================

          option_values:
            getOptionValues(
              variant
            ),

          // ====================================
          // WEIGHT
          // ====================================

          weight:
            variantWeight,

          weight_unit:
            "g"
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
      getProductOptions(
        product
      )
  };
};

// =====================================================
// PAGINATION HELPER
// =====================================================

const getPagination = (req) => {
  const page = Math.max(
    parseInt(
      req.query.page,
      10
    ) || 1,
    1
  );

  const limit = Math.min(
    Math.max(
      parseInt(
        req.query.limit,
        10
      ) || 100,
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
    } =
      getPagination(req);

    const products =
      await Product.find({})
        .sort({
          updatedAt: -1
        })
        .skip(skip)
        .limit(limit)
        .lean();

    const total =
      await Product.countDocuments({});

    const formattedProducts =
      products.map(
        (product) =>
          formatProduct(
            product,
            req
          )
      );

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
// ?collection_id=1000000001&page=1&limit=100
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
      } =
        getPagination(req);

      // ==========================================
      // FIND COLLECTION
      // ==========================================

      let collection = null;

      const collectionIdString =
        String(
          collection_id
        ).trim();

      // ==========================================
      // 1. FIND BY SHIPROCKET ID
      // ==========================================

      const numericCollectionId =
        Number(
          collectionIdString
        );

      if (
        Number.isSafeInteger(
          numericCollectionId
        )
      ) {

        collection =
          await Collection.findOne({
            $expr: {
              $eq: [
                {
                  $toString:
                    "$shiprocketId"
                },

                collectionIdString
              ]
            }
          }).lean();
      }

      // ==========================================
      // 2. FALLBACK: FIND BY MONGO _id
      // ==========================================

      if (
        !collection &&
        mongoose.isValidObjectId(
          collectionIdString
        )
      ) {

        collection =
          await Collection.findById(
            collectionIdString
          ).lean();
      }

      // ==========================================
      // COLLECTION NOT FOUND
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

      // ==========================================
      // NO PRODUCTS
      // ==========================================

      if (
        productIds.length === 0
      ) {

        return res.status(200).json({
          data: {
            total: 0,

            products: []
          }
        });
      }

      // ==========================================
      // PRODUCT FILTER
      // ==========================================

      const filter = {
        _id: {
          $in:
            productIds
        }
      };

      // ==========================================
      // FETCH PRODUCTS
      // ==========================================

      const products =
        await Product.find(
          filter
        )
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
      // FORMAT PRODUCTS
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
      } =
        getPagination(req);

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
              // NUMERIC SHIPROCKET ID
              // ==================================

              id:
                Number(
                  collection.shiprocketId
                ),

              // ==================================
              // UPDATED DATE
              // ==================================

              updated_at:
                formatDate(
                  collection.updatedAt
                ),

              // ==================================
              // DESCRIPTION
              // ==================================

              body_html:
                collection.description ||
                "",

              // ==================================
              // HANDLE
              // ==================================

              handle:
                collection.slug ||
                "",

              // ==================================
              // IMAGE
              // ==================================

              image: {
                src:
                  collectionImage
              },

              // ==================================
              // TITLE
              // ==================================

              title:
                collection.name ||
                "",

              // ==================================
              // CREATED DATE
              // ==================================

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