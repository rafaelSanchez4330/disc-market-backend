import { Router } from 'express';
import {
  getProfile,
  updateProfile,
  updatePassword,
  updatePreferences,
  getUserOrders,
} from '../controllers/user.controller';
import { authenticateToken } from '../middlewares/auth.middleware';

const router = Router();

// Todas las rutas de usuario requieren autenticación
router.get('/profile', authenticateToken, getProfile);
router.put('/profile', authenticateToken, updateProfile);
router.put('/password', authenticateToken, updatePassword);
router.put('/preferences', authenticateToken, updatePreferences);
router.get('/orders', authenticateToken, getUserOrders);

export default router;
