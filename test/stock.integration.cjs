process.env.NODE_ENV = 'test';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { Client } = require('pg');
const express = require('express');
const jwt = require('jsonwebtoken');
const Stripe = require('stripe');
const { AppDataSource: db } = require('../dist/config/data-source');
const { User, Product, Inventory, ShoppingCart, CartItem, Order, OrderItem, Payment, CheckoutReservation, CustomProduct } = require('../dist/entities');

// Replace only the external network boundary. Database, HTTP routing, JWTs,
// Stripe webhook signatures, locks, and transactions are real.
const intents = new Map();
const keys = new Map();
let loseNextCreateResponse = false;
let offline = false;
const signatureSecret = 'whsec_local_inventory_test';
const stripe = new Stripe('sk_test_offline_fixture');
const fake = {
  webhooks: stripe.webhooks,
  paymentIntents: {
    async create(params, options) {
      if (offline) throw new Error('Simulated Stripe outage');
      let intent = keys.get(options.idempotencyKey);
      if (!intent) {
        intent = { id: `pi_${randomUUID().replaceAll('-', '')}`, object: 'payment_intent', status: 'requires_payment_method',
          client_secret: 'fixture_client_secret', amount: params.amount, currency: params.currency, metadata: params.metadata };
        intents.set(intent.id, intent); keys.set(options.idempotencyKey, intent);
      }
      if (loseNextCreateResponse) { loseNextCreateResponse = false; throw new Error('Simulated lost response after Stripe created the intent'); }
      return structuredClone(intent);
    },
    async retrieve(id) {
      if (offline) throw new Error('Simulated Stripe outage');
      assert.ok(intents.has(id)); return structuredClone(intents.get(id));
    },
    async cancel(id) {
      if (offline) throw new Error('Simulated Stripe outage');
      const intent = intents.get(id); assert.ok(intent);
      if (intent.status === 'processing' || intent.status === 'succeeded') throw new Error('Not cancelable');
      intent.status = 'canceled'; return structuredClone(intent);
    },
  },
};
require('../dist/services/stripeClient').getStripe = () => fake;
const cartRoutes = require('../dist/routes/cart.routes').default;
const paymentRoutes = require('../dist/routes/payment.routes').default;
const orderRoutes = require('../dist/routes/order.routes').default;
const productRoutes = require('../dist/routes/product.routes').default;
const { reserveCheckout, completeCheckout, reconcileExpiredCheckouts } = require('../dist/services/checkout.service');

