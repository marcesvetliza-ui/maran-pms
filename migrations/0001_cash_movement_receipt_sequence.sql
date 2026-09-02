CREATE SEQUENCE IF NOT EXISTS "cash_movements_receipt_number_seq";
--> statement-breakpoint
ALTER TABLE "cash_movements" ADD COLUMN IF NOT EXISTS "receipt_number" text;
--> statement-breakpoint
ALTER TABLE "cash_movements"
  ALTER COLUMN "receipt_number"
  SET DEFAULT nextval('cash_movements_receipt_number_seq'::regclass)::text;
--> statement-breakpoint
SELECT setval(
  'cash_movements_receipt_number_seq',
  COALESCE((
    SELECT MAX("receipt_number"::bigint)
    FROM "cash_movements"
    WHERE "receipt_number" ~ '^[0-9]+$'
  ), 0) + 1,
  false
);