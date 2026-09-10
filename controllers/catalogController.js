const Product = require("../models/product");
const Collection = require("../models/Collection");


// =====================================================
// HELPER: FORMAT PRODUCT
// =====================================================

const formatProduct = (product) => {
  return {
    id: product.shiprocketId,

    title: product.name || "",

    body_html: product.description || "",

    vendor: "",

    product_type: "",

    updated_at: product.updatedAt
      ? new Date(product.updatedAt).toISOString()
      : "",

    status:
      product.stock > 0
        ? "active"
        : "out_of_stock",

    variants: (product.variants || []).map(
      (variant) => ({
        id: variant.shiprocketId,

        title: variant.title || "",

        price: String(
          variant.salePrice ?? 0
        ),

        quantity: Number(
          variant.stock ?? 0
        ),

        sku: variant.sku || "",

        updated_at: product.updatedAt
          ? new Date(
              product.updatedAt
            ).toISOString()
          : "",

        image: {
          src:
            product.images?.[0] || "",
        },

        weight: Number(
          parseFloat(
            product.weight
          ) || 0
        ),
      })
    ),

    image: {
      src:
        product.images?.[0] || "",
    },
  };
};


// =====================================================
// 1. FETCH PRODUCTS
// GET /api/catalog/products?page=1&limit=100
// =====================================================

const fetchProducts = async (req, res) => {
  try {

    const page = Math.max(
      Number(req.query.page) || 1,
      1
    );

    const limit = Math.min(
      Number(req.query.limit) || 100,
      100
    );

    const skip =
      (page - 1) * limit;


    const products =
      await Product.find({})
        .sort({
          updatedAt: -1,
        })
        .skip(skip)
        .limit(limit)
        .lean();


    const total =
      await Product.countDocuments({});


    const formattedProducts =
      products.map(formatProduct);


    return res.status(200).json({
      data: {
        total,
        products: formattedProducts,
      },
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
      error: error.message,
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
  async (req, res) => {

    try {

      const {
        collection_id,
      } = req.query;


      if (!collection_id) {
        return res.status(400).json({
          success: false,
          message:
            "collection_id is required",
        });
      }


      const page = Math.max(
        Number(req.query.page) || 1,
        1
      );

      const limit = Math.min(
        Number(req.query.limit) || 100,
        100
      );


      const skip =
        (page - 1) * limit;


      // --------------------------------------------
      // FIND COLLECTION
      // --------------------------------------------

      const collection =
        await Collection.findById(
          collection_id
        );


      if (!collection) {
        return res.status(404).json({
          success: false,
          message:
            "Collection not found",
        });
      }


      // --------------------------------------------
      // FIND PRODUCTS
      // --------------------------------------------

      const filter = {
        _id: {
          $in: collection.products,
        },
      };


      const products =
        await Product.find(filter)
          .sort({
            updatedAt: -1,
          })
          .skip(skip)
          .limit(limit)
          .lean();


      const total =
        await Product.countDocuments(
          filter
        );


      const formattedProducts =
        products.map(formatProduct);


      return res.status(200).json({
        data: {
          total,
          products:
            formattedProducts,
        },
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
        error: error.message,
      });
    }
  };


// =====================================================
// 3. FETCH COLLECTIONS
//
// GET /api/catalog/collections?page=1&limit=100
// =====================================================

const fetchCollections =
  async (req, res) => {

    try {

      const page = Math.max(
        Number(req.query.page) || 1,
        1
      );

      const limit = Math.min(
        Number(req.query.limit) || 100,
        100
      );


      const skip =
        (page - 1) * limit;


      const collections =
        await Collection.find({})
          .sort({
            updatedAt: -1,
          })
          .skip(skip)
          .limit(limit)
          .lean();


      const total =
        await Collection.countDocuments(
          {}
        );


      const formattedCollections =
        collections.map(
          (collection) => ({
            id: String(
              collection._id
            ),

            updated_at:
              collection.updatedAt
                ? new Date(
                    collection.updatedAt
                  ).toISOString()
                : "",

            title:
              collection.name || "",

            body_html:
              collection.description ||
              "",

            image: {
              src:
                collection.image || "",
            },
          })
        );


      return res.status(200).json({
        data: {
          total,
          collections:
            formattedCollections,
        },
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
        error: error.message,
      });
    }
  };


// =====================================================
// EXPORT
// =====================================================

module.exports = {
  fetchProducts,
  fetchProductsByCollection,
  fetchCollections,
};