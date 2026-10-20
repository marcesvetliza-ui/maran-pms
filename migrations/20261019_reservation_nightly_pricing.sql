-- Structure only: no conversion/backfill of legacy prices and NO activation.
-- Also applied idempotently by the app's incremental migration runner.
ALTER TABLE reservations ADD COLUMN IF NOT EXISTS pricing_scheme text NOT NULL DEFAULT 'legacy';
ALTER TABLE reservations ADD COLUMN IF NOT EXISTS pricing_revision integer NOT NULL DEFAULT 0;
ALTER TABLE reservations ADD COLUMN IF NOT EXISTS nightly_pricing jsonb;
