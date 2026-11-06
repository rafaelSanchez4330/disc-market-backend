import { Router } from 'express';
import {
  getUserCart,
  addToCart,
  updateCartItem,
  removeFromCart,
  clearCart,
} from '../controllers/cart.controller';
import { authenticateToken } from '../middlewares/auth.middleware';

const router = Router();

router.get('/user/:user_id', authenticateToken, getUserCart);
router.post('/items', authenticateToken, addToCart);
router.put('/items/:item_id', authenticateToken, updateCartItem);
router.delete('/items/:item_id', authenticateToken, removeFromCart);
router.delete('/user/:user_id/clear', authenticateToken, clearCart);

export default router;
