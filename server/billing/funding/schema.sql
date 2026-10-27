-- Explicit reviewed installation (homologation command or isolated tests).
-- NOT imported by startup or migrate.ts. No automatic operational adoption.
CREATE SCHEMA IF NOT EXISTS payment_funding;
CREATE TABLE IF NOT EXISTS payment_funding.scopes (
  kind text NOT NULL CHECK(kind IN ('reservation','spa')), id text NOT NULL,
  adopted_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY(kind,id)
);
CREATE TABLE IF NOT EXISTS payment_funding.receipts (
  id text PRIMARY KEY, scope_kind text NOT NULL, scope_id text NOT NULL,
  source_payment_id text NOT NULL, original_cents bigint NOT NULL CHECK(original_cents>0),
  effective_cents bigint NOT NULL CHECK(effective_cents>=0 AND effective_cents<=original_cents),
  method text NOT NULL, cash_movement_id text NOT NULL UNIQUE,
  folio_movement_id text NOT NULL UNIQUE, version bigint NOT NULL DEFAULT 1,
  UNIQUE(scope_kind,source_payment_id),
  FOREIGN KEY(scope_kind,scope_id) REFERENCES payment_funding.scopes(kind,id)
);
CREATE TABLE IF NOT EXISTS payment_funding.documents (
  id text PRIMARY KEY, scope_kind text NOT NULL, scope_id text NOT NULL,
  original_cents bigint NOT NULL CHECK(original_cents>0),
  total_cents bigint NOT NULL CHECK(total_cents>=0),
  snapshot jsonb NOT NULL, status text NOT NULL CHECK(status IN ('draft','authorized','issued')),
  invoice_id text UNIQUE, version bigint NOT NULL DEFAULT 1,
  FOREIGN KEY(scope_kind,scope_id) REFERENCES payment_funding.scopes(kind,id)
);
CREATE TABLE IF NOT EXISTS payment_funding.operations (
  id uuid PRIMARY KEY, scope_kind text NOT NULL, scope_id text NOT NULL,
  kind text NOT NULL CHECK(kind IN ('invoice','correction')), fingerprint text NOT NULL,
  request jsonb NOT NULL, claim jsonb NOT NULL,
  status text NOT NULL CHECK(status IN ('reserved','authorizing','fiscal_unknown','authorized_pending_link','applied','aborted')),
  actor_id text NOT NULL, invoice jsonb, result jsonb, last_error text,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY(scope_kind,scope_id) REFERENCES payment_funding.scopes(kind,id)
);
-- SPA full-account invoicing has exactly one live fiscal owner.
CREATE UNIQUE INDEX IF NOT EXISTS one_spa_fiscal_owner ON payment_funding.operations(scope_kind,scope_id)
 WHERE scope_kind='spa' AND kind='invoice' AND status<>'aborted';
CREATE UNIQUE INDEX IF NOT EXISTS one_document_fiscal_owner ON payment_funding.operations((request->>'documentId'))
 WHERE kind='invoice' AND status<>'aborted';
CREATE TABLE IF NOT EXISTS payment_funding.applications (
  id uuid PRIMARY KEY, receipt_id text NOT NULL REFERENCES payment_funding.receipts(id),
  document_id text NOT NULL REFERENCES payment_funding.documents(id),
  operation_id uuid REFERENCES payment_funding.operations(id),
  application_key text NOT NULL, amount_cents bigint NOT NULL CHECK(amount_cents>0),
  original_cents bigint NOT NULL CHECK(original_cents>0 AND amount_cents<=original_cents),
  status text NOT NULL CHECK(status IN ('held','applied','reversed')),
  origin text NOT NULL, UNIQUE(operation_id,application_key)
);
DO $$ BEGIN
 IF NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conrelid='payment_funding.applications'::regclass AND conname='application_original_cap') THEN
   ALTER TABLE payment_funding.applications ADD CONSTRAINT application_original_cap CHECK(amount_cents<=original_cents);
 END IF;
