/**
 * fixStuckOnlineOrders.js
 *
 * Yeh script sabhi ONLINE orders ko fix karta hai jo:
 *   - paymentStatus = "PROCESSING" ya "PENDING"
 *   - orderStatus = "PENDING" ya "PROCESSING"  (CONFIRMED nahi)
 *   - paymentMethod = "ONLINE"
 *
 * FastRR se status check karta hai:
 *   - Agar FastRR pe payment SUCCESS hai → skip (genuinely processing)
 *   - Baaki sabhi → paymentStatus = FAILED, orderStatus = CANCELLED
 *
 * Usage: node scripts/fixStuckOnlineOrders.js
 */

require("dotenv").config();

const mongoose = require("mongoose");
const axios = require("axios");
const crypto = require("crypto");

// ─────────────────────────────────────────────────────
// DB Connect
// ─────────────────────────────────────────────────────

const connectDB = async () => {
  await mongoose.connect(process.env.MONGO_URI);
  console.log("✅ MongoDB connected");
};

// ─────────────────────────────────────────────────────
// Models (inline — no circular deps)
// ─────────────────────────────────────────────────────

const orderSchema = new mongoose.Schema({}, { strict: false, timestamps: true });
const paymentSchema = new mongoose.Schema({}, { strict: false, timestamps: true });

const Order   = mongoose.models.Order   || mongoose.model("Order",   orderSchema);
const Payment = mongoose.models.Payment || mongoose.model("Payment", paymentSchema);

// ─────────────────────────────────────────────────────
// FastRR helpers
// ─────────────────────────────────────────────────────

const FASTRR_BASE_URL = process.env.FASTRR_BASE_URL || "https://checkout-api.shiprocket.com";

const generateHmac = (body) =>
  crypto
    .createHmac("sha256", process.env.FASTRR_API_SECRET)
    .update(body)
    .digest("base64");

const fetchFastRRStatus = async (gatewayOrderId) => {
  const payload = { order_id: String(gatewayOrderId), timestamp: new Date().toISOString() };
  const rawBody = JSON.stringify(payload);
  const hmac = generateHmac(rawBody);

  const res = await axios.post(
    `${FASTRR_BASE_URL}/api/v1/custom-platform-order/details`,
    rawBody,
    {
      headers: {
        "Content-Type": "application/json",
        "X-Api-Key": process.env.FASTRR_API_KEY,
        "X-Api-HMAC-SHA256": hmac,
      },
      timeout: 15000,
      validateStatus: () => true,
    }
  );
  return res.data;
};

const SUCCESS_VALUES = ["SUCCESS", "PAID", "COMPLETED", "SUCCESSFUL", "CHARGED", "CAPTURED", "ORDER_CREATED"];

const isPaymentSuccessful = (data) => {
  if (!data) return false;
  const statuses = [
    data?.result?.status,
    data?.result?.payment_status,
    data?.status,
    data?.payment_status,
  ].map((s) => String(s || "").trim().toUpperCase());
  if (statuses.some((s) => SUCCESS_VALUES.includes(s))) return true;

  const payments = data?.result?.payments || data?.payments;
  if (Array.isArray(payments) && payments.length > 0) {
    if (payments.some((p) => SUCCESS_VALUES.includes(String(p?.payment_status || p?.status || "").trim().toUpperCase()))) return true;
  }
  return false;
};

// ─────────────────────────────────────────────────────
// Main
// ─────────────────────────────────────────────────────

const run = async () => {
  await connectDB();

  // Sabhi stuck ONLINE orders fetch karo
  const stuckOrders = await Order.find({
    paymentMethod: "ONLINE",
    paymentStatus: { $in: ["PROCESSING", "PENDING"] },
    orderStatus:   { $in: ["PENDING", "PROCESSING"] },
  }).lean();

  console.log(`\n📦 Total stuck ONLINE orders found: ${stuckOrders.length}\n`);

  let fixedCount  = 0;
  let skippedCount = 0;
  let errorCount  = 0;

  for (const order of stuckOrders) {
    const orderId = order.orderId || order._id;
    try {
      // Payment record dhundo
      const payment = await Payment.findOne({ order: order._id });
      const gatewayOrderId = payment?.gatewayOrderId;

      let shouldFail = true; // by default fail karo

      if (gatewayOrderId) {
        // FastRR se status check karo
        try {
          const fastrrData = await fetchFastRRStatus(gatewayOrderId);
          if (isPaymentSuccessful(fastrrData)) {
            console.log(`  ⏭️  SKIP   ${orderId} — FastRR shows payment SUCCESS (do not touch)`);
            skippedCount++;
            shouldFail = false;
          } else {
            const cdStatus = String(fastrrData?.result?.status || fastrrData?.status || "UNKNOWN").toUpperCase();
            console.log(`  ❌ FAIL   ${orderId} — FastRR status: ${cdStatus}`);
          }
        } catch (fastrrErr) {
          console.log(`  ⚠️  ${orderId} — FastRR fetch failed: ${fastrrErr.message}. Marking FAILED anyway.`);
        }
      } else {
        console.log(`  ❌ FAIL   ${orderId} — No gatewayOrderId (checkout never initiated)`);
      }

      if (shouldFail) {
        // Order update karo
        await Order.updateOne(
          { _id: order._id },
          {
            $set: {
              paymentStatus:      "FAILED",
              orderStatus:        "CANCELLED",
              cancellationReason: "Payment not completed / cancelled by user",
              cancelledAt:        new Date(),
            },
          }
        );

        // Payment update karo
        if (payment) {
          await Payment.updateOne(
            { _id: payment._id },
            {
              $set: {
                status:        "FAILED",
                failureReason: "Payment not completed / cancelled by user",
              },
            }
          );
        }

        fixedCount++;
      }
    } catch (err) {
      console.error(`  💥 ERROR  ${orderId}: ${err.message}`);
      errorCount++;
    }
  }

  console.log("\n─────────────────────────────────────");
  console.log(`✅ Fixed (FAILED/CANCELLED): ${fixedCount}`);
  console.log(`⏭️  Skipped (SUCCESS):        ${skippedCount}`);
  console.log(`💥 Errors:                   ${errorCount}`);
  console.log("─────────────────────────────────────\n");

  await mongoose.disconnect();
  console.log("🔌 MongoDB disconnected. Done!");
};

run().catch((err) => {
  console.error("Fatal Error:", err);
  process.exit(1);
});
