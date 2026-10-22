ALTER TABLE rooms ADD COLUMN IF NOT EXISTS housekeeping_service_date text;
-- Preserve existing occupied-clean rooms on rollout; first renewal is next day.
UPDATE rooms SET housekeeping_service_date=(CURRENT_TIMESTAMP AT TIME ZONE 'America/Argentina/Buenos_Aires')::date::text
WHERE status='limpia_ocupada' AND housekeeping_service_date IS NULL;
