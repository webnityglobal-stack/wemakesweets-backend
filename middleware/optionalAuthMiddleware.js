const jwt = require("jsonwebtoken");

/**
 * Optional Auth Middleware
 * - If valid JWT token is provided: populates req.user and req.userId
 * - If no token or invalid/expired token: continues as guest (req.user = null, req.userId = null)
 * - Also extracts any guestId provided via headers, query, or body
 */
const optionalAuthMiddleware = (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;

    if (authHeader && authHeader.startsWith("Bearer ")) {
      const token = authHeader.split(" ")[1];
      try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        req.user = decoded;
        req.userId = decoded.userId || decoded.id || decoded._id || null;
      } catch (err) {
        // Token provided but invalid or expired - treat as guest
        console.warn("[optionalAuthMiddleware] Invalid or expired token, continuing as guest:", err.message);
        req.user = null;
        req.userId = null;
      }
    } else {
      req.user = null;
      req.userId = null;
    }

    // Extract guest identifier if provided
    const rawGuestId =
      req.headers["x-guest-id"] ||
      req.headers["guest-id"] ||
      req.headers["x-session-id"] ||
      req.query?.guestId ||
      req.body?.guestId ||
      null;

    const normalizedGuestId = rawGuestId ? String(rawGuestId).trim() : null;
    req.guestId =
      normalizedGuestId && !["null", "undefined"].includes(normalizedGuestId.toLowerCase())
        ? normalizedGuestId
        : null;

    next();
  } catch (error) {
    req.user = null;
    req.userId = null;
    req.guestId = null;
    next();
  }
};

module.exports = optionalAuthMiddleware;
