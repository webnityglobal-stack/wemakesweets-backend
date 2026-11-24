const User = require("../models/user");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const crypto = require("crypto");
const sendEmail = require("../utils/sendEmail");
const whatsappService = require("../services/whatsappService");
const msg91Service = require("../services/msg91Service");
const {
  findUserByPhone,
  findGuestOrdersForPhone,
  linkGuestDataToUser,
} = require("../utils/guestOrderLinker");

const buildAuthToken = (user) => {
  return jwt.sign(
    {
      userId: user._id,
      role: user.role,
    },
    process.env.JWT_SECRET,
    {
      expiresIn: "7d",
    }
  );
};

const extractGuestId = (req) => {
  const raw =
    req.guestId ||
    req.headers["x-guest-id"] ||
    req.headers["guest-id"] ||
    req.headers["x-session-id"] ||
    req.body?.guestId ||
    req.query?.guestId ||
    null;

  const cleaned = raw ? String(raw).trim() : null;
  if (!cleaned || ["null", "undefined"].includes(cleaned.toLowerCase())) {
    return null;
  }
  return cleaned;
};

const formatUserResponse = (user) => ({
  id: user._id,
  _id: user._id,
  name: user.name || "Customer",
  email: user.email || "",
  phone: user.phone,
  role: user.role,
  isPhoneVerified: Boolean(user.isPhoneVerified),
});

// =====================================================
// MSG91 MOBILE OTP LOGIN - SEND OTP
// Works for existing users, previous guest checkout users,
// and brand-new users (no signup required).
// =====================================================

const sendLoginOTP = async (req, res) => {
  try {
    const { phone, mobile, phoneNumber, identifier, email, templateParams } =
      req.body || {};
    const rawInput = String(
      phone || mobile || phoneNumber || identifier || email || ""
    ).trim();

    const normalized = msg91Service.normalizeIndianMobile(rawInput);
    if (!normalized.valid) {
      return res.status(400).json({
        success: false,
        message: normalized.message,
      });
    }

    const existingUser = await findUserByPhone(normalized.phone10);

    const otpResult = await msg91Service.sendOtp(
      normalized.phone10,
      templateParams
    );
    if (!otpResult.success) {
      return res.status(otpResult.statusCode || 400).json({
        success: false,
        message: otpResult.message,
      });
    }

    return res.status(200).json({
      success: true,
      message: "OTP sent successfully to your mobile number.",
      phone: normalized.phone10,
      isNewUser: !existingUser,
      otpLength: otpResult.otpLength,
      otpExpiryMinutes: otpResult.otpExpiry,
      requestId: otpResult.requestId,
    });
  } catch (error) {
    console.error("SEND LOGIN OTP ERROR:", error);
    return res.status(500).json({
      success: false,
      message: "Unable to send login OTP. Please try again.",
    });
  }
};

// =====================================================
// MSG91 MOBILE OTP LOGIN - RESEND OTP
// =====================================================

const resendLoginOTP = async (req, res) => {
  try {
    const { phone, mobile, phoneNumber, identifier, email, retryType } =
      req.body || {};
    const rawInput = String(
      phone || mobile || phoneNumber || identifier || email || ""
    ).trim();

    const normalized = msg91Service.normalizeIndianMobile(rawInput);
    if (!normalized.valid) {
      return res.status(400).json({
        success: false,
        message: normalized.message,
      });
    }

    const resendResult = await msg91Service.resendOtp(
      normalized.phone10,
      retryType || "text"
    );

    if (!resendResult.success) {
      return res.status(resendResult.statusCode || 400).json({
        success: false,
        message: resendResult.message,
      });
    }

    return res.status(200).json({
      success: true,
      message: "OTP resent successfully to your mobile number.",
      phone: normalized.phone10,
    });
  } catch (error) {
    console.error("RESEND LOGIN OTP ERROR:", error);
    return res.status(500).json({
      success: false,
      message: "Unable to resend OTP. Please try again.",
    });
  }
};

// =====================================================
// MSG91 MOBILE OTP LOGIN - VERIFY OTP
// Auto-creates customer account if new and links all
// previous guest orders, payments, addresses & cart.
// =====================================================

