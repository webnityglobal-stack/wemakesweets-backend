require("dotenv").config();
const { getCampaignsReport } = require("../services/metaAdsService");

async function run() {
  console.log("==================================================");
  console.log("📊 META ADS LIVE PERFORMANCE REPORT");
  console.log("==================================================");

  try {
    const result = await getCampaignsReport({ date_preset: "maximum" });

    if (!result.success) {
      console.error("❌ Failed to fetch Meta Ads report");
      return;
    }

    console.log(`\n🏢 Account: ${result.account.name} (${result.account.id})`);
    console.log(`💵 Currency: ${result.account.currency} | Status: ${result.account.status}`);

    console.log("\n📈 ACCOUNT SUMMARY:");
    console.table([result.summary]);

    console.log("\n🎯 CAMPAIGNS REPORT:");
    const tableData = result.data.map((c) => ({
      Campaign: c.campaign.slice(0, 35) + (c.campaign.length > 35 ? "..." : ""),
      Status: c.status,
      Spend: `${result.account.currency} ${c.spend}`,
      Impressions: c.impressions.toLocaleString(),
      Reach: c.reach.toLocaleString(),
      Clicks: c.clicks.toLocaleString(),
      CTR: c.ctr,
      CPC: c.cpc,
      CPM: c.cpm,
    }));

    console.table(tableData);
    console.log("==================================================");
  } catch (err) {
    console.error("❌ Error fetching Meta Ads report:", err.response?.data || err.message);
  }
}

run();
