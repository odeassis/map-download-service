import * as fs from "fs";
import * as path from "path";
import { Response } from "express";
import pino from "pino";
import { v4 as uuidv4 } from "uuid";
import { MapMetadata, TileUpdate } from "../models/mapMetadata";
import { MetricsCalculator } from "../utils/metricsCalculator";

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
      let lastLoggedProgress = 0;
      let packetCount = 0;
      const startTime = Date.now();

      logger.info(
        {
          requestId,
          mapId,
          filePath,
          totalSize,
          totalSizeFormatted: MetricsCalculator.formatFileSize(totalSize),
          action: "download_start",
        },
        `Starting map download - ${MetricsCalculator.formatFileSize(totalSize)}`
      );

      const stream = fs.createReadStream(filePath, {
        highWaterMark: 64 * 1024,
      }); // 64KB chunks

      return new Promise((resolve, reject) => {
        stream.on("data", (chunk: string | Buffer) => {
          bytesRead += Buffer.byteLength(chunk);
          packetCount++;

          const metrics = MetricsCalculator.calculateTransferMetrics(
            bytesRead,
            totalSize,
            startTime
          );

          // Log progress at 5% intervals or every 10 seconds for large files
          if (
            MetricsCalculator.shouldLogProgress(
              metrics.progress,
              lastLoggedProgress,
              5
            ) ||
            (metrics.elapsedTime > 0 &&
              Math.floor(metrics.elapsedTime) % 10 === 0 &&
              metrics.progress > lastLoggedProgress)
          ) {
            const networkMetrics = MetricsCalculator.calculateNetworkMetrics(
              bytesRead,
              metrics.elapsedTime,
              packetCount
            );

            logger.info(
              {
                requestId,
                mapId,
                progress: metrics.progress,

                bytesRead: metrics.bytesTransferred,
                bytesReadFormatted: MetricsCalculator.formatFileSize(
                  metrics.bytesTransferred
                ),
                totalSize: metrics.totalSize,
                totalSizeFormatted: MetricsCalculator.formatFileSize(
                  metrics.totalSize
                ),
                speed: metrics.speedFormatted,
                throughputMbps: networkMetrics.throughputMbps.toFixed(2),
                elapsedTime: MetricsCalculator.formatDuration(
                  metrics.elapsedTime
                ),
                estimatedTimeRemaining: metrics.estimatedTimeRemaining
                  ? MetricsCalculator.formatDuration(
                      metrics.estimatedTimeRemaining
                    )
                  : undefined,
                packetCount,
                avgPacketSize: networkMetrics.avgPacketSize
                  ? MetricsCalculator.formatFileSize(
                      networkMetrics.avgPacketSize
                    )
                  : undefined,
                action: "download_progress",
              },
              `Download progress: ${metrics.progress}% - ${
                metrics.speedFormatted
              } - ETA: ${
                metrics.estimatedTimeRemaining
                  ? MetricsCalculator.formatDuration(
                      metrics.estimatedTimeRemaining
                    )
                  : "Calculating..."
              }`
            );
            lastLoggedProgress = metrics.progress;
          }
        });

        stream.on("end", () => {
          const finalMetrics = MetricsCalculator.calculateTransferMetrics(
            bytesRead,
            totalSize,
            startTime
          );

          const networkMetrics = MetricsCalculator.calculateNetworkMetrics(
            bytesRead,
            finalMetrics.elapsedTime,
            packetCount
          );

          logger.info(
            {
              requestId,
              mapId,
              totalTime: MetricsCalculator.formatDuration(
                finalMetrics.elapsedTime
              ),
              totalSize: finalMetrics.totalSize,
              totalSizeFormatted: MetricsCalculator.formatFileSize(
                finalMetrics.totalSize
              ),
              avgSpeed: finalMetrics.speedFormatted,
              throughputMbps: networkMetrics.throughputMbps.toFixed(2),
              totalPackets: packetCount,
              avgPacketSize: networkMetrics.avgPacketSize
                ? MetricsCalculator.formatFileSize(networkMetrics.avgPacketSize)
                : undefined,
              packetsPerSecond: networkMetrics.packetsPerSecond?.toFixed(0),
              efficiency: ((bytesRead / totalSize) * 100).toFixed(2),
              action: "download_complete",
            },
            `Download completed successfully in ${MetricsCalculator.formatDuration(
              finalMetrics.elapsedTime
            )} at ${finalMetrics.speedFormatted}`
          );
          resolve();
        });

        stream.on("error", (error) => {
          const errorMetrics = MetricsCalculator.calculateTransferMetrics(
            bytesRead,
            totalSize,
            startTime
          );

          logger.error(
            {
              requestId,
              mapId,
              filePath,
              error: error.message,
              bytesReadBeforeError: errorMetrics.bytesTransferred,
              bytesReadFormattedBeforeError: MetricsCalculator.formatFileSize(
                errorMetrics.bytesTransferred
              ),
              progressBeforeError: errorMetrics.progress,
              elapsedTimeBeforeError: MetricsCalculator.formatDuration(
                errorMetrics.elapsedTime
              ),
              packetCount,
              action: "download_error",
            },
            `Error during map streaming after ${
              errorMetrics.progress
            }% (${MetricsCalculator.formatFileSize(
              errorMetrics.bytesTransferred
            )})`
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
          action: "get_latest_uploaded_start",
        },
        "Starting to find most recently uploaded map"
      );

      const files = await fs.promises.readdir(metadataDir);
      const jsonFiles = files.filter((file) => file.endsWith(".json"));

      if (jsonFiles.length === 0) {
        throw new Error("No map metadata files found");
      }

      let latestMetadata: MapMetadata | null = null;
      let latestUploadTime: Date | null = null;

      for (const file of jsonFiles) {
        const filePath = path.join(metadataDir, file);
        try {
          const content = await fs.promises.readFile(filePath, "utf-8");
          const metadata: MapMetadata = JSON.parse(content);

          // Parse the createdAt timestamp to find the most recent upload
          const uploadTime = new Date(metadata.createdAt);

          // Skip if the date is invalid
          if (isNaN(uploadTime.getTime())) {
            logger.warn(
              {
                requestId,
                file,
                createdAt: metadata.createdAt,
                action: "invalid_date_skipped",
              },
              "Invalid createdAt date found, skipping file"
            );
            continue;
          }

          // Compare upload times to find the most recent
          if (
            !latestMetadata ||
            !latestUploadTime ||
            uploadTime > latestUploadTime
          ) {
            latestMetadata = metadata;
            latestUploadTime = uploadTime;
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

      if (!latestMetadata || !latestUploadTime) {
        throw new Error("No valid metadata found");
      }

      logger.info(
        {
          requestId,
          latestMapId: latestMetadata.mapId,
          latestUploadTime: latestUploadTime.toISOString(),
          latestVersion: latestMetadata.version,
          mapName: latestMetadata.name,
          fileSize: latestMetadata.size,
          fileSizeFormatted: latestMetadata.size
            ? MetricsCalculator.formatFileSize(latestMetadata.size)
            : "unknown",
          action: "get_latest_uploaded_success",
        },
        `Most recently uploaded map found: ${latestMetadata.name} (${
          latestMetadata.version
        }) uploaded on ${latestUploadTime.toISOString()}`
      );

      return latestMetadata;
    } catch (error) {
      logger.error(
        {
          requestId,
          metadataDir,
          error: error instanceof Error ? error.message : "Unknown error",
          action: "get_latest_uploaded_error",
        },
        "Failed to find most recently uploaded map"
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

    const uploadStartTime = Date.now();
    const fileSize = fileBuffer.length;

    try {
      logger.info(
        {
          requestId,
          mapId,
          originalFilename,
          fileSize,
          fileSizeFormatted: MetricsCalculator.formatFileSize(fileSize),
          mapName: mapName || path.basename(originalFilename, ".mbtiles"),
          description,
          version: version || "1.0.0",
          action: "upload_start",
        },
        `Starting map upload: ${originalFilename} (${MetricsCalculator.formatFileSize(
          fileSize
        )})`
      );

      // Ensure directories exist
      const dirCreationStart = Date.now();
      await fs.promises.mkdir(this.storageBasePath, { recursive: true });
      await fs.promises.mkdir(path.dirname(metadataFilePath), {
        recursive: true,
      });
      const dirCreationTime = Date.now() - dirCreationStart;

      logger.info(
        {
          requestId,
          mapId,
          dirCreationTime: `${dirCreationTime}ms`,
          action: "upload_directories_created",
        },
        "Upload directories ensured"
      );

      // Validate file type (basic check for .mbtiles extension)
      if (!originalFilename.toLowerCase().endsWith(".mbtiles")) {
        throw new Error(
          "Invalid file type. Only .mbtiles files are supported."
        );
      }

      // File validation timing
      const validationTime = Date.now() - uploadStartTime;
      logger.info(
        {
          requestId,
          mapId,
          validationTime: `${validationTime}ms`,
          action: "upload_file_validated",
        },
        "File validation completed"
      );

      // Save the map file with progress simulation for large files
      const fileWriteStart = Date.now();

      // For large files, we'll simulate chunked writing to provide progress
      if (fileSize > 10 * 1024 * 1024) {
        // 10MB threshold
        const chunkSize = 1024 * 1024; // 1MB chunks
        const totalChunks = Math.ceil(fileSize / chunkSize);
        let processedChunks = 0;

        logger.info(
          {
            requestId,
            mapId,
            totalChunks,
            chunkSizeFormatted: MetricsCalculator.formatFileSize(chunkSize),
            action: "upload_chunked_start",
          },
          `Starting chunked upload: ${totalChunks} chunks of ${MetricsCalculator.formatFileSize(
            chunkSize
          )}`
        );

        const fileHandle = await fs.promises.open(mapFilePath, "w");
        try {
          for (let i = 0; i < fileSize; i += chunkSize) {
            const chunk = fileBuffer.subarray(
              i,
              Math.min(i + chunkSize, fileSize)
            );
            await fileHandle.write(chunk);
            processedChunks++;

            const progress = Math.round((processedChunks / totalChunks) * 100);
            const elapsedTime = (Date.now() - fileWriteStart) / 1000;
            const speed =
              (processedChunks * chunkSize) / (1024 * 1024) / elapsedTime;

            // Log every 10% or every 5 chunks for large files
            if (
              processedChunks % Math.max(1, Math.floor(totalChunks / 10)) ===
                0 ||
              processedChunks % 5 === 0
            ) {
              logger.info(
                {
                  requestId,
                  mapId,
                  processedChunks,
                  totalChunks,
                  progress,
                  writtenBytes: processedChunks * chunkSize,
                  writtenBytesFormatted: MetricsCalculator.formatFileSize(
                    processedChunks * chunkSize
                  ),
                  speed: MetricsCalculator.formatSpeed(speed),
                  elapsedTime: MetricsCalculator.formatDuration(elapsedTime),
                  action: "upload_chunk_progress",
                },
                `Upload progress: ${progress}% - ${MetricsCalculator.formatSpeed(
                  speed
                )}`
              );
            }
          }
        } finally {
          await fileHandle.close();
        }
      } else {
        // Small files - direct write
        await fs.promises.writeFile(mapFilePath, fileBuffer);
      }

      const fileWriteTime = Date.now() - fileWriteStart;
      const fileWriteSpeed = fileSize / (1024 * 1024) / (fileWriteTime / 1000);

      logger.info(
        {
          requestId,
          mapId,
          mapFilePath,
          fileWriteTime: `${fileWriteTime}ms`,
          fileWriteSpeed: MetricsCalculator.formatSpeed(fileWriteSpeed),
          action: "upload_file_written",
        },
        `Map file written successfully in ${fileWriteTime}ms at ${MetricsCalculator.formatSpeed(
          fileWriteSpeed
        )}`
      );

      // Generate checksum with timing
      const checksumStart = Date.now();
      const checksum = this.generateChecksum(fileBuffer);
      const checksumTime = Date.now() - checksumStart;

      logger.info(
        {
          requestId,
          mapId,
          checksum,
          checksumTime: `${checksumTime}ms`,
          action: "upload_checksum_generated",
        },
        `Checksum generated in ${checksumTime}ms`
      );

      // Generate metadata
      const metadataGenerationStart = Date.now();
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
        checksum: checksum,
      };

      // Save metadata
      const metadataWriteStart = Date.now();
      await fs.promises.writeFile(
        metadataFilePath,
        JSON.stringify(metadata, null, 2)
      );
      const metadataWriteTime = Date.now() - metadataWriteStart;
      const metadataGenerationTime = Date.now() - metadataGenerationStart;

      logger.info(
        {
          requestId,
          mapId,
          metadataFilePath,
          metadataGenerationTime: `${metadataGenerationTime}ms`,
          metadataWriteTime: `${metadataWriteTime}ms`,
          action: "upload_metadata_saved",
        },
        `Metadata generated and saved in ${metadataGenerationTime}ms`
      );

      // Final upload summary
      const totalUploadTime = Date.now() - uploadStartTime;
      const totalUploadSpeed =
        fileSize / (1024 * 1024) / (totalUploadTime / 1000);

      logger.info(
        {
          requestId,
          mapId,
          originalFilename,
          fileSize,
          fileSizeFormatted: MetricsCalculator.formatFileSize(fileSize),
          totalUploadTime: `${totalUploadTime}ms`,
          totalUploadTimeFormatted: MetricsCalculator.formatDuration(
            totalUploadTime / 1000
          ),
          averageSpeed: MetricsCalculator.formatSpeed(totalUploadSpeed),
          checksum: checksum.substring(0, 8), // First 8 chars for logging
          breakdown: {
            validation: `${validationTime}ms`,
            directoryCreation: `${dirCreationTime}ms`,
            fileWrite: `${fileWriteTime}ms`,
            checksumGeneration: `${checksumTime}ms`,
            metadataGeneration: `${metadataGenerationTime}ms`,
          },
          action: "upload_complete",
        },
        `Upload completed successfully: ${MetricsCalculator.formatFileSize(
          fileSize
        )} in ${MetricsCalculator.formatDuration(
          totalUploadTime / 1000
        )} at ${MetricsCalculator.formatSpeed(totalUploadSpeed)}`
      );

      return metadata;
    } catch (error) {
      const errorTime = Date.now() - uploadStartTime;

      logger.error(
        {
          requestId,
          mapId,
          originalFilename,
          fileSize,
          fileSizeFormatted: MetricsCalculator.formatFileSize(fileSize),
          errorTime: `${errorTime}ms`,
          errorTimeFormatted: MetricsCalculator.formatDuration(
            errorTime / 1000
          ),
          error: error instanceof Error ? error.message : "Unknown error",
          action: "upload_error",
        },
        `Upload failed after ${MetricsCalculator.formatDuration(
          errorTime / 1000
        )}: ${error instanceof Error ? error.message : "Unknown error"}`
      );

      // Clean up files if they were created
      try {
        await fs.promises.unlink(mapFilePath).catch(() => {});
        await fs.promises.unlink(metadataFilePath).catch(() => {});

        logger.info(
          {
            requestId,
            mapId,
            action: "upload_cleanup_success",
          },
          "Cleanup completed after upload error"
        );
      } catch (cleanupError) {
        logger.warn(
          {
            requestId,
            mapId,
            cleanupError:
              cleanupError instanceof Error
                ? cleanupError.message
                : "Unknown cleanup error",
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
