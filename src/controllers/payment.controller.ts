import { Request, Response } from 'express';
import Stripe from 'stripe';
import { AppDataSource } from '../config/data-source';
import { Order } from '../entities/Order';
import { OrderItem } from '../entities/OrderItem';
import { ShoppingCart } from '../entities/ShoppingCart';
import { Payment } from '../entities/Payment';
import { Shipping } from '../entities/Shipping';

const orderRepo = AppDataSource.getRepository(Order);
const orderItemRepo = AppDataSource.getRepository(OrderItem);
const cartRepo = AppDataSource.getRepository(ShoppingCart);
const paymentRepo = AppDataSource.getRepository(Payment);
const shippingRepo = AppDataSource.getRepository(Shipping);

const getStripe = (): Stripe => {
  const secretKey = process.env.STRIPE_SECRET_KEY;
  if (!secretKey) {
    throw new Error('STRIPE_SECRET_KEY no está configurada en las variables de entorno.');
  }
  return new Stripe(secretKey);
};

/**
 * Función auxiliar para consolidar la orden y el pago una vez que Stripe confirma el cobro.
 * Es idempotente: si la orden ya existe para este paymentIntent, no la duplica.
 */
async function processOrderFromPaymentIntent(paymentIntent: Stripe.PaymentIntent) {
  // 1. Verificar idempotencia
  const existingPayment = await paymentRepo.findOne({
    where: { transaction_id: paymentIntent.id },
    relations: ['order', 'order.shipping'],
  });

  if (existingPayment && existingPayment.order) {
    return {
      orderId: existingPayment.order.order_id,
      totalAmount: existingPayment.amount,
      trackingNumber: existingPayment.order.shipping?.tracking_number || 'TRK-CONFIRMED',
      isNew: false,
    };
  }

  const userId = paymentIntent.metadata.userId ? parseInt(paymentIntent.metadata.userId, 10) : null;
  const cartId = paymentIntent.metadata.cartId ? parseInt(paymentIntent.metadata.cartId, 10) : null;
  const shippingMethod = paymentIntent.metadata.shippingMethod || 'Envío Estándar Disc Market';

  // 2. Buscar carrito activo
  let cart = null;
  if (cartId) {
    cart = await cartRepo.findOne({
      where: { cart_id: cartId },
      relations: ['cart_items'],
    });
  }
  if (!cart && userId) {
    cart = await cartRepo.findOne({
      where: { user_id: userId, status: 'active' },
      relations: ['cart_items'],
    });
  }

  const totalAmount = paymentIntent.amount / 100;

  // 3. Crear Orden
  const newOrder = orderRepo.create({
    user_id: userId || 1,
    total_amount: totalAmount,
    order_status: 'processing',
    payment_status: 'paid',
  });
  const savedOrder = await orderRepo.save(newOrder);

  // 4. Crear OrderItems a partir de CartItems
  if (cart && cart.cart_items && cart.cart_items.length > 0) {
    const orderItems = cart.cart_items.map((cartItem) =>
      orderItemRepo.create({
        order_id: savedOrder.order_id,
        product_id: cartItem.product_id,
        custom_product_id: cartItem.custom_product_id,
        quantity: cartItem.quantity,
        unit_price: cartItem.unit_price,
      })
    );
    await orderItemRepo.save(orderItems);

    // Convertir carrito para que quede cerrado
    cart.status = 'converted';
    await cartRepo.save(cart);
  }

  // 5. Crear Registro de Pago con transaction_id
  const payment = paymentRepo.create({
    order_id: savedOrder.order_id,
    payment_method: 'stripe',
    payment_status: 'completed',
    amount: totalAmount,
    transaction_id: paymentIntent.id,
    receipt_url: null,
  });
  await paymentRepo.save(payment);

  // 6. Crear Registro de Envío
  const trackingNumber = `TRK-${Date.now().toString().slice(-6)}-${Math.floor(1000 + Math.random() * 9000)}`;
  const shipping = shippingRepo.create({
    order_id: savedOrder.order_id,
    shipping_method: shippingMethod,
    tracking_number: trackingNumber,
    shipping_status: 'in_preparation',
  });
  await shippingRepo.save(shipping);

  return {
    orderId: savedOrder.order_id,
    totalAmount,
    trackingNumber,
    isNew: true,
  };
}

/**
 * POST /api/payments/create-intent
 * Crea una intención de pago en Stripe con el total calculado del carrito activo en BD.
 */
