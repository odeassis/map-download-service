import * as fs from "fs";
import * as path from "path";
import { Response } from "express";
import pino from "pino";
import { v4 as uuidv4 } from "uuid";
import { MapMetadata, TileUpdate } from "../models/mapMetadata";

const logger = pino({
  level: "info",
  timestamp: pino.stdTimeFunctions.isoTime,
});

export class MapService {
  private readonly storageBasePath: string;

  constructor(storageBasePath: string) {
    this.storageBasePath = storageBasePath;
  }

  public async getMapMetadata(mapId: string): Promise<MapMetadata> {
    const metadataPath = `${this.storageBasePath}/metadata/${mapId}.json`;

    try {
      const metadataContent = await fs.promises.readFile(metadataPath, "utf-8");
      return JSON.parse(metadataContent);
    } catch (error) {
      logger.error(
        {
          mapId,
          metadataPath,
          error: error instanceof Error ? error.message : "Unknown error",
        },
        "Failed to read map metadata"
      );
      throw new Error(`Map metadata not found for ID: ${mapId}`);
    }
  }

  public async streamMap(
    mapId: string,
    res: Response,
    requestId?: string
  ): Promise<void> {
    const filePath = `${this.storageBasePath}/${mapId}.mbtiles`;

    try {
      const stats = await fs.promises.stat(filePath);
      const totalSize = stats.size;
      let bytesRead = 0;
      const startTime = Date.now();

      logger.info(
        {
          requestId,
          mapId,
          filePath,
          totalSize,
          action: "stream_start",
        },
        "Starting map file stream"
      );

      const stream = fs.createReadStream(filePath);

      return new Promise((resolve, reject) => {
        stream.on("data", (chunk: string | Buffer) => {
          bytesRead += Buffer.byteLength(chunk);
          const progress = Math.round((bytesRead / totalSize) * 100);

          // Log progress every 25%
          if (progress % 25 === 0) {
            const elapsedSeconds = (Date.now() - startTime) / 1000;
            const speed = (bytesRead / (1024 * 1024) / elapsedSeconds).toFixed(
              2
            );

            logger.info(
              {
                requestId,
                mapId,
                progress,
                bytesRead,
                totalSize,
                speed: `${speed} MB/s`,
                elapsedTime: `${elapsedSeconds.toFixed(1)}s`,
              },
              `Download progress: ${progress}%`
            );
          }
        });

        stream.on("end", () => {
          const totalTime = ((Date.now() - startTime) / 1000).toFixed(1);
          logger.info(
            {
              requestId,
              mapId,
              totalTime: `${totalTime}s`,
              totalSize,
              action: "stream_complete",
            },
            "Map download completed"
          );
          resolve();
        });

        stream.on("error", (error) => {
          logger.error(
            {
              requestId,
              mapId,
              filePath,
              error: error.message,
              action: "stream_error",
            },
            "Error during map streaming"
          );
          reject(error);
        });

        stream.pipe(res);
      });
    } catch (error) {
      logger.error(
        {
          requestId,
          mapId,
          filePath,
          error: error instanceof Error ? error.message : "Unknown error",
          action: "stream_file_error",
        },
        "Failed to access map file"
      );
      throw new Error(`Map file not found for ID: ${mapId}`);
    }
  }

  public async findChangedTiles(
    currentMetadata: MapMetadata,
    clientMetadata: MapMetadata
  ): Promise<TileUpdate[]> {
    const changedTiles: TileUpdate[] = [];

    // Check if both metadata objects have tileChecksums
    if (!currentMetadata.tileChecksums || !clientMetadata.tileChecksums) {
      return changedTiles;
    }

    for (const [key, currentChecksum] of Object.entries(
      currentMetadata.tileChecksums
    )) {
      const clientChecksum = clientMetadata.tileChecksums[key];

      if (clientChecksum !== currentChecksum) {
        const [z, x, y] = key.split("/").map(Number);

        changedTiles.push({
          z,
          x,
          y,
          checksum: currentChecksum,
        });
      }
    }

    return changedTiles;
  }

