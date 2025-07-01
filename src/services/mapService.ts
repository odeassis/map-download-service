import * as fs from 'fs';
import * as path from 'path';
import { Response } from 'express';
import pino from 'pino';
import { MapMetadata, TileUpdate } from '../models/mapMetadata';

const logger = pino({
  level: 'info',
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
      const metadataContent = await fs.promises.readFile(metadataPath, 'utf-8');
      return JSON.parse(metadataContent);
    } catch (error) {
      logger.error({
        mapId,
        metadataPath,
        error: error instanceof Error ? error.message : 'Unknown error'
      }, 'Failed to read map metadata');
      throw new Error(`Map metadata not found for ID: ${mapId}`);
    }
  }

  public async streamMap(mapId: string, res: Response, requestId?: string): Promise<void> {
    const filePath = `${this.storageBasePath}/${mapId}.mbtiles`;

    try {
      const stats = await fs.promises.stat(filePath);
      const totalSize = stats.size;
      let bytesRead = 0;
      const startTime = Date.now();

      logger.info({
        requestId,
        mapId,
        filePath,
        totalSize,
        action: 'stream_start'
      }, 'Starting map file stream');

      const stream = fs.createReadStream(filePath);

      return new Promise((resolve, reject) => {
        stream.on('data', (chunk: string | Buffer) => {
          bytesRead += Buffer.byteLength(chunk);
          const progress = Math.round((bytesRead / totalSize) * 100);

          // Log progress every 25%
          if (progress % 25 === 0) {
            const elapsedSeconds = (Date.now() - startTime) / 1000;
            const speed = (bytesRead / (1024 * 1024) / elapsedSeconds).toFixed(2);

            logger.info({
              requestId,
              mapId,
              progress,
              bytesRead,
              totalSize,
              speed: `${speed} MB/s`,
              elapsedTime: `${elapsedSeconds.toFixed(1)}s`
            }, `Download progress: ${progress}%`);
          }
        });

        stream.on('end', () => {
          const totalTime = ((Date.now() - startTime) / 1000).toFixed(1);
          logger.info({
            requestId,
            mapId,
            totalTime: `${totalTime}s`,
            totalSize,
            action: 'stream_complete'
          }, 'Map download completed');
          resolve();
        });

        stream.on('error', (error) => {
          logger.error({
            requestId,
            mapId,
            filePath,
            error: error.message,
            action: 'stream_error'
          }, 'Error during map streaming');
          reject(error);
        });

        stream.pipe(res);
      });
    } catch (error) {
      logger.error({
        requestId,
        mapId,
        filePath,
        error: error instanceof Error ? error.message : 'Unknown error',
        action: 'stream_file_error'
      }, 'Failed to access map file');
      throw new Error(`Map file not found for ID: ${mapId}`);
    }
  }

  public async findChangedTiles(currentMetadata: MapMetadata, clientMetadata: MapMetadata): Promise<TileUpdate[]> {
    const changedTiles: TileUpdate[] = [];

    // Check if both metadata objects have tileChecksums
    if (!currentMetadata.tileChecksums || !clientMetadata.tileChecksums) {
      return changedTiles;
    }

    for (const [key, currentChecksum] of Object.entries(currentMetadata.tileChecksums)) {
      const clientChecksum = clientMetadata.tileChecksums[key];

      if (clientChecksum !== currentChecksum) {
        const [z, x, y] = key.split('/').map(Number);

        changedTiles.push({
          z,
          x,
          y,
          checksum: currentChecksum
        });
      }
    }

    return changedTiles;
  }

  public async getLatestMapVersion(requestId?: string): Promise<MapMetadata> {
    const metadataDir = path.join(this.storageBasePath, 'metadata');

    try {
      logger.info({
        requestId,
        metadataDir,
        action: 'get_latest_version_start'
      }, 'Starting to find latest map version');

      const files = await fs.promises.readdir(metadataDir);
      const jsonFiles = files.filter(file => file.endsWith('.json'));

      if (jsonFiles.length === 0) {
        throw new Error('No map metadata files found');
      }

      let latestMetadata: MapMetadata | null = null;
      let latestVersion = '';

      for (const file of jsonFiles) {
        const filePath = path.join(metadataDir, file);
        try {
          const content = await fs.promises.readFile(filePath, 'utf-8');
          const metadata: MapMetadata = JSON.parse(content);

          // Compare versions (assuming semantic versioning or simple string comparison)
          if (!latestMetadata || this.compareVersions(metadata.version, latestVersion) > 0) {
            latestMetadata = metadata;
            latestVersion = metadata.version;
          }
        } catch (error) {
          logger.warn({
            requestId,
            file,
            error: error instanceof Error ? error.message : 'Unknown error'
          }, 'Failed to parse metadata file, skipping');
        }
      }

      if (!latestMetadata) {
        throw new Error('No valid metadata found');
      }

      logger.info({
        requestId,
        latestMapId: latestMetadata.mapId,
        latestVersion: latestMetadata.version,
        action: 'get_latest_version_success'
      }, 'Latest map version found successfully');

      return latestMetadata;
    } catch (error) {
      logger.error({
        requestId,
        metadataDir,
        error: error instanceof Error ? error.message : 'Unknown error',
        action: 'get_latest_version_error'
      }, 'Failed to find latest map version');
      throw error;
    }
  }

  private compareVersions(version1: string, version2: string): number {
    // Simple version comparison - can be enhanced for semantic versioning
    const v1Parts = version1.split('.').map(Number);
    const v2Parts = version2.split('.').map(Number);

    const maxLength = Math.max(v1Parts.length, v2Parts.length);

    for (let i = 0; i < maxLength; i++) {
      const v1Part = v1Parts[i] || 0;
      const v2Part = v2Parts[i] || 0;

      if (v1Part > v2Part) return 1;
      if (v1Part < v2Part) return -1;
    }

    return 0;
  }
}