-- Explicit reviewed installation only. Never run by application startup.
CREATE TABLE IF NOT EXISTS payment_funding.fiscal_claims (
 operation_id uuid PRIMARY KEY REFERENCES payment_funding.operations(id),
 document_id text NOT NULL UNIQUE REFERENCES payment_funding.documents(id),
 claim_hash text NOT NULL, identity jsonb NOT NULL, invoice_id text NOT NULL UNIQUE,
 status text NOT NULL CHECK(status IN ('prepared','sending','unknown','authorized')),
 result jsonb, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE OR REPLACE FUNCTION payment_funding.guard_fiscal_claim() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF (NEW.operation_id,NEW.document_id,NEW.claim_hash,NEW.identity,NEW.invoice_id)
 IS DISTINCT FROM (OLD.operation_id,OLD.document_id,OLD.claim_hash,OLD.identity,OLD.invoice_id)
 OR (OLD.result IS NOT NULL AND NEW.result IS DISTINCT FROM OLD.result)
 OR (OLD.status='authorized' AND NEW.status<>'authorized')
 OR (NEW.status='authorized' AND NEW.result IS NULL)
 THEN RAISE EXCEPTION 'IMMUTABLE_FISCAL_IDENTITY' USING ERRCODE='23514'; END IF;
 RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS guard_fiscal_claim ON payment_funding.fiscal_claims;
CREATE TRIGGER guard_fiscal_claim BEFORE UPDATE ON payment_funding.fiscal_claims
 FOR EACH ROW EXECUTE FUNCTION payment_funding.guard_fiscal_claim();
DROP TRIGGER IF EXISTS immutable_identity ON payment_funding.fiscal_claims;
CREATE TRIGGER immutable_identity BEFORE DELETE ON payment_funding.fiscal_claims
 FOR EACH ROW EXECUTE FUNCTION payment_funding.immutable();
