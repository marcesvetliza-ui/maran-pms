import {useChannexAccess} from '@/hooks/use-channex-access';
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/App";
import { apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";

type Readiness = {
  environment?:string;
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
  const {data:access}=useChannexAccess();
  const allowed=!!access?.config;
  const query = useQuery<Readiness>({
    queryKey: ["channex-readiness", connectionId],
    enabled: allowed && requested,
    retry: false,
    refetchOnWindowFocus: false,
    queryFn: async () => (await apiRequest("GET", `/api/channex/connections/${connectionId}/inbound/readiness`)).json(),
  });
  if (!allowed) return null;
  return <div className="rounded border p-3 space-y-2 text-sm">
    <p className="font-medium">Revisión de conexión</p>
    <p>Revisa la configuración local y las tarifas de los próximos 500 días. Consultar no activa la conexión ni envía datos a Channex.</p>
    <Button variant="outline" disabled={query.isFetching} onClick={() => { if (requested) void query.refetch(); else setRequested(true); }}>
      {query.isFetching ? "Revisando preparación…" : "Revisar preparación"}
    </Button>
    {query.error && <p role="alert">No se pudo revisar la configuración.</p>}
    {query.data && <>
      <p>{query.data.floor===null?'Todo el hotel':`Piso ${query.data.floor}`} · {query.data.roomCount} habitaciones físicas · Moneda {query.data.currency ?? "sin definir"}</p>
      <p>{query.data.configurationReady ? "Configuración local completa." : "Hay pendientes en la configuración local."} {query.data.activationReady ? "Los controles locales de activación están habilitados." : "La activación tiene requisitos pendientes."}</p>
      {(["configuration", "activation", "certification"] as const).filter(area=>query.data?.environment!=='real'||area!=='certification').map(area => <details key={area} open={area === "configuration"}>
        <summary className="cursor-pointer font-medium">{({ configuration: "Configuración", activation: "Activación", certification: "Certificación pendiente" })[area]}</summary>
        <ul className="space-y-1 pt-2">{query.data!.checks.filter(check => check.area === area).map(check => <li key={check.id}>
          <span className={check.ok ? "text-green-700" : "text-amber-700"}>{check.ok ? "Verificado localmente" : "Pendiente"}</span>: {check.message}
        </li>)}</ul>
      </details>)}
      <p>El webhook y las primeras actualizaciones se comprueban durante la puesta en marcha.</p>
    </>}
  </div>;
}
