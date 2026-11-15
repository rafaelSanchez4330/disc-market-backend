import { Request, Response } from 'express';
import { AppDataSource } from '../config/data-source';
import { ShoppingCart } from '../entities/ShoppingCart';
import { CartItem } from '../entities/CartItem';
import { CheckoutReservation } from '../entities/CheckoutReservation';
import { AuthenticatedRequest } from '../middlewares/auth.middleware';
import { activeCart, assertEditable, changeCartItem, positiveId, quantityValue, StockError } from '../services/stock.service';

function handler(action: (req: Request, res: Response, userId: number) => Promise<void>) {
  return async (req: Request, res: Response): Promise<void> => {
    try {
      const userId = (req as AuthenticatedRequest).user?.user_id;
      if (!userId) throw new StockError('Se requiere iniciar sesión.', 401);
      if (req.params.user_id && positiveId(req.params.user_id) !== userId) throw new StockError('No tienes acceso a este carrito.', 403);
      await action(req, res, userId);
    } catch (error) {
      // Registrar errores inesperados (p. ej. esquema de BD desactualizado) para poder diagnosticarlos.
      if (!(error instanceof StockError)) console.error('[cart] Error inesperado:', error);
      res.status(error instanceof StockError ? error.status : 500).json({ message: error instanceof StockError ? error.message : 'No se pudo actualizar el carrito.' });
    }
  };
}

export const getUserCart = handler(async (_req, res, userId) => {
  const cart = await AppDataSource.transaction(manager => activeCart(manager, userId));
  const loaded = await AppDataSource.getRepository(ShoppingCart).findOneOrFail({
    where: { cart_id: cart.cart_id }, relations: ['cart_items', 'cart_items.product', 'cart_items.product.inventory', 'cart_items.custom_product', 'cart_items.custom_product.custom_tracks'],
  });
  const pending = await AppDataSource.getRepository(CheckoutReservation).findOneBy({ cart_id: cart.cart_id, status: 'reserved' });
  res.json({ ...loaded, checkout_pending: Boolean(pending), reservation_expires_at: pending?.expires_at ?? null,
    cart_items: loaded.cart_items.map(item => ({ ...item, unit_price: Number(item.unit_price),
      product: item.product ? { ...item.product, price: Number(item.product.price) } : null,
      custom_product: item.custom_product ? { ...item.custom_product, price: Number(item.custom_product.price) } : null })) });
});

export const addToCart = handler(async (req, res, userId) => {
  const { product_id, custom_product_id } = req.body;
  const productId = product_id == null ? undefined : positiveId(product_id);
  const customId = custom_product_id == null ? undefined : positiveId(custom_product_id);
  if (Boolean(productId) === Boolean(customId)) throw new StockError('Selecciona un producto regular o personalizado.', 400);
  const quantity = quantityValue(req.body.quantity === undefined ? 1 : req.body.quantity);
  res.status(201).json(await changeCartItem(userId, { productId, customId, quantity, add: true }));
});

export const updateCartItem = handler(async (req, res, userId) => {
  const quantity = quantityValue(req.body.quantity, true);
  const result = await changeCartItem(userId, { itemId: positiveId(req.params.item_id), quantity });
  res.json(result ?? { message: 'Ítem eliminado.' });
});

export const removeFromCart = handler(async (req, res, userId) => {
  await changeCartItem(userId, { itemId: positiveId(req.params.item_id), quantity: 0 });
  res.json({ message: 'Ítem eliminado.' });
});

export const clearCart = handler(async (_req, res, userId) => {
  await AppDataSource.transaction(async manager => {
    const cart = await activeCart(manager, userId);
    await assertEditable(manager, cart);
    await manager.getRepository(CartItem).delete({ cart_id: cart.cart_id });
  });
  res.json({ message: 'Carrito vaciado.' });
});
