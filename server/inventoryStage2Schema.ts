import {sql} from 'drizzle-orm';
import {db} from './db';
export async function ensureInventoryStage2Schema(){
 await db.execute(sql`CREATE TABLE IF NOT EXISTS inventory_unit_conversions (
 item_id varchar NOT NULL REFERENCES inventory_items(id), from_unit text NOT NULL,
 factor numeric(18,9) NOT NULL CHECK(factor>0), updated_at timestamp NOT NULL DEFAULT now(),
 PRIMARY KEY(item_id,from_unit))`);
 await db.execute(sql`CREATE TABLE IF NOT EXISTS inventory_consumption_jobs (
 id varchar PRIMARY KEY DEFAULT gen_random_uuid(), source_type text NOT NULL, source_id varchar NOT NULL,
 status text NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','completed','cancelled')),
 lines jsonb NOT NULL, error text, created_at timestamp NOT NULL DEFAULT now(), completed_at timestamp,
 actor varchar, UNIQUE(source_type,source_id))`);
 await db.execute(sql`ALTER TABLE purchase_invoice_lines ADD COLUMN IF NOT EXISTS input_unit text, ADD COLUMN IF NOT EXISTS stock_quantity numeric(10,3), ADD COLUMN IF NOT EXISTS stock_unit text`);
 await db.execute(sql`CREATE TABLE IF NOT EXISTS inventory_source_reversals(id varchar PRIMARY KEY DEFAULT gen_random_uuid(),source_type text NOT NULL,source_id varchar NOT NULL,reason text NOT NULL,actor varchar NOT NULL,created_at timestamp NOT NULL DEFAULT now(),completed_at timestamp,UNIQUE(source_type,source_id))`);
 await db.execute(sql`CREATE TABLE IF NOT EXISTS inventory_production_requests(request_id varchar PRIMARY KEY,payload jsonb NOT NULL,run_id varchar REFERENCES production_runs(id),created_at timestamp NOT NULL DEFAULT now())`);
 await db.execute(sql`CREATE INDEX IF NOT EXISTS inventory_consumption_jobs_pending_idx ON inventory_consumption_jobs(status,created_at)`);
}
