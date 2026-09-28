const { BetaAnalyticsDataClient } = require("@google-analytics/data");

/**
 * Format private key to handle cases where newlines are escaped (\n)
 * or PEM headers (-----BEGIN/END PRIVATE KEY-----) are missing.
 */
const formatPrivateKey = (key) => {
  if (!key) return "";

  // Replace literal '\n' string with actual newline characters
  let cleanKey = key.replace(/\\n/g, "\n").trim();

  // If PEM headers are missing, wrap the key with standard PKCS8 PEM headers
  if (!cleanKey.includes("-----BEGIN PRIVATE KEY-----")) {
    cleanKey = `-----BEGIN PRIVATE KEY-----\n${cleanKey}\n-----END PRIVATE KEY-----\n`;
  }

  return cleanKey;
};

/**
 * Get or initialize GA4 client instance
 */
let analyticsClientInstance = null;

const getAnalyticsClient = () => {
  if (analyticsClientInstance) {
    return analyticsClientInstance;
  }

  const clientEmail = process.env.GOOGLE_CLIENT_EMAIL;
  const rawPrivateKey = process.env.GOOGLE_PRIVATE_KEY;
  const propertyId = process.env.GA4_PROPERTY_ID;

  if (!clientEmail || !rawPrivateKey || !propertyId) {
    throw new Error(
      "Missing Google Analytics credentials in environment variables (GA4_PROPERTY_ID, GOOGLE_CLIENT_EMAIL, GOOGLE_PRIVATE_KEY)."
    );
  }

  analyticsClientInstance = new BetaAnalyticsDataClient({
    credentials: {
      client_email: clientEmail,
      private_key: formatPrivateKey(rawPrivateKey),
    },
  });

  return analyticsClientInstance;
};

/**
 * Helper to map period query param to startDate and endDate
 */
const resolveDateRange = (period, startDate, endDate) => {
  if (startDate && endDate) {
    return { startDate, endDate };
  }

  switch (period) {
    case "today":
      return { startDate: "today", endDate: "today" };
    case "yesterday":
      return { startDate: "yesterday", endDate: "yesterday" };
    case "7d":
    case "7days":
      return { startDate: "7daysAgo", endDate: "today" };
    case "30d":
    case "30days":
      return { startDate: "30daysAgo", endDate: "today" };
    case "90d":
    case "90days":
      return { startDate: "90daysAgo", endDate: "today" };
    case "year":
    case "365d":
      return { startDate: "365daysAgo", endDate: "today" };
    default:
      return { startDate: "30daysAgo", endDate: "today" };
  }
};

/**
 * Fetch Main GA4 Dashboard Metrics
 * Metrics:
 * - activeUsers (Visitors)
 * - totalUsers (Total Users)
 * - screenPageViews (Page Views)
 * - sessions (Sessions)
 * - eventCount (Events)
 * - transactions (Purchases)
 * - totalRevenue (Revenue)
 * - engagementRate (Engagement Rate)
 * - userEngagementDuration (Engagement Time in seconds)
 */
const getDashboardMetrics = async ({ period, startDate, endDate } = {}) => {
  const client = getAnalyticsClient();
  const propertyId = process.env.GA4_PROPERTY_ID;
  const dateRange = resolveDateRange(period, startDate, endDate);

  const metricNames = [
    "activeUsers",
    "totalUsers",
    "screenPageViews",
    "sessions",
    "eventCount",
    "transactions",
    "totalRevenue",
    "engagementRate",
    "userEngagementDuration",
  ];

  const [response] = await client.runReport({
    property: `properties/${propertyId}`,
    dateRanges: [dateRange],
    metrics: metricNames.map((name) => ({ name })),
  });

  // Default values in case no data is available for the given range
  const data = {
    activeUsers: 0,
    totalUsers: 0,
    screenPageViews: 0,
    sessions: 0,
    eventCount: 0,
    transactions: 0,
    totalRevenue: 0,
    engagementRate: 0,
    userEngagementDuration: 0,
  };

  if (response && response.rows && response.rows.length > 0) {
    const row = response.rows[0];
    const headers = response.metricHeaders && response.metricHeaders.length > 0
      ? response.metricHeaders.map((h) => h.name)
      : metricNames;

    headers.forEach((metricName, index) => {
      const valStr = row.metricValues?.[index]?.value || "0";
      const val = parseFloat(valStr) || 0;

      if (metricName === "engagementRate") {
        data[metricName] = parseFloat(val.toFixed(4));
      } else if (metricName === "totalRevenue") {
        data[metricName] = parseFloat(val.toFixed(2));
      } else if (metricName === "userEngagementDuration") {
        data[metricName] = Math.round(val);
      } else {
        data[metricName] = Math.round(val);
      }
    });
  }

  return {
    data,
    metadata: {
      propertyId,
      dateRange,
      currencyCode: response?.metadata?.currencyCode || "INR",
      timeZone: response?.metadata?.timeZone || "Asia/Calcutta",
    },
  };
};

/**
 * Fetch Realtime Active Users (Last 30 minutes)
 */
const getRealtimeMetrics = async () => {
  const client = getAnalyticsClient();
  const propertyId = process.env.GA4_PROPERTY_ID;

  const [response] = await client.runRealtimeReport({
    property: `properties/${propertyId}`,
    metrics: [{ name: "activeUsers" }],
  });

  const activeUsers =
    response?.rows?.[0]?.metricValues?.[0]?.value
      ? parseInt(response.rows[0].metricValues[0].value, 10)
      : 0;

  return {
    activeUsers,
  };
};

/**
 * Fetch Daily Trends (Breakdown by date)
 */
const getDailyTrends = async ({ period, startDate, endDate } = {}) => {
  const client = getAnalyticsClient();
  const propertyId = process.env.GA4_PROPERTY_ID;
  const dateRange = resolveDateRange(period || "7d", startDate, endDate);

  const [response] = await client.runReport({
    property: `properties/${propertyId}`,
    dateRanges: [dateRange],
    dimensions: [{ name: "date" }],
    metrics: [
      { name: "activeUsers" },
      { name: "screenPageViews" },
      { name: "sessions" },
      { name: "totalRevenue" },
      { name: "transactions" },
    ],
    orderBys: [{ dimension: { dimensionName: "date" }, desc: false }],
  });

  const trends = (response?.rows || []).map((row) => ({
    date: row.dimensionValues?.[0]?.value || "",
    activeUsers: parseInt(row.metricValues?.[0]?.value || "0", 10),
    screenPageViews: parseInt(row.metricValues?.[1]?.value || "0", 10),
    sessions: parseInt(row.metricValues?.[2]?.value || "0", 10),
    totalRevenue: parseFloat(parseFloat(row.metricValues?.[3]?.value || "0").toFixed(2)),
    transactions: parseInt(row.metricValues?.[4]?.value || "0", 10),
  }));

  return {
    trends,
    metadata: {
      propertyId,
      dateRange,
    },
  };
};

module.exports = {
  getDashboardMetrics,
  getRealtimeMetrics,
  getDailyTrends,
};
