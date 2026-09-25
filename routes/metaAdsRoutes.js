const express = require("express");
const {
  getCampaignsReport,
  getAccountInfo,
  getInsights,
} = require("../controllers/metaAdsController");

const router = express.Router();

// GET /api/meta-ads or /api/meta-ads/campaigns
router.get("/", getCampaignsReport);
router.get("/campaigns", getCampaignsReport);

// GET /api/meta-ads/account
router.get("/account", getAccountInfo);

// GET /api/meta-ads/insights
router.get("/insights", getInsights);

module.exports = router;
