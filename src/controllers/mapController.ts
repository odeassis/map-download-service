import { Request, Response } from "express";
import path from "path";
import pino from "pino";
import { MapService } from "../services/mapService";

const logger = pino({
  level: "info",
  timestamp: pino.stdTimeFunctions.isoTime,
});

const storageBasePath =
  process.env.STORAGE_BASE_PATH ||
  path.join(__dirname, "..", "archives", "maps");

export class MapController {
  private mapService: MapService;

  constructor() {
    this.mapService = new MapService(storageBasePath);
  }

  /**
   * @swagger
   * /map/{map_id}/download:
   *   get:
   *     tags: [Maps]
   *     summary: Download a map file
   *     description: Downloads the MBTiles file for the specified map ID
   *     parameters:
   *       - $ref: '#/components/parameters/MapId'
   *     responses:
   *       200:
   *         description: Map file download
   *         content:
   *           application/octet-stream:
   *             schema:
   *               type: string
   *               format: binary
   *         headers:
   *           Content-Disposition:
   *             description: Attachment filename
   *             schema:
   *               type: string
   *               example: 'attachment; filename=map-b56e23d1-76e5-4a3a-9268-82c93cb49a01.mbtiles'
   *       404:
   *         $ref: '#/components/responses/NotFound'
   *       500:
   *         $ref: '#/components/responses/InternalServerError'
   */
  public downloadMap = async (req: Request, res: Response): Promise<void> => {
    const { map_id } = req.params;
    const requestId = req.requestId;

    logger.info(
      {
        requestId,
        mapId: map_id,
        action: "download_map_start",
      },
      "Starting map download"
    );

    try {
      res.setHeader("Content-Type", "application/octet-stream");
      res.setHeader(
        "Content-Disposition",
        `attachment; filename=map-${map_id}.mbtiles`
      );

      await this.mapService.streamMap(map_id, res, requestId);

      logger.info(
        {
          requestId,
          mapId: map_id,
          action: "download_map_success",
        },
        "Map download completed successfully"
      );
    } catch (error) {
      logger.error(
        {
          requestId,
          mapId: map_id,
          action: "download_map_error",
          error: error instanceof Error ? error.message : "Unknown error",
        },
        "Map download failed"
      );

      if (!res.headersSent) {
        res.status(500).json({
          error: "Failed to download map",
          requestId,
        });
      }
    }
  };

  /**
   * @swagger
   * /map/{map_id}/metadata:
   *   get:
   *     tags: [Maps]
   *     summary: Get map metadata
   *     description: Retrieves detailed metadata for the specified map
   *     parameters:
   *       - $ref: '#/components/parameters/MapId'
   *     responses:
   *       200:
   *         description: Map metadata retrieved successfully
   *         content:
   *           application/json:
   *             schema:
   *               $ref: '#/components/schemas/MapMetadata'
   *       404:
   *         $ref: '#/components/responses/NotFound'
   *       500:
   *         $ref: '#/components/responses/InternalServerError'
   */
  public getMapMetadata = async (
    req: Request,
    res: Response
  ): Promise<void> => {
    const { map_id } = req.params;
    const requestId = req.requestId;

    logger.info(
      {
        requestId,
        mapId: map_id,
        action: "get_metadata_start",
      },
      "Retrieving map metadata"
    );

    try {
      const metadata = await this.mapService.getMapMetadata(map_id);

      logger.info(
        {
          requestId,
          mapId: map_id,
          action: "get_metadata_success",
        },
        "Map metadata retrieved successfully"
      );

      res.status(200).json(metadata);
    } catch (error) {
      logger.error(
        {
          requestId,
          mapId: map_id,
          action: "get_metadata_error",
          error: error instanceof Error ? error.message : "Unknown error",
        },
        "Failed to retrieve map metadata"
      );

      res.status(404).json({
        error: "Map not found or metadata unavailable",
        requestId,
      });
    }
  };

