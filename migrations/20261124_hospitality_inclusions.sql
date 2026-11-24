-- Operational entitlements only: these tables/triggers never write charges,
-- stock, payments, invoices or room/cabin reservations. No historical backfill.
ALTER TABLE reservations ADD COLUMN IF NOT EXISTS hospitality_package_id varchar;
CREATE TABLE IF NOT EXISTS hospitality_inclusion_templates (
  owner_type text NOT NULL CHECK(owner_type IN ('package','treatment')),
  owner_id varchar NOT NULL, rules jsonb NOT NULL CHECK(jsonb_typeof(rules)='array'),
  revision integer NOT NULL DEFAULT 1, updated_by text NOT NULL, updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(owner_type,owner_id)
);
CREATE TABLE IF NOT EXISTS hospitality_included_sources (
  id text PRIMARY KEY, kind text NOT NULL CHECK(kind IN ('reservation','spa_appointment','spa_sale','supplement')),
  entity_id varchar NOT NULL, catalog_id varchar, title text NOT NULL,
  rules_snapshot jsonb NOT NULL CHECK(jsonb_typeof(rules_snapshot)='array'),
  active boolean NOT NULL DEFAULT true, manually_cancelled boolean NOT NULL DEFAULT false, created_at timestamptz NOT NULL DEFAULT now(), created_by text NOT NULL
);
CREATE INDEX IF NOT EXISTS hospitality_included_source_entity_idx ON hospitality_included_sources(kind,entity_id);
ALTER TABLE hospitality_included_sources ADD COLUMN IF NOT EXISTS manually_cancelled boolean NOT NULL DEFAULT false;
CREATE TABLE IF NOT EXISTS hospitality_included_services (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), source_id text NOT NULL REFERENCES hospitality_included_sources(id),
  rule_id text NOT NULL, slot text NOT NULL, area text NOT NULL CHECK(area IN ('restaurant','spa','reception')),
  service text NOT NULL, conditions text NOT NULL DEFAULT '', ready_when text NOT NULL,
  service_date date, valid_until date, quantity integer NOT NULL CHECK(quantity>0), used integer NOT NULL DEFAULT 0 CHECK(used>=0 AND used<=quantity),
  cancelled boolean NOT NULL DEFAULT false, needs_review boolean NOT NULL DEFAULT false,
  scheduled_at timestamptz, acknowledged_at timestamptz, note text NOT NULL DEFAULT '',
  version integer NOT NULL DEFAULT 1, UNIQUE(source_id,rule_id,slot)
);
CREATE INDEX IF NOT EXISTS hospitality_included_pending_idx ON hospitality_included_services(area,service_date) WHERE NOT cancelled AND used<quantity;
CREATE TABLE IF NOT EXISTS hospitality_included_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), service_id uuid REFERENCES hospitality_included_services(id),
  source_id text REFERENCES hospitality_included_sources(id), request_id uuid NOT NULL UNIQUE,
  action text NOT NULL, quantity integer NOT NULL DEFAULT 0, note text NOT NULL DEFAULT '',
  actor_id text NOT NULL, actor_name text NOT NULL, request_payload jsonb NOT NULL DEFAULT '{}'::jsonb, created_at timestamptz NOT NULL DEFAULT now()
);

