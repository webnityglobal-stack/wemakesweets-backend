const fs = require("fs");
const path = require("path");

// =====================================================
// REELS DIRECTORY
// =====================================================

const reelsDir = path.join(
  __dirname,
  "../uploads/reels"
);

// =====================================================
// UPLOAD REELS
// =====================================================

const uploadReel = async (req, res) => {
  try {
    if (!req.files || req.files.length === 0) {
      return res.status(400).json({
        success: false,
        message: "Please upload at least one reel",
      });
    }

    const baseUrl =
      process.env.BACKEND_URL ||
      `${req.protocol}://${req.get("host")}`;

    const reels = req.files.map((file) => ({
      filename: file.filename,
      url: `${baseUrl}/uploads/reels/${file.filename}`,
    }));

    return res.status(201).json({
      success: true,
      message: "Reels uploaded successfully",
      reels,
    });

  } catch (error) {
    console.error("REEL UPLOAD ERROR:", error);

    return res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

// =====================================================
// GET ALL REELS
// GET /api/reels
// =====================================================

const getReels = async (req, res) => {
  try {
    // Check folder
    if (!fs.existsSync(reelsDir)) {
      return res.status(200).json({
        success: true,
        message: "No reels found",
        reels: [],
      });
    }

    // Read all files
    const files = fs.readdirSync(reelsDir);

    // Allowed video extensions
    const allowedExtensions = [
      ".mp4",
      ".webm",
      ".mov",
    ];

    // Backend base URL
    const baseUrl =
      process.env.BACKEND_URL ||
      `${req.protocol}://${req.get("host")}`;

    // Create reel response
    const reels = files
      .filter((filename) => {
        const extension = path
          .extname(filename)
          .toLowerCase();

        return allowedExtensions.includes(
          extension
        );
      })
      .map((filename) => {
        const filePath = path.join(
          reelsDir,
          filename
        );

        const stats =
          fs.statSync(filePath);

        return {
          filename,

          url:
            `${baseUrl}/uploads/reels/${filename}`,

          size:
            stats.size,

          createdAt:
            stats.birthtime,

          updatedAt:
            stats.mtime,
        };
      })
      // Latest uploaded reel first
      .sort(
        (a, b) =>
          new Date(b.createdAt) -
          new Date(a.createdAt)
      );

    return res.status(200).json({
      success: true,

      message:
        "Reels fetched successfully",

      count:
        reels.length,

      reels,
    });

  } catch (error) {
    console.error(
      "GET REELS ERROR:",
      error
    );

    return res.status(500).json({
      success: false,

      message:
        "Unable to fetch reels",

      error:
        error.message,
    });
  }
};

// =====================================================
// DELETE REEL
// =====================================================

const deleteReel = async (req, res) => {
  try {
    const { filename } =
      req.params;

    if (!filename) {
      return res.status(400).json({
        success: false,
        message:
          "Reel filename is required",
      });
    }

    // Security
    if (
      filename.includes("..") ||
      filename.includes("/") ||
      filename.includes("\\")
    ) {
      return res.status(400).json({
        success: false,
        message:
          "Invalid reel filename",
      });
    }

    const reelPath =
      path.join(
        reelsDir,
        filename
      );

    if (
      !fs.existsSync(reelPath)
    ) {
      return res.status(404).json({
        success: false,
        message:
          "Reel not found",
      });
    }

    fs.unlinkSync(
      reelPath
    );

    return res.status(200).json({
      success: true,

      message:
        "Reel deleted successfully",

      filename,
    });

  } catch (error) {
    console.error(
      "REEL DELETE ERROR:",
      error
    );

    return res.status(500).json({
      success: false,

      message:
        "Unable to delete reel",

      error:
        error.message,
    });
  }
};

module.exports = {
  uploadReel,
  getReels,
  deleteReel,
};