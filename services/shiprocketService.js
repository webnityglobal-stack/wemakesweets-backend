const axios = require("axios");

const BASE_URL =
  process.env.SHIPROCKET_BASE_URL ||
  "https://apiv2.shiprocket.in/v1/external";

let shiprocketToken = null;
let tokenExpiry = null;


// ==========================================
// GET SHIPROCKET TOKEN
// ==========================================

const getShiprocketToken = async () => {
  try {

    // Reuse token if still valid
    if (
      shiprocketToken &&
      tokenExpiry &&
      Date.now() < tokenExpiry
    ) {
      return shiprocketToken;
    }

    const response = await axios.post(
      `${BASE_URL}/auth/login`,
      {
        email: process.env.SHIPROCKET_EMAIL,
        password: process.env.SHIPROCKET_PASSWORD
      },
      {
        headers: {
          "Content-Type": "application/json"
        }
      }
    );

    if (!response.data.token) {
      throw new Error(
        "Shiprocket token not received"
      );
    }

    shiprocketToken = response.data.token;

    // Keep token for slightly less than expiry
    tokenExpiry =
      Date.now() + 9 * 24 * 60 * 60 * 1000;

    return shiprocketToken;

  } catch (error) {

    console.error(
      "Shiprocket authentication error:",
      error.response?.data || error.message
    );

    throw error;
  }
};


// ==========================================
// COMMON REQUEST
// ==========================================

const shiprocketRequest = async (
  method,
  endpoint,
  data = null,
  params = null
) => {

  const token = await getShiprocketToken();

  try {

    const response = await axios({
      method,
      url: `${BASE_URL}${endpoint}`,

      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json"
      },

      data,
      params,

      timeout: 30000
    });

    return response.data;

  } catch (error) {

    console.error(
      `Shiprocket ${method} ${endpoint} error:`,
      error.response?.data || error.message
    );

    throw error;
  }
};


// ==========================================
// SERVICEABILITY
// ==========================================

const checkServiceability = async ({
  pickupPostcode,
  deliveryPostcode,
  weight,
  cod = 0,
  length,
  breadth,
  height
}) => {

  return await shiprocketRequest(
    "GET",
    "/courier/serviceability/",
    null,
    {
      pickup_postcode: pickupPostcode,
      delivery_postcode: deliveryPostcode,
      weight,
      cod,
      length,
      breadth,
      height
    }
  );
};


// ==========================================
// CREATE SHIPROCKET ORDER
// ==========================================

// ==========================================
// CREATE SHIPROCKET ORDER
// ==========================================

const createShiprocketOrder = async (orderData) => {
  try {

    const response = await shiprocketRequest(
      "POST",
      "/orders/create/adhoc",
      orderData
    );

    // DEBUG: Show Shiprocket's actual response
    console.log(
      "Shiprocket Create Order Response:",
      response
    );

    return response;

  } catch (error) {

    console.error(
      "Shiprocket Create Order Failed:",
      error.response?.data || error.message
    );

    throw error;
  }
};


// ==========================================
// ASSIGN AWB
// ==========================================

const generateAWB = async ({
  shipmentId,
  courierId
}) => {

  const data = {
    shipment_id: shipmentId
  };

  if (courierId) {
    data.courier_id = courierId;
  }

  return await shiprocketRequest(
    "POST",
    "/courier/assign/awb",
    data
  );
};


// ==========================================
// GENERATE PICKUP
// ==========================================

const generatePickup = async (
  shipmentId
) => {

  return await shiprocketRequest(
    "POST",
    "/courier/generate/pickup",
    {
      shipment_id: [shipmentId]
    }
  );
};


// ==========================================
// TRACK BY AWB
// ==========================================

const trackByAWB = async (awbCode) => {

  return await shiprocketRequest(
    "GET",
    `/courier/track/awb/${awbCode}`
  );
};


// ==========================================
// TRACK BY SHIPMENT
// ==========================================

const trackByShipment = async (
  shipmentId
) => {

  return await shiprocketRequest(
    "GET",
    `/courier/track/shipment/${shipmentId}`
  );
};


module.exports = {
  getShiprocketToken,
  checkServiceability,
  createShiprocketOrder,
  generateAWB,
  generatePickup,
  trackByAWB,
  trackByShipment
};