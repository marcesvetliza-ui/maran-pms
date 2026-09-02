ALTER TABLE "group_payments"
  ADD COLUMN IF NOT EXISTS "settlement_breakdown" jsonb;