CREATE OR REPLACE FUNCTION hospitality_reconcile_source(p_source text,p_start date,p_end date,p_people integer,p_units integer,p_cancelled boolean)
RETURNS void LANGUAGE plpgsql AS $$
DECLARE r jsonb; d date; s text; q integer; night_based boolean; start_date date; end_date date;
BEGIN
  -- The source row serializes reconciliation with fulfillment in the API.
  PERFORM 1 FROM hospitality_included_sources WHERE id=p_source FOR UPDATE;
  UPDATE hospitality_included_services SET cancelled=true,version=version+1 WHERE source_id=p_source AND NOT cancelled;
  IF p_cancelled THEN
    UPDATE hospitality_included_services SET needs_review=true WHERE source_id=p_source AND used>0;
    RETURN;
  END IF;
  FOR r IN SELECT value FROM jsonb_array_elements((SELECT rules_snapshot FROM hospitality_included_sources WHERE id=p_source)) LOOP
    night_based := r->>'basis' IN ('night','person_night');
    start_date:=p_start;
    end_date:=CASE WHEN night_based THEN p_end-1 ELSE p_start END;
    IF night_based AND (p_start IS NULL OR p_end IS NULL OR p_end<=p_start) THEN CONTINUE; END IF;
    d:=start_date;
    LOOP
      s:=CASE WHEN night_based THEN d::text ELSE 'once' END;
      q:=(r->>'quantity')::integer * greatest(p_units,1) * CASE WHEN r->>'basis' IN ('person','person_night') THEN greatest(p_people,1) ELSE 1 END;
      IF q>10000 THEN RAISE EXCEPTION 'Los servicios incluidos superan el máximo operativo'; END IF;
      INSERT INTO hospitality_included_services(source_id,rule_id,slot,area,service,conditions,ready_when,service_date,valid_until,quantity)
      VALUES(p_source,r->>'id',s,r->>'area',r->>'service',coalesce(r->>'conditions',''),r->>'readyWhen',d,CASE WHEN night_based THEN d ELSE p_end END,q)
      ON CONFLICT(source_id,rule_id,slot) DO UPDATE SET
        quantity=greatest(excluded.quantity,hospitality_included_services.used),
        needs_review=hospitality_included_services.used>excluded.quantity OR
          (hospitality_included_services.used>0 AND hospitality_included_services.service_date IS DISTINCT FROM excluded.service_date),
        service_date=CASE WHEN hospitality_included_services.used>0 THEN hospitality_included_services.service_date ELSE excluded.service_date END,
        valid_until=CASE WHEN hospitality_included_services.used>0 THEN hospitality_included_services.valid_until ELSE excluded.valid_until END,
        scheduled_at=CASE WHEN hospitality_included_services.service_date IS DISTINCT FROM excluded.service_date AND hospitality_included_services.used=0 THEN NULL ELSE hospitality_included_services.scheduled_at END,
        cancelled=false,version=hospitality_included_services.version+1;
      IF NOT night_based OR d>=end_date THEN EXIT; END IF;
      d:=d+1;
    END LOOP;
  END LOOP;
  UPDATE hospitality_included_services SET needs_review=true WHERE source_id=p_source AND cancelled AND used>0;
END $$;

