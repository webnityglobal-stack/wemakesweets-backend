const mongoose = require("mongoose");

// // ==================== REVIEW SCHEMA ====================

// const reviewSchema = new mongoose.Schema(
//   {
//     name: {
//       type: String,
//       required: true,
//       trim: true,
//     },

//     rating: {
//       type: Number,
//       required: true,
//       min: 1,
//       max: 5,
//     },

//     date: {
//       type: Date,
//       default: Date.now,
//     },

//     comment: {
//       type: String,
//       required: true,
//       trim: true,
//     },
//   },
//   {
//     _id: true,
//   }
// );


// ==================== NUTRITION SCHEMA ====================

const nutritionSchema = new mongoose.Schema(
  {
    calories: {
      type: String,
      default: "",
    },

    protein: {
      type: String,
      default: "",
    },

    iron: {
      type: String,
      default: "",
    },

    phosphorus: {
      type: String,
      default: "",
    },

    sugar: {
      type: String,
      default: "",
    },

    fat: {
      type: String,
      default: "",
    },
  },
  {
    _id: false,
  }
);


// ==================== VARIANT SCHEMA ====================

const variantSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: true,
      trim: true,
    },

    salePrice: {
      type: Number,
      required: true,
      min: 0,
    },

    mrp: {
      type: Number,
      required: true,
      min: 0,
    },

    stock: {
      type: Number,
      required: true,
      min: 0,
      default: 0,
    },

    sku: {
      type: String,
      required: true,
      unique: true,
      trim: true,
    },
  },
  {
    _id: true,
  }
);


// ==================== COUPON SCHEMA ====================

const couponSchema = new mongoose.Schema(
  {
    code: {
      type: String,
      required: true,
      trim: true,
      uppercase: true,
    },

    discountType: {
      type: String,
      enum: ["percentage", "fixed"],
      required: true,
    },

    discountValue: {
      type: Number,
      required: true,
      min: 0,
    },

    maxDiscount: {
      type: Number,
      default: null,
      min: 0,
    },

    minOrderValue: {
      type: Number,
      default: 0,
      min: 0,
    },

    startDate: {
      type: Date,
      default: Date.now,
    },

    expiryDate: {
      type: Date,
      required: true,
    },

    usageLimit: {
      type: Number,
      default: null,
      min: 1,
    },

    usedCount: {
      type: Number,
      default: 0,
      min: 0,
    },

    isActive: {
      type: Boolean,
      default: true,
    },
  },
  {
    _id: true,
  }
);


// ==================== PRODUCT SCHEMA ====================

const productSchema = new mongoose.Schema(
  {
    slug: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      lowercase: true,
    },

    name: {
      type: String,
      required: true,
      trim: true,
    },

    shortDescription: {
      type: String,
      required: true,
      trim: true,
    },

    description: {
      type: String,
      required: true,
      trim: true,
    },

    salePrice: {
      type: Number,
      required: true,
      min: 0,
    },

    mrp: {
      type: Number,
      required: true,
      min: 0,
    },

    rating: {
      type: Number,
      default: 0,
      min: 0,
      max: 5,
    },

    stock: {
      type: Number,
      required: true,
      min: 0,
      default: 0,
    },

    isBestSeller: {
      type: Boolean,
      default: false,
    },

    images: [
      {
        type: String,
      },
    ],

    highlights: [
      {
        type: String,
        trim: true,
      },
    ],

    ingredients: [
      {
        type: String,
        trim: true,
      },
    ],

    nutrition: {
      type: nutritionSchema,
      default: () => ({}),
    },

    weight: {
      type: String,
      required: true,
      trim: true,
    },

    shelfLife: {
      type: String,
      required: true,
      trim: true,
    },

    storage: {
      type: String,
      required: true,
      trim: true,
    },

    countryOfOrigin: {
      type: String,
      default: "India",
      trim: true,
    },

    // reviews: [reviewSchema],

    variants: [variantSchema],

    // Product-specific coupons
    coupons: [couponSchema],
  },
  {
    timestamps: true,
  }
);


// const Product = mongoose.model("Product", productSchema);

module.exports =
  mongoose.models.Product || mongoose.model("Product", productSchema);