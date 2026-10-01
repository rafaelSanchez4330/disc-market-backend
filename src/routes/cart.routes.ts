import { Router } from 'express';
import {
  getUserCart,
  addToCart,
  removeFromCart,
} from '../controllers/cart.controller';

const router = Router();

router.get('/user/:user_id', getUserCart);
router.post('/items', addToCart);
router.delete('/items/:item_id', removeFromCart);

export default router;
