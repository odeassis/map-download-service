import { Request, Response } from 'express';
import path from 'path';
import pino from 'pino';
import { MapService } from '../services/mapService';

const logger = pino({
    level: 'info',
    timestamp: pino.stdTimeFunctions.isoTime,
});

const storageBasePath = process.env.STORAGE_BASE_PATH || path.join(__dirname, '..', 'archives', 'maps');

export class MapController {
    private mapService: MapService;

    constructor() {
        this.mapService = new MapService(storageBasePath);
    }

    public downloadMap = async (req: Request, res: Response): Promise<void> => {
        const { map_id } = req.params;
        const requestId = req.requestId;

        logger.info({
            requestId,
            mapId: map_id,
            action: 'download_map_start'
        }, 'Starting map download');

        try {
            res.setHeader('Content-Type', 'application/octet-stream');
            res.setHeader('Content-Disposition', `attachment; filename=map-${map_id}.mbtiles`);

            await this.mapService.streamMap(map_id, res, requestId);

            logger.info({
                requestId,
                mapId: map_id,
                action: 'download_map_success'
            }, 'Map download completed successfully');
        } catch (error) {
            logger.error({
                requestId,
                mapId: map_id,
                action: 'download_map_error',
                error: error instanceof Error ? error.message : 'Unknown error'
            }, 'Map download failed');

            if (!res.headersSent) {
                res.status(500).json({
                    error: 'Failed to download map',
                    requestId
                });
            }
        }
    };

    public getMapMetadata = async (req: Request, res: Response): Promise<void> => {
        const { map_id } = req.params;
        const requestId = req.requestId;

        logger.info({
            requestId,
            mapId: map_id,
            action: 'get_metadata_start'
        }, 'Retrieving map metadata');

        try {
            const metadata = await this.mapService.getMapMetadata(map_id);

            logger.info({
                requestId,
                mapId: map_id,
                action: 'get_metadata_success'
            }, 'Map metadata retrieved successfully');

            res.status(200).json(metadata);
        } catch (error) {
            logger.error({
                requestId,
                mapId: map_id,
                action: 'get_metadata_error',
                error: error instanceof Error ? error.message : 'Unknown error'
            }, 'Failed to retrieve map metadata');

            res.status(404).json({
                error: 'Map not found or metadata unavailable',
                requestId
            });
        }
    };
}