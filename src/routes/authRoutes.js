const express = require("express");
const router = express.Router();
const authController = require("../controllers/authController");
const { authorizeRoles } = require("../controllers/authController");
const { verifyToken } = require("../middlewares/verifyToken");
const multer = require("multer");
const storage = multer.memoryStorage();
const upload = multer({ storage: storage });

router.post("/register", authController.register);
router.post("/login", authController.login);
router.post("/verify-otp", authController.verifyOTP);
router.post("/reset-password-request", authController.resetPasswordRequest);
router.post("/reset-password", authController.resetPassword);
router.post("/forgot-password-request", authController.forgotPasswordRequest);
router.get("/user-data", verifyToken, authController.getUserData);
router.put("/user-data", verifyToken, authController.updateUserData);
router.post(
  "/verify-forgot-password-otp",
  authController.verifyForgotPasswordOTP
);
router.post("/change-forgot-password", authController.changeForgotPassword);
router.post("/resend-otp", authController.resendOTP);
router.get(
  "/superadmin-data",
  verifyToken,
  authorizeRoles("superadmin"),
  (req, res) => {
    res.status(200).json({ message: "Superadmin access granted" });
  }
);
router.get(
  "/admin-data",
  verifyToken,
  authorizeRoles("superadmin", "admin"),
  (req, res) => {
    res.status(200).json({ message: "Admin access granted" });
  }
);
router.get(
  "/nurse-data",
  verifyToken,
  authorizeRoles("superadmin", "admin", "nurse"),
  (req, res) => {
    res.status(200).json({ message: "Nurse access granted" });
  }
);
router.post("/set-initial-password", authController.setInitialPassword);
router.get("/2fa-status", authController.get2FAStatus);
router.post("/toggle-2fa/:userId", authController.toggle2FA);
router.delete('/delete-account/:userId', authController.initiateDeleteAccount);
router.post('/delete-account/:userId/verify', authController.verifyDeleteAccount);
router.delete('/delete-account/:userId/confirm', authController.confirmDeleteAccount);
router.get("/user/:userId", verifyToken, authController.getUserById);
module.exports = router;