const verifyLoginOTP = async (req, res) => {
  try {
    const {
      phone,
      mobile,
      phoneNumber,
      identifier,
      email,
      otp,
      code,
      name,
    } = req.body || {};

    const rawInput = String(
      phone || mobile || phoneNumber || identifier || email || ""
    ).trim();
    const rawOtp = String(otp || code || "").trim();

    const normalized = msg91Service.normalizeIndianMobile(rawInput);
    if (!normalized.valid) {
      return res.status(400).json({
        success: false,
        message: normalized.message,
      });
    }

    if (!rawOtp) {
      return res.status(400).json({
        success: false,
        message: "Please enter the OTP sent to your mobile number.",
      });
    }

    // 1. Verify OTP with MSG91
    const verifyResult = await msg91Service.verifyOtp(
      normalized.phone10,
      rawOtp
    );
    if (!verifyResult.success) {
      return res.status(verifyResult.statusCode || 400).json({
        success: false,
        message: verifyResult.message,
      });
    }

    const guestId = extractGuestId(req);

    // 2. Find existing user OR auto-create account (no separate signup needed)
    let user = await findUserByPhone(normalized.phone10);
    let isNewUser = false;

    if (!user) {
      isNewUser = true;

      // Inspect existing guest orders to prefill customer name/email if available
      const guestOrders = await findGuestOrdersForPhone(
        normalized.phone10,
        guestId
      );

      const guestOrderName = guestOrders.find(
        (o) =>
          o.shippingAddress?.name &&
          String(o.shippingAddress.name).trim() &&
          String(o.shippingAddress.name).trim().toLowerCase() !== "customer"
      )?.shippingAddress?.name;

      const resolvedName =
        (name && String(name).trim()) ||
        (guestOrderName && String(guestOrderName).trim()) ||
        "Customer";

      // Only attach email if valid and not already claimed by another user
      const guestOrderEmail = guestOrders.find(
        (o) =>
          o.shippingAddress?.email &&
          String(o.shippingAddress.email).includes("@")
      )?.shippingAddress?.email;

      const candidateEmail = guestOrderEmail
        ? String(guestOrderEmail).trim().toLowerCase()
        : null;

      let uniqueEmail = null;
      if (candidateEmail && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(candidateEmail)) {
        const emailOwner = await User.findOne({ email: candidateEmail })
          .select("_id")
          .lean();
        if (!emailOwner) {
          uniqueEmail = candidateEmail;
        }
      }

      const newUserPayload = {
        name: resolvedName,
        phone: normalized.phone10,
        role: "user",
        isPhoneVerified: true,
      };
      if (uniqueEmail) {
        newUserPayload.email = uniqueEmail;
      }

      try {
        user = await User.create(newUserPayload);
      } catch (createErr) {
        // Handle concurrent verify race condition on duplicate phone
        if (createErr && createErr.code === 11000) {
          user = await findUserByPhone(normalized.phone10);
          isNewUser = false;
        }
        if (!user) throw createErr;
      }
    } else {
      let needsSave = false;

      if (!user.isPhoneVerified) {
        user.isPhoneVerified = true;
        needsSave = true;
      }

      if (
        name &&
        String(name).trim() &&
        (!user.name || String(user.name).trim().toLowerCase() === "customer")
      ) {
        user.name = String(name).trim();
        needsSave = true;
      }

      if (user.loginOTP || user.loginOTPExpire) {
        user.loginOTP = null;
        user.loginOTPExpire = null;
        needsSave = true;
      }

      if (needsSave) {
        await user.save();
      }
    }

    // 3. Link all previous guest orders, payments, addresses & guest cart to this user
    const linkResult = await linkGuestDataToUser(user, guestId, {
      mergeCart: true,
    });

    // 4. Generate JWT Token
    const token = buildAuthToken(user);

    // 5. Send WhatsApp Welcome Message on Login (async in background, non-blocking)
    if (user.phone) {
      whatsappService
        .sendWelcomeNotification(user.phone, user.name)
        .then((waRes) => {
          if (waRes?.success) {
            console.log(`✅ [WhatsApp] Welcome message sent to ${user.phone} on login`);
          } else {
            console.warn(`⚠️ [WhatsApp] Welcome message failed for ${user.phone}:`, waRes?.error);
          }
        })
        .catch((err) => {
          console.error("❌ [WhatsApp] Error sending welcome message on login:", err?.message || err);
        });
    }

    return res.status(200).json({
      success: true,
      message: "Login successful.",
      token,
      isNewUser,
      linkedGuestOrders: linkResult.linkedOrderCount,
      mergedGuestCart: linkResult.mergedCart,
      user: formatUserResponse(user),
    });
  } catch (error) {
    console.error("VERIFY LOGIN OTP ERROR:", error);
    return res.status(500).json({
      success: false,
      message: "Unable to verify OTP. Please try again.",
    });
  }
};

// =====================================================
// SIGNUP (Deprecated for customers - OTP login handles both login & auto-signup)
// =====================================================

const signup = async (req, res) => {
  return res.status(400).json({
    success: false,
    otpRequired: true,
    message:
      "Separate signup is no longer required. Please login directly using your mobile number and OTP.",
  });
};

// =====================================================
// LOGIN
// - Admin / Subadmin: email + password login preserved
// - Customers: Mobile OTP only (if otp is passed, delegates to verifyLoginOTP)
// =====================================================

