import { Router } from 'express';
import {
  createCustomProduct,
  addTracksToCustomProduct,
  getCustomProductById,
} from '../controllers/customProduct.controller';
import {
  uploadCover,
  uploadTracks,
  validateImageMagicBytes,
  validateAudioMagicBytes,
} from '../middlewares/upload.middleware';
import { authenticateToken } from '../middlewares/auth.middleware';

const router = Router();

// Subir carátula al crear el disco personalizado (autenticación obligatoria + validación de Magic Bytes)
router.post(
  '/',
  authenticateToken,
  uploadCover.single('cover'),
  validateImageMagicBytes,
  createCustomProduct
);

// Subir canciones/tracks vinculadas al disco personalizado (autenticación obligatoria + validación de Magic Bytes)
router.post(
  '/:id/tracks',
  authenticateToken,
  uploadTracks.array('tracks', 20),
  validateAudioMagicBytes,
  addTracksToCustomProduct
);

// Consultar detalle de disco personalizado con sus tracks
router.get('/:id', getCustomProductById);

export default router;