export const createPaymentIntent = async (req: Request, res: Response): Promise<void> => {
  try {
    const authReq = req as any;
    const userId = authReq.user?.user_id;

    if (!userId) {
      res.status(401).json({ message: 'Se requiere iniciar sesión para proceder al pago' });
      return;
    }

    const { shipping_method, shipping_address } = req.body;

    // Buscar el carrito activo para calcular el monto seguro desde el backend
    const cart = await cartRepo.findOne({
      where: { user_id: userId, status: 'active' },
      relations: ['cart_items'],
    });

    if (!cart || !cart.cart_items || cart.cart_items.length === 0) {
      res.status(400).json({ message: 'El carrito está vacío o no existe' });
      return;
    }

    const totalAmount = cart.cart_items.reduce(
      (sum, item) => sum + Number(item.unit_price) * item.quantity,
      0
    );

    if (totalAmount <= 0) {
      res.status(400).json({ message: 'El monto del carrito debe ser mayor a 0' });
      return;
    }

    const stripe = getStripe();

    // Crear el PaymentIntent en Stripe (en centavos USD)
    const paymentIntent = await stripe.paymentIntents.create({
      amount: Math.round(totalAmount * 100),
      currency: 'usd',
      metadata: {
        userId: String(userId),
        cartId: String(cart.cart_id),
        shippingMethod: shipping_method || 'Envío Estándar Disc Market',
        shippingAddress: shipping_address || '',
      },
      automatic_payment_methods: {
        enabled: true,
      },
    });

    res.status(200).json({
      clientSecret: paymentIntent.client_secret,
      paymentIntentId: paymentIntent.id,
      amount: totalAmount,
      currency: 'usd',
    });
  } catch (error: any) {
    console.error('Error al crear PaymentIntent:', error);
    res.status(500).json({
      message: 'Error al iniciar la sesión de pago con Stripe',
      error: error.message,
    });
  }
};

/**
 * POST /api/payments/confirm
 * Permite confirmar la orden de inmediato tras la validación en el cliente con Stripe Elements.
 */
export const confirmPayment = async (req: Request, res: Response): Promise<void> => {
  try {
    const { paymentIntentId } = req.body;

    if (!paymentIntentId) {
      res.status(400).json({ message: 'Se requiere paymentIntentId' });
      return;
    }

    const stripe = getStripe();
    const paymentIntent = await stripe.paymentIntents.retrieve(paymentIntentId);

    if (paymentIntent.metadata.userId !== String((req as any).user?.user_id)) {
      res.status(403).json({ message: 'No tienes acceso a este pago' });
      return;
    }

    if (paymentIntent.status !== 'succeeded') {
      res.status(400).json({
        message: `El pago aún no se ha completado. Estado actual: ${paymentIntent.status}`,
      });
      return;
    }

    const result = await processOrderFromPaymentIntent(paymentIntent);

    res.status(200).json({
      message: '¡Pago y pedido confirmados exitosamente!',
      order_id: result.orderId,
      total_amount: result.totalAmount,
      tracking_number: result.trackingNumber,
    });
  } catch (error: any) {
    console.error('Error al confirmar pago:', error);
    res.status(500).json({
      message: 'Error al confirmar la transacción',
      error: error.message,
    });
  }
};

/**
 * POST /api/payments/webhook
 * Recibe eventos de servidor a servidor enviados por Stripe (ej. payment_intent.succeeded).
 */
export const handleWebhook = async (req: Request, res: Response): Promise<void> => {
  const sig = req.headers['stripe-signature'];
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

  let event: Stripe.Event;

  if (!webhookSecret || typeof sig !== 'string') {
    res.status(400).json({ message: 'Webhook signature required' });
    return;
  }

  try {
    const stripe = getStripe();
    const rawBody = (req as any).rawBody || req.body;

    event = stripe.webhooks.constructEvent(rawBody, sig, webhookSecret);
  } catch (err: any) {
    console.error(`❌ Error en webhook de Stripe: ${err.message}`);
    res.status(400).send(`Webhook Error: ${err.message}`);
    return;
  }

  // Manejar el evento payment_intent.succeeded
  if (event.type === 'payment_intent.succeeded') {
    const paymentIntent = event.data.object as Stripe.PaymentIntent;
    console.log(`✅ Pago exitoso recibido de Stripe: ${paymentIntent.id}`);
    try {
      await processOrderFromPaymentIntent(paymentIntent);
    } catch (orderError: any) {
      console.error('Error procesando orden desde webhook:', orderError);
      res.status(500).json({ message: 'Payment processing failed; retry required' });
      return;
    }
  } else if (event.type === 'payment_intent.payment_failed') {
    const paymentIntent = event.data.object as Stripe.PaymentIntent;
    console.warn(`❌ Pago fallido en Stripe: ${paymentIntent.id}`);
  }

  res.status(200).json({ received: true });
};
