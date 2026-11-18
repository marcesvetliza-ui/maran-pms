import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";

export const isXeniaPmsQa = import.meta.env.VITE_XENIA_PMS_QA === "true";
type Installation = {
  mode: "qa";
  name: string;
  propertyId: string;
  controlOrigin: string;
  startPath: string;
};
export function useXeniaInstallation() {
  return useQuery<Installation>({
    queryKey: ["/api/xenia/installation"],
    enabled: isXeniaPmsQa,
    staleTime: Infinity,
    queryFn: async () => {
      const response = await fetch("/api/xenia/installation", {
        credentials: "same-origin",
      });
      if (!response.ok)
        throw new Error("No se pudo identificar este establecimiento.");
      return response.json();
    },
  });
}
export function XeniaPmsLogin() {
  const installation = useXeniaInstallation();
  return (
    <main className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-slate-950 p-6">
      <section className="w-full max-w-md rounded-xl border bg-background p-8 space-y-5 shadow-sm">
        <p className="font-semibold tracking-widest text-teal-700">XENIA</p>
        <h1 className="text-2xl font-semibold">
          {installation.data?.name ?? "PMS de pruebas"}
        </h1>
        <p>
          Ingresá con tu cuenta de Xenia. El panel verifica tu acceso a este
          establecimiento.
        </p>
        <p className="text-sm text-muted-foreground">
          Prueba de Alojamiento: planning, habitaciones, huéspedes y reservas
          con datos ficticios. Cobros e integraciones pendientes de
          habilitación.
        </p>
        {installation.isError ? (
          <div role="alert" className="space-y-3">
            <p>No se pudo identificar la instalación.</p>
            <Button onClick={() => void installation.refetch()}>
              Reintentar
            </Button>
          </div>
        ) : (
          <Button asChild disabled={!installation.data}>
            <a href={installation.data ? "/xenia/start" : undefined}>
              Ingresar con Xenia
            </a>
          </Button>
        )}
      </section>
    </main>
  );
}
export function XeniaPmsBanner() {
  const { data } = useXeniaInstallation();
  if (!isXeniaPmsQa) return null;
  return (
    <aside
      data-testid="xenia-pms-context"
      className="shrink-0 border-b border-teal-200 bg-teal-50 text-teal-950 px-4 py-2 text-sm flex flex-wrap items-center justify-between gap-2"
    >
      <div>
        <strong>{data?.name ?? "Xenia"}</strong> · Alojamiento · Pruebas con
        datos ficticios
      </div>
      {data && (
        <a className="underline font-medium" href={data.controlOrigin}>
          Mis establecimientos
        </a>
      )}
    </aside>
  );
}
