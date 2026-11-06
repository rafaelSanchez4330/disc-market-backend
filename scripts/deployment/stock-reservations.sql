-- Apply once before starting this backend in production. PostgreSQL 16.
-- Additive only: no seeding, stock reset or retroactive deduction of old orders.
BEGIN;
CREATE TABLE IF NOT EXISTS checkout_reservations (
    reservation_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id integer NOT NULL REFERENCES users(user_id) ON DELETE RESTRICT,
    cart_id integer NOT NULL REFERENCES shopping_carts(cart_id) ON DELETE RESTRICT,
    status varchar(20) NOT NULL DEFAULT 'reserved',
    stripe_intent_id varchar(150) UNIQUE,
    lines jsonb NOT NULL,
    amount_cents integer NOT NULL,
    shipping_method varchar(100) NOT NULL,
    shipping_address varchar(500) NOT NULL DEFAULT '',
    expires_at timestamptz NOT NULL,
    created_at timestamp NOT NULL DEFAULT now(),
    order_id integer UNIQUE REFERENCES orders(order_id) ON DELETE RESTRICT
);
CREATE INDEX IF NOT EXISTS "IDX_checkout_expiry" ON checkout_reservations (status, expires_at);
CREATE UNIQUE INDEX IF NOT EXISTS "UQ_checkout_active_cart" ON checkout_reservations (cart_id) WHERE status = 'reserved';
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'inventory'::regclass AND conname = 'CHK_inventory_nonnegative') THEN
        ALTER TABLE inventory ADD CONSTRAINT "CHK_inventory_nonnegative" CHECK (quantity_available >= 0 AND quantity_reserved >= 0);
    END IF;
END $$;
COMMIT;
