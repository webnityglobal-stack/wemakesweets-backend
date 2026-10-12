const path = require("path");
const fs = require("fs");

/**
 * Finds the true persistent uploads_storage folder on Hostinger / Linux / local.
 * Priority:
 * 1. process.env.UPLOAD_DIR
 * 2. Specific Hostinger domain storage: /home/u169575383/domains/salmon-coyote-671066.hostingersite.com/uploads_storage
 * 3. Walk up directory tree from __dirname & process.cwd() outside hbuilds versions
 * 4. Scan home domains uploads_storage
 * 5. Local fallback: project-root/uploads
 */
let cachedUploadRootDir = null;

const getUploadRootDir = () => {
  if (cachedUploadRootDir && fs.existsSync(cachedUploadRootDir)) {
    return cachedUploadRootDir;
  }

  // 1. Specific Hostinger domain persistent folder created by user in File Manager
  const hostingerDomainPath =
    "/home/u169575383/domains/salmon-coyote-671066.hostingersite.com/uploads_storage";
  if (fs.existsSync(hostingerDomainPath)) {
    cachedUploadRootDir = hostingerDomainPath;
    return hostingerDomainPath;
  }

  // 2. Explicit env variable (ignore relative paths resolving inside hbuilds)
  if (process.env.UPLOAD_DIR) {
    const custom = path.resolve(process.env.UPLOAD_DIR);
    if (!custom.includes("/hbuilds/")) {
      if (!fs.existsSync(custom)) {
        try {
          fs.mkdirSync(custom, { recursive: true });
        } catch (e) {}
      }
      cachedUploadRootDir = custom;
      return custom;
    }
  }

  // 3. Walk up from __dirname and process.cwd() looking for uploads_storage outside hbuilds versions
  const startingPoints = [__dirname, process.cwd()];
  for (const start of startingPoints) {
    let curr = start;
    for (let i = 0; i < 8; i++) {
      if (!curr || curr === "/" || curr === ".") break;
      const candidate = path.join(curr, "uploads_storage");
      if (fs.existsSync(candidate) && !candidate.includes("/versions/")) {
        cachedUploadRootDir = candidate;
        return candidate;
      }
      curr = path.dirname(curr);
    }
  }

  // 4. Dynamic search across /home/*/domains/*/uploads_storage
  if (process.platform === "linux") {
    try {
      const homeRoot = "/home";
      if (fs.existsSync(homeRoot)) {
        for (const u of fs.readdirSync(homeRoot)) {
          const domRoot = path.join(homeRoot, u, "domains");
          if (fs.existsSync(domRoot)) {
            for (const d of fs.readdirSync(domRoot)) {
              const candidate = path.join(domRoot, d, "uploads_storage");
              if (fs.existsSync(candidate)) {
                cachedUploadRootDir = candidate;
                return candidate;
              }
            }
          }
        }
      }
    } catch (e) {}
  }

  // 5. Local fallback
  const fallback = path.join(__dirname, "../uploads");
  if (!fs.existsSync(fallback)) {
    try {
      fs.mkdirSync(fallback, { recursive: true });
    } catch (e) {}
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
