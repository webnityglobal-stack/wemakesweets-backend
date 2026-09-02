const User = require("../models/User");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const sendEmail = require("../utils/sendEmail");

// ==================== SIGNUP ====================

const signup = async (req, res) => {
  try {
    const { name, email, phone, password } = req.body;

    if (!name || !email || !phone || !password) {
      return res.status(400).json({
        success: false,
        message: "Please fill all fields",
      });
    }

    const existingEmail = await User.findOne({ email });

    if (existingEmail) {
      return res.status(400).json({
        success: false,
        message: "Email already registered",
      });
    }

    const existingPhone = await User.findOne({ phone });

    if (existingPhone) {
      return res.status(400).json({
        success: false,
        message: "Phone number already registered",
      });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    const user = await User.create({
      name,
      email,
      phone,
      password: hashedPassword,
    });

    res.status(201).json({
      success: true,
      message: "User registered successfully",
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        phone: user.phone,
      },
    });
  } catch (error) {
    console.error("SIGNUP ERROR:", error);

    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};


// ==================== LOGIN ====================

const login = async (req, res) => {
  try {
    const { email, phone , password } = req.body;

    // Check fields
    if (!password) {
      return res.status(400).json({
        success: false,
        message: "Please enter password",
      });
    }

    // Either email OR phone is required
    if (!email && !phone) {
      return res.status(400).json({
        success: false,
        message: "Email or phone is required",
      });
    }

    // Find user using email OR phone
    const user = await User.findOne({
      $or: [
        ...(email ? [{ email: email.toLowerCase().trim() }] : []),
        ...(phone ? [{ phone: phone.trim() }] : []),
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

    res.status(200).json({
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

    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

// ==========================================
// FORGOT PASSWORD
// ==========================================

const forgotPassword = async (req, res) => {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({
        success: false,
        message: "Email is required",
      });
    }

    const user = await User.findOne({
      email: email.toLowerCase().trim(),
    });

    // Don't reveal whether email exists
    if (!user) {
      return res.status(200).json({
        success: true,
        message:
          "If an account exists with this email, a password reset link has been sent.",
      });
    }

    // Generate random token
    const resetToken = crypto.randomBytes(32).toString("hex");

    // Hash token before saving in database
    const hashedToken = crypto
      .createHash("sha256")
      .update(resetToken)
      .digest("hex");

    user.resetPasswordToken = hashedToken;

    // Token valid for 15 minutes
    user.resetPasswordExpire =
      Date.now() + 15 * 60 * 1000;

    await user.save();

    // Frontend reset page
    const resetUrl =
      `${process.env.FRONTEND_URL}/reset-password/${resetToken}`;

    const html = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: auto;">

        <h2 style="color: #8e1837;">
          We Make Sweets
        </h2>

        <p>Hello ${user.name},</p>

        <p>
          We received a request to reset your password.
        </p>

        <p>
          Click the button below to create a new password.
        </p>

        <a
          href="${resetUrl}"
          style="
            display:inline-block;
            padding:12px 24px;
            background:#8e1837;
            color:white;
            text-decoration:none;
            border-radius:6px;
          "
        >
          Reset Password
        </a>

        <p style="margin-top:20px;">
          This link will expire in 15 minutes.
        </p>

        <p>
          If you didn't request a password reset, you can ignore this email.
        </p>

        <p>
          Regards,<br/>
          We Make Sweets
        </p>

      </div>
    `;

    await sendEmail(
      user.email,
      "Reset Your We Make Sweets Password",
      html
    );

    res.status(200).json({
      success: true,
      message:
        "If an account exists with this email, a password reset link has been sent.",
    });

  } catch (error) {
    console.error("Forgot Password Error:", error);

    res.status(500).json({
      success: false,
      message: "Unable to process password reset request",
    });
  }
};

// ==========================================
// RESET PASSWORD
// ==========================================

const resetPassword = async (req, res) => {
  try {
    const { token } = req.params;
    const { password } = req.body;

    if (!password) {
      return res.status(400).json({
        success: false,
        message: "New password is required",
      });
    }

    if (password.length < 6) {
      return res.status(400).json({
        success: false,
        message: "Password must be at least 6 characters",
      });
    }

    // Hash received token
    const hashedToken = crypto
      .createHash("sha256")
      .update(token)
      .digest("hex");

    // Find user with valid token
    const user = await User.findOne({
      resetPasswordToken: hashedToken,
      resetPasswordExpire: {
        $gt: Date.now(),
      },
    });

    if (!user) {
      return res.status(400).json({
        success: false,
        message: "Reset token is invalid or expired",
      });
    }

    // Hash new password
    const hashedPassword = await bcrypt.hash(
      password,
      10
    );

    user.password = hashedPassword;

    // Remove reset token
    user.resetPasswordToken = null;
    user.resetPasswordExpire = null;

    await user.save();

    res.status(200).json({
      success: true,
      message:
        "Password reset successfully. You can now login with your new password.",
    });

  } catch (error) {
    console.error("Reset Password Error:", error);

    res.status(500).json({
      success: false,
      message: "Unable to reset password",
    });
  }
};


module.exports = {
  signup,
  login,
  forgotPassword,
  resetPassword,
};