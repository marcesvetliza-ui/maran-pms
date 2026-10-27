// Raw SQL tables follow the existing operational modules; runtime migration uses catalog guards.
export const specialDatesTables = [
  {
    name: "hospitality_birthday_settings",
    ddl: `CREATE TABLE hospitality_birthday_settings (
    id integer PRIMARY KEY CHECK(id=1), template jsonb NOT NULL, version integer NOT NULL DEFAULT 1,
    updated_by text NOT NULL, updated_at timestamptz NOT NULL DEFAULT NOW()
  )`,
  },
  {
    name: "hospitality_marketing_exclusions",
    ddl: `CREATE TABLE hospitality_marketing_exclusions (
    guest_id varchar PRIMARY KEY REFERENCES guests(id) ON DELETE CASCADE,
    blocked boolean NOT NULL, reason text NOT NULL, updated_by text NOT NULL, updated_at timestamptz NOT NULL DEFAULT NOW()
  )`,
  },
  {
    name: "hospitality_birthday_drafts",
    ddl: `CREATE TABLE hospitality_birthday_drafts (
    id text PRIMARY KEY, campaign_year integer NOT NULL, month integer NOT NULL CHECK(month BETWEEN 1 AND 12),
    created_by text NOT NULL, messages jsonb NOT NULL, status text NOT NULL DEFAULT 'draft' CHECK(status IN ('draft','confirmed')),
    created_at timestamptz NOT NULL DEFAULT NOW(), expires_at timestamptz NOT NULL DEFAULT NOW()+INTERVAL '30 minutes', confirmed_at timestamptz
  )`,
  },
  {
    name: "hospitality_birthday_contacts",
    ddl: `CREATE TABLE hospitality_birthday_contacts (
    id text PRIMARY KEY, guest_id varchar NOT NULL REFERENCES guests(id), campaign_year integer NOT NULL,
    month integer NOT NULL CHECK(month BETWEEN 1 AND 12), channel text NOT NULL CHECK(channel IN ('email','whatsapp')),
    recipient text NOT NULL, email_key text, status text NOT NULL CHECK(status IN ('queued','sending','sent','failed','unknown','cancelled','contacted')),
    subject text NOT NULL DEFAULT '', body text NOT NULL, actor_id text NOT NULL, actor_name text NOT NULL,
    draft_id text REFERENCES hospitality_birthday_drafts(id), attempts integer NOT NULL DEFAULT 0,
    created_at timestamptz NOT NULL DEFAULT NOW(), sending_since timestamptz, finished_at timestamptz,
    error text, provider_id text,
    UNIQUE(guest_id,campaign_year,channel), UNIQUE(campaign_year,email_key)
  )`,
  },
  {
    name: "hospitality_birthday_contact_events",
    ddl: `CREATE TABLE hospitality_birthday_contact_events (
    id text PRIMARY KEY, contact_id text NOT NULL REFERENCES hospitality_birthday_contacts(id),
    status text NOT NULL, actor_name text NOT NULL, details jsonb NOT NULL DEFAULT '{}'::jsonb, created_at timestamptz NOT NULL DEFAULT NOW()
  )`,
  },
];
