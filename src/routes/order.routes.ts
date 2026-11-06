import { Router } from 'express';
import { checkout, getOrderById } from '../controllers/order.controller';
import { authenticateToken } from '../middlewares/auth.middleware';

const router = Router();

router.post('/checkout', authenticateToken, checkout);
router.get('/:id', authenticateToken, getOrderById);

export default router;
