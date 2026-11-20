import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { handleSessionExpired } from "@/lib/queryClient";

type UserIdentity = { id: string; role: string };
type Permissions = { role: string; resourceKeys: string[] };
const requestTimeout = 8_000;
const maxAutomaticDelay = 5_000;

class PermissionsConnectionError extends Error {
  constructor(
    public status?: number,
    public retryAt = 0,
  ) {
    super("No se pudieron consultar los permisos");
  }
  get transient() {
    return (
      this.status === undefined ||
      this.status === 429 ||
      (this.status >= 500 && this.status <= 599)
    );
  }
}

export function useSessionPermissions(user: UserIdentity | null) {
  const query = useQuery<Permissions, PermissionsConnectionError>({
    // Never reuse another account's cached permissions on a same-browser login.
    queryKey: ["/api/permissions/mine", user?.id, user?.role],
    queryFn: async ({ signal }) => {
      const controller = new AbortController();
      const abort = () => controller.abort();
      signal.addEventListener("abort", abort, { once: true });
      const timeout = window.setTimeout(abort, requestTimeout);
      try {
        const response = await fetch("/api/permissions/mine", {
          credentials: "include",
          signal: controller.signal,
        });
        signal.throwIfAborted();
        if (!response.ok) {
          if (response.status === 401) handleSessionExpired();
          const raw = response.headers.get("Retry-After");
          const delay =
            raw === null
              ? 0
              : /^\d+$/.test(raw)
                ? Number(raw) * 1000
                : Date.parse(raw) - Date.now();
          const wait = Number.isFinite(delay) && delay > 0 ? delay : 0;
          throw new PermissionsConnectionError(
            response.status,
            wait ? Date.now() + wait : 0,
          );
        }
        const permissions = await response.json();
        signal.throwIfAborted();
        if (
          permissions?.role !== user?.role ||
          !Array.isArray(permissions?.resourceKeys) ||
          !permissions.resourceKeys.every(
            (key: unknown) => typeof key === "string",
          )
        ) {
          // Never turn an invalid/mismatched success response into usable permissions.
          throw new PermissionsConnectionError(422);
        }
        return permissions as Permissions;
      } catch (error) {
        signal.throwIfAborted();
        throw error instanceof PermissionsConnectionError
          ? error
          : new PermissionsConnectionError();
      } finally {
        window.clearTimeout(timeout);
        signal.removeEventListener("abort", abort);
      }
    },
    enabled: !!user,
    retry: (failures, error) =>
      failures < 2 &&
      error.transient &&
      error.retryAt - Date.now() <= maxAutomaticDelay,
    retryDelay: (attempt, error) =>
      Math.max(error.retryAt - Date.now(), attempt === 0 ? 1000 : 2500),
    retryOnMount: false,
    networkMode: "always",
  });
  useEffect(() => {
    const error = query.error;
    if (
      !user ||
      !query.isError ||
      !error?.transient ||
      error.retryAt <= Date.now()
    )
      return;
    // One read after a server cooldown; no polling during the wait. An account
    // change/unmount removes this timer, and no business mutation is replayed.
    const timer = window.setTimeout(
      () => void query.refetch(),
      Math.min(error.retryAt - Date.now(), 2_147_483_647),
    );
    return () => window.clearTimeout(timer);
  }, [user?.id, user?.role, query.isError, query.error, query.refetch]);
  const refetch = () => {
    if (query.error && query.error.retryAt > Date.now()) return;
    return query.refetch();
  };
  // A failed background refetch changes isSuccess to false, even when the
  // last successful data is still available. Keep the current screen mounted.
  const ready =
    !!user &&
    query.data?.role === user.role &&
    Array.isArray(query.data.resourceKeys);
  return {
    ...query,
    refetch,
    ready,
    retryAt: query.error?.retryAt || 0,
    resourceKeys: ready ? query.data!.resourceKeys : [],
  };
}
