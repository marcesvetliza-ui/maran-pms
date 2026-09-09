  spa: "SPA",
  eventos: "Eventos",
  restaurant: "Restaurante",
};

function printResumenDia(fecha: string, data: { movimientos: any[]; totalPorMetodo: Record<string, number>; porModulo: Record<string, number>; totalGeneral: number }) {
  const { movimientos, totalPorMetodo, porModulo, totalGeneral } = data;
  const [y, m, d] = fecha.split("-");
  const fechaFmt = `${d}/${m}/${y}`;
  const html = `<!DOCTYPE html><html><head><title>Resumen del Día — ${fechaFmt}</title>
<style>body{font-family:Arial,sans-serif;padding:20px;max-width:700px;margin:0 auto}
table{width:100%;border-collapse:collapse;margin:16px 0}th,td{border:1px solid #ccc;padding:8px;text-align:left}
th{background:#f5f5f5}.total{font-weight:bold;background:#eee}h1{font-size:18px}h2{font-size:14px;color:#555;margin-top:20px}
.footer{text-align:center;margin-top:24px;font-size:10px;color:#999;border-top:1px solid #eee;padding-top:8px}</style>
</head><body>
<h1>Resumen de Ingresos del Día — ${fechaFmt}</h1>
<p style="color:#666;font-size:13px;margin:0 0 12px">Consolidado de todas las áreas — Maran Suites &amp; Towers</p>
<h2>Por Área</h2>
<table><thead><tr><th>Área</th><th>Total</th></tr></thead><tbody>
${Object.entries(porModulo).map(([m, v]) => `<tr><td>${MODULO_LABEL[m] || m}</td><td>${formatCurrency(v as number)}</td></tr>`).join("")}
<tr class="total"><td>TOTAL GENERAL</td><td>${formatCurrency(totalGeneral)}</td></tr>
</tbody></table>
<h2>Por Método de Pago</h2>
<table><thead><tr><th>Método</th><th>Total</th></tr></thead><tbody>
${Object.entries(totalPorMetodo).map(([m, v]) => `<tr><td>${PAYMENT_METHOD_MAP[m] || m}</td><td>${formatCurrency(v as number)}</td></tr>`).join("")}
<tr class="total"><td>TOTAL</td><td>${formatCurrency(totalGeneral)}</td></tr>
</tbody></table>
<h2>Detalle de Movimientos (${movimientos.length})</h2>
<table><thead><tr><th>Área</th><th>Descripción</th><th>Referencia</th><th>Método</th><th>Monto</th></tr></thead><tbody>
${movimientos.map(m => `<tr><td>${MODULO_LABEL[m.modulo] || m.modulo}</td><td>${m.descripcion || "-"}</td><td>${m.referencia || "-"}</td><td>${PAYMENT_METHOD_MAP[m.metodo] || m.metodo}</td><td>${formatCurrency(m.monto)}</td></tr>`).join("")}
</tbody></table>
<div class="footer">Generado el ${formatHotelDateTime(new Date())} | Maran Suites & Towers</div>
<script>window.onload=function(){window.print();}<\/script>
</body></html>`;
  const w = window.open("", "_blank");
  if (w) { w.document.write(html); w.document.close(); }
}

