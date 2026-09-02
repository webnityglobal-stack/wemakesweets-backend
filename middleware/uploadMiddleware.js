// const multer = require("multer");
// const path = require("path");
// const fs = require("fs");

// const uploadPath = path.join(
//   __dirname,
//   "../uploads/products"
// );

// // Create folder if it doesn't exist
// if (!fs.existsSync(uploadPath)) {
//   fs.mkdirSync(uploadPath, {
//     recursive: true,
//   });
// }

// const storage = multer.diskStorage({
//   destination: (req, file, cb) => {
//     cb(null, uploadPath);
//   },

//   filename: (req, file, cb) => {
//     const uniqueName =
//       Date.now() +
//       "-" +
//       Math.round(Math.random() * 1e9) +
//       path.extname(file.originalname);

//     cb(null, uniqueName);
//   },
// });


// // Only images allowed
// const fileFilter = (req, file, cb) => {
//   if (file.mimetype.startsWith("image/")) {
//     cb(null, true);
//   } else {
//     cb(
//       new Error("Only image files are allowed"),
//       false
//     );
//   }
// };


// const upload = multer({
//   storage,
//   fileFilter,

//   limits: {
//     fileSize: 10 * 1024 * 1024, // 10 MB per image
//   },
// });

// module.exports = upload;

const multer = require("multer");
const path = require("path");
const fs = require("fs");


// ===============================
// CREATE FOLDERS
// ===============================

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


// ===============================
// CREATE DIRECTORIES
// ===============================

// recursive: true se folder already exist hone par
// EEXIST error nahi aayega

// fs.mkdirSync(productImageDir, {
//   recursive: true,
// });

// fs.mkdirSync(reelsDir, {
//   recursive: true,
// });

// fs.mkdirSync(heroDir, {
//   recursive: true,
// });


// ===============================
// PRODUCT IMAGE STORAGE
// ===============================

const productImageStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, productImageDir);
  },

  filename: (req, file, cb) => {
    const uniqueName =
      Date.now() +
      "-" +
      Math.round(Math.random() * 1e9) +
      path.extname(file.originalname);

    cb(null, uniqueName);
  },
});


// ===============================
// REEL STORAGE
// ===============================

const reelStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, reelsDir);
  },

  filename: (req, file, cb) => {
    const uniqueName =
      Date.now() +
      "-" +
      Math.round(Math.random() * 1e9) +
      path.extname(file.originalname);

    cb(null, uniqueName);
  },
});


// ===============================
// HERO IMAGE STORAGE
// ===============================

const heroStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, heroDir);
  },

  filename: (req, file, cb) => {
    const uniqueName =
      Date.now() +
      "-" +
      Math.round(Math.random() * 1e9) +
      path.extname(file.originalname);

    cb(null, uniqueName);
  },
});


// ===============================
// IMAGE FILTER
// ===============================

const imageFilter = (req, file, cb) => {
  const allowedImages = [
    "image/jpeg",
    "image/jpg",
    "image/png",
    "image/webp",
  ];

  if (allowedImages.includes(file.mimetype)) {
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


// ===============================
// REEL FILTER
// ===============================

const reelFilter = (req, file, cb) => {
  const allowedVideos = [
    "video/mp4",
    "video/webm",
    "video/quicktime",
  ];

  if (allowedVideos.includes(file.mimetype)) {
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


// ===============================
// PRODUCT IMAGE UPLOAD
// ===============================

const uploadProductImage = multer({
  storage: productImageStorage,
  fileFilter: imageFilter,

  limits: {
    fileSize: 5 * 1024 * 1024, // 5 MB
  },
});


// ===============================
// REEL UPLOAD
// ===============================

const uploadReel = multer({
  storage: reelStorage,
  fileFilter: reelFilter,

  limits: {
    fileSize: 100 * 1024 * 1024, // 100 MB
  },
});


// ===============================
// HERO IMAGE UPLOAD
// ===============================

const uploadHeroImage = multer({
  storage: heroStorage,
  fileFilter: imageFilter,

  limits: {
    fileSize: 10 * 1024 * 1024, // 10 MB
  },
});


// ===============================
// EXPORT
// ===============================

module.exports = {
  uploadProductImage,
  uploadReel,
  uploadHeroImage,
};