  public async getLatestMapVersion(requestId?: string): Promise<MapMetadata> {
    const metadataDir = path.join(this.storageBasePath, "metadata");

    try {
      logger.info(
        {
          requestId,
          metadataDir,
          action: "get_latest_version_start",
        },
        "Starting to find latest map version"
      );

      const files = await fs.promises.readdir(metadataDir);
      const jsonFiles = files.filter((file) => file.endsWith(".json"));

      if (jsonFiles.length === 0) {
        throw new Error("No map metadata files found");
      }

      let latestMetadata: MapMetadata | null = null;
      let latestVersion = "";

      for (const file of jsonFiles) {
        const filePath = path.join(metadataDir, file);
        try {
          const content = await fs.promises.readFile(filePath, "utf-8");
          const metadata: MapMetadata = JSON.parse(content);

          // Compare versions (assuming semantic versioning or simple string comparison)
          if (
            !latestMetadata ||
            this.compareVersions(metadata.version, latestVersion) > 0
          ) {
            latestMetadata = metadata;
            latestVersion = metadata.version;
          }
        } catch (error) {
          logger.warn(
            {
              requestId,
              file,
              error: error instanceof Error ? error.message : "Unknown error",
            },
            "Failed to parse metadata file, skipping"
          );
        }
      }

      if (!latestMetadata) {
        throw new Error("No valid metadata found");
      }

      logger.info(
        {
          requestId,
          latestMapId: latestMetadata.mapId,
          latestVersion: latestMetadata.version,
          action: "get_latest_version_success",
        },
        "Latest map version found successfully"
      );

      return latestMetadata;
    } catch (error) {
      logger.error(
        {
          requestId,
          metadataDir,
          error: error instanceof Error ? error.message : "Unknown error",
          action: "get_latest_version_error",
        },
        "Failed to find latest map version"
      );
      throw error;
    }
  }

  private compareVersions(version1: string, version2: string): number {
    // Simple version comparison - can be enhanced for semantic versioning
    const v1Parts = version1.split(".").map(Number);
    const v2Parts = version2.split(".").map(Number);

    const maxLength = Math.max(v1Parts.length, v2Parts.length);

    for (let i = 0; i < maxLength; i++) {
      const v1Part = v1Parts[i] || 0;
      const v2Part = v2Parts[i] || 0;

      if (v1Part > v2Part) return 1;
      if (v1Part < v2Part) return -1;
    }

    return 0;
  }

  public async saveUploadedMap(
    fileBuffer: Buffer,
    originalFilename: string,
    mapName?: string,
    description?: string,
    version?: string,
    requestId?: string
  ): Promise<MapMetadata> {
    const mapId = uuidv4();
    const timestamp = new Date().toISOString();
    const mapFilename = `${mapId}.mbtiles`;
    const mapFilePath = path.join(this.storageBasePath, mapFilename);
    const metadataFilePath = path.join(
      this.storageBasePath,
      "metadata",
      `${mapId}.json`
    );

    try {
      logger.info(
        {
          requestId,
          mapId,
          originalFilename,
          fileSize: fileBuffer.length,
          action: "upload_map_start",
        },
        "Starting map upload process"
      );

      // Ensure directories exist
      await fs.promises.mkdir(this.storageBasePath, { recursive: true });
      await fs.promises.mkdir(path.dirname(metadataFilePath), {
        recursive: true,
      });

      // Validate file type (basic check for .mbtiles extension)
      if (!originalFilename.toLowerCase().endsWith(".mbtiles")) {
        throw new Error(
          "Invalid file type. Only .mbtiles files are supported."
        );
      }

      // Save the map file
      await fs.promises.writeFile(mapFilePath, fileBuffer);

      logger.info(
        {
          requestId,
          mapId,
          mapFilePath,
          action: "upload_file_saved",
        },
        "Map file saved successfully"
      );

      // Generate metadata
      const metadata: MapMetadata = {
        mapId,
        name: mapName || path.basename(originalFilename, ".mbtiles"),
        basename: mapFilename,
        description: description || `Map uploaded from ${originalFilename}`,
        createdAt: timestamp,
        updatedAt: timestamp,
        version: version || "1.0.0",
        metadata: {
          bounds: [-180, -85, 180, 85], // Default bounds, can be extracted from mbtiles if needed
          center: [0, 0, 2], // Default center
          format: "mbtiles",
          minzoom: 0,
          maxzoom: 18,
          attribution: "Map data upload",
        },
        size: fileBuffer.length,
        checksum: this.generateChecksum(fileBuffer),
      };

      // Save metadata
      await fs.promises.writeFile(
        metadataFilePath,
        JSON.stringify(metadata, null, 2)
      );

      logger.info(
        {
          requestId,
          mapId,
          metadataFilePath,
          action: "upload_metadata_saved",
        },
        "Map metadata saved successfully"
      );

      logger.info(
        {
          requestId,
          mapId,
          fileSize: fileBuffer.length,
          action: "upload_map_success",
        },
        "Map upload completed successfully"
      );

      return metadata;
    } catch (error) {
      logger.error(
        {
          requestId,
          mapId,
          originalFilename,
          error: error instanceof Error ? error.message : "Unknown error",
          action: "upload_map_error",
        },
        "Failed to upload map"
      );

      // Clean up files if they were created
      try {
        await fs.promises.unlink(mapFilePath).catch(() => {});
        await fs.promises.unlink(metadataFilePath).catch(() => {});
      } catch (cleanupError) {
        logger.warn(
          {
            requestId,
            mapId,
            action: "upload_cleanup_error",
          },
          "Failed to clean up files after upload error"
        );
      }

      throw error;
    }
  }

  private generateChecksum(buffer: Buffer): string {
    const crypto = require("crypto");
    return crypto.createHash("md5").update(buffer).digest("hex");
  }
}
