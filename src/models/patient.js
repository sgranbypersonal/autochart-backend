const mongoose = require("mongoose");
const crypto = require("crypto");
const { v4: uuidv4 } = require("uuid");

const algorithm = process.env.ENCRYPTION_ALGORITHM;
const secretKey = Buffer.from(process.env.SECRET_KEY, "hex");
const ivLength = parseInt(process.env.IV_LENGTH, 10);

function encrypt(text) {
  if (!text) return text;
  const iv = crypto.randomBytes(ivLength);
  const cipher = crypto.createCipheriv(algorithm, secretKey, iv);
  let encrypted = cipher.update(text, "utf8", "hex");
  encrypted += cipher.final("hex");
  return iv.toString("hex") + ":" + encrypted;
}

function decrypt(text) {
  if (!text) return text;
  try {
    const [ivHex, encryptedText] = text.split(":");
    if (!ivHex || !encryptedText) return text;
    const iv = Buffer.from(ivHex, "hex");
    const decipher = crypto.createDecipheriv(algorithm, secretKey, iv);
    let decrypted = decipher.update(encryptedText, "hex", "utf8");
    decrypted += decipher.final("utf8");
    return decrypted;
  } catch (error) {
    return text;
  }
}

const ExtensionSchema = new mongoose.Schema(
  {
    chartId: {
      type: String,
      sparse: true,
      unique: true,
      default: uuidv4,
    },
    audioUrl: {
      type: String,
      set: (value) => (value ? encrypt(value) : value),
    },
    transcript: {
      type: String,
      set: (value) => (value ? encrypt(value) : value),
    },
    extractedData: {
      type: String,
      set: (value) =>
        value
          ? encrypt(typeof value === "string" ? value : JSON.stringify(value))
          : value,
    },
    timestamp: {
      type: Date,
      default: Date.now,
    },
  },
  { _id: false }
);

const PatientSchema = new mongoose.Schema({
  firstName: {
    type: String,
    set: (value) => (value ? encrypt(value) : value),
    get: (value) => (value ? decrypt(value) : value),
  },
  lastInitial: {
    type: String,
    set: (value) => (value ? encrypt(value) : value),
    get: (value) => (value ? decrypt(value) : value),
  },
  mrn: {
    type: String,
    set: (value) => (value ? encrypt(value) : value),
    get: (value) => (value ? decrypt(value) : value),
  },
  mrnHash: { type: String, default: null },
  dob: {
    type: String,
    default: null,
    set: (value) => {
      if (!value) return null;
      if (typeof value === "string") return encrypt(value);
      if (value instanceof Date) return encrypt(value.toISOString());
      return null;
    },
    get: (value) => (value ? new Date(decrypt(value)) : null),
  },
  gender: {
    type: String,
    set: (value) => (value ? encrypt(value) : value),
    get: (value) => (value ? decrypt(value) : value),
  },
  address: {
    type: String,
    set: (value) => (value ? encrypt(value) : value),
    get: (value) => (value ? decrypt(value) : value),
  },
  phone: {
    type: String,
    set: (value) => (value ? encrypt(value) : value),
    get: (value) => (value ? decrypt(value) : value),
  },
  email: {
    type: String,
    set: (value) => (value ? encrypt(value) : value),
    get: (value) => (value ? decrypt(value) : value),
  },
  unit: {
    type: String,
    required: true,
  },
  extensions: [ExtensionSchema],
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true,
  },
  assignedTo: [
    {
      nurseId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Nurse",
        required: true,
      },
      nurseName: {
        type: String,
        required: true,
      },
      _id: false,
    },
  ],
  discharged: { type: Boolean, default: false },
  dischargedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    default: null,
  },
});

PatientSchema.set("toJSON", {
  getters: true,
  transform: (doc, ret) => {
    if (ret.extensions) {
      ret.extensions = ret.extensions.map((ext) => {
        const decryptedExt = {
          ...ext,
          audioUrl: decrypt(ext.audioUrl),
          transcript: decrypt(ext.transcript),
        };
        const decryptedData = decrypt(ext.extractedData);
        if (decryptedData) {
          try {
            decryptedExt.extractedData = JSON.parse(decryptedData);
          } catch (error) {
            console.error("Error parsing extractedData:", error);
            decryptedExt.extractedData = {};
          }
        }
        return decryptedExt;
      });
    }
    ret.updatedAt = doc.updatedAt;
    return ret;
  },
});

PatientSchema.set("toObject", { getters: true, virtuals: true });

PatientSchema.pre("save", function (next) {
  const uniqueChartIds = new Set(this.extensions.map((ext) => ext.chartId));
  if (uniqueChartIds.size !== this.extensions.length) {
    return next(new Error("Duplicate chartId found in extensions"));
  }
  next();
});

module.exports = mongoose.model("Patient", PatientSchema);
