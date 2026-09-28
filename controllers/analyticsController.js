const googleAnalyticsService = require("../services/googleAnalyticsService");

/**
 * GET /api/analytics/dashboard
 * Returns GA4 overview card metrics:
 * Visitors, Total Users, Page Views, Sessions, Events, Purchases, Revenue, Engagement Rate, Engagement Time
 */
const getDashboardAnalytics = async (req, res) => {
  try {
    const { period, startDate, endDate } = req.query;

    const result = await googleAnalyticsService.getDashboardMetrics({
      period,
      startDate,
      endDate,
    });

    return res.status(200).json({
      success: true,
      data: result.data,
      metadata: result.metadata,
    });
  } catch (error) {
    console.error("GA4 Dashboard Analytics Error:", error);

    return res.status(500).json({
      success: false,
      message: error.message || "Failed to fetch Google Analytics dashboard data.",
    });
  }
};

/**
 * GET /api/analytics/realtime
 * Returns real-time active users in the last 30 minutes
 */
const getRealtimeAnalytics = async (req, res) => {
  try {
    const result = await googleAnalyticsService.getRealtimeMetrics();

    return res.status(200).json({
      success: true,
      data: result,
    });
  } catch (error) {
    console.error("GA4 Realtime Analytics Error:", error);

    return res.status(500).json({
      success: false,
      message: error.message || "Failed to fetch GA4 realtime active users.",
    });
  }
};

/**
 * GET /api/analytics/trends
 * Returns daily breakdown of active users, page views, sessions, revenue
 */
const getDailyTrends = async (req, res) => {
  try {
    const { period, startDate, endDate } = req.query;

    const result = await googleAnalyticsService.getDailyTrends({
      period,
      startDate,
      endDate,
    });

    return res.status(200).json({
      success: true,
      data: result.trends,
      metadata: result.metadata,
    });
  } catch (error) {
    console.error("GA4 Daily Trends Error:", error);

    return res.status(500).json({
      success: false,
      message: error.message || "Failed to fetch GA4 daily trends.",
    });
  }
};

module.exports = {
  getDashboardAnalytics,
  getRealtimeAnalytics,
  getDailyTrends,
};
