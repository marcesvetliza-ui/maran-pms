import { useQuery } from "@tanstack/react-query";

interface HealthResponse {
  appEnv?: string;
  isPilot?: boolean;
}

/**
 * Indicador visual del ambiente piloto (Fase 5). Lee `/api/health`, que a su
 * vez expone `getAppEnv()` del servidor — nunca compara NODE_ENV ni ninguna
 * variable de build-time del cliente, para que el indicador refleje siempre
 * el ambiente real del servidor que responde, incluso antes de loguearse.
 */
export function usePilotEnvironment(): boolean {
  const { data } = useQuery<HealthResponse>({
    queryKey: ["pilot-environment-indicator"],
    queryFn: async () => {
      const res = await fetch("/api/health");
      if (!res.ok) return {};
      return res.json();
    },
    staleTime: Infinity,
    gcTime: Infinity,
    retry: false,
    refetchOnWindowFocus: false,
  });
  return data?.isPilot === true;
}
