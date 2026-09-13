import { FlaskConical } from "lucide-react";
import { usePilotEnvironment } from "@/hooks/use-pilot-environment";

/**
 * Indicador visual del ambiente piloto (Fase 5 — ver
 * docs/pilot-environment-plan.md sección 14). No depende solo de color:
 * combina ícono + texto en mayúsculas + borde, visible en modo claro y
 * oscuro. Se muestra en la pantalla de login y en el layout principal
 * (ver client/src/pages/login.tsx y client/src/App.tsx).
 */
export function PilotEnvironmentBanner() {
  const isPilot = usePilotEnvironment();
  if (!isPilot) return null;

  return (
    <div
      role="status"
      data-testid="banner-pilot-environment"
      className="w-full shrink-0 flex items-center justify-center gap-2 border-y-2 border-amber-500 bg-amber-100 px-4 py-1.5 text-xs font-bold uppercase tracking-wide text-amber-900 dark:border-amber-500 dark:bg-amber-950 dark:text-amber-200"
    >
      <FlaskConical className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
      <span>Ambiente piloto — datos de prueba</span>
    </div>
  );
}
