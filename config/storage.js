const path = require("path");
const fs = require("fs");

/**
 * Base root directory for all uploaded media files.
 * Priority:
 * 1. process.env.UPLOAD_DIR (explicit environment variable)
 * 2. Hostinger user persistent folder: /home/u169575383/uploads_storage
 * 3. Dynamic search for /home/<user>/uploads_storage on Linux
 * 4. Local fallback: <project-root>/uploads
 */
let cachedUploadRootDir = null;

const getUploadRootDir = () => {
  if (cachedUploadRootDir && fs.existsSync(cachedUploadRootDir)) {
    return cachedUploadRootDir;
  }

  // 1. Explicit environment variable
  if (process.env.UPLOAD_DIR) {
    const custom = path.resolve(process.env.UPLOAD_DIR);
    if (!fs.existsSync(custom)) {
      try {
        fs.mkdirSync(custom, { recursive: true });
      } catch (err) {
        console.warn("⚠️ Failed to create custom upload dir:", err.message);
      }
    }
    cachedUploadRootDir = custom;
    return custom;
  }

  // 2. Direct Hostinger persistent directory created by user in File Manager
  const hostingerPath = "/home/u169575383/uploads_storage";
  if (fs.existsSync(hostingerPath)) {
    cachedUploadRootDir = hostingerPath;
    return hostingerPath;
  }

  // 3. Dynamic search for /home/*/uploads_storage on Linux
  if (process.platform === "linux") {
    try {
      const homeRoot = "/home";
      if (fs.existsSync(homeRoot)) {
        const users = fs.readdirSync(homeRoot);
        for (const u of users) {
          const candidate = path.join(homeRoot, u, "uploads_storage");
          if (fs.existsSync(candidate)) {
            cachedUploadRootDir = candidate;
            return candidate;
          }
        }
      }
    } catch (err) {}
  }

  // 4. Default fallback: project uploads folder
  const fallback = path.join(__dirname, "../uploads");
  if (!fs.existsSync(fallback)) {
    try {
      fs.mkdirSync(fallback, { recursive: true });
    } catch (err) {
      console.warn("⚠️ Failed to create fallback upload dir:", err.message);
    }
  }

  cachedUploadRootDir = fallback;
  return fallback;
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
