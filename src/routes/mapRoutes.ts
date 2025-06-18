import { Router } from 'express';
import { MapController } from '../controllers/mapController';

const router = Router();

const mapController = new MapController();

router.get('/map/:map_id/download', mapController.downloadMap);
router.get('/map/:map_id/metadata', mapController.getMapMetadata);

export default router;