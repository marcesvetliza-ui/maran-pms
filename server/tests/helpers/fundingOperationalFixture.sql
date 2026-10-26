-- ONLY after installSyntheticSchema checks DB name and Unix socket.
CREATE SEQUENCE IF NOT EXISTS funding_demo.binding_invoice_ids START 900000001;
CREATE SEQUENCE IF NOT EXISTS funding_demo.binding_pvs START 100;
ALTER TABLE funding_demo.sales_invoices ALTER COLUMN id SET DEFAULT nextval('funding_demo.binding_invoice_ids');
ALTER TABLE funding_demo.sales_invoices
 ADD COLUMN IF NOT EXISTS tipo_comprobante text, ADD COLUMN IF NOT EXISTS punto_venta int,
 ADD COLUMN IF NOT EXISTS numero int, ADD COLUMN IF NOT EXISTS fecha_emision date,
 ADD COLUMN IF NOT EXISTS cliente_razon_social text, ADD COLUMN IF NOT EXISTS cliente_cuit text,
 ADD COLUMN IF NOT EXISTS cliente_dni text, ADD COLUMN IF NOT EXISTS cliente_document_type text,
 ADD COLUMN IF NOT EXISTS cliente_condicion_iva text, ADD COLUMN IF NOT EXISTS cliente_domicilio text,
 ADD COLUMN IF NOT EXISTS monto_neto numeric, ADD COLUMN IF NOT EXISTS monto_iva21 numeric,
 ADD COLUMN IF NOT EXISTS monto_iva105 numeric, ADD COLUMN IF NOT EXISTS monto_exento numeric,
 ADD COLUMN IF NOT EXISTS monto_no_gravado numeric, ADD COLUMN IF NOT EXISTS monto_total numeric,
 ADD COLUMN IF NOT EXISTS modo_ficticio bool, ADD COLUMN IF NOT EXISTS folio_id text,
 ADD COLUMN IF NOT EXISTS items jsonb, ADD COLUMN IF NOT EXISTS operador text,
 ADD COLUMN IF NOT EXISTS cash_forma_pago_detalle jsonb, ADD COLUMN IF NOT EXISTS cae text,
 ADD COLUMN IF NOT EXISTS cae_fecha_vto date, ADD COLUMN IF NOT EXISTS nota_credito_id int,
 ADD COLUMN IF NOT EXISTS monto_acreditado numeric DEFAULT 0, ADD COLUMN IF NOT EXISTS payment_id text;
CREATE UNIQUE INDEX IF NOT EXISTS binding_fiscal_series ON funding_demo.sales_invoices(tipo_comprobante,punto_venta,numero);
ALTER TABLE funding_demo.spa_accounts ADD COLUMN IF NOT EXISTS subtotal numeric,
 ADD COLUMN IF NOT EXISTS total numeric, ADD COLUMN IF NOT EXISTS closed_by text;
ALTER TABLE funding_demo.spa_account_items ADD COLUMN IF NOT EXISTS quantity int DEFAULT 1,
 ADD COLUMN IF NOT EXISTS unit_price numeric DEFAULT 95000, ADD COLUMN IF NOT EXISTS item_type text DEFAULT 'treatment',
 ADD COLUMN IF NOT EXISTS inventory_item_id text;
ALTER TABLE funding_demo.cash_shifts ADD COLUMN IF NOT EXISTS opened_by text;
CREATE TABLE IF NOT EXISTS funding_demo.guests(id text PRIMARY KEY,first_name text,last_name text,
 vat_condition text,cuil_cuit text,document_number text,document_type text,direccion text);
CREATE TABLE IF NOT EXISTS funding_demo.spa_clients(LIKE funding_demo.guests INCLUDING ALL);
CREATE TABLE IF NOT EXISTS funding_demo.spa_appointments(id text PRIMARY KEY,guest_id text,treatment_id text,status text);
CREATE TABLE IF NOT EXISTS funding_demo.spa_treatments(id text PRIMARY KEY);
CREATE TABLE IF NOT EXISTS funding_demo.treatment_supplies(id text PRIMARY KEY,treatment_id text,
 inventory_item_id text,quantity numeric,unit text);
