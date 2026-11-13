import { LessThan } from 'typeorm';
import Stripe from 'stripe';
import { AppDataSource } from '../config/data-source';
import { CheckoutReservation } from '../entities/CheckoutReservation';
import { CartItem } from '../entities/CartItem';
import { ShoppingCart } from '../entities/ShoppingCart';
import { Inventory } from '../entities/Inventory';
import { Order } from '../entities/Order';
import { OrderItem } from '../entities/OrderItem';
import { Payment } from '../entities/Payment';
import { Shipping } from '../entities/Shipping';
import { activeCart, checkoutLines, StockError, stockTotals, validateStock } from './stock.service';
import { getStripe } from './stripeClient';

// Todos los cobros se realizan en pesos mexicanos (código ISO 4217 en minúsculas, como lo espera Stripe).
export const CHECKOUT_CURRENCY = 'mxn';
// Monto mínimo exigido por Stripe para cobros en MXN ($10.00 MXN = 1000 centavos).
export const MIN_CHECKOUT_CENTS = 1000;

const RESERVATION_MS = 15 * 60 * 1000;

export async function reserveCheckout(userId: number, shippingMethod: string, shippingAddress: string) {
  return AppDataSource.transaction(async manager => {
    const cart = await activeCart(manager, userId);
    const repo = manager.getRepository(CheckoutReservation);
    const existing = await repo.findOneBy({ cart_id: cart.cart_id, status: 'reserved' });
    if (existing) return existing;
    const items = await manager.getRepository(CartItem).findBy({ cart_id: cart.cart_id });
    if (!items.length) throw new StockError('El carrito está vacío.', 400);
    const lines = await checkoutLines(manager, items, userId);
    const amount = lines.reduce((sum, line) => sum + Math.round(line.unit_price * 100) * line.quantity, 0);
    if (!Number.isSafeInteger(amount) || amount < MIN_CHECKOUT_CENTS || amount > 2147483647) {
      throw new StockError('El monto mínimo para procesar pagos con tarjeta en Stripe es de $10.00 MXN.', 400);
    }
    await validateStock(manager, lines, true);
    return repo.save(repo.create({ user_id: userId, cart_id: cart.cart_id, status: 'reserved', lines,
      amount_cents: amount, shipping_method: shippingMethod, shipping_address: shippingAddress,
      expires_at: new Date(Date.now() + RESERVATION_MS) }));
  });
}

export async function ensurePaymentIntent(reservationId: string): Promise<Stripe.PaymentIntent> {
  return AppDataSource.transaction(async manager => {
    const repo = manager.getRepository(CheckoutReservation);
    const reservation = await repo.findOneOrFail({ where: { reservation_id: reservationId }, lock: { mode: 'pessimistic_write' } });
    const stripe = getStripe();
    if (reservation.stripe_intent_id) return stripe.paymentIntents.retrieve(reservation.stripe_intent_id);
    if (reservation.status !== 'reserved') throw new StockError('La reserva ya no está activa.');
    // An ambiguous create can be recovered using the same key. After Stripe's minimum
    // retention period, keep the stock held for manual reconciliation instead of risking a second intent.
    if (Date.now() - reservation.created_at.getTime() > 23 * 60 * 60 * 1000) {
      throw new StockError('La reserva requiere revisión del administrador antes de liberar existencias.');
    }
    const intent = await stripe.paymentIntents.create({
      amount: reservation.amount_cents, currency: CHECKOUT_CURRENCY,
      metadata: { reservationId, userId: String(reservation.user_id), cartId: String(reservation.cart_id) },
      automatic_payment_methods: { enabled: true, allow_redirects: 'never' },
    }, { idempotencyKey: `checkout-${reservationId}` });
    reservation.stripe_intent_id = intent.id;
    await repo.save(reservation);
    return intent;
  });
}

function verifyIntent(reservation: CheckoutReservation, intent: Stripe.PaymentIntent) {
  if (reservation.stripe_intent_id !== intent.id || intent.metadata.reservationId !== reservation.reservation_id
    || intent.metadata.userId !== String(reservation.user_id) || intent.metadata.cartId !== String(reservation.cart_id)
    || intent.amount !== reservation.amount_cents || intent.currency !== CHECKOUT_CURRENCY) {
    throw new StockError('El pago no coincide con la reserva.');
  }
}

