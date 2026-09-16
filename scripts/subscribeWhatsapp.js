require("dotenv").config();
const axios = require("axios");

async function syncSubscription() {
  const token = process.env.WHATSAPP_ACCESS_TOKEN;
  const wabaId = process.env.WHATSAPP_BUSINESS_ACCOUNT_ID;
  const version = "v21.0";

  if (!token || !wabaId) {
    console.error("❌ Missing WHATSAPP_ACCESS_TOKEN or WHATSAPP_BUSINESS_ACCOUNT_ID in .env");
    process.exit(1);
  }

  try {
    console.log("🔍 Checking existing WhatsApp Business Account subscriptions...");
    const getRes = await axios.get(
      `https://graph.facebook.com/${version}/${wabaId}/subscribed_apps`,
      {
        headers: { Authorization: `Bearer ${token}` },
      }
    );

    console.log("📋 Current subscribed apps:", JSON.stringify(getRes.data, null, 2));

    console.log("\n🚀 Subscribing app to WABA...");
    const postRes = await axios.post(
      `https://graph.facebook.com/${version}/${wabaId}/subscribed_apps`,
      {},
      {
        headers: { Authorization: `Bearer ${token}` },
      }
    );

    console.log("✅ Subscription Response:", postRes.data);

    const verifyRes = await axios.get(
      `https://graph.facebook.com/${version}/${wabaId}/subscribed_apps`,
      {
        headers: { Authorization: `Bearer ${token}` },
      }
    );

    console.log("\n🎉 Verified active subscriptions:");
    console.log(JSON.stringify(verifyRes.data, null, 2));
    console.log("\n✨ Done! Your WhatsApp Webhook is now linked to real incoming messages.");
  } catch (error) {
    console.error("❌ Error subscribing app:", error.response ? error.response.data : error.message);
  }
}

syncSubscription();
