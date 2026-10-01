import { Request, Response } from 'express';
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

export const checkout = async (req: Request, res: Response): Promise<void> => {
  try {
    const { user_id, payment_method, shipping_method, shipping_address } = req.body;

    const cart = await cartRepo.findOne({
      where: { user_id: parseInt(user_id, 10), status: 'active' },
      relations: ['cart_items'],
    });

    if (!cart || cart.cart_items.length === 0) {
      res.status(400).json({ message: 'El carrito está vacío o no existe' });
      return;
    }

    const total_amount = cart.cart_items.reduce(
      (sum, item) => sum + Number(item.unit_price) * item.quantity,
      0
    );

    // 1. Crear Orden
    const newOrder = orderRepo.create({
      user_id: parseInt(user_id, 10),
      total_amount,
      order_status: 'processing',
      payment_status: 'paid',
    });
    const savedOrder = await orderRepo.save(newOrder);

    // 2. Crear OrderItems a partir de CartItems
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

    // 3. Crear Registro de Pago
    const payment = paymentRepo.create({
      order_id: savedOrder.order_id,
      payment_method: payment_method || 'credit_card',
      payment_status: 'completed',
      amount: total_amount,
    });
    await paymentRepo.save(payment);

    // 4. Crear Registro de Envío
    const tracking_number = `TRK-${Date.now().toString().slice(-6)}-${Math.floor(1000 + Math.random() * 9000)}`;
    const shipping = shippingRepo.create({
      order_id: savedOrder.order_id,
      shipping_method: shipping_method || 'Standard Delivery',
      tracking_number,
      shipping_status: 'in_preparation',
    });
    await shippingRepo.save(shipping);

    // 5. Marcar carrito como convertido
    cart.status = 'converted';
    await cartRepo.save(cart);

    res.status(201).json({
      message: 'Orden creada exitosamente',
      order_id: savedOrder.order_id,
      total_amount,
      tracking_number,
    });
  } catch (error: any) {
    res.status(500).json({ message: 'Error durante el proceso de compra', error: error.message });
  }
};

export const getOrderById = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const order = await orderRepo.findOne({
      where: { order_id: parseInt(id, 10) },
      relations: [
        'order_items',
        'order_items.product',
        'order_items.custom_product',
        'payment',
        'shipping',
      ],
    });

    if (!order) {
      res.status(404).json({ message: 'Orden no encontrada' });
      return;
    }

    res.json(order);
  } catch (error: any) {
    res.status(500).json({ message: 'Error al consultar la orden', error: error.message });
  }
};
