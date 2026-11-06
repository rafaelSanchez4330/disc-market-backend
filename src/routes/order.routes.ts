import { Router } from 'express';
import { getOrderById } from '../controllers/order.controller';
import { authenticateToken } from '../middlewares/auth.middleware';

const router = Router();

router.post('/checkout', authenticateToken, (_req, res) => {
  res.status(410).json({ message: 'Usa el pago con Stripe para validar inventario y confirmar tu compra.' });
});
router.get('/:id', authenticateToken, getOrderById);

export default router;
