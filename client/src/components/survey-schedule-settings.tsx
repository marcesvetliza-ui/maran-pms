import { useEffect, useState } from "react";
import { useAuth } from "@/App";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
export function SurveyScheduleSettings({
  cfg,
  onSave,
}: {
  cfg: any;
  onSave: (data: any) => void;
}) {
  const { hasPermission } = useAuth();
  const [days, setDays] = useState(1),
    [time, setTime] = useState("10:00");
  useEffect(() => {
    if (cfg) {
      setDays(cfg.checkoutDelayDays ?? 1);
      setTime(cfg.checkoutSendTime || "10:00");
    }
  }, [cfg]);
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Cuándo enviar la encuesta</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-sm text-muted-foreground">
          Después de la salida efectiva, con horario de Argentina. Si reabren la
          estadía antes del envío, espera a que vuelvan a cerrarla.
        </p>
        <div className="flex flex-wrap items-end gap-3">
          <label className="text-sm space-y-1">
            Días después de la salida
            <select
              className="block h-10 border rounded bg-background px-3"
              aria-label="Días después de la salida"
              value={days}
              disabled={!hasPermission("api:reviews:configure")}
              onChange={(e) => setDays(Number(e.target.value))}
            >
              <option value={0}>El mismo día</option>
              <option value={1}>Al día siguiente</option>
              <option value={2}>Dos días después</option>
            </select>
          </label>
          <label className="text-sm space-y-1">
            Hora (Argentina)
            <Input
              type="time"
              aria-label="Hora de la encuesta"
              value={time}
              disabled={!hasPermission("api:reviews:configure")}
              onChange={(e) => setTime(e.target.value)}
            />
          </label>
          {hasPermission("api:reviews:configure") && (
            <Button
              variant="outline"
              disabled={!time}
              onClick={() =>
                onSave({ checkoutDelayDays: days, checkoutSendTime: time })
              }
            >
              Guardar horario
            </Button>
          )}
        </div>
        <p className="text-xs text-muted-foreground">
          Si elegís el mismo día y ya pasó esa hora, se envía después del
          check-out. No se enviarán encuestas automáticamente a salidas
          anteriores a esta puesta en marcha.
        </p>
      </CardContent>
    </Card>
  );
}
