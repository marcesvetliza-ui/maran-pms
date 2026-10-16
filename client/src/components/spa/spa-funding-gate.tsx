import type { ReactNode } from "react";
import { SpaFundingConnectedPanel } from "./spa-funding-connected-panel";

/** The configured module uses one motor for every account. Backend owns the
 * automatic cutover; the browser neither migrates history nor chooses a motor. */
export function SpaFundingGate({ enabled, accountId, userId, canWrite, onCompleted, children }: {
  enabled: boolean; accountId: string; userId: string; canWrite: boolean; canAdopt?: boolean;
  onCompleted?: () => void; children: ReactNode;
}) {
  if (!enabled) return <>{children}</>;
  if (!userId) return <p role="status">Verificando sesión…</p>;
  return <SpaFundingConnectedPanel key={`${userId}:${accountId}`} accountId={accountId} userId={userId}
    canWrite={canWrite} onCompleted={onCompleted} />;
}
