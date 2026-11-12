import { groupMoneyCents } from '@shared/groupAccount';
import { normalizeToSpanishPaymentMethod } from '../payment-method';
const parse = (value: any) => typeof value === 'string' ? JSON.parse(value) : value;
const directMethods = new Set(['efectivo', 'transferencia', 'tarjeta_debito', 'tarjeta_credito', 'mercadopago']);
/** An application must be proved by both the parent distribution and its children. */
export function groupAdvanceReceipt(receipt: any, children: any[]) {
    try {
        const detail = parse(receipt.distribution_detail);
        if (!detail || typeof detail !== 'object' || Array.isArray(detail))
            throw new Error('distribution');
        const amount = groupMoneyCents(receipt.amount);
        const rows = Object.entries(detail).map(([id, value]) => ({ id, cents: groupMoneyCents(value) }));
        const allocated = children.reduce((n, p) => n + groupMoneyCents(p.amount), 0);
        const assigned = rows.filter(r => !r.id.startsWith('__')).reduce((n, r) => n + r.cents, 0);
        const unassigned = rows.find(r => r.id === '__unassigned__')?.cents || 0;
        const expected = new Map(rows.filter(r => !r.id.startsWith('__')).map(r => [r.id, r.cents]));
        for (const child of children)
            expected.set(child.reservation_id, (expected.get(child.reservation_id) || 0) - groupMoneyCents(child.amount));
        if (rows.reduce((n, r) => n + r.cents, 0) !== amount || allocated !== assigned || [...expected.values()].some(n => n !== 0))
            throw new Error('applications');
        if (rows.some(r => r.id.startsWith('__') && !['__unassigned__', '__group_charges__'].includes(r.id) && r.cents))
            throw new Error('historical balance');
        // A receipt completely applied to verified destinations needs no new
        // instrument split. Its CC/retention settlement keeps its original ledger.
        if(unassigned===0)return {requiresReview:false,available:0,detail,budgets:new Map<string,number>()};
        const raw = parse(receipt.payment_method_detail);
        const instruments = Array.isArray(raw) && raw.length ? raw : [{ method: receipt.method, amount: receipt.amount }];
        // Retentions/CC require their own receivable and withholding reconciliation.
        // Never turn them into money or silently assign a different instrument.
        if (instruments.some(p => !directMethods.has(normalizeToSpanishPaymentMethod(p.method)) || Number(p.retention?.monto || 0) !== 0) || instruments.reduce((n, p) => n + groupMoneyCents(p.amount), 0) !== amount)
            throw new Error('instruments');
        const budgets = new Map<string, number>();
        for (const p of instruments) {
            const method = normalizeToSpanishPaymentMethod(p.method);
            budgets.set(method, (budgets.get(method) || 0) + groupMoneyCents(p.amount));
        }
        for (const p of children) {
            const method = normalizeToSpanishPaymentMethod(p.method);
            budgets.set(method, (budgets.get(method) || 0) - groupMoneyCents(p.amount));
        }
        if ([...budgets.values()].some(n => n < 0))
            throw new Error('methods');
        const reserved = rows.filter(r => r.id.startsWith('__') && r.id !== '__unassigned__').reduce((n, r) => n + r.cents, 0);
        if (unassigned && reserved)
            throw new Error('reserved instruments');
        return { requiresReview: false, available: unassigned / 100, detail, budgets };
    }
    catch {
        return { requiresReview: true, available: 0, detail: {}, budgets: new Map<string, number>() };
    }
}