test('stock is enforced through cart, reservations and verified payment', async t => {
  assert.ok(['localhost', '127.0.0.1', '::1'].includes(db.options.host), 'Only local PostgreSQL is permitted');
  const schema = `stock_test_${randomUUID().replaceAll('-', '')}`;
  const client = new Client({ host: db.options.host, port: db.options.port, user: db.options.username,
    password: db.options.password, database: db.options.database, connectionTimeoutMillis: 5000 });
  let created = false, server, seq = 0;
  await client.connect();
  try {
    await client.query(`CREATE SCHEMA "${schema}"`); created = true;
    db.setOptions({ schema, synchronize: true, logging: false }); await db.initialize();
    process.env.STRIPE_WEBHOOK_SECRET = signatureSecret;
    const app = express();
    app.use(express.json({ verify(req, _res, buf) { req.rawBody = buf; } }));
    app.use('/cart', cartRoutes); app.use('/payments', paymentRoutes); app.use('/orders', orderRoutes); app.use('/products', productRoutes);
    server = await new Promise(resolve => { const s = app.listen(0, '127.0.0.1', () => resolve(s)); });
    const base = `http://127.0.0.1:${server.address().port}`;
    const user = async () => db.getRepository(User).save({ name: `Customer ${++seq}`, email: `user${seq}@test.invalid`, role: 'customer', password_hash: 'not-used' });
    const product = async (stock, name = `Record ${++seq}`) => {
      const p = await db.getRepository(Product).save({ name, artist: 'Artist', format: 'CD', price: 25 });
      if (stock !== null) await db.getRepository(Inventory).save({ product_id: p.product_id, quantity_available: stock, quantity_reserved: 0 });
      return p;
    };
    const inventory = p => db.getRepository(Inventory).findOneByOrFail({ product_id: p.product_id });
    async function request(path, u, body, method = body === undefined ? 'GET' : 'POST') {
      const token = jwt.sign({ user_id: u.user_id, email: u.email, role: u.role }, process.env.JWT_SECRET || 'secret_key', { expiresIn: '5m' });
      const response = await fetch(base + path, { method, headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
      return { status: response.status, body: await response.json() };
    }
    const add = (u, p, quantity = 1) => request('/cart/items', u, { product_id: p.product_id, quantity });
    const pay = u => request('/payments/create-intent', u, {});
    async function webhook(intent, type = 'payment_intent.succeeded') {
      const payload = JSON.stringify({ id: `evt_${randomUUID()}`, object: 'event', type, data: { object: intent } });
      const signature = stripe.webhooks.generateTestHeaderString({ payload, secret: signatureSecret });
      const response = await fetch(base + '/payments/webhook', { method: 'POST', body: payload,
        headers: { 'Content-Type': 'application/json', 'stripe-signature': signature } });
      return { status: response.status, body: await response.json() };
    }
    await t.test('cart rejects invalid quantities, missing inventory and excess totals', async () => {
      const u = await user(), p = await product(3), missing = await product(null);
      for (const q of [-1, 0, 1.5, '2', null, 1000001]) assert.equal((await add(u, p, q)).status, 400);
      assert.equal((await add(u, missing)).status, 409);
      assert.equal((await add(u, p, 4)).status, 409);
      assert.equal((await add(u, p, 2)).status, 201);
      assert.equal((await add(u, p, 2)).status, 409);
      const cart = await request(`/cart/user/${u.user_id}`, u);
      const id = cart.body.cart_items[0].cart_item_id;
      assert.equal((await request(`/cart/items/${id}`, u, { quantity: 4 }, 'PUT')).status, 409);
      assert.equal((await request(`/cart/items/${id}`, u, { quantity: -2 }, 'PUT')).status, 400);
      assert.equal((await request(`/cart/items/${id}`, u, { quantity: 3 }, 'PUT')).status, 200);
      assert.equal((await inventory(p)).quantity_available, 3, 'cart does not reserve');
      const other = await user();
      assert.equal((await request(`/cart/items/${id}`, other, { quantity: 1 }, 'PUT')).status, 404);
      assert.equal((await request('/cart/items', u, { product_id: p.product_id, custom_product_id: 1, quantity: 1 })).status, 400);
    });
    await t.test('concurrent additions share one cart and cannot exceed available stock', async () => {
      const u = await user(), p = await product(1);
      const results = await Promise.all([add(u, p), add(u, p)]);
      assert.deepEqual(results.map(r => r.status).sort(), [201, 409]);
      assert.equal(await db.getRepository(ShoppingCart).countBy({ user_id: u.user_id }), 1);
    });
    await t.test('two customers cannot reserve the last unit; open checkout freezes cart', async () => {
      const a = await user(), b = await user(), p = await product(1);
      await add(a, p); await add(b, p);
      const results = await Promise.all([pay(a), pay(b)]);
      assert.deepEqual(results.map(r => r.status).sort(), [200, 409]);
      const winner = results[0].status === 200 ? a : b;
      const success = results.find(r => r.status === 200).body;
      assert.equal((await inventory(p)).quantity_available, 0); assert.equal((await inventory(p)).quantity_reserved, 1);
      const repeated = await pay(winner); assert.equal(repeated.body.paymentIntentId, success.paymentIntentId);
      const cart = (await request(`/cart/user/${winner.user_id}`, winner)).body;
      assert.equal(cart.checkout_pending, true);
      assert.equal((await request(`/cart/items/${cart.cart_items[0].cart_item_id}`, winner, { quantity: 0 }, 'PUT')).status, 409);
      assert.equal((await request(`/cart/items/${cart.cart_items[0].cart_item_id}`, winner, undefined, 'DELETE')).status, 409);
      assert.equal((await request(`/cart/user/${winner.user_id}/clear`, winner, undefined, 'DELETE')).status, 409);
      await request('/payments/cancel', winner, { paymentIntentId: success.paymentIntentId });
      assert.equal((await inventory(p)).quantity_available, 1); assert.equal((await inventory(p)).quantity_reserved, 0);
    });
    await t.test('confirmation and duplicate signed webhooks create one order and deduct once', async () => {
      const u = await user(), p = await product(5);
      await add(u, p, 2);
      // Ignore an old/tampered cart price; the server snapshots current catalog prices.
      const cart = await db.getRepository(ShoppingCart).findOneByOrFail({ user_id: u.user_id, status: 'active' });
      await db.getRepository(CartItem).update({ cart_id: cart.cart_id }, { unit_price: 0.01 });
      const start = await pay(u); assert.equal(start.status, 200); assert.equal(start.body.amount, 50);
      const intent = intents.get(start.body.paymentIntentId); intent.status = 'succeeded';
      const other = await user();
      assert.equal((await request('/payments/confirm', other, { paymentIntentId: intent.id })).status, 403);
      const results = await Promise.all([request('/payments/confirm', u, { paymentIntentId: intent.id }), webhook(intent), webhook(intent)]);
      assert.ok(results.every(r => r.status === 200));
      assert.equal(await db.getRepository(Order).countBy({ user_id: u.user_id }), 1);
      assert.equal(await db.getRepository(Payment).countBy({ transaction_id: intent.id }), 1);
      const order = await db.getRepository(Order).findOneByOrFail({ user_id: u.user_id });
      const item = await db.getRepository(OrderItem).findOneByOrFail({ order_id: order.order_id });
      assert.equal(Number(item.unit_price), 25); assert.equal(item.quantity, 2);
      assert.equal((await inventory(p)).quantity_available, 3); assert.equal((await inventory(p)).quantity_reserved, 0);
    });
    await t.test('multi-product reservation rolls back all stock if one item sells out', async () => {
      const u = await user(), p = await product(4), q = await product(1);
      await add(u, p, 2); await add(u, q);
      await db.getRepository(Inventory).update({ product_id: q.product_id }, { quantity_available: 0 });
      assert.equal((await pay(u)).status, 409);
      assert.equal((await inventory(p)).quantity_available, 4); assert.equal((await inventory(p)).quantity_reserved, 0);
      assert.equal(await db.getRepository(CheckoutReservation).countBy({ user_id: u.user_id }), 0);
    });
    await t.test('cancellation and failed payments return stock exactly once', async () => {
      const u = await user(), p = await product(4); await add(u, p, 2);
      const start = await pay(u); const intent = intents.get(start.body.paymentIntentId);
      assert.equal((await webhook(intent, 'payment_intent.payment_failed')).status, 200);
      assert.equal(intents.get(intent.id).status, 'canceled');
      await Promise.all([webhook(intents.get(intent.id), 'payment_intent.canceled'), request('/payments/cancel', u, { paymentIntentId: intent.id })]);
      assert.equal((await inventory(p)).quantity_available, 4); assert.equal((await inventory(p)).quantity_reserved, 0);
      const retry = await pay(u); assert.equal(retry.status, 200); assert.notEqual(retry.body.paymentIntentId, intent.id);
      await request('/payments/cancel', u, { paymentIntentId: retry.body.paymentIntentId });
    });
    await t.test('expiry cancels Stripe first; processing payments keep their reservation', async () => {
      const u = await user(), p = await product(2); await add(u, p);
      const start = await pay(u); const intent = intents.get(start.body.paymentIntentId);
      await db.getRepository(CheckoutReservation).update({ stripe_intent_id: intent.id }, { expires_at: new Date(Date.now() - 1000) });
      intent.status = 'processing';
      await reconcileExpiredCheckouts();
      assert.equal((await inventory(p)).quantity_available, 1); assert.equal((await inventory(p)).quantity_reserved, 1);
      intent.status = 'requires_payment_method';
      await reconcileExpiredCheckouts();
      assert.equal(intent.status, 'canceled'); assert.equal((await inventory(p)).quantity_available, 2);
    });
    await t.test('ambiguous Stripe creation retries the same intent without a second reservation', async () => {
      const u = await user(), p = await product(3); await add(u, p);
      const before = intents.size;
      loseNextCreateResponse = true;
      assert.equal((await pay(u)).status, 502);
      assert.equal((await inventory(p)).quantity_reserved, 1);
      const retry = await pay(u); assert.equal(retry.status, 200);
      assert.equal(intents.size, before + 1); assert.equal((await inventory(p)).quantity_reserved, 1);
      offline = true;
      assert.equal((await request('/payments/cancel', u, { paymentIntentId: retry.body.paymentIntentId })).status, 502);
      assert.equal((await inventory(p)).quantity_reserved, 1);
      offline = false;
      await request('/payments/cancel', u, { paymentIntentId: retry.body.paymentIntentId });
    });
    await t.test('paid reservation uses frozen items and rejects incorrect amounts atomically', async () => {
      const u = await user(), p = await product(3); await add(u, p);
      const start = await pay(u); const intent = intents.get(start.body.paymentIntentId); intent.status = 'succeeded';
      await assert.rejects(completeCheckout({ ...intent, amount: 1 }), /no coincide/);
      assert.equal(await db.getRepository(Order).countBy({ user_id: u.user_id }), 0);
      assert.equal((await inventory(p)).quantity_reserved, 1);
      const reservation = await db.getRepository(CheckoutReservation).findOneByOrFail({ stripe_intent_id: intent.id });
      // Simulate a stale cart writer bypassing the API. The paid snapshot must stay unchanged.
      await db.getRepository(CartItem).update({ cart_id: reservation.cart_id }, { quantity: 99, unit_price: 0.01 });
      const result = await completeCheckout(intent);
      const item = await db.getRepository(OrderItem).findOneByOrFail({ order_id: result.orderId });
      assert.equal(item.quantity, 1); assert.equal(Number(item.unit_price), 25);
    });
    await t.test('custom discs consume template stock and cannot use another user design', async () => {
      const u = await user(), other = await user(), template = await product(2, 'Custom CD');
      const custom = await db.getRepository(CustomProduct).save({ user_id: u.user_id, format: 'CD', title: 'My disc', price: 0.01 });
      assert.equal((await request('/cart/items', other, { custom_product_id: custom.custom_product_id, quantity: 1 })).status, 404);
      assert.equal((await request('/cart/items', u, { custom_product_id: custom.custom_product_id, quantity: 2 })).status, 201);
      const start = await pay(u); assert.equal(start.body.amount, 50);
      assert.equal((await inventory(template)).quantity_available, 0);
      const intent = intents.get(start.body.paymentIntentId); intent.status = 'succeeded';
      await completeCheckout(intent);
      assert.equal((await inventory(template)).quantity_reserved, 0);
    });
    await t.test('simulated checkout is closed and unsigned webhooks cannot alter inventory', async () => {
      const u = await user(); assert.equal((await request('/orders/checkout', u, {})).status, 410);
      const response = await fetch(base + '/payments/webhook', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
      assert.equal(response.status, 400);
    });
    await t.test('product creation rejects invalid stock without leaving partial products', async () => {
      const admin = await user(); admin.role = 'admin'; await db.getRepository(User).save(admin);
      const before = await db.getRepository(Product).count();
      for (const stock of [-1, 1.5, '3']) {
        assert.equal((await request('/products', admin, { name: 'Bad stock', artist: 'Artist', format: 'CD', price: 10, stock })).status, 400);
      }
      assert.equal(await db.getRepository(Product).count(), before);
      const result = await request('/products', admin, { name: 'New release', artist: 'Artist', format: 'CD', price: 10, stock: 3 });
      assert.equal(result.status, 201);
      assert.equal((await inventory(result.body)).quantity_available, 3);
    });
    await t.test('a DB failure rolls back deduction, order and payment; the webhook can retry', async () => {
      const u = await user(), p = await product(3); await add(u, p, 2);
      const start = await pay(u), intent = intents.get(start.body.paymentIntentId); intent.status = 'succeeded';
      // Force a failure after inventory/order writes by rejecting payment insertion.
      await db.query(`ALTER TABLE "${schema}".payments ADD CONSTRAINT fail_test_payment CHECK (payment_method != 'stripe') NOT VALID`);
      assert.equal((await webhook(intent)).status, 500);
      assert.equal(await db.getRepository(Order).countBy({ user_id: u.user_id }), 0);
      assert.equal((await inventory(p)).quantity_available, 1); assert.equal((await inventory(p)).quantity_reserved, 2);
      await db.query(`ALTER TABLE "${schema}".payments DROP CONSTRAINT fail_test_payment`);
      assert.equal((await webhook(intent)).status, 200);
      assert.equal(await db.getRepository(Order).countBy({ user_id: u.user_id }), 1);
      assert.equal((await inventory(p)).quantity_reserved, 0);
    });
    await t.test('expired successful payment is finalized rather than releasing sold stock', async () => {
      const u = await user(), p = await product(1); await add(u, p);
      const start = await pay(u), intent = intents.get(start.body.paymentIntentId); intent.status = 'succeeded';
      await db.getRepository(CheckoutReservation).update({ stripe_intent_id: intent.id }, { expires_at: new Date(Date.now() - 1000) });
      await reconcileExpiredCheckouts();
      assert.equal(await db.getRepository(Order).countBy({ user_id: u.user_id }), 1);
      assert.equal((await inventory(p)).quantity_available, 0); assert.equal((await inventory(p)).quantity_reserved, 0);
    });
    await t.test('production migration applies on existing tables and can be repeated', async () => {
      const fs = require('node:fs'), path = require('node:path');
      const before = await db.getRepository(Inventory).find({ order: { inventory_id: 'ASC' } });
      // Only this disposable schema is affected. Simulates upgrading a pre-reservation DB.
      await client.query(`SET search_path TO "${schema}", public`);
      await client.query(`DROP TABLE "${schema}".checkout_reservations`);
      const sql = fs.readFileSync(path.join(__dirname, '../scripts/deployment/stock-reservations.sql'), 'utf8');
      await client.query(sql); await client.query(sql);
      assert.equal(await db.getRepository(CheckoutReservation).count(), 0);
      assert.deepEqual(await db.getRepository(Inventory).find({ order: { inventory_id: 'ASC' } }), before);
      const u = await user(), p = await product(2); await add(u, p);
      const started = await pay(u); assert.equal(started.status, 200);
      assert.equal(await db.getRepository(CheckoutReservation).count(), 1);
      await request('/payments/cancel', u, { paymentIntentId: started.body.paymentIntentId });
      assert.equal((await inventory(p)).quantity_available, 2);
    });
  } finally {
    if (server) await new Promise(resolve => server.close(resolve));
    if (db.isInitialized) await db.destroy();
    if (created) await client.query(`DROP SCHEMA "${schema}" CASCADE`);
    await client.end();
  }
});
