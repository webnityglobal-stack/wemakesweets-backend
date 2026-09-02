const HeroBanner = require("../models/HeroBanner");
const fs = require("fs");
const path = require("path");


// ==========================================
// CREATE / UPDATE HERO IMAGE
// ==========================================

const uploadHeroImage = async (req, res) => {
  try {
    const { slot } = req.body;

    // Validate slot
    if (!slot || ![1, 2, 3].includes(Number(slot))) {
      return res.status(400).json({
        success: false,
        message: "Slot must be 1, 2 or 3",
      });
    }

    // Check image
    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: "Hero image is required",
      });
    }

    const slotNumber = Number(slot);

    const image = `/uploads/hero/${req.file.filename}`;

    // Check existing slot
    let banner = await HeroBanner.findOne({
      slot: slotNumber,
    });

    // If slot already exists
    if (banner) {
      // Delete old uploaded image
      if (banner.image) {
        const oldImagePath = path.join(
          __dirname,
          "..",
          banner.image
        );

        if (fs.existsSync(oldImagePath)) {
          fs.unlinkSync(oldImagePath);
        }
      }

      banner.image = image;
      banner.isActive = true;

      await banner.save();
    }

    // If slot doesn't exist
    else {
      banner = await HeroBanner.create({
        slot: slotNumber,
        image,
        isActive: true,
      });
    }

    return res.status(200).json({
      success: true,
      message: `Hero image for slot ${slotNumber} uploaded successfully`,
      banner,
    });

  } catch (error) {
    console.error(
      "Upload Hero Image Error:",
      error.message
    );

    return res.status(500).json({
      success: false,
      message: "Unable to upload hero image",
    });
  }
};


// ==========================================
// GET HERO SLIDER
// ==========================================

const getHeroImages = async (req, res) => {
  try {
    const banners = await HeroBanner.find({
      isActive: true,
    }).sort({
      slot: 1,
    });

    return res.status(200).json({
      success: true,
      banners,
    });

  } catch (error) {
    console.error(
      "Get Hero Images Error:",
      error.message
    );

    return res.status(500).json({
      success: false,
      message: "Unable to fetch hero images",
    });
  }
};


// ==========================================
// DELETE UPLOADED IMAGE
// ==========================================

const deleteHeroImage = async (req, res) => {
  try {
    const { slot } = req.params;

    const banner = await HeroBanner.findOne({
      slot: Number(slot),
    });

    if (!banner) {
      return res.status(404).json({
        success: false,
        message: "Hero slot not found",
      });
    }

    // Delete uploaded image
    if (banner.image) {
      const imagePath = path.join(
        __dirname,
        "..",
        banner.image
      );

      if (fs.existsSync(imagePath)) {
        fs.unlinkSync(imagePath);
      }
    }

    // Important:
    // Don't delete DB slot.
    // Just make image null.
    banner.image = null;

    await banner.save();

    return res.status(200).json({
      success: true,
      message:
        "Hero image deleted. Default image will be shown.",
    });

  } catch (error) {
    console.error(
      "Delete Hero Image Error:",
      error.message
    );

    return res.status(500).json({
      success: false,
      message: "Unable to delete hero image",
    });
  }
};


module.exports = {
  uploadHeroImage,
  getHeroImages,
  deleteHeroImage,
};