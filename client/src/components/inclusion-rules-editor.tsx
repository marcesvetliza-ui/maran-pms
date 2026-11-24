import { useEffect, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { apiRequest, parseApiError } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Textarea } from "./ui/textarea";
import {
  inclusionAreaLabels,
  inclusionBasisLabels,
  inclusionReadyLabels,
  inclusionAreas,
  type InclusionRule,
  inclusionRulesSchema,
} from "@shared/hospitalityInclusions";

export function InclusionRulesEditor({
  value,
  onChange,
  spa = false,
  disabled = false,
}: {
  value: InclusionRule[];
  onChange: (rules: InclusionRule[]) => void;
  spa?: boolean;
  disabled?: boolean;
}) {
  const add = (area: InclusionRule["area"]) =>
    onChange([
      ...value,
      {
        id: crypto.randomUUID(),
        area,
        service: "",
        quantity: 1,
        basis: spa ? "stay" : "person_night",
        conditions: "",
        readyWhen: spa ? "coordinate" : "arrival",
      },
    ]);
  const change = (id: string, patch: Partial<InclusionRule>) =>
    onChange(value.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  return (
    <fieldset disabled={disabled} className="min-w-0 space-y-4">
      <legend className="font-semibold">
        Servicios incluidos de otras áreas
      </legend>
      <p className="text-sm text-muted-foreground">
        Indicá qué le corresponde al cliente y cómo se calcula. La programación
        de mesa, turno o habitación se coordina con cada área.
      </p>
      <div className="flex flex-wrap gap-3">
        {inclusionAreas.map((area) => (
          <label key={area} className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={value.some((r) => r.area === area)}
              onChange={(e) =>
                e.target.checked
                  ? add(area)
                  : onChange(value.filter((r) => r.area !== area))
              }
            />
            Incluye {inclusionAreaLabels[area]}
          </label>
        ))}
      </div>
      {value.map((r, index) => (
        <div
          key={r.id}
          className="rounded-lg border p-3 space-y-3"
          data-testid="inclusion-rule"
        >
          <div className="flex items-center justify-between gap-2">
            <strong className="text-sm">
              {inclusionAreaLabels[r.area]} · Servicio {index + 1}
            </strong>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => onChange(value.filter((x) => x.id !== r.id))}
              aria-label={`Quitar servicio ${index + 1}`}
            >
              Quitar
            </Button>
          </div>
          <label className="block text-sm">
            Servicio
            <Input
              aria-label={`Servicio ${index + 1}`}
              maxLength={160}
              value={r.service}
              placeholder="Ej.: Cena de menú, masaje de 30 minutos"
              onChange={(e) => change(r.id, { service: e.target.value })}
            />
          </label>
          <div className="grid gap-3 sm:grid-cols-3">
            <label className="block text-sm">
              Cantidad
              <Input
                type="number"
                min={1}
                max={100}
                aria-label={`Cantidad ${index + 1}`}
                value={r.quantity}
                onChange={(e) =>
                  change(r.id, { quantity: Number(e.target.value) })
                }
              />
            </label>
            <label className="block text-sm">
              Se calcula
              <select
                aria-label={`Cálculo ${index + 1}`}
                className="h-10 w-full rounded-md border bg-background px-2"
                value={r.basis}
                onChange={(e) =>
                  change(r.id, {
                    basis: e.target.value as InclusionRule["basis"],
                  })
                }
              >
                {Object.entries(inclusionBasisLabels)
                  .filter(([k]) => !spa || k === "stay")
                  .map(([k, v]) => (
                    <option key={k} value={k}>
                      {spa && k === "stay" ? "Por turno / unidad vendida" : v}
                    </option>
                  ))}
              </select>
            </label>
            <label className="block text-sm">
              Disponible para atender
              <select
                aria-label={`Aviso ${index + 1}`}
                className="h-10 w-full rounded-md border bg-background px-2"
                value={r.readyWhen}
                onChange={(e) =>
                  change(r.id, {
                    readyWhen: e.target.value as InclusionRule["readyWhen"],
                  })
                }
              >
                {Object.entries(inclusionReadyLabels).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v}
                  </option>
                ))}
              </select>
            </label>
          </div>
          {spa && (
            <p className="text-xs text-muted-foreground">
              La cantidad se aplica a cada turno o unidad vendida. Si incluye
              almuerzo para dos, indicá 2. Para alojamiento, indicá cuántas
              noches se incluyen.
            </p>
          )}
          <label className="block text-sm">
            Condiciones
            <Textarea
              aria-label={`Condiciones ${index + 1}`}
              maxLength={600}
              value={r.conditions}
              placeholder="Ej.: Sin bebidas. Adultos. A coordinar disponibilidad."
              onChange={(e) => change(r.id, { conditions: e.target.value })}
            />
          </label>
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => add(r.area)}
          >
            Agregar otro servicio de {inclusionAreaLabels[r.area]}
          </Button>
        </div>
      ))}
    </fieldset>
  );
}

export function InclusionTemplateEditor({
  type,
  id,
}: {
  type: "package" | "treatment";
  id: string;
}) {
  const { toast } = useToast();
  const url = `/api/hospitality/included-services/templates/${type}/${id}`;
  const query = useQuery<{ rules: InclusionRule[]; revision: number }>({
    queryKey: [url],
    queryFn: async () => (await apiRequest("GET", url)).json(),
    retry: false,
  });
  const [rules, setRules] = useState<InclusionRule[]>([]);
  const [revision, setRevision] = useState(0);
  const [dirty, setDirty] = useState(false);
  useEffect(() => {
    if (query.data && !dirty) {
      setRules(query.data.rules);
      setRevision(query.data.revision);
    }
  }, [query.data, dirty]);
  const save = useMutation({
    mutationFn: async () => {
      const parsed = inclusionRulesSchema.parse(rules);
      await apiRequest("PUT", url, { rules: parsed, revision });
    },
    onSuccess: async () => {
      setDirty(false);
      await query.refetch();
      toast({
        title: "Incluidos guardados",
        description:
          "Se aplican a las próximas ventas y reservas. Lo ya vendido conserva sus condiciones.",
      });
    },
    onError: (e) =>
      toast({
        title: "No se pudieron guardar los incluidos",
        description: parseApiError(e),
        variant: "destructive",
      }),
  });
  if (query.isLoading)
    return <p role="status">Cargando servicios incluidos…</p>;
  if (query.error)
    return (
      <div role="alert">
        <p>{parseApiError(query.error)}</p>
        <Button
          type="button"
          variant="outline"
          onClick={() => void query.refetch()}
        >
          Reintentar incluidos
        </Button>
      </div>
    );
  return (
    <section className="space-y-3 border-t pt-4">
      <InclusionRulesEditor
        value={rules}
        onChange={(r) => {
          setRules(r);
          setDirty(true);
        }}
        spa={type === "treatment"}
        disabled={save.isPending}
      />
      <p className="text-xs text-muted-foreground">
        Esta configuración tiene su propio guardado. Los cambios no alteran
        servicios vendidos anteriormente.
      </p>
      <Button
        type="button"
        disabled={
          !dirty ||
          save.isPending ||
          !inclusionRulesSchema.safeParse(rules).success
        }
        onClick={() => save.mutate()}
      >
        {save.isPending ? "Guardando…" : "Guardar incluidos"}
      </Button>
    </section>
  );
}
