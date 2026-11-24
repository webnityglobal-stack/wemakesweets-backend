const axios = require("axios");

const MSG91_BASE_URL = "https://control.msg91.com/api/v5";
const PLACEHOLDER_PHONES = new Set(["9999999999", "0000000000"]);

/**
 * Normalize an Indian mobile number from user input.
 * Rejects emails and invalid formats.
 */
const normalizeIndianMobile = (rawInput) => {
  const raw = String(rawInput || "").trim();

  if (!raw) {
    return {
      valid: false,
      isEmail: false,
      message: "Please enter your mobile number.",
    };
  }

  if (raw.includes("@")) {
    return {
      valid: false,
      isEmail: true,
      message:
        "Email login is not supported. Please enter your 10-digit mobile number.",
    };
  }

  let digits = raw.replace(/\D/g, "");

  if (digits.length === 12 && digits.startsWith("91")) {
    digits = digits.slice(2);
  } else if (digits.length === 11 && digits.startsWith("0")) {
    digits = digits.slice(1);
  }

  if (!/^[6-9]\d{9}$/.test(digits)) {
    return {
      valid: false,
      isEmail: false,
      message: "Please enter a valid 10-digit Indian mobile number.",
    };
  }

  return {
    valid: true,
    isEmail: false,
    phone10: digits,
    msg91Mobile: `91${digits}`,
    e164: `+91${digits}`,
    variants: [digits, `+91${digits}`, `91${digits}`, `0${digits}`],
  };
};

/**
 * Extract 10-digit phone number (lenient, for DB lookups & matching).
 */
const extractPhone10 = (rawPhone) => {
  if (!rawPhone) return null;
  let digits = String(rawPhone).replace(/\D/g, "");
  if (digits.length > 10) {
    digits = digits.slice(-10);
  }
  if (!/^\d{10}$/.test(digits)) return null;
  return digits;
};

const isPlaceholderPhone = (phone10) => {
  return !phone10 || PLACEHOLDER_PHONES.has(String(phone10));
};

const getPhoneVariants = (rawPhone) => {
  const phone10 = extractPhone10(rawPhone);
  if (!phone10) return [];
  const set = new Set([
    phone10,
    `+91${phone10}`,
    `91${phone10}`,
    `0${phone10}`,
  ]);
  const rawTrimmed = String(rawPhone || "").trim();
  if (rawTrimmed) set.add(rawTrimmed);
  return Array.from(set);
};

const getMsg91Config = () => {
  const authKey = String(process.env.MSG91_AUTH_KEY || "").trim();
  const templateId = String(process.env.MSG91_TEMPLATE_ID || "").trim();
  const otpLength = Math.min(
    9,
    Math.max(4, Number.parseInt(process.env.MSG91_OTP_LENGTH, 10) || 6)
  );
  const otpExpiry = Math.max(
    1,
    Number.parseInt(process.env.MSG91_OTP_EXPIRY, 10) || 10
  );

  return {
    authKey,
    templateId,
    otpLength,
    otpExpiry,
  };
};

/**
 * Send OTP using MSG91 v5 OTP API
 * POST https://control.msg91.com/api/v5/otp?template_id=&mobile=
 */
