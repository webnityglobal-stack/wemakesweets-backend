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

    res.status(201).json({
      success: true,
      message: "Reels uploaded successfully",
      reels,
    });

  } catch (error) {
    console.error("REEL UPLOAD ERROR:", error);

    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

module.exports = {
  uploadReel,
};