// Real PostgreSQL tests in a disposable schema; existing tables are never synchronized.
process.env.NODE_ENV = 'test';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const express = require('express');
const jwt = require('jsonwebtoken');
const { Client } = require('pg');
const { AppDataSource: db } = require('../dist/config/data-source');
const { User, Product, Inventory, Order, OrderItem, Payment, UserPreference } = require('../dist/entities');
const adminRoutes = require('../dist/routes/admin.routes').default;
const { register, getMe } = require('../dist/controllers/auth.controller');
const { authenticateToken } = require('../dist/middlewares/auth.middleware');

test('administrator access, reporting, registration and concurrent inventory', async t => {
  assert.ok(['localhost', '127.0.0.1', '::1'].includes(db.options.host), 'Tests only run against local PostgreSQL');
  const schema = `admin_test_${randomUUID().replaceAll('-', '')}`;
  const client = new Client({ host: db.options.host, port: db.options.port, user: db.options.username,
    password: db.options.password, database: db.options.database, connectionTimeoutMillis: 5000 });
  let server;
  let created = false;
  await client.connect();
  try {
    await client.query(`CREATE SCHEMA "${schema}"`);
    created = true;
    db.setOptions({ schema, synchronize: true, logging: false });
    await db.initialize();
    const users = db.getRepository(User);
    const admin = await users.save(users.create({ name: 'Admin', email: 'admin@test.invalid', password_hash: 'private-hash', role: 'admin' }));
    const customer = await users.save(users.create({ name: 'Customer', email: 'customer@test.invalid', password_hash: 'private-hash', role: 'customer' }));
    await db.getRepository(UserPreference).save({ user_id: customer.user_id, phone: '5551234567' });
    const product = await db.getRepository(Product).save({ name: 'Test record', artist: 'Artist', format: 'Vinyl', price: 50 });
    const noInventory = await db.getRepository(Product).save({ name: 'No inventory', artist: 'Artist', format: 'CD', price: 10 });
    await db.getRepository(Inventory).save({ product_id: product.product_id, quantity_available: 10, quantity_reserved: 3 });
    const orderRepo = db.getRepository(Order);
    for (const [amount, payment, status, day] of [[100, 'paid', 'processing', 1], [50, 'paid', 'delivered', 2],
      [900, 'paid', 'cancelled', 2], [700, 'unpaid', 'pending', 2], [60, 'refunded', 'processing', 2]]) {
      const order = await orderRepo.save({ user_id: customer.user_id, total_amount: amount,
        payment_status: payment, order_status: status, created_at: new Date(`2026-11-0${day}T12:00:00Z`) });
      await db.getRepository(OrderItem).save({ order_id: order.order_id, product_id: product.product_id, quantity: 1, unit_price: amount });
      await db.getRepository(Payment).save({ order_id: order.order_id, amount, payment_method: 'stripe', payment_status: payment === 'paid' ? 'completed' : 'pending' });
    }
    const app = express();
    app.use(express.json()); app.use('/api/admin', adminRoutes); app.post('/api/auth/register', register);
    app.use((err, _req, res, _next) => { console.error(err.message); res.status(500).json({ message: 'Server error' }); });
    server = await new Promise(resolve => { const s = app.listen(0, '127.0.0.1', () => resolve(s)); });
    const base = `http://127.0.0.1:${server.address().port}/api`;
    const token = (user, role = user.role) => jwt.sign({ user_id: user.user_id, email: user.email, role }, process.env.JWT_SECRET || 'secret_key', { expiresIn: process.env.ADMIN_PREVIEW === '1' ? '2h' : '5m' });
    const adminToken = token(admin);
    async function request(path, auth = adminToken, body) {
      const response = await fetch(base + path, { method: body === undefined ? 'GET' : 'POST',
        headers: { ...(auth ? { Authorization: `Bearer ${auth}` } : {}), 'Content-Type': 'application/json' },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
      return { status: response.status, body: await response.json() };
    }
    await t.test('all admin endpoints reject anonymous and non-admin callers', async () => {
      for (const [path, body] of [['/admin/summary'], ['/admin/products'], ['/admin/users'], ['/admin/orders'], [`/admin/products/${product.product_id}/stock`, { quantity: 1 }]]) {
        assert.equal((await request(path, null, body)).status, 401);
        assert.equal((await request(path, token(customer), body)).status, 403);
        assert.equal((await request(path, token(customer, 'admin'), body)).status, 403);
      }
      await users.update(admin.user_id, { role: 'customer' });
      assert.equal((await request('/admin/summary')).status, 403, 'revoked role takes effect immediately');
      await users.update(admin.user_id, { role: 'admin' });
    });
    await t.test('public registration cannot assign an administrator role', async () => {
      const r = await request('/auth/register', null, { name: 'New customer', email: 'register@test.invalid', password: 'TestPassword!123', role: 'admin' });
      assert.equal(r.status, 201); assert.equal(r.body.user.role, 'customer');
      assert.equal(jwt.verify(r.body.token, process.env.JWT_SECRET || 'secret_key').role, 'customer');
    });
    await t.test('sales exclude unpaid, refunded and cancelled orders; dates are inclusive UTC days', async () => {
      const r = await request('/admin/summary');
      assert.equal(r.status, 200); assert.equal(r.body.revenue, 150); assert.equal(r.body.paid_orders, 2);
      assert.equal(r.body.total_orders, 5); assert.equal(r.body.average_order, 75); assert.equal(r.body.low_stock, 1);
      assert.equal((await request('/admin/summary?from=2026-11-02&to=2026-11-02')).body.revenue, 50);
      assert.equal((await request('/admin/summary?from=2026-11-03')).body.revenue, 0);
      assert.equal((await request('/admin/summary?from=2026-02-30')).status, 400);
      assert.equal((await request('/admin/orders?from=2026-11-03&to=2026-11-01')).status, 400);
    });
    await t.test('user and order lists include useful data without password hashes', async () => {
      const r = await request('/admin/users?search=customer%40test.invalid');
      assert.equal(r.status, 200); assert.equal(r.body.total, 1);
      assert.equal(r.body.items[0].phone, '5551234567'); assert.equal(r.body.items[0].order_count, 5);
      assert.equal(r.body.items[0].total_spent, 150); assert.equal(r.body.items[0].name, 'Customer');
      const orders = await request('/admin/orders?from=2026-11-01&to=2026-11-01');
      assert.equal(orders.status, 200); assert.equal(orders.body.total, 1);
      assert.equal(orders.body.items[0].order_items[0].product.name, 'Test record');
      assert.equal(orders.body.items[0].user.email, customer.email);
      assert.ok(!JSON.stringify([r.body, orders.body]).includes('password_hash'));
      assert.equal((await request('/admin/users?page=0')).status, 400);
      assert.equal((await request('/admin/products?page=2')).body.items.length, 0);
    });
    await t.test('stock adds atomically, creates missing inventory and validates input', async () => {
      const path = `/admin/products/${product.product_id}/stock`;
      const results = await Promise.all([1, 2, 3, 4].map(quantity => request(path, adminToken, { quantity })));
      assert.ok(results.every(r => r.status === 200));
      const inventory = await db.getRepository(Inventory).findOneByOrFail({ product_id: product.product_id });
      assert.equal(inventory.quantity_available, 20); assert.equal(inventory.quantity_reserved, 3);
      for (const quantity of [-1, 0, 1.2, '5', 1000001, null]) assert.equal((await request(path, adminToken, { quantity })).status, 400);
      assert.equal((await request('/admin/products/99999999/stock', adminToken, { quantity: 1 })).status, 404);
      const fresh = await Promise.all([2, 3].map(quantity => request(`/admin/products/${noInventory.product_id}/stock`, adminToken, { quantity })));
      assert.ok(fresh.every(r => r.status === 200));
      assert.equal((await db.getRepository(Inventory).findOneByOrFail({ product_id: noInventory.product_id })).quantity_available, 5);
    });
    // Optional visual QA against this disposable dataset. Only binds to loopback.
    if (process.env.ADMIN_PREVIEW === '1') {
      const path = require('node:path');
      const frontend = path.resolve(__dirname, '../../disc-market-frontend/dist');
      app.get('/api/auth/me', authenticateToken, getMe);
      app.get('/api/cart', (_req, res) => res.json({ cart_items: [] }));
      app.get('/preview', (_req, res) => res.send(`<script>localStorage.setItem('disc-market-token',${JSON.stringify(adminToken)});location.replace('/admin');</script>`));
      app.use(express.static(frontend));
      app.get('*', (_req, res) => res.sendFile(path.join(frontend, 'index.html')));
      console.log(`ADMIN_PREVIEW_URL=http://127.0.0.1:${server.address().port}/preview`);
      await new Promise(resolve => { process.once('SIGINT', resolve); process.once('SIGTERM', resolve); });
    }
  } finally {
    if (server) await new Promise(resolve => server.close(resolve));
    if (db.isInitialized) await db.destroy();
    if (created) await client.query(`DROP SCHEMA "${schema}" CASCADE`);
    await client.end();
  }
});
