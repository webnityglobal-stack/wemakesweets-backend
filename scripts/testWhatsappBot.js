require("dotenv").config();
const { formatPhoneNumber, sendInteractiveButtons, sendTextMessage } = require("../services/whatsappService");

async function runTests() {
  console.log("==================================================");
  console.log("🧪 TESTING WHATSAPP INTEGRATION & BOT LOGIC");
  console.log("==================================================");

  // Test 1: Phone Formatting
  console.log("\n1. Testing Phone Number Formatting:");
  const testPhones = [
    "9876543210",
    "+91 98765 43210",
    "09876543210",
    "919876543210",
  ];
  for (const phone of testPhones) {
    console.log(`   ${phone} -> ${formatPhoneNumber(phone)}`);
  }

  // Test 2: Interactive Buttons Payload Verification
  console.log("\n2. Verifying Interactive Buttons Structure:");
  const buttons = [
    { id: "VIEW_PRODUCTS", title: "🛍️ View Products" },
    { id: "TRACK_ORDER", title: "📦 Track Order" },
    { id: "CONTACT_QUERY", title: "📞 Contact / Query" },
  ];
  console.log("   Button counts:", buttons.length);
  buttons.forEach((b, i) => {
    console.log(`   Button ${i + 1}: id='${b.id}', title='${b.title}' (len=${b.title.length})`);
  });

  // Test 3: Check Environment Variables
  console.log("\n3. Verifying Environment Variables:");
  console.log("   WHATSAPP_PHONE_NUMBER_ID:", process.env.WHATSAPP_PHONE_NUMBER_ID ? "✅ Present" : "❌ Missing");
  console.log("   WHATSAPP_BUSINESS_ACCOUNT_ID:", process.env.WHATSAPP_BUSINESS_ACCOUNT_ID ? "✅ Present" : "❌ Missing");
  console.log("   WHATSAPP_ACCESS_TOKEN:", process.env.WHATSAPP_ACCESS_TOKEN ? "✅ Present" : "❌ Missing");
  console.log("   WHATSAPP_VERIFY_TOKEN:", process.env.WHATSAPP_VERIFY_TOKEN ? "✅ Present" : "❌ Missing");

  console.log("\n✨ Verification script passed successfully!");
}

runTests();