CREATE TABLE IF NOT EXISTS funding_demo.billing_config(id int PRIMARY KEY,arca_ambiente text,arca_cuit text,
 cuit text,punto_venta_homolog int);
INSERT INTO funding_demo.billing_config VALUES(1,'homologacion','20111111112',NULL,99) ON CONFLICT(id) DO NOTHING;
CREATE TABLE IF NOT EXISTS funding_demo.pos_configs(id int PRIMARY KEY,numero int,area text,activo bool,tipo text);
ALTER TABLE funding_demo.billing_config ADD COLUMN IF NOT EXISTS arca_cert text,
 ADD COLUMN IF NOT EXISTS arca_key text;
UPDATE funding_demo.billing_config SET arca_cert='SYNTHETIC_NOT_A_CERTIFICATE',arca_key='SYNTHETIC_NOT_A_KEY' WHERE id=1;
INSERT INTO funding_demo.pos_configs VALUES(1,3,'spa',true,'electronico') ON CONFLICT(id) DO UPDATE SET tipo=excluded.tipo;
CREATE TABLE IF NOT EXISTS funding_demo.provider_authorizations(identity_key text PRIMARY KEY,cae text,expiry timestamptz);
CREATE TABLE IF NOT EXISTS funding_demo.inventory_items(id text PRIMARY KEY,name text,is_active text,unit text,current_stock numeric,cost_price numeric);
CREATE TABLE IF NOT EXISTS funding_demo.inventory_warehouses(id text PRIMARY KEY,is_active text);
CREATE TABLE IF NOT EXISTS funding_demo.warehouse_stock(item_id text,warehouse_id text,current_stock numeric,
 updated_at timestamp,PRIMARY KEY(item_id,warehouse_id));
CREATE TABLE IF NOT EXISTS funding_demo.inventory_unit_conversions(item_id text,from_unit text,factor numeric);
CREATE TABLE IF NOT EXISTS funding_demo.production_runs(id text PRIMARY KEY,output_inventory_item_id text);
CREATE TABLE IF NOT EXISTS funding_demo.stock_movements(id text DEFAULT gen_random_uuid()::text,source_type text,source_id text);
ALTER TABLE funding_demo.stock_movements
 ADD COLUMN IF NOT EXISTS item_id text,ADD COLUMN IF NOT EXISTS movement_type text,
 ADD COLUMN IF NOT EXISTS quantity numeric,ADD COLUMN IF NOT EXISTS previous_stock numeric,
 ADD COLUMN IF NOT EXISTS new_stock numeric,ADD COLUMN IF NOT EXISTS notes text,
 ADD COLUMN IF NOT EXISTS created_at timestamp,ADD COLUMN IF NOT EXISTS created_by text,
 ADD COLUMN IF NOT EXISTS warehouse_id text,ADD COLUMN IF NOT EXISTS to_warehouse_id text;
ALTER TABLE funding_demo.stock_movements ALTER COLUMN id SET DEFAULT gen_random_uuid()::text;
CREATE TABLE IF NOT EXISTS funding_demo.inventory_consumption_jobs(source_type text,source_id text,status text DEFAULT 'pending');
ALTER TABLE funding_demo.inventory_consumption_jobs
 ADD COLUMN IF NOT EXISTS id text DEFAULT gen_random_uuid()::text,
 ADD COLUMN IF NOT EXISTS lines jsonb,ADD COLUMN IF NOT EXISTS actor text,
 ADD COLUMN IF NOT EXISTS error text,ADD COLUMN IF NOT EXISTS completed_at timestamp;
