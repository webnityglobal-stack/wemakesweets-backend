const express = require("express");
const {
  getDashboardAnalytics,
  getRealtimeAnalytics,
  getDailyTrends,
} = require("../controllers/analyticsController");

const router = express.Router();

// GET /api/analytics or /api/analytics/dashboard
router.get("/", getDashboardAnalytics);
router.get("/dashboard", getDashboardAnalytics);

// GET /api/analytics/realtime
router.get("/realtime", getRealtimeAnalytics);

// GET /api/analytics/trends
router.get("/trends", getDailyTrends);

module.exports = router;
