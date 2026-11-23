/** Durable identities survive a cancelled assignment or a reversed receipt. */
export const GROUP_ASSIGNMENT_SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS group_assignment_releases (
  operation_id varchar PRIMARY KEY,
  fingerprint text NOT NULL,
  group_id varchar NOT NULL,
  reservation_id varchar NOT NULL UNIQUE,
  replacement_id varchar NOT NULL UNIQUE,
  result jsonb NOT NULL,
  created_at timestamp NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS group_personal_advance_origins (
  group_payment_id varchar PRIMARY KEY,
  payment_id varchar NOT NULL UNIQUE,
  group_id varchar NOT NULL,
  reservation_id varchar NOT NULL,
  operation_id varchar NOT NULL,
  status text NOT NULL DEFAULT 'active' CHECK(status IN ('active','reversed')),
  created_at timestamp NOT NULL DEFAULT now()
);
`;
