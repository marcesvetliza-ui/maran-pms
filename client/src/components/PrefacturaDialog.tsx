           Si continuás, se emitirá el comprobante fiscal por el total de los cargos seleccionados
              y se registrará el pago parcial. El saldo restante quedará pendiente en el folio.
            </p>
            <p className="font-medium">¿Querés continuar igual?</p>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setShowPartialWarning(false)}>
              Volver a revisar
            </Button>
            <Button
              className="bg-amber-600 hover:bg-amber-700 text-white"
              onClick={() => { setShowPartialWarning(false); doSubmit(); }}
            >
              Sí, continuar con saldo pendiente
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Reversal confirmation dialog */}
      <RevertTransferDialog
        open={revertDialogOpen}
        onClose={() => setRevertDialogOpen(false)}
        reservationId={reservationId}
        charge={revertCharge}
        onSuccess={() => {
          queryClient.invalidateQueries({ queryKey: ["/api/reservations", String(reservationId), "folio"] });
          queryClient.invalidateQueries({ queryKey: ["/api/reservations", String(reservationId), "transfer-remaining"] });
          refetchFolio();
          refetchTransferRemaining();
        }}
      />

      {/* Nota de Crédito sub-dialog */}
      <NotaCreditoDialog
        open={ncDialogOpen}
        onClose={() => setNcDialogOpen(false)}
        reservationId={reservationId}
        invoices={emittedInvoices}
        onSuccess={() => {
          queryClient.invalidateQueries({ queryKey: ["/api/reservations", String(reservationId), "folio"] });
          queryClient.invalidateQueries({ queryKey: ["/api/reservations", String(reservationId), "invoices"] });
          queryClient.invalidateQueries({ queryKey: ["/api/billing/invoices"] });
          queryClient.invalidateQueries({ queryKey: ["/api/payments"] });
          refetchFolio();
          refetchEmittedInvoices();
        }}
      />

      {/* Nota de Débito sub-dialog */}
      <NotaDebitoDialog
        open={ndDialogOpen}
        onClose={() => setNdDialogOpen(false)}
        reservationId={reservationId}
        invoices={ndEligibleInvoices}
        onSuccess={() => {
          queryClient.invalidateQueries({ queryKey: ["/api/reservations", String(reservationId), "folio"] });
          queryClient.invalidateQueries({ queryKey: ["/api/reservations", String(reservationId), "invoices"] });
          queryClient.invalidateQueries({ queryKey: ["/api/billing/invoices"] });
          refetchFolio();
          refetchEmittedInvoices();
        }}
      />
    </Dialog>
  );
}

// ─── NotaCreditoDialog sub-component ─────────────────────────────────────────

interface NcInvoice {
  id: number;
  tipo_comprobante: string;
  punto_venta: number;
  numero: number;
  fecha_emision: string;
  cliente_razon_social: string;
  cliente_cuit: string | null;
  cliente_condicion_iva: string;
  monto_total: string;
  monto_acreditado: string | null;
  estado: string;
  items: any[] | null;
  cash_forma_pago?: string | null;
  source_charge_ids?: unknown;
  source_charge_amounts?: unknown;
  credit_source_charge_amounts?: unknown;
}

interface NcItemRow {
  key: string;
  sourceId: string;
  descripcion: string;
  subtotal: number;
  amount: string; // editable partial amount
  selected: boolean;
}

