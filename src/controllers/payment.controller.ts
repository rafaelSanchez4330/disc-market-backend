import { Request, Response } from 'express';
import Stripe from 'stripe';
import { LessThan } from 'typeorm';
import { AppDataSource } from '../config/data-source';
import { CheckoutReservation } from '../entities/CheckoutReservation';
import { AuthenticatedRequest } from '../middlewares/auth.middleware';
import { reserveCheckout, ensurePaymentIntent, completeCheckout, cancelCheckout, releaseCancelledCheckout } from '../services/checkout.service';
import { StockError } from '../services/stock.service';
import { getStripe } from '../services/stripeClient';

function handler(action: (req: Request, res: Response, userId: number) => Promise<void>) {
  return async (req: Request, res: Response): Promise<void> => {
    try {
      const userId = (req as AuthenticatedRequest).user?.user_id;
      if (!userId) throw new StockError('Se requiere iniciar sesión.', 401);
      await action(req, res, userId);
    } catch (error) {
      console.error('Error de checkout:', (error as Error).message);
      res.status(error instanceof StockError ? error.status : 502).json({ message: error instanceof StockError ? error.message : 'No se pudo verificar el pago. Intenta nuevamente; no se liberará stock sin confirmar su estado.' });
    }
  };
}

export const createPaymentIntent = handler(async (req, res, userId) => {
  getStripe();
  const { shipping_method = 'Envío Estándar Disc Market', shipping_address = '' } = req.body;
  if (typeof shipping_method !== 'string' || !shipping_method.trim() || shipping_method.length > 100
    || typeof shipping_address !== 'string' || shipping_address.length > 500) throw new StockError('Datos de envío inválidos.', 400);
  const expired = await AppDataSource.getRepository(CheckoutReservation).findBy({ user_id: userId, status: 'reserved', expires_at: LessThan(new Date()) });
  for (const reservation of expired) await cancelCheckout(reservation.reservation_id);
  const reservation = await reserveCheckout(userId, shipping_method, shipping_address);
  const intent = await ensurePaymentIntent(reservation.reservation_id);
  if (intent.status === 'succeeded') { await completeCheckout(intent); throw new StockError('Este pago ya se completó. Consulta tus pedidos.'); }
  if (intent.status === 'canceled') { await releaseCancelledCheckout(intent); throw new StockError('El pago fue cancelado. Inicia el pago nuevamente.'); }
  res.json({ clientSecret: intent.client_secret, paymentIntentId: intent.id, amount: reservation.amount_cents / 100,
    currency: 'usd', expiresAt: reservation.expires_at });
});

export const confirmPayment = handler(async (req, res, userId) => {
  if (typeof req.body.paymentIntentId !== 'string' || !req.body.paymentIntentId.startsWith('pi_')) throw new StockError('Identificador de pago inválido.', 400);
  const intent = await getStripe().paymentIntents.retrieve(req.body.paymentIntentId);
  if (intent.metadata.userId !== String(userId)) throw new StockError('No tienes acceso a este pago.', 403);
  const result = await completeCheckout(intent);
  res.json({ message: 'Pago y pedido confirmados.', order_id: result.orderId, total_amount: result.totalAmount, tracking_number: result.trackingNumber });
});

export const cancelPayment = handler(async (req, res, userId) => {
  const intentId = req.body.paymentIntentId;
  if (intentId !== undefined && (typeof intentId !== 'string' || !intentId.startsWith('pi_'))) throw new StockError('Identificador de pago inválido.', 400);
  const reservation = await AppDataSource.getRepository(CheckoutReservation).findOne({ where: intentId
    ? { user_id: userId, stripe_intent_id: intentId }
    : { user_id: userId, status: 'reserved' }, order: { created_at: 'DESC' } });
  if (!reservation) { res.json({ status: 'canceled' }); return; }
  const result = await cancelCheckout(reservation.reservation_id);
  res.json(result.order ? { status: 'completed', order_id: result.order.orderId, total_amount: result.order.totalAmount,
    tracking_number: result.order.trackingNumber } : { status: 'canceled' });
});

export const handleWebhook = async (req: Request, res: Response): Promise<void> => {
  let event: Stripe.Event;
  try {
    const signature = req.headers['stripe-signature'];
    if (!process.env.STRIPE_WEBHOOK_SECRET || typeof signature !== 'string') throw new Error('Firma requerida');
    event = getStripe().webhooks.constructEvent((req as any).rawBody, signature, process.env.STRIPE_WEBHOOK_SECRET);
  } catch { res.status(400).json({ message: 'Firma de webhook inválida.' }); return; }
  try {
    const intent = event.data.object as Stripe.PaymentIntent;
    if (event.type === 'payment_intent.succeeded') await completeCheckout(intent);
    if (event.type === 'payment_intent.canceled') await releaseCancelledCheckout(intent);
    if (event.type === 'payment_intent.payment_failed') {
      const reservation = await AppDataSource.getRepository(CheckoutReservation).findOneBy({ stripe_intent_id: intent.id });
      if (reservation?.status === 'reserved') await cancelCheckout(reservation.reservation_id);
    }
    res.json({ received: true });
  } catch (error) {
    console.error('No se pudo consolidar el webhook:', (error as Error).message);
    res.status(500).json({ message: 'No se pudo consolidar el pago; se requiere reintento.' });
  }
};
