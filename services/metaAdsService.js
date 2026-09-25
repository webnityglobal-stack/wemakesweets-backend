const axios = require("axios");

/**
 * Helper to get Meta Ads configuration from environment
 */
const getMetaAdsConfig = () => {
  const token = process.env.META_ACCESS_TOKEN;
  let rawAccountId = process.env.META_AD_ACCOUNT_ID;
  const version = process.env.META_API_VERSION || "v21.0";

  if (!rawAccountId) {
    return { token, accountId: null, version, baseUrl: null };
  }

  // Ensure 'act_' prefix
  const accountId = rawAccountId.startsWith("act_")
    ? rawAccountId
    : `act_${rawAccountId}`;

  return {
    token,
    accountId,
    version,
    baseUrl: `https://graph.facebook.com/${version}`,
  };
};

/**
 * Fetch Ad Account Details
 */
const getAdAccountInfo = async () => {
  const { token, accountId, baseUrl } = getMetaAdsConfig();

  if (!token || !accountId) {
    throw new Error(
      "Missing META_ACCESS_TOKEN or META_AD_ACCOUNT_ID in environment variables."
    );
  }

  const response = await axios.get(`${baseUrl}/${accountId}`, {
    params: {
      access_token: token,
      fields: "id,name,account_id,account_status,currency,timezone_name,amount_spent",
    },
  });

  return response.data;
};

/**
 * Fetch all Campaigns for the Ad Account
 * @param {Object} options - filters like status, limit, etc.
 */
const getCampaigns = async (options = {}) => {
  const { token, accountId, baseUrl } = getMetaAdsConfig();

  if (!token || !accountId) {
    throw new Error("Missing Meta Ads credentials in environment variables.");
  }

  const { status, limit = 50 } = options;

  const params = {
    access_token: token,
    fields:
      "id,name,status,effective_status,objective,created_time,updated_time,daily_budget,lifetime_budget,start_time,stop_time",
    limit,
  };

  if (status && status !== "ALL") {
    params.effective_status = JSON.stringify([status.toUpperCase()]);
  }

  const response = await axios.get(`${baseUrl}/${accountId}/campaigns`, {
    params,
  });

  return response.data?.data || [];
};

/**
 * Fetch Campaign Insights (Spend, Impressions, Reach, Clicks, CTR, CPC, CPM)
 * @param {Object} options - date_preset, time_range, etc.
 */
const getCampaignInsights = async (options = {}) => {
  const { token, accountId, baseUrl } = getMetaAdsConfig();

  if (!token || !accountId) {
    throw new Error("Missing Meta Ads credentials in environment variables.");
  }

  const {
    date_preset = "maximum",
    since,
    until,
    limit = 100,
  } = options;

  const params = {
    access_token: token,
    level: "campaign",
    fields:
      "campaign_id,campaign_name,spend,impressions,reach,clicks,ctr,cpc,cpm,date_start,date_stop",
    limit,
  };

  if (since && until) {
    params.time_range = JSON.stringify({ since, until });
  } else if (date_preset) {
    params.date_preset = date_preset;
  }

  const response = await axios.get(`${baseUrl}/${accountId}/insights`, {
    params,
  });

  return response.data?.data || [];
};

/**
 * Unified Method: Fetch Campaigns with their Insights joined together
 * Matches requested format:
 * - Campaign (name & id)
 * - Status
 * - Spend
 * - Impressions
 * - Reach
 * - Clicks
 * - CTR
 * - CPC
 * - CPM
 */
