import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { useLocation } from "wouter";
import {
  LogIn, LogOut, CreditCard, Building2,
  CheckCircle, AlertTriangle, RefreshCw,
  Wallet, ClipboardCheck,
} from "lucide-react";

const AREA_LABEL: Record<string, string> = {
  reception: "Recepción",
  recepcion: "Recepción",
  restaurant: "Restaurante",
  spa: "SPA",
  events: "Eventos",
  eventos: "Eventos",
};

function formatCurrency(n: number) {
  return "$ " + Math.round(n).toLocaleString("es-AR");
}

function formatTime(dateStr: string) {
  return new Date(dateStr).toLocaleTimeString("es-AR", {
    hour: "2-digit", minute: "2-digit", timeZone: "America/Argentina/Buenos_Aires",
  });
}

export default function OperacionesPage() {
  const [, navigate] = useLocation();
  const { data, isLoading, refetch, isFetching } = useQuery<any>({
    queryKey: ["/api/operaciones/resumen"],
    queryFn: async () => {
      const res = await fetch("/api/operaciones/resumen", { credentials: "include" });
      if (!res.ok) throw new Error("Error cargando tablero");
      return res.json();
    },
    refetchInterval: 60_000,
  });

  const today = new Date().toLocaleDateString("es-AR", {
    weekday: "long", day: "2-digit", month: "long",
    timeZone: "America/Argentina/Buenos_Aires",
  });

  return (
    <div className="p-4 md:p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold capitalize">{today}</h1>
          <p className="text-muted-foreground text-sm">Tablero operativo del día</p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => refetch()}
          disabled={isFetching}
          data-testid="btn-refresh-tablero"
        >
          <RefreshCw className={`h-4 w-4 mr-2 ${isFetching ? "animate-spin" : ""}`} />
          Actualizar
        </Button>
      </div>

      {isLoading ? (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {Array(8).fill(0).map((_, i) => <Skeleton key={i} className="h-28" />)}
        </div>
      ) : (
        <>
          {/* Fila 1 — Métricas principales */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <Card
              className="border-l-4 border-l-green-400 hover:shadow-md transition-shadow cursor-pointer"
              onClick={() => navigate("/check-in")}
              data-testid="card-checkins"
            >
              <CardContent className="p-4">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-md bg-green-100 dark:bg-green-900/30">
                    <LogIn className="h-5 w-5 text-green-600 dark:text-green-400" />
                  </div>
                  <div>
                    <p className="text-3xl font-bold">{data?.checkIns?.total ?? 0}</p>
                    <p className="text-xs text-muted-foreground">Check-ins hoy</p>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card
              className="border-l-4 border-l-amber-400 hover:shadow-md transition-shadow cursor-pointer"
              onClick={() => navigate("/check-out")}
              data-testid="card-checkouts"
            >
              <CardContent className="p-4">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-md bg-amber-100 dark:bg-amber-900/30">
                    <LogOut className="h-5 w-5 text-amber-600 dark:text-amber-400" />
                  </div>
                  <div>
                    <p className="text-3xl font-bold">{data?.checkOuts?.total ?? 0}</p>
                    <p className="text-xs text-muted-foreground">Check-outs hoy</p>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card
              className={`border-l-4 ${(data?.foliosConSaldo?.total ?? 0) > 0 ? "border-l-red-400" : "border-l-gray-200"} hover:shadow-md transition-shadow cursor-pointer`}
              onClick={() => navigate("/reservations")}
              data-testid="card-folios"
            >
              <CardContent className="p-4">
                <div className="flex items-center gap-3">
                  <div className={`p-2 rounded-md ${(data?.foliosConSaldo?.total ?? 0) > 0 ? "bg-red-100 dark:bg-red-900/30" : "bg-muted"}`}>
                    <CreditCard className={`h-5 w-5 ${(data?.foliosConSaldo?.total ?? 0) > 0 ? "text-red-600 dark:text-red-400" : "text-muted-foreground"}`} />
                  </div>
                  <div>
                    <p className="text-3xl font-bold">{data?.foliosConSaldo?.total ?? 0}</p>
                    <p className="text-xs text-muted-foreground">Saldos pendientes</p>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card
              className={`border-l-4 ${(data?.housekeeping?.habitacionesSucias ?? 0) > 0 ? "border-l-orange-400" : "border-l-gray-200"} hover:shadow-md transition-shadow cursor-pointer`}
              onClick={() => navigate("/housekeeping")}
              data-testid="card-dirty-rooms"
            >
              <CardContent className="p-4">
                <div className="flex items-center gap-3">
                  <div className={`p-2 rounded-md ${(data?.housekeeping?.habitacionesSucias ?? 0) > 0 ? "bg-orange-100 dark:bg-orange-900/30" : "bg-muted"}`}>
                    <Building2 className={`h-5 w-5 ${(data?.housekeeping?.habitacionesSucias ?? 0) > 0 ? "text-orange-600 dark:text-orange-400" : "text-muted-foreground"}`} />
                  </div>
                  <div>
                    <p className="text-3xl font-bold">{data?.housekeeping?.habitacionesSucias ?? 0}</p>
                    <p className="text-xs text-muted-foreground">Hab. para limpiar</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Fila 2 — Cajas + Housekeeping + Incidencias */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {/* Cajas */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm flex items-center gap-2">
                  <Wallet className="h-4 w-4" />
                  Cajas del día
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {Object.keys(data?.cajas?.recaudacionPorArea ?? {}).length === 0 ? (
                  <p className="text-xs text-muted-foreground italic">Sin movimientos hoy</p>
                ) : (
                  Object.entries(data?.cajas?.recaudacionPorArea ?? {}).map(([area, total]: [string, any]) => (
                    <div key={area} className="flex items-center justify-between text-sm">
                      <div className="flex items-center gap-2">
                        <div className={`w-2 h-2 rounded-full ${
                          area === "reception" || area === "recepcion" ? "bg-blue-400" :
                          area === "restaurant" ? "bg-orange-400" :
                          area === "spa" ? "bg-purple-400" : "bg-green-400"
                        }`} />
                        <span className="text-muted-foreground">{AREA_LABEL[area] ?? area}</span>
                      </div>
                      <span className={`font-medium ${total < 0 ? "text-red-600" : ""}`}>
                        {formatCurrency(total)}
                      </span>
                    </div>
                  ))
                )}
                <div className="border-t pt-2 flex justify-between text-sm font-bold">
                  <span>Total recaudado</span>
                  <span className={data?.cajas?.totalRecaudado < 0 ? "text-red-600" : ""}>
                    {formatCurrency(data?.cajas?.totalRecaudado ?? 0)}
                  </span>
                </div>
                <div className="border-t pt-2 space-y-1">
                  <p className="text-xs text-muted-foreground">Cajas abiertas ahora</p>
                  {(data?.cajas?.detalle ?? []).length === 0 ? (
                    <p className="text-xs text-muted-foreground italic">Ninguna</p>
                  ) : (
                    (data?.cajas?.detalle ?? []).map((c: any) => (
                      <div key={c.id} className="flex items-center justify-between">
                        <div className="flex items-center gap-1.5">
                          <div className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
                          <span className="text-xs">{AREA_LABEL[c.area] ?? c.area}</span>
                          {c.autoCreado && (
                            <Badge variant="outline" className="text-[10px] px-1 py-0">auto</Badge>
                          )}
                        </div>
                        <span className="text-xs text-muted-foreground">
                          {c.openedBy ?? "—"} · {formatTime(c.openedAt)}
                        </span>
                      </div>
                    ))
                  )}
                </div>
              </CardContent>
            </Card>

            {/* Housekeeping */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm flex items-center gap-2">
                  <ClipboardCheck className="h-4 w-4" />
                  Housekeeping
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {(data?.housekeeping?.totalTareas ?? 0) > 0 && (
                  <div className="space-y-1">
                    <div className="flex justify-between text-xs text-muted-foreground">
                      <span>Progreso del día</span>
                      <span>
                        {data?.housekeeping?.tareasCompletadas ?? 0} / {data?.housekeeping?.totalTareas ?? 0}
                      </span>
                    </div>
                    <div className="h-2 bg-muted rounded-full overflow-hidden">
                      <div
                        className="h-full bg-green-500 transition-all"
                        style={{
                          width: `${Math.round(
                            ((data?.housekeeping?.tareasCompletadas ?? 0) /
                            Math.max(data?.housekeeping?.totalTareas ?? 1, 1)) * 100
                          )}%`,
                        }}
                      />
                    </div>
                  </div>
                )}
                <div className="space-y-2">
                  {[
                    { label: "Pendientes", value: data?.housekeeping?.tareasPendientes, color: "text-gray-600" },
                    { label: "En proceso", value: data?.housekeeping?.tareasEnProceso, color: "text-blue-600" },
                    { label: "Completadas", value: data?.housekeeping?.tareasCompletadas, color: "text-green-600" },
                  ].map(({ label, value, color }) => (
                    <div key={label} className="flex justify-between text-sm">
                      <span className="text-muted-foreground">{label}</span>
                      <span className={`font-medium ${color}`}>{value ?? 0}</span>
                    </div>
                  ))}
                </div>
                <div className="border-t pt-2 flex justify-between text-sm">
                  <span className="text-muted-foreground">Hab. sucias sin tarea</span>
                  <span className={`font-medium ${(data?.housekeeping?.habitacionesSucias ?? 0) > 0 ? "text-orange-600" : "text-green-600"}`}>
                    {data?.housekeeping?.habitacionesSucias ?? 0}
                  </span>
                </div>
                <Button
                  variant="outline" size="sm" className="w-full"
                  onClick={() => navigate("/housekeeping")}
                >
                  Ver housekeeping
                </Button>
              </CardContent>
            </Card>

            {/* Incidencias */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm flex items-center gap-2">
                  <AlertTriangle className="h-4 w-4" />
                  Incidencias abiertas
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {(data?.incidencias?.abiertas ?? 0) === 0 ? (
                  <div className="flex items-center gap-2 text-green-600">
                    <CheckCircle className="h-4 w-4" />
                    <span className="text-sm">Sin incidencias activas</span>
                  </div>
                ) : (
                  <>
                    <div className="flex items-center gap-3">
                      <div className="text-3xl font-bold text-orange-600">
                        {data?.incidencias?.abiertas}
                      </div>
                      <div className="text-sm text-muted-foreground">
                        {data?.incidencias?.abiertas === 1 ? "incidencia abierta" : "incidencias abiertas"}
                      </div>
                    </div>
                    {(data?.incidencias?.criticas ?? 0) > 0 && (
                      <div className="flex items-center gap-2 p-2 bg-red-50 dark:bg-red-900/20 rounded-md">
                        <AlertTriangle className="h-4 w-4 text-red-600" />
                        <span className="text-sm text-red-600 font-medium">
                          {data?.incidencias?.criticas} crítica{data?.incidencias?.criticas > 1 ? "s" : ""}
                        </span>
                      </div>
                    )}
                  </>
                )}
                <Button
                  variant="outline" size="sm" className="w-full"
                  onClick={() => navigate("/administration")}
                >
                  Ver bitácora
                </Button>
              </CardContent>
            </Card>
          </div>

          {/* Fila 3 — Folios con saldo pendiente */}
          {(data?.foliosConSaldo?.items ?? []).length > 0 && (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm flex items-center gap-2">
                  <CreditCard className="h-4 w-4 text-red-500" />
                  Huéspedes in-house con saldo pendiente
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {data.foliosConSaldo.items.map((folio: any) => (
                    <div
                      key={folio.reservationId}
                      className="flex items-center justify-between p-2 rounded-md hover:bg-muted/50 cursor-pointer transition-colors"
                      onClick={() => navigate(`/reservations`)}
                      data-testid={`folio-row-${folio.reservationId}`}
                    >
                      <Badge variant="outline" className="text-xs font-mono">
                        {folio.reservationCode}
                      </Badge>
                      <span className="text-sm font-bold text-red-600">
                        {formatCurrency(folio.balance)}
                      </span>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Fila 4 — Check-ins y Check-outs del día */}
          {((data?.checkIns?.reservas ?? []).length > 0 || (data?.checkOuts?.reservas ?? []).length > 0) && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {(data?.checkIns?.reservas ?? []).length > 0 && (
                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-sm flex items-center gap-2">
                      <LogIn className="h-4 w-4 text-green-600" />
                      Llegadas de hoy
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-2">
                      {data.checkIns.reservas.map((r: any) => (
                        <div
                          key={r.id}
                          className="flex items-center justify-between p-2 rounded-md hover:bg-muted/50 cursor-pointer"
                          onClick={() => navigate("/check-in")}
                          data-testid={`checkin-row-${r.id}`}
                        >
                          <div className="flex items-center gap-2">
                            <Badge variant="outline" className="text-xs font-mono">{r.reservationCode}</Badge>
                            <span className="text-xs text-muted-foreground">Hab. {r.roomId ?? "—"}</span>
                          </div>
                          <Badge className="text-xs bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400">
                            Pendiente
                          </Badge>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              )}

              {(data?.checkOuts?.reservas ?? []).length > 0 && (
                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-sm flex items-center gap-2">
                      <LogOut className="h-4 w-4 text-amber-600" />
                      Salidas de hoy
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-2">
                      {data.checkOuts.reservas.map((r: any) => (
                        <div
                          key={r.id}
                          className="flex items-center justify-between p-2 rounded-md hover:bg-muted/50 cursor-pointer"
                          onClick={() => navigate("/check-out")}
                          data-testid={`checkout-row-${r.id}`}
                        >
                          <div className="flex items-center gap-2">
                            <Badge variant="outline" className="text-xs font-mono">{r.reservationCode}</Badge>
                            <span className="text-xs text-muted-foreground">Hab. {r.roomId ?? "—"}</span>
                          </div>
                          <Badge className="text-xs bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400">
                            In-house
                          </Badge>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}
