import { Router } from 'express';
import { checkout, getOrderById } from '../controllers/order.controller';

const router = Router();

router.post('/checkout', checkout);
router.get('/:id', getOrderById);

export default router;
