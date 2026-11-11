import { NextFunction, Request, Response } from 'express';
import { AppDataSource } from '../config/data-source';
import { User } from '../entities/User';
import { Product } from '../entities/Product';
import { Inventory } from '../entities/Inventory';
import { Order } from '../entities/Order';
import { AuthenticatedRequest } from '../middlewares/auth.middleware';

// Check the current database role, not a possibly stale role inside a JWT.
export const requireAdmin = async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
  try {
    const user = req.user && await AppDataSource.getRepository(User).findOne({
      where: { user_id: req.user.user_id }, select: { user_id: true, role: true },
    });
    if (!user || user.role !== 'admin') {
      res.status(403).json({ message: 'Esta sección requiere una cuenta administradora.' });
      return;
    }
    next();
  } catch (error) { next(error); }
};

function pagination(req: Request) {
  const page = Number(req.query.page ?? 1);
  if (!Number.isSafeInteger(page) || page < 1 || page > 100000) throw new Error('Página inválida.');
  return { page, limit: 20, offset: (page - 1) * 20 };
}

function search(req: Request) {
  if (req.query.search !== undefined && typeof req.query.search !== 'string') throw new Error('Búsqueda inválida.');
  return String(req.query.search ?? '').trim().slice(0, 150);
}

function dateRange(req: Request) {
  const parse = (value: unknown) => {
    if (value === undefined || value === '') return undefined;
    if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new Error('Fecha inválida.');
    const date = new Date(`${value}T00:00:00.000Z`);
    if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== value) throw new Error('Fecha inválida.');
    return date;
  };
  const from = parse(req.query.from);
  const to = parse(req.query.to);
  if (from && to && from > to) throw new Error('El inicio debe ser anterior al fin.');
  if (to) to.setUTCDate(to.getUTCDate() + 1);
  return { from, to };
}

function filteredOrders(req: Request) {
  const { from, to } = dateRange(req);
  const query = AppDataSource.getRepository(Order).createQueryBuilder('o');
  if (from) query.andWhere('o.created_at >= :from', { from });
  if (to) query.andWhere('o.created_at < :to', { to });
  return query;
}

// Only expected validation errors become 400; database failures use the global handler.
function handler(action: (req: Request, res: Response) => Promise<void>) {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try { pagination(req); search(req); dateRange(req); }
    catch (error) { res.status(400).json({ message: (error as Error).message }); return; }
    try { await action(req, res); } catch (error) { next(error); }
  };
}

export const getAdminSummary = handler(async (req, res) => {
  const [sales, totalOrders, users, products, lowStock] = await Promise.all([
    filteredOrders(req).select('COALESCE(SUM(o.total_amount), 0)', 'revenue')
      .addSelect('COUNT(*)', 'paid_orders')
      .andWhere('o.payment_status = :paid', { paid: 'paid' })
      .andWhere('o.order_status != :cancelled', { cancelled: 'cancelled' }).getRawOne(),
    filteredOrders(req).getCount(),
    AppDataSource.getRepository(User).count(),
    AppDataSource.getRepository(Product).count(),
    AppDataSource.getRepository(Product).createQueryBuilder('p').leftJoin('p.inventory', 'i')
      .where('COALESCE(i.quantity_available, 0) <= 5').getCount(),
  ]);
  const paidOrders = Number(sales.paid_orders);
  const revenue = Number(sales.revenue);
  res.json({ revenue, paid_orders: paidOrders, total_orders: totalOrders,
    average_order: paidOrders ? revenue / paidOrders : 0, users, products, low_stock: lowStock, currency: 'MXN' });
});

export const getAdminProducts = handler(async (req, res) => {
  const { page, limit, offset } = pagination(req);
  const term = search(req);
  const query = AppDataSource.getRepository(Product).createQueryBuilder('p').leftJoinAndSelect('p.inventory', 'i');
  if (term) query.where('(p.name ILIKE :term OR p.artist ILIKE :term)', { term: `%${term}%` });
  const [items, total] = await query.orderBy('p.product_id', 'ASC').skip(offset).take(limit).getManyAndCount();
  res.json({ items: items.map(p => ({ ...p, price: Number(p.price) })), total, page, limit });
});

