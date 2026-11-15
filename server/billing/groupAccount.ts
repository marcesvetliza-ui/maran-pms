import {reservationGroupSources} from '@shared/reservationGroupSources';
import { hasProvableGroupCoverage } from './groupCoverageEvidence';
import { parseReservationPaymentRequest, assertPaymentRequestMatches } from '../reservationPaymentRequest';
import { randomUUID } from 'node:crypto';
import { sql } from 'drizzle-orm';
import type { Express } from 'express';
import { db } from '../db';
import { requireAuth, requirePermission } from '../auth';
import { storage } from '../db-storage';
import { getGroupInvoiceSnapshot, parseGroupInvoiceSourceAmounts } from './groupInvoiceScope';
import { withFinancialScopeLock, withReservationFinancialLock } from '../nightlyPricingGuard';
import { groupAdvanceReceipt } from './groupAdvanceReceipt';
import { allocateGroupMoney, groupMoneyCents } from '@shared/groupAccount';
import {isUncollectedRoomInvoice} from './reservationInvoiceCollection';
import {getArgentinaToday} from '../db-storage';
const fail = (message: string, statusCode = 409) => Object.assign(new Error(message), { statusCode });
const parse = (v: any) => { try {
    return typeof v === 'string' ? JSON.parse(v) : v;
}
catch {
    return null;
} };
export async function groupAccountSnapshot(reservationId: string) {
    const reservation = await storage.getReservation(reservationId);
    if (!reservation)
        throw fail('Reserva no encontrada.', 404);
    const links = (await db.execute(sql `SELECT group_id FROM group_reservation_links WHERE reservation_id=${reservationId}`)).rows as any[];
    if (links.length !== 1)
        throw fail('La reserva debe pertenecer a un único grupo.');
    const groupId = String(links[0].group_id);
    const [ledger, billing, receipts, invoices] = await Promise.all([
        storage.getGroupReservationLedger(groupId), getGroupInvoiceSnapshot(groupId),
        db.execute(sql `SELECT gp.*,coalesce((SELECT jsonb_agg(jsonb_build_object('reservation_id',p.reservation_id,'amount',p.amount,'method',p.method)) FROM payments p WHERE p.group_payment_id=gp.id AND coalesce(p.status,'active')<>'anulado'),'[]'::jsonb) children FROM group_payments gp WHERE gp.group_id=${groupId} ORDER BY gp.date,gp.id`),
        db.execute(sql `SELECT si.*,coalesce((SELECT jsonb_agg(n.source_charge_amounts) FROM sales_invoices n WHERE n.nota_credito_id=si.id AND n.tipo_comprobante IN ('NCA','NCB','NCC','NCT','NCM','NCMB') AND n.estado IN ('emitida','parcial','anulada') AND (n.reconciliation_status IS NULL OR n.reconciliation_status='conciliada')),'[]'::jsonb) credit_source_charge_amounts FROM sales_invoices si WHERE (si.group_id=${groupId} OR (si.group_id IS NULL AND si.reserva_id=${reservationId})) AND si.tipo_comprobante IN ('FA','FB','FC','FT','FM','FMB') AND si.estado IN ('emitida','parcial','autorizacion_pendiente')`),
    ]);
    const room = ledger.find(r => r.reservationId === reservationId);
    if (!room)
        throw fail('La reserva no tiene un saldo grupal verificable.');
    const sourceIds=new Set(billing.sources.map(source=>source.id));
    const fiscalRequiresReview = (invoices.rows as any[]).some(invoice => {
        if(Number(invoice.monto_total)<=Number(invoice.monto_acreditado||0)+0.009)return false;
        let amounts=parse(invoice.source_charge_amounts);
        if(invoice.group_id==null){
            if(!amounts||typeof amounts!=='object'||Array.isArray(amounts)||Object.values(amounts).some(value=>!Number.isFinite(Number(value))||Number(value)<=0))return true;
            if(Object.values(amounts).reduce((n:number,v:any)=>n+Math.round(Number(v)*100),0)!==Math.round(Number(invoice.monto_total)*100))return true;
            amounts=reservationGroupSources(reservationId,amounts);
        }else if(!hasProvableGroupCoverage(invoice))return true;
        return Object.keys(amounts||{}).some(id=>!sourceIds.has(id));
    });
    const groupCoverage: Record<string, number> = {};
    for (const invoice of (invoices.rows as any[]).filter(row=>row.group_id===groupId)) {
        for (const [id, amount] of Object.entries(parseGroupInvoiceSourceAmounts(invoice))) {
            const prefix = `reservation:${reservationId}:`;
            if (!id.startsWith(prefix))
                continue;
            const own = id === prefix + 'accommodation' ? 'accommodation' : id.startsWith(prefix + 'charge:') ? id.slice((prefix + 'charge:').length) : null;
            if (own)
                groupCoverage[own] = (Math.round((groupCoverage[own] || 0)*100) + Math.round(amount*100))/100;
        }
    }
    const receiptFacts = (receipts.rows as any[]).map(p => {
        const facts = groupAdvanceReceipt(p, parse(p.children) || []);
        return { id: p.id, label: p.reference || `Recibo ${p.receipt_number || p.id}`, amount: Number(p.amount), requiresReview: facts.requiresReview, available: facts.available };
    });
    const advances = receiptFacts.filter(p => p.available > 0), reviewReceipts = receiptFacts.filter(p => p.requiresReview);
    const sources = billing.sources.filter(s => s.id.startsWith(`reservation:${reservationId}:`));
    const chargeCents=Math.round(room.accommodationTotal*100)+Math.round(room.extrasTotal*100);
    const paidCents=Math.round(room.paymentsTotal*100);
    return {
        groupId,reservationId,status:reservation.status,roomNumber:room.roomNumber,
        charges:chargeCents/100,paid:paidCents/100,balance:Math.max(0,chargeCents-paidCents)/100,
        pendingInvoice:fiscalRequiresReview?null:sources.reduce((n,s)=>n+Math.round(s.available*100),0)/100,
        fiscalRequiresReview,groupCoverage,advances,reviewReceipts,
        collectibleInvoices:(invoices.rows as any[]).filter(invoice=>invoice.reserva_id===reservationId&&isUncollectedRoomInvoice(invoice)).map(invoice=>({id:invoice.id,type:invoice.tipo_comprobante,pointOfSale:invoice.punto_venta,number:invoice.numero,amount:Number(invoice.monto_total)})),
        unassigned:advances.reduce((n,p)=>n+Math.round(p.available*100),0)/100,
    };
}
export function registerGroupAccountRoutes(app: Express) {
    app.post('/api/reservations/:id/invoices/:invoiceId/collect', requireAuth, requirePermission('sidebar:/reservations'), async(req,res)=>{
        try{
            const invoiceId=Number(req.params.invoiceId);
            if(!Number.isSafeInteger(invoiceId)||invoiceId<=0)throw fail('Factura inválida.',400);
            if(!['efectivo','transferencia','tarjeta_debito','tarjeta_credito','mercadopago'].includes(req.body.method))throw fail('Elegí un medio de pago directo.',400);
            const body={...req.body,reservationId:req.params.id,invoiceId};
            const identity=parseReservationPaymentRequest(body,String(req.user?.id||req.user?.username||''));
            if(!identity)throw fail('El cobro requiere una clave de operación.',400);
            const amount=(groupMoneyCents(body.amount)/100).toFixed(2);
            const payment=await withReservationFinancialLock(req.params.id,()=>storage.createReservationPaymentWithLedger({
                paymentRequest:identity,invoiceCollection:{invoiceId,acknowledgeUnassignedAdvance:body.acknowledgeUnassignedAdvance===true,userId:req.user?.id},
                payment:{reservationId:req.params.id,amount,method:body.method,date:getArgentinaToday(),reference:body.reference||null,notes:`Cobro de factura emitida #${invoiceId}`},
                sourceLabel:`Cobro de factura emitida #${invoiceId}`,registeredBy:req.user?.username,
            }));
            res.status(payment.paymentRequestReplayed?200:201).json(payment);
        }catch(e:any){res.status(e.statusCode||500).json({error:e.message,notApplied:e.notApplied===true});}
    });
    app.get('/api/reservations/:id/group-account', requireAuth, requirePermission('sidebar:/reservations'), async (req, res) => {
        try {
            res.json(await groupAccountSnapshot(req.params.id));
        }
        catch (e: any) {
            res.status(e.statusCode || 500).json({ error: e.message });
        }
    });
    app.get('/api/groups/:id/advance-availability', requireAuth, requirePermission('sidebar:/reservations'), async (req, res) => {
        try {
            const rooms = await storage.getGroupReservationLedger(req.params.id);
            if (!rooms.length)
                return res.json({ advances: [], rooms: [] });
            const account = await groupAccountSnapshot(rooms[0].reservationId);
            res.json({ advances: account.advances, rooms: rooms.map(r => ({ id: r.reservationId, number: r.roomNumber, name: r.guestName, balance: Math.max(0, Math.round(r.accommodationTotal*100)+Math.round(r.extrasTotal*100)-Math.round(r.paymentsTotal*100))/100 })) });
        }
        catch (e: any) {
            res.status(e.statusCode || 500).json({ error: e.message });
        }
    });
    // Explicit allocations are ledger applications of an existing receipt. No new Caja movement.
    app.post('/api/groups/:id/allocate-advance', requireAuth, requirePermission('sidebar:/reservations'), async (req, res) => {
        try {
            const { operationId, receiptId, allocations } = req.body;
            if (typeof operationId !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(operationId) || typeof receiptId !== 'string')
                throw fail('Operación de asignación inválida.', 400);
            const normalized = allocateGroupMoney(allocations);
            const total = Object.values(normalized).reduce((n, v) => n + v, 0);
            const result = await withFinancialScopeLock(`group-invoice:${req.params.id}`, () => db.transaction(async (tx) => {
                await tx.execute(sql `SELECT pg_advisory_xact_lock(hashtext(${`group-account-request:${operationId.toLowerCase()}`}))`);
                const identity = parseReservationPaymentRequest({ paymentRequestId: operationId, groupId: req.params.id, receiptId, allocations: normalized }, String(req.user?.id || req.user?.username || ''))!;
                const prior = (await tx.execute(sql `SELECT group_payment_id,fingerprint FROM group_account_operations WHERE id=${identity.id}`)).rows[0] as any;
                if (prior) {
                    assertPaymentRequestMatches({ paymentRequestFingerprint: prior.fingerprint }, identity);
                    if(!(await tx.execute(sql`SELECT id FROM group_payments WHERE id=${prior.group_payment_id}`)).rows.length)throw fail('El recibo de esta asignación fue anulado. No se aplicó nuevamente.');
                    return { replayed: true };
                }
                let firstApplication = true;
                const groups = (await tx.execute(sql `SELECT id FROM groups WHERE id=${req.params.id} FOR UPDATE`)).rows;
                if (!groups.length)
                    throw fail('Grupo no encontrado.', 404);
                const parent = (await tx.execute(sql `SELECT * FROM group_payments WHERE id=${receiptId} AND group_id=${req.params.id} FOR UPDATE`)).rows[0] as any;
                if (!parent)
                    throw fail('Recibo no encontrado en este grupo.');
                const assigned = (await tx.execute(sql `SELECT reservation_id,method,amount FROM payments WHERE group_payment_id=${receiptId} AND coalesce(status,'active')<>'anulado'`)).rows as any[];
                const facts = groupAdvanceReceipt(parent, assigned);
                if (facts.requiresReview)
                    throw fail('La distribución o los medios del recibo requieren conciliación antes de asignarlo.');
                if (total > Math.round(facts.available * 100))
                    throw fail('La asignación supera el anticipo todavía disponible.');
                const detail: Record<string, any> = facts.detail;
                const budgets = facts.budgets;
                detail.__unassigned__ = (Math.round(facts.available * 100) - total) / 100;
                const ref = parent.invoice_ref || (parent.invoice_id ? JSON.stringify({ id: parent.invoice_id }) : null);
                for (const [reservationId, cents] of Object.entries(normalized)) {
                    const room = (await tx.execute(sql `SELECT r.id,r.status,coalesce(r.total_room_amount,r.final_rate_per_night*r.nights,0)::numeric+coalesce((SELECT sum(c.amount::numeric) FROM charges c WHERE c.reservation_id=r.id AND coalesce(c.status,'active')<>'anulado'),0)-coalesce((SELECT sum(p.amount::numeric) FROM payments p WHERE p.reservation_id=r.id AND coalesce(p.status,'active')<>'anulado'),0) balance FROM reservations r JOIN group_reservation_links gl ON gl.reservation_id=r.id WHERE r.id=${reservationId} AND gl.group_id=${req.params.id} FOR UPDATE OF r`)).rows[0] as any;
                    if (!room || !['confirmed', 'checked_in', 'checked_out'].includes(room.status) || cents > Math.max(0, Math.round(Number(room.balance) * 100)))
                        throw fail('La asignación supera el saldo de una habitación activa de este grupo.');
                    let left = cents;
                    for (const [method, budget] of budgets) {
                        const take = Math.min(left, budget);
                        if (take <= 0)
                            continue;
                        await tx.execute(sql `INSERT INTO payments(id,reservation_id,amount,method,date,reference,notes,status,group_payment_id,invoice_ref,payment_request_id,payment_request_fingerprint) VALUES(${randomUUID()},${reservationId},${(take / 100).toFixed(2)},${method},${parent.date},${parent.reference || null},${`Asignación explícita de anticipo grupal · ${identity.id}`},'active',${receiptId},${ref},${firstApplication ? identity.id : null},${firstApplication ? identity.fingerprint : null})`);
                        firstApplication = false;
                        budgets.set(method, budget - take);
                        left -= take;
                    }
                    if (left)
                        throw fail('Los medios de pago no cubren la asignación.');
                    detail[reservationId] = (groupMoneyCents(detail[reservationId] || 0) + cents) / 100;
                }
                await tx.execute(sql`INSERT INTO group_account_operations(id,fingerprint,group_id,group_payment_id) VALUES(${identity.id},${identity.fingerprint},${req.params.id},${receiptId})`);
                await tx.execute(sql `UPDATE group_payments SET distribution_detail=${JSON.stringify(detail)}::jsonb WHERE id=${receiptId}`);
                await tx.execute(sql `INSERT INTO audit_logs(user_id,user_name,action,module,entity_type,entity_id,description,details,timestamp) VALUES(${req.user?.id || null},${req.user?.username || null},'update','groups','group_payment',${receiptId},'Asignación de anticipo existente; sin nuevo cobro',${JSON.stringify({ operationId, groupId: req.params.id, allocations: normalized })},now())`);
                return { replayed: false };
            }));
            res.json(result);
        }
        catch (e: any) {
            res.status(e.statusCode || 500).json({ error: e.message });
        }
    });
}
