const crypto = require("crypto");

async function generateEmailHash(email) {
  return crypto.createHash("sha256").update(email).digest("hex");
}

module.exports = { generateEmailHash };
