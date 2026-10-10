const crypto = require("crypto");

const generateHmac = (rawBody, encoding = "base64") => {
  return crypto
    .createHmac(
      "sha256",
      process.env.FASTRR_API_SECRET
    )
    .update(rawBody)
    .digest(encoding);
};

const verifyHmac = (rawBody, receivedHmac) => {
  if (!receivedHmac || typeof receivedHmac !== "string") {
    return false;
  }

  const cleanReceived = receivedHmac.trim();

  // 1. Check Base64 encoding
  const calculatedBase64 = generateHmac(rawBody, "base64");
  if (cleanReceived === calculatedBase64) {
    return true;
  }

  // 2. Check Hex encoding (case-insensitive)
  const calculatedHex = generateHmac(rawBody, "hex");
  if (cleanReceived.toLowerCase() === calculatedHex.toLowerCase()) {
    return true;
  }

  // 3. Safe timing comparison for Base64
  try {
    const recBuf = Buffer.from(cleanReceived);
    const b64Buf = Buffer.from(calculatedBase64);
    if (
      recBuf.length === b64Buf.length &&
      crypto.timingSafeEqual(recBuf, b64Buf)
    ) {
      return true;
    }
  } catch (_) {}

  // 4. Safe timing comparison for Hex
  try {
    const recBuf = Buffer.from(cleanReceived.toLowerCase());
    const hexBuf = Buffer.from(calculatedHex.toLowerCase());
    if (
      recBuf.length === hexBuf.length &&
      crypto.timingSafeEqual(recBuf, hexBuf)
    ) {
      return true;
    }
  } catch (_) {}

  return false;
};

module.exports = {
  generateHmac,
  verifyHmac,
};