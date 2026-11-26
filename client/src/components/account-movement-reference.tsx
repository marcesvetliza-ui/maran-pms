import { accountMovementReferenceLines } from "@/lib/account-movement-reference";
import type { AccountMovementReferenceData } from "@shared/account-movement-reference";

export function AccountMovementReference({ movement }: { movement: AccountMovementReferenceData }) {
  const original = movement.reservationCode || movement.reference || "";
  return <div className="space-y-0.5 break-words" title={original || undefined}>
    {accountMovementReferenceLines(movement).map((line, index) =>
      <p key={index} className={index === 0 ? "text-sm font-medium text-foreground" : "text-xs text-muted-foreground"}>{line}</p>)}
  </div>;
}
