import { Router } from 'express';
import {
  getUserCart,
  addToCart,
  updateCartItem,
  removeFromCart,
  clearCart,
} from '../controllers/cart.controller';
import { optionalAuthenticateToken } from '../middlewares/auth.middleware';

const router = Router();

router.get('/user/:user_id', optionalAuthenticateToken, getUserCart);
router.post('/items', optionalAuthenticateToken, addToCart);
router.put('/items/:item_id', optionalAuthenticateToken, updateCartItem);
router.delete('/items/:item_id', optionalAuthenticateToken, removeFromCart);
router.delete('/user/:user_id/clear', optionalAuthenticateToken, clearCart);

export default router;
