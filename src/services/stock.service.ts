import { EntityManager } from 'typeorm';
import { AppDataSource } from '../config/data-source';
import { CartItem } from '../entities/CartItem';
import { Product } from '../entities/Product';
import { Inventory } from '../entities/Inventory';
import { CustomProduct } from '../entities/CustomProduct';
import { User } from '../entities/User';
import { ShoppingCart } from '../entities/ShoppingCart';
import { CheckoutLine, CheckoutReservation } from '../entities/CheckoutReservation';

export class StockError extends Error {
  constructor(message: string, public status = 409) { super(message); }
}
export function positiveId(value: unknown): number {
  const id = typeof value === 'string' && /^\d+$/.test(value) ? Number(value) : value;
  if (typeof id !== 'number' || !Number.isSafeInteger(id) || id < 1 || id > 2147483647) throw new StockError('Identificador inválido.', 400);
  return id;
}
export function quantityValue(value: unknown, allowZero = false): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < (allowZero ? 0 : 1) || value > 1000000) {
    throw new StockError('La cantidad debe ser un número entero válido.', 400);
  }
  return value;
}

export async function activeCart(manager: EntityManager, userId: number) {
  // Serializes creation/mutation of the active cart, including concurrent first requests.
  const user = await manager.getRepository(User).findOne({ where: { user_id: userId }, lock: { mode: 'pessimistic_write' } });
  if (!user) throw new StockError('Usuario no encontrado.', 404);
  const repo = manager.getRepository(ShoppingCart);
  return await repo.findOne({ where: { user_id: userId, status: 'active' }, order: { cart_id: 'ASC' }, lock: { mode: 'pessimistic_write' } })
    ?? await repo.save(repo.create({ user_id: userId, status: 'active' }));
}
export async function assertEditable(manager: EntityManager, cart: ShoppingCart) {
  if (cart.status !== 'active') throw new StockError('Este carrito ya fue cerrado.');
  if (await manager.getRepository(CheckoutReservation).existsBy({ cart_id: cart.cart_id, status: 'reserved' })) {
    throw new StockError('Hay un pago abierto. Cancélalo desde el carrito antes de modificar sus productos.');
  }
}

// Resolve prices and physical inventory on the server, including custom disc templates.
export async function checkoutLines(manager: EntityManager, items: CartItem[], userId: number): Promise<CheckoutLine[]> {
  const lines: CheckoutLine[] = [];
  for (const item of items) {
    quantityValue(item.quantity);
    if (Boolean(item.product_id) === Boolean(item.custom_product_id)) throw new StockError('El carrito contiene un producto inválido.');
    let product: Product | null;
    let price: number;
    if (item.custom_product_id) {
      const custom = await manager.getRepository(CustomProduct).findOneBy({ custom_product_id: item.custom_product_id, user_id: userId });
      if (!custom) throw new StockError('Producto personalizado no disponible para esta cuenta.', 404);
      const names = custom.format.toUpperCase() === 'VINYL' ? ['Custom Vinyl', 'Vinilo Personalizado'] : ['Custom CD', 'CD Personalizado'];
      product = await manager.getRepository(Product).findOne({ where: names.map(name => ({ name })), order: { product_id: 'ASC' } });
      if (!product) throw new StockError('No hay inventario configurado para este formato personalizado.');
      price = Number(product.price);
    } else {
      product = await manager.getRepository(Product).findOneBy({ product_id: item.product_id! });
      if (!product) throw new StockError('Un producto del carrito ya no existe.', 404);
      price = Number(product.price);
    }
    if (!Number.isFinite(price) || price <= 0) throw new StockError('El precio del producto no es válido.');
    lines.push({ product_id: item.product_id, custom_product_id: item.custom_product_id,
      stock_product_id: product.product_id, quantity: item.quantity, unit_price: price });
  }
  return lines;
}

export function stockTotals(lines: CheckoutLine[]) {
  const totals = new Map<number, number>();
  for (const line of lines) totals.set(line.stock_product_id, (totals.get(line.stock_product_id) ?? 0) + line.quantity);
  return [...totals.entries()].sort(([a], [b]) => a - b);
}

export async function validateStock(manager: EntityManager, lines: CheckoutLine[], reserve = false) {
  // Deterministic lock order avoids deadlocks between carts with several products.
  for (const [productId, quantity] of stockTotals(lines)) {
    const repo = manager.getRepository(Inventory);
    const inventory = await repo.findOne({ where: { product_id: productId }, lock: { mode: 'pessimistic_write' } });
    if (!inventory || inventory.quantity_available < quantity) {
      throw new StockError(`Stock insuficiente para el producto #${productId}. Disponible: ${inventory?.quantity_available ?? 0}.`);
    }
    if (reserve) {
      inventory.quantity_available -= quantity;
      inventory.quantity_reserved += quantity;
      await repo.save(inventory);
    }
  }
}

export async function changeCartItem(userId: number, input: { productId?: number; customId?: number; itemId?: number; quantity: number; add?: boolean }) {
  return AppDataSource.transaction(async manager => {
    const cart = await activeCart(manager, userId);
    await assertEditable(manager, cart);
    const repo = manager.getRepository(CartItem);
    let items = await repo.find({ where: { cart_id: cart.cart_id }, order: { cart_item_id: 'ASC' } });
    let item = input.itemId ? items.find(i => i.cart_item_id === input.itemId)
      : items.find(i => input.customId ? i.custom_product_id === input.customId : i.product_id === input.productId);
    if (input.itemId && !item) throw new StockError('Ítem no encontrado en tu carrito activo.', 404);
    if (input.quantity === 0 && item) { await repo.delete(item.cart_item_id); return null; }
    if (!item) {
      item = repo.create({ cart_id: cart.cart_id, product_id: input.productId ?? null,
        custom_product_id: input.customId ?? null, quantity: 0 });
      items.push(item);
    }
    item.quantity = input.add ? item.quantity + input.quantity : input.quantity;
    const lines = await checkoutLines(manager, items, userId);
    await validateStock(manager, lines);
    // Price comes from the catalog, never the request or an outdated cart price.
    item.unit_price = lines[items.indexOf(item)].unit_price;
    const saved = await repo.save(item);
    const loaded = await repo.findOneOrFail({ where: { cart_item_id: saved.cart_item_id }, relations: ['product', 'custom_product'] });
    return { ...loaded, unit_price: Number(loaded.unit_price) };
  });
}
