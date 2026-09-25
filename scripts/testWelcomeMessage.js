require("dotenv").config();
const {
  formatPhoneNumber,
  sendWelcomeNotification,
  sendWelcomeTemplate,
  sendTextMessage,
} = require("../services/whatsappService");

async function run() {
  const phoneArg = process.argv[2] || "9876543210";
  const nameArg = process.argv[3] || "Test User";

  console.log("==================================================");
  console.log("🧪 TESTING WHATSAPP SIGNUP WELCOME MESSAGE");
  console.log("==================================================");
  console.log(`📱 Target Phone: ${phoneArg}`);
  console.log(`👤 Customer Name: ${nameArg}`);
  console.log(`Formatted Phone: ${formatPhoneNumber(phoneArg)}`);
  console.log("--------------------------------------------------");

  console.log("🚀 Executing sendWelcomeNotification...");
  const result = await sendWelcomeNotification(phoneArg, nameArg);

  console.log("--------------------------------------------------");
  console.log("🏁 Result:", JSON.stringify(result, null, 2));
  console.log("==================================================");
}

run();