const login = async (req, res) => {
  try {
    const { email, phone, mobile, identifier, password, otp } = req.body || {};

    // Allow callers passing phone + otp to /login to seamlessly verify via MSG91
    if (otp && !password) {
      return await verifyLoginOTP(req, res);
    }

    if (!password) {
      return res.status(400).json({
        success: false,
        otpRequired: true,
        message:
          "Customer login is now mobile OTP based. Please request an OTP using your mobile number.",
      });
    }

    const rawInput = String(identifier || email || phone || mobile || "").trim();
    if (!rawInput) {
      return res.status(400).json({
        success: false,
        message: "Email or phone is required",
      });
    }

    const isEmail = rawInput.includes("@");
    const digitsOnly = rawInput.replace(/\D/g, "");
    const last10 = digitsOnly.length >= 10 ? digitsOnly.slice(-10) : digitsOnly;

    const searchConditions = [];

    if (isEmail) {
      searchConditions.push({ email: rawInput.toLowerCase() });
    } else if (last10 && last10.length === 10) {
      searchConditions.push(
        { phone: last10 },
        { phone: `+91${last10}` },
        { phone: `91${last10}` },
        { phone: rawInput }
      );
      searchConditions.push({ email: rawInput.toLowerCase() });
    } else if (rawInput) {
      searchConditions.push(
        { phone: rawInput },
        { email: rawInput.toLowerCase() }
      );
    }

    if (
      email &&
      !searchConditions.some((c) => c.email === email.toLowerCase().trim())
    ) {
      searchConditions.push({ email: email.toLowerCase().trim() });
    }
    if (phone && !searchConditions.some((c) => c.phone === phone.trim())) {
      searchConditions.push({ phone: phone.trim() });
    }

    const user = await User.findOne({
      $or: searchConditions,
    });

    if (!user) {
      return res.status(401).json({
        success: false,
        otpRequired: true,
        message:
          "Invalid credentials. Customers should login using mobile number and OTP.",
      });
    }

    // Customers must use MSG91 Mobile OTP login; Admin/Subadmin keep password login
    if (user.role !== "admin" && user.role !== "subadmin") {
      return res.status(400).json({
        success: false,
        otpRequired: true,
        message:
          "Customer login is now mobile OTP based. Please login using your mobile number and OTP.",
      });
    }

    if (!user.password) {
      return res.status(400).json({
        success: false,
        message: "Password login is not enabled for this account.",
      });
    }

    const isPasswordCorrect = await bcrypt.compare(password, user.password);

    if (!isPasswordCorrect) {
      return res.status(401).json({
        success: false,
        message: "Invalid email/phone or password",
      });
    }

    const token = buildAuthToken(user);

    // Send WhatsApp Welcome Message on Login if user has phone
    if (user.phone) {
      whatsappService
        .sendWelcomeNotification(user.phone, user.name)
        .then((waRes) => {
          if (waRes?.success) {
            console.log(`✅ [WhatsApp] Welcome message sent to ${user.phone} on password login`);
          } else {
            console.warn(`⚠️ [WhatsApp] Welcome message failed for ${user.phone}:`, waRes?.error);
          }
        })
        .catch((err) => {
          console.error("❌ [WhatsApp] Error sending welcome message on password login:", err?.message || err);
        });
    }

    return res.status(200).json({
      success: true,
      message: "Login successful",
      token,
      user: formatUserResponse(user),
    });
  } catch (error) {
    console.error("LOGIN ERROR:", error);

    return res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

// =====================================================
// HELPER: FIND USER BY EMAIL OR PHONE (Admin Password Reset)
// =====================================================

const findUserByEmailOrPhone = async (identifier) => {
  const input = String(identifier || "").trim();
  if (!input) return { user: null, isEmail: false, channel: null };

  const isEmail = input.includes("@");
  if (isEmail) {
    const user = await User.findOne({ email: input.toLowerCase().trim() });
    return { user, isEmail: true, channel: "email" };
  }

  const user = await findUserByPhone(input);
  return { user, isEmail: false, channel: "whatsapp" };
};

// =====================================================
// FORGOT PASSWORD - SEND OTP (Admin / Subadmin Recovery)
// =====================================================

const forgotPassword = async (req, res) => {
  try {
    const { email, phone, identifier } = req.body;
    const input = String(identifier || email || phone || "").trim();

    if (!input) {
      return res.status(400).json({
        success: false,
        message: "Please enter your registered email address or mobile number.",
      });
    }

    const { user, isEmail, channel } = await findUserByEmailOrPhone(input);

    if (!user) {
      return res.status(404).json({
        success: false,
        message: isEmail
          ? "No account found with this email address."
          : "No account found with this mobile number.",
      });
    }

    const otp = crypto.randomInt(100000, 1000000).toString();

    user.resetPasswordOTP = otp;
    user.resetPasswordOTPExpire = new Date(Date.now() + 10 * 60 * 1000);
    user.resetPasswordVerified = false;
    await user.save();

    console.log(
      `🔐 Password reset OTP generated for ${user.name} via ${channel}: ${otp}`
    );

    if (isEmail) {
      const emailMessage = `Hello ${user.name},

We received a request to reset your We Make Sweets account password.

Your password reset OTP is:

${otp}

This OTP is valid for 10 minutes.
Please do not share this OTP with anyone.

If you did not request a password reset, please ignore this email.

Regards,
We Make Sweets`;

      await sendEmail(
        user.email,
        "Password Reset OTP - We Make Sweets",
        emailMessage
      );

      return res.status(200).json({
        success: true,
        channel: "email",
        message: `Password reset OTP has been sent to your email (${user.email}).`,
      });
    } else {
      if (!user.phone) {
        return res.status(400).json({
          success: false,
          message: "No mobile number linked to this account.",
        });
      }

      const waRes = await whatsappService.sendResetPasswordOtp(
        user.phone,
        otp,
        user.name
      );

      if (!waRes.success && waRes.notOnWhatsApp) {
        return res.status(400).json({
          success: false,
          message: "This mobile number is not registered on WhatsApp.",
        });
      }

      return res.status(200).json({
        success: true,
        channel: "whatsapp",
        message: `Password reset OTP has been sent to your WhatsApp number (${user.phone}).`,
      });
    }
  } catch (error) {
    console.error("FORGOT PASSWORD ERROR:", error);

    return res.status(500).json({
      success: false,
      message: "Unable to send password reset OTP. Please try again.",
    });
  }
};

// =====================================================
// VERIFY RESET OTP
// =====================================================

const verifyResetOTP = async (req, res) => {
  try {
    const { email, phone, identifier, otp } = req.body;
    const input = String(identifier || email || phone || "").trim();

    if (!input || !otp) {
      return res.status(400).json({
        success: false,
        message: "Email/phone and OTP are required.",
      });
    }

    const { user } = await findUserByEmailOrPhone(input);

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "Account not found.",
      });
    }

    if (!user.resetPasswordOTP) {
      return res.status(400).json({
        success: false,
        message: "OTP not found. Please request a new OTP.",
      });
    }

    if (user.resetPasswordOTP !== String(otp).trim()) {
      return res.status(400).json({
        success: false,
        message: "Invalid OTP. Please check the code and try again.",
      });
    }

    if (
      !user.resetPasswordOTPExpire ||
      user.resetPasswordOTPExpire < new Date()
    ) {
      return res.status(400).json({
        success: false,
        message: "OTP has expired. Please request a new OTP.",
      });
    }

    user.resetPasswordVerified = true;
    await user.save();

    return res.status(200).json({
      success: true,
      message: "OTP verified successfully. You can now reset your password.",
    });
  } catch (error) {
    console.error("VERIFY OTP ERROR:", error);

    return res.status(500).json({
      success: false,
      message: "Unable to verify OTP. Please try again.",
    });
  }
};

