const jwt = require("jsonwebtoken");
const User = require("../models/user");
const nodemailer = require("nodemailer");
const crypto = require("crypto");
const { encrypt, decrypt } = require("../utils/encryption");
const Nurse = require("../models/nurse");

const generateOTP = () =>
  Math.floor(100000 + Math.random() * 900000).toString();

async function generateEmailHash(email) {
  return crypto.createHash("sha256").update(email).digest("hex");
}
const transporter = nodemailer.createTransport({
  service: "Gmail",
  auth: {
    user: process.env.EMAIL,
    pass: process.env.EMAIL_PASSWORD,
  },
});

const generateToken = (userId, role) => {
  return jwt.sign({ userId, role }, process.env.JWT_SECRET, {
    expiresIn: "48h",
  });
};

const getEmailTemplate = (type, code) => {
  const templates = {
    "2FA": {
      subject: "Your AutoChart 2FA Code",
      html: `
        <div style="background-color: #f4f4f4; padding: 20px; font-family: Arial, sans-serif;">
          <div style="max-width: 600px; margin: 0 auto; background-color: white; padding: 30px; border-radius: 10px; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">
            <div style="text-align: center; margin-bottom: 30px;">
              <img src="https://autochart.netlify.app/static/media/autochart-logo.947d7bfba8e3bb872893.png" alt="AutoChart Logo" style="width: 150px;">
            </div>
            <h1 style="color: #7C4DFF; text-align: center; margin-bottom: 20px;">Two-Factor Authentication</h1>
            <p style="color: #666; font-size: 16px; line-height: 24px; margin-bottom: 30px;">
              Please use the following code to complete your login:
            </p>
            <div style="background-color: #F3F0FF; padding: 20px; border-radius: 8px; text-align: center; margin-bottom: 30px;">
              <span style="color: #7C4DFF; font-size: 32px; font-weight: bold; letter-spacing: 5px;">${code}</span>
            </div>
            <p style="color: #666; font-size: 14px; text-align: center;">
              This code will expire in 5 minutes.<br>
              If you didn't request this code, please ignore this email.
            </p>
          </div>
        </div>
      `,
    },
    PASSWORD_RESET: {
      subject: "Password Reset Request",
      html: `
        <div style="background-color: #f4f4f4; padding: 20px; font-family: Arial, sans-serif;">
          <div style="max-width: 600px; margin: 0 auto; background-color: white; padding: 30px; border-radius: 10px; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">
            <div style="text-align: center; margin-bottom: 30px;">
              <img src="https://autochart.netlify.app/static/media/autochart-logo.947d7bfba8e3bb872893.png" alt="AutoChart Logo" style="width: 150px;">
            </div>
            <h1 style="color: #7C4DFF; text-align: center; margin-bottom: 20px;">Password Reset Code</h1>
            <p style="color: #666; font-size: 16px; line-height: 24px; margin-bottom: 30px;">
              You requested to reset your password. Use this code to continue:
            </p>
            <div style="background-color: #F3F0FF; padding: 20px; border-radius: 8px; text-align: center; margin-bottom: 30px;">
              <span style="color: #7C4DFF; font-size: 32px; font-weight: bold; letter-spacing: 5px;">${code}</span>
            </div>
            <p style="color: #666; font-size: 14px; text-align: center;">
              This code will expire in 5 minutes.<br>
              If you didn't request this password reset, please ignore this email.
            </p>
          </div>
        </div>
      `,
    },
  };
  return templates[type];
};

