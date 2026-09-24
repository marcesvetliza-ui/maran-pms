ALTER TABLE "payment_orders"
  ADD COLUMN IF NOT EXISTS "alicuota_iibb_op" numeric(6,4) DEFAULT 0;
