const express = require("express");
const {
  getCampaignsReport,
  getAccountInfo,
  getInsights,
  trackCapiEvent,
} = require("../controllers/metaAdsController");

const router = express.Router();

// GET /api/meta-ads or /api/meta-ads/campaigns
router.get("/", getCampaignsReport);
router.get("/campaigns", getCampaignsReport);

// GET /api/meta-ads/account
router.get("/account", getAccountInfo);

// GET /api/meta-ads/insights
router.get("/insights", getInsights);

// POST /api/meta-ads/event (Conversions API)
router.post("/event", trackCapiEvent);
router.post("/capi", trackCapiEvent);

module.exports = router;