  /**
   * @swagger
   * /map/latest-version:
   *   get:
   *     tags: [Maps]
   *     summary: Get latest map version
   *     description: Retrieves the metadata of the most recent map version available
   *     responses:
   *       200:
   *         description: Latest map version retrieved successfully
   *         content:
   *           application/json:
   *             schema:
   *               $ref: '#/components/schemas/LatestVersionResponse'
   *       500:
   *         $ref: '#/components/responses/InternalServerError'
   */
  public getLatestMapVersion = async (
    req: Request,
    res: Response
  ): Promise<void> => {
    const requestId = req.requestId;

    logger.info(
      {
        requestId,
        action: "get_latest_version_start",
      },
      "Retrieving latest map version"
    );

    try {
      const latestMetadata = await this.mapService.getLatestMapVersion(
        requestId
      );

      logger.info(
        {
          requestId,
          mapId: latestMetadata.mapId,
          version: latestMetadata.version,
          action: "get_latest_version_success",
        },
        "Latest map version retrieved successfully"
      );

      res.status(200).json({
        mapId: latestMetadata.mapId,
        version: latestMetadata.version,
        metadata: latestMetadata,
        requestId,
      });
    } catch (error) {
      logger.error(
        {
          requestId,
          action: "get_latest_version_error",
          error: error instanceof Error ? error.message : "Unknown error",
        },
        "Failed to retrieve latest map version"
      );

      res.status(500).json({
        error: "Failed to retrieve latest map version",
        requestId,
      });
    }
  };

  /**
   * @swagger
   * /map/upload:
   *   post:
   *     tags: [Maps]
   *     summary: Upload a new map file
   *     description: Uploads a new MBTiles map file with optional metadata
   *     requestBody:
   *       required: true
   *       content:
   *         multipart/form-data:
   *           schema:
   *             type: object
   *             required:
   *               - mapFile
   *             properties:
   *               mapFile:
   *                 type: string
   *                 format: binary
   *                 description: MBTiles file to upload (max 500MB)
   *               name:
   *                 type: string
   *                 description: Custom name for the map
   *                 example: "My Custom Map"
   *               description:
   *                 type: string
   *                 description: Description of the map
   *                 example: "A detailed map of the downtown area"
   *               version:
   *                 type: string
   *                 description: Version number for the map
   *                 example: "1.0.0"
   *     responses:
   *       201:
   *         description: Map uploaded successfully
   *         content:
   *           application/json:
   *             schema:
   *               $ref: '#/components/schemas/UploadResponse'
   *       400:
   *         $ref: '#/components/responses/BadRequest'
   *       500:
   *         $ref: '#/components/responses/InternalServerError'
   */
  public uploadMap = async (req: Request, res: Response): Promise<void> => {
    const requestId = req.requestId;
    const file = req.file;

    logger.info(
      {
        requestId,
        action: "upload_map_start",
        originalName: file?.originalname,
        fileSize: file?.size,
      },
      "Starting map upload"
    );

    try {
      if (!file) {
        res.status(400).json({
          error: "No file provided",
          requestId,
        });
        return;
      }

      // Extract optional metadata from request body
      const { name, description, version } = req.body;

      // Validate file type
      if (!file.originalname.toLowerCase().endsWith(".mbtiles")) {
        res.status(400).json({
          error: "Invalid file type. Only .mbtiles files are supported.",
          requestId,
        });
        return;
      }

      // Save the uploaded map
      const metadata = await this.mapService.saveUploadedMap(
        file.buffer,
        file.originalname,
        name,
        description,
        version,
        requestId
      );

      logger.info(
        {
          requestId,
          mapId: metadata.mapId,
          fileSize: file.size,
          action: "upload_map_success",
        },
        "Map upload completed successfully"
      );

      res.status(201).json({
        message: "Map uploaded successfully",
        mapId: metadata.mapId,
        metadata,
        requestId,
      });
    } catch (error) {
      logger.error(
        {
          requestId,
          originalName: file?.originalname,
          error: error instanceof Error ? error.message : "Unknown error",
          action: "upload_map_error",
        },
        "Map upload failed"
      );

      res.status(500).json({
        error: "Failed to upload map",
        details: error instanceof Error ? error.message : "Unknown error",
        requestId,
      });
    }
  };
}
