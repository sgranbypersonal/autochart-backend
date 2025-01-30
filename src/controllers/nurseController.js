const mongoose = require("mongoose");
const Nurse = require("../models/nurse");
const Patient = require("../models/patient");
const User = require("../models/user");
const crypto = require("crypto");
const nodemailer = require("nodemailer");
const { encrypt, decrypt } = require("../utils/encryption");

const transporter = nodemailer.createTransport({
  service: "Gmail",
  auth: {
    user: process.env.EMAIL,
    pass: process.env.EMAIL_PASSWORD,
  },
});

const getWelcomeEmailTemplate = (resetLink, nurseData) => {
  return {
    subject: "Welcome to AutoChart - Set Your Password",
    html: `
      <div style="background-color: #f4f4f4; padding: 20px; font-family: Arial, sans-serif;">
        <div style="max-width: 600px; margin: 0 auto; background-color: white; padding: 30px; border-radius: 10px; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">
          <div style="text-align: center; margin-bottom: 30px;">
            <img src="https://autochart.netlify.app/static/media/autochart-logo.947d7bfba8e3bb872893.png" alt="AutoChart Logo" style="width: 150px;">
          </div>
          <h1 style="color: #7C4DFF; text-align: center; margin-bottom: 20px;">Welcome to AutoChart!</h1>
          <p style="color: #666; font-size: 16px; line-height: 24px; margin-bottom: 20px;">
            Dear ${nurseData.firstName} ${nurseData.lastName},
          </p>
          <p style="color: #666; font-size: 16px; line-height: 24px; margin-bottom: 20px;">
            An account has been created for you as a nurse on the AutoChart platform. To get started, you'll need to set up your password.
          </p>
          <div style="text-align: center; margin: 30px 0;">
            <a href="${resetLink}" style="background-color: #7C4DFF; color: white; padding: 12px 30px; text-decoration: none; border-radius: 5px; font-weight: bold; display: inline-block;">Set Your Password</a>
          </div>
          <div style="background-color: #F3F0FF; padding: 20px; border-radius: 8px; margin-bottom: 30px;">
            <p style="color: #666; font-size: 14px; margin: 0;">
              <strong>Important:</strong> This link will expire in 24 hours for security reasons.
            </p>
          </div>
          <p style="color: #666; font-size: 14px; text-align: center; margin-top: 30px;">
            If you didn't expect this invitation, please ignore this email or contact support.
          </p>
        </div>
      </div>
    `,
  };
};

