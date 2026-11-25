import { sql } from "drizzle-orm";
import { db } from "./db";

let ready = false;
export const restaurantEventsSchemaReady = () => ready;

/** Additive pilot schema. Existing events, reservations and legacy advances are untouched. */
export async function ensureRestaurantEventsSchema() {
  await db.execute(
    sql.raw(`
 SELECT pg_advisory_xact_lock(hashtext('restaurant-events-schema-v1'));
 CREATE TABLE IF NOT EXISTS restaurant_events (
  event_id varchar PRIMARY KEY REFERENCES events(id), area_id varchar NOT NULL REFERENCES restaurant_areas(id),
  adult_price numeric(12,2) NOT NULL CHECK(adult_price>=0), child_price numeric(12,2) NOT NULL CHECK(child_price>=0),
  includes text NOT NULL, menu jsonb NOT NULL, capacity integer NOT NULL CHECK(capacity>0),
  created_at timestamptz NOT NULL DEFAULT now()
 );
 CREATE TABLE IF NOT EXISTS restaurant_event_bookings (
  reservation_id varchar PRIMARY KEY REFERENCES table_reservations(id), event_id varchar NOT NULL REFERENCES restaurant_events(event_id),
  adults integer NOT NULL CHECK(adults>=0), children integer NOT NULL CHECK(children>=0),
  adult_price numeric(12,2) NOT NULL, child_price numeric(12,2) NOT NULL, contracted_total numeric(12,2) NOT NULL,
  menu jsonb NOT NULL, includes text NOT NULL, created_at timestamptz NOT NULL DEFAULT now()
 );
 CREATE TABLE IF NOT EXISTS restaurant_event_assignments (
  reservation_id varchar NOT NULL REFERENCES restaurant_event_bookings(reservation_id),
  table_id varchar NOT NULL REFERENCES restaurant_tables(id), PRIMARY KEY(reservation_id,table_id)
 );
 CREATE TABLE IF NOT EXISTS restaurant_event_services (
  order_id varchar PRIMARY KEY REFERENCES restaurant_orders(id), reservation_id varchar NOT NULL REFERENCES restaurant_event_bookings(reservation_id),
  included_item_ids jsonb NOT NULL DEFAULT '[]'::jsonb, gross_total numeric(12,2), advance_applied numeric(12,2) NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(), UNIQUE(reservation_id)
 );
 CREATE TABLE IF NOT EXISTS restaurant_event_advance_applications (
  advance_id varchar NOT NULL REFERENCES restaurant_reservation_advances(id), order_id varchar NOT NULL REFERENCES restaurant_event_services(order_id),
  amount numeric(12,2) NOT NULL CHECK(amount>0), created_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY(advance_id,order_id)
 );
 CREATE TABLE IF NOT EXISTS restaurant_event_collections (
  advance_id varchar PRIMARY KEY REFERENCES restaurant_reservation_advances(id), cash_movement_id varchar NOT NULL REFERENCES cash_movements(id),
  operation_id uuid NOT NULL UNIQUE, invoice_request jsonb NOT NULL, invoice_id integer REFERENCES sales_invoices(id),
  document_status text NOT NULL DEFAULT 'pending', created_at timestamptz NOT NULL DEFAULT now()
 );
 CREATE TABLE IF NOT EXISTS restaurant_event_final_documents (
  order_id varchar PRIMARY KEY REFERENCES restaurant_event_services(order_id), operation_id uuid NOT NULL UNIQUE,
  invoice_request jsonb NOT NULL, invoice_id integer UNIQUE REFERENCES sales_invoices(id),
  document_status text NOT NULL DEFAULT 'pending', created_at timestamptz NOT NULL DEFAULT now()
 );
 CREATE TABLE IF NOT EXISTS restaurant_event_operations (
  id uuid PRIMARY KEY, kind text NOT NULL, request_hash text NOT NULL, result jsonb NOT NULL, created_at timestamptz NOT NULL DEFAULT now()
 );
 CREATE UNIQUE INDEX IF NOT EXISTS restaurant_event_collection_invoice_unique ON restaurant_event_collections(invoice_id) WHERE invoice_id IS NOT NULL;
 CREATE INDEX IF NOT EXISTS restaurant_event_bookings_event_idx ON restaurant_event_bookings(event_id);
 CREATE INDEX IF NOT EXISTS restaurant_event_assignments_table_idx ON restaurant_event_assignments(table_id);
 `),
  );
  ready = true;
}
