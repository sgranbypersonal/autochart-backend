const mongoose = require("mongoose");
const crypto = require("crypto");
const bcrypt = require("bcryptjs");

const algorithm = process.env.ENCRYPTION_ALGORITHM;
const secretKey = Buffer.from(process.env.SECRET_KEY, "hex");
const ivLength = parseInt(process.env.IV_LENGTH, 10);

function encrypt(text) {
  if (!text) return null;
  try {
    const iv = crypto.randomBytes(ivLength);
    const cipher = crypto.createCipheriv(algorithm, secretKey, iv);
    let encrypted = cipher.update(text.toString(), "utf8", "hex");
    encrypted += cipher.final("hex");
    return iv.toString("hex") + ":" + encrypted;
  } catch (err) {
    console.error("Encryption failed:", err);
    throw err;
  }
}

function decrypt(text) {
  if (!text) return null;
  try {
    const [ivHex, encryptedText] = text.split(":");
    const iv = Buffer.from(ivHex, "hex");
    const decipher = crypto.createDecipheriv(algorithm, secretKey, iv);
    let decrypted = decipher.update(encryptedText, "hex", "utf8");
    decrypted += decipher.final("utf8");
    return decrypted;
  } catch (err) {
    console.error("Decryption failed:", err);
    throw err;
  }
}

const userSchema = new mongoose.Schema({
  email: {
    type: String,
    required: true,
    unique: true,
    set: (value) => encrypt(value),
    get: (value) => decrypt(value),
  },
  emailHash: { type: String, default: null },
  password: { type: String, required: true },
  role: {
    type: String,
    enum: ["superadmin", "admin", "nurse"],
    required: true,
  },
  resetToken: { type: String, default: null },
  resetTokenExpiresAt: { type: Date, default: null },
  resetUsed: { type: Boolean, default: null },
  otp: { type: String, default: null },
  otpExpiresAt: { type: Date, default: null },
  is2FAEnabled: { type: Boolean, default: false },
  lastLogin: { type: Date, default: null },
  firstName: {
    type: String,
    default: null,
    set: (value) => encrypt(value),
    get: (value) => decrypt(value),
  },
  lastName: {
    type: String,
    default: null,
    set: (value) => encrypt(value),
    get: (value) => decrypt(value),
  },
  dob: {
    type: String,
    default: null,
    set: (value) => {
      if (!value) return null;
      if (typeof value === 'string') return encrypt(value);
      if (value instanceof Date) return encrypt(value.toISOString());
      return null;
    },
    get: (value) => value ? new Date(decrypt(value)) : null,
  },
  age: {
    type: String,
    default: null,
    set: (value) => encrypt(value?.toString()),
    get: (value) => decrypt(value),
  },
  phoneNumber: {
    type: String,
    default: null,
    set: (value) => encrypt(value),
    get: (value) => decrypt(value),
  },
  profilePicture: {
    type: String,
    default: function () {
      const initials = (this.firstName?.[0] || "") + (this.lastName?.[0] || "");
      return `https://ui-avatars.com/api/?name=${initials}&background=random`;
    },
  },
  associateNurseId: { type: mongoose.Schema.Types.ObjectId, ref: "Nurse" },
});

userSchema.index({ otpExpiresAt: 1 }, { expireAfterSeconds: 0 });

userSchema.pre("save", async function (next) {
  if (!this.isModified("password")) return next();
  const salt = await bcrypt.genSalt(10);
  this.password = await bcrypt.hash(this.password, salt);
  next();
});

userSchema.methods.comparePassword = async function (password) {
  return await bcrypt.compare(password, this.password);
};

const User = mongoose.model("User", userSchema);

module.exports = User;
