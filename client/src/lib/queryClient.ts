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
