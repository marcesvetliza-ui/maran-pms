import { Checkbox } from '@/components/ui/checkbox';
import { useState, useRef } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { apiRequest, parseApiError, parseApiErrorPayload } from '@/lib/queryClient';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { getLocalToday } from '@/lib/utils';
export function GroupRoomAccount({ reservationId, onSaved, disabled = false }: {
    reservationId: string;
    onSaved: () => Promise<unknown>;
    disabled?: boolean;
}) {
    const [amount, setAmount] = useState(''), [method, setMethod] = useState('transferencia'), [reference, setReference] = useState(''), [receipt, setReceipt] = useState(''), [confirmNew, setConfirmNew] = useState(false), [error, setError] = useState('');
    const pendingKey = `group-room-operation:${reservationId}`;
    const [initialPending] = useState(() => { try {
        return JSON.parse(window.sessionStorage.getItem(pendingKey) || 'null');
    }
    catch {
        return null;
    } });
    const frozen = useRef<any>(initialPending);
    const [hasFrozen, setHasFrozen] = useState(!!frozen.current);
    const [operation, setOperation] = useState(() => crypto.randomUUID());
    const query = useQuery<any>({ queryKey: ['group-room-account', reservationId], queryFn: async () => (await apiRequest('GET', `/api/reservations/${reservationId}/group-account`)).json() });
    const action = useMutation({ mutationFn: async (kind: 'pay' | 'allocate') => {
            if (!frozen.current) {
                if (!/^\d{1,8}(?:\.\d{1,2})?$/.test(amount) || Number(amount) <= 0 || Number(amount) > Number(query.data.balance) + 0.009)
                    throw new Error('Ingresá un importe positivo, de hasta dos decimales, dentro del saldo de esta habitación.');
                if (kind === 'allocate' && Number(amount) > Number(query.data.advances.find((a: any) => a.id === receipt)?.available || 0) + 0.009)
                    throw new Error('El importe supera el anticipo disponible.');
                const endpoint = kind === 'pay' ? '/api/payments' : `/api/groups/${query.data.groupId}/allocate-advance`;
                const body = kind === 'pay' ? { reservationId, amount, method, date: getLocalToday(), reference: reference.trim() || null, notes: null, paymentRequestId: operation, paymentPurpose: 'group_room_collection', acknowledgeUnassignedAdvance: confirmNew, receiptType: 'none' } : { operationId: operation, receiptId: receipt, allocations: { [reservationId]: amount } };
                window.sessionStorage.setItem(pendingKey, JSON.stringify({ endpoint, body, kind }));
                frozen.current = { endpoint, body, kind };
                setHasFrozen(true);
            }
            return (await apiRequest('POST', frozen.current.endpoint, frozen.current.body)).json();
        }, onSuccess: async () => { window.sessionStorage.removeItem(pendingKey); frozen.current = null; setHasFrozen(false); setOperation(crypto.randomUUID()); setAmount(''); setError(''); await query.refetch(); await onSaved(); }, onError: (e) => { if (/^400:/.test(String((e as Error).message)) || (parseApiErrorPayload(e) as any)?.notApplied || frozen.current?.kind === 'allocate' && /^409:/.test(String((e as Error).message))) {
            sessionStorage.removeItem(pendingKey);
            frozen.current = null;
            setHasFrozen(false);
            setOperation(crypto.randomUUID());
        } setError(parseApiError(e) || 'No se completó la operación. Se conserva su clave para reintentar.'); } });
    if (query.isLoading)
        return <p role="status">Consultando cuenta compartida…</p>;
    if (query.isError)
        return <p role="alert">No se pudo consultar la cuenta del grupo. Actualizá antes de registrar un pago. <Button variant="outline" onClick={() => query.refetch()}>Actualizar cuenta</Button></p>;
    const account = query.data;
    const money = (v: number) => v.toLocaleString('es-AR', { style: 'currency', currency: 'ARS' });
    const blocked = disabled || action.isPending || query.isFetching;
    return <section className="space-y-3 rounded border p-3" aria-label="Cuenta de la habitación en el grupo"><div className="grid grid-cols-2 gap-2 text-sm sm:grid-cols-5">{[['Cargos', account.charges], ['Pagos aplicados', account.paid], ['Saldo por cobrar', account.balance], ['Pendiente de facturar', account.pendingInvoice], ['Anticipos sin asignar', account.unassigned]].map(([label, value]) => <div key={String(label)}><p className="text-muted-foreground">{label}</p><strong>{value === null ? "Requiere revisión" : money(Number(value))}</strong></div>)}</div>
 {account.fiscalRequiresReview && <p role="status">Hay comprobantes históricos del grupo sin detalle verificable por habitación. Se pueden registrar pagos; para emitir otra factura primero debe revisarse esa cobertura.</p>}
 {account.reviewReceipts?.length > 0 && <details className="text-sm"><summary>Recibos con distribución pendiente de revisión</summary><p>No se aplican automáticamente.</p><ul>{account.reviewReceipts.map((r:any)=><li key={r.id}>{r.label}: {money(r.amount)}</li>)}</ul></details>}
 <p className="text-sm">Podés registrar el pago sin emitir otra factura. La facturación pendiente se resuelve abajo, con los conceptos que aún no tienen comprobante.</p>
 <div className="flex flex-wrap items-end gap-2"><label className="text-sm">Importe<Input aria-label="Importe para la cuenta grupal" value={amount} disabled={blocked || hasFrozen} onChange={e => { setAmount(e.target.value); setOperation(crypto.randomUUID()); }} type="number" min="0.01" step="0.01"/></label><label className="text-sm">Medio<select aria-label="Medio del nuevo cobro" value={method} disabled={blocked || hasFrozen} onChange={e => { setMethod(e.target.value); setOperation(crypto.randomUUID()); }}>{[['transferencia', 'Transferencia'], ['efectivo', 'Efectivo'], ['tarjeta_debito', 'Tarjeta débito'], ['tarjeta_credito', 'Tarjeta crédito'], ['mercadopago', 'Mercado Pago']].map(([id, name]) => <option key={id} value={id}>{name}</option>)}</select></label><label className="text-sm">Referencia<Input value={reference} disabled={blocked || hasFrozen} onChange={e => { setReference(e.target.value); setOperation(crypto.randomUUID()); }}/></label><Button type="button" disabled={blocked || hasFrozen || Number(amount) <= 0 || !amount || ((account.unassigned > 0 || account.reviewReceipts?.length) && !confirmNew)} onClick={() => action.mutate('pay')}>Registrar pago sin facturar</Button></div>
 {(account.unassigned > 0 || account.reviewReceipts?.length > 0) && <div className="space-y-2"><label className="flex gap-2 text-sm"><Checkbox checked={confirmNew} disabled={blocked || hasFrozen} onCheckedChange={value => { setConfirmNew(value === true); setOperation(crypto.randomUUID()); }}/>Confirmo que registro dinero nuevo y mantengo los anticipos sin asignar.</label><div className="flex flex-wrap gap-2"><select aria-label="Anticipo disponible" value={receipt} disabled={blocked || hasFrozen} onChange={e => { setReceipt(e.target.value); setOperation(crypto.randomUUID()); }}><option value="">Elegir anticipo existente</option>{account.advances.map((a: any) => <option key={a.id} value={a.id}>{a.label} · disponible {money(a.available)}</option>)}</select><Button type="button" variant="outline" disabled={blocked || hasFrozen || !receipt || !amount || Number(amount) <= 0} onClick={() => action.mutate('allocate')}>Aplicar importe a esta habitación</Button></div></div>}
 {hasFrozen && <Button type="button" disabled={blocked} onClick={() => action.mutate(frozen.current.kind)}>Reintentar la misma operación</Button>}
 {error && <p role="alert" className="text-destructive">{error}</p>}
 </section>;
}