const sendOtp = async (rawPhone, templateParams = {}) => {
  const normalized = normalizeIndianMobile(rawPhone);
  if (!normalized.valid) {
    return {
      success: false,
      statusCode: 400,
      message: normalized.message,
    };
  }

  const { authKey, templateId, otpLength, otpExpiry } = getMsg91Config();

  if (!authKey || !templateId) {
    console.error("[MSG91] Missing MSG91_AUTH_KEY or MSG91_TEMPLATE_ID in .env");
    return {
      success: false,
      statusCode: 500,
      message: "OTP service is not configured. Please contact support.",
    };
  }

  const expiryValue = String(otpExpiry);
  let envTemplateParams = {};
  if (process.env.MSG91_TEMPLATE_PARAMS) {
    try {
      envTemplateParams = JSON.parse(process.env.MSG91_TEMPLATE_PARAMS);
    } catch (e) {
      console.warn("[MSG91] Failed to parse MSG91_TEMPLATE_PARAMS:", e.message);
    }
  }

  // Populate all standard DLT / MSG91 placeholder variations for the validity duration
  // so MSG91 fills "It is valid for 10 minutes." instead of leaving it blank.
  const defaultTemplateParams = {
    expiry: expiryValue,
    EXPIRY: expiryValue,
    Expiry: expiryValue,
    time: expiryValue,
    TIME: expiryValue,
    Time: expiryValue,
    min: expiryValue,
    MIN: expiryValue,
    Min: expiryValue,
    mins: expiryValue,
    MINS: expiryValue,
    Mins: expiryValue,
    minute: expiryValue,
    MINUTE: expiryValue,
    Minute: expiryValue,
    minutes: expiryValue,
    MINUTES: expiryValue,
    Minutes: expiryValue,
    validity: expiryValue,
    VALIDITY: expiryValue,
    Validity: expiryValue,
    var: expiryValue,
    VAR: expiryValue,
    Var: expiryValue,
    var1: expiryValue,
    VAR1: expiryValue,
    Var1: expiryValue,
    var2: expiryValue,
    VAR2: expiryValue,
    Var2: expiryValue,
    param1: expiryValue,
    PARAM1: expiryValue,
    Param1: expiryValue,
    param2: expiryValue,
    PARAM2: expiryValue,
    Param2: expiryValue,
    otp_expiry: expiryValue,
    OTP_EXPIRY: expiryValue,
    otpExpiry: expiryValue,
    duration: expiryValue,
    DURATION: expiryValue,
    Duration: expiryValue,
  };

  const callerBody =
    templateParams && typeof templateParams === "object" && !Array.isArray(templateParams)
      ? templateParams
      : {};

  const bodyData = {
    ...defaultTemplateParams,
    ...envTemplateParams,
    ...callerBody,
  };

  try {
    const response = await axios.post(
      `${MSG91_BASE_URL}/otp`,
      bodyData,
      {
        params: {
          template_id: templateId,
          mobile: normalized.msg91Mobile,
          otp_length: otpLength,
          otp_expiry: otpExpiry,
        },
        headers: {
          authkey: authKey,
          "content-type": "application/json",
          accept: "application/json",
        },
        timeout: 15000,
      }
    );

    const data = response.data || {};
    const isSuccess = String(data.type || "").toLowerCase() === "success";

    if (!isSuccess) {
      console.error("[MSG91] sendOtp failed:", data);
      return {
        success: false,
        statusCode: 400,
        message: data.message || "Unable to send OTP. Please try again.",
        raw: data,
      };
    }

    return {
      success: true,
      statusCode: 200,
      phone: normalized.phone10,
      msg91Mobile: normalized.msg91Mobile,
      otpLength,
      otpExpiry,
      requestId: data.request_id || null,
      message: "OTP sent successfully.",
      raw: data,
    };
  } catch (error) {
    const errData = error.response?.data;
    console.error("[MSG91] sendOtp error:", errData || error.message);
    return {
      success: false,
      statusCode: error.response?.status >= 400 && error.response?.status < 500 ? 400 : 502,
      message:
        errData?.message ||
        "Unable to send OTP right now. Please try again in a moment.",
      raw: errData || null,
    };
  }
};

/**
 * Verify OTP using MSG91 v5 Verify OTP API
 * GET https://control.msg91.com/api/v5/otp/verify
 *
 * NOTE: MSG91 returns HTTP 200 even for wrong/expired OTPs with type: "error".
 */
