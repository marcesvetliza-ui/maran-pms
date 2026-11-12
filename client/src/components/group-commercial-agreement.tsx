import { groupCommercialAgreement } from '@shared/groupCommercialAgreement';

export function GroupCommercialAgreement({ config }: { config?: string | null }) {
  return <div className="space-y-1 text-sm" data-testid="group-commercial-agreement">
    <p><strong>Acuerdo con el organizador:</strong> {groupCommercialAgreement(config)}</p>
    <p className="text-xs text-muted-foreground">Referencia operativa. Recepción puede cobrar, facturar o dar salida por habitación.</p>
  </div>;
}
