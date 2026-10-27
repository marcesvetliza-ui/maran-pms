-- Synthetic operational-shaped tables. No public/operational tables or credentials.
CREATE SCHEMA IF NOT EXISTS funding_demo;
CREATE SEQUENCE IF NOT EXISTS funding_demo.cash_movements_receipt_number_seq;
CREATE SEQUENCE IF NOT EXISTS funding_demo.invoice_number_seq START 80000001;
CREATE TABLE IF NOT EXISTS funding_demo.cash_shifts(
 id text PRIMARY KEY,area text NOT NULL,status text NOT NULL,shift_number int NOT NULL DEFAULT 1,
 opened_at timestamptz DEFAULT now(),closed_at timestamptz
);
CREATE TABLE IF NOT EXISTS funding_demo.cash_movements(
 id text PRIMARY KEY,shift_id text,area text,source_type text,source_id text,source_label text,
 payment_method text,amount numeric(12,2),movement_type text,receipt_type text,receipt_number text,
 payment_id text,registered_by text,created_at timestamptz DEFAULT now(),
 anulado boolean NOT NULL DEFAULT false,motivo_anulacion text,anulado_por text,anulado_at timestamptz
);
CREATE TABLE IF NOT EXISTS funding_demo.cash_closing_summaries(
 id text PRIMARY KEY,shift_id text,total_cash numeric(12,2),total_debit_card numeric(12,2),
 total_credit_card numeric(12,2),total_general numeric(12,2),closed_at timestamptz DEFAULT now()
);
CREATE TABLE IF NOT EXISTS funding_demo.folios(
 id text PRIMARY KEY,entity_type text,entity_id text,status text,
 total_charges numeric(12,2),total_payments numeric(12,2),balance numeric(12,2),
 closed_at timestamptz,closed_by text
);
ALTER TABLE funding_demo.folios ADD COLUMN IF NOT EXISTS codigo text;
CREATE TABLE IF NOT EXISTS funding_demo.folio_movements(
 id text PRIMARY KEY,folio_id text,type text,amount numeric(12,2),description text,source_type text,
 source_id text,payment_method text,cash_movement_id text,registered_by text,voided_movement_id text
);
CREATE TABLE IF NOT EXISTS funding_demo.payments(
 id text PRIMARY KEY,reservation_id text,amount numeric(12,2),method text,date date,status text DEFAULT 'active',
 notes text,invoice_ref text,payment_request_id text UNIQUE,received_by text,motivo_anulacion text,anulado_at timestamptz
);
CREATE TABLE IF NOT EXISTS funding_demo.spa_accounts(
 id text PRIMARY KEY,appointment_id text,guest_name text,status text,total_paid numeric(12,2),charged_to text,
 invoice_id int,receipt_type text,closed_at timestamptz
);
CREATE TABLE IF NOT EXISTS funding_demo.spa_account_items(
 id text PRIMARY KEY,account_id text,description text,subtotal numeric(12,2)
);
CREATE TABLE IF NOT EXISTS funding_demo.spa_payments(
 id text PRIMARY KEY,account_id text,amount numeric(12,2),method text,created_at timestamptz,
 status text DEFAULT 'active',is_advance text,notes text,motivo_anulacion text,anulado_at timestamptz
);
CREATE TABLE IF NOT EXISTS funding_demo.sales_invoices(
 id int PRIMARY KEY,estado text NOT NULL,reserva_id text,spa_account_id text
);
CREATE TABLE IF NOT EXISTS funding_demo.inventory_closures(
 account_id text PRIMARY KEY,actor_id text NOT NULL,created_at timestamptz DEFAULT now()
);
-- A separate durable provider-side commit models the external fiscal authority.
CREATE TABLE IF NOT EXISTS funding_demo.fiscal_authorizations(
 operation_id uuid PRIMARY KEY,claim_hash text NOT NULL,result jsonb,outcome text NOT NULL
);
