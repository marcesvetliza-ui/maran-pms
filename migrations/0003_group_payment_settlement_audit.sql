ALTER TABLE "group_payments"
  ADD COLUMN IF NOT EXISTS "settlement_breakdown_status" text,
  ADD COLUMN IF NOT EXISTS "settlement_breakdown_note" text;