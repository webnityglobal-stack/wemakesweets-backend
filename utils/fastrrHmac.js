const crypto = require("crypto");

const generateHmac = (rawBody) => {
  return crypto
    .createHmac(
      "sha256",
      process.env.FASTRR_API_SECRET
    )
    .update(rawBody)
    .digest("base64");
};

const verifyHmac = (rawBody, receivedHmac) => {
  if (!receivedHmac) {
    return false;
  }

  const calculatedHmac =
    generateHmac(rawBody);

  const receivedBuffer =
    Buffer.from(receivedHmac);

  const calculatedBuffer =
    Buffer.from(calculatedHmac);

  if (
    receivedBuffer.length !==
    calculatedBuffer.length
  ) {
    return false;
  }

  return crypto.timingSafeEqual(
    receivedBuffer,
    calculatedBuffer
  );
};

module.exports = {
  generateHmac,
  verifyHmac,
};