// controllers/authController.js
const bcrypt = require("bcrypt");
const User = require("../models/User");
const UserOTP = require("../models/UserOTP");
const Joi = require("joi");
const { Op } = require("sequelize");
const { transporter } = require("../config/mail");
const { handleUserSessionCreate } = require("../utils/helpers/authHelper");
const { generateOtp, BCRYPT_ROUNDS } = require("../utils/helper");

async function loginUser(req, res) {
  try {
    // Validate request body
    const schema = Joi.object({
      login: Joi.string().trim().required().messages({
        "any.required": "Login is required.",
      }),
      password: Joi.string().min(8).required().messages({
        "string.min": "Password must be at least 8 characters long.",
        "any.required": "Password is required.",
      }),
    });

    const { error, value } = schema.validate(req.body, {
      abortEarly: true,
      stripUnknown: true,
    });

    if (error) {
      return res.status(400).json({
        success: false,
        message: error.details[0].message,
        data: null,
      });
    }

    const { login, password } = value;

    // Detect identifier type
    const isEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(login);
    const isPhone = /^[0-9]{6,15}$/.test(login);

    let user = null;

    if (isEmail) user = await User.findOne({ where: { email: login } });
    else if (isPhone) user = await User.findOne({ where: { phone: login } });
    else user = await User.findOne({ where: { username: login } });

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "Invalid credentials",
        data: null,
      });
    }

    // Block Google-only logins via password
    if (user.auth_provider === "google" && !user.password) {
      return res.status(400).json({
        success: false,
        code: "THIRD_PARTY_ACCOUNT",
        message: "This account was created using Google login. Please use 'Login with Google'.",
      });
    }

    if (user.status !== "active") {
      return res.status(403).json({
        success: false,
        message: "Your account is not active. Please contact support.",
      });
    }

    // Compare password
    const isCorrect = await bcrypt.compare(password, user.password || "");
    if (!isCorrect) {
      return res.status(401).json({
        success: false,
        message: "Invalid credentials",
      });
    }

    // Create session
    const { token, expiresAt } = await handleUserSessionCreate(user, req);

    await user.reload({
      attributes: ["id", "username", "email", "phone", "avatar", "type", "auth_provider"],
    });

    return res.status(200).json({
      success: true,
      message: "Login successful",
      data: {
        user,
        token,
        tokenExpiresAt: expiresAt,
      },
    });
  } catch (err) {
    return res.status(500).json({
      success: false,
      message: "Login failed",
    });
  }
}


async function forgotPassword(req, res) {
  try {
    // Validate input
    const schema = Joi.object({
      email: Joi.string().email().required().messages({
        "string.email": "Email must be valid",
        "any.required": "Email is required",
      }),
    });

    const { error, value } = schema.validate(req.body, {
      abortEarly: true,
      stripUnknown: true,
    });

    if (error) {
      return res.status(400).json({
        success: false,
        message: error.details[0].message,
      });
    }

    const { email } = value;

    // Find user
    const user = await User.findOne({ where: { email } });

    // Do not reveal whether user exists
    if (!user) {
      return res.status(200).json({
        success: true,
        message: "OTP sent if email is correct.",
      });
    }

    // Block Google-only accounts
    if (user.auth_provider === "google" && !user.password) {
      return res.status(400).json({
        success: false,
        message: "This account was created using Google login. Please use 'Login with Google'.",
      });
    }

    // Generate OTP
    const OTP_VALID_MINUTES = 10;
    const otp = generateOtp();
    const otpExpiration = new Date(Date.now() + OTP_VALID_MINUTES * 60 * 1000);

    // Save OTP
    await UserOTP.create({
      userId: user.id,
      otp,
      expiry: otpExpiration,
      action: "forgot_password",
      status: 0,
    });

    // Send email
    try {
      await transporter.sendMail({
        from: '"Dating App" <no-reply@dating-app.com>',
        to: user.email,
        subject: "Password Reset OTP",
        html: `
          <p>Your OTP is: <b>${otp}</b></p>
          <p>This OTP is valid for ${OTP_VALID_MINUTES} minutes.</p>
        `,
      });
    } catch (mailErr) {
      // Do not expose mail errors to user
    }

    return res.status(200).json({
      success: true,
      message: "OTP sent if email is correct.",
      action: "forgot_password",
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  }
}

async function forgotPasswordVerify(req, res) {
  try {
    // Validate input
    const schema = Joi.object({
      email: Joi.string().trim().email().required(),
      password: Joi.string().trim().min(8).required(),
      otp: Joi.string().length(6).pattern(/^[0-9]{6}$/).required(),
    });

    const { error, value } = schema.validate(req.body, {
      abortEarly: true,
      stripUnknown: true,
    });

    if (error) {
      return res.status(400).json({
        success: false,
        message: error.details[0].message,
      });
    }

    const { email, password, otp } = value;

    // Find user
    const user = await User.findOne({ where: { email } });
    if (!user) {
      return res.status(400).json({
        success: false,
        message: "User not found",
      });
    }

    // Find valid OTP
    const otpRecord = await UserOTP.findOne({
      where: {
        userId: user.id,
        action: "forgot_password",
        status: 0,
        expiry: { [Op.gt]: new Date() },
      },
      order: [["createdAt", "DESC"]],
    });

    if (!otpRecord || String(otpRecord.otp) !== String(otp)) {
      return res.status(400).json({
        success: false,
        message: "Invalid OTP or expired.",
      });
    }

    // Update password
    const hashed = await bcrypt.hash(password, BCRYPT_ROUNDS);

    await user.update({
      password: hashed,
      auth_provider: "password",
    });

    // Mark OTP as used
    await otpRecord.update({ status: 1 });

    return res.status(200).json({
      success: true,
      message: "Password updated successfully.",
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  }
}

module.exports = {
  loginUser,
  forgotPassword,
  forgotPasswordVerify,
};
