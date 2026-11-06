import { Router } from 'express';
import { authenticateToken } from '../middlewares/auth.middleware';
import {
  createPaymentIntent,
  confirmPayment,
  handleWebhook,
  cancelPayment,
} from '../controllers/payment.controller';


const router = Router();

router.post('/create-intent', authenticateToken, createPaymentIntent);
router.post('/confirm', authenticateToken, confirmPayment);
router.post('/cancel', authenticateToken, cancelPayment);
router.post('/webhook', handleWebhook);

export default router;
