-- Selected room charge presets can grant operational services. Existing charges
-- are untouched. Financial amounts, payments and invoices remain authoritative.
ALTER TABLE charge_types ADD COLUMN IF NOT EXISTS hospitality_rules jsonb NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE charges ADD COLUMN IF NOT EXISTS charge_type_id varchar;
ALTER TABLE charges ADD COLUMN IF NOT EXISTS hospitality_units integer;
ALTER TABLE charges ADD COLUMN IF NOT EXISTS hospitality_rules_snapshot jsonb;
ALTER TABLE charges ADD COLUMN IF NOT EXISTS hospitality_request_id varchar;
ALTER TABLE charges ADD COLUMN IF NOT EXISTS hospitality_creation_snapshot jsonb;
CREATE UNIQUE INDEX IF NOT EXISTS charges_hospitality_request_idx ON charges(hospitality_request_id) WHERE hospitality_request_id IS NOT NULL;

CREATE OR REPLACE FUNCTION hospitality_reconcile_room_charge(p_charge varchar) RETURNS void LANGUAGE plpgsql AS $$
DECLARE c record; r record; prior record; source_key text; rules jsonb; cancelled boolean; until_date date; operator text; actor text;
BEGIN
 SELECT * INTO c FROM charges WHERE id=p_charge;
 SELECT * INTO prior FROM hospitality_included_sources WHERE origin_charge_id=p_charge FOR UPDATE;
 IF NOT FOUND AND (c.id IS NULL OR c.hospitality_rules_snapshot IS NULL OR jsonb_array_length(c.hospitality_rules_snapshot)=0) THEN RETURN; END IF;
 source_key:='room_charge:'||p_charge;
 -- Moving a debt to another payer does not move the service's beneficiary.
 SELECT * INTO r FROM reservations WHERE id=coalesce(prior.entity_id,c.reservation_id);
 IF r.id IS NULL THEN RETURN; END IF;
 IF c.id IS NULL THEN
  UPDATE hospitality_included_sources SET active=false WHERE id=prior.id;
  PERFORM hospitality_reconcile_source(prior.id,NULL,NULL,1,1,true);
  RETURN;
 END IF;
 cancelled:=c.id IS NULL OR c.status='anulado' OR r.status IN ('cancelled','no_show');
 SELECT coalesce(jsonb_agg(rule || jsonb_build_object('basis',CASE WHEN c.is_recurring THEN 'night' ELSE 'stay' END,
   'quantity',(rule->>'quantity')::integer * CASE WHEN c.is_recurring THEN 1 ELSE coalesce(c.hospitality_units,1) END)),'[]'::jsonb)
 INTO rules FROM jsonb_array_elements(coalesce(c.hospitality_rules_snapshot,prior.rules_snapshot,'[]'::jsonb)) rule;
 operator:=coalesce(nullif(current_setting('hospitality.actor_name',true),''),c.anulado_por,c.created_by,'Sistema');
 actor:=coalesce(nullif(current_setting('hospitality.actor_id',true),''),c.created_by,'Sistema');
 IF prior.id IS NULL THEN
  INSERT INTO hospitality_included_sources(id,kind,entity_id,title,rules_snapshot,created_by,origin_charge_id)
   VALUES(source_key,'supplement',r.id,c.description,rules,operator,p_charge);
 ELSE
  UPDATE hospitality_included_sources SET rules_snapshot=rules WHERE id=source_key;
 END IF;
 UPDATE hospitality_included_sources SET active=NOT cancelled WHERE id=source_key;
 -- Recurring benefits follow the units actually charged, never an unpaid extra
 -- night after an invoice has frozen the original charge's unit count.
 until_date:=CASE WHEN c.is_recurring THEN least(r.check_out_date,r.check_in_date+coalesce(c.hospitality_units,1)) ELSE r.check_out_date END;
 PERFORM hospitality_reconcile_source(source_key,r.check_in_date,until_date,1,1,cancelled);
END $$;

CREATE OR REPLACE FUNCTION hospitality_room_charge_changed() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE source_key text; actor text; operator text; action text;
BEGIN
 IF TG_OP='DELETE' THEN
  PERFORM hospitality_reconcile_room_charge(OLD.id);
  RETURN OLD;
 END IF;
 IF TG_OP='UPDATE' AND NEW.hospitality_rules_snapshot IS DISTINCT FROM OLD.hospitality_rules_snapshot THEN
  RAISE EXCEPTION 'La configuración vendida del cargo debe conservarse';
 END IF;
 IF TG_OP='UPDATE' AND NEW.charge_type_id IS DISTINCT FROM OLD.charge_type_id THEN
  RAISE EXCEPTION 'El concepto original del cargo debe conservarse';
 END IF;
 IF coalesce(jsonb_array_length(NEW.hospitality_rules_snapshot),0)=0 THEN RETURN NEW; END IF;
 IF NEW.hospitality_units IS NULL OR NEW.hospitality_units<1 OR NEW.hospitality_units>10000 THEN RAISE EXCEPTION 'Cantidad de servicios inválida'; END IF;
 PERFORM hospitality_reconcile_room_charge(NEW.id);
 IF TG_OP='INSERT' OR NEW.status IS DISTINCT FROM OLD.status OR NEW.hospitality_units IS DISTINCT FROM OLD.hospitality_units OR NEW.amount IS DISTINCT FROM OLD.amount THEN
  source_key:='room_charge:'||NEW.id;
  operator:=coalesce(nullif(current_setting('hospitality.actor_name',true),''),NEW.anulado_por,NEW.created_by,'Sistema');
  actor:=coalesce(nullif(current_setting('hospitality.actor_id',true),''),NEW.created_by,'Sistema');
  action:=CASE WHEN TG_OP='INSERT' THEN 'charge_created' WHEN NEW.status='anulado' THEN 'charge_voided' ELSE 'charge_updated' END;
  INSERT INTO hospitality_included_events(source_id,request_id,action,note,actor_id,actor_name,request_payload)
   VALUES(source_key,gen_random_uuid(),action,coalesce(NEW.motivo_anulacion,NEW.description),actor,operator,jsonb_build_object('chargeId',NEW.id,'units',NEW.hospitality_units));
 END IF;
 RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS hospitality_room_charge_change ON charges;
CREATE TRIGGER hospitality_room_charge_change AFTER INSERT OR DELETE OR UPDATE OF status,hospitality_units,hospitality_rules_snapshot,charge_type_id,reservation_id,amount ON charges FOR EACH ROW EXECUTE FUNCTION hospitality_room_charge_changed();

CREATE OR REPLACE FUNCTION hospitality_charge_stay_changed() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE item record;
BEGIN
 FOR item IN SELECT origin_charge_id FROM hospitality_included_sources WHERE entity_id=NEW.id AND origin_charge_id IS NOT NULL ORDER BY origin_charge_id LOOP
  PERFORM hospitality_reconcile_room_charge(item.origin_charge_id);
  IF TG_OP='UPDATE' AND NEW.status='checked_in' AND OLD.status IS DISTINCT FROM NEW.status THEN
   UPDATE hospitality_included_services SET acknowledged_at=NULL,version=version+1 WHERE source_id='room_charge:'||item.origin_charge_id AND NOT cancelled AND used<quantity AND ready_when='arrival';
  END IF;
 END LOOP;
 RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS hospitality_charge_stay_change ON reservations;
CREATE TRIGGER hospitality_charge_stay_change AFTER UPDATE OF check_in_date,check_out_date,status ON reservations FOR EACH ROW EXECUTE FUNCTION hospitality_charge_stay_changed();
