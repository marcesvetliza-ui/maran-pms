import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest, apiRequestWithGroupInventoryWarning } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { editNights, nightlyTotal, calendarNights, type PricedNight, type NightlyEdit } from "@shared/nightlyPricing";
import { Pencil, CalendarDays, Lock } from "lucide-react";
import "./reservation-wide-folio.css";

const money = (cents: number) => (cents / 100).toLocaleString("es-AR", { style: "currency", currency: "ARS" });
const dateLabel = (date: string) => date.split("-").reverse().join("/");
type State = { reservation: any; blocked: string | null; fiscal: { state: string; coveredCents: number | null; pendingCents: number | null } };
async function jsonGet(path: string) {
  const response = await fetch(path, { credentials: "include" });
  if (!response.ok) throw new Error("No se pudo cargar el alojamiento. Reintentá antes de modificar.");
  return response.json();
}
export function ReservationNightlyPricing({ reservationId, role, onLegacyEdit }: {
  reservationId: string; role?: string; onLegacyEdit?: () => void;
}) {
  const { toast } = useToast();
  const key = ["/api/reservations", reservationId, "nightly-pricing"];
  const state = useQuery<State>({ queryKey: key, queryFn: () => jsonGet(`/api/reservations/${reservationId}/nightly-pricing`), staleTime: 0, refetchOnMount: "always" });
  const activation = useQuery<{ activatedAt: string | null; timeZone: string }>({
    queryKey: ["/api/reservation-pricing/activation"], queryFn: () => jsonGet("/api/reservation-pricing/activation"),
  });
  const [selected, setSelected] = useState<string[]>([]);
  const [mode, setMode] = useState<"rates" | "stay" | null>(null);
  const [rate, setRate] = useState("");
  const [discountMode, setDiscountMode] = useState<"percent" | "amount">("amount");
  const [discounts, setDiscounts] = useState({ percent: "", amount: "" });
  const [scope, setScope] = useState<"night" | "selection">("night");
  const [reason, setReason] = useState("");
  const [checkIn, setCheckIn] = useState("");
  const [checkOut, setCheckOut] = useState("");
  const [addedRates, setAddedRates] = useState<Record<string, string>>({});
  const [preview, setPreview] = useState<any>(null);
  const [editorSnapshot, setEditorSnapshot] = useState<any>(null);
  const [error, setError] = useState("");
  const reservation = state.data?.reservation;
  const nights: PricedNight[] = reservation?.nightlyPricing || [];
  const originalNights: PricedNight[] = mode && editorSnapshot ? editorSnapshot.nightlyPricing : nights;
  const stale = mode && editorSnapshot && reservation?.pricingRevision !== editorSnapshot.pricingRevision;
  useEffect(() => {
    setMode(null); setSelected([]); setPreview(null); setEditorSnapshot(null); setReason(""); setError("");
  }, [reservationId]);
  const nightly = reservation?.pricingScheme === "nightly_v1";
  const canWrite = ["admin", "manager", "reception", "jefe_recepcion", "comercial"].includes(role || "");
  const closed = ["checked_out", "cancelled", "no_show"].includes(reservation?.status);
  const blocked = state.data?.blocked || (closed ? "Reserva cerrada: alojamiento en sólo lectura." : "");
  const invalidatePreview = () => { setPreview(null); setError(""); };
  const start = (value: "rates" | "stay", dates = selected) => {
    setSelected(dates.length ? dates : nights.map(n => n.date));
    setMode(value); setRate(""); setDiscounts({ percent: "", amount: "" }); setReason("");
    setEditorSnapshot({ ...reservation, nightlyPricing: nights.map(n => ({ ...n })) });
    setCheckIn(reservation.checkInDate); setCheckOut(reservation.checkOutDate); setAddedRates({});
    invalidatePreview(); void state.refetch();
  };
  let edit: NightlyEdit = mode === "stay"
    ? { kind: "stay", checkIn, checkOut, addedRates }
    : { kind: "rates", dates: selected, rate, discount: discounts[discountMode], discountMode, discountScope: scope };
  let localAfter: PricedNight[] = [], localError = "";
  if (mode && nightly) {
    try { localAfter = editNights(originalNights, edit); }
    catch (e: any) { localError = e.message; }
  }
  let newDates: string[] = [];
  if (mode === "stay") try { newDates = calendarNights(checkIn, checkOut).filter(d => !originalNights.some(n => n.date === d)); } catch {}
  const requestBody = () => ({ revision: editorSnapshot.pricingRevision, reason, edit });
  const save = useMutation({
    mutationFn: async (apply: boolean) => {
      const response = await apiRequestWithGroupInventoryWarning("POST", `/api/reservations/${reservationId}/nightly-pricing/${apply ? "apply" : "preview"}`, requestBody());
      return { data: await response.json(), apply };
    },
    onSuccess: ({ data, apply }) => {
      if (!apply) { setPreview(data); return; }
      queryClient.setQueryData(["/api/reservations", reservationId], (previous: any) => ({ ...previous, ...data }));
      void queryClient.invalidateQueries({ queryKey: ["/api/reservations"] });
      void queryClient.invalidateQueries({ queryKey: ["/api/planning"] });
      void queryClient.invalidateQueries({ queryKey: ["/api/reservation-changelog", reservationId] });
      void queryClient.invalidateQueries({ queryKey: ["/api/reservations", reservationId, "changelog"] });
      setMode(null); setSelected([]);
      toast({ title: "Alojamiento actualizado", description: "El detalle y el total se guardaron con motivo e historial. No se modificaron los cobros." });
    },
    onError: (e: Error) => { setError(e.message); setPreview(null); void state.refetch(); },
  });
  const activate = useMutation({
    mutationFn: async () => {
      const result = await apiRequest("POST", "/api/reservation-pricing/activation", { confirm: true });
      return result.json();
    },
    onSuccess: () => { void activation.refetch(); toast({ title: "Tarifas por noche habilitadas", description: "Se aplicarán a las reservas creadas desde ahora." }); },
    onError: (e: Error) => toast({ title: "No se pudo activar", description: e.message, variant: "destructive" }),
  });
  if (state.isLoading) return <section className="rounded-lg border p-4" role="status">Cargando alojamiento…</section>;
  if (state.isError || !reservation) return <section className="rounded-lg border p-4 text-destructive"><p>No se pudo cargar el alojamiento.</p><Button variant="outline" onClick={() => void state.refetch()}>Reintentar</Button></section>;
  const totalBefore = nightly ? nightlyTotal(nights) : Math.round(Number(reservation.totalRoomAmount || 0) * 100);
  const editorBefore = editorSnapshot?.nightlyPricing ? nightlyTotal(editorSnapshot.nightlyPricing) : totalBefore;
  const totalAfter = localAfter.length ? nightlyTotal(localAfter) : editorBefore;
  return <>
    <section className="rounded-lg border overflow-hidden" data-testid="nightly-pricing-panel">
      <header className="flex flex-wrap justify-between items-center gap-3 p-4 bg-muted/40 border-b">
        <div><p className="text-xs tracking-wide uppercase text-muted-foreground">Alojamiento</p><h3 className="font-semibold text-base">{nightly ? "Tarifas por noche" : "Importe de la estadía"}</h3></div>
        {nightly ? <div className="flex flex-wrap gap-2"><Button size="sm" variant="outline" disabled={!canWrite || !!blocked} onClick={() => start("stay")}><CalendarDays className="h-4 w-4 mr-2"/>Modificar estadía</Button><Button size="sm" variant="outline" disabled={!canWrite || !!blocked} onClick={() => start("rates")}><Pencil className="h-4 w-4 mr-2"/>{selected.length ? `Editar ${selected.length} noches` : "Editar tarifas"}</Button></div>
          : onLegacyEdit && <Button size="sm" variant="outline" disabled={!!blocked} onClick={onLegacyEdit}>Editar alojamiento</Button>}
      </header>
      {blocked && <p className="flex gap-2 p-3 border-b text-sm bg-amber-500/10" role="status"><Lock className="h-4 w-4 shrink-0"/>{blocked}</p>}
      {state.data?.fiscal && <p className="text-xs px-4 py-2 border-b text-muted-foreground">Alojamiento: {({ pendiente: "pendiente de facturación", parcial: "parcialmente facturado", facturado: "facturado", revisar: "cobertura fiscal a revisar", en_curso: "emisión fiscal en curso", grupal: "facturación desde Folio Maestro" } as Record<string, string>)[state.data.fiscal.state]}{state.data.fiscal.coveredCents !== null && <> · Facturado: {money(state.data.fiscal.coveredCents)} · Pendiente: {money(state.data.fiscal.pendingCents || 0)}</>}</p>}
      {nightly ? <div className="overflow-x-auto"><table className="folio-night-table"><thead><tr><th><input type="checkbox" aria-label="Seleccionar todas las noches" checked={selected.length === nights.length && nights.length > 0} onChange={e => setSelected(e.target.checked ? nights.map(n => n.date) : [])}/></th><th>Noche</th><th>Tarifa</th><th>Descuento</th><th>Neto noche</th><th><span className="sr-only">Editar</span></th></tr></thead><tbody>{nights.map(n => <tr key={n.date}><td><input type="checkbox" aria-label={`Seleccionar noche ${dateLabel(n.date)}`} checked={selected.includes(n.date)} onChange={e => setSelected(previous => e.target.checked ? [...previous, n.date] : previous.filter(d => d !== n.date))}/></td><td>{dateLabel(n.date)}</td><td>{money(n.rateCents)}</td><td>{n.discountCents ? money(n.discountCents) : "—"}</td><td className="font-semibold">{money(n.rateCents - n.discountCents)}</td><td><Button size="sm" variant="ghost" aria-label={`Editar noche ${dateLabel(n.date)}`} disabled={!canWrite || !!blocked} onClick={() => start("rates", [n.date])}><Pencil className="h-4 w-4"/></Button></td></tr>)}</tbody></table></div>
        : <div className="p-4"><strong className="text-lg">{money(totalBefore)}</strong><p className="text-sm text-muted-foreground mt-2">{reservation.nights} {Number(reservation.nights) === 1 ? "noche" : "noches"} · {dateLabel(reservation.checkInDate)} → {dateLabel(reservation.checkOutDate)}</p>{reservation.discountType && reservation.discountType !== "none" && Number(reservation.discountValue) > 0 && <p className="text-sm mt-2">Descuento aplicado: {reservation.discountType === "percent" ? `${reservation.discountValue}%` : money(Math.round(Number(reservation.discountValue) * 100))}</p>}</div>}
      <footer className="border-t p-3 flex justify-between font-semibold"><span>Subtotal alojamiento <small className="font-normal text-muted-foreground">· IVA incluido</small></span><span>{money(totalBefore)}</span></footer>
      {!activation.data?.activatedAt && ["admin", "manager"].includes(role || "") && <div className="p-3 border-t text-sm"><p>Tarifas por noche para reservas nuevas</p><Button className="mt-2" size="sm" variant="outline" disabled={activation.isPending} onClick={() => { if (window.confirm("¿Habilitar tarifas por noche para las reservas creadas desde ahora? Las reservas existentes conservarán sus importes.")) activate.mutate(); }}>Habilitar tarifas por noche</Button></div>}
    </section>
    <Dialog open={!!mode} onOpenChange={open => { if (!save.isPending && !open) setMode(null); }}>
      <DialogContent className="max-w-[850px] max-h-[92dvh] flex flex-col overflow-hidden" onInteractOutside={e => { if (save.isPending) e.preventDefault(); }}>
        <DialogHeader><DialogTitle>{mode === "stay" ? "Modificar estadía" : `Editar ${selected.length} ${selected.length === 1 ? "noche" : "noches"}`}</DialogTitle><DialogDescription>Revisá las noches afectadas y su impacto. No se modifica nada hasta confirmar. Los cobros permanecen intactos.</DialogDescription></DialogHeader>
        <div className="overflow-y-auto min-h-0 space-y-4 px-1">
          {mode === "rates" ? <div className="grid gap-4 sm:grid-cols-2">
            <label className="text-sm font-medium">Nueva tarifa común por noche<input className="folio-input mt-2" aria-label="Nueva tarifa común" type="number" min="0" step=".01" value={rate} onChange={e => { setRate(e.target.value); invalidatePreview(); }} placeholder="Conservar tarifas individuales"/><span className="text-xs text-muted-foreground block mt-1">Vacía: mantiene la tarifa propia de cada noche.</span></label>
            <div><label className="text-sm font-medium" htmlFor="night-discount-mode">Descuento</label><div className="flex gap-2 mt-2"><select id="night-discount-mode" className="folio-input flex-1" aria-label="Tipo de descuento" value={discountMode} onChange={e => { setDiscountMode(e.target.value as any); invalidatePreview(); }}><option value="amount">Importe en pesos</option><option value="percent">Porcentaje</option></select><label className="flex items-center gap-2 flex-1"><input className="folio-input min-w-0" aria-label={discountMode === "amount" ? "Descuento en pesos" : "Porcentaje de descuento"} type="number" min="0" step=".01" max={discountMode === "percent" ? "100" : undefined} value={discounts[discountMode]} onChange={e => { setDiscounts({ ...discounts, [discountMode]: e.target.value }); invalidatePreview(); }}/><span>{discountMode === "amount" ? "$" : "%"}</span></label></div>{discountMode === "amount" && <select className="folio-input mt-2" aria-label="Alcance del descuento" value={scope} onChange={e => { setScope(e.target.value as any); invalidatePreview(); }}><option value="night">Por noche seleccionada</option><option value="selection">Total de la selección · distribución proporcional</option></select>}<p className="text-xs text-muted-foreground mt-2">Vacío conserva el descuento; cero lo elimina. Un nuevo descuento reemplaza el anterior, no se suma.</p></div>
          </div> : <div className="space-y-3"><div className="grid sm:grid-cols-2 gap-3"><label className="text-sm">Ingreso<input className="folio-input" aria-label="Nuevo ingreso" type="date" disabled={reservation.status === "checked_in"} value={checkIn} onChange={e => { setCheckIn(e.target.value); invalidatePreview(); }}/></label><label className="text-sm">Egreso<input className="folio-input" aria-label="Nuevo egreso" type="date" value={checkOut} onChange={e => { setCheckOut(e.target.value); invalidatePreview(); }}/></label></div>{newDates.map(d => <label className="flex gap-3 items-center text-sm" key={d}>Tarifa nueva para {dateLabel(d)}<input aria-label={`Tarifa nueva ${dateLabel(d)}`} className="folio-input max-w-48" type="number" min="0" step=".01" value={addedRates[d] || ""} onChange={e => { setAddedRates({ ...addedRates, [d]: e.target.value }); invalidatePreview(); }}/></label>)}<p className="text-sm text-muted-foreground">Se conservan las tarifas y descuentos de las noches que permanecen. Quitar una noche retira su descuento; no se reparte entre las demás. La disponibilidad se vuelve a comprobar al confirmar.</p></div>}
          {localError ? <p className="text-sm text-destructive" role="alert">{localError}</p> : <div className="overflow-x-auto"><table className="folio-night-table"><thead><tr><th>Noche afectada</th><th>Anterior</th><th>Tarifa propuesta</th><th>Descuento</th><th>Nuevo neto</th><th>Diferencia</th></tr></thead><tbody>{localAfter.filter(n => mode === "stay" || selected.includes(n.date)).map(n => { const old = originalNights.find(o => o.date === n.date); return <tr key={n.date}><td>{dateLabel(n.date)}</td><td>{old ? money(old.rateCents - old.discountCents) : "Nueva"}</td><td>{money(n.rateCents)}</td><td>{money(n.discountCents)}</td><td>{money(n.rateCents - n.discountCents)}</td><td>{money(n.rateCents - n.discountCents - (old ? old.rateCents - old.discountCents : 0))}</td></tr>; })}{mode === "stay" && originalNights.filter(n => !localAfter.some(a => a.date === n.date)).map(n => <tr key={n.date}><td>{dateLabel(n.date)}</td><td>{money(n.rateCents - n.discountCents)}</td><td colSpan={4}>Noche eliminada, incluido su descuento de {money(n.discountCents)}</td></tr>)}</tbody></table></div>}
          <label className="block text-sm font-medium">Motivo obligatorio<input className="folio-input mt-2" aria-label="Motivo del cambio" maxLength={1000} value={reason} onChange={e => { setReason(e.target.value); invalidatePreview(); }}/></label>
          <div className="grid grid-cols-3 gap-3 rounded-md border bg-muted/40 p-3 text-sm"><div>Importe anterior<strong className="block">{money(editorBefore)}</strong></div><div>Nuevo total<strong className="block">{money(totalAfter)}</strong></div><div>Diferencia<strong className="block">{money(totalAfter - editorBefore)}</strong></div></div>
          {stale && <p className="text-sm text-destructive" role="alert">Otra persona modificó los precios. Cancelá y reabrí el editor para revisar los nuevos valores; tu propuesta no sobrescribirá sus cambios.</p>}
          {preview && <p className="text-sm text-emerald-700 dark:text-emerald-300" role="status">Propuesta validada por el servidor{mode === "stay" ? " y disponibilidad verificada" : ""}. Total: {money(preview.newTotalCents)}.</p>}
          {error && <p className="text-sm text-destructive" role="alert">{error}</p>}
        </div>
        <DialogFooter className="shrink-0"><Button variant="ghost" disabled={save.isPending} onClick={() => setMode(null)}>Cancelar · Sin cambios</Button><Button variant="outline" disabled={!!localError || !!stale || save.isPending || !selected.length} onClick={() => save.mutate(false)}>Revisar propuesta</Button><Button disabled={!!localError || !!stale || !preview || reason.trim().length < 3 || save.isPending || !!blocked} onClick={() => save.mutate(true)}>Confirmar cambios</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  </>;
}

