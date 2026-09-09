const multer = require("multer");
const path = require("path");
const fs = require("fs");

const productImageDir = path.join(
  __dirname,
  "../uploads/products/images"
);

const reelsDir = path.join(
  __dirname,
  "../uploads/reels"
);

const heroDir = path.join(
  __dirname,
  "../uploads/hero"
);

// Create folders safely
fs.mkdirSync(productImageDir, { recursive: true });
fs.mkdirSync(reelsDir, { recursive: true });
fs.mkdirSync(heroDir, { recursive: true });



// =====================================================
// IMAGE FILTER
// =====================================================

const imageFilter = (req, file, cb) => {
  const allowedExtensions = [
    ".jpg",
    ".jpeg",
    ".png",
    ".webp",
  ];

  const extension = path
    .extname(file.originalname)
    .toLowerCase();

  console.log("================================");
  console.log("FILE NAME:", file.originalname);
  console.log("MIME TYPE:", file.mimetype);
  console.log("EXTENSION:", extension);
  console.log("================================");

  if (allowedExtensions.includes(extension)) {
    cb(null, true);
  } else {
    cb(
      new Error(
        "Only JPG, JPEG, PNG and WEBP images are allowed"
      ),
      false
    );
  }
};

// =====================================================
// REEL FILTER
// =====================================================

const reelFilter = (req, file, cb) => {
  const allowedExtensions = [
    ".mp4",
    ".webm",
    ".mov",
  ];

  const extension = path
    .extname(file.originalname)
    .toLowerCase();

  if (allowedExtensions.includes(extension)) {
    cb(null, true);
  } else {
    cb(
      new Error(
        "Only MP4, WEBM and MOV videos are allowed"
      ),
      false
    );
  }
};

// =====================================================
// PRODUCT IMAGE STORAGE
// =====================================================

const productImageStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, productImageDir);
  },

  filename: (req, file, cb) => {
    const uniqueName =
      Date.now() +
      "-" +
      Math.round(Math.random() * 1e9) +
      path.extname(file.originalname).toLowerCase();

    cb(null, uniqueName);
  },
});

// =====================================================
// REEL STORAGE
// =====================================================

const reelStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, reelsDir);
  },

  filename: (req, file, cb) => {
    const uniqueName =
      Date.now() +
      "-" +
      Math.round(Math.random() * 1e9) +
      path.extname(file.originalname).toLowerCase();

    cb(null, uniqueName);
  },
});

// =====================================================
// HERO IMAGE STORAGE
// =====================================================

const heroStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, heroDir);
  },

  filename: (req, file, cb) => {
    const uniqueName =
      Date.now() +
      "-" +
      Math.round(Math.random() * 1e9) +
      path.extname(file.originalname).toLowerCase();

    cb(null, uniqueName);
  },
});

// =====================================================
// PRODUCT IMAGE UPLOAD
// =====================================================

const uploadProductImage = multer({
  storage: productImageStorage,
  fileFilter: imageFilter,

  limits: {
    fileSize: 5 * 1024 * 1024,
  },
});

// =====================================================
// REEL UPLOAD
// =====================================================

const uploadReel = multer({
  storage: reelStorage,
  fileFilter: reelFilter,

  limits: {
    fileSize: 100 * 1024 * 1024,
  },
});

// =====================================================
// HERO IMAGE UPLOAD
// =====================================================

const uploadHeroImage = multer({
  storage: heroStorage,
  fileFilter: imageFilter,

  limits: {
    fileSize: 10 * 1024 * 1024,
  },
});

// =====================================================
// EXPORT
// =====================================================

module.exports = {
  uploadProductImage,
  uploadReel,
  uploadHeroImage,
};