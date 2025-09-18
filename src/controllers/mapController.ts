import { Request, Response } from "express";
import path from "path";
import pino from "pino";
import { MapService } from "../services/mapService";
import { MetricsCalculator } from "../utils/metricsCalculator";

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
    const controllerStartTime = Date.now();

    // Log client information
    const clientInfo = {
      userAgent: req.get("User-Agent"),
      acceptEncoding: req.get("Accept-Encoding"),
      contentLength: req.get("Content-Length"),
      range: req.get("Range"),
      ifModifiedSince: req.get("If-Modified-Since"),
      connection: req.get("Connection"),
    };

    logger.info(
      {
        requestId,
        mapId: map_id,
        clientInfo,
        action: "download_controller_start",
      },
      `Starting download request for map: ${map_id}`
    );

    try {
      res.setHeader("Content-Type", "application/octet-stream");
      res.setHeader(
        "Content-Disposition",
        `attachment; filename=map-${map_id}.mbtiles`
      );

      // Add performance headers
      const streamStartTime = Date.now();
      res.setHeader("X-Stream-Start-Time", streamStartTime.toString());
      res.setHeader("X-Request-ID", requestId || "unknown");

      await this.mapService.streamMap(map_id, res, requestId);

      const controllerEndTime = Date.now();
      const totalControllerTime = controllerEndTime - controllerStartTime;

      logger.info(
        {
          requestId,
          mapId: map_id,
          totalControllerTime: `${totalControllerTime}ms`,
          totalControllerTimeFormatted: MetricsCalculator.formatDuration(
            totalControllerTime / 1000
          ),
          action: "download_controller_success",
        },
        `Download request completed successfully in ${MetricsCalculator.formatDuration(
          totalControllerTime / 1000
        )}`
      );
    } catch (error) {
      const controllerErrorTime = Date.now() - controllerStartTime;

      logger.error(
        {
          requestId,
          mapId: map_id,
          controllerErrorTime: `${controllerErrorTime}ms`,
          controllerErrorTimeFormatted: MetricsCalculator.formatDuration(
            controllerErrorTime / 1000
          ),
          error: error instanceof Error ? error.message : "Unknown error",
          action: "download_controller_error",
        },
        `Download request failed after ${MetricsCalculator.formatDuration(
          controllerErrorTime / 1000
        )}`
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
    const controllerStartTime = Date.now();

    // Log comprehensive request information
    const requestInfo = {
      contentType: req.get("Content-Type"),
      contentLength: req.get("Content-Length"),
      userAgent: req.get("User-Agent"),
      acceptEncoding: req.get("Accept-Encoding"),
      connection: req.get("Connection"),
      transferEncoding: req.get("Transfer-Encoding"),
    };

    logger.info(
      {
        requestId,
        action: "upload_controller_start",
        originalName: file?.originalname,
        fileSize: file?.size,
        fileSizeFormatted: file?.size
          ? MetricsCalculator.formatFileSize(file.size)
          : undefined,
        requestInfo,
      },
      `Starting upload request: ${file?.originalname || "unknown"} (${
        file?.size
          ? MetricsCalculator.formatFileSize(file.size)
          : "unknown size"
      })`
    );

    try {
      if (!file) {
        const errorTime = Date.now() - controllerStartTime;
        logger.warn(
          {
            requestId,
            errorTime: `${errorTime}ms`,
            action: "upload_controller_no_file",
          },
          "Upload request rejected: No file provided"
        );

        res.status(400).json({
          error: "No file provided",
          requestId,
        });
        return;
      }

      // Extract optional metadata from request body
      const { name, description, version } = req.body;

      // Enhanced file validation logging
      const validationStartTime = Date.now();

      if (!file.originalname.toLowerCase().endsWith(".mbtiles")) {
        const validationTime = Date.now() - validationStartTime;
        logger.warn(
          {
            requestId,
            originalName: file.originalname,
            fileSize: file.size,
            fileSizeFormatted: MetricsCalculator.formatFileSize(file.size),
            validationTime: `${validationTime}ms`,
            action: "upload_controller_invalid_type",
          },
          `Upload request rejected: Invalid file type - ${file.originalname}`
        );

        res.status(400).json({
          error: "Invalid file type. Only .mbtiles files are supported.",
          requestId,
        });
        return;
      }

      const validationTime = Date.now() - validationStartTime;
      logger.info(
        {
          requestId,
          originalName: file.originalname,
          fileSize: file.size,
          fileSizeFormatted: MetricsCalculator.formatFileSize(file.size),
          validationTime: `${validationTime}ms`,
          providedMetadata: { name, description, version },
          action: "upload_controller_validated",
        },
        `File validation passed in ${validationTime}ms`
      );

      // Process upload with service
      const serviceStartTime = Date.now();
      const metadata = await this.mapService.saveUploadedMap(
        file.buffer,
        file.originalname,
        name,
        description,
        version,
        requestId
      );
      const serviceTime = Date.now() - serviceStartTime;

      const controllerEndTime = Date.now();
      const totalControllerTime = controllerEndTime - controllerStartTime;
      const processingSpeed =
        file.size / (1024 * 1024) / (totalControllerTime / 1000);

      logger.info(
        {
          requestId,
          mapId: metadata.mapId,
          originalName: file.originalname,
          fileSize: file.size,
          fileSizeFormatted: MetricsCalculator.formatFileSize(file.size),
          serviceTime: `${serviceTime}ms`,
          serviceTimeFormatted: MetricsCalculator.formatDuration(
            serviceTime / 1000
          ),
          totalControllerTime: `${totalControllerTime}ms`,
          totalControllerTimeFormatted: MetricsCalculator.formatDuration(
            totalControllerTime / 1000
          ),
          processingSpeed: MetricsCalculator.formatSpeed(processingSpeed),
          resultingChecksum: metadata.checksum?.substring(0, 8), // First 8 chars
          timing: {
            validation: `${validationTime}ms`,
            service: `${serviceTime}ms`,
            total: `${totalControllerTime}ms`,
          },
          action: "upload_controller_success",
        },
        `Upload completed successfully: ${MetricsCalculator.formatFileSize(
          file.size
        )} processed in ${MetricsCalculator.formatDuration(
          totalControllerTime / 1000
        )} at ${MetricsCalculator.formatSpeed(processingSpeed)}`
      );

      res.status(201).json({
        message: "Map uploaded successfully",
        mapId: metadata.mapId,
        metadata,
        performance: {
          totalTime: `${totalControllerTime}ms`,
          processingSpeed: MetricsCalculator.formatSpeed(processingSpeed),
          fileSize: MetricsCalculator.formatFileSize(file.size),
        },
        requestId,
      });
    } catch (error) {
      const controllerErrorTime = Date.now() - controllerStartTime;

      logger.error(
        {
          requestId,
          originalName: file?.originalname,
          fileSize: file?.size,
          fileSizeFormatted: file?.size
            ? MetricsCalculator.formatFileSize(file.size)
            : undefined,
          controllerErrorTime: `${controllerErrorTime}ms`,
          controllerErrorTimeFormatted: MetricsCalculator.formatDuration(
            controllerErrorTime / 1000
          ),
          error: error instanceof Error ? error.message : "Unknown error",
          errorStack: error instanceof Error ? error.stack : undefined,
          action: "upload_controller_error",
        },
        `Upload failed after ${MetricsCalculator.formatDuration(
          controllerErrorTime / 1000
        )}: ${error instanceof Error ? error.message : "Unknown error"}`
      );

      res.status(500).json({
        error: "Failed to upload map",
        details: error instanceof Error ? error.message : "Unknown error",
        performance: {
          timeBeforeError: `${controllerErrorTime}ms`,
          fileSize: file?.size
            ? MetricsCalculator.formatFileSize(file.size)
            : undefined,
        },
        requestId,
      });
    }
  };
}
