const HeroBanner = require("../models/HeroBanner");
const fs = require("fs");
const path = require("path");

// =====================================================
// GET BACKEND URL
// =====================================================

const getBackendUrl = (req) => {
  return (
    process.env.BACKEND_URL ||
    `${req.protocol}://${req.get("host")}`
  ).replace(/\/$/, "");
};

// =====================================================
// CREATE / UPDATE HERO IMAGE
// =====================================================

const uploadHeroImage = async (req, res) => {
  try {
    const { slot } = req.body;

    // =================================================
    // VALIDATE SLOT
    // =================================================

    if (!slot || ![1, 2, 3].includes(Number(slot))) {
      return res.status(400).json({
        success: false,
        message: "Slot must be 1, 2 or 3",
      });
    }

    // =================================================
    // CHECK IMAGE
    // =================================================

    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: "Hero image is required",
      });
    }

    const slotNumber = Number(slot);

    // =================================================
    // CREATE FULL BACKEND IMAGE URL
    // =================================================

    const backendUrl = getBackendUrl(req);

    const image =
      `${backendUrl}/uploads/hero/${req.file.filename}`;

    // =================================================
    // FIND EXISTING SLOT
    // =================================================

    let banner = await HeroBanner.findOne({
      slot: slotNumber,
    });

    // =================================================
    // UPDATE EXISTING SLOT
    // =================================================

    if (banner) {

      // -----------------------------------------------
      // DELETE OLD UPLOADED IMAGE
      // -----------------------------------------------

      if (banner.image) {
        const cleanImage = banner.image.replace(
          /^https?:\/\/[^/]+/,
          ""
        );

        const oldImagePath = path.join(
          __dirname,
          "..",
          cleanImage
        );

        if (fs.existsSync(oldImagePath)) {
          fs.unlinkSync(oldImagePath);
        }
      }

      // -----------------------------------------------
      // SAVE NEW IMAGE URL
      // -----------------------------------------------

      banner.image = image;
      banner.isActive = true;

      await banner.save();
    }

    // =================================================
    // CREATE NEW SLOT
    // =================================================

    else {
      banner = await HeroBanner.create({
        slot: slotNumber,
        image,
        isActive: true,
      });
    }

    // =================================================
    // RESPONSE
    // =================================================

    return res.status(200).json({
      success: true,
      message:
        `Hero image for slot ${slotNumber} uploaded successfully`,
      banner,
    });

  } catch (error) {
    console.error(
      "Upload Hero Image Error:",
      error
    );

    return res.status(500).json({
      success: false,
      message: "Unable to upload hero image",
      error: error.message,
    });
  }
};

// =====================================================
// GET HERO SLIDER
// =====================================================

const getHeroImages = async (req, res) => {
  try {

    const banners = await HeroBanner.find({
      isActive: true,
    }).sort({
      slot: 1,
    });

    // =================================================
    // RETURN ONLY BACKEND DATA
    // =================================================
    // If image exists:
    //     frontend will show uploaded image
    //
    // If image is null:
    //     frontend will show its existing default image
    // =================================================

    return res.status(200).json({
      success: true,
      banners,
    });

  } catch (error) {
    console.error(
      "Get Hero Images Error:",
      error
    );

    return res.status(500).json({
      success: false,
      message: "Unable to fetch hero images",
      error: error.message,
    });
  }
};

// =====================================================
// DELETE HERO IMAGE
// =====================================================

const deleteHeroImage = async (req, res) => {
  try {
    const { slot } = req.params;

    const slotNumber = Number(slot);

    // =================================================
    // VALIDATE SLOT
    // =================================================

    if (![1, 2, 3].includes(slotNumber)) {
      return res.status(400).json({
        success: false,
        message: "Slot must be 1, 2 or 3",
      });
    }

    // =================================================
    // FIND SLOT
    // =================================================

    const banner = await HeroBanner.findOne({
      slot: slotNumber,
    });

    if (!banner) {
      return res.status(404).json({
        success: false,
        message: "Hero slot not found",
      });
    }

    // =================================================
    // DELETE UPLOADED IMAGE FROM SERVER
    // =================================================

    if (banner.image) {

      // Remove backend domain from full URL
      const cleanImage = banner.image.replace(
        /^https?:\/\/[^/]+/,
        ""
      );

      const imagePath = path.join(
        __dirname,
        "..",
        cleanImage
      );

      if (fs.existsSync(imagePath)) {
        fs.unlinkSync(imagePath);
      }
    }

    // =================================================
    // KEEP SLOT
    // =================================================
    // We DON'T delete the DB document.
    //
    // image = null means:
    // frontend should show its existing default image.
    // =================================================

    banner.image = null;
    banner.isActive = true;

    await banner.save();

    // =================================================
    // RESPONSE
    // =================================================

    return res.status(200).json({
      success: true,
      message:
        "Hero image deleted. Default frontend image will be shown.",
      banner,
    });

  } catch (error) {
    console.error(
      "Delete Hero Image Error:",
      error
    );

    return res.status(500).json({
      success: false,
      message: "Unable to delete hero image",
      error: error.message,
    });
  }
};

// =====================================================
// EXPORT
// =====================================================

module.exports = {
  uploadHeroImage,
  getHeroImages,
  deleteHeroImage,
};