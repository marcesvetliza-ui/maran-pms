export const GROUP_ROOM_INVOICE_BATCH_SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS group_room_invoice_batches (
 operation_id varchar PRIMARY KEY,
 group_id varchar NOT NULL,
 actor_id varchar NOT NULL,
 fingerprint text NOT NULL,
 reservation_ids text[] NOT NULL,
 plan jsonb NOT NULL,
 status text NOT NULL DEFAULT 'active',
 collection_finished boolean NOT NULL DEFAULT false,
 created_at timestamp NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS group_room_invoice_batches_group_idx ON group_room_invoice_batches(group_id,created_at);
`;
