\set ON_ERROR_STOP on
BEGIN ISOLATION LEVEL REPEATABLE READ;
SET LOCAL lock_timeout='10s';
SET LOCAL statement_timeout='90s';
SELECT pg_advisory_xact_lock(1296126535, 20261101);
LOCK TABLE sales_invoices,account_movements,account_movement_allocations,cash_movements,cash_closing_summaries,cc_invoice_tracking,cc_manual_tracking IN SHARE ROW EXCLUSIVE MODE;
CREATE TABLE IF NOT EXISTS sales_control_archive (
 kind text NOT NULL CHECK(kind IN ('invoice','account_movement','cash_movement','cash_closing','admin_cash','cc_manual')),
 record_id text NOT NULL,batch_id text NOT NULL,archived_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(kind,record_id)
);
-- Guard the entire original data set: only membership in the archive may change.
CREATE TEMP TABLE protected_snapshot(tab text PRIMARY KEY, fingerprint text) ON COMMIT DROP;
DO $$ DECLARE t text; f text; BEGIN
 FOREACH t IN ARRAY ARRAY['sales_invoices','account_movements','account_movement_allocations','cash_movements','cash_closing_summaries','cc_invoice_tracking','cc_manual_tracking','invoice_counters','billing_config','pos_configs','reservations','payments','charges','folios','folio_movements','groups','group_payments','group_charges','group_invoices','group_room_blocks','group_reservation_links','events','event_payments','event_charges','event_tables','event_table_charges','event_table_payments','spa_appointments','spa_accounts','spa_account_items','spa_payments','spa_treatment_sales','spa_treatments','gift_vouchers','gift_voucher_events','gift_voucher_applications','purchase_invoices','purchase_invoice_lines','payment_orders','payment_order_items','accounting_suppliers','accounting_entries','accounting_entry_lines','iibb_retentions','admin_cash_movements','admin_cash_arqueos','inventory_items','warehouse_stock','stock_movements','rate_plans','rooms','companies','agencies','guests'] LOOP
  EXECUTE format('SELECT md5(coalesce(string_agg(md5(row_to_json(x)::text),'''' ORDER BY md5(row_to_json(x)::text)),'''')) FROM public.%I x',t) INTO f;
  INSERT INTO protected_snapshot VALUES(t,f);
 END LOOP;
END $$;
-- No fiscal document, payment, voucher, service or amount is deleted/updated.
INSERT INTO sales_control_archive(kind,record_id,batch_id)
 SELECT 'invoice',id::text,'sales-opening-20261101' FROM sales_invoices
 ON CONFLICT DO NOTHING;
INSERT INTO sales_control_archive(kind,record_id,batch_id)
 SELECT 'account_movement',id::text,'sales-opening-20261101' FROM account_movements WHERE entity_type IN ('guest','company','agency')
 ON CONFLICT DO NOTHING;
INSERT INTO sales_control_archive(kind,record_id,batch_id)
 SELECT 'cash_movement',id::text,'sales-opening-20261101' FROM cash_movements
 WHERE movement_type IN ('income','informational','anulacion_reserva')
 OR source_type IN ('reservation','reservation_cancellation','reservation_checkout_no_charge','payment_void','group_payment','comprobante','comprobante_grupo','recibo_cta_cte','nota_credito','restaurant_order','restaurant_partial','spa_account','event')
 ON CONFLICT DO NOTHING;
INSERT INTO sales_control_archive(kind,record_id,batch_id)
 SELECT 'cash_closing',id::text,'sales-opening-20261101' FROM cash_closing_summaries
 ON CONFLICT DO NOTHING;
INSERT INTO sales_control_archive(kind,record_id,batch_id)
 SELECT 'cc_manual',id::text,'sales-opening-20261101' FROM cc_manual_tracking
 ON CONFLICT DO NOTHING;
DO $$ DECLARE r record; f text; BEGIN
 FOR r IN SELECT * FROM protected_snapshot LOOP
  EXECUTE format('SELECT md5(coalesce(string_agg(md5(row_to_json(x)::text),'''' ORDER BY md5(row_to_json(x)::text)),'''')) FROM public.%I x',r.tab) INTO f;
  IF f IS DISTINCT FROM r.fingerprint THEN RAISE EXCEPTION 'Protected table changed: %',r.tab; END IF;
 END LOOP;
 IF EXISTS(SELECT 1 FROM sales_invoices s WHERE NOT EXISTS(SELECT 1 FROM sales_control_archive a WHERE a.kind='invoice' AND a.record_id=s.id::text)) THEN RAISE EXCEPTION 'Active historical invoice remains'; END IF;
 IF EXISTS(SELECT 1 FROM account_movements m WHERE entity_type IN ('guest','company','agency') AND NOT EXISTS(SELECT 1 FROM sales_control_archive a WHERE a.kind='account_movement' AND a.record_id=m.id::text)) THEN RAISE EXCEPTION 'Current account remains active'; END IF;
END $$;
SELECT json_build_object('section','archive_result','kind',kind,'count',count(*))::text FROM sales_control_archive WHERE batch_id='sales-opening-20261101' GROUP BY kind ORDER BY kind;
SELECT json_build_object('section','integrity','protected_tables',(SELECT count(*) FROM protected_snapshot),'gift_vouchers',(SELECT count(*) FROM gift_vouchers),'spa_prepaid_sales',(SELECT count(*) FROM spa_treatment_sales),'active_invoice_count',(SELECT count(*) FROM sales_invoices s WHERE NOT EXISTS(SELECT 1 FROM sales_control_archive a WHERE a.kind='invoice' AND a.record_id=s.id::text)),'active_cc_count',(SELECT count(*) FROM account_movements m WHERE NOT EXISTS(SELECT 1 FROM sales_control_archive a WHERE a.kind='account_movement' AND a.record_id=m.id::text)))::text;
COMMIT;
