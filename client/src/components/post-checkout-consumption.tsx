import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { apiRequest, parseApiError, parseApiErrorPayload, queryClient } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { Charge } from "@shared/schema";

type Request = { operationId: string; description: string; amount: string; category: string };
const key = (id: string) => `post-checkout-charge:${id}`;

export function PostCheckoutConsumption({ reservationId, onInvoice }: { reservationId: string; onInvoice: () => void }) {
  const [pending, setPending] = useState<Request | null>(() => {
    try { return JSON.parse(sessionStorage.getItem(key(reservationId)) || "null"); } catch { return null; }
  });
  const [description, setDescription] = useState(pending?.description || "");
  const [amount, setAmount] = useState(pending?.amount || "");
  const [category, setCategory] = useState(pending?.category || "otros");
  const [error, setError] = useState("");
  const query = useQuery<{ charges: Charge[] }>({ queryKey: ["post-checkout-charges", reservationId], staleTime: 0,
    queryFn: async () => (await apiRequest("GET", `/api/reservations/${reservationId}/post-checkout/charges`)).json() });
  const add = useMutation({ mutationFn: async () => {
    const request = pending || { operationId: crypto.randomUUID(), description: description.trim(), amount: amount.replace(",", "."), category };
    sessionStorage.setItem(key(reservationId), JSON.stringify(request)); setPending(request);
    return (await apiRequest("POST", `/api/reservations/${reservationId}/post-checkout/charges`, request)).json();
  }, onSuccess: async () => {
    sessionStorage.removeItem(key(reservationId)); setPending(null); setDescription(""); setAmount(""); setError("");
    await query.refetch();
    await queryClient.invalidateQueries({ queryKey: ["/api/reservations", reservationId] });
    queryClient.invalidateQueries({ queryKey: ["/api/folios"] });
  }, onError: e => {
    if ((parseApiErrorPayload(e) as { notApplied?: boolean } | null)?.notApplied) {
      sessionStorage.removeItem(key(reservationId)); setPending(null);
    }
    setError(parseApiError(e));
  } });
  const invalid = description.trim().length < 3 || !/^\d{1,8}(?:[.,]\d{1,2})?$/.test(amount) || Number(amount.replace(",", ".")) <= 0;
  return <div className="space-y-4">
    <p className="text-sm text-muted-foreground">Agregá consumos a la cuenta de esta estadía. El check-out y el estado actual de la habitación se conservan, aunque ya tenga otro huésped.</p>
    <div className="rounded border p-3 space-y-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="sm:col-span-2"><Label htmlFor="post-checkout-description">Descripción del consumo</Label><Input id="post-checkout-description" maxLength={500} value={description} disabled={!!pending || add.isPending} onChange={e => setDescription(e.target.value)} /></div>
        <div><Label htmlFor="post-checkout-category">Categoría</Label><select id="post-checkout-category" className="flex h-9 w-full rounded-md border bg-background px-3 text-sm" value={category} disabled={!!pending || add.isPending} onChange={e => setCategory(e.target.value)}>
          <option value="otros">Otros consumos</option><option value="restaurant">Restaurante</option><option value="spa">Spa</option><option value="minibar">Minibar</option>
        </select></div>
        <div><Label htmlFor="post-checkout-amount">Importe en pesos</Label><Input id="post-checkout-amount" inputMode="decimal" value={amount} disabled={!!pending || add.isPending} onChange={e => setAmount(e.target.value)} /></div>
      </div>
      {pending && !add.isPending && <p className="text-sm">Hay una carga pendiente de confirmar. Reintentá el mismo consumo para comprobar su registro sin duplicarlo.</p>}
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      <Button type="button" disabled={add.isPending || (!pending && invalid)} onClick={() => add.mutate()}>{add.isPending ? "Registrando…" : pending ? "Reintentar mismo consumo" : "Guardar consumo"}</Button>
    </div>
    <div className="space-y-2"><h3 className="font-medium">Consumos posteriores registrados</h3>
      {query.isLoading && <p role="status">Consultando consumos…</p>}
      {query.isError && <p role="alert" className="text-destructive">{parseApiError(query.error)}</p>}
      {query.data?.charges.length === 0 && <p className="text-sm text-muted-foreground">Todavía no hay consumos posteriores.</p>}
      {query.data?.charges.map(charge => <div key={charge.id} className="flex justify-between gap-3 rounded border p-2 text-sm"><span>{charge.description}<span className="block text-xs text-muted-foreground">{charge.date.split("-").reverse().join("/")}</span></span><span>${Number(charge.amount).toLocaleString("es-AR", { minimumFractionDigits: 2 })}</span></div>)}
    </div>
    <Button type="button" variant="outline" disabled={add.isPending || !!pending || !query.data?.charges.length} onClick={onInvoice}>Facturar o gestionar cobro</Button>
  </div>;
}
