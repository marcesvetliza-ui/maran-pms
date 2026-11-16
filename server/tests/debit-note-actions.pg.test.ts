import express from "express";
import type { Server } from "node:http";
import { randomUUID } from "node:crypto";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

const issuance = vi.hoisted(() => ({ calls: 0 }));
vi.mock("../billing/billingConfig", async importOriginal => {
  const actual = await importOriginal<typeof import("../billing/billingConfig")>();
  return { ...actual, getBillingConfig: async () => ({ ...await actual.getBillingConfig(), arcaAmbiente: "ficticio" }) };
});
vi.mock("../billing/invoiceService", async importOriginal => {
  const actual = await importOriginal<typeof import("../billing/invoiceService")>();
  return { ...actual, emitirFactura: async (data: any) => { issuance.calls++; return actual.emitirFactura(data); } };
});

const url = process.env.DATABASE_URL;
const enabled = !!url && process.env.ALLOW_DESTRUCTIVE_PG_TESTS === "true";
if (enabled && (!['127.0.0.1', 'localhost'].includes(new URL(url!).hostname) || !/test/.test(new URL(url!).pathname))) throw Error("Disposable local test database required");
const pool = enabled ? new pg.Pool({ connectionString: url }) : null;
let server: Server, base: string;
type Fixture = { id: string; point: number; sale: number; credit: number; debit: number; folio: string; payment: string; kind: "restoration" | "additional" };
const items = [{ descripcion: "Synthetic service", cantidad: 1, precioUnitario: 10000, alicuotaIva: "no_gravado", subtotalNeto: 10000, subtotal: 10000 }];