CREATE OR REPLACE FUNCTION hospitality_source_changed() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE source_key text; rules jsonb; source_title text; owner text; catalog varchar; cancelled boolean; start_date date; end_date date; people integer:=1; units integer:=1; sale record; item record;
BEGIN
  IF TG_TABLE_NAME='reservations' THEN
    -- Suppress old package sources when the selected package changes. Supplements follow the stay.
    FOR item IN SELECT * FROM hospitality_included_sources WHERE entity_id=NEW.id AND kind IN ('reservation','supplement') FOR UPDATE LOOP
      cancelled:=item.manually_cancelled OR NEW.status IN ('cancelled','no_show') OR (item.kind='reservation' AND item.catalog_id IS DISTINCT FROM NEW.hospitality_package_id);
      UPDATE hospitality_included_sources SET active=NOT cancelled WHERE id=item.id;
      PERFORM hospitality_reconcile_source(item.id,NEW.check_in_date,NEW.check_out_date,NEW.number_of_guests,1,cancelled);
    END LOOP;
    catalog:=NEW.hospitality_package_id; IF catalog IS NULL THEN RETURN NEW; END IF;
    source_key:='reservation:'||NEW.id||':package:'||catalog; owner:='package';
    SELECT name INTO source_title FROM packages WHERE id=catalog;
    start_date:=NEW.check_in_date; end_date:=NEW.check_out_date; people:=NEW.number_of_guests;
    cancelled:=NEW.status IN ('cancelled','no_show');
  ELSIF TG_TABLE_NAME='spa_treatment_sales' THEN
    catalog:=NEW.treatment_id; source_key:='spa_sale:'||NEW.id; owner:='treatment';
    SELECT name INTO source_title FROM spa_treatments WHERE id=catalog;
    units:=NEW.quantity_purchased; cancelled:=NEW.status='cancelado';
  ELSE
    -- A prepaid sale is the entitlement source. Its appointment must never duplicate it.
    IF NEW.sold_treatment_sale_id IS NOT NULL THEN
      UPDATE hospitality_included_sources SET active=false WHERE kind='spa_appointment' AND entity_id=NEW.id;
      UPDATE hospitality_included_services SET cancelled=true,needs_review=used>0,version=version+1 WHERE source_id IN (SELECT id FROM hospitality_included_sources WHERE kind='spa_appointment' AND entity_id=NEW.id);
      RETURN NEW;
    END IF;
    catalog:=NEW.treatment_id; source_key:='spa_appointment:'||NEW.id||':treatment:'||catalog; owner:='treatment';
    SELECT name INTO source_title FROM spa_treatments WHERE id=catalog;
    start_date:=NEW.appointment_date; end_date:=NEW.appointment_date;
    cancelled:=NEW.status IN ('cancelled','no_show');
  END IF;
  IF TG_OP='UPDATE' AND NOT EXISTS(SELECT 1 FROM hospitality_included_sources WHERE id=source_key) THEN
    IF TG_TABLE_NAME='reservations' THEN
      IF OLD.hospitality_package_id IS NOT DISTINCT FROM NEW.hospitality_package_id THEN RETURN NEW; END IF;
    ELSIF TG_TABLE_NAME='spa_appointments' THEN
      IF OLD.treatment_id IS NOT DISTINCT FROM NEW.treatment_id THEN RETURN NEW; END IF;
    ELSE RETURN NEW;
    END IF;
  END IF;
  IF TG_TABLE_NAME='spa_appointments' THEN
    UPDATE hospitality_included_sources SET active=false WHERE kind='spa_appointment' AND entity_id=NEW.id AND id<>source_key;
    UPDATE hospitality_included_services SET cancelled=true,needs_review=used>0,version=version+1 WHERE source_id IN (SELECT id FROM hospitality_included_sources WHERE kind='spa_appointment' AND entity_id=NEW.id AND id<>source_key);
  END IF;
  IF source_title IS NULL AND NOT EXISTS(SELECT 1 FROM hospitality_included_sources WHERE id=source_key) THEN RAISE EXCEPTION 'No se encontró el producto de los incluidos'; END IF;
  SELECT t.rules INTO rules FROM hospitality_inclusion_templates t WHERE t.owner_type=owner AND t.owner_id=catalog;
  INSERT INTO hospitality_included_sources(id,kind,entity_id,catalog_id,title,rules_snapshot,active,created_by)
  VALUES(source_key,CASE TG_TABLE_NAME WHEN 'reservations' THEN 'reservation' WHEN 'spa_treatment_sales' THEN 'spa_sale' ELSE 'spa_appointment' END,NEW.id,catalog,coalesce(source_title,'Servicios incluidos'),coalesce(rules,'[]'::jsonb),NOT cancelled,'origen')
  ON CONFLICT(id) DO UPDATE SET active=excluded.active;
  PERFORM hospitality_reconcile_source(source_key,start_date,end_date,people,units,cancelled);
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS hospitality_reservation_change ON reservations;
CREATE TRIGGER hospitality_reservation_change AFTER INSERT OR UPDATE OF hospitality_package_id,check_in_date,check_out_date,number_of_guests,status ON reservations FOR EACH ROW EXECUTE FUNCTION hospitality_source_changed();
DROP TRIGGER IF EXISTS hospitality_spa_sale_change ON spa_treatment_sales;
CREATE TRIGGER hospitality_spa_sale_change AFTER INSERT OR UPDATE OF status,quantity_purchased ON spa_treatment_sales FOR EACH ROW EXECUTE FUNCTION hospitality_source_changed();
DROP TRIGGER IF EXISTS hospitality_spa_appointment_change ON spa_appointments;
CREATE TRIGGER hospitality_spa_appointment_change AFTER INSERT OR UPDATE OF status,appointment_date,treatment_id,sold_treatment_sale_id ON spa_appointments FOR EACH ROW EXECUTE FUNCTION hospitality_source_changed();
