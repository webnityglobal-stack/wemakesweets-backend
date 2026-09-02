const User = require("../models/User");
const Product = require("../models/Product");
const Order = require("../models/Order");
const bcrypt = require("bcryptjs");

// ========================================
// GET ADMIN DASHBOARD
// ========================================

const getDashboard = async (req, res) => {
  try {
    const [
      totalCustomers,
      totalProducts,
      totalOrders,
      pendingOrders,
      deliveredOrders,
      cancelledOrders,
      salesResult,
      recentOrders,
    ] = await Promise.all([
      // Total customers
      User.countDocuments({
        role: "user",
      }),

      // Total products
      Product.countDocuments(),

      // Total orders
      Order.countDocuments(),

      // Pending orders
      Order.countDocuments({
        orderStatus: "PENDING",
      }),

      // Delivered orders
      Order.countDocuments({
        orderStatus: "DELIVERED",
      }),

      // Cancelled orders
      Order.countDocuments({
        orderStatus: "CANCELLED",
      }),

      // Total sales
      Order.aggregate([
        {
          $match: {
            orderStatus: "DELIVERED",
            paymentStatus: "PAID",
          },
        },
        {
          $group: {
            _id: null,
            totalSales: {
              $sum: "$totalAmount",
            },
          },
        },
      ]),

      // Recent 10 orders
      Order.find()
        .populate("user", "name email phone")
        .sort({
          createdAt: -1,
        })
        .limit(10),
    ]);

    const totalSales =
      salesResult.length > 0
        ? salesResult[0].totalSales
        : 0;

    res.status(200).json({
      success: true,

      stats: {
        totalSales,
        totalOrders,
        totalCustomers,
        totalProducts,
        pendingOrders,
        deliveredOrders,
        cancelledOrders,
      },

      recentOrders,
    });
  } catch (error) {
    console.error(
      "Admin dashboard error:",
      error
    );

    res.status(500).json({
      success: false,
      message: "Failed to load dashboard",
      error: error.message,
    });
  }
};


// ========================================
// GET ALL ORDERS FOR ADMIN
// ========================================

const getAllOrders = async (req, res) => {
  try {
    const orders = await Order.find()
      .populate("user", "name email phone")
      .sort({
        createdAt: -1,
      });

    res.status(200).json({
      success: true,
      count: orders.length,
      orders,
    });
  } catch (error) {
    console.error(
      "Get admin orders error:",
      error
    );

    res.status(500).json({
      success: false,
      message: "Failed to get orders",
      error: error.message,
    });
  }
};


// ========================================
// GET ALL CUSTOMERS
// ========================================

const getAllCustomers = async (req, res) => {
  try {
    const customers = await User.find({
      role: "user",
    }).select("-password");

    res.status(200).json({
      success: true,
      count: customers.length,
      customers,
    });
  } catch (error) {
    console.error(
      "Get customers error:",
      error
    );

    res.status(500).json({
      success: false,
      message: "Failed to get customers",
      error: error.message,
    });
  }
};


// ========================================
// GET SALES ANALYTICS
// ========================================

const getSalesAnalytics = async (req, res) => {
  try {
    const sales = await Order.aggregate([
      {
        $match: {
          orderStatus: "DELIVERED",
          paymentStatus: "PAID",
        },
      },

      {
        $group: {
          _id: {
            year: {
              $year: "$createdAt",
            },

            month: {
              $month: "$createdAt",
            },
          },

          totalSales: {
            $sum: "$totalAmount",
          },

          totalOrders: {
            $sum: 1,
          },
        },
      },

      {
        $sort: {
          "_id.year": 1,
          "_id.month": 1,
        },
      },
    ]);

    res.status(200).json({
      success: true,
      sales,
    });
  } catch (error) {
    console.error(
      "Sales analytics error:",
      error
    );

    res.status(500).json({
      success: false,
      message: "Failed to get sales analytics",
      error: error.message,
    });
  }
};


// ========================================
// GET TOP PRODUCTS
// ========================================

const getTopProducts = async (req, res) => {
  try {
    const topProducts = await Order.aggregate([
      {
        $match: {
          orderStatus: "DELIVERED",
          paymentStatus: "PAID",
        },
      },

      {
        $unwind: "$items",
      },

      {
        $group: {
          _id: "$items.product",

          totalSold: {
            $sum: "$items.quantity",
          },

          revenue: {
            $sum: {
              $multiply: [
                "$items.quantity",
                "$items.price",
              ],
            },
          },
        },
      },

      {
        $sort: {
          totalSold: -1,
        },
      },

      {
        $limit: 10,
      },

      {
        $lookup: {
          from: "products",
          localField: "_id",
          foreignField: "_id",
          as: "product",
        },
      },

      {
        $unwind: "$product",
      },
    ]);

    res.status(200).json({
      success: true,
      products: topProducts,
    });
  } catch (error) {
    console.error(
      "Top products error:",
      error
    );

    res.status(500).json({
      success: false,
      message: "Failed to get top products",
      error: error.message,
    });
  }
};

// ========================================
// CREATE SUB-ADMIN
// Only main admin can create
// ========================================