exports.register = async (req, res) => {
  try {
    const { email, password, role } = req.body;

    // Validate role
    if (!["superadmin", "admin", "nurse"].includes(role)) {
      return res.status(400).json({
        error: "Invalid role. Role must be superadmin, admin, or nurse",
      });
    }

    // Validate superadmin
    if (role === "superadmin") {
      const existingSuperadmin = await User.findOne({ role: "superadmin" });
      if (existingSuperadmin) {
        return res.status(400).json({
          error: "A superadmin account already exists in the system",
        });
      }
    }

    // Check for existing user
    const emailLookup = await generateEmailHash(email);
    const existingUser = await User.findOne({ emailHash: emailLookup });
    if (existingUser) {
      return res.status(400).json({
        error: "An account with this email already exists",
      });
    }

    // Validate password
    if (!password || password.length < 8) {
      return res.status(400).json({
        error: "Password must be at least 8 characters long",
      });
    }

    const user = new User({ email, password, role, emailHash: emailLookup });
    await user.save();
    res.status(201).json({ message: "Account created successfully" });
  } catch (error) {
    console.error("Registration error:", error);
    res.status(500).json({
      error: "Failed to create account. Please try again later",
    });
  }
};

exports.login = async (req, res) => {
  try {
    const { email, password } = req.body;

    // Validate input
    if (!email || !password) {
      return res.status(400).json({
        error: "Email and password are required",
      });
    }

    const emailLookup = await generateEmailHash(email);
    const user = await User.findOne({ emailHash: emailLookup });

    if (!user) {
      return res.status(401).json({
        error: "No account found with this email address",
      });
    }

    const isPasswordValid = await user.comparePassword(password);
    if (!isPasswordValid) {
      return res.status(401).json({
        error: "Incorrect password. Please try again",
      });
    }

    // Check account status
    if (user.isLocked) {
      return res.status(403).json({
        error: "Account is locked. Please contact support",
      });
    }

    if (user.isDisabled) {
      return res.status(403).json({
        error: "Account is disabled. Please contact your administrator",
      });
    }

    // Handle 2FA
    if (!user.is2FAEnabled) {
      const token = generateToken(user._id, user.role);
      user.lastLogin = new Date();
      await user.save();

      return res.status(200).json({
        message: "Login successful",
        token,
        role: user.role,
      });
    }

    // Check 12-hour window for 2FA
    const now = Date.now();
    if (
      user.lastLogin &&
      now - new Date(user.lastLogin).getTime() <= 12 * 60 * 60 * 1000
    ) {
      const token = generateToken(user._id, user.role);
      user.lastLogin = new Date();
      await user.save();

      return res.status(200).json({
        message: "Login successful, OTP verification skipped",
        token,
        role: user.role,
      });
    }

    // Send OTP
    const otp = generateOTP();
    user.otp = otp;
    user.otpExpiresAt = Date.now() + 300000; // 5 minutes
    user.lastLogin = null;
    await user.save();

    const emailTemplate = getEmailTemplate("2FA", otp);
    await transporter.sendMail({
      to: email,
      subject: emailTemplate.subject,
      html: emailTemplate.html,
    });

    res.status(200).json({
      message: "OTP sent to your email",
      role: user.role,
    });
  } catch (error) {
    console.error("Login error:", error);
    res.status(500).json({
      error: "Login failed. Please try again later",
    });
  }
};

exports.verifyOTP = async (req, res) => {
  try {
    const { email, otp } = req.body;
    const emailLookup = await generateEmailHash(email);
    const user = await User.findOne({ emailHash: emailLookup });

    if (!user) {
      return res.status(400).json({ error: "Invalid email" });
    }

    if (user.otp !== otp) {
      return res.status(400).json({ error: "Invalid OTP" });
    }

    if (user.otpExpiresAt < Date.now()) {
      return res.status(400).json({ error: "OTP has expired" });
    }

    user.otp = null;
    user.otpExpiresAt = null;
    user.lastLogin = new Date();
    await user.save();

    const token = generateToken(user._id, user.role);
    res.status(200).json({
      message: "2FA verification successful",
      token,
      role: user.role,
    });
  } catch (error) {
    console.error("Error in verifyOTP:", error);
    res.status(400).json({ error: error.message });
  }
};

