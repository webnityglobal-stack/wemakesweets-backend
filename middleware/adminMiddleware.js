const User = require("../models/User");

const adminMiddleware = async (req, res, next) => {
  try {
    // authMiddleware must run first
    if (!req.userId) {
      return res.status(401).json({
        success: false,
        message: "Authentication required",
      });
    }

    // Find logged-in user
    const user = await User.findById(req.userId);

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    // Admin and Sub-admin have admin access
    if (user.role !== "admin" && user.role !== "subadmin") {
      return res.status(403).json({
        success: false,
        message: "Access denied. Admin access required.",
      });
    }

    // Store user in request
    req.user = user;

    next();
  } catch (error) {
    console.error("Admin Middleware Error:", error);

    return res.status(500).json({
      success: false,
      message: "Server error",
    });
  }
};

module.exports = adminMiddleware;