const getCampaignsReport = async (options = {}) => {
  const [campaigns, insights, accountInfo] = await Promise.all([
    getCampaigns(options).catch((err) => {
      console.error("Error fetching campaigns:", err.response?.data || err.message);
      return [];
    }),
    getCampaignInsights(options).catch((err) => {
      console.error("Error fetching insights:", err.response?.data || err.message);
      return [];
    }),
    getAdAccountInfo().catch((err) => {
      console.error("Error fetching account info:", err.response?.data || err.message);
      return null;
    }),
  ]);

  // Index insights by campaign_id
  const insightsMap = new Map();
  insights.forEach((item) => {
    if (item.campaign_id) {
      insightsMap.set(item.campaign_id, item);
    }
  });

  // Calculate totals
  let totalSpend = 0;
  let totalImpressions = 0;
  let totalReach = 0;
  let totalClicks = 0;

  // Combine campaigns with insights
  const data = campaigns.map((camp) => {
    const insight = insightsMap.get(camp.id) || {};

    const spendNum = parseFloat(insight.spend || "0") || 0;
    const impressionsNum = parseInt(insight.impressions || "0", 10) || 0;
    const reachNum = parseInt(insight.reach || "0", 10) || 0;
    const clicksNum = parseInt(insight.clicks || "0", 10) || 0;
    const ctrNum = parseFloat(insight.ctr || "0") || 0;
    const cpcNum = parseFloat(insight.cpc || "0") || 0;
    const cpmNum = parseFloat(insight.cpm || "0") || 0;

    totalSpend += spendNum;
    totalImpressions += impressionsNum;
    totalReach += reachNum;
    totalClicks += clicksNum;

    return {
      id: camp.id,
      campaign: camp.name,
      status: camp.status,
      effectiveStatus: camp.effective_status || camp.status,
      objective: camp.objective || "N/A",
      spend: spendNum.toFixed(2),
      impressions: impressionsNum,
      reach: reachNum,
      clicks: clicksNum,
      ctr: `${ctrNum.toFixed(2)}%`,
      ctrValue: Number(ctrNum.toFixed(2)),
      cpc: cpcNum.toFixed(2),
      cpm: cpmNum.toFixed(2),
      dateStart: insight.date_start || null,
      dateStop: insight.date_stop || null,
      createdTime: camp.created_time || null,
    };
  });

  // If there are insights for campaigns not in the campaigns list, include them too
  const campaignIdsSet = new Set(campaigns.map((c) => c.id));
  insights.forEach((insight) => {
    if (!campaignIdsSet.has(insight.campaign_id)) {
      const spendNum = parseFloat(insight.spend || "0") || 0;
      const impressionsNum = parseInt(insight.impressions || "0", 10) || 0;
      const reachNum = parseInt(insight.reach || "0", 10) || 0;
      const clicksNum = parseInt(insight.clicks || "0", 10) || 0;
      const ctrNum = parseFloat(insight.ctr || "0") || 0;
      const cpcNum = parseFloat(insight.cpc || "0") || 0;
      const cpmNum = parseFloat(insight.cpm || "0") || 0;

      totalSpend += spendNum;
      totalImpressions += impressionsNum;
      totalReach += reachNum;
      totalClicks += clicksNum;

      data.push({
        id: insight.campaign_id,
        campaign: insight.campaign_name || "Unknown Campaign",
        status: "UNKNOWN",
        effectiveStatus: "UNKNOWN",
        objective: "N/A",
        spend: spendNum.toFixed(2),
        impressions: impressionsNum,
        reach: reachNum,
        clicks: clicksNum,
        ctr: `${ctrNum.toFixed(2)}%`,
        ctrValue: Number(ctrNum.toFixed(2)),
        cpc: cpcNum.toFixed(2),
        cpm: cpmNum.toFixed(2),
        dateStart: insight.date_start || null,
        dateStop: insight.date_stop || null,
        createdTime: null,
      });
    }
  });

  // Summary calculations
  const overallCtr = totalImpressions > 0 ? (totalClicks / totalImpressions) * 100 : 0;
  const overallCpc = totalClicks > 0 ? totalSpend / totalClicks : 0;
  const overallCpm = totalImpressions > 0 ? (totalSpend / totalImpressions) * 1000 : 0;

  return {
    success: true,
    account: {
      id: accountInfo?.id || process.env.META_AD_ACCOUNT_ID,
      name: accountInfo?.name || "Meta Ad Account",
      currency: accountInfo?.currency || "INR",
      timezone: accountInfo?.timezone_name || "Asia/Kolkata",
      status: accountInfo?.account_status === 1 ? "ACTIVE" : "INACTIVE",
    },
    summary: {
      totalCampaigns: data.length,
      totalSpend: totalSpend.toFixed(2),
      totalImpressions,
      totalReach,
      totalClicks,
      averageCtr: `${overallCtr.toFixed(2)}%`,
      averageCpc: overallCpc.toFixed(2),
      averageCpm: overallCpm.toFixed(2),
    },
    data,
  };
};

module.exports = {
  getMetaAdsConfig,
  getAdAccountInfo,
  getCampaigns,
  getCampaignInsights,
  getCampaignsReport,
};
