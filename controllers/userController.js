const User = require("../models/user");
const Order = require("../models/order");
const Wishlist = require("../models/wishlist");
const Address = require("../models/address");

// ==========================================
// GET ALL USERS - ADMIN
// ==========================================

const getAllUsers = async (req, res) => {
  try {
    const users = await User.find()
      .select("-password")
      .sort({ createdAt: -1 });

    res.status(200).json({
      success: true,
      count: users.length,
      users,
    });
  } catch (error) {
    console.error("Get all users error:", error);

    res.status(500).json({
      success: false,
      message: "Server error",
    });
  }
};

// ==========================================
// GET MY PROFILE
// ==========================================

const getMyProfile = async (req, res) => {
  try {
    const userId = req.userId;

    if (!userId) {
      return res.status(401).json({
        success: false,
        message: "User not authenticated",
      });
    }

    const user = await User.findById(userId).select("-password");

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    return res.status(200).json({
      success: true,
      user,
    });
  } catch (error) {
    console.error("Get My Profile Error:", error);

    return res.status(500).json({
      success: false,
      message: "Unable to fetch profile",
    });
  }
};

// ==========================================
// UPDATE MY PROFILE
// ==========================================

const updateMyProfile = async (req, res) => {
  try {
    const userId = req.userId;

    if (!userId) {
      return res.status(401).json({
        success: false,
        message: "User not authenticated",
      });
    }

    const { name, phone } = req.body;

    if (!name || !name.trim()) {
      return res.status(400).json({
        success: false,
        message: "Name is required",
      });
    }

    if (!phone || !phone.trim()) {
      return res.status(400).json({
        success: false,
        message: "Phone is required",
      });
    }

    // Check if phone is already used by another user
    const existingUser = await User.findOne({
      phone: phone.trim(),
      _id: { $ne: userId },
    });

    if (existingUser) {
      return res.status(400).json({
        success: false,
        message: "Phone number already registered",
      });
    }

    const user = await User.findByIdAndUpdate(
      userId,
      {
        name: name.trim(),
        phone: phone.trim(),
      },
      {
        new: true,
        runValidators: true,
      }
    ).select("-password");

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    return res.status(200).json({
      success: true,
      message: "Profile updated successfully",
      user,
    });
  } catch (error) {
    console.error("Update Profile Error:", error);

    return res.status(500).json({
      success: false,
      message: "Unable to update profile",
    });
  }
};

// ==========================================
// CUSTOMER DASHBOARD
// ==========================================

const getDashboard = async (req, res) => {
  try {
    const userId = req.userId;

    if (!userId) {
      return res.status(401).json({
        success: false,
        message: "User not authenticated",
      });
    }

    // Get user
    const user = await User.findById(userId).select(
      "-password -resetPasswordToken -resetPasswordExpire"
    );

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    // Total orders
    const totalOrders = await Order.countDocuments({
      user: userId,
    });

    // Orders currently in transit
    const inTransit = await Order.countDocuments({
      user: userId,
      orderStatus: "SHIPPED",
    });

    // Wishlist
    const wishlist = await Wishlist.findOne({
      user: userId,
    });

    const wishlistCount = wishlist?.products?.length || 0;

    // Addresses
    const addressCount = await Address.countDocuments({
      user: userId,
    });

    return res.status(200).json({
      success: true,

      dashboard: {
        user: {
          _id: user._id,
          name: user.name,
          email: user.email,
          phone: user.phone,
          role: user.role,
          createdAt: user.createdAt,
        },

        stats: {
          totalOrders,
          inTransit,
          wishlist: wishlistCount,
          addresses: addressCount,
        },
      },
    });
  } catch (error) {
    console.error("Dashboard Error:", error);

    return res.status(500).json({
      success: false,
      message: "Unable to fetch dashboard",
    });
  }
};

module.exports = {
  getAllUsers,
  getMyProfile,
  updateMyProfile,
  getDashboard,
};