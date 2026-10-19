
const multer = require("multer");
const path = require("path");
const crypto = require("crypto");
const { getGeneralImageDir } = require("../config/storage");

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, getGeneralImageDir());
  },

  filename: (req, file, cb) => {
    const extension = path.extname(file.originalname).toLowerCase();
    const filename = `${Date.now()}-${crypto.randomUUID()}${extension}`;

    cb(null, filename);
  },
});

const fileFilter = (req, file, cb) => {
  const allowedMimeTypes = [
    "image/jpeg",
    "image/png",
    "image/webp",
  ];

  const allowedExtensions = [".jpg", ".jpeg", ".png", ".webp"];
  const extension = path.extname(file.originalname).toLowerCase();

  if (
    allowedMimeTypes.includes(file.mimetype) &&
    allowedExtensions.includes(extension)
  ) {
    return cb(null, true);
  }

  cb(new Error("Only JPG, JPEG, and WEBP images are allowed."));
};

const uploadSingleImage = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: 5 * 1024 * 1024,
    files: 1,
  },
});

module.exports = uploadSingleImage;