exports.resendOTP = async (req, res) => {
  try {
    const { email } = req.body;
    const emailLookup = await generateEmailHash(email);
    const user = await User.findOne({ emailHash: emailLookup });
    if (!user) return res.status(400).json({ error: "Invalid email" });

    const otp = generateOTP();
    user.otp = otp;
    user.otpExpiresAt = Date.now() + 300000;
    await user.save();

    const emailTemplate = getEmailTemplate("2FA", otp);
    await transporter.sendMail({
      to: email,
      subject: emailTemplate.subject,
      html: emailTemplate.html,
    });

    res.status(200).json({ message: "New OTP sent to your email" });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
};

exports.resetPasswordRequest = async (req, res) => {
  try {
    const { email } = req.body;
    const emailLookup = await generateEmailHash(email);
    const user = await User.findOne({ emailHash: emailLookup });
    if (!user) throw new Error("User not found");

    const resetToken = crypto.randomBytes(32).toString("hex");
    user.resetToken = resetToken;
    user.resetTokenExpiresAt = Date.now() + 3600000;
    await user.save();

    await transporter.sendMail({
      to: user.email,
      subject: "Password Reset Token",
      text: `Your password reset token is ${resetToken}. It expires in 1 hour.`,
    });

    res
      .status(200)
      .json({ message: "Password reset token sent to your email" });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
};

exports.authorizeRoles = (...roles) => {
  return (req, res, next) => {
    if (!req.user || !roles.includes(req.user.role)) {
      return res
        .status(403)
        .json({ error: "Access denied: insufficient permissions" });
    }
    next();
  };
};

exports.resetPassword = async (req, res) => {
  try {
    const token = req.headers["authorization"]?.split(" ")[1];
    if (!token) {
      return res.status(401).json({ error: "Authorization token is required" });
    }
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const userId = decoded.userId;
    const { oldPassword, newPassword } = req.body;
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }
    const isOldPasswordCorrect = await user.comparePassword(oldPassword);
    if (!isOldPasswordCorrect) {
      return res.status(400).json({ error: "Old password is incorrect" });
    }
    user.password = newPassword;
    await user.save();
    res.status(200).json({ message: "Password reset successful" });
  } catch (error) {
    if (error.name === "JsonWebTokenError") {
      return res.status(401).json({ error: "Invalid token" });
    }
    if (error.name === "TokenExpiredError") {
      return res.status(401).json({ error: "Token has expired" });
    }
    res.status(400).json({ error: error.message });
  }
};

exports.forgotPasswordRequest = async (req, res) => {
  try {
    const { email } = req.body;
    const emailLookup = await generateEmailHash(email);
    const user = await User.findOne({ emailHash: emailLookup });
    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    const otp = generateOTP();
    user.resetToken = otp;
    user.resetTokenExpiresAt = Date.now() + 300000;
    user.resetUsed = false;
    await user.save();

    console.log("Generated OTP:", otp);
    console.log("Stored OTP in DB:", user.resetToken);

    const emailTemplate = getEmailTemplate("PASSWORD_RESET", otp);
    await transporter.sendMail({
      to: email,
      subject: emailTemplate.subject,
      html: emailTemplate.html,
    });

    res.status(200).json({ message: "OTP sent to your email" });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
};

exports.verifyForgotPasswordOTP = async (req, res) => {
  try {
    const { email, otp } = req.body;

    const emailLookup = await generateEmailHash(email);
    const user = await User.findOne({ emailHash: emailLookup });
    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    console.log("Stored OTP in DB:", user.resetToken);
    console.log("Request OTP:", otp);

    if (user.resetToken.trim() !== otp.trim()) {
      return res.status(400).json({ error: "Invalid OTP" });
    }

    if (user.resetTokenExpiresAt < Date.now()) {
      return res.status(400).json({ error: "OTP has expired" });
    }

    user.resetToken = null;
    user.resetTokenExpiresAt = null;
    user.resetUsed = false;
    await user.save();

    res.status(200).json({ message: "OTP verified successfully" });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
};

exports.changeForgotPassword = async (req, res) => {
  try {
    const { email, newPassword, confirmPassword } = req.body;
    if (newPassword !== confirmPassword) {
      return res.status(400).json({ error: "Passwords do not match" });
    }

    const emailLookup = await generateEmailHash(email);
    const user = await User.findOne({ emailHash: emailLookup });
    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    if (user.resetUsed) {
      return res.status(400).json({
        error:
          "Password reset process has already been used. Please verify a new OTP.",
      });
    }
    user.password = newPassword;
    user.resetUsed = true;
    await user.save();

    res.status(200).json({ message: "Password changed successfully" });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
};

exports.getUserData = async (req, res) => {
  try {
    const user = await User.findById(req.user?.userId).select("-password");
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }
    const decryptedUser = {
      ...user.toObject(),
      firstName: user.firstName ? decrypt(user.firstName) : undefined,
      lastName: user.lastName ? decrypt(user.lastName) : undefined,
      phoneNumber: user.phoneNumber ? decrypt(user.phoneNumber) : undefined,
      email: user.email,
      role: user.role,
      dob: user.dob,
      age: user.age,
      profilePicture: user.profilePicture,
      is2FAEnabled: user.is2FAEnabled,
      lastLogin: user.lastLogin,
      associateNurseId: user.associateNurseId,
    };

    res.status(200).json(decryptedUser);
  } catch (error) {
    console.error("Error retrieving user data:", error);
    res.status(500).json({ message: "Internal Server Error" });
  }
};

const { validationResult } = require("express-validator");

exports.updateUserData = async (req, res) => {
  const { firstName, lastName, dob, age, phoneNumber, profilePicture } =
    req.body;

  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const user = await User.findById(req.user?.userId);
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    // Encrypt sensitive data before saving
    if (firstName !== undefined) user.firstName = encrypt(firstName);
    if (lastName !== undefined) user.lastName = encrypt(lastName);
    if (phoneNumber !== undefined) user.phoneNumber = encrypt(phoneNumber);

    // Non-sensitive data stored as is
    if (dob !== undefined) user.dob = dob;
    if (age !== undefined) user.age = age;
    if (profilePicture !== undefined) user.profilePicture = profilePicture;

    // If the user is a nurse, update the nurse record as well
    if (user.role === "nurse") {
      const nurse = await Nurse.findOne({ email: user.email });
      if (nurse) {
        // Update nurse data with encrypted values
        if (firstName !== undefined) nurse.firstName = encrypt(firstName);
        if (lastName !== undefined) nurse.lastName = encrypt(lastName);
        if (phoneNumber !== undefined) nurse.phoneNumber = encrypt(phoneNumber);
        await nurse.save();
      }
    }

    await user.save();

    // Decrypt data for response
    const responseUser = {
      firstName: decrypt(user.firstName),
      lastName: decrypt(user.lastName),
      phoneNumber: user.phoneNumber ? decrypt(user.phoneNumber) : undefined,
      dob: user.dob,
      age: user.age,
      profilePicture: user.profilePicture,
    };

    res.status(200).json({
      message: "User data updated successfully",
      user: responseUser,
    });
  } catch (error) {
    console.error("Error updating user data:", error);
    res.status(500).json({ message: "Internal Server Error" });
  }
};

exports.setInitialPassword = async (req, res) => {
  try {
    const { email, token, password } = req.body;

    const emailHash = await generateEmailHash(email);
    const user = await User.findOne({ emailHash });

    // Check if user exists
    if (!user) {
      return res.status(404).json({
        error: "User not found",
      });
    }

    // Check if token has already been used
    if (user.resetUsed) {
      return res.status(400).json({
        error:
          "This link has already been used to set password. Please request a new password reset if needed.",
      });
    }

    // Validate token and expiration
    if (!user.resetToken || user.resetToken !== token) {
      return res.status(400).json({
        error: "Invalid password reset token",
      });
    }

    if (!user.resetTokenExpiresAt || user.resetTokenExpiresAt < Date.now()) {
      return res.status(400).json({
        error: "Password reset token has expired. Please request a new one.",
      });
    }

    // Set new password and mark token as used
    user.password = password;
    user.resetToken = null;
    user.resetTokenExpiresAt = null;
    user.resetUsed = true; // Mark as used to prevent future use
    await user.save();

    res.status(200).json({
      message: "Password set successfully. You can now login.",
    });
  } catch (error) {
    console.error("Error in setInitialPassword:", error);
    res.status(400).json({ error: error.message });
  }
};

exports.toggle2FA = async (req, res) => {
  try {
    const token = req.headers["authorization"]?.split(" ")[1];
    if (!token) {
      return res.status(401).json({ error: "Authorization token is required" });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    const targetUserId = req.params.userId || decoded.userId;

    const user = await User.findById(targetUserId);
    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    // If trying to modify another user's 2FA, check if authorized
    if (
      targetUserId !== decoded.userId &&
      !["superadmin", "admin"].includes(decoded.role)
    ) {
      return res
        .status(403)
        .json({ error: "Not authorized to modify other user's 2FA status" });
    }

    // Toggle 2FA status
    user.is2FAEnabled = !user.is2FAEnabled;
    await user.save();

    res.status(200).json({
      userId: user._id,
      email: user.email,
      message: `Two-factor authentication has been ${
        user.is2FAEnabled ? "enabled" : "disabled"
      }`,
      is2FAEnabled: user.is2FAEnabled,
    });
  } catch (error) {
    console.error("Toggle 2FA error:", error);
    if (error.name === "JsonWebTokenError") {
      return res.status(401).json({ error: "Invalid token" });
    }
    if (error.name === "TokenExpiredError") {
      return res.status(401).json({ error: "Token has expired" });
    }
    res.status(500).json({ error: error.message });
  }
};

exports.get2FAStatus = async (req, res) => {
  try {
    const token = req.headers["authorization"]?.split(" ")[1];
    if (!token) {
      return res.status(401).json({ error: "Authorization token is required" });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const user = await User.findById(decoded.userId);

    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    res.status(200).json({
      is2FAEnabled: user.is2FAEnabled,
    });
  } catch (error) {
    if (error.name === "JsonWebTokenError") {
      return res.status(401).json({ error: "Invalid token" });
    }
    if (error.name === "TokenExpiredError") {
      return res.status(401).json({ error: "Token has expired" });
    }
    res.status(500).json({ error: error.message });
  }
};

exports.initiateDeleteAccount = async (req, res) => {
  try {
    const token = req.headers["authorization"]?.split(" ")[1];
    if (!token) {
      return res.status(401).json({ error: "Authorization token is required" });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const tokenUserId = decoded.userId;
    const { userId } = req.params;

    if (tokenUserId !== userId) {
      return res
        .status(403)
        .json({ error: "Unauthorized to delete this account" });
    }

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    const newOTP = generateOTP();
    user.otp = newOTP;
    user.otpExpiresAt = Date.now() + 300000; // 5 minutes
    await user.save();

    const emailTemplate = {
      subject: "Account Deletion Verification",
      html: `
        <div style="background-color: #f4f4f4; padding: 20px; font-family: Arial, sans-serif;">
          <div style="max-width: 600px; margin: 0 auto; background-color: white; padding: 30px; border-radius: 10px; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">
            <div style="text-align: center; margin-bottom: 30px;">
              <img src="https://autochart.netlify.app/static/media/autochart-logo.947d7bfba8e3bb872893.png" alt="AutoChart Logo" style="width: 150px;">
            </div>
            <h1 style="color: #DC2626; text-align: center; margin-bottom: 20px;">Account Deletion Request</h1>
            <p style="color: #666; font-size: 16px; line-height: 24px; margin-bottom: 30px;">
              We received a request to delete your AutoChart account. To confirm this action, please use the following verification code:
            </p>
            <div style="background-color: #FEF2F2; padding: 20px; border-radius: 8px; text-align: center; margin-bottom: 30px;">
              <span style="color: #DC2626; font-size: 32px; font-weight: bold; letter-spacing: 5px;">${newOTP}</span>
            </div>
            <p style="color: #666; font-size: 14px; text-align: center;">
              This code will expire in 5 minutes.<br>
              If you didn't request to delete your account, please ignore this email and ensure your account is secure.
            </p>
            <div style="margin-top: 30px; padding-top: 20px; border-top: 1px solid #eee; text-align: center; color: #666; font-size: 12px;">
              <p>This is a system-generated email. Please do not reply to this message.</p>
            </div>
          </div>
        </div>
      `,
    };

    await transporter.sendMail({
      to: user.email,
      subject: emailTemplate.subject,
      html: emailTemplate.html,
    });

    return res.status(200).json({
      message: "Please check your email for the verification code",
      success: true,
    });
  } catch (error) {
    console.error("Error in initiateDeleteAccount:", error);
    res.status(500).json({ error: "Failed to initiate account deletion" });
  }
};

exports.verifyDeleteAccount = async (req, res) => {
  try {
    const token = req.headers["authorization"]?.split(" ")[1];
    if (!token) {
      return res.status(401).json({ error: "Authorization token is required" });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const tokenUserId = decoded.userId;
    const { userId } = req.params;
    const { otp } = req.body;

    if (tokenUserId !== userId) {
      return res
        .status(403)
        .json({ error: "Unauthorized to delete this account" });
    }

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    if (!otp || !user.otp || user.otp !== otp) {
      return res.status(400).json({ error: "Invalid verification code" });
    }

    if (user.otpExpiresAt < Date.now()) {
      return res.status(400).json({ error: "Verification code has expired" });
    }

    return res.status(200).json({
      message: "OTP verified successfully",
      success: true,
    });
  } catch (error) {
    console.error("Error in verifyDeleteAccount:", error);
    res.status(500).json({ error: "Failed to verify account deletion" });
  }
};

exports.confirmDeleteAccount = async (req, res) => {
  try {
    const token = req.headers["authorization"]?.split(" ")[1];
    if (!token) {
      return res.status(401).json({ error: "Authorization token is required" });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const tokenUserId = decoded.userId;
    const { userId } = req.params;

    if (tokenUserId !== userId) {
      return res
        .status(403)
        .json({ error: "Unauthorized to delete this account" });
    }

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    if (user.role === "nurse") {
      await Nurse.findOneAndDelete({ email: user.email });
    }

    await User.findByIdAndDelete(userId);
    return res.status(200).json({
      message: "Account deleted successfully",
      success: true,
    });
  } catch (error) {
    console.error("Error in confirmDeleteAccount:", error);
    res.status(500).json({ error: "Failed to confirm account deletion" });
  }
};

exports.getUserById = async (req, res) => {
  try {
    const { userId } = req.params;
    const user = await User.findById(userId).select("-password -resetToken -resetTokenExpiresAt -otp -otpExpiresAt");
    
    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    // Decrypt sensitive data
    const decryptedUser = {
      ...user.toObject(),
      firstName: user.firstName ? decrypt(user.firstName) : undefined,
      lastName: user.lastName ? decrypt(user.lastName) : undefined,
      phoneNumber: user.phoneNumber ? decrypt(user.phoneNumber) : undefined,
      email: user.email,
      role: user.role,
    };

    res.status(200).json(decryptedUser);
  } catch (error) {
    console.error("Error fetching user by ID:", error);
    res.status(500).json({ error: "Failed to fetch user details" });
  }
};
