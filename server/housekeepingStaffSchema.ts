export const housekeepingStaffTables = [
  {name:"housekeeping_operational_staff",ddl:`CREATE TABLE housekeeping_operational_staff (
    id varchar PRIMARY KEY, full_name text NOT NULL,
    kind text NOT NULL CHECK(kind IN ('permanent','extra')),
    service_date text,
    created_by varchar NOT NULL,
    created_at timestamptz NOT NULL DEFAULT NOW(),
    CHECK ((kind='extra' AND service_date IS NOT NULL) OR (kind='permanent' AND service_date IS NULL))
  )`},
  {name:"housekeeping_operational_availability",ddl:`CREATE TABLE housekeeping_operational_availability (
    user_id varchar NOT NULL REFERENCES housekeeping_operational_staff(id),
    scheduled_date text NOT NULL,
    status text NOT NULL CHECK(status IN ('working','day_off','absent')),
    shift text, start_time text, end_time text,
    notes text NOT NULL DEFAULT '',
    updated_by varchar NOT NULL,
    updated_at timestamptz NOT NULL DEFAULT NOW(),
    PRIMARY KEY(user_id,scheduled_date)
  )`},
];
