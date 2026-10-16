import { Router } from 'express';
import { checkout, getOrderById } from '../controllers/order.controller';
import { optionalAuthenticateToken } from '../middlewares/auth.middleware';

const router = Router();

router.post('/checkout', optionalAuthenticateToken, checkout);
router.get('/:id', optionalAuthenticateToken, getOrderById);

export default router;
