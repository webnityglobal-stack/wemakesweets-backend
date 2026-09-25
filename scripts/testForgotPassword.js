require("dotenv").config();
const { sendResetPasswordOtp, formatPhoneNumber } = require("../services/whatsappService");

async function test() {
  const phoneArg = process.argv[2] || "9876543210";
  const otpArg = process.argv[3] || "123456";
  const nameArg = process.argv[4] || "Test Customer";

  console.log("==================================================");
  console.log("🧪 TESTING WHATSAPP FORGOT PASSWORD OTP");
  console.log("==================================================");
  console.log(`📱 Target Phone: ${phoneArg}`);
  console.log(`🔐 OTP Code: ${otpArg}`);
  console.log(`👤 Customer Name: ${nameArg}`);
  console.log(`Formatted Phone: ${formatPhoneNumber(phoneArg)}`);
  console.log("--------------------------------------------------");

  console.log("🚀 Executing sendResetPasswordOtp...");
  const result = await sendResetPasswordOtp(phoneArg, otpArg, nameArg);

  console.log("--------------------------------------------------");
  console.log("🏁 Result:", JSON.stringify(result, null, 2));
  console.log("==================================================");
}

test();
