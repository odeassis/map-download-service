import { Router } from "express";
import multer from "multer";
import { MapController } from "../controllers/mapController";

const router = Router();

// Configure multer for file uploads
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 5000 * 1024 * 1024, // 5000MB limit
  },
  fileFilter: (req, file, cb) => {
    // Accept only .mbtiles files
    if (file.originalname.toLowerCase().endsWith(".mbtiles")) {
      cb(null, true);
    } else {
      cb(new Error("Only .mbtiles files are allowed"));
    }
  },
});

const mapController = new MapController();

router.get("/map/:map_id/download", mapController.downloadMap);
router.get("/map/:map_id/metadata", mapController.getMapMetadata);
router.get("/map/latest-version", mapController.getLatestMapVersion);

// Upload endpoint with error handling
router.post(
  "/map/upload",
  (req, res, next) => {
    upload.single("mapFile")(req, res, (err) => {
      if (err instanceof multer.MulterError) {
        if (err.code === "LIMIT_FILE_SIZE") {
          return res.status(400).json({
            error: "File too large. Maximum size is 500MB.",
            requestId: req.requestId,
          });
        }
        return res.status(400).json({
          error: `Upload error: ${err.message}`,
          requestId: req.requestId,
        });
      } else if (err) {
        return res.status(400).json({
          error: err.message,
          requestId: req.requestId,
        });
      }
      next();
    });
  },
  mapController.uploadMap
);

export default router;
