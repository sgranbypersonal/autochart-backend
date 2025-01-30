const crypto = require('crypto');

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
    validateEncryptionFormat(text);
    const [ivHex, encryptedText] = text.split(":");
    if (!ivHex || !encryptedText) {
      throw new Error("Invalid encryption format. Data must be in 'iv:encryptedText' format.");
    }
    const iv = Buffer.from(ivHex, "hex");
    const decipher = crypto.createDecipheriv(algorithm, secretKey, iv);
    let decrypted = decipher.update(encryptedText, "hex", "utf8");
    decrypted += decipher.final("utf8");
    return decrypted;
  } catch (error) {
    console.error("Decryption error:", error.message);
    return text; // Return the original text if decryption fails
  }
}

function validateEncryptionFormat(data) {
  const [ivHex, encryptedText] = data.split(":");
  if (!ivHex || !encryptedText) {
    throw new Error("Invalid encryption format. Data must be in 'iv:encryptedText' format.");
  }
}

module.exports = { encrypt, decrypt };