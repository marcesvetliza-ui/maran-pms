import { randomUUID } from 'node:crypto';
import { beforeAll, afterAll, describe, it, expect } from 'vitest';

// Explicitly disposable local database. Never point this suite at hotel data.
const suite = process.env.DATABASE_URL==='postgresql://postgres:remito_test@127.0.0.1:55432/remito_test' ? describe : describe.skip;
let pool: typeof import('../db').pool;
let edit: typeof import('../billing/reservationInvoicePaymentEdit').editReservationInvoiceCashMethod;
const ids: string[]=[];
async function fixture(refOnly=false) {
  const id=randomUUID(); ids.push(id);
  await pool.query(`INSERT INTO reservations(id,reservation_code,guest_id,room_id,room_type_id,check_in_date,check_out_date,status,created_at)
    VALUES($1::text,$1::text,$1::text,$1::text,$1::text,'2031-01-01','2031-01-02','checked_in',now())`,[id]);
  await pool.query(`INSERT INTO cash_shifts(id,area,shift_number,status,opened_at) VALUES($1::text,'reception',991234,'open',now())`,[id]);
  await pool.query(`INSERT INTO payments(id,reservation_id,amount,method,date,status) VALUES($1::text,$1::text,163500,'credit_card','2031-01-01','active')`,[id]);
  const invoice=(await pool.query(`INSERT INTO sales_invoices(tipo_comprobante,punto_venta,numero,fecha_emision,cliente_razon_social,cliente_condicion_iva,monto_neto,monto_total,monto_acreditado,estado,reserva_id,payment_id,cash_forma_pago)
    VALUES('FA',9994,nextval('cash_movements_receipt_number_seq'),CURRENT_DATE,'Synthetic','Consumidor Final',163500,163500,0,'emitida',$1::text,$2,'tarjeta_credito') RETURNING id`,[id,refOnly?null:id])).rows[0].id;
  await pool.query(`UPDATE payments SET invoice_ref=$2 WHERE id=$1::text`,[id,JSON.stringify({id:invoice,cae:'synthetic-preserve',tipoComprobante:'FA'})]);
  await pool.query(`INSERT INTO cash_movements(id,shift_id,area,source_type,source_id,payment_method,amount,movement_type,payment_id)
    VALUES($1::text,$1::text,'reception','reservation',$1::text,'credit_card',163500,'income',$1::text)`,[id]);
  await pool.query(`INSERT INTO folios(id,codigo,entity_type,entity_id,total_charges,total_payments,balance) VALUES($1::text,$1::text,'reservation',$1::text,163500,163500,0)`,[id]);
  await pool.query(`INSERT INTO folio_movements(id,folio_id,type,amount,description,source_type,source_id,payment_method,cash_movement_id)
    VALUES($1::text,$1::text,'payment',163500,'Synthetic credit card','payment',$1::text,'credit_card',$1::text)`,[id]);
  return {id,invoice};
}
async function state(f:{id:string,invoice:number}) {
  return {
    payments:(await pool.query('SELECT * FROM payments WHERE reservation_id=$1::text ORDER BY id',[f.id])).rows,
    cash:(await pool.query('SELECT * FROM cash_movements WHERE payment_id=$1::text ORDER BY id',[f.id])).rows,
    folio:(await pool.query('SELECT * FROM folios WHERE id=$1::text',[f.id])).rows,
    movements:(await pool.query('SELECT * FROM folio_movements WHERE folio_id=$1::text ORDER BY id',[f.id])).rows,
    invoice:(await pool.query('SELECT * FROM sales_invoices WHERE id=$1',[f.invoice])).rows,
    invoiceHistory:(await pool.query('SELECT * FROM sales_invoices WHERE reserva_id=$1 ORDER BY id',[f.id])).rows,
  };
}
async function reapplicationFixture(explicitRelease=false) {
  const f=await fixture(),original=f.invoice;
  await pool.query("UPDATE sales_invoices SET estado='anulada',monto_acreditado=monto_total WHERE id=$1",[original]);
  const note=(await pool.query(`INSERT INTO sales_invoices(tipo_comprobante,punto_venta,numero,fecha_emision,cliente_razon_social,cliente_condicion_iva,monto_neto,monto_total,estado,reserva_id,nota_credito_id,reconciliation_status)
    VALUES('NCA',9994,nextval('cash_movements_receipt_number_seq'),CURRENT_DATE,'Synthetic','Consumidor Final',163500,163500,'emitida',$1,$2,'conciliada') RETURNING id`,[f.id,original])).rows[0].id;
  const target=(await pool.query(`INSERT INTO sales_invoices(tipo_comprobante,punto_venta,numero,fecha_emision,cliente_razon_social,cliente_condicion_iva,monto_neto,monto_total,monto_acreditado,estado,reserva_id,cash_forma_pago,reconciliation_status,credit_reapplication_intent)
    VALUES('FA',9994,nextval('cash_movements_receipt_number_seq'),CURRENT_DATE,'Synthetic','Consumidor Final',163500,163500,0,'emitida',$1,'tarjeta_credito','conciliada',$2::jsonb) RETURNING id`,[f.id,JSON.stringify({operationId:randomUUID(),invoiceTotal:163500,status:'completed',payments:[{paymentId:f.id,amount:163500}],ordinaryAdvances:[]})])).rows[0].id;
  await pool.query('UPDATE payments SET invoice_ref=$2 WHERE id=$1',[f.id,JSON.stringify({id:original,cae:'synthetic-preserve',reapplications:[{invoiceId:target,tipoComprobante:'FA',amount:163500}],...(explicitRelease?{fundingReleases:{[String(original)]:16350000}}:{})})]);
  return {...f,invoice:target,original,note};
}
suite('Invoice payment correction against real PostgreSQL',()=>{
  beforeAll(async()=>{({pool}=await import('../db'));({editReservationInvoiceCashMethod:edit}=await import('../billing/reservationInvoicePaymentEdit'));});
  afterAll(async()=>{
    for(const id of ids) {
      await pool.query('DELETE FROM reservation_changelog WHERE reservation_id=$1::text',[id]);
      await pool.query('DELETE FROM folio_movements WHERE folio_id=$1::text',[id]);
      await pool.query('DELETE FROM folios WHERE id=$1::text',[id]);
      await pool.query('DELETE FROM cash_movements WHERE source_id=$1::text',[id]);
      await pool.query('DELETE FROM sales_invoices WHERE reserva_id=$1::text',[id]);
      await pool.query('DELETE FROM payments WHERE reservation_id=$1::text',[id]);
      await pool.query('DELETE FROM cash_shifts WHERE id=$1::text',[id]);
      await pool.query('DELETE FROM reservations WHERE id=$1::text',[id]);
    }
    await pool?.end();
  });
  it.each([false,true])('changes credit to debit, preserving fiscal identity, payment and balances (refOnly=%s)',async(refOnly)=>{
    const f=await fixture(refOnly),before=await state(f);
    const updated=await edit(f.invoice,'tarjeta_debito','Synthetic operator') as any;
    expect(updated.cash_forma_pago).toBe('tarjeta_debito');
    const after=await state(f);
    expect(after.payments).toHaveLength(1);
    expect(after.payments[0]).toEqual({...before.payments[0],method:'tarjeta_debito'});
    expect(after.folio).toEqual(before.folio);
    expect(after.cash.filter(c=>!c.anulado)).toEqual([expect.objectContaining({shift_id:f.id,payment_id:f.id,amount:'163500.00',payment_method:'tarjeta_debito'})]);
    expect(after.cash).toEqual([{...before.cash[0],payment_method:'tarjeta_debito'}]);
    expect(after.movements.filter(m=>m.type==='payment')).toHaveLength(1);
    expect(after.movements.find(m=>m.type==='payment')).toMatchObject({amount:'163500.00',payment_method:'tarjeta_debito',cash_movement_id:after.cash.find(c=>!c.anulado)?.id});
    expect(after.invoice[0]).toEqual({...before.invoice[0],cash_forma_pago:'tarjeta_debito',cash_forma_pago_detalle:[{method:'tarjeta_debito',amount:163500}]});
    await edit(f.invoice,'tarjeta_debito','Synthetic operator');
    expect(await state(f)).toEqual(after); // retry cannot generate another receipt
  });
  it.each(['closed','missing-cash','mismatch','credit','shared','cc','voided','no-link'])('rejects %s without modifying any financial row',async(kind)=>{
    const f=await fixture();
    if(kind==='closed')await pool.query("UPDATE cash_shifts SET status='closed' WHERE id=$1::text",[f.id]);
    if(kind==='missing-cash')await pool.query('DELETE FROM cash_movements WHERE id=$1::text',[f.id]);
    if(kind==='mismatch')await pool.query('UPDATE cash_movements SET amount=1 WHERE id=$1::text',[f.id]);
    if(kind==='credit')await pool.query('UPDATE sales_invoices SET monto_acreditado=100 WHERE id=$1',[f.invoice]);
    if(kind==='shared')await pool.query('UPDATE payments SET invoice_ref=$2 WHERE id=$1::text',[f.id,JSON.stringify({id:f.invoice,reapplications:[{invoiceId:9,amount:10}]})]);
    if(kind==='cc')await pool.query("UPDATE payments SET method='cuenta_corriente' WHERE id=$1::text",[f.id]);
    if(kind==='voided')await pool.query("INSERT INTO folio_movements(id,folio_id,type,amount,description,voided_movement_id) VALUES($1::text,$2,'void',-163500,'Synthetic',$2)",[randomUUID(),f.id]);
    if(kind==='no-link'){await pool.query('UPDATE sales_invoices SET payment_id=null WHERE id=$1',[f.invoice]);await pool.query('UPDATE payments SET invoice_ref=null WHERE id=$1::text',[f.id]);}
    const before=await state(f);
    await expect(edit(f.invoice,'tarjeta_debito','Synthetic operator')).rejects.toMatchObject({statusCode:kind==='closed'?403:409});
    expect(await state(f)).toEqual(before);
  });
  it('rolls back all writes if the correction audit insert fails',async()=>{
    const f=await fixture(),before=await state(f);
    await expect(edit(f.invoice,'tarjeta_debito','bad\0operator')).rejects.toBeTruthy();
    expect(await state(f)).toEqual(before);
  });
  it('serializes concurrent retries without duplicating the payment',async()=>{
    const f=await fixture();
    await Promise.allSettled([edit(f.invoice,'tarjeta_debito','Synthetic'),edit(f.invoice,'tarjeta_debito','Synthetic')]);
    const after=await state(f);
    expect(after.payments).toHaveLength(1);
    expect(after.payments[0].method).toBe('tarjeta_debito');
    expect(after.cash.filter(c=>!c.anulado)).toHaveLength(1);
    expect(after.cash).toHaveLength(1);
    expect(after.folio[0].balance).toBe('0.00');
  });
  it.each([false,true])('corrects one fully released/reapplied receipt, retaining NC/original/fiscal links (explicit release=%s)',async(explicit)=>{
    const f=await reapplicationFixture(explicit),before=await state(f);
    await edit(f.invoice,'tarjeta_debito','Synthetic operator');
    const after=await state(f);
    expect(after.payments).toEqual([{...before.payments[0],method:'tarjeta_debito'}]);
    expect(after.cash).toEqual([{...before.cash[0],payment_method:'tarjeta_debito'}]);
    expect(after.folio).toEqual(before.folio);
    expect(after.invoiceHistory.filter(i=>i.id!==f.invoice)).toEqual(before.invoiceHistory.filter(i=>i.id!==f.invoice));
    expect(after.invoice[0]).toEqual({...before.invoice[0],cash_forma_pago:'tarjeta_debito',cash_forma_pago_detalle:[{method:'tarjeta_debito',amount:163500}]});
    expect(after.movements.filter(m=>m.type==='payment')).toHaveLength(1);
    expect(after.movements.find(m=>m.type==='adjustment')?.description).toContain('tarjeta_credito → tarjeta_debito');
    await edit(f.invoice,'tarjeta_debito','Synthetic operator');
    expect(await state(f)).toEqual(after);
  });
  it.each(['missing-nc','unreconciled-nc','pending-application','partial-application','extra-application','wrong-payment','partial-credit','restored-credit','invalid-release','closed-shift','cash-mismatch'])('refuses unsafe reapplied credit: %s',async(kind)=>{
    const f=await reapplicationFixture(true);
    if(kind==='missing-nc')await pool.query('DELETE FROM sales_invoices WHERE id=$1',[f.note]);
    if(kind==='unreconciled-nc')await pool.query("UPDATE sales_invoices SET reconciliation_status='pendiente' WHERE id=$1",[f.note]);
    if(kind==='pending-application')await pool.query(`UPDATE sales_invoices SET credit_reapplication_intent=jsonb_set(credit_reapplication_intent,'{status}','"pending"') WHERE id=$1`,[f.invoice]);
    if(kind==='partial-application')await pool.query(`UPDATE payments SET invoice_ref=jsonb_set(invoice_ref::jsonb,'{reapplications,0,amount}','100')::text WHERE id=$1`,[f.id]);
    if(kind==='extra-application')await pool.query(`UPDATE payments SET invoice_ref=jsonb_set(invoice_ref::jsonb,'{reapplications}',(invoice_ref::jsonb->'reapplications')||'[ {"invoiceId":999999,"amount":1} ]'::jsonb)::text WHERE id=$1`,[f.id]);
    if(kind==='wrong-payment')await pool.query(`UPDATE sales_invoices SET credit_reapplication_intent=jsonb_set(credit_reapplication_intent,'{payments,0,paymentId}','"other"') WHERE id=$1`,[f.invoice]);
    if(kind==='partial-credit')await pool.query('UPDATE sales_invoices SET monto_acreditado=100 WHERE id=$1',[f.original]);
    if(kind==='restored-credit')await pool.query(`UPDATE payments SET invoice_ref=jsonb_set(invoice_ref::jsonb,ARRAY['fundingReleases',$2::text],'100')::text WHERE id=$1`,[f.id,String(f.original)]);
    if(kind==='invalid-release')await pool.query(`UPDATE payments SET invoice_ref=jsonb_set(invoice_ref::jsonb,ARRAY['fundingReleases',$2::text],'"invalid"')::text WHERE id=$1`,[f.id,String(f.original)]);
    if(kind==='closed-shift')await pool.query("UPDATE cash_shifts SET status='closed' WHERE id=$1",[f.id]);
    if(kind==='cash-mismatch')await pool.query('UPDATE cash_movements SET amount=1 WHERE id=$1',[f.id]);
    const before=await state(f);
    await expect(edit(f.invoice,'tarjeta_debito','Synthetic operator')).rejects.toMatchObject({statusCode:kind==='closed-shift'?403:409});
    expect(await state(f)).toEqual(before);
  });
  it('rolls back a reapplied correction if audit persistence fails',async()=>{
    const f=await reapplicationFixture(),before=await state(f);
    await expect(edit(f.invoice,'tarjeta_debito','bad\0operator')).rejects.toBeTruthy();
    expect(await state(f)).toEqual(before);
  });
});
