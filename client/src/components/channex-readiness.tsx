import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/App";
import { apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";

type Readiness = {
  configurationReady: boolean;
  activationReady: boolean;
  floor: number | null;
  currency: string | null;
  roomCount: number;
  checks: { id: string; area: "configuration" | "activation" | "certification"; ok: boolean; message: string }[];
};

export function ChannexReadiness({ connectionId }: { connectionId: string }) {
  const { hasPermission } = useAuth();
  const [requested, setRequested] = useState(false);
  const allowed = hasPermission("api:channex:config");
  const query = useQuery<Readiness>({
    queryKey: ["channex-readiness", connectionId],
    enabled: allowed && requested,
    retry: false,
    refetchOnWindowFocus: false,
    queryFn: async () => (await apiRequest("GET", `/api/channex/connections/${connectionId}/inbound/readiness`)).json(),
  });
  if (!allowed) return null;
  return <div className="rounded border p-3 space-y-2 text-sm">
    <p className="font-medium">Preparación para staging</p>
    <p>Revisa la configuración local y las tarifas de los próximos 500 días. Consultar no activa la conexión ni envía datos a Channex.</p>
    <Button variant="outline" disabled={query.isFetching} onClick={() => { if (requested) void query.refetch(); else setRequested(true); }}>
      {query.isFetching ? "Revisando preparación…" : "Revisar preparación"}
    </Button>
    {query.error && <p role="alert">No se pudo revisar la preparación para staging.</p>}
    {query.data && <>
      <p>Piso {query.data.floor ?? "sin definir"} · {query.data.roomCount} habitaciones físicas · Moneda {query.data.currency ?? "sin definir"}</p>
      <p>{query.data.configurationReady ? "Configuración local completa para pruebas." : "Hay pendientes en la configuración local."} {query.data.activationReady ? "Los controles locales de activación están habilitados." : "La activación tiene requisitos pendientes."}</p>
      {(["configuration", "activation", "certification"] as const).map(area => <details key={area} open={area === "configuration"}>
        <summary className="cursor-pointer font-medium">{({ configuration: "Configuración", activation: "Activación de pruebas", certification: "Certificación pendiente" })[area]}</summary>
        <ul className="space-y-1 pt-2">{query.data!.checks.filter(check => check.area === area).map(check => <li key={check.id}>
          <span className={check.ok ? "text-green-700" : "text-amber-700"}>{check.ok ? "Verificado localmente" : "Pendiente"}</span>: {check.message}
        </li>)}</ul>
      </details>)}
      <p>Este resultado no verifica credenciales, webhook ni tareas en Channex y no acredita la certificación.</p>
    </>}
  </div>;
}