END $$;
CREATE TABLE IF NOT EXISTS payment_funding.events (
  seq bigserial PRIMARY KEY, operation_id uuid REFERENCES payment_funding.operations(id),
  event_key text NOT NULL UNIQUE, kind text NOT NULL, payload jsonb NOT NULL,
  actor_id text NOT NULL, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS payment_funding.collections (
  operation_id uuid NOT NULL REFERENCES payment_funding.operations(id), row_id text NOT NULL,
  receipt_id text NOT NULL UNIQUE REFERENCES payment_funding.receipts(id),
  PRIMARY KEY(operation_id,row_id)
);
CREATE TABLE IF NOT EXISTS payment_funding.settlements (
  operation_id uuid PRIMARY KEY REFERENCES payment_funding.operations(id),
  invoice_id text NOT NULL UNIQUE, result jsonb NOT NULL
);
CREATE TABLE IF NOT EXISTS payment_funding.shift_evidence (
  shift_id text PRIMARY KEY, summary_id text NOT NULL UNIQUE,
  original_summary jsonb NOT NULL, expected jsonb NOT NULL,
  physical_count_cents bigint CHECK(physical_count_cents>=0),
  evidence_ref text NOT NULL
);
CREATE TABLE IF NOT EXISTS payment_funding.rectifications (
  id uuid PRIMARY KEY, shift_id text NOT NULL REFERENCES payment_funding.shift_evidence(shift_id),
  revision int NOT NULL, operation_id uuid NOT NULL REFERENCES payment_funding.operations(id),
  delta jsonb NOT NULL, expected_after jsonb NOT NULL, physical_count_cents bigint,
  reason text NOT NULL, actor_id text NOT NULL, created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(shift_id,revision), UNIQUE(shift_id,operation_id)
);
CREATE OR REPLACE VIEW payment_funding.balances AS
 SELECT r.*,
 COALESCE(SUM(a.amount_cents) FILTER(WHERE a.status='applied'),0)::bigint AS applied_cents,
 COALESCE(SUM(a.amount_cents) FILTER(WHERE a.status='held'),0)::bigint AS held_cents,
 (r.effective_cents-COALESCE(SUM(a.amount_cents) FILTER(WHERE a.status IN ('held','applied')),0))::bigint AS free_cents
 FROM payment_funding.receipts r LEFT JOIN payment_funding.applications a ON a.receipt_id=r.id GROUP BY r.id;

-- Real aggregate guards, including for callers that bypass the TypeScript helper.
CREATE OR REPLACE FUNCTION payment_funding.guard_application() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE r payment_funding.receipts; d payment_funding.documents; used bigint;
BEGIN
 IF TG_OP='UPDATE' AND (
   (NEW.receipt_id,NEW.document_id,NEW.operation_id,NEW.application_key,NEW.original_cents,NEW.origin)
    IS DISTINCT FROM (OLD.receipt_id,OLD.document_id,OLD.operation_id,OLD.application_key,OLD.original_cents,OLD.origin)
   OR (OLD.status='reversed' AND NEW.status<>'reversed')
   OR (OLD.status='applied' AND NEW.status='held')
 ) THEN RAISE EXCEPTION 'IMMUTABLE_APPLICATION_ORIGIN' USING ERRCODE='23514'; END IF;
 SELECT * INTO STRICT r FROM payment_funding.receipts WHERE id=NEW.receipt_id FOR UPDATE;
 SELECT * INTO STRICT d FROM payment_funding.documents WHERE id=NEW.document_id FOR UPDATE;
 IF r.scope_kind<>d.scope_kind OR r.scope_id<>d.scope_id THEN
   RAISE EXCEPTION 'SCOPE_MISMATCH' USING ERRCODE='23514';
 END IF;
 IF NEW.status IN ('held','applied') THEN
   SELECT COALESCE(SUM(amount_cents),0) INTO used FROM payment_funding.applications
    WHERE receipt_id=r.id AND status IN ('held','applied') AND id<>NEW.id;
   IF used+NEW.amount_cents>r.effective_cents THEN RAISE EXCEPTION 'FUNDS_UNAVAILABLE' USING ERRCODE='23514'; END IF;
   SELECT COALESCE(SUM(amount_cents),0) INTO used FROM payment_funding.applications
    WHERE document_id=d.id AND status IN ('held','applied') AND id<>NEW.id;
   IF used+NEW.amount_cents>d.total_cents THEN RAISE EXCEPTION 'DOCUMENT_CAPACITY' USING ERRCODE='23514'; END IF;
 END IF;
 UPDATE payment_funding.receipts SET version=version+1 WHERE id=r.id;
 UPDATE payment_funding.documents SET version=version+1 WHERE id=d.id;
 RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS guard_application ON payment_funding.applications;
CREATE TRIGGER guard_application BEFORE INSERT OR UPDATE ON payment_funding.applications
 FOR EACH ROW EXECUTE FUNCTION payment_funding.guard_application();
CREATE OR REPLACE FUNCTION payment_funding.check_receipt() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE used bigint;
BEGIN
 SELECT COALESCE(SUM(amount_cents),0) INTO used FROM payment_funding.applications
  WHERE receipt_id=NEW.id AND status IN ('held','applied');
 IF used>NEW.effective_cents THEN RAISE EXCEPTION 'FUNDS_UNAVAILABLE' USING ERRCODE='23514'; END IF;
 RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS receipt_budget ON payment_funding.receipts;
CREATE CONSTRAINT TRIGGER receipt_budget AFTER UPDATE ON payment_funding.receipts
 DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION payment_funding.check_receipt();
CREATE OR REPLACE FUNCTION payment_funding.check_document() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE used bigint;
BEGIN
 SELECT COALESCE(SUM(amount_cents),0) INTO used FROM payment_funding.applications
  WHERE document_id=NEW.id AND status IN ('held','applied');
 IF used>NEW.total_cents THEN RAISE EXCEPTION 'DOCUMENT_CAPACITY' USING ERRCODE='23514'; END IF;
 RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS document_budget ON payment_funding.documents;
CREATE CONSTRAINT TRIGGER document_budget AFTER UPDATE ON payment_funding.documents
 DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION payment_funding.check_document();
CREATE OR REPLACE FUNCTION payment_funding.immutable() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'IMMUTABLE_AUDIT' USING ERRCODE='23514'; END $$;
DROP TRIGGER IF EXISTS immutable ON payment_funding.events;
CREATE TRIGGER immutable BEFORE UPDATE OR DELETE ON payment_funding.events FOR EACH ROW EXECUTE FUNCTION payment_funding.immutable();
DROP TRIGGER IF EXISTS immutable ON payment_funding.rectifications;
CREATE TRIGGER immutable BEFORE UPDATE OR DELETE ON payment_funding.rectifications FOR EACH ROW EXECUTE FUNCTION payment_funding.immutable();
DROP TRIGGER IF EXISTS immutable ON payment_funding.shift_evidence;
CREATE TRIGGER immutable BEFORE UPDATE OR DELETE ON payment_funding.shift_evidence FOR EACH ROW EXECUTE FUNCTION payment_funding.immutable();
CREATE OR REPLACE FUNCTION payment_funding.guard_operation() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF (NEW.fingerprint,NEW.request,NEW.claim,NEW.scope_kind,NEW.scope_id,NEW.actor_id)
 IS DISTINCT FROM (OLD.fingerprint,OLD.request,OLD.claim,OLD.scope_kind,OLD.scope_id,OLD.actor_id)
 THEN RAISE EXCEPTION 'IMMUTABLE_OPERATION_CLAIM' USING ERRCODE='23514'; END IF;
 IF OLD.invoice IS NOT NULL AND NEW.invoice IS DISTINCT FROM OLD.invoice
 THEN RAISE EXCEPTION 'IMMUTABLE_AUTHORIZATION' USING ERRCODE='23514'; END IF;
 IF NEW.status<>OLD.status AND NOT (
  (OLD.status='reserved' AND NEW.status IN ('authorizing','aborted','applied')) OR
  (OLD.status='authorizing' AND NEW.status IN ('fiscal_unknown','authorized_pending_link')) OR
  (OLD.status='fiscal_unknown' AND NEW.status IN ('authorized_pending_link','aborted')) OR
  (OLD.status='authorized_pending_link' AND NEW.status='applied')
 ) THEN RAISE EXCEPTION 'INVALID_OPERATION_TRANSITION' USING ERRCODE='23514'; END IF;
 RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS guard_operation ON payment_funding.operations;
CREATE TRIGGER guard_operation BEFORE UPDATE ON payment_funding.operations FOR EACH ROW EXECUTE FUNCTION payment_funding.guard_operation();
CREATE OR REPLACE FUNCTION payment_funding.guard_document_origin() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF (NEW.snapshot,NEW.original_cents,NEW.scope_kind,NEW.scope_id) IS DISTINCT FROM
    (OLD.snapshot,OLD.original_cents,OLD.scope_kind,OLD.scope_id)
    OR (OLD.invoice_id IS NOT NULL AND NEW.invoice_id IS DISTINCT FROM OLD.invoice_id)
 THEN RAISE EXCEPTION 'IMMUTABLE_DOCUMENT_ORIGIN' USING ERRCODE='23514'; END IF;
 RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS document_origin ON payment_funding.documents;
CREATE TRIGGER document_origin BEFORE UPDATE ON payment_funding.documents FOR EACH ROW EXECUTE FUNCTION payment_funding.guard_document_origin();
