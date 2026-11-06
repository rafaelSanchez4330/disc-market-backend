import { Request, Response } from 'express';
import { AppDataSource } from '../config/data-source';
import { Order } from '../entities/Order';
const orderRepo = AppDataSource.getRepository(Order);

export const getOrderById = async (req: Request, res: Response): Promise<void> => {
  try {
    const authReq = req as any;
    const userId = authReq.user?.user_id;
    const userRole = authReq.user?.role;

    if (!userId) {
      res.status(401).json({ message: 'Se requiere iniciar sesión para consultar la orden' });
      return;
    }

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

    // El usuario solo puede consultar sus propias órdenes a menos que sea administrador
    if (order.user_id !== userId && userRole !== 'admin') {
      res.status(403).json({ message: 'No tienes autorización para consultar esta orden' });
      return;
    }

    res.json({
      ...order,
      total_amount: Number(order.total_amount),
    });
  } catch (error: any) {
    res.status(500).json({ message: 'Error al consultar la orden', error: error.message });
  }
};
