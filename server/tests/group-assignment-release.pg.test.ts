import express from 'express';
import http from 'node:http';
import { randomUUID } from 'node:crypto';
import pg from 'pg';
import { beforeAll, afterAll, describe, it, expect, vi } from 'vitest';
import PDFDocument from 'pdfkit';
const suite = process.env.DATABASE_URL ? describe : describe.skip;
const fixtures: string[] = [];
let server: http.Server, base: string, pool: pg.Pool, role = 'reception';
async function request(path: string, body?: any, method = body ? 'POST' : 'GET') {
  const response = await fetch(base + path, { method, headers: { 'content-type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
  return { status: response.status, body: await response.json() };
}
const path = (f: any) => `/api/groups/${f.id}/reservations/${f.res}/`;
async function fixture() {
  const id = 'assignment-' + randomUUID(); fixtures.push(id);
  await pool.query("INSERT INTO room_types(id,code,name) VALUES($1::text,$1::text,'Synthetic assignment')", [id]);
  await pool.query("INSERT INTO rooms(id,room_number,room_type_id,status) VALUES($1::text,$1::text,$1::text,'available')", [id]);
  await pool.query("INSERT INTO guests(id,first_name,last_name,codigo) VALUES($1::text,'Original','Synthetic',$1::text)", [id]);
  await pool.query("INSERT INTO groups(id,group_code,name,check_in_date,check_out_date,status,master_folio_config,created_at) VALUES($1::text,$1::text,'Synthetic assignment group','2027-02-01','2027-02-03','confirmed','all',now())", [id]);
  await pool.query("INSERT INTO group_room_blocks(id,group_id,room_type_id,quantity,agreed_rate) VALUES($1::text,$1::text,$1::text,2,50)", [id]);
  const res = id + 'res', second = id + 'second';
  for (const rid of [res, second]) {
    await pool.query("INSERT INTO reservations(id,reservation_code,guest_id,room_type_id,room_id,check_in_date,check_out_date,nights,base_rate_per_night,final_rate_per_night,total_room_amount,status,number_of_guests,created_at,pricing_scheme,pricing_revision,nightly_pricing) VALUES($1::text,$1::text,$2,$2,$2,'2027-02-01','2027-02-03',2,50,50,100,'confirmed',2,now(),'legacy',3,$3::jsonb)", [rid,id,JSON.stringify([{date:'2027-02-01',gross:50, marker:'frozen'},{date:'2027-02-02',gross:50,marker:'frozen'}])]);
    await pool.query('INSERT INTO group_reservation_links(group_id,reservation_id) VALUES($1,$2)', [id,rid]);
  }
  await pool.query("INSERT INTO cash_shifts(id,area,shift_number,status,opened_at,opened_by) VALUES($1,'reception',992211,'open',now(),'synthetic')", [id]);
  return { id, res, second };
}
async function groupReceipt(f: any, own = 30, other = 50, method = 'transferencia') {
  const gp = f.id + 'receipt';
  await pool.query("INSERT INTO group_payments(id,group_id,amount,method,date,distribution,distribution_detail,payment_method_detail,receipt_type,destination,reference) VALUES($1,$2,$3,$4,'2027-01-01','equal',$5::jsonb,$6::jsonb,'none','group_distribution','Synthetic original receipt')", [gp,f.id,own+other,method,JSON.stringify({[f.res]:own,[f.second]:other}),JSON.stringify([{method,amount:own+other}])]);
  for (const [rid,amount] of [[f.res,own],[f.second,other]]) if (amount) await pool.query("INSERT INTO payments(id,reservation_id,amount,method,date,status,group_payment_id) VALUES($1,$2,$3,$4,'2027-01-01','active',$5)", [rid+'payment',rid,amount,method,gp]);
  await pool.query("INSERT INTO cash_movements(id,shift_id,area,source_type,source_id,payment_method,amount,movement_type,payment_id,registered_by) VALUES($1,$2,'reception','group_payment',$2,$3,$4,'income',$1,'synthetic')", [gp,f.id,method,own+other]);
  return gp;
}
async function personalReceipt(f: any, amount = 40) {
  const id = f.res+'personal';
  await pool.query("INSERT INTO payments(id,reservation_id,amount,method,date,status,billing_target,reference,notes) VALUES($1,$2,$3,'transferencia','2027-01-01','active','guest','Synthetic bank reference','Original receipt notes')", [id,f.res,amount]);
  await pool.query("INSERT INTO cash_movements(id,shift_id,area,source_type,source_id,payment_method,amount,movement_type,payment_id,registered_by) VALUES($1,$2,'reception','reservation',$3,'transferencia',$4,'income',$1,'synthetic')", [id,f.id,f.res,amount]);
  await pool.query("INSERT INTO folios(id,codigo,entity_type,entity_id,status,total_charges,total_payments,balance) VALUES($1::text,$1::text,'reservation',$2,'open',100,$3,100-$3::numeric)", [id,f.res,amount]);
  await pool.query("INSERT INTO folio_movements(folio_id,type,amount,description,source_type,source_id) VALUES($1,'payment',$2,'Original advance','payment',$1)", [id,amount]);
  return id;
}
async function release(f: any, extra: any = {}, preview?: any) {
  const facts = preview || (await request(path(f)+'assignment-preview')).body;
  const body = { operationId: randomUUID(), fingerprint: facts.fingerprint, reason: 'No viene el pasajero. Conservamos el cupo.', ...extra };
  return { ...(await request(path(f)+'release-assignment', body)), request: body };
}
async function totals(f: any) {
  const { storage } = await import('../db-storage');
  const { computeGroupOperationalLedger } = await import('../billing/groupOperationalLedger');
  const lines = await storage.getGroupReservationLedger(f.id);
  const parents = (await pool.query('SELECT id,amount FROM group_payments WHERE group_id=$1',[f.id])).rows;
  return computeGroupOperationalLedger(lines, [], parents as any);
}
suite('Liberar una asignación de grupo sin reducir contrato ni duplicar cobros', () => {
  beforeAll(async () => {
    pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
    await (await import('../migrate')).verifyFinancialSchema();
    await (await import('../permissions')).loadRolePermissionsCache();
    const app = express(); app.use(express.json()); app.use((req,_res,next) => { req.user={id:'assignment-test',username:'Synthetic assignment',role} as any; req.isAuthenticated=()=>true; next(); });
    (await import('../routes/groups')).registerGroupsRoutes(app);
    (await import('../billing/groupAccount')).registerGroupAccountRoutes(app);
    server = http.createServer(app); await new Promise<void>(r=>server.listen(0,'127.0.0.1',r)); base=`http://127.0.0.1:${(server.address() as any).port}`;
  });
  afterAll(async () => {
    if (server) { server.closeAllConnections(); await new Promise<void>(r=>server.close(()=>r())); }
    for (const id of fixtures) {
      const ids=(await pool.query('SELECT reservation_id FROM group_reservation_links WHERE group_id=$1',[id])).rows.map(r=>r.reservation_id);
      await pool.query('DELETE FROM group_assignment_releases WHERE group_id=$1',[id]); await pool.query('DELETE FROM group_personal_advance_origins WHERE group_id=$1',[id]);
      await pool.query('DELETE FROM group_account_operations WHERE group_id=$1',[id]);
      await pool.query('DELETE FROM cash_movements WHERE shift_id=$1',[id]);
      await pool.query('DELETE FROM billing_operations WHERE owner_id=$1 OR owner_id=ANY($2::text[])',[id,ids]);
      await pool.query('DELETE FROM sales_invoices WHERE group_id=$1 OR reserva_id=ANY($2::text[])',[id,ids]);
      await pool.query('DELETE FROM payments WHERE reservation_id=ANY($1::text[])',[ids]); await pool.query('DELETE FROM group_payments WHERE group_id=$1',[id]);
      await pool.query('DELETE FROM charges WHERE reservation_id=ANY($1::text[])',[ids]);
      await pool.query('DELETE FROM folio_movements WHERE folio_id IN(SELECT id FROM folios WHERE entity_id=ANY($1::text[]))',[ids]); await pool.query('DELETE FROM folios WHERE entity_id=ANY($1::text[])',[ids]);
      await pool.query('DELETE FROM cancelled_reservation_logs WHERE reservation_id=ANY($1::text[])',[ids]); await pool.query('DELETE FROM reservation_changelog WHERE reservation_id=ANY($1::text[])',[ids]);
      await pool.query("DELETE FROM audit_logs WHERE entity_id=$1 OR entity_id=ANY($2::text[])",[id,ids]);
      await pool.query('DELETE FROM group_reservation_links WHERE group_id=$1',[id]); await pool.query('DELETE FROM reservations WHERE id=ANY($1::text[])',[ids]);
      await pool.query('DELETE FROM group_room_blocks WHERE group_id=$1',[id]); await pool.query('DELETE FROM groups WHERE id=$1',[id]);
      await pool.query('DELETE FROM housekeeping_tasks WHERE room_id=$1',[id]); await pool.query('DELETE FROM rooms WHERE id=$1',[id]); await pool.query('DELETE FROM room_types WHERE id=$1',[id]);
      await pool.query('DELETE FROM guests WHERE id=$1 OR codigo=$2',[id,'GROUP-'+id]); await pool.query('DELETE FROM cash_shifts WHERE id=$1',[id]);
    }
    await pool?.end(); await (await import('../db')).pool.end();
  });
  it('conserva precio congelado, bloque y total; libera aplicaciones del recibo y permite aplicarlas al reemplazo sin Caja nueva', async () => {
    const f=await fixture(), gp=await groupReceipt(f), before=await totals(f);
    const masterBefore=(await request(`/api/groups/${f.id}/master-folio`)).body;
    const receipt=(await pool.query('SELECT * FROM group_payments WHERE id=$1',[gp])).rows[0];
    const reservation=(await pool.query('SELECT * FROM reservations WHERE id=$1',[f.res])).rows[0];
    const cash=(await pool.query('SELECT * FROM cash_movements WHERE shift_id=$1',[f.id])).rows;
    const preview=await request(path(f)+'assignment-preview'); expect(preview.body).toMatchObject({canRelease:true,groupAdvance:30,personalAdvance:0});
    const result=await release(f,{},preview.body); expect(result.status,JSON.stringify(result.body)).toBe(200);
    expect(await totals(f)).toEqual(before);
    const masterAfter=(await request(`/api/groups/${f.id}/master-folio`)).body;
    expect(masterAfter).toMatchObject({masterTotal:masterBefore.masterTotal,masterPaid:masterBefore.masterPaid,masterBalance:masterBefore.masterBalance});
    expect(masterAfter).toMatchObject({masterTotal:200,masterPaid:80,masterBalance:120});
    expect((await request(`/api/groups/${f.id}/folio`)).body.totals.balance).toBe(120);
    const pdfText=vi.spyOn(PDFDocument.prototype,'text');
    try {
      const response=await fetch(`${base}/api/groups/${f.id}/master-folio/pdf`);expect(response.status).toBe(200);
      expect(Buffer.from(await response.arrayBuffer()).subarray(0,4).toString()).toBe('%PDF');
      const lines=pdfText.mock.calls.map(([line])=>line);
      expect(lines[lines.indexOf('Pagado')+1]).toBe('$80');expect(lines[lines.indexOf('SALDO PENDIENTE')+1]).toBe('$120');
    } finally { pdfText.mockRestore(); }

    expect((await pool.query('SELECT quantity FROM group_room_blocks WHERE id=$1',[f.id])).rows[0].quantity).toBe(2);
    const placeholder=(await pool.query('SELECT * FROM reservations WHERE id=$1',[result.body.replacementId])).rows[0];
    for(const field of ['room_id','room_type_id','check_in_date','check_out_date','nights','base_rate_per_night','final_rate_per_night','total_room_amount','pricing_scheme','pricing_revision','nightly_pricing']) expect(placeholder[field]).toEqual(reservation[field]);
    expect((await pool.query('SELECT status FROM reservations WHERE id=$1',[f.res])).rows[0].status).toBe('cancelled');
    const afterReceipt=(await pool.query('SELECT * FROM group_payments WHERE id=$1',[gp])).rows[0];
    expect(afterReceipt).toEqual({...receipt,distribution_detail:{[f.res]:0,[f.second]:50,__unassigned__:30}});
    expect((await pool.query('SELECT * FROM cash_movements WHERE shift_id=$1',[f.id])).rows).toEqual(cash);
    const available=await request(`/api/groups/${f.id}/advance-availability`); expect(available.body.advances).toEqual([expect.objectContaining({id:gp,available:30})]);
    const newPath=`/api/groups/${f.id}/reservations/${placeholder.id}/`;
    const assignPreview=(await request(newPath+'assignment-preview')).body;
    expect(assignPreview).toMatchObject({canRelease:false,canReplace:true});
    const assigned=await request(newPath+'occupant',{guestId:f.id,expectedGuestId:placeholder.guest_id,fingerprint:assignPreview.fingerprint},'PATCH');expect(assigned.status,JSON.stringify(assigned.body)).toBe(200);
    const allocate=await request(`/api/groups/${f.id}/allocate-advance`,{operationId:randomUUID(),receiptId:gp,allocations:{[placeholder.id]:30}}); expect(allocate.status,JSON.stringify(allocate.body)).toBe(200);
    expect(await totals(f)).toEqual(before);
    expect((await request(`/api/groups/${f.id}/advance-availability`)).body.advances).toHaveLength(0);
    expect((await pool.query('SELECT * FROM cash_movements WHERE shift_id=$1',[f.id])).rows).toEqual(cash);
  });
  it('reintentos simultáneos crean un único cupo y no liberan dinero dos veces; otra identidad con cambios se rechaza', async () => {
    const f=await fixture(); await groupReceipt(f,75,0);
    const preview=(await request(path(f)+'assignment-preview')).body;
    const body={operationId:randomUUID(),fingerprint:preview.fingerprint,reason:'Cambio de pasajero'};
    const results=await Promise.all([request(path(f)+'release-assignment',body),request(path(f)+'release-assignment',body)]);
    expect(results.map(r=>r.status)).toEqual([200,200]); expect(results[0].body.replacementId).toBe(results[1].body.replacementId);
    expect(results.map(r=>r.body.replayed).sort()).toEqual([false,true]);
    expect((await pool.query('SELECT * FROM group_assignment_releases WHERE group_id=$1',[f.id])).rows).toHaveLength(1);
    expect((await request(`/api/groups/${f.id}/advance-availability`)).body.advances[0].available).toBe(75);
    expect((await request(path(f)+'release-assignment',{...body,reason:'Otro motivo'})).status).toBe(409);
  });
  it('exige consentimiento del anticipo personal, conserva dinero y origen; la anulación posterior usa el cobro original', async () => {
    const f=await fixture(), payment=await personalReceipt(f), before=await totals(f);
    const original=(await pool.query('SELECT * FROM payments WHERE id=$1',[payment])).rows[0];
    const preview=(await request(path(f)+'assignment-preview')).body; expect(preview).toMatchObject({canRelease:true,personalAdvance:40});
    expect((await release(f,{},preview)).status).toBe(409);
    expect((await pool.query('SELECT status FROM payments WHERE id=$1',[payment])).rows[0].status).toBe('active');
    const result=await release(f,{transferPersonalAdvances:true},preview); expect(result.status,JSON.stringify(result.body)).toBe(200);
    expect(await totals(f)).toEqual(before);
    const source=(await pool.query('SELECT * FROM payments WHERE id=$1',[payment])).rows[0];
    for(const key of ['amount','method','date','reference','notes','reservation_id','group_payment_id']) expect(source[key]).toEqual(original[key]);
    expect((await pool.query('SELECT * FROM cash_movements WHERE shift_id=$1',[f.id])).rows).toHaveLength(1);
    const {storage}=await import('../db-storage');
    await expect(storage.voidReservationPaymentAtomic(payment,'Synthetic','No duplicar')).rejects.toMatchObject({statusCode:409});
    const gp=result.body.transferredReceiptIds[0];
    expect((await request(`/api/groups/${f.id}/allocate-advance`,{operationId:randomUUID(),receiptId:gp,allocations:{[result.body.replacementId]:40}})).status).toBe(200);
    role='admin'; const reversed=await request(`/api/groups/${f.id}/master-payments/${gp}`,undefined,'DELETE'); role='reception'; expect(reversed.status,JSON.stringify(reversed.body)).toBe(200);
    expect((await totals(f)).payments).toBe(0);
    const cash=(await pool.query('SELECT * FROM cash_movements WHERE shift_id=$1',[f.id])).rows;
    expect(cash.filter(c=>c.movement_type==='income')).toHaveLength(1); expect(cash.filter(c=>c.movement_type==='expense')).toHaveLength(1);
    expect(cash.reduce((n,c)=>n+(c.movement_type==='income'?1:-1)*Number(c.amount),0)).toBe(0);
    expect((await pool.query('SELECT status FROM group_personal_advance_origins WHERE payment_id=$1',[payment])).rows[0].status).toBe('reversed');
  });
  it.each(['checked_in','checked_out','cancelled'])('bloquea la liberación de reservas %s',async status=>{
    const f=await fixture();await pool.query('UPDATE reservations SET status=$2 WHERE id=$1',[f.res,status]);
    const p=(await request(path(f)+'assignment-preview')).body; expect(p.canRelease).toBe(false);expect((await release(f,{},p)).status).toBe(409);
  });
  it('no transforma Cuenta Corriente o retenciones en dinero disponible, y detecta distribuciones ambiguas',async()=>{
    for(const method of ['cuenta_corriente','transferencia']) {
      const f=await fixture(),gp=await groupReceipt(f,30,50,method);
      if(method==='transferencia')await pool.query("UPDATE group_payments SET distribution_detail='{}' WHERE id=$1",[gp]);
      expect((await request(path(f)+'assignment-preview')).body.canRelease).toBe(false); expect((await release(f)).status).toBe(409);
    }
  });
  it('conciliación de extras y vista previa desactualizada se rechazan sin cambiar el contrato ni los cobros',async()=>{
    const f=await fixture();await groupReceipt(f);
    const preview=(await request(path(f)+'assignment-preview')).body;
    await pool.query("UPDATE reservations SET final_rate_per_night=60,total_room_amount=120,pricing_revision=4 WHERE id=$1",[f.res]);
    expect((await release(f,{},preview)).status).toBe(409);
    await pool.query("INSERT INTO charges(reservation_id,description,amount,date,category) VALUES($1,'Synthetic consumed extra',10,'2027-01-01','restaurant')",[f.res]);
    const p=(await request(path(f)+'assignment-preview')).body;expect(p.canRelease).toBe(false);expect(p.blockers.join(' ')).toMatch(/consumos/);
    expect((await release(f,{},p)).status).toBe(409);
    expect((await pool.query('SELECT * FROM group_assignment_releases WHERE group_id=$1',[f.id])).rows).toHaveLength(0);
  });
  it('una factura de otra habitación no bloquea; una con fuentes afectadas o ambiguas requiere revisión',async()=>{
    for(const scope of ['other','own','ambiguous']) {
      const f=await fixture();await groupReceipt(f);
      const amounts=scope==='ambiguous'?null:{[`reservation:${scope==='own'?f.res:f.second}:accommodation`]:50};
      await pool.query("INSERT INTO sales_invoices(tipo_comprobante,punto_venta,numero,fecha_emision,cliente_razon_social,cliente_condicion_iva,monto_neto,monto_iva21,monto_total,estado,items,group_id,source_charge_amounts) VALUES('FB',99999,nextval('group_payments_receipt_number_seq'),CURRENT_DATE,'Synthetic invoice','Consumidor Final',50,0,50,'emitida','[]',$1,$2::jsonb)",[f.id,JSON.stringify(amounts)]);
      const preview=(await request(path(f)+'assignment-preview')).body;
      expect(preview.canRelease,JSON.stringify(preview)).toBe(scope==='other');
      expect((await release(f,{},preview)).status).toBe(scope==='other'?200:409);
    }
  });
  it('no genera crédito de alojamiento impago y conserva un historial auditable',async()=>{
    const f=await fixture(),result=await release(f);expect(result.status,JSON.stringify(result.body)).toBe(200);expect(result.body.availableAdvance).toBe(0);
    expect((await totals(f)).payments).toBe(0);expect((await totals(f)).accommodation).toBe(200);
    expect((await pool.query('SELECT * FROM cancelled_reservation_logs WHERE reservation_id=$1',[f.res])).rows).toHaveLength(1);
    expect((await pool.query("SELECT * FROM reservation_changelog WHERE reservation_id=$1 AND tipo='group_assignment_release'",[f.res])).rows).toHaveLength(1);
  });
  it('impide cambiar un huésped sin revisar su anticipo personal y conserva tarifa al confirmar el reemplazo',async()=>{
    const f=await fixture();await personalReceipt(f);
    const target=f.id+'target';await pool.query("INSERT INTO guests(id,first_name,last_name) VALUES($1,'Replacement','Synthetic')",[target]);
    try {
      const preview=(await request(path(f)+'assignment-preview')).body;
      const body={guestId:target,expectedGuestId:f.id,fingerprint:preview.fingerprint,reason:'No viaja el pasajero original',confirmPreserveStay:true};
      expect((await request(path(f)+'occupant',body,'PATCH')).status).toBe(409);
      expect((await request(path(f)+'occupant',{...body,confirmPersonalAdvances:true},'PATCH')).status).toBe(200);
      const r=(await pool.query('SELECT * FROM reservations WHERE id=$1',[f.res])).rows[0];expect(r.guest_id).toBe(target);expect(Number(r.total_room_amount)).toBe(100);expect(r.status).toBe('confirmed');
      expect((await pool.query("SELECT * FROM payments WHERE reservation_id=$1 AND status='active'",[f.res])).rows).toHaveLength(1);
      expect((await request(path(f)+'occupant',{...body,confirmPersonalAdvances:true},'PATCH')).status).toBe(409);
    } finally { await pool.query('DELETE FROM guests WHERE id=$1',[target]); }
  });
  it('reemplaza con recibo aplicado a habitaciones y cargos del grupo sin mover fondos; liberar sigue bloqueado', async () => {
    const f = await fixture(), gp = await groupReceipt(f, 40, 30);
    await pool.query("UPDATE group_payments SET amount=100,distribution_detail=$2::jsonb,payment_method_detail=$3::jsonb WHERE id=$1", [gp, JSON.stringify({[f.res]:40,[f.second]:30,__group_charges__:30}), JSON.stringify([{method:'transferencia',amount:100}])]);
    await pool.query("UPDATE cash_movements SET amount=100 WHERE id=$1", [gp]);
    await pool.query("INSERT INTO folios(id,codigo,entity_type,entity_id,status,total_charges,total_payments,balance) VALUES($1::text,$1::text,'reservation',$2,'open',100,40,60)",[f.res+'folio',f.res]);
    await pool.query("INSERT INTO folio_movements(folio_id,type,amount,description,source_type,source_id) VALUES($1,'payment',40,'Aplicación original','payment',$2)",[f.res+'folio',f.res+'payment']);
    const { previewGroupAssignment } = await import('../groupAssignmentRelease');
    async function financialSnapshot() {
      const queries = [
        ['SELECT * FROM group_payments WHERE group_id=$1 ORDER BY id', f.id],
        ['SELECT * FROM payments WHERE group_payment_id=$1 ORDER BY id', gp],
        ['SELECT * FROM cash_movements WHERE shift_id=$1 ORDER BY id', f.id],
        ["SELECT * FROM folios WHERE entity_id IN ($1,$2) ORDER BY id", f.res, f.id],
        ["SELECT fm.* FROM folio_movements fm JOIN folios f ON f.id=fm.folio_id WHERE f.entity_id IN ($1,$2) ORDER BY fm.id", f.res, f.id],
        ['SELECT * FROM sales_invoices WHERE group_id=$1 ORDER BY id', f.id],
        ['SELECT * FROM account_movements WHERE reservation_id=$1 ORDER BY id', f.res],
      ];
      return Promise.all(queries.map(async ([query,...args]) => (await pool.query(query, args)).rows));
    }
    const original = (await pool.query('SELECT * FROM reservations WHERE id=$1',[f.res])).rows[0];
    const funds = await financialSnapshot();
    const preview = await previewGroupAssignment(f.id, f.res);
    expect(preview).toMatchObject({canReplace:true,replacementBlockers:[],canRelease:false,groupAdvance:40});
    expect(preview.blockers.join(' ')).toContain('Liberar este anticipo');
    expect((await release(f, {}, preview)).status).toBe(409);
    const target=f.id+'new';
    await pool.query("INSERT INTO guests(id,first_name,last_name) VALUES($1,'Nuevo','Pasajero')",[target]);
    try {
      const result=await request(path(f)+'occupant',{guestId:target,expectedGuestId:f.id,fingerprint:preview.fingerprint,reason:'No viaja el pasajero original',confirmPreserveStay:true},'PATCH');
      expect(result.status,JSON.stringify(result.body)).toBe(200);
      expect((await pool.query('SELECT * FROM reservations WHERE id=$1',[f.res])).rows[0]).toEqual({...original,guest_id:target});
      expect(await financialSnapshot()).toEqual(funds);
      const current = await previewGroupAssignment(f.id,f.res);
      expect(current.canReplace).toBe(true);expect(current.canRelease).toBe(false);
      expect((await release(f,{},current)).status).toBe(409);
      expect(await financialSnapshot()).toEqual(funds);
      // A real mismatch in the CURRENT receipt still blocks replacement.
      await pool.query("UPDATE group_payments SET amount=101 WHERE id=$1",[gp]);
      const invalid=await previewGroupAssignment(f.id,f.res);
      expect(invalid.canReplace).toBe(false);
      expect((await request(path(f)+'occupant',{guestId:f.id,expectedGuestId:target,fingerprint:invalid.fingerprint,reason:'Prueba de inconsistencia actual',confirmPreserveStay:true},'PATCH')).status).toBe(409);
    } finally {
      await pool.query('UPDATE reservations SET guest_id=$2 WHERE id=$1',[f.res,f.id]);
      await pool.query('DELETE FROM guests WHERE id=$1',[target]);
    }
  });
  it('impide reabrir la asignación anterior o cargarle cargos y cobros tardíos',async()=>{
    const f=await fixture(),result=await release(f);expect(result.status).toBe(200);
    const {storage}=await import('../db-storage');
    await expect(storage.updateReservation(f.res,{status:'confirmed'})).rejects.toMatchObject({statusCode:409});
    await expect(storage.createCharge({reservationId:f.res,description:'Late extra',amount:'10',date:'2027-02-01',category:'restaurant'})).rejects.toMatchObject({statusCode:409});
    await expect(storage.createPayment({reservationId:f.res,amount:'10',method:'efectivo',date:'2027-02-01'})).rejects.toMatchObject({statusCode:409});
    expect((await pool.query('SELECT id FROM charges WHERE reservation_id=$1',[f.res])).rows).toHaveLength(0);
    expect((await pool.query('SELECT status FROM reservations WHERE id=$1',[result.body.replacementId])).rows[0].status).toBe('confirmed');
  });
  it('detecta una operación financiera en curso sin borrar el intento original',async()=>{
    const f=await fixture();const operation=randomUUID();
    await pool.query("INSERT INTO billing_operations(operation_id,owner_type,owner_id,payload_hash,request_snapshot,fiscal_identity,stage) VALUES($1,'reservation',$2,'synthetic','{}','{}','prepared')",[operation,f.res]);
    const p=(await request(path(f)+'assignment-preview')).body;expect(p.canRelease).toBe(false);expect(p.blockers.join(' ')).toMatch(/operación financiera pendiente/);
    expect((await release(f,{},p)).status).toBe(409);
    expect((await pool.query('SELECT stage FROM billing_operations WHERE operation_id=$1',[operation])).rows[0].stage).toBe('prepared');
  });
  it('revierte toda la liberación si falla la auditoría, incluido el anticipo disponible y el cupo nuevo',async()=>{
    const f=await fixture();await groupReceipt(f);const preview=(await request(path(f)+'assignment-preview')).body;
    const before=await totals(f), trigger='fail_assignment_'+randomUUID().replaceAll('-','');
    // The trigger targets only this synthetic group; it cannot affect other fixtures.
    await pool.query(`CREATE FUNCTION ${trigger}() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.entity_id='${f.id}' THEN RAISE EXCEPTION 'Synthetic audit failure'; END IF; RETURN NEW; END $$`);
    await pool.query(`CREATE TRIGGER ${trigger} BEFORE INSERT ON audit_logs FOR EACH ROW EXECUTE FUNCTION ${trigger}()`);
    try{
      expect((await release(f,{},preview)).status).toBe(500);expect(await totals(f)).toEqual(before);
      expect((await pool.query('SELECT status FROM reservations WHERE id=$1',[f.res])).rows[0].status).toBe('confirmed');
      expect((await pool.query('SELECT * FROM group_assignment_releases WHERE group_id=$1',[f.id])).rows).toHaveLength(0);
      expect((await pool.query('SELECT * FROM group_reservation_links WHERE group_id=$1',[f.id])).rows).toHaveLength(2);
      expect((await request(`/api/groups/${f.id}/advance-availability`)).body.advances).toHaveLength(0);
    }finally{await pool.query(`DROP TRIGGER ${trigger} ON audit_logs`);await pool.query(`DROP FUNCTION ${trigger}()`);}
  });
  it('rechaza roles ajenos a Grupos y no permite usar la vía de placeholders para saltar la confirmación',async()=>{
    const f=await fixture();role='waiter';expect((await request(path(f)+'assignment-preview')).status).toBe(403);role='reception';
    const response=await request(`/api/groups/${f.id}/placeholder-reservations/${f.res}`,{guestId:'unreviewed-guest'},'PATCH');expect(response.status).toBe(409);
  });
});