export const addAdminStock = handler(async (req, res) => {
  const productId = Number(req.params.id);
  const quantity = req.body.quantity;
  if (!Number.isSafeInteger(productId) || productId < 1 || !Number.isSafeInteger(quantity) || quantity < 1 || quantity > 1000000) {
    res.status(400).json({ message: 'Indica un producto válido y una cantidad entera de 1 a 1,000,000.' }); return;
  }
  const result = await AppDataSource.transaction(async manager => {
    // Lock the product even if its inventory row does not exist yet.
    const product = await manager.getRepository(Product).findOne({ where: { product_id: productId }, lock: { mode: 'pessimistic_write' } });
    if (!product) return null;
    const repo = manager.getRepository(Inventory);
    const inventory = await repo.findOne({ where: { product_id: productId }, lock: { mode: 'pessimistic_write' } })
      ?? repo.create({ product_id: productId, quantity_available: 0, quantity_reserved: 0 });
    if (inventory.quantity_available + inventory.quantity_reserved > 2147483647 - quantity) return 'overflow';
    inventory.quantity_available += quantity;
    return repo.save(inventory);
  });
  if (!result) { res.status(404).json({ message: 'Producto no encontrado.' }); return; }
  if (result === 'overflow') { res.status(400).json({ message: 'El stock excede el límite permitido.' }); return; }
  res.json(result);
});

export const getAdminUsers = handler(async (req, res) => {
  const { page, limit, offset } = pagination(req);
  const term = search(req);
  const query = AppDataSource.getRepository(User).createQueryBuilder('u')
    .leftJoin('u.preferences', 'pref')
    .select(['u.user_id', 'u.name', 'u.email', 'u.role', 'u.created_at'])
    .addSelect('pref.phone', 'phone')
    .addSelect(sub => sub.select('COUNT(*)').from(Order, 'o').where('o.user_id = u.user_id'), 'order_count')
    .addSelect(sub => sub.select('COALESCE(SUM(o.total_amount), 0)').from(Order, 'o')
      .where('o.user_id = u.user_id').andWhere("o.payment_status = 'paid' AND o.order_status != 'cancelled'"), 'total_spent');
  if (term) query.where('(u.name ILIKE :term OR u.email ILIKE :term)', { term: `%${term}%` });
  const total = await query.getCount();
  const rows = await query.orderBy('u.user_id', 'DESC').offset(offset).limit(limit).getRawMany();
  res.json({ items: rows.map(u => ({ user_id: u.u_user_id, name: u.u_name, email: u.u_email,
    role: u.u_role, created_at: u.u_created_at, phone: u.phone,
    order_count: Number(u.order_count), total_spent: Number(u.total_spent) })), total, page, limit });
});

export const getAdminOrders = handler(async (req, res) => {
  const { page, limit, offset } = pagination(req);
  const term = search(req);
  const query = filteredOrders(req).leftJoin('o.user', 'u')
    .addSelect(['u.user_id', 'u.name', 'u.email']).leftJoinAndSelect('o.payment', 'payment')
    .leftJoinAndSelect('o.shipping', 'shipping').leftJoinAndSelect('o.order_items', 'item')
    .leftJoinAndSelect('item.product', 'product').leftJoinAndSelect('item.custom_product', 'custom');
  if (term) query.andWhere('(u.name ILIKE :term OR u.email ILIKE :term OR CAST(o.order_id AS TEXT) = :id)', { term: `%${term}%`, id: term });
  const [items, total] = await query.orderBy('o.created_at', 'DESC').addOrderBy('o.order_id', 'DESC')
    .skip(offset).take(limit).getManyAndCount();
  res.json({ items: items.map(o => ({ ...o, total_amount: Number(o.total_amount),
    order_items: o.order_items.map(i => ({ ...i, unit_price: Number(i.unit_price) })) })), total, page, limit });
});
