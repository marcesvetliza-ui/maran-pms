import { Checkbox } from '@/components/ui/checkbox';
import { useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { apiRequest, parseApiError } from '@/lib/queryClient';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { allocateBalanceCappedGroupRooms } from '@shared/groupRoomAllocation';
import { allocateGroupMoney, groupMoneyCents } from '@shared/groupAccount';
export function GroupAdvanceAllocation({ groupId, onSaved }: {
    groupId: string;
    onSaved: () => Promise<unknown>;
}) {
    const [receipt, setReceipt] = useState(''), [total, setTotal] = useState(''), [mode, setMode] = useState('equal');
    const [selected, setSelected] = useState<string[]>([]), [manual, setManual] = useState<Record<string, string>>({}), [error, setError] = useState('');
    const key = `group-advance-operation:${groupId}`;
    const [pending, setPending] = useState<any>(() => {
        try {
            return JSON.parse(sessionStorage.getItem(key) || 'null');
        }
        catch {
            return null;
        }
    });
    const query = useQuery<{
        advances: Array<{
            id: string;
            label: string;
            available: number;
        }>;
        rooms: Array<{
            id: string;
            number: string;
            name: string;
            balance: number;
        }>;
    }>({ queryKey: ['group-advance-availability', groupId], queryFn: async () => (await apiRequest('GET', `/api/groups/${groupId}/advance-availability`)).json() });
    const rooms = query.data?.rooms || [];
    const allocations = mode === 'manual' ? Object.fromEntries(Object.entries(manual).filter(([id, value]) => selected.includes(id) && Number(value) > 0).map(([id, value]) => [id, Number(value)])) : allocateBalanceCappedGroupRooms(Number(total), rooms.filter(r => selected.includes(r.id)), 'equal').allocations;
    const selectedTotal = Object.values(allocations).reduce((n, v) => n + v, 0);
    const money = (n: number) => n.toLocaleString('es-AR', { style: 'currency', currency: 'ARS' });
    const action = useMutation({ mutationFn: async () => {
            let body = pending;
            if (!body) {
                const cents = allocateGroupMoney(allocations);
                const amount = Object.values(cents).reduce((n, v) => n + v, 0);
                if (!receipt || amount > groupMoneyCents(query.data?.advances.find(a => a.id === receipt)?.available) || mode === 'equal' && amount !== groupMoneyCents(total) || Object.entries(cents).some(([id, v]) => v > groupMoneyCents(rooms.find(r => r.id === id)?.balance)))
                    throw new Error('Revisá el importe disponible y el saldo de las habitaciones seleccionadas.');
                body = { operationId: crypto.randomUUID(), receiptId: receipt, allocations };
                sessionStorage.setItem(key, JSON.stringify(body));
                setPending(body);
            }
            try {
                return await (await apiRequest('POST', `/api/groups/${groupId}/allocate-advance`, body)).json();
            }
            catch (e) {
                // Every conflict in this endpoint rolls back the entire allocation transaction.
                if (/^(400|409):/.test(String((e as Error).message))) {
                    sessionStorage.removeItem(key);
                    setPending(null);
                }
                throw e;
            }
        }, onSuccess: async () => { sessionStorage.removeItem(key); setPending(null); setError(''); setReceipt(''); setTotal(''); setManual({}); setSelected([]); await query.refetch(); await onSaved(); }, onError: e => setError(parseApiError(e)) });
    if (query.isLoading)
        return <p role="status">Consultando anticipos para asignar…</p>;
    if (query.isError)
        return <p role="alert">No se pudieron consultar los anticipos. <Button variant="outline" onClick={() => query.refetch()}>Actualizar anticipos</Button></p>;
    if (!query.data?.advances?.length && !pending)
        return null;
    const locked = action.isPending || !!pending;
    return <section className="space-y-3 rounded border p-3" aria-label="Asignación de anticipos del grupo">
  <p className="font-medium">Aplicar un anticipo existente</p>
  <p className="text-sm text-muted-foreground">Asigná el dinero ya recibido a una o varias habitaciones. No se registra otro ingreso en Caja.</p>
  <div className="flex flex-wrap gap-3"><label>Anticipo<select aria-label="Anticipo grupal a distribuir" value={receipt} disabled={locked} onChange={e => setReceipt(e.target.value)}><option value="">Elegir recibo</option>{query.data?.advances.map(a => <option key={a.id} value={a.id}>{a.label} · {money(a.available)}</option>)}</select></label><label>Reparto<select aria-label="Reparto del anticipo" value={mode} disabled={locked} onChange={e => setMode(e.target.value)}><option value="equal">Partes iguales, hasta el saldo de cada habitación</option><option value="manual">Importes individuales</option></select></label>{mode === 'equal' && <label>Importe a aplicar<Input aria-label="Importe del anticipo a aplicar" type="number" min="0.01" step="0.01" disabled={locked} value={total} onChange={e => setTotal(e.target.value)}/></label>}</div>
  <div className="grid gap-2 sm:grid-cols-2">{rooms.filter(r => r.balance > 0).map(r => <div key={r.id} className="flex items-center gap-2"><label className="flex items-center gap-2 text-sm"><Checkbox disabled={locked} checked={selected.includes(r.id)} onCheckedChange={value => setSelected(value === true ? [...selected, r.id] : selected.filter(id => id !== r.id))}/>Hab. {r.number || '—'} · {r.name} · saldo {money(r.balance)}</label>{mode === 'manual' && selected.includes(r.id) && <Input type="number" aria-label={`Aplicar anticipo a ${r.number || r.id}`} value={manual[r.id] || ''} min="0.01" step="0.01" disabled={locked} onChange={e => setManual({ ...manual, [r.id]: e.target.value })}/>}</div>)}</div>
  {!!selectedTotal && <p className="text-sm">Se aplicarán {money(selectedTotal)}: {Object.entries(allocations).filter(([, v]) => v > 0).map(([id, v]) => `Hab. ${rooms.find(r => r.id === id)?.number || '—'}: ${money(v)}`).join(' · ')}.</p>}
  <Button type="button" disabled={action.isPending || query.isFetching || (!pending && (!receipt || selectedTotal <= 0))} onClick={() => action.mutate()}>{pending ? 'Reintentar la misma asignación' : 'Confirmar asignación del anticipo'}</Button>
  {error && <p role="alert" className="text-destructive">{error}</p>}
 </section>;
}
