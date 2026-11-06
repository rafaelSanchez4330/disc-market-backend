-- Additive migration for the Stripe deployment. Existing records are preserved.
BEGIN;
ALTER TABLE payments ADD COLUMN IF NOT EXISTS transaction_id varchar(150);
ALTER TABLE payments ADD COLUMN IF NOT EXISTS receipt_url varchar(255);
COMMIT;
