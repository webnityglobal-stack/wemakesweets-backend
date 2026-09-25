const User = require("../models/user");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const crypto = require("crypto");
const sendEmail = require("../utils/sendEmail");
const whatsappService = require("../services/whatsappService");

// =====================================================
// SIGNUP
// =====================================================

const signup = async (req, res) => {
  try {
    const { name, email, phone, password } = req.body;

    // Check required fields
    if (!name || !email || !phone || !password) {
      return res.status(400).json({
        success: false,
        message: "Please fill all fields",
      });
    }

    if (password.length < 6) {
      return res.status(400).json({
        success: false,
        message: "Password must be at least 6 characters",
      });
    }

    const normalizedEmail = email.toLowerCase().trim();
    const normalizedPhone = phone.trim();

    // Check email
    const existingEmail = await User.findOne({
      email: normalizedEmail,
    });

    if (existingEmail) {
      return res.status(400).json({
        success: false,
        message: "Email already registered",
      });
    }

    // Check phone
    const existingPhone = await User.findOne({
      phone: normalizedPhone,
    });

    if (existingPhone) {
      return res.status(400).json({
        success: false,
        message: "Phone number already registered",
      });
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 10);

    // Create user
    const user = await User.create({
      name: name.trim(),
      email: normalizedEmail,
      phone: normalizedPhone,
      password: hashedPassword,
    });

    // Auto login
    const token = jwt.sign(
      {
        userId: user._id,
        role: user.role,
      },
      process.env.JWT_SECRET,
      {
        expiresIn: "7d",
      }
    );

    // Send Welcome WhatsApp Notification (template + auto-retry + text fallback)
    if (user.phone) {
      whatsappService
        .sendWelcomeNotification(user.phone, user.name)
        .then((res) => {
          if (res && res.success) {
            console.log(`🎉 Welcome WhatsApp notification sent to ${user.phone}`);
          } else if (res && res.notOnWhatsApp) {
            console.log(`ℹ️ Phone number ${user.phone} is not registered on WhatsApp.`);
          } else {
            console.warn(
              `⚠️ Could not deliver WhatsApp welcome to ${user.phone}:`,
              res?.error?.message || res?.error || res?.templateError
            );
          }
        })
        .catch((waErr) =>
          console.error("WhatsApp welcome notification error:", waErr.message)
        );
    }

    // Send Welcome Email
    if (user.email) {
      sendEmail(
        user.email,
        "Welcome to WeMake Sweets & Snacks! 🍬",
        `Hi ${user.name},\n\nWelcome to WeMake Sweets & Snacks! We're delighted to have you with us.\n\nThank you for choosing WeMake Sweets & Snacks!`
      ).catch((emailErr) =>
        console.error("Welcome email sending error:", emailErr.message)
      );
    }

    return res.status(201).json({
      success: true,
      message: "Signup successful. You are now logged in.",

      token,

      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        phone: user.phone,
        role: user.role,
      },
    });
  } catch (error) {
    console.error("SIGNUP ERROR:", error);

    return res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

// =====================================================
// LOGIN
// =====================================================

const login = async (req, res) => {
  try {
    const { email, phone, password } = req.body;

    // Password required
    if (!password) {
      return res.status(400).json({
        success: false,
        message: "Please enter password",
      });
    }

    // Email OR phone required
    if (!email && !phone) {
      return res.status(400).json({
        success: false,
        message: "Email or phone is required",
      });
    }

    // Find user
    const user = await User.findOne({
      $or: [
        ...(email
          ? [{ email: email.toLowerCase().trim() }]
          : []),

        ...(phone
          ? [{ phone: phone.trim() }]
          : []),
      ],
    });

    if (!user) {
      return res.status(401).json({
        success: false,
        message: "Invalid email/phone or password",
      });
    }

    // Compare password
    const isPasswordCorrect = await bcrypt.compare(
      password,
      user.password
    );

    if (!isPasswordCorrect) {
      return res.status(401).json({
        success: false,
        message: "Invalid email/phone or password",
      });
    }

    // Generate JWT
    const token = jwt.sign(
      {
        userId: user._id,
        role: user.role,
      },
      process.env.JWT_SECRET,
      {
        expiresIn: "7d",
      }
    );

    return res.status(200).json({
      success: true,
      message: "Login successful",

      token,

      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        phone: user.phone,
        role: user.role,
      },
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
// HELPER: FIND USER BY EMAIL OR PHONE
// =====================================================

const findUserByEmailOrPhone = async (identifier) => {
  const input = String(identifier || "").trim();
  if (!input) return { user: null, isEmail: false, channel: null };

  const isEmail = input.includes("@");
  if (isEmail) {
    const user = await User.findOne({ email: input.toLowerCase().trim() });
    return { user, isEmail: true, channel: "email" };
  }

  // Handle phone
  const cleaned = input.replace(/\D/g, "");
  const stripped = cleaned.replace(/^91/, "").replace(/^0+/, "");

  const user = await User.findOne({
    $or: [
      { phone: input },
      { phone: cleaned },
      { phone: stripped },
      { phone: `+91${stripped}` },
      { phone: `91${stripped}` },
      { phone: `0${stripped}` },
    ],
  });

  return { user, isEmail: false, channel: "whatsapp" };
};

// =====================================================
// FORGOT PASSWORD - SEND OTP (EMAIL OR WHATSAPP)
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

    // =================================================
    // GENERATE 6 DIGIT OTP
    // =================================================
    const otp = crypto.randomInt(100000, 1000000).toString();

    // Save OTP to user model (valid for 10 minutes)
    user.resetPasswordOTP = otp;
    user.resetPasswordOTPExpire = new Date(Date.now() + 10 * 60 * 1000);
    user.resetPasswordVerified = false;
    await user.save();

    console.log(`🔐 Password reset OTP generated for ${user.name} via ${channel}: ${otp}`);

    if (isEmail) {
      // =================================================
      // SEND EMAIL OTP
      // =================================================
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
      // =================================================
      // SEND WHATSAPP OTP
      // =================================================
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

    // Check OTP exists
    if (!user.resetPasswordOTP) {
      return res.status(400).json({
        success: false,
        message: "OTP not found. Please request a new OTP.",
      });
    }

    // Check OTP value
    if (user.resetPasswordOTP !== String(otp).trim()) {
      return res.status(400).json({
        success: false,
        message: "Invalid OTP. Please check the code and try again.",
      });
    }

    // Check expiry
    if (
      !user.resetPasswordOTPExpire ||
      user.resetPasswordOTPExpire < new Date()
    ) {
      return res.status(400).json({
        success: false,
        message: "OTP has expired. Please request a new OTP.",
      });
    }

    // Mark as verified
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

    // OTP must be verified first
    if (!user.resetPasswordVerified) {
      return res.status(400).json({
        success: false,
        message: "Please verify OTP before resetting password.",
      });
    }

    // Hash new password
    const hashedPassword = await bcrypt.hash(password, 10);
    user.password = hashedPassword;

    // Clear reset OTP fields
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
// DUAL LOGIN - SEND OTP (WHATSAPP + EMAIL)
// =====================================================

const sendWhatsAppLoginOTP = async (req, res) => {
  try {
    const { phone, email, identifier } = req.body;
    const input = String(identifier || phone || email || "").trim();

    if (!input) {
      return res.status(400).json({
        success: false,
        message: "Please provide a valid phone number or email",
      });
    }

    const isEmail = input.includes("@");
    let user = null;

    if (isEmail) {
      user = await User.findOne({ email: input.toLowerCase() });
    } else {
      const cleanedPhone = input.trim();
      const stripped = cleanedPhone.replace(/^(\+?91)/, "");
      user = await User.findOne({
        $or: [
          { phone: cleanedPhone },
          { phone: stripped },
          { phone: `+91${stripped}` },
          { phone: `91${stripped}` },
        ],
      });
    }

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "No account found with this details. Please sign up first.",
      });
    }

    // Generate 6-digit numeric OTP
    const otp = Math.floor(100000 + Math.random() * 900000).toString();

    user.loginOTP = otp;
    user.loginOTPExpire = new Date(Date.now() + 10 * 60 * 1000); // 10 mins
    await user.save();

    console.log(`🔐 Generated Login OTP for ${user.name} (${user.phone} / ${user.email}): ${otp}`);

    const deliveryStatus = {
      whatsapp: false,
      email: false,
    };

    // 1. Send OTP via WhatsApp Template (wms_login_otp)
    if (user.phone) {
      try {
        const waResponse = await whatsappService.sendLoginOtpTemplate(
          user.phone,
          otp
        );
        deliveryStatus.whatsapp = !!waResponse.success;
      } catch (waErr) {
        console.error("WhatsApp OTP error:", waErr.message);
      }
    }

    // 2. Send SAME OTP via Email
    if (user.email) {
      try {
        await sendEmail(
          user.email,
          "Your WeMake Sweets & Snacks Login Code",
          `Hi ${user.name},\n\nYour WeMake Sweets & Snacks verification code is: ${otp}\n\nThis code is valid for 10 minutes.\nFor your security, please do not share this code with anyone.\n\nThank you,\nWeMake Sweets & Snacks Team`
        );
        deliveryStatus.email = true;
      } catch (emailErr) {
        console.error("Email OTP error:", emailErr.message);
      }
    }

    return res.status(200).json({
      success: true,
      message: "Verification OTP has been sent to your WhatsApp and Email.",
      delivery: deliveryStatus,
    });
  } catch (error) {
    console.error("SEND OTP ERROR:", error);
    return res.status(500).json({
      success: false,
      message: "Unable to send login OTP. Please try again.",
    });
  }
};

// =====================================================
// DUAL LOGIN - VERIFY OTP
// =====================================================

const verifyWhatsAppLoginOTP = async (req, res) => {
  try {
    const { phone, email, identifier, otp } = req.body;
    const input = String(identifier || phone || email || "").trim();

    if (!input || !otp) {
      return res.status(400).json({
        success: false,
        message: "Please provide your phone number/email and the OTP",
      });
    }

    const isEmail = input.includes("@");
    let user = null;

    if (isEmail) {
      user = await User.findOne({ email: input.toLowerCase() });
    } else {
      const cleanedPhone = input.trim();
      const stripped = cleanedPhone.replace(/^(\+?91)/, "");
      user = await User.findOne({
        $or: [
          { phone: cleanedPhone },
          { phone: stripped },
          { phone: `+91${stripped}` },
          { phone: `91${stripped}` },
        ],
      });
    }

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    if (!user.loginOTP || user.loginOTP !== String(otp).trim()) {
      return res.status(400).json({
        success: false,
        message: "Invalid OTP. Please check the code sent to your WhatsApp or Email.",
      });
    }

    if (!user.loginOTPExpire || user.loginOTPExpire < new Date()) {
      return res.status(400).json({
        success: false,
        message: "OTP has expired. Please request a new one.",
      });
    }

    // OTP is valid - clear it
    user.loginOTP = null;
    user.loginOTPExpire = null;
    await user.save();

    // Generate JWT token
    const token = jwt.sign(
      {
        userId: user._id,
        role: user.role,
      },
      process.env.JWT_SECRET,
      {
        expiresIn: "7d",
      }
    );

    return res.status(200).json({
      success: true,
      message: "Login successful.",
      token,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        phone: user.phone,
        role: user.role,
      },
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
// EXPORTS
// =====================================================

module.exports = {
  signup,
  login,
  forgotPassword,
  verifyResetOTP,
  resetPassword,
  sendWhatsAppLoginOTP,
  verifyWhatsAppLoginOTP,
};