export async function completeCheckout(intent: Stripe.PaymentIntent) {
  if (intent.status !== 'succeeded') throw new StockError('El pago todavía no está confirmado.');
  return AppDataSource.transaction(async manager => {
    const repo = manager.getRepository(CheckoutReservation);
    const reservation = await repo.findOne({ where: { stripe_intent_id: intent.id }, lock: { mode: 'pessimistic_write' } });
    if (!reservation) {
      // Historical payments are acknowledged without retroactively deducting inventory.
      const historical = await manager.getRepository(Payment).findOne({ where: { transaction_id: intent.id }, relations: ['order', 'order.shipping'] });
      if (historical) return { orderId: historical.order_id, totalAmount: Number(historical.amount),
        trackingNumber: historical.order.shipping?.tracking_number ?? '', isNew: false };
      throw new StockError('No existe una reserva para este pago.');
    }
    verifyIntent(reservation, intent);
    if (reservation.status === 'completed') {
      const shipping = await manager.getRepository(Shipping).findOneByOrFail({ order_id: reservation.order_id! });
      return { orderId: reservation.order_id!, totalAmount: reservation.amount_cents / 100, trackingNumber: shipping.tracking_number, isNew: false };
    }
    if (reservation.status !== 'reserved') throw new StockError('La reserva ya fue liberada; revisa el pago.');
    const cart = await manager.getRepository(ShoppingCart).findOneOrFail({ where: { cart_id: reservation.cart_id }, lock: { mode: 'pessimistic_write' } });
    if (cart.status !== 'active') throw new StockError('El carrito ya está cerrado.');
    for (const [productId, quantity] of stockTotals(reservation.lines)) {
      const inventory = await manager.getRepository(Inventory).findOne({ where: { product_id: productId }, lock: { mode: 'pessimistic_write' } });
      if (!inventory || inventory.quantity_reserved < quantity) throw new StockError('La reserva de inventario requiere revisión.');
      inventory.quantity_reserved -= quantity; // available was already reduced when reserving
      await manager.save(inventory);
    }
    const total = reservation.amount_cents / 100;
    const order = await manager.getRepository(Order).save({ user_id: reservation.user_id, total_amount: total, order_status: 'processing', payment_status: 'paid' });
    await manager.getRepository(OrderItem).save(reservation.lines.map(line => ({ order_id: order.order_id,
      product_id: line.product_id, custom_product_id: line.custom_product_id, quantity: line.quantity, unit_price: line.unit_price })));
    await manager.getRepository(Payment).save({ order_id: order.order_id, payment_method: 'stripe', payment_status: 'completed',
      amount: total, transaction_id: intent.id, receipt_url: null });
    const trackingNumber = `TRK-${order.order_id}-${Date.now().toString().slice(-6)}`;
    await manager.getRepository(Shipping).save({ order_id: order.order_id, shipping_method: reservation.shipping_method,
      tracking_number: trackingNumber, shipping_status: 'in_preparation' });
    cart.status = 'converted'; await manager.save(cart);
    reservation.status = 'completed'; reservation.order_id = order.order_id; await repo.save(reservation);
    return { orderId: order.order_id, totalAmount: total, trackingNumber, isNew: true };
  });
}

export async function releaseCancelledCheckout(intent: Stripe.PaymentIntent) {
  // A timeout or failed attempt is NOT proof that an intent can no longer charge.
  if (intent.status !== 'canceled') throw new StockError('El pago debe cancelarse antes de liberar el inventario.');
  await AppDataSource.transaction(async manager => {
    const repo = manager.getRepository(CheckoutReservation);
    const reservation = await repo.findOne({ where: { stripe_intent_id: intent.id }, lock: { mode: 'pessimistic_write' } });
    if (!reservation) return;
    verifyIntent(reservation, intent);
    if (reservation.status !== 'reserved') return;
    for (const [productId, quantity] of stockTotals(reservation.lines)) {
      const inventory = await manager.getRepository(Inventory).findOne({ where: { product_id: productId }, lock: { mode: 'pessimistic_write' } });
      if (!inventory || inventory.quantity_reserved < quantity) throw new StockError('La reserva de inventario requiere revisión.');
      inventory.quantity_available += quantity; inventory.quantity_reserved -= quantity;
      await manager.save(inventory);
    }
    reservation.status = 'released'; await repo.save(reservation);
  });
}

export async function cancelCheckout(reservationId: string) {
  let intent = await ensurePaymentIntent(reservationId);
  if (intent.status !== 'succeeded' && intent.status !== 'canceled') {
    try { intent = await getStripe().paymentIntents.cancel(intent.id); }
    catch { intent = await getStripe().paymentIntents.retrieve(intent.id); }
  }
  if (intent.status === 'succeeded') return { cancelled: false, order: await completeCheckout(intent) };
  if (intent.status !== 'canceled') throw new StockError('El pago sigue en proceso. Conservamos la reserva hasta confirmar su resultado.');
  await releaseCancelledCheckout(intent);
  return { cancelled: true, order: null };
}

export async function reconcileExpiredCheckouts() {
  const reservations = await AppDataSource.getRepository(CheckoutReservation).find({
    where: { status: 'reserved', expires_at: LessThan(new Date()) }, order: { expires_at: 'ASC' },
  });
  for (const reservation of reservations) {
    try { await cancelCheckout(reservation.reservation_id); }
    catch (error) { console.error(`No se pudo reconciliar la reserva ${reservation.reservation_id}:`, (error as Error).message); }
  }
}
