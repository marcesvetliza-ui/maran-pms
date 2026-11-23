import { ChannexReservationsInbox } from "./channex-reservations-inbox";
import {useChannexAccess} from '@/hooks/use-channex-access';
import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { ChannexReadiness } from "./channex-readiness";
type Status = { serverEnabled: boolean; settings: { enabled: boolean; has_token: boolean; fetch_attempts?: number; settlement_exchange_rate?: string | null; exchange_rate_updated_at?: string | null }; revisions: { guest_name?:string;reservations?:{id:string;code:string;guestName:string;roomNumber:string;checkInDate:string;checkOutDate:string;status:string}[]; revision_id: string; booking_id: string | null; status: string; review_code: string | null; acked_at: string | null }[] };
export function ChannexInboundSettings({ connectionId, mode = "inbox" }: { connectionId: string; mode?: "inbox" | "controls" }) {
  const {data:access}=useChannexAccess(); const canWrite=!!access?.config;
  const [token, setToken] = useState<{ token: string; header: string; path: string } | null>(null);
  const query = useQuery<Status>({
    queryKey: ["channex-inbound", connectionId], enabled: !!access?.read,
    queryFn: async () => (await apiRequest("GET", `/api/channex/connections/${connectionId}/inbound`)).json()
  });
  const action = useMutation({
    mutationFn: async ({ method, path = "", body }: { method: string; path?: string; body?: unknown }) =>
      (await apiRequest(method, `/api/channex/connections/${connectionId}/inbound${path}`, body)).json(),
    onSuccess: (data, variables) => { void queryClient.invalidateQueries({ queryKey: ["channex-bookings", connectionId] }); void queryClient.invalidateQueries({ queryKey: ["channex-history", connectionId] }); if (variables.path === "/webhook-token") setToken(data); void queryClient.invalidateQueries({ queryKey: ["channex-inbound", connectionId] }); void queryClient.invalidateQueries({ queryKey: ["channex-readiness", connectionId] }); }
  });
  if (!access?.read || (mode === "controls" && !canWrite)) return null;
  if (mode === "inbox") return <div className="space-y-3">
    {query.data && <p className="text-sm text-muted-foreground">Recepción de reservas: {query.data.serverEnabled && query.data.settings.enabled ? "activa" : "pausada"}.</p>}
    <ChannexReservationsInbox key={connectionId} connectionId={connectionId} canRetry={!!access?.bookings} pending={action.isPending}
      onRetry={revisionId => action.mutate({ method: "POST", path: "/retry", body: { revisionId } })} />
    {action.error && <p role="alert" className="text-destructive">{action.error.message}</p>}
  </div>;
  return <Card><CardHeader><CardTitle className="text-base">Recepción de reservas de Channex</CardTitle></CardHeader><CardContent className="space-y-3">
    <p className="text-sm">Las reservas nuevas quedan en esta bandeja para que recepción elija la habitación y las asigne al PMS. Las revisiones se guardan antes de confirmar su recepción a Channex. Los cambios y las cancelaciones posteriores se procesan sobre la reserva existente; los conflictos quedan para revisión.</p>
    <p className="text-sm font-medium">{query.data?.serverEnabled ? "Recepción habilitada en el servidor." : "Conexión entrante desactivada en el servidor."}</p>
    {canWrite&&<ChannexReadiness key={connectionId} connectionId={connectionId} />}
    {query.isLoading ? <p>Cargando estado…</p> : query.error ? <p role="alert">No se pudo consultar la recepción.</p> : query.data ? <>
      <p className="text-sm">Esta conexión: {query.data.settings.enabled ? "habilitada" : "pausada"}.</p>
      {canWrite&&<p className="text-sm text-muted-foreground">La cotización para nuevas reservas USD se administra en Configuración y mapeos → Cotización.</p>}
      <div className="flex flex-wrap gap-2">{canWrite&&<Button disabled={action.isPending} variant="outline" onClick={() => action.mutate({ method: "PATCH", body: { enabled: !query.data!.settings.enabled } })}>{query.data.settings.enabled ? "Pausar recepción" : "Habilitar recepción"}</Button>}
        {canWrite&&<Button disabled={action.isPending} variant="outline" onClick={() => action.mutate({ method: "POST", path: "/webhook-token" })}>{query.data.settings.has_token ? "Renovar acceso del webhook" : "Generar acceso del webhook"}</Button>}
        <Button variant="ghost" onClick={() => query.refetch()}>Actualizar estado</Button></div>
      {token && <div className="rounded border p-3 text-sm space-y-2"><p>Configurá este acceso en Channex. La clave se muestra solo ahora; renovarla invalida la anterior.</p><p className="break-all">URL: {window.location.origin}{token.path}</p><p className="break-all">Encabezado {token.header}: <code>{token.token}</code></p><Button size="sm" variant="ghost" onClick={() => setToken(null)}>Ocultar clave</Button></div>}

    </> : null}
    {action.error && <p role="alert" className="text-destructive">{action.error.message}</p>}
  </CardContent></Card>;
}
