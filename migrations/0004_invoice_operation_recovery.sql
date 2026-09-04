ALTER TABLE sales_invoices ADD COLUMN IF NOT EXISTS payment_id varchar;
CREATE UNIQUE INDEX IF NOT EXISTS sales_invoices_payment_id_idx
  ON sales_invoices (payment_id) WHERE payment_id IS NOT NULL;