async function fixture(kind: Fixture['kind'] = 'restoration', type = 'NDB'): Promise<Fixture> {
  const id = `nd-actions-${randomUUID()}`, folio = id + '-folio', payment = id + '-payment';
  const point = 8000000 + Math.floor(Math.random() * 1000000);
  await pool!.query("INSERT INTO pos_configs(numero,nombre,area,activo,tipo) VALUES($1,$2,'recepcion',true,'electronico')", [point,id]);
  await pool!.query("INSERT INTO room_types(id,code,name) VALUES($1::text,$1::text,'Synthetic suite')", [id]);
  await pool!.query("INSERT INTO rooms(id,room_number,room_type_id,status) VALUES($1::text,$1::text,$1::text,'occupied')", [id]);
  await pool!.query("INSERT INTO guests(id,first_name,last_name) VALUES($1,'Synthetic','Debit')", [id]);
  await pool!.query("INSERT INTO reservations(id,reservation_code,guest_id,room_type_id,room_id,check_in_date,check_out_date,nights,status,total_room_amount,created_at) VALUES($1::text,$1::text,$1::text,$1::text,$1::text,CURRENT_DATE-1,CURRENT_DATE,1,'checked_in',10000,NOW())", [id]);
  await pool!.query("INSERT INTO folios(id,codigo,entity_type,entity_id,status,total_charges,total_payments,balance) VALUES($1::text,$1::text,'reservation',$2,'open',$3,10000,$4)", [folio,id,kind === 'additional' ? 20000 : 10000,kind === 'additional' ? 10000 : 0]);
  await pool!.query("INSERT INTO folio_movements(id,folio_id,type,amount,description,source_type,source_id) VALUES($1,$2,'charge',10000,'Original charge','room',$3)", [id+'-room',folio,id]);
  const saleType: Record<string,string> = {NDA:'FA',NDB:'FB',NDC:'FC',NDT:'FT',NDM:'FM',NDMB:'FMB'};
  const creditType: Record<string,string> = {NDA:'NCA',NDB:'NCB',NDC:'NCC',NDT:'NCT',NDM:'NCM',NDMB:'NCMB'};
  async function invoice(fiscalType: string, number: number, credited: number, status: string, parent?: number) {
    const r = await pool!.query(`INSERT INTO sales_invoices(tipo_comprobante,punto_venta,numero,fecha_emision,cliente_razon_social,cliente_condicion_iva,cliente_cuit,monto_neto,monto_total,monto_acreditado,estado,modo_ficticio,reserva_id,nota_credito_id,reconciliation_status,items,source_charge_ids,source_charge_amounts,cash_forma_pago)
      VALUES($1,$2,$3,CURRENT_DATE,'Synthetic receiver','Consumidor Final',NULL,10000,10000,$4,$5,true,$6,$7,'conciliada',$8,$9,$10,'tarjeta_debito') RETURNING id`,
    [fiscalType,point,number,credited,status,id,parent??null,JSON.stringify(items),JSON.stringify(['extra']),JSON.stringify({extra:10000})]);
    return Number(r.rows[0].id);
  }
  const sale = await invoice(saleType[type],1,0,'emitida');
  const credit = kind === 'restoration' ? await invoice(creditType[type],1,10000,'anulada',sale) : 0;
  const debit = await invoice(type,1,0,'emitida',credit || sale);
  if (credit) await pool!.query("UPDATE sales_invoices SET nota_credito_id=$2 WHERE id=$1", [sale,credit]);
  if (kind === 'additional') await pool!.query("INSERT INTO folio_movements(id,folio_id,type,amount,description,source_type,source_id) VALUES($1,$2,'charge',10000,'Additional debit','nota_debito',$3)", [id+'-nd',folio,String(debit)]);
  await pool!.query("INSERT INTO payments(id,reservation_id,amount,method,date,status,invoice_ref,payment_request_id) VALUES($1,$2,10000,'tarjeta_debito',CURRENT_DATE,'active',$3,$4)", [payment,id,JSON.stringify({id:sale,tipoComprobante:saleType[type],fundingReleases:{[sale]:0}}),id+'-request']);
  await pool!.query("INSERT INTO cash_movements(id,area,source_type,source_id,payment_id,payment_method,amount,movement_type) VALUES($1,'recepcion','payment',$2,$2,'tarjeta_debito',10000,'income')", [id+'-cash',payment]);
  await pool!.query("INSERT INTO folio_movements(id,folio_id,type,amount,description,source_type,source_id) VALUES($1,$2,'payment',10000,'Original receipt','payment',$3)", [id+'-paid',folio,payment]);
  return {id,point,sale,credit,debit,folio,payment,kind};
}

async function request(path: string, method = 'GET', body?: unknown, role = 'reception') {
  const r = await fetch(base+path, {method,headers:{'Content-Type':'application/json','x-test-role':role},...(body===undefined?{}:{body:JSON.stringify(body)})});
  return {status:r.status,body:await r.json()};
}
async function view(f: Fixture) { return (await request(`/api/billing/debit-notes/${f.debit}/actions`)).body; }
async function cancel(f: Fixture, operationId = randomUUID(), extra: Record<string,unknown> = {}) {
  const p = await view(f);
  return request(`/api/billing/debit-notes/${f.debit}/annul`,'POST',{reason:'Correction requested by reception',expectedFingerprint:p.expectedFingerprint,operationId,...extra});
}
async function facts(f: Fixture) {
  return {
    invoices:(await pool!.query('SELECT * FROM sales_invoices WHERE reserva_id=$1 ORDER BY id',[f.id])).rows,
    payments:(await pool!.query('SELECT * FROM payments WHERE reservation_id=$1 ORDER BY id',[f.id])).rows,
    realCash:(await pool!.query("SELECT * FROM cash_movements WHERE payment_id=$1 AND movement_type<>'informational' ORDER BY id",[f.payment])).rows,
    folio:(await pool!.query('SELECT * FROM folios WHERE id=$1',[f.folio])).rows[0],
    ledger:(await pool!.query('SELECT * FROM folio_movements WHERE folio_id=$1 ORDER BY id',[f.folio])).rows,
    reservation:(await pool!.query('SELECT * FROM reservations WHERE id=$1',[f.id])).rows[0],
  };
}
async function cleanup(f: Fixture) {
  const ids = (await pool!.query('SELECT id FROM sales_invoices WHERE reserva_id=$1',[f.id])).rows.map(r=>String(r.id));
  await pool!.query("DELETE FROM audit_logs WHERE entity_type='debit_note' AND entity_id=ANY($1::text[])",[ids]);
  await pool!.query('DELETE FROM cash_movements WHERE source_id=ANY($1::text[]) OR payment_id=$2',[ids,f.payment]);
  await pool!.query('DELETE FROM folio_movements WHERE folio_id=$1',[f.folio]);await pool!.query('DELETE FROM folios WHERE id=$1',[f.folio]);
  await pool!.query('DELETE FROM payments WHERE reservation_id=$1',[f.id]);
  await pool!.query('DELETE FROM sales_invoices WHERE reserva_id=$1',[f.id]);
  await pool!.query('DELETE FROM billing_operations WHERE owner_id=$1',[f.id]);
  for (const table of ['reservations','rooms','guests','room_types']) await pool!.query(`DELETE FROM ${table} WHERE id=$1`,[f.id]);
  await pool!.query('DELETE FROM invoice_counters WHERE punto_venta=$1',[f.point]);await pool!.query('DELETE FROM pos_configs WHERE numero=$1',[f.point]);
}

