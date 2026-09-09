tart(4,"0")}-{String(emittedNd.numero ?? 0).padStart(8,"0")}
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
            Esta Nota de Débito revierte total o parcialmente una Nota de Crédito. Restaura la factura original sin registrar un nuevo cobro.
          </div>

          {/* Credit note selector */}
          {creditNotes.length > 1 ? (
            <div>
              <Label className="text-xs text-muted-foreground mb-1 block">Nota de Crédito a revertir</Label>
              <Select value={selectedCreditNoteId} onValueChange={setSelectedCreditNoteId}>
                <SelectTrigger>
                  <SelectValue placeholder="Seleccionar Nota de Crédito..." />
                </SelectTrigger>
                <SelectContent>
                  {creditNotes.map(nc => (
                    <SelectItem key={nc.id} value={String(nc.id)}>
                      {nc.tipo_comprobante} {String(nc.punto_venta).padStart(4,"0")}-{String(nc.numero).padStart(8,"0")} — ${fmtMoney(parseFloat(nc.monto_total) - parseFloat(nc.monto_revertido || "0"))} reversible
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          ) : creditNotes.length === 1 && !selectedCreditNoteId ? (
            // auto-select handled by useEffect; show nothing extra
            null
          ) : null}

          {/* Invoice summary */}
          {selectedCreditNote && (
            <div className="rounded-lg border bg-muted/30 px-4 py-3 text-sm space-y-1">
              <div className="font-medium">
                {selectedCreditNote.tipo_comprobante}{" "}
                {String(selectedCreditNote.punto_venta).padStart(4,"0")}-{String(selectedCreditNote.numero).padStart(8,"0")}
                {" · "}{formatDateAR(selectedCreditNote.fecha_emision)}
              </div>
              <div className="text-muted-foreground">
                Factura original: <span className="text-foreground font-medium">
                  {selectedCreditNote.original_tipo_comprobante} {String(selectedCreditNote.original_punto_venta || 0).padStart(4, "0")}-{String(selectedCreditNote.original_numero || 0).padStart(8, "0")}
                </span>
              </div>
              <div className="text-muted-foreground flex flex-wrap gap-x-4">
                <span>Total NC: <span className="text-foreground font-medium">${fmtMoney(selectedCreditNote.monto_total)}</span></span>
                <span>Ya revertido: <span className="text-foreground">${fmtMoney(selectedCreditNote.monto_revertido || "0")}</span></span>
                <span>Saldo reversible: <span className="font-bold text-blue-700 dark:text-blue-300">${fmtMoney(reversibleBalance)}</span></span>
              </div>
              <div className="text-xs text-muted-foreground mt-1">
                La ND se emitirá como <strong>{{
                  FA: "NDA (Nota de Débito A)",
                  FT: "NDT (Nota de Débito T)",
                  FM: "NDM (Nota de Débito MiPyme A)",
                  FC: "NDC (Nota de Débito C)",
                }[selectedCreditNote.original_tipo_comprobante || ""] ?? "NDB (Nota de Débito B)"}</strong>
              </div>
            </div>
          )}

          {/* Motivo */}
          {selectedCreditNote && (
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
                <Label className="text-xs text-muted-foreground mb-1 block">Monto de la NC a revertir <span className="text-red-500">*</span></Label>
                <Input
                  type="number"
                  step="0.01"
                  min="0.01"
                  max={reversibleBalance}
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

          {dialogError && (
            <div className="flex items-start gap-2 rounded-lg border border-red-300 bg-red-50 dark:border-red-800 dark:bg-red-950/30 px-3 py-2">
              <AlertCircle className="h-4 w-4 text-red-600 mt-0.5 shrink-0" />
              <p className="text-sm text-red-700 dark:text-red-300">{dialogError}</p>
            </div>
          )}

          {creditNotes.length === 0 && (
            <p className="text-sm text-muted-foreground text-center py-4">No hay Notas de Crédito con saldo reversible para esta reserva.</p>
          )}

          {creditNotes.length > 1 && !selectedCreditNote && (
            <p className="text-sm text-muted-foreground text-center py-4">Seleccioná una Nota de Crédito para continuar.</p>
          )}
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={onClose} disabled={isSubmitting}>Cancelar</Button>
          <Button
            onClick={handleSubmit}
            disabled={isSubmitting || !selectedCreditNote || montoNum <= 0 || montoNum > reversibleBalance + 0.01 || !motivo.trim()}
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
     : undefined;

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
             {!isTransfer && !alreadyInvoiced && pending > 0.01 && alreadyPaid > 0.01 && (
               <Badge variant="outline" className="text-[10px] px-1 py-0 shrink-0 border-amber-500 text-amber-700 dark:text-amber-400">
                 Facturado parcialmente · quedan ${fmtMoney(pending)}
               </Badge>
             )}
             {!isTransfer && !alreadyInvoiced && pending > 0.01 && alreadyPaid <= 0.01 && (
               <Badge variant="outline" className="text-[10px] px-1 py-0 shrink-0 border-blue-400 text-blue-700 dark:text-blue-400">
                 Seleccionable
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
