import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useAuth } from "@/App";
import { ChannexReadiness } from "./channex-readiness";
import { ChannexSettlementRate } from "./channex-settlement";
const reasons: Record<string, string> = {
  UNLINKED_EXTERNAL_RESERVATION: "Ya existe una reserva con esta referencia externa; revisá su vínculo",
  INVALID_REVISION: "La revisión no tiene el formato esperado", INVALID_BOOKING: "Faltan datos de la reserva",
  WRONG_PROPERTY: "La revisión pertenece a otra propiedad", REVISION_ID_COLLISION: "El identificador llegó con contenido diferente",
  REVISION_ORDER_AMBIGUOUS: "No se pudo determinar el orden de las revisiones", NO_PILOT_ROOM_AVAILABLE: "No hay habitación disponible en el piso piloto",
  INVALID_ROOM_MAPPING: "Revisá los mapeos de habitación y tarifa", INCOMPLETE_NIGHTLY_RATES: "Faltan precios por noche",
  UNSUPPORTED_CURRENCY: "La moneda requiere revisión; no se convierte automáticamente a pesos",
  SETTLEMENT_RATE_REQUIRED: "Falta configurar la cotización de pesos por dólar antes de reintentar",
  SETTLEMENT_AMOUNT_EXCEEDS_LIMIT: "El importe convertido supera el límite del folio",
  SOURCE_CURRENCY_CHANGED: "El canal cambió la moneda de una reserva ya ingresada; requiere revisión",
  LOCAL_GUEST_CHANGED: "El hotel modificó los datos del huésped", SHARED_GUEST_REQUIRES_REVIEW: "La ficha del huésped se usa en otra reserva",
  LOCAL_RESERVATION_CHANGED: "El hotel modificó esta reserva", LOCAL_FINANCIAL_HISTORY: "La reserva ya tiene movimientos o pertenece a un grupo",
  OCCUPANCY_EXCEEDS_CAPACITY: "La ocupación excede la capacidad", TOTAL_REQUIRES_REVIEW: "El total no coincide con el detalle por noche",
  MISSING_ROOM_ID: "Las habitaciones necesitan identificadores estables", CANCELLED_BOOKING_REOPEN: "La reserva ya estaba cancelada",
  CANCELLED_ROOM_REOPEN: "La habitación estaba cancelada", PMS_APPLY_REQUIRES_REVIEW: "El PMS requiere revisión antes de aplicar los cambios",
  LOCAL_STAY_REQUIRES_REVIEW: "Revisá el estado de la estadía antes de modificarla",
};
type Status = { serverEnabled: boolean; settings: { enabled: boolean; has_token: boolean; fetch_attempts?: number; settlement_exchange_rate?: string | null; exchange_rate_updated_at?: string | null }; revisions: { revision_id: string; booking_id: string | null; status: string; review_code: string | null; acked_at: string | null }[] };
export function ChannexInboundSettings({ connectionId }: { connectionId: string }) {
  const { hasPermission } = useAuth(); const canWrite = hasPermission("api:channex:config");
  const [token, setToken] = useState<{ token: string; header: string; path: string } | null>(null);
  const query = useQuery<Status>({
    queryKey: ["channex-inbound", connectionId], enabled: canWrite,
    queryFn: async () => (await apiRequest("GET", `/api/channex/connections/${connectionId}/inbound`)).json()
  });
  const action = useMutation({
    mutationFn: async ({ method, path = "", body }: { method: string; path?: string; body?: unknown }) =>
      (await apiRequest(method, `/api/channex/connections/${connectionId}/inbound${path}`, body)).json(),
    onSuccess: (data, variables) => { if (variables.path === "/webhook-token") setToken(data); void queryClient.invalidateQueries({ queryKey: ["channex-inbound", connectionId] }); void queryClient.invalidateQueries({ queryKey: ["channex-readiness", connectionId] }); }
  });
  if (!canWrite) return null;
  return <Card><CardHeader><CardTitle className="text-base">Recepción de reservas de Channex</CardTitle></CardHeader><CardContent className="space-y-3">
    <p className="text-sm">Solo entorno de pruebas. Este receptor crea y actualiza reservas del PMS de pruebas; la bandeja de previsualización sigue siendo independiente. Las revisiones se guardan antes de confirmar su recepción a Channex. Los cambios se aplican al piso configurado; los conflictos quedan para revisión.</p>
    <p className="text-sm font-medium">{query.data?.serverEnabled ? "Recepción habilitada en el servidor de pruebas." : "Conexión entrante desactivada en el servidor."}</p>
    <ChannexReadiness key={connectionId} connectionId={connectionId} />
    {query.isLoading ? <p>Cargando estado…</p> : query.error ? <p role="alert">No se pudo consultar la recepción.</p> : query.data ? <>
      <p className="text-sm">Esta conexión: {query.data.settings.enabled ? "habilitada" : "pausada"}.</p>
      <ChannexSettlementRate key={query.data.settings.exchange_rate_updated_at || "initial"} rate={query.data.settings.settlement_exchange_rate || null} pending={action.isPending}
        onSave={(rate, reason) => action.mutate({ method: "PATCH", path: "/settlement-rate", body: { rate, reason } })} />
      <div className="flex flex-wrap gap-2"><Button disabled={action.isPending} variant="outline" onClick={() => action.mutate({ method: "PATCH", body: { enabled: !query.data!.settings.enabled } })}>{query.data.settings.enabled ? "Pausar recepción" : "Habilitar recepción de prueba"}</Button>
        <Button disabled={action.isPending} variant="outline" onClick={() => action.mutate({ method: "POST", path: "/webhook-token" })}>{query.data.settings.has_token ? "Renovar acceso del webhook" : "Generar acceso del webhook"}</Button>
        <Button variant="ghost" onClick={() => query.refetch()}>Actualizar estado</Button></div>
      {token && <div className="rounded border p-3 text-sm space-y-2"><p>Configurá este acceso en Channex. La clave se muestra solo ahora; renovarla invalida la anterior.</p><p className="break-all">URL: {window.location.origin}{token.path}</p><p className="break-all">Encabezado {token.header}: <code>{token.token}</code></p><Button size="sm" variant="ghost" onClick={() => setToken(null)}>Ocultar clave</Button></div>}
      {query.data.revisions.length === 0 ? <p className="text-sm text-muted-foreground">Todavía no hay revisiones recibidas.</p> : <div className="space-y-2">{query.data.revisions.map(r => <div className="rounded border p-3 text-sm" key={r.revision_id}>
        <p className="break-all">Reserva: {r.booking_id || "Sin identificar"} · Revisión: {r.revision_id}</p>
        <p>{({ pending: "Pendiente de aplicar", applied: "Aplicada al PMS", stale: "Anterior a la versión ya aplicada", review: "Requiere revisión" } as Record<string, string>)[r.status]} · {r.acked_at ? "Recepción confirmada a Channex" : "Confirmación pendiente"}</p>
        {r.review_code && <p>{reasons[r.review_code] || "Revisá la reserva y su configuración"}</p>}
        {r.status === "review" && !['INVALID_REVISION', 'WRONG_PROPERTY', 'REVISION_ID_COLLISION'].includes(r.review_code || '') && <Button size="sm" variant="outline" disabled={action.isPending} onClick={() => action.mutate({ method: "POST", path: "/retry", body: { revisionId: r.revision_id } })}>Reintentar revisión</Button>}
      </div>)}</div>}
    </> : null}
    {action.error && <p role="alert" className="text-destructive">{action.error.message}</p>}
  </CardContent></Card>;
}
