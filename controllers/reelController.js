const fs = require("fs");
const path = require("path");

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

    const reels = req.files.map((file) => ({
      filename: file.filename,
      url: `/uploads/reels/${file.filename}`,
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
// DELETE REEL
// =====================================================

const deleteReel = async (req, res) => {
  try {
    const { filename } = req.params;

    if (!filename) {
      return res.status(400).json({
        success: false,
        message: "Reel filename is required",
      });
    }

    // Security: only allow filename, not folder traversal
    if (
      filename.includes("..") ||
      filename.includes("/") ||
      filename.includes("\\")
    ) {
      return res.status(400).json({
        success: false,
        message: "Invalid reel filename",
      });
    }

    const reelPath = path.join(
      __dirname,
      "../uploads/reels",
      filename
    );

    // Check if file exists
    if (!fs.existsSync(reelPath)) {
      return res.status(404).json({
        success: false,
        message: "Reel not found",
      });
    }

    // Delete file
    fs.unlinkSync(reelPath);

    return res.status(200).json({
      success: true,
      message: "Reel deleted successfully",
      filename,
    });

  } catch (error) {
    console.error("REEL DELETE ERROR:", error);

    return res.status(500).json({
      success: false,
      message: "Unable to delete reel",
      error: error.message,
    });
  }
};

module.exports = {
  uploadReel,
  deleteReel,
};