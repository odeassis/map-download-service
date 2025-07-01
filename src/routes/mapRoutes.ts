import { Router } from 'express';
import { MapController } from '../controllers/mapController';

const router = Router();

const mapController = new MapController();

router.get('/map/:map_id/download', mapController.downloadMap);
router.get('/map/:map_id/metadata', mapController.getMapMetadata);
router.get('/map/latest-version', mapController.getLatestMapVersion);

export default router;