import { useRef } from "react";
import type { InclusionRule } from "@shared/hospitalityInclusions";
import { inclusionAreaLabels } from "@shared/hospitalityInclusions";
import { roomChargeInclusions } from "@shared/roomChargeHospitality";
import { InclusionRulesEditor } from "./inclusion-rules-editor";

export type HospitalityChargePreset = {
  id?: string;
  hospitalityRules?: InclusionRule[];
};
export function roomChargeHospitalityFields(
  preset: HospitalityChargePreset | undefined | null,
  quantity: number,
  requestId: string,
) {
  return !preset?.id || !preset.hospitalityRules?.length
    ? {}
    : {
        chargeTypeId: preset.id,
        quantity,
        hospitalityRequestId: requestId,
        hospitalityExpectedRules: preset.hospitalityRules,
      };
}
export function useRoomChargeHospitality() {
  const attempt = useRef<{ signature: string; id: string } | null>(null);
  return {
    payload(
      body: Record<string, unknown>,
      preset?: HospitalityChargePreset | null,
      quantity = 1,
    ) {
      if (!preset?.id || !preset.hospitalityRules?.length) return body;
      const signature = JSON.stringify({
        body,
        presetId: preset.id,
        rules: preset.hospitalityRules,
        quantity,
      });
      if (attempt.current?.signature !== signature)
        attempt.current = { signature, id: crypto.randomUUID() };
      return {
        ...body,
        chargeTypeId: preset.id,
        quantity,
        hospitalityRequestId: attempt.current.id,
        hospitalityExpectedRules: preset.hospitalityRules,
      };
    },
    reset: () => {
      attempt.current = null;
    },
  };
}
export function RoomChargeHospitalityPreview({
  preset,
  quantity = 1,
  recurring = false,
}: {
  preset?: HospitalityChargePreset | null;
  quantity?: number;
  recurring?: boolean;
}) {
  if (!preset?.hospitalityRules?.length) return null;
  let services: InclusionRule[];
  try {
    services = roomChargeInclusions(preset.hospitalityRules, quantity);
  } catch (error) {
    return (
      <p role="alert" className="text-sm text-destructive">
        {(error as Error).message}
      </p>
    );
  }
  return (
    <aside
      className="rounded-lg border border-blue-200 bg-blue-50 p-3 text-sm text-blue-950 dark:bg-blue-950/30 dark:text-blue-100"
      data-testid="charge-hospitality-preview"
    >
      <p className="font-semibold">Aviso a Hospitalidad al guardar el cargo</p>
      {services.map((service) => (
        <p key={service.id}>
          {inclusionAreaLabels[service.area]} · {service.service}:{" "}
          <strong>{service.quantity}</strong>
          {recurring ? " en total, distribuidos por noche" : ""}
        </p>
      ))}
      <p className="mt-1 text-xs">
        Se registra una sola vez junto con el cargo. Las áreas coordinan la
        atención.
      </p>
    </aside>
  );
}
export function RoomChargeInclusionEditor({
  value,
  onChange,
  disabled = false,
}: {
  value: InclusionRule[];
  onChange: (rules: InclusionRule[]) => void;
  disabled?: boolean;
}) {
  return (
    <div className="space-y-3 rounded-lg border p-3">
      <label className="flex items-center gap-2 text-sm font-medium">
        <input
          type="checkbox"
          disabled={disabled}
          checked={value.length > 0}
          onChange={(event) =>
            onChange(
              event.target.checked
                ? [
                    {
                      id: crypto.randomUUID(),
                      area: "restaurant",
                      service: "",
                      quantity: 1,
                      basis: "stay",
                      conditions: "",
                      readyWhen: "arrival",
                    },
                  ]
                : [],
            )
          }
        />
        Genera aviso en Hospitalidad
      </label>
      {!!value.length && (
        <>
          <p className="text-xs text-muted-foreground">
            Configurá qué habilita cada unidad vendida. Por ejemplo, una cena
            por cada unidad de Media pensión. En un cargo por noche, cada noche
            es una unidad.
          </p>
          <InclusionRulesEditor
            charge
            value={value}
            onChange={onChange}
            disabled={disabled}
          />
        </>
      )}
    </div>
  );
}