// =====================================================
// RESET PASSWORD
// =====================================================

const resetPassword = async (req, res) => {
  try {
    const { email, phone, identifier, password } = req.body;
    const input = String(identifier || email || phone || "").trim();

    if (!input || !password) {
      return res.status(400).json({
        success: false,
        message: "Email/phone and new password are required.",
      });
    }

    if (password.length < 6) {
      return res.status(400).json({
        success: false,
        message: "Password must be at least 6 characters.",
      });
    }

    const { user } = await findUserByEmailOrPhone(input);

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found.",
      });
    }

    if (!user.resetPasswordVerified) {
      return res.status(400).json({
        success: false,
        message: "Please verify OTP before resetting password.",
      });
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    user.password = hashedPassword;

    user.resetPasswordOTP = null;
    user.resetPasswordOTPExpire = null;
    user.resetPasswordVerified = false;

    await user.save();

    return res.status(200).json({
      success: true,
      message:
        "Password reset successfully. You can now login with your new password.",
    });
  } catch (error) {
    console.error("RESET PASSWORD ERROR:", error);

    return res.status(500).json({
      success: false,
      message: "Unable to reset password. Please try again.",
    });
  }
};

// =====================================================
// EXPORTS (including backward-compatible aliases)
// =====================================================

module.exports = {
  signup,
  login,
  forgotPassword,
  verifyResetOTP,
  resetPassword,
  sendLoginOTP,
  verifyLoginOTP,
  resendLoginOTP,
  // Backward-compatible aliases routed to MSG91 Mobile OTP
  sendWhatsAppLoginOTP: sendLoginOTP,
  verifyWhatsAppLoginOTP: verifyLoginOTP,
};
