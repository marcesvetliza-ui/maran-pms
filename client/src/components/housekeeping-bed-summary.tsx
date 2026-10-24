import type { PlanningRequest } from "@shared/housekeepingPlanning";
import { physicalBedLabels } from "@shared/housekeepingPlanning";
import { formatHotelDateTime } from "@/lib/hotelTime";

export function HousekeepingBedSummary({request}:{request:PlanningRequest}) {
  const confirmation=request.bedPreparation;
  return <div className="rounded-md border bg-background/70 p-2 space-y-1 text-sm" aria-label="Camaje solicitado y preparado">
    <p><span className="font-medium">Solicitado por la reserva:</span> {request.bedTypeName||"Sin especificar"}{request.bedTypeNotes&&<> · {request.bedTypeNotes}</>}</p>
    {confirmation ? <>
      <p><span className="font-medium">Preparación registrada:</span> {physicalBedLabels[confirmation.bedConfig]||confirmation.bedConfig}</p>
      <p className={request.preparationCurrent ? "font-semibold text-green-700 dark:text-green-300" : "font-semibold text-amber-700 dark:text-amber-300"}>
        {request.preparationCurrent ? "Preparado para esta reserva" : "Confirmación anterior: requiere revisión"}
      </p>
      <p className="text-xs text-muted-foreground">{formatHotelDateTime(confirmation.confirmedAt)}</p>
    </> : <p className="text-muted-foreground">Pendiente de confirmar para esta reserva.</p>}
  </div>;
}
