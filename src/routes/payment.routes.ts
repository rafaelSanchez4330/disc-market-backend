import { Router } from 'express';
import {
  createPaymentIntent,
  confirmPayment,
  handleWebhook,
} from '../controllers/payment.controller';

const router = Router();

router.post('/create-intent', createPaymentIntent);
router.post('/confirm', confirmPayment);
router.post('/webhook', handleWebhook);

export default router;
