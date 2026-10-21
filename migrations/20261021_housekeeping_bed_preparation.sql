-- Confirmation only; no changes to No mover, historical bookings or room state.
ALTER TABLE reservations ADD COLUMN IF NOT EXISTS housekeeping_bed_preparation jsonb;
ALTER TABLE rooms ADD COLUMN IF NOT EXISTS bed_config_revision integer NOT NULL DEFAULT 0;