describe.skipIf(!enabled)('acciones de Notas de Débito con HTTP y PostgreSQL',()=>{
  beforeAll(async()=>{
    const { loadRolePermissionsCache } = await import('../permissions'); await loadRolePermissionsCache();
    const {registerBillingRoutes}=await import('../billing/routes');
    const app=express();app.use(express.json());app.use((req:any,_res,next)=>{req.isAuthenticated=()=>true;req.user={id:'debit-note-test',username:'Synthetic reception',role:req.header('x-test-role')||'reception'};next();});registerBillingRoutes(app);
    server=app.listen(0,'127.0.0.1');await new Promise<void>(resolve=>server.once('listening',resolve));base=`http://127.0.0.1:${(server.address() as any).port}`;
  },60000);
  afterAll(async()=>{if(server)await new Promise<void>(resolve=>server.close(()=>resolve()));await pool?.end();const {pool:applicationPool}=await import('../db');await applicationPool.end();});

  it('corrige sólo la forma de pago informativa, exige motivo y conserva cobros/caja/importe',async()=>{
    const f=await fixture();try{
      const p=await view(f),before=await facts(f);
      const response=await request(`/api/billing/debit-notes/${f.debit}`,'PATCH',{reason:'Printed method correction',expectedFingerprint:p.expectedFingerprint,cashFormaPago:'transferencia'});
      expect(response.status,JSON.stringify(response.body)).toBe(200);
      const after=await facts(f);expect(after.payments).toEqual(before.payments);expect(after.realCash).toEqual(before.realCash);expect(after.folio).toEqual(before.folio);expect(after.reservation).toEqual(before.reservation);
      expect(after.invoices.find(i=>i.id===f.debit)).toMatchObject({cash_forma_pago:'transferencia',monto_total:'10000.00',estado:'emitida'});
      expect((await pool!.query("SELECT details FROM audit_logs WHERE entity_type='debit_note' AND entity_id=$1",[String(f.debit)])).rows).toHaveLength(1);
      const stale=await request(`/api/billing/debit-notes/${f.debit}`,'PATCH',{reason:'Another change',expectedFingerprint:p.expectedFingerprint,cashFormaPago:'efectivo'});
      expect(stale.status).toBe(409);expect(await facts(f)).toEqual(after);
    }finally{await cleanup(f);}
  });

  it.each(['NDB','NDA'])('anula %s que revirtió una NC, restaura la cadena exacta y deduplica la respuesta perdida',async type=>{
    const f=await fixture('restoration',type);try{
      const before=await facts(f),operationId=randomUUID(),calls=issuance.calls;
      const response=await cancel(f,operationId);expect(response.status,JSON.stringify(response.body)).toBe(200);
      expect(response.body).toMatchObject({estado:'emitida',reconciliation_status:'conciliada',nota_credito_id:f.debit,monto_total:'10000.00'});
      const after=await facts(f);expect(after.invoices.find(i=>i.id===f.debit)).toMatchObject({estado:'anulada',monto_acreditado:'10000.00',nota_credito_id:f.credit});
      expect(after.invoices.find(i=>i.id===f.credit)).toMatchObject({estado:'emitida',monto_acreditado:'0.00',nota_credito_id:f.sale});
      expect(after.invoices.find(i=>i.id===f.sale)).toMatchObject({estado:'anulada',monto_acreditado:'10000.00'});
      expect(JSON.parse(after.payments[0].invoice_ref).fundingReleases[String(f.sale)]).toBe(1000000);
      expect(after.payments[0]).toMatchObject({id:f.payment,amount:'10000.00',method:'tarjeta_debito',status:'active'});
      expect(after.realCash).toEqual(before.realCash);expect(after.folio).toEqual(before.folio);expect(after.ledger).toEqual(before.ledger);expect(after.reservation).toEqual(before.reservation);
      expect((await cancel(f,operationId)).status).toBe(200);expect(await facts(f)).toEqual(after);expect(issuance.calls-calls).toBe(1);
    }finally{await cleanup(f);}
  });

  it('anula un cargo adicional de ND con contrapartida única, conservando la factura base y el cobro',async()=>{
    const f=await fixture('additional');try{
      const before=await facts(f),response=await cancel(f);expect(response.status,JSON.stringify(response.body)).toBe(200);
      const after=await facts(f);expect(after.invoices.find(i=>i.id===f.sale)).toEqual(before.invoices.find(i=>i.id===f.sale));
      expect(after.folio.balance).toBe('0.00');expect(after.payments).toEqual(before.payments);expect(after.realCash).toEqual(before.realCash);
      expect(after.ledger.filter(m=>m.amount==='-10000.00')).toEqual([expect.objectContaining({source_type:'nota_debito',voided_movement_id:f.id+'-nd'})]);
    }finally{await cleanup(f);}
  });

  it('permite restaurar una anulación con ND total y luego una nueva anulación, sin duplicar crédito ni dinero',async()=>{
    const f=await fixture();try{
      const original=await facts(f),cancelled=await cancel(f);expect(cancelled.status,JSON.stringify(cancelled.body)).toBe(200);
      const operationId=randomUUID();
      const response=await request(`/api/billing/invoices/${cancelled.body.id}/nota-debito`,'POST',{motivo:'Restore the debit note',monto:10000,operationId});
      expect(response.status,JSON.stringify(response.body)).toBe(201);
      const restored=await facts(f);expect(restored.invoices.find(i=>i.id===f.sale)).toMatchObject({estado:'emitida',monto_acreditado:'0.00'});
      expect(restored.invoices.find(i=>i.id===f.debit)).toMatchObject({estado:'emitida',monto_acreditado:'0.00'});
      expect(restored.invoices.find(i=>i.id===f.credit)).toMatchObject({estado:'anulada',monto_acreditado:'10000.00'});
      expect(JSON.parse(restored.payments[0].invoice_ref).fundingReleases[String(f.sale)]).toBe(0);expect(restored.realCash).toEqual(original.realCash);
      expect((await request(`/api/billing/invoices/${cancelled.body.id}/nota-debito`,'POST',{motivo:'Restore the debit note',monto:10000,operationId})).status).toBe(201);expect(await facts(f)).toEqual(restored);
      const second=await cancel(f);expect(second.status,JSON.stringify(second.body)).toBe(200);expect(second.body.id).not.toBe(cancelled.body.id);
      expect(JSON.parse((await facts(f)).payments[0].invoice_ref).fundingReleases[String(f.sale)]).toBe(1000000);
    }finally{await cleanup(f);}
  });

  it('un fallo de auditoría conserva la NC emitida para conciliarla sin otra autorización',async()=>{
    const f=await fixture(),functionName='nd_audit_'+randomUUID().replaceAll('-',''),operationId=randomUUID(),calls=issuance.calls;
    try{
      await pool!.query(`CREATE FUNCTION ${functionName}() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.entity_type='debit_note' AND NEW.entity_id='${f.debit}' THEN RAISE EXCEPTION 'Synthetic audit failure'; END IF; RETURN NEW; END $$`);
      await pool!.query(`CREATE TRIGGER ${functionName} BEFORE INSERT ON audit_logs FOR EACH ROW EXECUTE FUNCTION ${functionName}()`);
      const before=await facts(f),failed=await cancel(f,operationId);expect(failed.status).toBe(409);
      const pending=await facts(f);expect(pending.payments).toEqual(before.payments);expect(pending.realCash).toEqual(before.realCash);expect(pending.invoices.find(i=>i.id===f.debit)).toEqual(before.invoices.find(i=>i.id===f.debit));
      expect(pending.invoices.filter(i=>i.nota_credito_id===f.debit)).toEqual([expect.objectContaining({estado:'emitida',reconciliation_status:'pendiente'})]);
      expect((await view(f)).recoveryOperationId).toBe(operationId);
      await pool!.query(`DROP TRIGGER ${functionName} ON audit_logs`);await pool!.query(`DROP FUNCTION ${functionName}()`);
      const pendingId=pending.invoices.find(i=>i.nota_credito_id===f.debit).id;
      const recovered=await request(`/api/billing/credit-notes/${pendingId}/reconcile`,'POST',{});expect(recovered.status,JSON.stringify(recovered.body)).toBe(200);expect(issuance.calls-calls).toBe(1);
      expect((await request(`/api/billing/credit-notes/${pendingId}/reconcile`,'POST',{})).status).toBe(200);
      expect((await cancel(f,operationId)).status).toBe(200);expect(issuance.calls-calls).toBe(1);
    }finally{await pool!.query(`DROP TRIGGER IF EXISTS ${functionName} ON audit_logs`);await pool!.query(`DROP FUNCTION IF EXISTS ${functionName}()`);await cleanup(f);}
  });

  it('hereda el pedido de Restaurant, permite su rol específico y conserva la factura y el cobro',async()=>{
    const f=await fixture('additional'),order=f.id+'-order';
    try{
      await pool!.query("INSERT INTO restaurant_orders(id,order_number,status,opened_at) VALUES($1::text,$1::text,'closed',NOW())",[order]);
      await pool!.query("UPDATE sales_invoices SET reserva_id=NULL,restaurant_order_id=$2 WHERE id=$1",[f.sale,order]);
      await pool!.query("UPDATE sales_invoices SET reserva_id=NULL WHERE id=$1",[f.debit]);
      await pool!.query("DELETE FROM folio_movements WHERE id=$1",[f.id+'-nd']);
      const before=await facts(f),original=(await pool!.query('SELECT * FROM sales_invoices WHERE id=$1',[f.sale])).rows[0];
      const p=await request(`/api/billing/debit-notes/${f.debit}/actions`,'GET',undefined,'restaurant');expect(p.status,JSON.stringify(p.body)).toBe(200);
      const response=await request(`/api/billing/debit-notes/${f.debit}/annul`,'POST',{reason:'Restaurant debit correction',expectedFingerprint:p.body.expectedFingerprint,operationId:randomUUID()},'restaurant');
      expect(response.status,JSON.stringify(response.body)).toBe(200);expect(response.body.restaurant_order_id).toBe(order);
      expect((await pool!.query('SELECT * FROM sales_invoices WHERE id=$1',[f.sale])).rows[0]).toEqual(original);
      expect((await facts(f)).payments).toEqual(before.payments);expect((await facts(f)).realCash).toEqual(before.realCash);
    }finally{await pool!.query("UPDATE sales_invoices SET reserva_id=$1,restaurant_order_id=NULL WHERE punto_venta=$2",[f.id,f.point]);await pool!.query('DELETE FROM restaurant_orders WHERE id=$1',[order]);await cleanup(f);}
  });

  it('dos operadores no pueden autorizar dos NC sobre la misma ND',async()=>{
    const f=await fixture(),calls=issuance.calls;
    try{
      const p=await view(f),body={reason:'Concurrent correction',expectedFingerprint:p.expectedFingerprint};
      const responses=await Promise.all([request(`/api/billing/debit-notes/${f.debit}/annul`,'POST',{...body,operationId:randomUUID()}),request(`/api/billing/debit-notes/${f.debit}/annul`,'POST',{...body,operationId:randomUUID()})]);
      expect(responses.map(r=>r.status).sort()).toEqual([200,409]);
      expect((await facts(f)).invoices.filter(i=>i.nota_credito_id===f.debit)).toHaveLength(1);expect(issuance.calls-calls).toBe(1);
    }finally{await cleanup(f);}
  });

  it.each(['missing_reason','stale','fiscal_fields','role','restaurant_role','archive','source_mismatch','source_map','recipient','environment'] as const)('rechaza %s antes de autorizar o modificar dinero',async condition=>{
    const f=await fixture();try{
      const p=await view(f);
      if(condition==='source_mismatch')await pool!.query("UPDATE sales_invoices SET monto_acreditado=0 WHERE id=$1",[f.credit]);
      if(condition==='source_map')await pool!.query("UPDATE sales_invoices SET source_charge_amounts='{\"unrelated\":10000}' WHERE id=$1",[f.debit]);
      if(condition==='source_map')p.expectedFingerprint=(await view(f)).expectedFingerprint;
      if(condition==='recipient'){await pool!.query("UPDATE sales_invoices SET cliente_cuit='30111111118' WHERE id=$1",[f.debit]);await pool!.query("UPDATE sales_invoices SET cliente_cuit='30222222223' WHERE id=$1",[f.credit]);}
      if(condition==='environment'){await pool!.query("UPDATE sales_invoices SET fiscal_identity='{\"environment\":\"produccion\",\"issuer\":\"30111111118\"}' WHERE id=$1",[f.debit]);await pool!.query("UPDATE sales_invoices SET fiscal_identity='{\"environment\":\"homologacion\",\"issuer\":\"30111111118\"}' WHERE id=$1",[f.credit]);}
      if(condition==='archive')await pool!.query("INSERT INTO sales_control_archive(kind,record_id,batch_id) VALUES('invoice',$1,$2)",[String(f.debit),f.id]);
      const before=await facts(f),calls=issuance.calls;
      const response=condition==='fiscal_fields' ? await request(`/api/billing/debit-notes/${f.debit}`,'PATCH',{reason:'Invalid fiscal rewrite',expectedFingerprint:p.expectedFingerprint,cashFormaPago:'efectivo',montoTotal:500}) : await request(`/api/billing/debit-notes/${f.debit}/annul`,'POST',{reason:condition==='missing_reason'?'': 'Requested correction',expectedFingerprint:condition==='stale'?'old':p.expectedFingerprint,operationId:randomUUID()},condition==='role'?'housekeeping':condition==='restaurant_role'?'restaurant':'reception');
      expect([400,403,409]).toContain(response.status);expect(await facts(f)).toEqual(before);expect(issuance.calls).toBe(calls);
    }finally{await pool!.query("DELETE FROM sales_control_archive WHERE record_id=$1",[String(f.debit)]);await cleanup(f);}
  });
});
