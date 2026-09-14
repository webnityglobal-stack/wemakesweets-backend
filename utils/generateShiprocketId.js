const Product = require("../models/product");

const generateShiprocketId = async () => {
  const MIN = 1000000000;
  const MAX = 9999999999;

  let shiprocketId;
  let exists = true;

  while (exists) {
    shiprocketId =
      Math.floor(
        Math.random() * (MAX - MIN + 1)
      ) + MIN;

    exists = await Product.exists({
      shiprocketId,
    });
  }

  return shiprocketId;
};

module.exports = generateShiprocketId;