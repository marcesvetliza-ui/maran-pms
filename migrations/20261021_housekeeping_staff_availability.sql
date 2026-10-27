CREATE TABLE IF NOT EXISTS housekeeping_staff_availability (
 user_id varchar NOT NULL REFERENCES system_users(id),
 scheduled_date text NOT NULL,
 status text NOT NULL CHECK (status IN ('working','day_off','absent')),
 shift text,
 start_time text,
 end_time text,
 notes text NOT NULL DEFAULT '',
 updated_by varchar NOT NULL,
 updated_at timestamptz NOT NULL DEFAULT NOW(),
 PRIMARY KEY(user_id,scheduled_date)
);