ALTER TABLE funding_demo.inventory_consumption_jobs ALTER COLUMN status SET DEFAULT 'pending';
CREATE UNIQUE INDEX IF NOT EXISTS binding_job_source ON funding_demo.inventory_consumption_jobs(source_type,source_id);
CREATE TABLE IF NOT EXISTS funding_demo.inventory_source_reversals(id text,source_type text,source_id text,completed_at timestamp);
CREATE TABLE IF NOT EXISTS funding_demo.audit_logs(id text DEFAULT gen_random_uuid()::text,
 user_id text,action text,module text,entity_type text,entity_id text,description text,details text,timestamp timestamp);
ALTER TABLE funding_demo.spa_accounts ADD COLUMN IF NOT EXISTS reservation_id text;
ALTER TABLE funding_demo.spa_account_items ADD COLUMN IF NOT EXISTS created_at timestamp DEFAULT now();
ALTER TABLE funding_demo.folio_movements ADD COLUMN IF NOT EXISTS created_at timestamp DEFAULT now(),
 ADD COLUMN IF NOT EXISTS related_folio_id text,ADD COLUMN IF NOT EXISTS void_reason text;
CREATE TABLE IF NOT EXISTS funding_demo.rooms(id text PRIMARY KEY,room_number text);
CREATE TABLE IF NOT EXISTS funding_demo.reservations(id text PRIMARY KEY,status text,room_id text,guest_id text);
CREATE TABLE IF NOT EXISTS funding_demo.charges(id text PRIMARY KEY,reservation_id text,description text,amount numeric,date date,category text,created_by text,status text);
ALTER TABLE funding_demo.inventory_items ADD COLUMN IF NOT EXISTS item_kind text DEFAULT 'materia_prima';
CREATE TABLE IF NOT EXISTS funding_demo.item_categories(id text PRIMARY KEY,area text,is_active text);
INSERT INTO funding_demo.item_categories VALUES('synthetic-spa','spa','true') ON CONFLICT DO NOTHING;
ALTER TABLE funding_demo.inventory_items ADD COLUMN IF NOT EXISTS category_id text DEFAULT 'synthetic-spa',ADD COLUMN IF NOT EXISTS iva_rate text DEFAULT '21';
CREATE TABLE IF NOT EXISTS funding_demo.companies(id text PRIMARY KEY,razon_social text,cuil_cuit text,condicion_iva text,direccion text);
ALTER TABLE funding_demo.sales_invoices ADD COLUMN IF NOT EXISTS observaciones text;

ALTER TABLE funding_demo.charges ADD COLUMN IF NOT EXISTS anulado_por text,ADD COLUMN IF NOT EXISTS motivo_anulacion text,ADD COLUMN IF NOT EXISTS anulado_at timestamp;
ALTER TABLE funding_demo.sales_invoices ADD COLUMN IF NOT EXISTS source_charge_ids jsonb,ADD COLUMN IF NOT EXISTS source_charge_amounts jsonb;
ALTER TABLE funding_demo.payments ADD COLUMN IF NOT EXISTS anulado_por text;
ALTER TABLE funding_demo.payments ADD COLUMN IF NOT EXISTS invoice_link_failed boolean DEFAULT false;
ALTER TABLE funding_demo.sales_invoices ADD COLUMN IF NOT EXISTS credit_reapplication_intent jsonb,
 ADD COLUMN IF NOT EXISTS reconciliation_status text,ADD COLUMN IF NOT EXISTS reconciliation_error text,
 ADD COLUMN IF NOT EXISTS reconciliation_updated_at timestamp;

CREATE TABLE IF NOT EXISTS funding_demo.reservation_changelog(id bigserial PRIMARY KEY,reservation_id text,fecha timestamp DEFAULT now(),operador text,tipo text,descripcion text);

CREATE TABLE IF NOT EXISTS funding_demo.invoice_counters(tipo_comprobante text,punto_venta int,ultimo_numero int,PRIMARY KEY(tipo_comprobante,punto_venta));