function NotaCreditoDialog({
  open, onClose, reservationId, invoices, onSuccess,
}: {
  open: boolean;
  onClose: () => void;
  reservationId: string | number;
  invoices: NcInvoice[];
  onSuccess: () => void;
}) {
  const { toast } = useToast();
  const [selectedInvoiceId, setSelectedInvoiceId] = useState<string>("");
  const [motivo, setMotivo] = useState("");
  const [ncItems, setNcItems] = useState<NcItemRow[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [emittedNc, setEmittedNc] = useState<any>(null);
  const [mappingWarning, setMappingWarning] = useState<string | null>(null);

  const selectedInvoice = invoices.find(inv => String(inv.id) === selectedInvoiceId) ?? null;

  // Reset when dialog opens
  useEffect(() => {
    if (open) {
      setSelectedInvoiceId(invoices.length === 1 ? String(invoices[0].id) : "");
      setMotivo("");
      setNcItems([]);
      setEmittedNc(null);
      setMappingWarning(null);
    }
  }, [open]);

  // Build item rows when invoice changes
  useEffect(() => {
    if (!selectedInvoice) { setNcItems([]); setMappingWarning(null); return; }
    const montoTotal = parseFloat(selectedInvoice.monto_total);
    const montoAcreditado = parseFloat(selectedInvoice.monto_acreditado || "0");
    const rawItems = parseJsonValue(selectedInvoice.items);
    const sourceAmounts = parseJsonValue(selectedInvoice.source_charge_amounts);
    const sourceIds = getSourceIds(selectedInvoice);
    const creditMaps = parseJsonValue(selectedInvoice.credit_source_charge_amounts);

    if (!Array.isArray(rawItems) || !sourceAmounts || typeof sourceAmounts !== "object" ||
      Array.isArray(sourceAmounts) || Object.keys(sourceAmounts).length === 0) {
      setNcItems([]);
      setMappingWarning("Esta factura no tiene una relación segura entre sus conceptos y los cargos del Folio. No se puede emitir una NC automática.");
      return;
    }

    const previouslyCredited: Record<string, number> = {};
    if (!Array.isArray(creditMaps) && montoAcreditado > 0.009) {
      setNcItems([]);
      setMappingWarning("La factura tiene una Nota de Crédito anterior sin detalle por cargo. Revisá el vínculo original antes de continuar.");
      return;
    }
    for (const map of Array.isArray(creditMaps) ? creditMaps : []) {
      if (!map || typeof map !== "object" || Array.isArray(map)) {
        setNcItems([]);
        setMappingWarning("La factura tiene una Nota de Crédito anterior sin detalle por cargo. Revisá el vínculo original antes de continuar.");
        return;
      }
      for (const [sourceId, amount] of Object.entries(map as Record<string, unknown>)) {
        previouslyCredited[sourceId] = (previouslyCredited[sourceId] || 0) + (parseFloat(String(amount)) || 0);
      }
    }
    const totalMappedCredits = Object.values(previouslyCredited).reduce((total, amount) => total + amount, 0);
    if (Math.abs(totalMappedCredits - montoAcreditado) > 0.02) {
      setNcItems([]);
      setMappingWarning("El detalle de las NC anteriores no coincide con el total acreditado de esta factura. No se aplicará un ajuste automático.");
      return;
    }

    const rows: NcItemRow[] = [];
    for (const [sourceId, originalValue] of Object.entries(sourceAmounts as Record<string, unknown>)) {
      const index = sourceIds.indexOf(sourceId);
      const originalItem = (index >= 0 ? rawItems[index] : sourceIds.length === 1 ? rawItems[0] : null) as any;
      if (!originalItem) {
        setNcItems([]);
        setMappingWarning("No se pudo conservar el concepto fiscal original para uno de los cargos facturados.");
        return;
      }
      const available = Math.max(0, (parseFloat(String(originalValue)) || 0) - (previouslyCredited[sourceId] || 0));
      if (available > 0.009) {
        rows.push({
          key: sourceId,
          sourceId,
          descripcion: originalItem.descripcion || `Cargo ${sourceId}`,
          subtotal: available,
          amount: available.toFixed(2),
          selected: true,
        });
      }
    }
    setMappingWarning(rows.length === 0 ? "La factura ya no tiene conceptos disponibles para acreditar." : null);
    setNcItems(rows);
  }, [selectedInvoiceId, selectedInvoice, invoices]);

  function toggleItem(key: string) {
    setNcItems(prev => prev.map(it => it.key === key ? { ...it, selected: !it.selected } : it));
  }

  function updateAmount(key: string, val: string) {
    setNcItems(prev => prev.map(it => it.key === key ? { ...it, amount: val } : it));
  }

  const totalNc = ncItems
    .filter(it => it.selected)
    .reduce((acc, it) => acc + (parseFloat(it.amount) || 0), 0);

  const saldoPendienteInvoice = selectedInvoice
    ? parseFloat(selectedInvoice.monto_total) - parseFloat(selectedInvoice.monto_acreditado || "0")
    : 0;

  async function handleSubmit() {
    if (!selectedInvoice) {
      toast({ title: "Seleccioná una factura", variant: "destructive" }); return;
    }
    if (totalNc <= 0) {
      toast({ title: "El monto de la NC debe ser mayor a $0", variant: "destructive" }); return;
    }
    if (totalNc > saldoPendienteInvoice + 0.01) {
      toast({ title: `El monto ($${fmtMoney(totalNc)}) supera el saldo pendiente de la factura ($${fmtMoney(saldoPendienteInvoice)})`, variant: "destructive" }); return;
    }
    if (!motivo.trim()) {
      toast({ title: "Ingresá un motivo para la Nota de Crédito", variant: "destructive" }); return;
    }
    if (mappingWarning) {
      toast({ title: mappingWarning, variant: "destructive" }); return;
    }
    if (ncItems.some(item => item.selected && ((parseFloat(item.amount) || 0) > item.subtotal + 0.01))) {
      toast({ title: "Un importe supera el saldo disponible de su concepto", variant: "destructive" }); return;
    }

    setIsSubmitting(true);
    try {
      const res = await apiRequest("POST", `/api/billing/invoices/${selectedInvoice.id}/nota-credito`, {
        motivo: motivo.trim(),
        monto: totalNc,
        items: ncItems
          .filter(item => item.selected && (parseFloat(item.amount) || 0) > 0)
          .map(item => ({ sourceId: item.sourceId, amount: parseFloat(item.amount) })),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body?.error || body?.message || "Error al emitir NC");

      setEmittedNc(body);
      const ncLabel = `${body.tipoComprobante ?? body.tipo_comprobante} ${String(body.puntoVenta ?? body.punto_venta ?? 0).padStart(4,"0")}-${String(body.numero ?? 0).padStart(8,"0")}`;
      toast({
        title: `NC emitida: ${ncLabel}`,
        description: "Los pagos se conservaron; el ajuste se registró en el Folio.",
      });
      onSuccess();

      // Auto-open PDF
      setTimeout(() => window.open(`/api/billing/invoices/${body.id}/pdf`, "_blank"), 300);
    } catch (err: any) {
      toast({ title: parseApiError(err), variant: "destructive" });
    } finally {
      setIsSubmitting(false);
    }
  }

  if (emittedNc) {
    return (
      <Dialog open={open} onOpenChange={o => { if (!o) onClose(); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <CircleCheck className="h-5 w-5 text-green-600" />
              Nota de Crédito emitida
            </DialogTitle>
          </DialogHeader>
          <Card className="border-green-300 bg-green-50 dark:border-green-800 dark:bg-green-900/10">
            <CardContent className="p-4 space-y-1 text-sm">
              <div className="font-bold text-green-700 dark:text-green-400">
                {emittedNc.tipoComprobante ?? emittedNc.tipo_comprobante}{" "}
                {String(emittedNc.puntoVenta ?? emittedNc.punto_venta ?? 0).padStart(4,"0")}-{String(emittedNc.numero ?? 0).padStart(8,"0")}
              </div>
              <div className="text-muted-foreground">Monto: <span className="font-medium text-foreground">${fmtMoney(emittedNc.montoTotal ?? emittedNc.monto_total)}</span></div>
              {emittedNc.cae && <div className="text-muted-foreground">CAE: <span className="font-mono text-xs">{emittedNc.cae}</span></div>}
            </CardContent>
          </Card>
          <DialogFooter className="gap-2">
            <Button
              variant="outline" size="sm"
              onClick={() => window.open(`/api/billing/invoices/${emittedNc.id}/pdf`, "_blank")}
            >
              <Printer className="h-4 w-4 mr-1" />Ver PDF
            </Button>
            <Button onClick={onClose}>Cerrar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Dialog open={open} onOpenChange={o => { if (!o && !isSubmitting) onClose(); }}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <MinusCircle className="h-5 w-5 text-amber-600" />
            Emitir Nota de Crédito
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-1">
          {/* Invoice selector */}
          {/* Bug N: always show invoice selector — ensures user knows which invoice is being credited */}
          {invoices.length > 1 && (
            <div>
              <Label className="text-xs text-muted-foreground mb-1 block">Factura a acreditar</Label>
              <Select value={selectedInvoiceId} onValueChange={setSelectedInvoiceId}>
                <SelectTrigger>
                  <SelectValue placeholder="Seleccionar factura..." />
                </SelectTrigger>
                <SelectContent>
                  {invoices.map(inv => {
                    const saldo = parseFloat(inv.monto_total) - parseFloat(inv.monto_acreditado || "0");
                    return (
                      <SelectItem key={inv.id} value={String(inv.id)}>
                        {inv.tipo_comprobante} {String(inv.punto_venta).padStart(4,"0")}-{String(inv.numero).padStart(8,"0")} — ${fmtMoney(saldo)} pendiente
                      </SelectItem>
                    );
                  })}
                </SelectContent>
              </Select>
            </div>
          )}

          {/* Invoice summary */}
          {selectedInvoice && (
            <div className="rounded-lg border bg-muted/30 px-4 py-3 text-sm space-y-1">
              <div className="font-medium">
                {selectedInvoice.tipo_comprobante}{" "}
                {String(selectedInvoice.punto_venta).padStart(4,"0")}-{String(selectedInvoice.numero).padStart(8,"0")}
                {" · "}{formatDateAR(selectedInvoice.fecha_emision)}
              </div>
              <div className="text-muted-foreground">
                <span>Cliente: </span><span className="text-foreground">{selectedInvoice.cliente_razon_social}</span>
                {selectedInvoice.cliente_cuit && <span className="ml-2 text-xs">CUIT {selectedInvoice.cliente_cuit}</span>}
              </div>
              <div className="text-muted-foreground flex gap-4">
                <span>Total: <span className="text-foreground font-medium">${fmtMoney(selectedInvoice.monto_total)}</span></span>
                {parseFloat(selectedInvoice.monto_acreditado || "0") > 0 && (
                  <span>Ya acreditado: <span className="text-amber-700 font-medium">${fmtMoney(selectedInvoice.monto_acreditado || "0")}</span></span>
                )}
                <span>Saldo disponible: <span className="font-bold text-green-700 dark:text-green-400">${fmtMoney(saldoPendienteInvoice)}</span></span>
              </div>
               <div className="pt-1 text-xs text-muted-foreground flex flex-wrap gap-x-4 gap-y-1">
                 <span>Receptor, tipo de comprobante y punto de venta: <strong className="text-foreground">se conservan de la factura original</strong></span>
                 <span>Forma de cobro: <strong className="text-foreground">{selectedInvoice.cash_forma_pago ? (PAYMENT_METHOD_LABELS[selectedInvoice.cash_forma_pago] || selectedInvoice.cash_forma_pago) : "No informada"}</strong></span>
               </div>
            </div>
          )}

          {mappingWarning && (
            <div className="flex items-start gap-2 rounded-lg border border-amber-300 bg-amber-50 dark:border-amber-700 dark:bg-amber-950/30 px-3 py-2">
              <AlertTriangle className="h-4 w-4 text-amber-600 mt-0.5 shrink-0" />
              <p className="text-sm text-amber-800 dark:text-amber-300">{mappingWarning}</p>
            </div>
          )}

          {/* Items table */}
          {ncItems.length > 0 && (
            <div className="rounded-md border overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/50">
                    <TableHead className="w-8"></TableHead>
                    <TableHead>Descripción</TableHead>
                    <TableHead className="w-32 text-right">Disponible</TableHead>
                    <TableHead className="w-36 text-right">Monto NC</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {ncItems.map(item => (
                    <TableRow key={item.key} className={!item.selected ? "opacity-40" : undefined}>
                      <TableCell>
                        <Checkbox checked={item.selected} onCheckedChange={() => toggleItem(item.key)} />
                      </TableCell>
                      <TableCell className="text-sm">{item.descripcion}</TableCell>
                      <TableCell className="text-right text-sm text-muted-foreground">${fmtMoney(item.subtotal)}</TableCell>
                      <TableCell className="text-right">
                        {item.selected ? (
                          <Input
                            type="number"
                            step="0.01"
                            min="0.01"
                            max={item.subtotal}
                            value={item.amount}
                            onChange={e => updateAmount(item.key, e.target.value)}
                            className="h-7 text-sm w-28 text-right ml-auto"
                          />
                        ) : (
                          <span className="text-sm text-muted-foreground">—</span>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              <div className="border-t bg-muted/30 px-4 py-2 flex justify-end text-sm gap-2">
                <span className="text-muted-foreground">Total NC:</span>
                <span className="font-bold">${fmtMoney(totalNc)}</span>
              </div>
            </div>
          )}

          {selectedInvoice && (
            <div className="rounded-lg border border-blue-200 bg-blue-50 dark:border-blue-800 dark:bg-blue-950/20 px-3 py-2 text-xs text-blue-800 dark:text-blue-300">
              Esta operación acredita la factura y ajusta el cargo asociado. Los pagos registrados se conservan; una devolución o anulación de cobro se gestiona por separado.
            </div>
          )}

          {/* Motivo */}
          {selectedInvoice && (
            <div>
              <Label className="text-xs text-muted-foreground mb-1 block">Motivo <span className="text-red-500">*</span></Label>
              <Input
                value={motivo}
                onChange={e => setMotivo(e.target.value)}
                placeholder="Ej: Error en facturación, devolución de servicio..."
                className="text-sm"
              />
            </div>
          )}

          {!selectedInvoice && invoices.length === 0 && (
            <p className="text-sm text-muted-foreground text-center py-4">No hay facturas emitidas para esta reserva.</p>
          )}

          {!selectedInvoice && invoices.length > 0 && (
            <p className="text-sm text-muted-foreground text-center py-4">Seleccioná una factura para continuar.</p>
          )}
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={onClose} disabled={isSubmitting}>Cancelar</Button>
          <Button
            onClick={handleSubmit}
            disabled={isSubmitting || !selectedInvoice || !!mappingWarning || totalNc <= 0 || !motivo.trim()}
            className="bg-amber-600 hover:bg-amber-700 text-white"
          >
            {isSubmitting ? (
              <><Loader2 className="h-4 w-4 animate-spin mr-1" />Emitiendo...</>
            ) : (
              <><MinusCircle className="h-4 w-4 mr-1" />Emitir NC por ${fmtMoney(totalNc)}</>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── NotaDebitoDialog sub-component ──────────────────────────────────────────

function NotaDebitoDialog({
  open, onClose, reservationId, invoices, onSuccess,
}: {
  open: boolean;
  onClose: () => void;
  reservationId: string | number;
  invoices: NcInvoice[];
  onSuccess: () => void;
}) {
  const { toast } = useToast();
  const [selectedInvoiceId, setSelectedInvoiceId] = useState<string>("");
  const [motivo, setMotivo] = useState("");
  const [monto, setMonto] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [emittedNd, setEmittedNd] = useState<any>(null);

  const selectedInvoice = invoices.find(inv => String(inv.id) === selectedInvoiceId) ?? null;

  // Reset when dialog opens
  useEffect(() => {
    if (open) {
      setSelectedInvoiceId(invoices.length === 1 ? String(invoices[0].id) : "");
      setMotivo("");
      setMonto("");
      setEmittedNd(null);
    }
  }, [open]);

  const montoNum = parseFloat(monto) || 0;

  async function handleSubmit() {
    if (!selectedInvoice) {
      toast({ title: "Seleccioná una factura de referencia", variant: "destructive" }); return;
    }
    if (montoNum <= 0) {
      toast({ title: "El monto debe ser mayor a $0", variant: "destructive" }); return;
    }
    if (!motivo.trim()) {
      toast({ title: "Ingresá un motivo para la Nota de Débito", variant: "destructive" }); return;
    }

    setIsSubmitting(true);
    try {
      const res = await apiRequest("POST", `/api/billing/invoices/${selectedInvoice.id}/nota-debito`, {
        motivo: motivo.trim(),
        monto: montoNum,
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body?.error || body?.message || "Error al emitir ND");

      setEmittedNd(body);
      toast({ title: `ND emitida: ${body.tipoComprobante ?? body.tipo_comprobante} ${String(body.puntoVenta ?? body.punto_venta ?? 0).padStart(4,"0")}-${String(body.numero ?? 0).padStart(8,"0")}` });
      onSuccess();

      // Auto-open PDF
      setTimeout(() => window.open(`/api/billing/invoices/${body.id}/pdf`, "_blank"), 300);
    } catch (err: any) {
      toast({ title: parseApiError(err), variant: "destructive" });
    } finally {
      setIsSubmitting(false);
    }
  }

  if (emittedNd) {
    return (
      <Dialog open={open} onOpenChange={o => { if (!o) onClose(); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <CircleCheck className="h-5 w-5 text-blue-600" />
              Nota de Débito emitida
            </DialogTitle>
          </DialogHeader>
          <Card className="border-blue-300 bg-blue-50 dark:border-blue-800 dark:bg-blue-900/10">
            <CardContent className="p-4 space-y-1 text-sm">
              <div className="font-bold text-blue-700 dark:text-blue-400">
                {emittedNd.tipoComprobante ?? emittedNd.tipo_comprobante}{" "}
                {String(emittedNd.puntoVenta ?? emittedNd.punto_venta ?? 0).padStart(4,"0")}-{String(emittedNd.numero ?? 0).padStart(8,"0")}
              </div>
              <div className="text-muted-foreground">Monto: <span className="font-medium text-foreground">${fmtMoney(emittedNd.montoTotal ?? emittedNd.monto_total)}</span></div>
              {emittedNd.cae && <div className="text-muted-foreground">CAE: <span className="font-mono text-xs">{emittedNd.cae}</span></div>}
            </CardContent>
          </Card>
          <DialogFooter className="gap-2">
            <Button
              variant="outline" size="sm"
              onClick={() => window.open(`/api/billing/invoices/${emittedNd.id}/pdf`, "_blank")}
            >
              <Printer className="h-4 w-4 mr-1" />Ver PDF
            </Button>
            <Button onClick={onClose}>Cerrar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Dialog open={open} onOpenChange={o => { if (!o && !isSubmitting) onClose(); }}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <PlusCircle className="h-5 w-5 text-blue-600" />
            Emitir Nota de Débito
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-1">
          <div className="rounded-lg border border-blue-200 bg-blue-50 dark:border-blue-800 dark:bg-blue-950/20 px-4 py-3 text-sm text-blue-800 dark:text-blue-300">
            La Nota de Débito se emite cuando se facturó un monto menor al que correspondía. Se emite una ND por la diferencia.
          </div>

          {/* Invoice selector */}
          {invoices.length > 1 ? (
            <div>
              <Label className="text-xs text-muted-foreground mb-1 block">Factura de referencia</Label>
              <Select value={selectedInvoiceId} onValueChange={setSelectedInvoiceId}>
                <SelectTrigger>
                  <SelectValue placeholder="Seleccionar factura..." />
                </SelectTrigger>
                <SelectContent>
                  {invoices.map(inv => (
                    <SelectItem key={inv.id} value={String(inv.id)}>
                      {inv.tipo_comprobante} {String(inv.punto_venta).padStart(4,"0")}-{String(inv.numero).padStart(8,"0")} — ${fmtMoney(inv.monto_total)} · {inv.cliente_razon_social}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          ) : invoices.length === 1 && !selectedInvoiceId ? (
            // auto-select handled by useEffect; show nothing extra
            null
          ) : null}

          {/* Invoice summary */}
          {selectedInvoice && (
            <div className="rounded-lg border bg-muted/30 px-4 py-3 text-sm space-y-1">
              <div className="font-medium">
                {selectedInvoice.tipo_comprobante}{" "}
                {String(selectedInvoice.punto_venta).padStart(4,"0")}-{String(selectedInvoice.numero).padStart(8,"0")}
                {" · "}{formatDateAR(selectedInvoice.fecha_emision)}
              </div>
              <div className="text-muted-foreground">
                <span>Cliente: </span><span className="text-foreground">{selectedInvoice.cliente_razon_social}</span>
                {selectedInvoice.cliente_cuit && <span className="ml-2 text-xs">CUIT {selectedInvoice.cliente_cuit}</span>}
              </div>
              <div className="text-muted-foreground">
                Total facturado: <span className="text-foreground font-medium">${fmtMoney(selectedInvoice.monto_total)}</span>
              </div>
              <div className="text-xs text-muted-foreground mt-1">
                La ND se emitirá como <strong>{{
                  FA: "NDA (Nota de Débito A)",
                  FT: "NDT (Nota de Débito T)",
                  FM: "NDM (Nota de Débito MiPyme A)",
                  FC: "NDC (Nota de Débito C)",
                }[selectedInvoice.tipo_comprobante] ?? "NDB (Nota de Débito B)"}</strong>
              </div>
            </div>
          )}

          {/* Motivo */}
          {selectedInvoice && (
            <>
              <div>
                <Label className="text-xs text-muted-foreground mb-1 block">Motivo / Descripción <span className="text-red-500">*</span></Label>
                <Input
                  value={motivo}
                  onChange={e => setMotivo(e.target.value)}
                  placeholder="Ej: Diferencia de tarifa no facturada, cargo adicional..."
                  className="text-sm"
                />
              </div>

              <div>
                <Label className="text-xs text-muted-foreground mb-1 block">Monto adicional a cobrar <span className="text-red-500">*</span></Label>
                <Input
                  type="number"
                  step="0.01"
                  min="0.01"
                  value={monto}
                  onChange={e => setMonto(e.target.value)}
                  placeholder="0.00"
                  className="text-sm"
                />
                {montoNum > 0 && (
                  <p className="text-xs text-muted-foreground mt-1">
                    Se emitirá una ND por <strong>${fmtMoney(montoNum)}</strong> adicionales.
                  </p>
                )}
              </div>
            </>
          )}

          {invoices.length === 0 && (
            <p className="text-sm text-muted-foreground text-center py-4">No hay facturas emitidas para esta reserva.</p>
          )}

          {invoices.length > 1 && !selectedInvoice && (
            <p className="text-sm text-muted-foreground text-center py-4">Seleccioná una factura para continuar.</p>
          )}
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={onClose} disabled={isSubmitting}>Cancelar</Button>
          <Button
            onClick={handleSubmit}
            disabled={isSubmitting || !selectedInvoice || montoNum <= 0 || !motivo.trim()}
            className="bg-blue-600 hover:bg-blue-700 text-white"
          >
            {isSubmitting ? (
              <><Loader2 className="h-4 w-4 animate-spin mr-1" />Emitiendo...</>
            ) : (
              <><PlusCircle className="h-4 w-4 mr-1" />Emitir ND por ${fmtMoney(montoNum)}</>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── ChargeRow sub-component ──────────────────────────────────────────────────

function ChargeRow({
  id, amount, description, date, alreadyPaid, selected, onToggle,
  editing, editingValue, onStartEdit, onEditChange, onSaveEdit, onCancelEdit,
  onTransfer, onRevert, alreadyReversed, alreadyInvoiced, category,
}: {
  id: string; amount: number; description: string; date?: string; alreadyPaid: number;
  selected: boolean; onToggle: () => void;
  editing: boolean; editingValue: string;
  onStartEdit: () => void; onEditChange: (v: string) => void;
  onSaveEdit: () => void; onCancelEdit: () => void;
  onTransfer?: () => void;
  onRevert?: () => void;
  alreadyReversed?: boolean;
  alreadyInvoiced?: boolean;
  category?: string;
}) {
  const pending = Math.max(0, amount - alreadyPaid);
  const isTransferOut = category === "transfer_out";
  const isTransferIn = category === "transfer_in";
  const isTransfer = isTransferOut || isTransferIn;
  // A reversal counter-entry should not itself show a Revertir button
  const isReversal = isTransfer && description.includes("[rev:");

  // Strip machine-readable tags from visible description
  const cleanDescription = description
    .replace(/\s*\[xfer:[^\]]+\]/g, "")
    .replace(/\s*\[corr:[^\]]+\]/g, "")
    .replace(/\s*\[rev:[^\]]+\]/g, "")
    .replace(/\s*\[res:[^\]]+\]/g, "")
    .trim();

  // Parse paired reservation ID for transfer entries (embedded as [res:ID])
  const pairedResMatch = isTransfer ? description.match(/\[res:([^\]]+)\]/) : null;
  const pairedResId = pairedResMatch ? pairedResMatch[1] : null;

  // Render transfer description with the room number portion as a clickable link
  function renderTransferDescription() {
    if (!pairedResId) return <span className="text-sm">{cleanDescription}</span>;
    // Match "Hab.XXX" in the clean description and wrap it in a link
    const roomMatch = cleanDescription.match(/(.*?)(Hab\.\S+)(.*)/);
    if (!roomMatch) return <span className="text-sm">{cleanDescription}</span>;
    const [, before, roomPart, after] = roomMatch;
    return (
      <span className="text-sm">
        {before}
        <a
          href={`/reservations?view=${pairedResId}`}
          onClick={e => e.stopPropagation()}
          className="inline-flex items-center gap-0.5 font-semibold underline underline-offset-2 hover:opacity-80 transition-opacity"
          style={{ color: isTransferOut ? "#c2410c" : "#1d4ed8" }}
          title="Ver folio de la reserva relacionada"
          target="_blank"
          rel="noreferrer"
        >
          {roomPart}
        </a>
        {after}
      </span>
    );
  }

  const rowCls = isTransfer
    ? (isTransferOut
        ? "bg-orange-50/60 dark:bg-orange-950/20 opacity-80"
        : "bg-blue-50/60 dark:bg-blue-950/20 opacity-80")
    : (!selected ? "opacity-40" : undefined);

  return (
    <TableRow className={`${rowCls ?? ""} ${alreadyReversed || alreadyInvoiced ? "opacity-40" : ""}`}>
      <TableCell className="w-8">
        {isTransfer ? (
          <ArrowRightLeft className={`h-3.5 w-3.5 mx-auto ${isTransferOut ? "text-orange-500" : "text-blue-500"}`} />
        ) : (
          <Checkbox checked={selected} onCheckedChange={alreadyInvoiced ? undefined : onToggle} disabled={alreadyInvoiced} />
        )}
      </TableCell>
      <TableCell>
        {editing && !isTransfer ? (
          <div className="flex items-center gap-1">
            <Input
              value={editingValue}
              onChange={e => onEditChange(e.target.value)}
              className="h-7 text-sm flex-1"
              autoFocus
              onKeyDown={e => { if (e.key === "Enter") onSaveEdit(); if (e.key === "Escape") onCancelEdit(); }}
            />
            <Button size="icon" variant="ghost" className="h-7 w-7" onClick={onSaveEdit}><Check className="h-3.5 w-3.5 text-green-600" /></Button>
            <Button size="icon" variant="ghost" className="h-7 w-7" onClick={onCancelEdit}><X className="h-3.5 w-3.5 text-muted-foreground" /></Button>
          </div>
        ) : (
          <div className="flex items-center gap-2 group">
            {isTransfer && (
              <Badge variant="outline" className={`text-[10px] px-1 py-0 shrink-0 ${isTransferOut ? "border-orange-400 text-orange-700 dark:text-orange-400" : "border-blue-400 text-blue-700 dark:text-blue-400"}`}>
                {isReversal ? "Reversa" : (isTransferOut ? "Transferencia salida" : "Transferencia entrada")}
              </Badge>
            )}
            {alreadyReversed && (
              <Badge variant="outline" className="text-[10px] px-1 py-0 shrink-0 border-gray-400 text-gray-500 dark:text-gray-400">
                Revertida
              </Badge>
            )}
            {alreadyInvoiced && (
              <Badge variant="outline" className="text-[10px] px-1 py-0 shrink-0 border-green-500 text-green-700 dark:text-green-400">
                Ya facturado
              </Badge>
            )}
            {isTransfer ? renderTransferDescription() : <span className="text-sm">{cleanDescription}</span>}
            {date && <span className="text-xs text-muted-foreground">{formatDateAR(date)}</span>}
            {!isTransfer && (
              <Button
                size="icon" variant="ghost"
                className="h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity shrink-0"
                onClick={onStartEdit}
              >
                <Edit2 className="h-3 w-3 text-muted-foreground" />
              </Button>
            )}
          </div>
        )}
      </TableCell>
      <TableCell className={`text-right text-sm ${isTransferOut ? "text-orange-700 dark:text-orange-400" : isTransferIn ? "text-blue-700 dark:text-blue-400" : ""}`}>
        ${fmtMoney(amount)}
      </TableCell>
      <TableCell className="text-right text-sm text-green-700 dark:text-green-400">
        {alreadyPaid > 0 ? `$${fmtMoney(alreadyPaid)}` : "—"}
      </TableCell>
      <TableCell className="text-right text-sm font-medium">
        {isTransfer ? "—" : `$${fmtMoney(pending)}`}
      </TableCell>
      <TableCell className="w-10 text-right">
        {!isTransfer && onTransfer ? (
          <Button
            size="icon" variant="ghost"
            className="h-7 w-7 text-muted-foreground hover:text-blue-600 shrink-0"
            title="Transferir a otra habitación"
            onClick={e => { e.stopPropagation(); onTransfer(); }}
          >
            <ArrowRightLeft className="h-3.5 w-3.5" />
          </Button>
        ) : isTransfer && !isReversal && !alreadyReversed && onRevert ? (
          <Button
            size="icon" variant="ghost"
            className="h-7 w-7 text-muted-foreground hover:text-red-600 shrink-0"
            title="Revertir transferencia"
            onClick={e => { e.stopPropagation(); onRevert(); }}
          >
            <RotateCcw className="h-3.5 w-3.5" />
          </Button>
        ) : null}
      </TableCell>
    </TableRow>
  );
}

// ─── RevertTransferDialog sub-component ──────────────────────────────────────

export function RevertTransferDialog({
  open, onClose, reservationId, charge, onSuccess,
}: {
  open: boolean;
  onClose: () => void;
  reservationId: string | number;
  charge: { id: string; description: string; amount: number; category: string } | null;
  onSuccess: () => void;
}) {
  const { toast } = useToast();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [partialResult, setPartialResult] = useState<{ otherRoom: string | null } | null>(null);

  // Reset on open
  useEffect(() => {
    if (open) setPartialResult(null);
  }, [open]);

  if (!charge) return null;

  const isOut = charge.category === "transfer_out";
  const cleanDesc = charge.description
    .replace(/\s*\[xfer:[^\]]+\]/g, "")
    .replace(/\s*\[corr:[^\]]+\]/g, "")
    .replace(/\s*\[rev:[^\]]+\]/g, "")
    .trim();

  async function handleRevert() {
    setIsSubmitting(true);
    try {
      const res = await apiRequest("POST", `/api/reservations/${reservationId}/reverse-transfer-charge`, {
        chargeId: charge!.id,
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body?.error || "Error al revertir");

      if (!body.pairedReversed) {
        // Partial reversal — stay open to show the warning
        setPartialResult({ otherRoom: body.otherRoom ?? null });
        onSuccess();
      } else {
        toast({ title: body.message || "Transferencia revertida en ambos folios" });
        onSuccess();
        onClose();
      }
    } catch (err: any) {
      toast({ title: parseApiError(err), variant: "destructive" });
    } finally {
      setIsSubmitting(false);
    }
  }

  // Partial-reversal result view
  if (partialResult !== null) {
    return (
      <Dialog open={open} onOpenChange={o => { if (!o) onClose(); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertCircle className="h-5 w-5 text-amber-600" />
              Reversión parcial
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-1">
            <div className="flex items-start gap-3 rounded-lg border border-green-300 bg-green-50 dark:border-green-700 dark:bg-green-950/40 px-4 py-3">
              <CircleCheck className="h-4 w-4 text-green-600 mt-0.5 shrink-0" />
              <p className="text-sm text-green-800 dark:text-green-300">
                El cargo en <strong>este folio</strong> fue revertido correctamente.
              </p>
            </div>
            <div className="flex items-start gap-3 rounded-lg border border-amber-300 bg-amber-50 dark:border-amber-700 dark:bg-amber-950/40 px-4 py-3">
              <AlertCircle className="h-4 w-4 text-amber-600 mt-0.5 shrink-0" />
              <p className="text-sm text-amber-800 dark:text-amber-300">
                No se encontró el cargo correspondiente en el folio{partialResult.otherRoom ? ` de Hab. ${partialResult.otherRoom}` : " destino/origen"}.
                Revisá ese folio manualmente para completar la reversión.
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button onClick={onClose}>Entendido</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Dialog open={open} onOpenChange={o => { if (!o && !isSubmitting) onClose(); }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <RotateCcw className="h-5 w-5 text-red-600" />
            Revertir transferencia
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-1">
          <div className="flex items-start gap-3 rounded-lg border border-amber-300 bg-amber-50 dark:border-amber-700 dark:bg-amber-950/40 px-4 py-3">
            <AlertCircle className="h-4 w-4 text-amber-600 mt-0.5 shrink-0" />
            <p className="text-sm text-amber-800 dark:text-amber-300">
              Esto creará un cargo compensatorio para cancelar esta transferencia. La operación afectará ambos folios.
            </p>
          </div>

          <div className="rounded-lg border bg-muted/30 px-4 py-3 text-sm space-y-2">
            <div>
              <span className="text-muted-foreground">Cargo a revertir: </span>
              <span className="font-medium">{cleanDesc}</span>
            </div>
            <div>
              <span className="text-muted-foreground">Monto: </span>
              <span className="font-semibold">${fmtMoney(charge.amount)}</span>
            </div>
            <div>
              <span className="text-muted-foreground">Tipo: </span>
              <span className={isOut ? "text-orange-700 dark:text-orange-400" : "text-blue-700 dark:text-blue-400"}>
                {isOut ? "Transferencia salida (cargo negativo en este folio)" : "Transferencia entrada (cargo positivo en este folio)"}
              </span>
            </div>
          </div>

          <p className="text-sm text-muted-foreground">
            Se creará un contra-cargo de <strong>${fmtMoney(charge.amount)}</strong> en este folio para neutralizar la transferencia, y se buscará el cargo correspondiente en el folio {isOut ? "destino" : "origen"} para revertirlo también.
          </p>
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={onClose} disabled={isSubmitting}>Cancelar</Button>
          <Button
            onClick={handleRevert}
            disabled={isSubmitting}
            className="bg-red-600 hover:bg-red-700 text-white"
          >
            {isSubmitting ? (
              <><Loader2 className="h-4 w-4 animate-spin mr-1" />Revirtiendo...</>
            ) : (
              <><RotateCcw className="h-4 w-4 mr-1" />Revertir transferencia</>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── BulkTransferDialog sub-component ────────────────────────────────────────

function BulkTransferDialog({
  open, onClose, reservationId, folio, transferRemaining, selectedChargeIds: initialSelectedChargeIds,
  includeAccommodation: initialIncludeAccommodation, onSuccess,
}: {
  open: boolean;
  onClose: () => void;
  reservationId: string | number;
  folio: PrefacturaFolioData | null;
  transferRemaining?: { accommodation: number; charges: Record<string, number> };
  selectedChargeIds: string[];
  includeAccommodation: boolean;
  onSuccess: () => void;
}) {
  const { toast } = useToast();
  const [targetReservationId, setTargetReservationId] = useState("");
  const [includeAccommodation, setIncludeAccommodation] = useState(false);
  const [selectedChargeIds, setSelectedChargeIds] = useState<Set<string>>(new Set());
  const [transferNote, setTransferNote] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Fetch active reservations for the target picker
  const { data: activeReservations = [] } = useQuery<any[]>({
    queryKey: ["/api/reservations", "active-for-transfer"],
    queryFn: async () => {
      const res = await fetch("/api/reservations");
      if (!res.ok) throw new Error("Error cargando reservas");
      const all: any[] = await res.json();
      return all.filter((r: any) =>
        r.status === "checked_in" &&
        String(r.id) !== String(reservationId)
      );
    },
    enabled: open,
  });

  // Reset on open
  useEffect(() => {
    if (open) {
      setTargetReservationId("");
      setIncludeAccommodation(initialIncludeAccommodation);
      setSelectedChargeIds(new Set(initialSelectedChargeIds));
      setTransferNote("");
    }
  }, [open, initialIncludeAccommodation, initialSelectedChargeIds]);

  const billableCharges = (folio?.charges || []).filter(
    (c: any) => c.category !== "transfer_out" && c.category !== "transfer_in" && parseFloat(c.amount) > 0
  );

  const nothingSelected = !includeAccommodation && selectedChargeIds.size === 0;

  async function handleSubmit() {
    if (!targetReservationId) {
      toast({ title: "Seleccioná una habitación destino", variant: "destructive" }); return;
    }
    if (nothingSelected) {
      toast({ title: "Seleccioná al menos un cargo para transferir", variant: "destructive" }); return;
    }
    setIsSubmitting(true);
    try {
      const res = await apiRequest("POST", `/api/reservations/${reservationId}/bulk-transfer`, {
        targetReservationId,
        chargeIds: Array.from(selectedChargeIds),
        includeAccommodation,
        transferNote: transferNote.trim(),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body?.error || "Error al transferir");
      const parts: string[] = [];
      if (body.accommodationTransferred) parts.push("alojamiento");
      if (body.chargesTransferred > 0) parts.push(`${body.chargesTransferred} cargo(s)`);
      toast({ title: `Transferencia realizada: ${parts.join(" y ")} → otra habitación` });
      onSuccess();
    } catch (err: any) {
      toast({ title: parseApiError(err), variant: "destructive" });
    } finally {
      setIsSubmitting(false);
    }
  }

  const targetRes = activeReservations.find((r: any) => String(r.id) === targetReservationId);

  return (
    <Dialog open={open} onOpenChange={o => { if (!o && !isSubmitting) onClose(); }}>
      <DialogContent className="max-w-lg max-h-[85dvh] flex flex-col p-0 gap-0">
        <DialogHeader className="px-6 pt-6 pb-4 shrink-0 border-b">
          <DialogTitle className="flex items-center gap-2">
            <ArrowRightLeft className="h-5 w-5 text-orange-600" />
            Transferir a otra habitación
          </DialogTitle>
          <DialogDescription>
            Los cargos ya seleccionados en Prefactura se moverán al folio destino para facturarlos allí.
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
          {/* Target reservation */}
          <div className="space-y-1.5">
            <Label className="text-sm font-medium">Habitación destino</Label>
            <Select value={targetReservationId} onValueChange={setTargetReservationId}>
              <SelectTrigger>
                <SelectValue placeholder="Seleccionar habitación activa..." />
              </SelectTrigger>
              <SelectContent>
                {activeReservations.map((r: any) => {
                  const roomNum = r.room?.roomNumber || "?";
                  const guestName = r.guest
                    ? `${r.guest.lastName ?? ""} ${r.guest.firstName ?? ""}`.trim()
                    : "Huésped";
                  const statusLabel = "CI";
                  return (
                    <SelectItem key={r.id} value={String(r.id)}>
                      Hab. {roomNum} — {guestName} ({statusLabel})
                    </SelectItem>
                  );
                })}
                {activeReservations.length === 0 && (
                  <SelectItem value="_none" disabled>Sin reservas activas disponibles</SelectItem>
                )}
              </SelectContent>
            </Select>
            {targetRes && (
              <p className="text-xs text-muted-foreground">
                Destino: Hab. {targetRes.room?.roomNumber} — {targetRes.guest?.lastName} {targetRes.guest?.firstName}
              </p>
            )}
          </div>

          {/* Charges selected in Prefactura */}
          <div className="space-y-1.5">
            <Label className="text-sm font-medium">Cargos seleccionados para transferir</Label>
            <div className="border rounded-lg divide-y">
              {/* Accommodation */}
              {(folio?.roomTotal ?? 0) > 0 && (() => {
                const accomRemaining = transferRemaining?.accommodation ?? folio?.roomTotal ?? 0;
                if (accomRemaining <= 0) return null; // fully transferred already
                return (
                  <div className="flex items-center gap-3 p-3">
                    <input
                      type="checkbox"
                      id="bulk-pfx-accommodation"
                      className="h-4 w-4 rounded border-gray-300 shrink-0"
                      checked={includeAccommodation}
                      disabled
                    />
                    <label htmlFor="bulk-pfx-accommodation" className="flex-1 flex justify-between items-center text-sm gap-2">
                      <span className="font-medium">Alojamiento Hab. {folio?.roomNumber} ({folio?.nights} noche{folio?.nights !== 1 ? "s" : ""})</span>
                      <div className="text-right shrink-0">
                        {transferRemaining && accomRemaining < (folio?.roomTotal ?? 0) && (
                          <div className="text-xs text-muted-foreground line-through">${fmtMoney(folio?.roomTotal ?? 0)}</div>
                        )}
                        <span className="font-semibold tabular-nums">${fmtMoney(accomRemaining)}</span>
                      </div>
                    </label>
                  </div>
                );
              })()}
              {/* Extra charges */}
              {billableCharges.length === 0 && (folio?.roomTotal ?? 0) === 0 ? (
                <div className="p-3 text-sm text-muted-foreground text-center">Sin cargos disponibles</div>
              ) : billableCharges.length > 0 ? (
                <>
                  {billableCharges.map((charge: any) => {
                    const remaining = transferRemaining?.charges?.[String(charge.id)] ?? parseFloat(charge.amount);
                    const alreadyTransferred = remaining <= 0;
                    return (
                      <div key={charge.id} className={`flex items-center gap-3 p-3 ${alreadyTransferred ? "opacity-40" : ""}`}>
                        <input
                          type="checkbox"
                          id={`bulk-pfx-${charge.id}`}
                          className="h-4 w-4 rounded border-gray-300 shrink-0"
                          checked={selectedChargeIds.has(String(charge.id))}
                          disabled
                        />
                        <label htmlFor={`bulk-pfx-${charge.id}`} className="flex-1 flex justify-between items-center text-sm gap-2">
                          <span className="truncate">{charge.description}</span>
                          <div className="text-right shrink-0">
                            {!alreadyTransferred && remaining < parseFloat(charge.amount) && (
                              <div className="text-xs text-muted-foreground line-through">${fmtMoney(charge.amount)}</div>
                            )}
                            <span className={`font-medium tabular-nums ${alreadyTransferred ? "line-through" : ""}`}>
                              ${fmtMoney(alreadyTransferred ? parseFloat(charge.amount) : remaining)}
                            </span>
                            {alreadyTransferred && <span className="text-xs text-muted-foreground ml-1">(transferido)</span>}
                          </div>
                        </label>
                      </div>
                    );
                  })}
                </>
              ) : null}
            </div>
          </div>

          {/* Note */}
          <div className="space-y-1.5">
            <Label className="text-sm font-medium">Nota (opcional)</Label>
            <Input
              value={transferNote}
              onChange={e => setTransferNote(e.target.value)}
              placeholder="Ej: Folio Maestro grupo, pedido del huésped..."
              className="text-sm"
            />
          </div>

          {/* Preview */}
          {!nothingSelected && targetReservationId && (
            <div className="rounded-lg border bg-orange-50/60 dark:bg-orange-950/20 px-4 py-3 text-sm space-y-1">
              <p className="font-medium text-orange-700 dark:text-orange-400">Resultado de la transferencia</p>
              <p className="text-muted-foreground text-xs">
                Los cargos seleccionados se moverán al folio de Hab. {targetRes?.room?.roomNumber ?? "destino"}.
                Este folio quedará sin esos cargos y el destino los recibirá para facturar allí.
              </p>
            </div>
          )}
        </div>

        <div className="px-6 py-4 border-t flex justify-end gap-2 shrink-0">
          <Button variant="outline" onClick={onClose} disabled={isSubmitting}>Cancelar</Button>
          <Button
            onClick={handleSubmit}
            disabled={isSubmitting || nothingSelected || !targetReservationId}
            className="bg-orange-600 hover:bg-orange-700 text-white"
          >
            {isSubmitting
              ? <><Loader2 className="h-4 w-4 animate-spin mr-1" />Transfiriendo...</>
              : <><ArrowRightLeft className="h-4 w-4 mr-1" />Transferir</>
            }
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function TransferChargeDialog({
  open, onClose, reservationId, charge, onSuccess,
}: {
  open: boolean;
  onClose: () => void;
  reservationId: string | number;
  charge: { id: string; description: string; maxAmount: number; originalAmount?: number } | null;
  onSuccess: () => void;
}) {
  const { toast } = useToast();
  const [targetReservationId, setTargetReservationId] = useState("");
  const [amount, setAmount] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Fetch active reservations (in-house / checked_in only) for the target picker
  const { data: activeReservations = [] } = useQuery<any[]>({
    queryKey: ["/api/reservations", "active-for-transfer"],
    queryFn: async () => {
      const res = await fetch("/api/reservations");
      if (!res.ok) throw new Error("Error cargando reservas");
      const all: any[] = await res.json();
      return all.filter((r: any) =>
        r.status === "checked_in" &&
        String(r.id) !== String(reservationId)
      );
    },
    enabled: open,
  });

  // Reset on open — default to the full remaining amount
  useEffect(() => {
    if (open && charge) {
      setAmount(charge.maxAmount > 0 ? String(charge.maxAmount.toFixed(2)) : "");
      setTargetReservationId("");
    }
  }, [open, charge?.id]);

  async function handleSubmit() {
    if (!targetReservationId) {
      toast({ title: "Seleccioná una habitación destino", variant: "destructive" });
      return;
    }
    const amt = parseFloat(amount);
    if (!amt || amt <= 0) {
      toast({ title: "El monto debe ser mayor a 0", variant: "destructive" });
      return;
    }
    if (charge && amt > charge.maxAmount + 0.01) {
      toast({ title: `El monto no puede superar $${fmtMoney(charge.maxAmount)}`, variant: "destructive" });
      return;
    }
    setIsSubmitting(true);
    try {
      const res = await apiRequest("POST", `/api/reservations/${reservationId}/transfer-charge`, {
        chargeId: charge?.id,
        amount: amt,
        targetReservationId,
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body?.error || "Error al transferir");
      toast({ title: `Transferencia realizada: $${fmtMoney(amt)} → Hab. ${body.targetRoom}` });
      onSuccess();
      onClose();
    } catch (err: any) {
      toast({ title: parseApiError(err), variant: "destructive" });
    } finally {
      setIsSubmitting(false);
    }
  }

  if (!charge) return null;

  return (
    <Dialog open={open} onOpenChange={o => { if (!o && !isSubmitting) onClose(); }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ArrowRightLeft className="h-5 w-5" />
            Transferir cargo a otra habitación
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* Charge info */}
          <div className="rounded-lg border bg-muted/30 px-4 py-3 text-sm space-y-1">
            <div><span className="text-muted-foreground">Cargo: </span><span className="font-medium">{charge.description}</span></div>
            {charge.originalAmount !== undefined && charge.originalAmount !== charge.maxAmount ? (
              <>
                <div><span className="text-muted-foreground">Total original: </span><span className="font-medium">${fmtMoney(charge.originalAmount)}</span></div>
                <div>
                  <span className="text-muted-foreground">Disponible para transferir: </span>
                  <span className={`font-semibold ${charge.maxAmount <= 0 ? "text-red-600" : "text-blue-700 dark:text-blue-400"}`}>
                    ${fmtMoney(charge.maxAmount)}
                  </span>
                  <span className="text-muted-foreground ml-1">(ya transferido: ${fmtMoney(charge.originalAmount - charge.maxAmount)})</span>
                </div>
              </>
            ) : (
              <div><span className="text-muted-foreground">Monto total: </span><span className="font-medium">${fmtMoney(charge.maxAmount)}</span></div>
            )}
          </div>

          {charge.maxAmount <= 0 ? (
            <div className="flex items-start gap-3 rounded-lg border border-amber-300 bg-amber-50 dark:border-amber-700 dark:bg-amber-950/40 px-4 py-3">
              <AlertCircle className="h-4 w-4 text-amber-600 mt-0.5 shrink-0" />
              <p className="text-sm text-amber-800 dark:text-amber-300">Este cargo ya fue transferido en su totalidad. No hay saldo disponible para transferir.</p>
            </div>
          ) : (
            <>
              {/* Target room picker */}
              <div>
                <Label className="text-xs text-muted-foreground mb-1 block">Habitación destino</Label>
                <Select value={targetReservationId} onValueChange={setTargetReservationId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Seleccionar habitación activa..." />
                  </SelectTrigger>
                  <SelectContent>
                    {activeReservations.map((r: any) => {
                      const roomNum = r.room?.roomNumber || r.roomId || "?";
                      const guestName = r.guest
                        ? `${r.guest.lastName ?? ""} ${r.guest.firstName ?? ""}`.trim()
                        : "Huésped";
                      const statusLabel = "CI";
                      return (
                        <SelectItem key={r.id} value={String(r.id)}>
                          Hab. {roomNum} — {guestName} ({statusLabel})
                        </SelectItem>
                      );
                    })}
                    {activeReservations.length === 0 && (
                      <SelectItem value="_none" disabled>Sin reservas activas disponibles</SelectItem>
                    )}
                  </SelectContent>
                </Select>
              </div>

              {/* Amount */}
              <div>
                <Label className="text-xs text-muted-foreground mb-1 block">
                  Monto a transferir (máx. ${fmtMoney(charge.maxAmount)})
                </Label>
                <Input
                  type="number"
                  step="0.01"
                  min="0.01"
                  max={charge.maxAmount}
                  value={amount}
                  onChange={e => setAmount(e.target.value)}
                  placeholder="0.00"
                  className="text-sm"
                />
                <p className="text-xs text-muted-foreground mt-1">
                  Se creará un descuento en este folio y se agregará el cargo al folio destino.
                </p>
              </div>
            </>
          )}
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={onClose} disabled={isSubmitting}>Cancelar</Button>
          {charge.maxAmount > 0 && (
            <Button onClick={handleSubmit} disabled={isSubmitting || !targetReservationId}>
              {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <ArrowRightLeft className="h-4 w-4 mr-1" />}
              Transferir
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
