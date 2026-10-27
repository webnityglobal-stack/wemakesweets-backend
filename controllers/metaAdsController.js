const metaAdsService = require("../services/metaAdsService");

/**
 * GET /api/meta-ads/campaigns
 * Main endpoint to get campaign report with:
 * Campaign, Status, Spend, Impressions, Reach, Clicks, CTR, CPC, CPM
 */
const getCampaignsReport = async (req, res) => {
  try {
    const { date_preset, since, until, status, search } = req.query;

    const report = await metaAdsService.getCampaignsReport({
      date_preset: date_preset || "maximum",
      since,
      until,
      status,
    });

    let filteredData = report.data;

    // Apply search filter if provided
    if (search && search.trim()) {
      const q = search.trim().toLowerCase();
      filteredData = filteredData.filter((item) =>
        item.campaign.toLowerCase().includes(q)
      );
    }

    return res.status(200).json({
      success: true,
      account: report.account,
      summary: report.summary,
      count: filteredData.length,
      data: filteredData,
    });
  } catch (error) {
    console.error("Meta Ads Campaigns Report Error:", error.response?.data || error.message);

    const errorMessage =
      error.response?.data?.error?.message ||
      error.message ||
      "Failed to fetch Meta Ads campaign data.";

    return res.status(500).json({
      success: false,
      message: errorMessage,
      error: error.response?.data?.error || null,
    });
  }
};

/**
 * GET /api/meta-ads/account
 * Get Ad Account Information (Name, Currency, Status, Spend)
 */
const getAccountInfo = async (req, res) => {
  try {
    const accountInfo = await metaAdsService.getAdAccountInfo();

    return res.status(200).json({
      success: true,
      data: accountInfo,
    });
  } catch (error) {
    console.error("Meta Ads Account Info Error:", error.response?.data || error.message);

    return res.status(500).json({
      success: false,
      message: error.response?.data?.error?.message || "Failed to fetch Meta Ad account info.",
      error: error.response?.data?.error || null,
    });
  }
};

/**
 * GET /api/meta-ads/insights
 * Get raw insights with customizable level and metrics
 */
const getInsights = async (req, res) => {
  try {
    const insights = await metaAdsService.getCampaignInsights(req.query);

    return res.status(200).json({
      success: true,
      count: insights.length,
      data: insights,
    });
  } catch (error) {
    console.error("Meta Ads Insights Error:", error.response?.data || error.message);

    return res.status(500).json({
      success: false,
      message: error.response?.data?.error?.message || "Failed to fetch Meta insights.",
      error: error.response?.data?.error || null,
    });
  }
};

/**
 * POST /api/meta-ads/event
 * Receive Meta Conversions API event from frontend and forward to Meta Graph API
 */
const trackCapiEvent = async (req, res) => {
  try {
    const { eventName, eventId, eventSourceUrl, eventData, userData } = req.body || {};

    if (!eventName || !eventId) {
      return res.status(400).json({
        success: false,
        message: "Missing required fields: eventName and eventId",
      });
    }

    const clientIp =
      req.headers["x-forwarded-for"]?.split(",")[0]?.trim() ||
      req.socket?.remoteAddress ||
      "";

    const result = await metaAdsService.sendConversionsApiEvent({
      eventName,
      eventId,
      eventSourceUrl,
      eventData,
      userData,
      clientIp,
    });

    return res.status(200).json({
      success: true,
      data: result,
    });
  } catch (error) {
    console.error("Meta CAPI Dispatch Error:", error.response?.data || error.message);

    return res.status(200).json({
      success: false,
      message: error.response?.data?.error?.message || error.message,
      error: error.response?.data || null,
    });
  }
};

module.exports = {
  getCampaignsReport,
  getAccountInfo,
  getInsights,
  trackCapiEvent,
};
