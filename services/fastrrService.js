const axios = require("axios");

const { generateHmac } = require("../utils/fastrrHmac.js");

const FASTRR_BASE_URL =
  process.env.FASTRR_BASE_URL ||
  "https://checkout-api.shiprocket.com";

// =====================================================
// CREATE FASTRR CHECKOUT
// =====================================================

const createCheckout = async (payload) => {
  try {
    const rawBody = JSON.stringify(payload);

    const hmac = generateHmac(rawBody);

    const headers = {
      "Content-Type": "application/json",
      "X-Api-Key": process.env.FASTRR_API_KEY,
      "X-Api-HMAC-SHA256": hmac,
    };

    const url =
      `${FASTRR_BASE_URL}/api/v1/access-token/checkout`;

    console.log("========================================");
    console.log("CREATING FASTRR CHECKOUT");
    console.log("URL:", url);
    console.log("Payload:", JSON.stringify(payload, null, 2));
    console.log("API KEY EXISTS:", !!process.env.FASTRR_API_KEY);
    console.log(
      "API KEY LENGTH:",
      process.env.FASTRR_API_KEY?.length
    );
    console.log(
      "SECRET EXISTS:",
      !!process.env.FASTRR_API_SECRET
    );
    console.log(
      "SECRET LENGTH:",
      process.env.FASTRR_API_SECRET?.length
    );
    console.log("========================================");

    const response = await axios.post(
      url,
      rawBody,
      {
        headers,
        timeout: 30000,
        validateStatus: () => true,
      }
    );

    console.log("========== FASTRR RESPONSE ==========");
    console.log("HTTP STATUS:", response.status);
    console.log(
      "RESPONSE DATA:",
      JSON.stringify(response.data, null, 2)
    );
    console.log("=====================================");

    if (response.status >= 400) {
      const error = new Error(
        response.data?.message ||
        response.data?.result ||
        `FASTRR API returned HTTP ${response.status}`
      );

      error.response = {
        status: response.status,
        data: response.data,
        headers: response.headers,
      };

      throw error;
    }

    return response.data;

  } catch (error) {
    console.error("========== FASTRR CREATE ERROR ==========");

    console.error(
      "STATUS:",
      error.response?.status || "N/A"
    );

    console.error(
      "DATA:",
      JSON.stringify(
        error.response?.data || null,
        null,
        2
      )
    );

    console.error(
      "MESSAGE:",
      error.message
    );

    console.error("=========================================");

    throw error;
  }
};


// =====================================================
// FETCH FASTRR CHECKOUT ORDER DETAILS
//
// IMPORTANT:
// gatewayOrderId must be FastRR's gateway order ID.
//
// Example:
// 6ab36f722ac3e93b0de445de
//
// NOT:
// WMS-1790144369767
// =====================================================

const fetchFastRROrderDetails = async (
  gatewayOrderId
) => {
  try {

    if (!gatewayOrderId) {
      throw new Error(
        "FastRR gateway order ID is required"
      );
    }

    const payload = {
      order_id: String(gatewayOrderId),
      timestamp: new Date().toISOString(),
    };

    const rawBody = JSON.stringify(payload);

    const hmac = generateHmac(rawBody);

    const headers = {
      "Content-Type": "application/json",
      "X-Api-Key": process.env.FASTRR_API_KEY,
      "X-Api-HMAC-SHA256": hmac,
    };

    const url =
      `${FASTRR_BASE_URL}/api/v1/custom-platform-order/details`;

    console.log("========================================");
    console.log("FETCHING FASTRR ORDER DETAILS");
    console.log("URL:", url);
    console.log(
      "Gateway Order ID:",
      gatewayOrderId
    );
    console.log(
      "Payload:",
      rawBody
    );
    console.log(
      "API KEY EXISTS:",
      !!process.env.FASTRR_API_KEY
    );
    console.log("========================================");

    const response = await axios.post(
      url,
      rawBody,
      {
        headers,
        timeout: 30000,
        validateStatus: () => true,
      }
    );

    console.log(
      "========== FASTRR ORDER DETAILS =========="
    );

    console.log(
      "HTTP STATUS:",
      response.status
    );

    console.log(
      "RESPONSE DATA:",
      JSON.stringify(
        response.data,
        null,
        2
      )
    );

    console.log(
      "=========================================="
    );

    if (response.status >= 400) {
      const error = new Error(
        response.data?.message ||
        response.data?.result ||
        `FastRR Order Details API failed: ${response.status}`
      );

      error.response = {
        status: response.status,
        data: response.data,
        headers: response.headers,
      };

      throw error;
    }

    return response.data;

  } catch (error) {

    console.error(
      "FETCH FASTRR DETAILS ERROR:",
      error.response?.data ||
      error.message
    );

    throw error;
  }
};


// =====================================================
// EXPORTS
// =====================================================

module.exports = {
  createCheckout,
  fetchFastRROrderDetails,
};