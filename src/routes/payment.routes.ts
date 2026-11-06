import { Router } from 'express';
import {
  createPaymentIntent,
  confirmPayment,
  handleWebhook,
} from '../controllers/payment.controller';
import { authenticateToken } from '../middlewares/auth.middleware';

const router = Router();

router.post('/create-intent', authenticateToken, createPaymentIntent);
router.post('/confirm', authenticateToken, confirmPayment);
router.post('/webhook', handleWebhook);

export default router;
