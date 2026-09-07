const axios = require("axios");

const { generateHmac } = require("../utils/fastrrHmac.js");

const FASTRR_BASE_URL =
  process.env.FASTRR_BASE_URL ||
  "https://checkout-api.shiprocket.com";

const createCheckout = async (payload) => {
  try {
    // ==========================================
    // 1. Convert payload to exact JSON string
    // ==========================================

    const rawBody = JSON.stringify(payload);

    // ==========================================
    // 2. Generate HMAC
    // ==========================================

    const hmac = generateHmac(rawBody);

    // ==========================================
    // 3. Prepare headers
    // ==========================================

    const headers = {
      "Content-Type": "application/json",
      "X-Api-Key": process.env.FASTRR_API_KEY,
      "X-Api-HMAC-SHA256": hmac,
    };

    // ==========================================
    // 4. Auth Debug
    // ==========================================

    console.log("========== AUTH DEBUG ==========");

    console.log({
      baseUrl: FASTRR_BASE_URL,

      keyExists: !!process.env.FASTRR_API_KEY,

      keyLength: process.env.FASTRR_API_KEY?.length,

      secretExists: !!process.env.FASTRR_API_SECRET,

      secretLength: process.env.FASTRR_API_SECRET?.length,

      hmacLength: hmac?.length,

      bodyLength: rawBody.length,

      contentType: headers["Content-Type"],

      // Only prefix is logged for safety
      apiKeyPrefix:
        headers["X-Api-Key"]?.substring(0, 7),
    });

    console.log("================================");

    // ==========================================
    // 5. FASTRR URL
    // ==========================================

    const url =
      `${FASTRR_BASE_URL}/api/v1/access-token/checkout`;

    console.log("========== FASTRR CHECKOUT ==========");

    console.log("URL:", url);

    console.log(
      "Payload:",
      JSON.stringify(payload, null, 2)
    );

    // ==========================================
    // 6. FASTRR API Request
    // ==========================================

    const response = await axios.post(
      url,
      rawBody,
      {
        headers,
        timeout: 30000,

        // Don't let Axios automatically throw
        // so we can see FASTRR's actual response
        validateStatus: () => true,
      }
    );

    // ==========================================
    // 7. Log RAW Response
    // ==========================================

    console.log(
      "========== FASTRR RAW RESPONSE =========="
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
      "RESPONSE HEADERS:",
      JSON.stringify(
        response.headers,
        null,
        2
      )
    );

    console.log(
      "=========================================="
    );

    // ==========================================
    // 8. Handle FASTRR Error Response
    // ==========================================

    if (response.status >= 400) {

      const error = new Error(
        `FASTRR API returned HTTP ${response.status}`
      );

      error.response = {
        status: response.status,
        data: response.data,
        headers: response.headers,
      };

      throw error;
    }

    // ==========================================
    // 9. Return FASTRR Response
    // ==========================================

    return response.data;

  } catch (error) {

    // ==========================================
    // 10. Detailed Error Logging
    // ==========================================

    console.log(
      "========== FASTRR ERROR =========="
    );

    console.log(
      "HTTP STATUS:",
      error.response?.status || "N/A"
    );

    console.log(
      "RESPONSE DATA:",
      JSON.stringify(
        error.response?.data || null,
        null,
        2
      )
    );

    console.log(
      "ERROR MESSAGE:",
      error.message
    );

    console.log(
      "=================================="
    );

    throw error;
  }
};

module.exports = {
  createCheckout,
};