const verifyOtp = async (rawPhone, rawOtp) => {
  const normalized = normalizeIndianMobile(rawPhone);
  if (!normalized.valid) {
    return {
      success: false,
      statusCode: 400,
      message: normalized.message,
    };
  }

  const otp = String(rawOtp || "").trim();
  if (!/^\d{4,9}$/.test(otp)) {
    return {
      success: false,
      statusCode: 400,
      message: "Please enter a valid numeric OTP.",
    };
  }

  const { authKey } = getMsg91Config();
  if (!authKey) {
    console.error("[MSG91] Missing MSG91_AUTH_KEY in .env");
    return {
      success: false,
      statusCode: 500,
      message: "OTP service is not configured. Please contact support.",
    };
  }

  try {
    const response = await axios.get(`${MSG91_BASE_URL}/otp/verify`, {
      params: {
        otp,
        mobile: normalized.msg91Mobile,
      },
      headers: {
        authkey: authKey,
        accept: "application/json",
      },
      timeout: 15000,
    });

    const data = response.data || {};
    const isSuccess = String(data.type || "").toLowerCase() === "success";

    if (!isSuccess) {
      console.warn("[MSG91] verifyOtp rejected:", {
        mobile: normalized.msg91Mobile,
        response: data,
      });

      const rawMsg = String(data.message || "").toLowerCase();
      let friendlyMessage = data.message || "Invalid or expired OTP.";
      if (rawMsg.includes("not match")) {
        friendlyMessage = "Invalid OTP. Please check the code and try again.";
      } else if (rawMsg.includes("expired")) {
        friendlyMessage = "OTP has expired. Please request a new OTP.";
      } else if (rawMsg.includes("already verified")) {
        friendlyMessage = "This OTP has already been used. Please request a new OTP.";
      }

      return {
        success: false,
        statusCode: 400,
        message: friendlyMessage,
        raw: data,
      };
    }

    return {
      success: true,
      statusCode: 200,
      phone: normalized.phone10,
      msg91Mobile: normalized.msg91Mobile,
      message: data.message || "OTP verified successfully.",
      raw: data,
    };
  } catch (error) {
    const errData = error.response?.data;
    console.error("[MSG91] verifyOtp error:", errData || error.message);
    return {
      success: false,
      statusCode: error.response?.status >= 400 && error.response?.status < 500 ? 400 : 502,
      message:
        errData?.message ||
        "Unable to verify OTP right now. Please try again.",
      raw: errData || null,
    };
  }
};

/**
 * Resend OTP using MSG91 v5 Retry OTP API
 * GET https://control.msg91.com/api/v5/otp/retry
 * Falls back to sendOtp if no active OTP request exists to retry.
 */
const resendOtp = async (rawPhone, retryType = "text") => {
  const normalized = normalizeIndianMobile(rawPhone);
  if (!normalized.valid) {
    return {
      success: false,
      statusCode: 400,
      message: normalized.message,
    };
  }

  const { authKey } = getMsg91Config();
  if (!authKey) {
    console.error("[MSG91] Missing MSG91_AUTH_KEY in .env");
    return {
      success: false,
      statusCode: 500,
      message: "OTP service is not configured. Please contact support.",
    };
  }

  const resolvedRetryType =
    String(retryType || "text").trim().toLowerCase() === "voice"
      ? "voice"
      : "text";

  try {
    const response = await axios.get(`${MSG91_BASE_URL}/otp/retry`, {
      params: {
        authkey: authKey,
        retrytype: resolvedRetryType,
        mobile: normalized.msg91Mobile,
      },
      headers: {
        authkey: authKey,
        accept: "application/json",
      },
      timeout: 15000,
    });

    const data = response.data || {};
    const isSuccess = String(data.type || "").toLowerCase() === "success";

    if (isSuccess) {
      return {
        success: true,
        statusCode: 200,
        phone: normalized.phone10,
        msg91Mobile: normalized.msg91Mobile,
        retryType: resolvedRetryType,
        message: "OTP resent successfully.",
        raw: data,
      };
    }

    // If retry fails because no active OTP exists or expired, send a fresh OTP
    const msg = String(data.message || "").toLowerCase();
    if (
      msg.includes("no otp") ||
      msg.includes("expired") ||
      msg.includes("already verified") ||
      msg.includes("not found")
    ) {
      console.log(
        `[MSG91] Retry unavailable (${data.message}), sending fresh OTP to ${normalized.msg91Mobile}`
      );
      return await sendOtp(normalized.phone10);
    }

    console.warn("[MSG91] resendOtp failed:", data);
    return {
      success: false,
      statusCode: 400,
      message: data.message || "Unable to resend OTP. Please try again.",
      raw: data,
    };
  } catch (error) {
    const errData = error.response?.data;
    console.error("[MSG91] resendOtp error:", errData || error.message);
    return await sendOtp(normalized.phone10);
  }
};

module.exports = {
  normalizeIndianMobile,
  extractPhone10,
  isPlaceholderPhone,
  getPhoneVariants,
  getMsg91Config,
  sendOtp,
  verifyOtp,
  resendOtp,
};
