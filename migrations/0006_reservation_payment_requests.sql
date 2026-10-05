ALTER TABLE payments ADD COLUMN IF NOT EXISTS payment_request_id varchar;
ALTER TABLE payments ADD COLUMN IF NOT EXISTS payment_request_fingerprint text;
CREATE UNIQUE INDEX IF NOT EXISTS payments_request_id_unique ON payments (payment_request_id);
