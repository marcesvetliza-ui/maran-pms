import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { QueryClient, useQuery } from "@tanstack/react-query";
import { holdSessionWrites } from "@/lib/session-write-guard";

type Identity = { id: string; role: string; username: string };
type Callbacks = { onInvalidated?: () => void; onIdentityChange?: () => void; onExternalLogout?: () => void };
const key = ["verified-session"];
const requestTimeout = 8_000;
const maxAutomaticDelay = 5_000;

class SessionConnectionError extends Error {
  constructor(public retryAt = 0, public status?: number) {
    super(status === 429 ? "El sistema está atendiendo muchas solicitudes. Esperá un momento antes de reintentar."
      : "No se pudo verificar la conexión con el sistema. Podés reintentar sin volver a ingresar tus credenciales.");
  }
}

/** Own cache: clearing business queries must not cancel authentication itself. */
export function useVerifiedSession<T extends Identity>(callbacks: Callbacks = {}) {
  const [client] = useState(() => new QueryClient());
  const owner = useRef(Symbol("session-verification"));
  const generation = useRef(0);
  const latestCallbacks = useRef(callbacks);
  latestCallbacks.current = callbacks;
  const acceptIdentity = useCallback((next: T) => {
    const previous = client.getQueryData<T | null>(key);
    if (previous && (previous.id !== next.id || previous.role !== next.role)) latestCallbacks.current.onIdentityChange?.();
  }, [client]);

  const query = useQuery<T | null, SessionConnectionError>({
    queryKey: key,
    queryFn: async ({ signal }) => {
      const controller = new AbortController();
      const abort = () => controller.abort();
      signal.addEventListener("abort", abort, { once: true });
      const timeout = window.setTimeout(abort, requestTimeout);
      try {
        const response = await fetch("/api/auth/me", { credentials: "include", signal: controller.signal });
        signal.throwIfAborted();
        if (response.status === 401) {
          latestCallbacks.current.onInvalidated?.();
          return null;
        }
        if (!response.ok) {
          const raw = response.headers.get("Retry-After");
          const delay = raw == null ? 0 : /^\d+$/.test(raw) ? Number(raw) * 1000 : Date.parse(raw) - Date.now();
          throw new SessionConnectionError(Number.isFinite(delay) && delay > 0 ? Date.now() + delay : 0, response.status);
        }
        const user = await response.json();
        signal.throwIfAborted();
        if (!user || typeof user.id !== "string" || !user.id || typeof user.role !== "string" ||
          !user.role || typeof user.username !== "string" || !user.username) throw new SessionConnectionError();
        // Preserve the existing policy: a newly opened tab requires its own login.
        if (!sessionStorage.getItem("maranTabActive")) {
          await fetch("/api/auth/logout", { method: "POST", credentials: "include", signal: controller.signal }).catch(() => {});
          signal.throwIfAborted();
          latestCallbacks.current.onInvalidated?.();
          return null;
        }
        acceptIdentity(user);
        return user as T;
      } catch (error) {
        signal.throwIfAborted();
        throw error instanceof SessionConnectionError ? error : new SessionConnectionError();
      } finally {
        window.clearTimeout(timeout);
        signal.removeEventListener("abort", abort);
      }
    },
    retry: (failures, error) => failures < 2 && error.retryAt - Date.now() <= maxAutomaticDelay,
    retryDelay: (attempt, error) => Math.max(error.retryAt - Date.now(), attempt === 0 ? 1000 : 2500),
    staleTime: Infinity, retryOnMount: false, refetchOnWindowFocus: false, refetchOnReconnect: false,
    gcTime: 0, networkMode: "always",
  }, client);
  const blocked = query.isPending || query.isFetching || query.isError;
  useLayoutEffect(() => { holdSessionWrites(owner.current, blocked || !query.data); }, [blocked, query.data]);
  useEffect(() => () => {
    generation.current++;
    holdSessionWrites(owner.current, false);
    void client.cancelQueries();
    client.clear();
  }, [client]);

  const checkAuth = useCallback(async (replace = false) => {
    const error = client.getQueryState<T | null, SessionConnectionError>(key)?.error;
    if (!replace && error && error.retryAt > Date.now()) return;
    holdSessionWrites(owner.current, true);
    if (replace) {
      const current = ++generation.current;
      await client.cancelQueries({ queryKey: key });
      if (generation.current !== current) return;
    }
    await client.refetchQueries({ queryKey: key }, { cancelRefetch: replace });
  }, [client]);
  const clearSession = useCallback(() => {
    generation.current++;
    holdSessionWrites(owner.current, true);
    void client.cancelQueries({ queryKey: key });
    client.setQueryData(key, null);
    latestCallbacks.current.onInvalidated?.();
  }, [client]);
  const acceptLogin = useCallback((user: T) => {
    generation.current++;
    void client.cancelQueries({ queryKey: key });
    acceptIdentity(user);
    client.setQueryData(key, user);
  }, [client, acceptIdentity]);

  useEffect(() => {
    let channel: BroadcastChannel;
    try { channel = new BroadcastChannel("maran-auth"); } catch { return; }
    const receive = (event: MessageEvent) => {
      if (event.data?.type === "logout") {
        latestCallbacks.current.onExternalLogout?.();
        clearSession();
      } else if (event.data?.type === "login") {
        // A tab explicitly logged out stays at login; it must not invalidate
        // another tab's fresh session through the new-tab policy above.
        if (sessionStorage.getItem("maranTabActive")) void checkAuth(true);
      }
    };
    channel.addEventListener("message", receive);
    return () => { channel.removeEventListener("message", receive); channel.close(); };
  }, [checkAuth, clearSession]);

  const failure = query.error || query.failureReason;
  return { user: query.data ?? null, blocked, busy: query.isFetching || query.isPending,
    error: failure?.message, retryAt: failure?.retryAt || 0,
    checkAuth, clearSession, acceptLogin };
}
