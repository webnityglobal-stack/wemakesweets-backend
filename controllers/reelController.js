const fs = require("fs");
const path = require("path");
const { getReelsDir } = require("../config/storage");
const Reel = require("../models/reel");

// Allowed video extensions
const allowedExtensions = [".mp4", ".webm", ".mov"];

// =====================================================
// UPLOAD REELS
// POST /api/reels/upload
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

    const savedReels = [];

    for (const file of req.files) {
      const url = `${baseUrl}/uploads/reels/${file.filename}`;

      const reelDoc = await Reel.findOneAndUpdate(
        { filename: file.filename },
        {
          filename: file.filename,
          url,
          size: file.size || 0,
        },
        { upsert: true, new: true, setDefaultsOnInsert: true }
      );

      savedReels.push({
        _id: reelDoc._id,
        filename: file.filename,
        url: reelDoc.url || url,
      });
    }

    return res.status(201).json({
      success: true,
      message: "Reels uploaded successfully",
      reels: savedReels.map((r) => ({
        filename: r.filename,
        url: r.url,
      })),
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
    const reelsDir = getReelsDir();
    const baseUrl =
      process.env.BACKEND_URL ||
      `${req.protocol}://${req.get("host")}`;

    // 1. Fetch persistent reels from MongoDB
    let dbReels = await Reel.find().sort({ createdAt: -1 });

    // 2. Backward compatibility & disk sync:
    // If there are files on disk not yet recorded in MongoDB, sync them in
    if (fs.existsSync(reelsDir)) {
      try {
        const diskFiles = fs.readdirSync(reelsDir);
        const existingFilenames = new Set(dbReels.map((r) => r.filename));

        for (const filename of diskFiles) {
          const extension = path.extname(filename).toLowerCase();
          if (
            allowedExtensions.includes(extension) &&
            !existingFilenames.has(filename)
          ) {
            const filePath = path.join(reelsDir, filename);
            const stats = fs.statSync(filePath);

            const syncedReel = await Reel.create({
              filename,
              url: `${baseUrl}/uploads/reels/${filename}`,
              size: stats.size || 0,
              createdAt: stats.birthtime || new Date(),
              updatedAt: stats.mtime || new Date(),
            });

            dbReels.push(syncedReel);
            existingFilenames.add(filename);
          }
        }

        // Keep newest first
        dbReels.sort(
          (a, b) => new Date(b.createdAt) - new Date(a.createdAt)
        );
      } catch (syncErr) {
        console.warn("⚠️ Disk sync warning in getReels:", syncErr.message);
      }
    }

    // 3. Filter and clean up phantom reels whose local files were deleted or wiped from disk
    const reels = [];
    for (const r of dbReels) {
      const filePath = path.join(reelsDir, r.filename);
      const isLocal = !r.url || r.url.includes("/uploads/reels/");

      if (!isLocal || fs.existsSync(filePath)) {
        let finalUrl = r.url;
        if (
          !finalUrl ||
          !finalUrl.startsWith("http") ||
          finalUrl.includes("localhost")
        ) {
          finalUrl = `${baseUrl}/uploads/reels/${r.filename}`;
        }

        reels.push({
          _id: r._id,
          filename: r.filename,
          url: finalUrl,
          size: r.size || 0,
          createdAt: r.createdAt,
          updatedAt: r.updatedAt,
        });
      } else {
        // Physical file no longer on disk; remove phantom record so frontend never gets 404
        try {
          await Reel.deleteOne({ _id: r._id });
          console.warn(`⚠️ Cleaned up phantom reel record missing from disk: ${r.filename}`);
        } catch (cleanupErr) {}
      }
    }

    return res.status(200).json({
      success: true,
      message: "Reels fetched successfully",
      count: reels.length,
      reels,
    });
  } catch (error) {
    console.error("GET REELS ERROR:", error);

    return res.status(500).json({
      success: false,
      message: "Unable to fetch reels",
      error: error.message,
    });
  }
};

// =====================================================
// DELETE REEL
// DELETE /api/reels/:filename
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

    // Security check
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

    const reelsDir = getReelsDir();
    const reelPath = path.join(reelsDir, filename);

    // Delete record from MongoDB
    await Reel.deleteOne({ filename });

    // Delete file from disk if present
    if (fs.existsSync(reelPath)) {
      try {
        fs.unlinkSync(reelPath);
      } catch (err) {
        console.warn("⚠️ Could not delete physical reel file:", err.message);
      }
    }

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
  getReels,
  deleteReel,
};