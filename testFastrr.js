require("dotenv").config();

const axios = require("axios");
const crypto = require("crypto");

const BASE_URL =
  process.env.FASTRR_BASE_URL ||
  "https://checkout-api.shiprocket.com";

const payload = {
  cart_data: {
    items: [
      {
        variant_id: "6a829e4d1ab0883c80fd50ab",
        quantity: 1,
      },
    ],
  },

  redirect_url:
    "https://example.com/payment/success",

  timestamp: new Date().toISOString(),
};

const rawBody = JSON.stringify(payload);

const hmac = crypto
  .createHmac(
    "sha256",
    process.env.FASTRR_API_SECRET
  )
  .update(rawBody)
  .digest("base64");

const headers = {
  "Content-Type": "application/json",

  "X-Api-Key":
    process.env.FASTRR_API_KEY,

  "X-Api-HMAC-SHA256":
    hmac,
};

console.log("========== FASTRR TEST ==========");

console.log("URL:");
console.log(
  `${BASE_URL}/api/v1/access-token/checkout`
);

console.log("KEY EXISTS:");
console.log(
  !!process.env.FASTRR_API_KEY
);

console.log("KEY LENGTH:");
console.log(
  process.env.FASTRR_API_KEY?.length
);

console.log("SECRET EXISTS:");
console.log(
  !!process.env.FASTRR_API_SECRET
);

console.log("SECRET LENGTH:");
console.log(
  process.env.FASTRR_API_SECRET?.length
);

console.log("HMAC LENGTH:");
console.log(
  hmac.length
);

console.log("PAYLOAD:");
console.log(
  JSON.stringify(
    payload,
    null,
    2
  )
);

console.log("=================================");

axios
  .post(
    `${BASE_URL}/api/v1/access-token/checkout`,
    rawBody,
    {
      headers,
      timeout: 30000,
      validateStatus: () => true,
    }
  )
  .then((response) => {

    console.log(
      "========== RESPONSE =========="
    );

    console.log(
      "STATUS:",
      response.status
    );

    console.log(
      "DATA:",
      JSON.stringify(
        response.data,
        null,
        2
      )
    );

    console.log(
      "=============================="
    );

  })
  .catch((error) => {

    console.log(
      "========== REQUEST ERROR =========="
    );

    console.log(
      error.message
    );

    console.log(
      "==================================="
    );

  });