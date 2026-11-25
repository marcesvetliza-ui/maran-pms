// Nullable, additive metadata. Never rewrite or redistribute historical stays.
export const GROUP_BLOCK_ASSIGNMENT_SCHEMA_SQL = `
ALTER TABLE group_reservation_links ADD COLUMN IF NOT EXISTS block_id varchar;
CREATE INDEX IF NOT EXISTS group_reservation_links_block_idx ON group_reservation_links(group_id,block_id);
CREATE TABLE IF NOT EXISTS group_reservation_imports (
  operation_id varchar PRIMARY KEY,
  fingerprint text NOT NULL,
  group_id varchar NOT NULL,
  reservation_id varchar NOT NULL UNIQUE,
  result jsonb NOT NULL,
  created_at timestamp NOT NULL DEFAULT now()
);
`;