exports.createNurse = async (req, res) => {
  try {
    // Generate email hash from the plain email
    const emailHash = crypto
      .createHash("sha256")
      .update(req.body.email)
      .digest("hex");

    // Check for existing user using the email hash
    const existingUser = await User.findOne({ emailHash });
    if (existingUser) {
      return res.status(400).json({
        error: "A user with this email already exists",
      });
    }

    // Check for existing nurse using the plain email
    const existingNurse = await Nurse.findOne({ email: req.body.email });
    if (existingNurse) {
      return res.status(400).json({
        error: "A nurse with this email already exists",
      });
    }

    // Proceed with user and nurse creation
    const resetToken = crypto.randomBytes(32).toString("hex");
    const nurseUser = new User({
      email: req.body.email,
      emailHash: emailHash,
      password: crypto.randomBytes(20).toString("hex"),
      role: req.body.role,
      unit: req.body.unit,
      firstName: encrypt(req.body.firstName),
      lastName: encrypt(req.body.lastName),
      phoneNumber: encrypt(req.body.phoneNumber),
      resetToken: resetToken,
      resetTokenExpiresAt: Date.now() + 24 * 60 * 60 * 1000,
      resetUsed: false,
    });
    await nurseUser.save();

    const newNurse = new Nurse({
      firstName: encrypt(req.body.firstName),
      lastName: encrypt(req.body.lastName),
      email: encrypt(req.body.email),
      phoneNumber: encrypt(req.body.phoneNumber),
      address: encrypt(req.body.address),
      role: req.body.role,
      unit: req.body.unit,
      createdBy: req.user.userId,
      userId: nurseUser._id,
    });
    await newNurse.save();

    const resetLink = `${
      process.env.FRONTEND_URL
    }/set-password?token=${resetToken}&email=${encodeURIComponent(
      req.body.email
    )}`;

    const emailTemplate = getWelcomeEmailTemplate(resetLink, req.body);
    await transporter.sendMail({
      to: req.body.email,
      subject: emailTemplate.subject,
      html: emailTemplate.html,
    });
    const responseNurse = {
      ...newNurse.toObject(),
      firstName: decrypt(newNurse.firstName),
      lastName: decrypt(newNurse.lastName),
      phoneNumber: decrypt(newNurse.phoneNumber),
      address: newNurse.address ? decrypt(newNurse.address) : undefined,
      nurseName: decrypt(newNurse.nurseName),
    };

    res.status(201).json({
      nurse: responseNurse,
      message:
        "Nurse account created successfully. Password set instructions sent to email.",
    });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
};

exports.getMyNurses = async (req, res) => {
  try {
    const nurses = await Nurse.find({ createdBy: req.user.userId })
      .populate("userId")
      .populate("createdBy");

    const nurseData = await Promise.all(
      nurses.map(async (nurse) => {
        const patientsAssigned = await Patient.countDocuments({
          "assignedTo.nurseId": new mongoose.Types.ObjectId(nurse._id),
        });
        const decryptedNurse = decryptNurseData(nurse);
        return { ...decryptedNurse, noOfPatientsAssigned: patientsAssigned };
      })
    );
    res.json(nurseData);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// Helper function to decrypt nurse data
const decryptNurseData = (nurse) => {
  if (!nurse) return null;
  const nurseObj = nurse.toObject();
  return {
    ...nurseObj,
    firstName: nurseObj.firstName ? decrypt(nurseObj.firstName) : undefined,
    lastName: nurseObj.lastName ? decrypt(nurseObj.lastName) : undefined,
    email: nurseObj.email ? decrypt(nurseObj.email) : undefined,
    phoneNumber: nurseObj.phoneNumber
      ? decrypt(nurseObj.phoneNumber)
      : undefined,
    address: nurseObj.address ? decrypt(nurseObj.address) : undefined,
    nurseName: nurseObj.nurseName ? decrypt(nurseObj.nurseName) : undefined,
  };
};

exports.getAllNurses = async (req, res) => {
  try {
    const nurses = await Nurse.find();
    const nurseData = await Promise.all(
      nurses.map(async (nurse) => {
        const patientsAssigned = await Patient.countDocuments({
          "assignedTo.nurseId": new mongoose.Types.ObjectId(nurse._id),
        });
        const decryptedNurse = decryptNurseData(nurse);
        return { ...decryptedNurse, noOfPatientsAssigned: patientsAssigned };
      })
    );
    res.json(nurseData);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

exports.getNurses = async (req, res) => {
  try {
    const role = req.user.role;

    if (role === "nurse") {
      return res.json([]);
    }

    if (role === "admin") {
      const nurses = await Nurse.find({ createdBy: req.user.userId });

      const nurseData = await Promise.all(
        nurses.map(async (nurse) => {
          const patientsAssigned = await Patient.countDocuments({
            "assignedTo.nurseId": new mongoose.Types.ObjectId(nurse._id),
          });
          const decryptedNurse = decryptNurseData(nurse);
          return { ...decryptedNurse, noOfPatientsAssigned: patientsAssigned };
        })
      );

      return res.json(nurseData);
    }

    if (role === "superadmin") {
      return res.status(403).json({
        error: "Superadmins should use `myNurses` or `allNurses` endpoints.",
      });
    }
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

exports.getSingleNurse = async (req, res) => {
  try {
    const nurse = await Nurse.findById(req.params.id);
    if (!nurse) {
      return res.status(404).json({ message: "Nurse not found" });
    }

    const patientsAssigned = await Patient.countDocuments({
      "assignedTo.nurseId": new mongoose.Types.ObjectId(nurse._id),
    });

    // Use the decryptNurseData helper function to decrypt the data
    const decryptedNurse = decryptNurseData(nurse);

    res.json({
      ...decryptedNurse,
      noOfPatientsAssigned: patientsAssigned,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

exports.updateNurseById = async (req, res) => {
  try {
    if (req.user.role === "nurse" && req.user.userId !== req.params.id) {
      return res
        .status(403)
        .json({ error: "Nurses can only edit their own profile" });
    }

    // First find the nurse to get their email
    const nurse = await Nurse.findById(req.params.id);
    if (!nurse) {
      return res.status(404).json({ message: "Nurse not found" });
    }

    // Decrypt the email to generate the correct email hash
    const decryptedEmail = decrypt(nurse.email);
    const emailHash = crypto
      .createHash("sha256")
      .update(decryptedEmail)
      .digest("hex");

    // Create update objects for both collections
    const nurseUpdateData = {
      firstName: req.body.firstName,
      lastName: req.body.lastName,
      phoneNumber: req.body.phoneNumber,
      address: req.body.address,
      role: req.body.role,
      ...req.body,
    };

    // Encrypt sensitive data for user collection
    const userUpdateData = {
      firstName: encrypt(req.body.firstName),
      lastName: encrypt(req.body.lastName),
      phoneNumber: encrypt(req.body.phoneNumber),
      role: req.body.role,
    };

    // Update both nurse and user documents
    const [updatedNurse, updatedUser] = await Promise.all([
      // Update nurse document with plain text
      Nurse.findByIdAndUpdate(req.params.id, nurseUpdateData, { new: true }),
      // Update corresponding user document with encrypted data
      User.findOneAndUpdate({ emailHash }, userUpdateData, {
        new: true,
      }),
    ]);

    if (!updatedUser) {
      console.warn(
        `User record not found for nurse with email: ${decryptedEmail}`
      );
    }

    if (!updatedNurse) {
      return res.status(404).json({ message: "Failed to update nurse record" });
    }

    res.json({
      nurse: updatedNurse,
      message: "Nurse profile updated successfully",
    });
  } catch (err) {
    console.error("Error in updateNurseById:", err);
    res.status(400).json({ error: err.message });
  }
};

exports.deleteNurseById = async (req, res) => {
  try {
    const nurse = await Nurse.findById(req.params.id);
    if (!nurse) {
      return res.status(404).json({ message: "Nurse not found" });
    }
    const [deletedNurse, deletedUser] = await Promise.all([
      Nurse.findByIdAndDelete(req.params.id),
      User.findByIdAndDelete(nurse.userId),
    ]);

    res.json({
      message: "Nurse and associated user deleted successfully",
      nurseDeleted: !!deletedNurse,
      userDeleted: !!deletedUser,
    });
  } catch (err) {
    console.error("Error in deleteNurseById:", err);
    res.status(500).json({ error: err.message });
  }
};

exports.bulkDeleteNurses = async (req, res) => {
  try {
    const { ids } = req.body;
    const result = await Nurse.deleteMany({ _id: { $in: ids } });
    res.json({ message: `${result.deletedCount} nurses deleted successfully` });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

exports.createMultipleNurses = async (req, res) => {
  try {
    const nursesData = req.body.map((nurse) => ({
      ...nurse,
      createdBy: req.user.userId,
    }));

    const createdNurses = [];
    const skippedNurses = [];

    for (const nurse of nursesData) {
      try {
        // Generate email hash from the plain email
        const emailHash = crypto
          .createHash("sha256")
          .update(nurse.email)
          .digest("hex");

        // Check for existing user using the email hash
        const existingUser = await User.findOne({ emailHash });
        if (existingUser) {
          skippedNurses.push(nurse.email);
          continue; // Skip this nurse and continue with the next
        }

        // Create user for each nurse
        const resetToken = crypto.randomBytes(32).toString("hex");
        const nurseUser = new User({
          email: nurse.email,
          emailHash: emailHash,
          password: crypto.randomBytes(20).toString("hex"),
          role: nurse.role,
          unit: nurse.unit,
          firstName: encrypt(nurse.firstName),
          lastName: encrypt(nurse.lastName),
          phoneNumber: encrypt(nurse.phoneNumber),
          resetToken: resetToken,
          resetTokenExpiresAt: Date.now() + 24 * 60 * 60 * 1000,
          resetUsed: false,
        });
        await nurseUser.save();

        // Create nurse and associate with user
        const newNurse = new Nurse({
          firstName: encrypt(nurse.firstName),
          lastName: encrypt(nurse.lastName),
          email: encrypt(nurse.email),
          phoneNumber: encrypt(nurse.phoneNumber),
          address: encrypt(nurse.address),
          role: nurse.role,
          unit: nurse.unit,
          createdBy: req.user.userId,
          userId: nurseUser._id,
        });
        await newNurse.save();

        createdNurses.push(newNurse);
      } catch (innerErr) {
        console.error(
          `Error processing nurse with email ${nurse.email}:`,
          innerErr
        );
        skippedNurses.push(nurse.email);
      }
    }

    res.status(201).json({
      createdNurses,
      skippedNurses,
      message: `${createdNurses.length} nurses created successfully, ${skippedNurses.length} skipped due to existing records.`,
    });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
};
