let counter = 0;

const generateShiprocketId = () => {
  const timestamp = Date.now();

  counter = (counter + 1) % 100;

  return timestamp * 100 + counter;
};

module.exports = generateShiprocketId;