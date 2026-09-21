import { QueryClient, QueryFunction } from "@tanstack/react-query";

function handleSessionExpired() {
  window.location.href = "/auth?session_expired=1";
}

async function throwIfResNotOk(res: Response) {
  if (!res.ok) {
    if (res.status === 401) {
      handleSessionExpired();
      throw new Error("Sesión expirada");
    }
    const text = (await res.text()) || res.statusText;
    throw new Error(`${res.status}: ${text}`);
  }
}

export async function apiRequest(
  method: string,
  url: string,
  data?: unknown | undefined,
): Promise<Response> {
  const res = await fetch(url, {
    method,
    headers: data ? { "Content-Type": "application/json" } : {},
    body: data ? JSON.stringify(data) : undefined,
    credentials: "include",
  });

  await throwIfResNotOk(res);
  return res;
}

type GroupInventoryWarningPayload = {
  code?: string;
  error?: string;
  canOverride?: boolean;
  warning?: {
    warnings?: Array<{ groupId: string; groupName?: string; date: string }>;
  };
};

export function parseApiErrorPayload(err: unknown): GroupInventoryWarningPayload | null {
  const raw = (err as any)?.message || "";
  const match = raw.match(/^\d+:\s*([\s\S]+)$/);
  if (!match) return null;
  try {
    return JSON.parse(match[1]);
  } catch {
    return null;
  }
}

export async function apiRequestWithGroupInventoryWarning(
  method: "POST" | "PATCH",
  url: string,
  data: Record<string, unknown>,
): Promise<Response> {
  try {
    return await apiRequest(method, url, data);
  } catch (error) {
    const payload = parseApiErrorPayload(error);
    if (payload?.code !== "GROUP_BLOCK_WARNING" || payload.canOverride !== true) throw error;
    const rows = payload.warning?.warnings ?? [];
    const groups = [...new Set(rows.map(row => row.groupName || row.groupId))].join(", ");
    const dates = [...new Set(rows.map(row => row.date))].sort();
    const dateText = dates.length === 1 ? dates[0] : `${dates[0]} a ${dates[dates.length - 1]}`;
    const message = [
      "Esta operación consume disponibilidad comprometida para un grupo tentativo.",
      groups ? `Grupo(s): ${groups}.` : "",
      dates.length ? `Fecha(s): ${dateText}.` : "",
      "¿Desea continuar de todos modos?",
    ].filter(Boolean).join("\n");
    if (!window.confirm(message)) throw error;
    return apiRequest(method, url, { ...data, overrideTentativeGroupWarning: true });
  }
}

type UnauthorizedBehavior = "returnNull" | "throw";
export const getQueryFn: <T>(options: {
  on401: UnauthorizedBehavior;
}) => QueryFunction<T> =
  ({ on401: unauthorizedBehavior }) =>
  async ({ queryKey }) => {
    const res = await fetch(queryKey.join("/") as string, {
      credentials: "include",
    });

    if (unauthorizedBehavior === "returnNull" && res.status === 401) {
      return null;
    }

    await throwIfResNotOk(res);
    return await res.json();
  };

/**
 * Parses an error thrown by apiRequest / throwIfResNotOk.
 *
 * throwIfResNotOk wraps server errors as "${status}: ${bodyText}".
 * When bodyText is JSON with an `.error` field we extract that field so
 * staff see a readable message instead of machine-readable noise.
 * Falls back gracefully to the raw message when parsing fails.
 */
export function parseApiError(err: unknown): string {
  const raw: string = (err as any)?.message || "Error inesperado";
  const match = raw.match(/^\d+:\s*([\s\S]+)$/);
  if (match) {
    try {
      const parsed = JSON.parse(match[1]);
      if (parsed?.error) return String(parsed.error);
    } catch {
      return match[1].trim() || raw;
    }
  }
  return raw;
}

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      queryFn: getQueryFn({ on401: "throw" }),
      refetchInterval: false,
      refetchOnWindowFocus: true,
      staleTime: 30_000,
      retry: false,
    },
    mutations: {
      retry: false,
    },
  },
});
