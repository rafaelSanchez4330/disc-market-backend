import { Router } from 'express';
import {
  createCustomProduct,
  addTracksToCustomProduct,
  getCustomProductById,
  getCustomProductPricing,
  scanAudioTrack,
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

// Consultar tarifas base vigentes de personalización (antes de la ruta dinámica /:id)
router.get('/pricing', getCustomProductPricing);

// Pre-escanear pista de audio (análisis en vivo de duración, peso y copyright - público para diseño de disco)
router.post(
  '/scan-track',
  uploadTracks.single('audio'),
  validateAudioMagicBytes,
  scanAudioTrack
);

// Consultar detalle de disco personalizado con sus tracks
router.get('/:id', getCustomProductById);

export default router;
