import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function ChannexSettlementRate({ rate, pending, onSave }: { rate: string | null; pending: boolean; onSave: (rate: string | null, reason: string) => void }) {
  const [value, setValue] = useState(rate || ""), [reason, setReason] = useState("");
  const validReason = reason.trim().length >= 5;
  const validRate = /^\d{1,6}(?:\.\d{1,6})?$/.test(value) && Number(value) > 0;
  return <div className="rounded border p-3 space-y-2 text-sm">
    <p className="font-medium">Reservas en USD → folio en ARS</p>
    <p>Ingresá cuántos pesos equivalen a un dólar y la fuente o criterio utilizado. Se aplica a reservas nuevas; las ya ingresadas conservan su cotización, incluso ante modificaciones del canal. Sin cotización, las nuevas reservas USD quedan para revisión.</p>
    <Label htmlFor="channex-settlement-rate">Pesos por USD</Label>
    <Input id="channex-settlement-rate" value={value} inputMode="decimal" onChange={event => setValue(event.target.value.replace(",", "."))} placeholder="Sin cotización configurada" disabled={pending} />
    <Label htmlFor="channex-settlement-reason">Fuente o motivo de la cotización</Label>
    <Input id="channex-settlement-reason" value={reason} maxLength={500} onChange={event => setReason(event.target.value)} disabled={pending} />
    <div className="flex flex-wrap gap-2">
      <Button variant="outline" disabled={pending || !validRate || !validReason} onClick={() => onSave(value, reason.trim())}>Guardar cotización</Button>
      {rate && <Button variant="ghost" disabled={pending || !validReason} onClick={() => onSave(null, reason.trim())}>Quitar para nuevas reservas</Button>}
    </div>
  </div>;
}

type Snapshot = { source_currency: string; source_total: string; exchange_rate: string; settlement_currency: string; settlement_total: string };
export function ReservationChannexSettlement({ reservationId, open }: { reservationId: string; open: boolean }) {
  const query = useQuery<Snapshot | null>({
    queryKey: ["/api/reservations", reservationId, "channex-settlement"], enabled: open,
    queryFn: async () => (await apiRequest("GET", `/api/reservations/${reservationId}/channex-settlement`)).json(),
  });
  if (query.error) return <p role="alert" className="text-sm">No se pudo consultar el importe original de Channex.</p>;
  if (!query.data || query.data.source_currency !== "USD") return null;
  const snapshot = query.data;
  const money = (value: string, currency: string) => new Intl.NumberFormat("es-AR", { style: "currency", currency, currencyDisplay: "code" }).format(Number(value));
  return <div className="rounded border p-3 space-y-1 text-sm">
    <p className="font-medium">Importe original de Channex</p>
    <p>{money(snapshot.source_total, snapshot.source_currency)} · Cotización: ARS {snapshot.exchange_rate} por USD</p>
    <p>Registrado al ingresar: {money(snapshot.settlement_total, snapshot.settlement_currency)}</p>
    <p className="text-muted-foreground">La cotización queda fijada para esta reserva. Los ajustes posteriores y el saldo se consultan en el folio.</p>
  </div>;
}