export function ReservationFolioSummary({ lodging, consumptions, payments, total, pendingCollection, pendingBilling }: {
  lodging: number; consumptions: number; payments: number; total: number; pendingCollection: number; pendingBilling: number;
}) {
  const display = (n: number) => money(Math.round(n * 100));
  return <aside className="folio-account-summary" aria-label="Resumen de cuenta">
    <header><p className="text-xs uppercase text-muted-foreground">Cuenta del huésped · ARS</p><h3 className="font-semibold mt-1">Resumen de cuenta</h3></header>
    <div className="space-y-4 p-4"><div className="flex justify-between gap-3"><span>Alojamiento</span><strong>{display(lodging)}</strong></div><div className="flex justify-between gap-3"><span>Consumos y ajustes</span><strong>{display(consumptions)}</strong></div><div className="flex justify-between gap-3 border-t pt-3"><span>Total del folio</span><strong>{display(total)}</strong></div><div className="flex justify-between gap-3"><span>Cobros registrados</span><strong>{display(payments)}</strong></div><div className="grid grid-cols-2 gap-2"><div className="rounded-md border bg-primary/5 p-3"><p>{payments > total ? "Saldo a favor" : "Pendiente de cobro"}</p><strong className="block text-lg mt-2">{display(payments > total ? payments - total : pendingCollection)}</strong></div><div className="rounded-md border p-3"><p>Pendiente de facturación</p><strong className="block text-lg mt-2">{display(pendingBilling)}</strong></div></div></div>
  </aside>;
}
