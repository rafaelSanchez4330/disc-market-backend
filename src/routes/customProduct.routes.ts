import { Router } from 'express';
import {
  createCustomProduct,
  addTracksToCustomProduct,
  getCustomProductById,
} from '../controllers/customProduct.controller';
import { uploadCover, uploadTracks } from '../middlewares/upload.middleware';

const router = Router();

// Subir carátula al crear el disco personalizado
router.post('/', uploadCover.single('cover'), createCustomProduct);

// Subir canciones/tracks vinculadas al disco personalizado
router.post('/:id/tracks', uploadTracks.array('tracks', 20), addTracksToCustomProduct);

// Consultar detalle de disco personalizado con sus tracks
router.get('/:id', getCustomProductById);

export default router;
