const jwt = require("jsonwebtoken");

const authMiddleware = (req, res, next) => {
  try {
    // Get authorization header
    const authHeader = req.headers.authorization;

    console.log("Authorization Header:", authHeader);

    if (!authHeader) {
      return res.status(401).json({
        success: false,
        message: "Authorization header missing",
      });
    }

    if (!authHeader.startsWith("Bearer ")) {
      return res.status(401).json({
        success: false,
        message: "Invalid authorization format",
      });
    }
    
    // Extract token
    const token = authHeader.split(" ")[1];

    // Verify token
    const decoded = jwt.verify(
      token,
      process.env.JWT_SECRET
    );

     console.log("Decoded JWT:", decoded);

    // Store user ID in request
    req.user = decoded;

    // User ID
    req.userId =
      decoded.userId ||
      decoded._id ||
      decoded.id;


    // Continue to controller
    next();

  } catch (error) {
    
    console.error("Auth Error:", error.message);

    return res.status(401).json({
      success: false,
      message: "Invalid or expired token",
    });
  }
};

module.exports = authMiddleware;