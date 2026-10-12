const path = require("path");
const fs = require("fs");

/**
 * Base root directory for all uploaded media files.
 * Default: <project-root>/uploads
 * Custom path supported via process.env.UPLOAD_DIR (e.g. persistent storage outside git on Hostinger)
 */
const getUploadRootDir = () => {
  const customDir = process.env.UPLOAD_DIR;
  const root = customDir
    ? path.resolve(customDir)
    : path.join(__dirname, "../uploads");

  if (!fs.existsSync(root)) {
    try {
      fs.mkdirSync(root, { recursive: true });
    } catch (err) {
      console.warn("⚠️ Failed to create upload root dir:", err.message);
    }
  }

  return root;
};

const getProductImageDir = () => {
  const dir = path.join(getUploadRootDir(), "products", "images");
  if (!fs.existsSync(dir)) {
    try {
      fs.mkdirSync(dir, { recursive: true });
    } catch (err) {}
  }
  return dir;
};

const getReelsDir = () => {
  const dir = path.join(getUploadRootDir(), "reels");
  if (!fs.existsSync(dir)) {
    try {
      fs.mkdirSync(dir, { recursive: true });
    } catch (err) {}
  }
  return dir;
};

const getHeroDir = () => {
  const dir = path.join(getUploadRootDir(), "hero");
  if (!fs.existsSync(dir)) {
    try {
      fs.mkdirSync(dir, { recursive: true });
    } catch (err) {}
  }
  return dir;
};

/**
 * Resolves a file URL or relative path to its absolute filesystem path safely.
 */
const resolveFilePath = (fileUrlOrPath) => {
  if (!fileUrlOrPath) return "";
  const cleaned = String(fileUrlOrPath).replace(/^https?:\/\/[^/]+/, "");
  const relative = cleaned.replace(/^\/?uploads\/?/, "");
  return path.join(getUploadRootDir(), relative);
};

module.exports = {
  getUploadRootDir,
  getProductImageDir,
  getReelsDir,
  getHeroDir,
  resolveFilePath,
};
