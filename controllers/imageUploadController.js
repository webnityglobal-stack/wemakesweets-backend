
const path = require("path");
const fs = require("fs");
const multer = require("multer");
const { getUploadRootDir } = require("../config/storage");

const imageDir = path.join(getUploadRootDir(), "custom-images");

if (!fs.existsSync(imageDir)) {
    fs.mkdirSync(imageDir, { recursive: true });
}

const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, imageDir);
    },

    filename: (req, file, cb) => {
        const ext = path.extname(file.originalname).toLowerCase();
        const filename = `${Date.now()}-${Math.round(Math.random() * 1e9)}${ext}`;
        cb(null, filename);
    },
});

const upload = multer({
    storage,
    limits: { fileSize: 5 * 1024 * 1024 },
    fileFilter: (req, file, cb) => {
        const allowedExtensions = [".jpg", ".jpeg", ".png", ".webp"];
        const ext = path.extname(file.originalname).toLowerCase();

        if (
            allowedExtensions.includes(ext) &&
            ["image/jpeg", "image/png", "image/webp"].includes(file.mimetype)
        ) {
            return cb(null, true);
        }

        cb(new Error("Only JPG, JPEG, PNG and WEBP images are allowed"));
    },
});

const uploadSingleImage = (req, res) => {
    upload.single("image")(req, res, (err) => {
        if (err) {
            return res.status(400).json({
                success: false,
                message: err.message,
            });
        }

        if (!req.file) {
            return res.status(400).json({
                success: false,
                message: "Please select one image",
            });
        }

        const baseUrl = `${req.protocol}://${req.get("host")}`;

        return res.status(201).json({
            success: true,
            message: "Image uploaded successfully",
            image: {
                filename: req.file.filename,
                path: `${baseUrl}/uploads/custom-images/${req.file.filename}`,
                size: req.file.size,
            },
        });
    });
};


const deleteImage = (req, res) => {
    try {
        const { filename } = req.params;

        // Allow only safe image filenames
        if (
            !filename ||
            filename !== path.basename(filename) ||
            !/\.(jpg|jpeg|png|webp)$/i.test(filename)
        ) {
            return res.status(400).json({
                success: false,
                message: "Invalid image filename.",
            });
        }

        const imagePath = path.resolve(imageDir, filename);

        // Ensure the file stays inside custom-images directory
        if (path.dirname(imagePath) !== path.resolve(imageDir)) {
            return res.status(400).json({
                success: false,
                message: "Invalid image path.",
            });
        }

        if (!fs.existsSync(imagePath)) {
            return res.status(404).json({
                success: false,
                message: "Image not found.",
            });
        }

        if (!fs.statSync(imagePath).isFile()) {
            return res.status(400).json({
                success: false,
                message: "Requested path is not a file.",
            });
        }

        fs.unlinkSync(imagePath);

        return res.status(200).json({
            success: true,
            message: "Image deleted successfully.",
            filename,
        });
    } catch (error) {
        console.error("Image delete error:", error);

        return res.status(500).json({
            success: false,
            message: "Failed to delete image.",
        });
    }
};


module.exports = {
    uploadSingleImage,
    deleteImage
};