function ResumenDiaTab() {
  const today = getArgentinaToday();
  const [fecha, setFecha] = useState(today);
  const { data, isLoading } = useQuery<{ fecha: string; movimientos: any[]; totalPorMetodo: Record<string, number>; porModulo: Record<string, number>; totalGeneral: number }>({
    queryKey: ["/api/reports/caja-unificada", fecha],
    queryFn: async () => {
      const res = await fetch(`/api/reports/caja-unificada?fecha=${fecha}`, { credentials: "include" });
      return res.json();
    },
  });

  const modulos = ["reserva", "spa", "eventos", "restaurant"];

  const fechaDisplay = fecha ? `${fecha.split("-")[2]}/${fecha.split("-")[1]}/${fecha.split("-")[0]}` : fecha;

  return (
    <div className="space-y-6 mt-4">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h2 className="text-lg font-semibold">Resumen del Día</h2>
          <p className="text-sm text-muted-foreground">Consolidado de ingresos de todas las áreas</p>
        </div>
        <div className="flex items-center gap-3">
        <div className="flex items-center gap-2">
          <label className="text-sm font-medium">Fecha:</label>
          <Input type="date" value={fecha} onChange={e => setFecha(e.target.value)} className="w-44" data-testid="input-resumen-dia-fecha" />
        </div>
        {data && (
          <Button variant="outline" size="sm" onClick={() => printResumenDia(fecha, data)} data-testid="btn-print-resumen-dia">
            <Printer className="h-4 w-4 mr-2" />
            Imprimir
          </Button>
        )}
        </div>
      </div>

      {isLoading ? (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[...Array(4)].map((_, i) => <Skeleton key={i} className="h-24" />)}
        </div>
      ) : data ? (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {modulos.map(mod => {
              const total = data.porModulo?.[mod] || 0;
              return (
                <Card key={mod} data-testid={`card-resumen-${mod}`}>
                  <CardContent className="pt-4 pb-3">
                    <div className="flex items-center gap-2 mb-1">
                      <CreditCard className="h-4 w-4 text-muted-foreground" />
                      <span className="text-sm text-muted-foreground">{MODULO_LABEL[mod]}</span>
                    </div>
                    <p className="text-2xl font-bold">{formatCurrency(total)}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {data.movimientos.filter(m => m.modulo === mod).length} movimientos
                    </p>
                  </CardContent>
                </Card>
              );
            })}
          </div>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base flex items-center gap-2">
                <BarChart3 className="h-4 w-4" />
                Resumen por Método de Pago
              </CardTitle>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Método</TableHead>
                    <TableHead className="text-right">Total</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {Object.entries(data.totalPorMetodo || {}).map(([m, v]) => (
                    <TableRow key={m}>
                      <TableCell>{PAYMENT_METHOD_MAP[m] || m}</TableCell>
                      <TableCell className="text-right font-medium">{formatCurrency(v as number)}</TableCell>
                    </TableRow>
                  ))}
                  <TableRow className="font-bold border-t-2">
                    <TableCell>TOTAL GENERAL</TableCell>
                    <TableCell className="text-right">{formatCurrency(data.totalGeneral)}</TableCell>
                  </TableRow>
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          {data.movimientos.length > 0 && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base">Detalle de Movimientos ({data.movimientos.length})</CardTitle>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Área</TableHead>
                      <TableHead>Descripción</TableHead>
                      <TableHead>Referencia</TableHead>
                      <TableHead>Método</TableHead>
                      <TableHead className="text-right">Monto</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {data.movimientos.map((m, i) => (
                      <TableRow key={i} data-testid={`row-resumen-mov-${i}`}>
                        <TableCell>
                          <Badge variant="secondary">{MODULO_LABEL[m.modulo] || m.modulo}</Badge>
                        </TableCell>
                        <TableCell className="max-w-[200px] truncate">{m.descripcion || "-"}</TableCell>
                        <TableCell className="text-muted-foreground text-xs">{m.referencia || "-"}</TableCell>
                        <TableCell>{PAYMENT_METHOD_MAP[m.metodo] || m.metodo}</TableCell>
                        <TableCell className="text-right font-medium">{formatCurrency(m.monto)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          )}

          {data.movimientos.length === 0 && (
            <div className="text-center py-12 text-muted-foreground" data-testid="text-resumen-empty">
              No hay movimientos registrados para el {fecha}
            </div>
          )}
        </>
      ) : null}
    </div>
  );
}

const NA_STATUS_COLOR: Record<string, string> = {
  success: "text-green-600", partial: "text-yellow-600", failed: "text-red-600",
};
const NA_STATUS_LABEL: Record<string, string> = {
  success: "Exitoso", partial: "Parcial", failed: "Fallido",
};

function NightAuditDetailDialog({ audit, open, onClose }: { audit: any; open: boolean; onClose: () => void }) {
  if (!audit) return null;
  let detail: { inHouse?: any[]; arrivals?: any[] } = {};
  try { detail = JSON.parse(audit.detail || "{}"); } catch {}
  const inHouse = (detail.inHouse || []).slice().sort((a: any, b: any) => parseInt(a.roomNumber) - parseInt(b.roomNumber));
  const arrivals = (detail.arrivals || []).slice().sort((a: any, b: any) => parseInt(a.roomNumber) - parseInt(b.roomNumber));
  const conSaldo = inHouse.filter((r: any) => r.hasBalance);
  const fmt = (n: number) => n.toLocaleString("es-AR", { style: "currency", currency: "ARS", minimumFractionDigits: 0 });

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Moon className="h-4 w-4" />
            Night Audit — {audit.auditDate}
          </DialogTitle>
          <DialogDescription>
            Ejecutado el {formatHotelDateTime(audit.executedAt)} por {audit.executedBy}
            {audit.isManual && <Badge variant="outline" className="ml-2 text-[10px]">manual</Badge>}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {[
              { label: "Hab. ocupadas", value: audit.reservationsProcessed },
              { label: "Con saldo", value: audit.reservationsSkipped },
              { label: "Llegadas mañana", value: audit.arrivalsNextDay },
              { label: "Sin prepago", value: audit.arrivalsWithoutPrepago },
            ].map(({ label, value }) => (
              <div key={label} className="text-center p-3 bg-muted/40 rounded-lg">
                <p className="text-2xl font-bold">{value}</p>
                <p className="text-xs text-muted-foreground">{label}</p>
              </div>
            ))}
          </div>

          {inHouse.length > 0 && (
            <div>
              <h4 className="text-sm font-semibold mb-2 flex items-center gap-1">
                <CheckCircle className="h-4 w-4 text-green-600" />
                Habitaciones en casa ({inHouse.length})
              </h4>
              <div className="rounded border overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="text-xs">Hab.</TableHead>
                      <TableHead className="text-xs">Código</TableHead>
                      <TableHead className="text-xs">Check-out</TableHead>
                      <TableHead className="text-xs text-right">Cargos</TableHead>
                      <TableHead className="text-xs text-right">Pagado</TableHead>
                      <TableHead className="text-xs text-right">Saldo</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {inHouse.map((r: any) => (
                      <TableRow key={r.reservationId} className={r.hasBalance ? "bg-amber-50 dark:bg-amber-950/20" : ""}>
                        <TableCell className="text-sm font-medium">{r.roomNumber}</TableCell>
                        <TableCell className="text-xs font-mono text-muted-foreground">{r.reservationCode}</TableCell>
                        <TableCell className="text-xs">{r.checkOutDate}</TableCell>
                        <TableCell className="text-xs text-right">{fmt(r.totalCharges)}</TableCell>
                        <TableCell className="text-xs text-right">{fmt(r.totalPaid)}</TableCell>
                        <TableCell className={`text-xs text-right font-semibold ${r.hasBalance ? "text-amber-600" : "text-muted-foreground"}`}>
                          {r.hasBalance ? fmt(r.balance) : "—"}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
              {conSaldo.length > 0 && (
                <p className="text-xs text-amber-600 mt-1 flex items-center gap-1">
                  <AlertTriangle className="h-3 w-3" />
                  {conSaldo.length} habitación(es) con saldo pendiente
                </p>
              )}
            </div>
          )}

          {arrivals.length > 0 && (
            <div>
              <h4 className="text-sm font-semibold mb-2">Llegadas al día siguiente ({arrivals.length})</h4>
              <div className="rounded border overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="text-xs">Código</TableHead>
                      <TableHead className="text-xs text-right">Prepago</TableHead>
                      <TableHead className="text-xs text-center">Estado prepago</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {arrivals.map((a: any) => (
                      <TableRow key={a.reservationId}>
                        <TableCell className="text-xs font-mono">{a.reservationCode}</TableCell>
                        <TableCell className="text-xs text-right">{fmt(a.totalPaid)}</TableCell>
                        <TableCell className="text-center">
                          {a.hasPrepago
                            ? <Badge className="text-[10px] bg-green-100 text-green-700">Con prepago</Badge>
                            : <Badge className="text-[10px] bg-red-100 text-red-700">Sin prepago</Badge>}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </div>
          )}

          {inHouse.length === 0 && arrivals.length === 0 && (
            <p className="text-sm text-muted-foreground text-center py-4">No hay detalle disponible para este audit.</p>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cerrar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function NightAuditTab() {
  const { toast } = useToast();
  const [isRunning, setIsRunning] = useState(false);
  const [forceDate, setForceDate] = useState("");
  const [lastResult, setLastResult] = useState<any>(null);
  const [showConfirm, setShowConfirm] = useState(false);
  const [selectedAudit, setSelectedAudit] = useState<any>(null);

  const { data: status, refetch: refetchStatus } = useQuery<any>({
    queryKey: ["/api/night-audit/status"],
    refetchInterval: 60_000,
  });

  const { data: history = [], refetch: refetchHistory } = useQuery<any[]>({
    queryKey: ["/api/night-audit/history"],
  });

  const runAudit = async (force = false) => {
    setIsRunning(true);
    setShowConfirm(false);
    try {
      const body: any = { force };
      if (forceDate) body.forceDate = forceDate;
      const res = await fetch("/api/night-audit/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(body),
      });
      if (res.status === 409) { setShowConfirm(true); setIsRunning(false); return; }
      if (!res.ok) { const err = await res.json(); throw new Error(err.error || "Error"); }
      const data = await res.json();
      setLastResult(data);
      refetchStatus(); refetchHistory();
      queryClient.invalidateQueries({ queryKey: ["/api/night-audit"] });
      toast({ title: "Night Audit completado", description: `${data.inHouse?.total ?? 0} hab. ocupadas, ${data.arrivals?.total ?? 0} llegadas mañana` });
    } catch (err: any) {
      toast({ title: "Error en Night Audit", description: err.message, variant: "destructive" });
    } finally { setIsRunning(false); }
  };

  return (
    <div className="space-y-6 pt-4">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card className={`border-l-4 ${status?.yesterdayRan ? "border-l-green-400" : "border-l-red-400"}`}>
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-1">
              {status?.yesterdayRan ? <CheckCircle className="h-4 w-4 text-green-600" /> : <AlertTriangle className="h-4 w-4 text-red-600" />}
              <span className="text-sm font-medium">Anoche</span>
            </div>
            <p className={`text-sm ${status?.yesterdayRan ? "text-green-600" : "text-red-600"}`}>
              {status?.yesterdayRan ? "Ejecutado correctamente" : "⚠ No se ejecutó"}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-1">
              <Clock className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm font-medium">Próxima ejecución</span>
            </div>
            <p className="text-sm text-muted-foreground">{status?.nextScheduled ?? "00:05 hora Argentina"}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-1">
              <Moon className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm font-medium">Último audit</span>
            </div>
            {status?.lastAudit ? (
              <div>
                <p className={`text-sm font-medium ${NA_STATUS_COLOR[status.lastAudit.status]}`}>
                  {NA_STATUS_LABEL[status.lastAudit.status]} — {status.lastAudit.auditDate}
                </p>
                <p className="text-xs text-muted-foreground">{formatHotelDateTime(status.lastAudit.executedAt)}</p>
              </div>
            ) : <p className="text-sm text-muted-foreground">Sin registros</p>}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="pb-3"><CardTitle className="text-sm">Ejecución manual</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">El night audit se ejecuta automáticamente a las 00:05. Podés ejecutarlo manualmente si es necesario.</p>
          <div className="flex items-end gap-3 flex-wrap">
            <div>
              <Label className="text-xs">Fecha a auditar (vacío = anoche)</Label>
              <Input type="date" value={forceDate} onChange={e => setForceDate(e.target.value)} className="w-44" data-testid="input-audit-date" />
            </div>
            <Button onClick={() => runAudit(false)} disabled={isRunning} data-testid="btn-run-night-audit">
              {isRunning ? <><RefreshCw className="h-4 w-4 mr-2 animate-spin" />Ejecutando...</> : <><Moon className="h-4 w-4 mr-2" />Ejecutar Night Audit</>}
            </Button>
          </div>
          {showConfirm && (
            <div className="p-3 bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-md space-y-2">
              <p className="text-sm font-medium text-yellow-800 dark:text-yellow-400">⚠ Ya se ejecutó el night audit para esta fecha</p>
              <p className="text-xs text-yellow-700 dark:text-yellow-500">¿Querés ejecutarlo de nuevo?</p>
              <div className="flex gap-2">
                <Button size="sm" variant="destructive" onClick={() => runAudit(true)}>Ejecutar de todas formas</Button>
                <Button size="sm" variant="outline" onClick={() => setShowConfirm(false)}>Cancelar</Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {lastResult && (
        <Card className="border-green-200 dark:border-green-800">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm flex items-center gap-2 text-green-700 dark:text-green-400">
              <CheckCircle className="h-4 w-4" />Resultado — {lastResult.auditDate}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
              {[
                { label: "Hab. ocupadas", value: lastResult.inHouse?.total ?? 0 },
                { label: "Folios con saldo", value: lastResult.inHouse?.conSaldo ?? 0 },
                { label: "Llegadas mañana", value: lastResult.arrivals?.total ?? 0 },
                { label: "Sin prepago", value: lastResult.arrivals?.withoutPrepago ?? 0 },
              ].map(({ label, value }) => (
                <div key={label} className="text-center">
                  <p className="text-2xl font-bold">{value}</p>
                  <p className="text-xs text-muted-foreground">{label}</p>
                </div>
              ))}
            </div>
            {(lastResult.arrivals?.withoutPrepago ?? 0) > 0 && (
              <div className="p-2 bg-amber-50 dark:bg-amber-900/20 rounded-md">
                <p className="text-sm text-amber-700 dark:text-amber-400 flex items-center gap-1">
                  <AlertTriangle className="h-4 w-4" />{lastResult.arrivals.withoutPrepago} llegada(s) para mañana sin prepago
                </p>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader className="pb-3"><CardTitle className="text-sm">Historial de ejecuciones</CardTitle></CardHeader>
        <CardContent className="p-0">
          {(history as any[]).length === 0 ? (
            <p className="text-sm text-muted-foreground p-4 text-center">Sin registros aún</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Fecha</TableHead>
                  <TableHead>Ejecutado</TableHead>
                  <TableHead>Por</TableHead>
                  <TableHead className="text-center">Hab. ocupadas</TableHead>
                  <TableHead className="text-center">Con saldo</TableHead>
                  <TableHead className="text-center">Llegadas mañana</TableHead>
                  <TableHead>Estado</TableHead>
                  <TableHead></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(history as any[]).map((audit) => (
                  <TableRow key={audit.id} data-testid={`row-night-audit-${audit.id}`}>
                    <TableCell className="font-mono text-sm">{audit.auditDate}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {formatHotelDateTime(audit.executedAt)}
                      {audit.isManual && <Badge variant="outline" className="ml-1 text-[10px]">manual</Badge>}
                    </TableCell>
                    <TableCell className="text-sm">{audit.executedBy}</TableCell>
                    <TableCell className="text-center text-sm">{audit.reservationsProcessed}</TableCell>
                    <TableCell className="text-center text-sm">
                      {audit.reservationsSkipped > 0
                        ? <Badge className="text-[10px] bg-amber-100 text-amber-700">{audit.reservationsSkipped}</Badge>
                        : <span className="text-muted-foreground">0</span>}
                    </TableCell>
                    <TableCell className="text-center text-sm">
                      {audit.arrivalsNextDay}
                      {audit.arrivalsWithoutPrepago > 0 && (
                        <Badge className="ml-1 text-[10px] bg-amber-100 text-amber-700">{audit.arrivalsWithoutPrepago} sin prepago</Badge>
                      )}
                    </TableCell>
                    <TableCell>
                      <Badge className={`text-xs ${audit.status === "success" ? "bg-green-100 text-green-700" : audit.status === "partial" ? "bg-yellow-100 text-yellow-700" : "bg-red-100 text-red-700"}`}>
                        {NA_STATUS_LABEL[audit.status] ?? audit.status}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-7 px-2 text-xs"
                        onClick={() => setSelectedAudit(audit)}
                        data-testid={`button-view-audit-${audit.id}`}
                      >
                        <Eye className="h-3.5 w-3.5 mr-1" />
                        Ver
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <NightAuditDetailDialog
        audit={selectedAudit}
        open={!!selectedAudit}
        onClose={() => setSelectedAudit(null)}
      />
    </div>
  );
}

type MissingReservationPayment = {
  paymentId: string;
  paymentDate: string;
  paymentTimestamp: string;
  operator?: string | null;
  method: string;
  amount: string | number;
  reservationId: string;
  reservationCode: string;
  roomNumber?: string | null;
  candidateShifts: CashShift[];
  automaticShiftId?: string | null;
};

function MissingReservationPaymentsTab() {
  const { toast } = useToast();
  const [selectedShifts, setSelectedShifts] = useState<Record<string, string>>({});
  const { data: payments = [], isLoading } = useQuery<MissingReservationPayment[]>({
    queryKey: ["/api/cash/reservation-payments/missing-movements"],
    queryFn: async () => {
      const res = await fetch("/api/cash/reservation-payments/missing-movements", { credentials: "include" });
      if (!res.ok) throw new Error("Error al cargar cobros pendientes de recuperación");
      return res.json();
    },
  });
  const repairMutation = useMutation({
    mutationFn: async ({ paymentId, shiftId }: { paymentId: string; shiftId?: string }) => {
      const response = await apiRequest("POST", `/api/cash/reservation-payments/${paymentId}/repair-movement`, shiftId ? { shiftId } : {});
      return response.json();
    },
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ["/api/cash/reservation-payments/missing-movements"] });
      queryClient.invalidateQueries({ queryKey: ["/api/cash/movements"] });
      toast({
        title: result.alreadyRepaired ? "Cobro ya recuperado" : "Cobro recuperado",
        description: result.alreadyRepaired ? "Otro proceso ya había creado el movimiento." : "Se generó el movimiento y su recibo de Caja.",
      });
    },
    onError: (error: any) => toast({ title: "No se pudo recuperar", description: error.message, variant: "destructive" }),
  });
  const formatPaymentDate = (value: string) => {
    const [year, month, day] = value.slice(0, 10).split("-");
    return year && month && day ? `${day}/${month}/${year}` : value;
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <AlertTriangle className="h-5 w-5 text-amber-500" />
          Cobros de reservas sin movimiento de Caja
        </CardTitle>
        <p className="text-sm text-muted-foreground">
          Pagos activos excluyendo cuenta corriente y cargo a habitación. La recuperación conserva el turno histórico y emite un recibo auditable.
        </p>
      </CardHeader>
      <CardContent>
        {isLoading ? <Skeleton className="h-32 w-full" /> : payments.length === 0 ? (
          <div className="py-8 text-center text-sm text-muted-foreground">No hay cobros pendientes de recuperación.</div>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Fecha</TableHead>
                  <TableHead>Operador</TableHead>
                  <TableHead>Reserva</TableHead>
                  <TableHead>Hab.</TableHead>
                  <TableHead>Método</TableHead>
                  <TableHead className="text-right">Importe</TableHead>
                  <TableHead>Turno histórico</TableHead>
                  <TableHead className="text-right">Acción</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {payments.map((payment) => {
                  const candidates = Array.isArray(payment.candidateShifts) ? payment.candidateShifts : [];
                  const requiresSelection = !payment.automaticShiftId;
                  const selectedShift = selectedShifts[payment.paymentId];
                  return (
                    <TableRow key={payment.paymentId}>
                      <TableCell className="whitespace-nowrap">{formatPaymentDate(payment.paymentDate)}</TableCell>
                      <TableCell>{payment.operator || "—"}</TableCell>
                      <TableCell className="font-medium">{payment.reservationCode}</TableCell>
                      <TableCell>{payment.roomNumber || "—"}</TableCell>
                      <TableCell>{PAYMENT_METHOD_MAP[payment.method] || payment.method}</TableCell>
                      <TableCell className="text-right font-medium">{formatCurrency(Number(payment.amount))}</TableCell>
                      <TableCell className="min-w-[230px]">
                        {payment.automaticShiftId ? (
                          (() => {
                            const automaticShift = candidates.find((shift) => shift.id === payment.automaticShiftId);
                            return automaticShift ? (
                              <span className="text-sm">
                                {formatShiftLabel(automaticShift)} · {formatDateTime(automaticShift.openedAt)}
                              </span>
                            ) : (
                              <span className="text-sm text-destructive">Turno automático no disponible; recargá el informe</span>
                            );
                          })()
                        ) : candidates.length > 0 ? (
                          <Select value={selectedShift} onValueChange={(shiftId) => setSelectedShifts((old) => ({ ...old, [payment.paymentId]: shiftId }))}>
                            <SelectTrigger><SelectValue placeholder="Confirmar turno histórico" /></SelectTrigger>
                            <SelectContent>
                              {candidates.map((shift) => (
                                <SelectItem key={shift.id} value={shift.id}>
                                  {formatShiftLabel(shift)} · {formatDateTime(shift.openedAt)}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        ) : (
                          <span className="text-sm text-destructive">Sin turno histórico candidato</span>
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        <Button
                          size="sm"
                          disabled={repairMutation.isPending || (requiresSelection && !selectedShift)}
                          onClick={() => repairMutation.mutate({ paymentId: payment.paymentId, shiftId: requiresSelection ? selectedShift : undefined })}
                          data-testid={`button-repair-payment-${payment.paymentId}`}
                        >
                          <RefreshCw className="mr-1 h-3.5 w-3.5" />
                          Recuperar
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default function CashRegister() {
  const { user } = useAuth();
  const { data: configs, isLoading } = useQuery<CashConfig[]>({
    queryKey: ["/api/cash/configs"],
    queryFn: async () => {
      const res = await fetch("/api/cash/configs", { credentials: "include" });
      if (!res.ok) throw new Error("Error loading configs");
      return res.json();
    },
  });

  const allActiveConfigs = configs?.filter((c) => c.isActive) || [];

  // Roles with full global visibility (all areas + historial + resumen)
  const GLOBAL_ROLES = ["admin", "manager", "resp_administracion", "jefe_recepcion"];
  const isAdminOrManager = GLOBAL_ROLES.includes(user?.role ?? "");
  const canRepairReservationPayments = ["admin", "manager"].includes(user?.role ?? "");
  // Any authenticated user who reaches this page can at least see global tabs (historial/resumen/night-audit)
  const canSeeGlobalTabs = true;

  const [parteSeleccionado, setParteSeleccionado] = useState<string | null>(() =>
    sessionStorage.getItem("caja_parte_activo")
  );
  const [mostrarSelectorParte, setMostrarSelectorParte] = useState(false);
  const [currentTab, setCurrentTab] = useState<string | undefined>(undefined);
  // A per-entry cache key makes the very first active tab wait for a fresh
  // current-shift response instead of displaying a previous visit's shift.
  const [shiftRefreshToken, setShiftRefreshToken] = useState(() => Date.now());

  useEffect(() => {
    if (isAdminOrManager && !parteSeleccionado && !isLoading && allActiveConfigs.length > 0) {
      setMostrarSelectorParte(true);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isLoading]);

  function seleccionarParte(area: string) {
    setShiftRefreshToken((token) => token + 1);
    setParteSeleccionado(area);
    sessionStorage.setItem("caja_parte_activo", area);
    setMostrarSelectorParte(false);
    setCurrentTab(area);
  }

  function cambiarParte() {
    sessionStorage.removeItem("caja_parte_activo");
    setParteSeleccionado(null);
    setMostrarSelectorParte(true);
  }

  function handleTabChange(tab: string) {
    if (allActiveConfigs.some((config) => config.area === tab)) {
      setShiftRefreshToken((token) => token + 1);
    }
    setCurrentTab(tab);
  }

  // Admin/manager/global roles see all areas; others see their assigned department or role-matching area
  const visibleConfigs = isAdminOrManager
    ? allActiveConfigs
    : allActiveConfigs.filter((c) => c.area === user?.department || c.area === user?.role);

  if (isLoading) {
    return (
      <div className="flex flex-col gap-6 p-6">
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-96 w-full" />
      </div>
    );
  }

  const defaultTab = isAdminOrManager && parteSeleccionado
    ? parteSeleccionado
    : visibleConfigs.length > 0
    ? visibleConfigs[0].area
    : "historial";

  return (
    <div className="flex flex-col gap-6 p-6">
      <h1 className="text-3xl font-bold tracking-tight" data-testid="text-cash-register-title">
        Caja
      </h1>

      {/* Parte de caja activo — solo admin/gerencia */}
      {isAdminOrManager && !mostrarSelectorParte && (
        <div className="flex items-center gap-3 rounded-lg border px-4 py-2.5 bg-muted/40">
          {parteSeleccionado ? (
            <>
              <Building2 className="h-4 w-4 text-primary shrink-0" />
              <span className="text-sm">
                <span className="text-muted-foreground">Operando en:</span>{" "}
                <strong>{allActiveConfigs.find(c => c.area === parteSeleccionado)?.areaLabel || parteSeleccionado}</strong>
              </span>
              <Button variant="ghost" size="sm" className="ml-auto h-7 px-2 text-xs" onClick={cambiarParte} data-testid="btn-cambiar-parte">
                Cambiar parte
              </Button>
            </>
          ) : (
            <>
              <AlertTriangle className="h-4 w-4 text-amber-500 shrink-0" />
              <span className="text-sm text-muted-foreground">Modo solo consulta — sin parte de caja seleccionado</span>
              <Button variant="outline" size="sm" className="ml-auto h-7 text-xs" onClick={() => setMostrarSelectorParte(true)} data-testid="btn-seleccionar-parte">
                Seleccionar parte
              </Button>
            </>
          )}
        </div>
      )}

      {/* Selector de parte — modal bloqueante para admin/gerencia */}
      {isAdminOrManager && (
        <Dialog open={mostrarSelectorParte} onOpenChange={() => {}}>
          <DialogContent className="max-w-sm" onInteractOutside={e => e.preventDefault()}>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Building2 className="h-5 w-5" />
                ¿En qué parte de caja vas a operar?
              </DialogTitle>
              <DialogDescription>
                Seleccioná el área en la que trabajarás durante esta sesión. Todos los movimientos que registres quedarán en ese parte.
              </DialogDescription>
            </DialogHeader>
            <div className="grid gap-2 py-2">
              {allActiveConfigs.map(c => (
                <button
                  key={c.area}
                  onClick={() => seleccionarParte(c.area)}
                  data-testid={`btn-select-parte-${c.area}`}
                  className="w-full text-left flex items-center gap-3 px-4 py-3 rounded-lg border border-border hover:bg-muted hover:border-primary/50 transition-colors"
                >
                  <DollarSign className="h-5 w-5 text-primary shrink-0" />
                  <span className="font-medium text-sm">{c.areaLabel}</span>
                </button>
              ))}
            </div>
            <DialogFooter>
              <Button variant="ghost" size="sm" onClick={() => setMostrarSelectorParte(false)} data-testid="btn-skip-parte">
                Solo consultar (sin parte)
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}

      <Tabs value={currentTab ?? defaultTab} onValueChange={handleTabChange}>
          <TabsList data-testid="tabs-cash-areas">
            {visibleConfigs.map((c) => (
              <TabsTrigger key={c.area} value={c.area} data-testid={`tab-${c.area}`}>
                {c.areaLabel}
              </TabsTrigger>
            ))}
            <TabsTrigger value="historial" data-testid="tab-historial">
              Historial
            </TabsTrigger>
            <TabsTrigger value="resumen-dia" data-testid="tab-resumen-dia">
              <BarChart3 className="h-4 w-4 mr-1" />
              Resumen del Día
            </TabsTrigger>
            {isAdminOrManager && (
              <TabsTrigger value="night-audit" data-testid="tab-night-audit">
                <Moon className="h-4 w-4 mr-1" />
                Night Audit
              </TabsTrigger>
            )}
            {canRepairReservationPayments && (
              <TabsTrigger value="payment-recovery" data-testid="tab-payment-recovery">
                <RefreshCw className="h-4 w-4 mr-1" />
                Recuperar cobros
              </TabsTrigger>
            )}
          </TabsList>

          {visibleConfigs.length === 0 && !isAdminOrManager && (
            <div className="mt-4 flex items-center gap-3 rounded-lg border border-amber-200 bg-amber-50 dark:bg-amber-950/20 dark:border-amber-800 px-4 py-3">
              <AlertTriangle className="h-4 w-4 text-amber-600 shrink-0" />
              <p className="text-sm text-amber-800 dark:text-amber-300">
                Tu usuario <strong>({user?.role})</strong> no tiene un área de caja asignada. Podés consultar el historial, pero para operar en caja contactá al administrador.
              </p>
            </div>
          )}

          {visibleConfigs.map((c) => (
            <TabsContent key={c.area} value={c.area}>
              <AreaTab area={c.area} config={c} shiftRefreshToken={shiftRefreshToken} />
            </TabsContent>
          ))}

          <TabsContent value="historial">
            <HistorialTab />
          </TabsContent>

          <TabsContent value="resumen-dia">
            <ResumenDiaTab />
          </TabsContent>

          {isAdminOrManager && (
            <TabsContent value="night-audit">
              <NightAuditTab />
            </TabsContent>
          )}
          {canRepairReservationPayments && (
            <TabsContent value="payment-recovery">
              <MissingReservationPaymentsTab />
            </TabsContent>
          )}
        </Tabs>
    </div>
  );
}