const createSubAdmin = async (req, res) => {
  try {
    // Only main admin can create subadmins
    if (req.user.role !== "admin") {
      return res.status(403).json({
        success: false,
        message: "Only admin can create subadmins",
      });
    }

    const {
      name,
      email,
      phone,
      password,
    } = req.body;

    // Validate required fields
    if (!name || !email || !phone || !password) {
      return res.status(400).json({
        success: false,
        message:
          "Name, email, phone and password are required",
      });
    }

    // Check existing email
    const existingEmail = await User.findOne({
      email: email.toLowerCase(),
    });

    if (existingEmail) {
      return res.status(400).json({
        success: false,
        message: "Email already exists",
      });
    }

    // Check existing phone
    const existingPhone = await User.findOne({
      phone,
    });

    if (existingPhone) {
      return res.status(400).json({
        success: false,
        message: "Phone number already exists",
      });
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(
      password,
      10
    );

    // Create subadmin
    const subAdmin = await User.create({
      name,
      email: email.toLowerCase(),
      phone,
      password: hashedPassword,
      role: "subadmin",
    });

    // Remove password from response
    const subAdminResponse =
      subAdmin.toObject();

    delete subAdminResponse.password;

    res.status(201).json({
      success: true,
      message: "Subadmin created successfully",
      subAdmin: subAdminResponse,
    });
  } catch (error) {
    console.error(
      "Create subadmin error:",
      error
    );

    res.status(500).json({
      success: false,
      message: "Failed to create subadmin",
      error: error.message,
    });
  }
};


// ========================================
// GET ALL SUB-ADMINS
// ========================================

const getAllSubAdmins = async (req, res) => {
  try {
    const subAdmins = await User.find({
      role: "subadmin",
    })
      .select("-password")
      .sort({
        createdAt: -1,
      });

    res.status(200).json({
      success: true,
      count: subAdmins.length,
      subAdmins,
    });
  } catch (error) {
    console.error(
      "Get subadmins error:",
      error
    );

    res.status(500).json({
      success: false,
      message: "Failed to get subadmins",
      error: error.message,
    });
  }
};


// ========================================
// UPDATE SUB-ADMIN
// ========================================

const updateSubAdmin = async (req, res) => {
  try {
    // Only main admin can update subadmins
    if (req.user.role !== "admin") {
      return res.status(403).json({
        success: false,
        message: "Only admin can update subadmins",
      });
    }

    const { id } = req.params;

    const {
      name,
      email,
      phone,
      password,
    } = req.body;

    const subAdmin = await User.findOne({
      _id: id,
      role: "subadmin",
    });

    if (!subAdmin) {
      return res.status(404).json({
        success: false,
        message: "Subadmin not found",
      });
    }

    // Update basic information
    if (name !== undefined) {
      subAdmin.name = name;
    }

    if (email !== undefined) {
      const normalizedEmail =
        email.toLowerCase();

      const emailExists = await User.findOne({
        email: normalizedEmail,
        _id: { $ne: id },
      });

      if (emailExists) {
        return res.status(400).json({
          success: false,
          message: "Email already exists",
        });
      }

      subAdmin.email = normalizedEmail;
    }

    if (phone !== undefined) {
      const phoneExists = await User.findOne({
        phone,
        _id: { $ne: id },
      });

      if (phoneExists) {
        return res.status(400).json({
          success: false,
          message: "Phone number already exists",
        });
      }

      subAdmin.phone = phone;
    }

    // Update password only if provided
    if (password) {
      subAdmin.password =
        await bcrypt.hash(password, 10);
    }

    await subAdmin.save();

    const subAdminResponse =
      subAdmin.toObject();

    delete subAdminResponse.password;

    res.status(200).json({
      success: true,
      message: "Subadmin updated successfully",
      subAdmin: subAdminResponse,
    });
  } catch (error) {
    console.error(
      "Update subadmin error:",
      error
    );

    res.status(500).json({
      success: false,
      message: "Failed to update subadmin",
      error: error.message,
    });
  }
};


// ========================================
// DELETE SUB-ADMIN
// ========================================

const deleteSubAdmin = async (req, res) => {
  try {
    // Only main admin can delete subadmins
    if (req.user.role !== "admin") {
      return res.status(403).json({
        success: false,
        message: "Only admin can delete subadmins",
      });
    }

    const { id } = req.params;

    const subAdmin =
      await User.findOneAndDelete({
        _id: id,
        role: "subadmin",
      });

    if (!subAdmin) {
      return res.status(404).json({
        success: false,
        message: "Subadmin not found",
      });
    }

    res.status(200).json({
      success: true,
      message: "Subadmin deleted successfully",
    });
  } catch (error) {
    console.error(
      "Delete subadmin error:",
      error
    );

    res.status(500).json({
      success: false,
      message: "Failed to delete subadmin",
      error: error.message,
    });
  }
};


// ========================================
// EXPORTS
// ========================================

module.exports = {
  getDashboard,
  getAllOrders,
  getAllCustomers,
  getSalesAnalytics,
  getTopProducts,

  createSubAdmin,
  getAllSubAdmins,
  updateSubAdmin,
  deleteSubAdmin,
};