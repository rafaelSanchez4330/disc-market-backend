import { Router } from 'express';
import { authenticateToken } from '../middlewares/auth.middleware';
import { requireAdmin, getAdminSummary, getAdminProducts, addAdminStock, getAdminUsers, getAdminOrders } from '../controllers/admin.controller';

const router = Router();
router.use(authenticateToken, requireAdmin);
router.get('/summary', getAdminSummary);
router.get('/products', getAdminProducts);
router.post('/products/:id/stock', addAdminStock);
router.get('/users', getAdminUsers);
router.get('/orders', getAdminOrders);
export default router;
