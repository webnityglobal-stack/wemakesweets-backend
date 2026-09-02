const axios = require("axios");

const shiprocket = axios.create({
  baseURL:
    process.env.SHIPROCKET_BASE_URL ||
    "https://apiv2.shiprocket.in/v1/external",

  headers: {
    "Content-Type": "application/json"
  },

  timeout: 30000
});

module.exports = shiprocket;