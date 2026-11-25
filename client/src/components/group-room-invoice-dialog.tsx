import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  apiRequest,
  parseApiError,
  parseApiErrorPayload,
} from "@/lib/queryClient";
import { fmtMoney } from "@/lib/utils";
import type { GroupWithDetails } from "@shared/schema";

type Tender = {
  method: string;
  amount: string;
  reference: string;
  retention?: { tipo: string; monto: number };
};
const methods = [
  ["efectivo", "Efectivo"],
  ["transferencia", "Transferencia"],
  ["tarjeta_debito", "Tarjeta de débito"],
  ["tarjeta_credito", "Tarjeta de crédito"],
  ["mercadopago", "Mercado Pago"],
  ["cuenta_corriente", "Cuenta Corriente"],
];
const request = async (method: string, url: string, body?: any) =>
  (await apiRequest(method, url, body)).json();
export function GroupRoomInvoiceDialog({
  group,
  open,
  onOpenChange,
  onSaved,
}: {
  group: GroupWithDetails;
  open: boolean;
  onOpenChange: (value: boolean) => void;
  onSaved: () => void;
}) {
  const path = `/api/groups/${group.id}/room-invoice-batches`,
    key = `group-room-invoice:${group.id}`;
  const [selection, setSelection] = useState<Record<string, "group" | "guest">>(
      {},
    ),
    [closeRooms, setCloseRooms] = useState(true);
  const [preparationPending, setPreparationPending] = useState(false);
  const [review, setReview] = useState<any>(null),
    [batch, setBatch] = useState<any>(null),
    [error, setError] = useState<string | null>(null),
    [busy, setBusy] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({}),
    [rows, setRows] = useState<Tender[]>([
      { method: "efectivo", amount: "", reference: "" },
    ]);
  const [receiver, setReceiver] = useState({
    razonSocial: "",
    cuit: "",
    dni: "",
  });
  const initialized = useRef(false),
    running = useRef(false);
  const history = useQuery<any[]>({
    queryKey: [path],
    enabled: open,
    queryFn: () => request("GET", path),
  });
  const draft = () => ({
    selection: Object.entries(selection).map(([reservationId, recipient]) => ({
      reservationId,
      recipient,
    })),
    closeRooms,
  });
  const preview = useMutation({
    mutationFn: () => request("POST", path + "/preview", draft()),
    onSuccess: (data) => {
      setReview(data);
      setError(null);
      setRows([
        { method: "efectivo", amount: data.total.toFixed(2), reference: "" },
      ]);
      setReceiver({
        razonSocial: data.payer?.razonSocial || "",
        cuit: data.payer?.cuit || "",
        dni: data.payer?.dni || "",
      });
    },
    onError: (e) => setError(parseApiError(e)),
  });

  // Every retry obtains the persisted plan. Never rebuild a receipt or a fiscal
  // request from today's form fields or from a changed room balance.
  const run = async (id: string) => {
    if (running.current) return;
    running.current = true;
    setBusy(true);
    setError(null);
    setErrors({});
    try {
      let current = await request("GET", `${path}/${id}`);
      setBatch(current);
      if (current.status === "retired") return;
      if (!current.collection.done) {
        if (current.collection.review)
          throw Error(
            current.collection.error ||
              "El recibo original requiere conciliación.",
          );
        if (current.paymentBody) {
          if (!current.canCollect)
            throw Error(
              "El operador que inició este cierre debe confirmar su cobro original.",
            );
          await request(
            "POST",
            `/api/groups/${group.id}/payment`,
            current.paymentBody,
          );
        } else await request("POST", `${path}/${id}/collection`, {});
        current = await request("GET", `${path}/${id}`);
        setBatch(current);
      }
      if (!current.collection.done)
        throw Error("No se pudo verificar el cobro original.");
      for (const invoice of current.invoices) {
        if (invoice.done || invoice.needsReview) continue;
        try {
          await request("POST", "/api/billing/invoices", invoice.body);
        } catch (e) {
          setErrors((previous) => ({
            ...previous,
            [invoice.reservationId]: parseApiError(e),
          }));
        }
      }
      const verified = await request("GET", `${path}/${id}`);
      setBatch(verified);
      onSaved();
      history.refetch();
      if (verified.status === "completed") sessionStorage.removeItem(key);
    } catch (e) {
      setError(parseApiError(e));
    } finally {
      running.current = false;
      setBusy(false);
    }
  };
  const prepare = async (body: any) => {
    setBusy(true);
    setPreparationPending(true);
    setError(null);
    try {
      sessionStorage.setItem(key, JSON.stringify(body));
      const data = await request("POST", path, body);
      setBatch(data);
      setPreparationPending(false);
      sessionStorage.setItem(key, JSON.stringify({ id: data.id }));
      await run(data.id);
    } catch (e) {
      if ((parseApiErrorPayload(e) as any)?.notApplied === true) {
        sessionStorage.removeItem(key);
        setPreparationPending(false);
        setReview(null);
      }
      setError(parseApiError(e));
    } finally {
      setBusy(false);
    }
  };
  useEffect(() => {
    if (!open) {
      initialized.current = false;
      return;
    }
    if (initialized.current) return;
    initialized.current = true;
    setPreparationPending(false);
    setReview(null);
    setBatch(null);
    setError(null);
    setErrors({});
    setSelection(
      Object.fromEntries(
        group.reservations
          .filter(
            (r) =>
              ["confirmed", "checked_in"].includes(r.status) &&
              r.guest?.codigo !== `GROUP-${group.id}`,
          )
          .map((r) => [r.id, group.billingEntityId ? "group" : "guest"]),
      ),
    );
    const pending = sessionStorage.getItem(key);
    if (pending) {
      try {
        const saved = JSON.parse(pending);
        if (saved.id) void run(saved.id);
        else void prepare(saved);
      } catch {
        setError(
          "No se pudo leer el cierre original. Sus datos se conservaron.",
        );
      }
    }
  }, [open, key]);
  const confirm = () =>
    prepare({
      ...draft(),
      operationId: crypto.randomUUID(),
      fingerprint: review.fingerprint,
      paymentRows: rows,
      receiverDetails: receiver,
    });
  const changeSelection = (next: typeof selection) => {
    setSelection(next);
    setReview(null);
  };
  const total =
    rows.reduce(
      (n, row) =>
        n +
        Math.round(Number(row.amount || 0) * 100) +
        Math.round(Number(row.retention?.monto || 0) * 100),
      0,
    ) / 100;
  return (
    <Dialog
      open={open}
      onOpenChange={(value) => {
        if (!busy) onOpenChange(value);
      }}
    >
      <DialogContent className="max-w-4xl max-h-[90dvh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Pago grupal · Facturas por habitación</DialogTitle>
          <DialogDescription>
            Un cobro por el saldo pendiente y una factura por habitación. Los
            cargos comunes del grupo se resuelven desde el Folio Grupal.
          </DialogDescription>
        </DialogHeader>
        {!batch && (
          <div className="space-y-4">
            <div className="space-y-2 rounded-lg border p-3">
              {group.reservations
                .filter((r) =>
                  ["confirmed", "checked_in", "checked_out"].includes(r.status),
                )
                .map((r) => (
                  <div
                    key={r.id}
                    className="flex flex-wrap items-center gap-3 text-sm"
                  >
                    <label className="flex flex-1 items-center gap-2">
                      <input
                        type="checkbox"
                        checked={!!selection[r.id]}
                        disabled={
                          busy || preparationPending || preview.isPending
                        }
                        onChange={(e) => {
                          const next = { ...selection };
                          if (e.target.checked)
                            next[r.id] = group.billingEntityId
                              ? "group"
                              : "guest";
                          else delete next[r.id];
                          changeSelection(next);
                        }}
                      />
                      Hab. {r.room?.roomNumber || "—"} · {r.guest?.firstName}{" "}
                      {r.guest?.lastName}
                      {r.status === "checked_out" ? " · Salida realizada" : ""}
                    </label>
                    {!!selection[r.id] && (
                      <select
                        aria-label={`Receptor de la habitación ${r.room?.roomNumber || r.id}`}
                        value={selection[r.id]}
                        disabled={
                          busy || preparationPending || preview.isPending
                        }
                        onChange={(e) =>
                          changeSelection({
                            ...selection,
                            [r.id]: e.target.value as "group" | "guest",
                          })
                        }
                        className="rounded border bg-background p-1"
                      >
                        <option value="guest">Titular de la habitación</option>
                        {group.billingEntityId && (
                          <option value="group">Receptor del grupo</option>
                        )}
                      </select>
                    )}
                  </div>
                ))}
            </div>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={closeRooms}
                disabled={busy || preparationPending || preview.isPending}
                onChange={(e) => {
                  setCloseRooms(e.target.checked);
                  setReview(null);
                }}
              />
              Cerrar las habitaciones elegidas al registrar el cobro
            </label>
            <Button
              variant="outline"
              disabled={
                busy || preview.isPending || !Object.keys(selection).length
              }
              onClick={() => preview.mutate()}
            >
              Revisar saldos y facturas
            </Button>
            {review && (
              <div className="space-y-3 rounded-lg border p-4">
                {review.rows.map((r: any) => (
                  <div key={r.reservationId} className="border-b pb-2 text-sm">
                    <strong>
                      Hab. {r.roomNumber} · {r.guestName}
                    </strong>
                    <p>
                      Ya pagado: ${fmtMoney(r.paid)} · Cobro nuevo: $
                      {fmtMoney(r.balance)}
                    </p>
                    <p>
                      {r.invoiceAmount > 0
                        ? `${r.type} a ${r.client.razonSocial} · $${fmtMoney(r.invoiceAmount)} · PV ${review.point}`
                        : "Sin conceptos pendientes de facturar."}
                    </p>
                  </div>
                ))}
                <p className="font-semibold">
                  Cobro nuevo total: ${fmtMoney(review.total)}
                </p>
                {review.remainingGroupCharges > 0 && (
                  <p className="text-sm">
                    Cargos comunes pendientes de facturar: $
                    {fmtMoney(review.remainingGroupCharges)}. Permanecen en el
                    Folio Grupal.
                  </p>
                )}
                {review.blockers.map((message: string) => (
                  <p
                    key={message}
                    role="alert"
                    className="text-sm text-destructive"
                  >
                    {message}
                  </p>
                ))}
                {review.canPrepare && review.total > 0 && (
                  <fieldset
                    disabled={busy || preparationPending}
                    className="space-y-3"
                  >
                    <Label>Medios del cobro nuevo</Label>
                    {rows.map((row, index) => (
                      <div key={index} className="grid grid-cols-3 gap-2">
                        <select
                          aria-label={`Medio ${index + 1}`}
                          value={row.method}
                          onChange={(e) =>
                            setRows(
                              rows.map((r, i) =>
                                i === index
                                  ? {
                                      ...r,
                                      method: e.target.value,
                                      ...(e.target.value === "cuenta_corriente"
                                        ? { retention: undefined }
                                        : {}),
                                    }
                                  : r,
                              ),
                            )
                          }
                          className="rounded border bg-background px-2"
                        >
                          {methods.map(([value, label]) => (
                            <option key={value} value={value}>
                              {label}
                            </option>
                          ))}
                        </select>
                        <Input
                          aria-label={`Importe ${index + 1}`}
                          type="number"
                          min="0"
                          step="0.01"
                          value={row.amount}
                          onChange={(e) =>
                            setRows(
                              rows.map((r, i) =>
                                i === index
                                  ? { ...r, amount: e.target.value }
                                  : r,
                              ),
                            )
                          }
                        />
                        <Input
                          aria-label={`Referencia ${index + 1}`}
                          placeholder="Referencia del pago"
                          value={row.reference}
                          onChange={(e) =>
                            setRows(
                              rows.map((r, i) =>
                                i === index
                                  ? { ...r, reference: e.target.value }
                                  : r,
                              ),
                            )
                          }
                        />
                        <div className="col-span-3 flex flex-wrap items-center gap-2">
                          {row.method !== "cuenta_corriente" && (
                            <label className="flex items-center gap-2 text-sm">
                              <input
                                type="checkbox"
                                checked={!!row.retention}
                                onChange={(e) =>
                                  setRows(
                                    rows.map((r, i) =>
                                      i === index
                                        ? {
                                            ...r,
                                            retention: e.target.checked
                                              ? { tipo: "iibb", monto: 0 }
                                              : undefined,
                                          }
                                        : r,
                                    ),
                                  )
                                }
                              />
                              Agregar retención
                            </label>
                          )}
                          {row.retention && (
                            <>
                              <select
                                aria-label={`Tipo de retención ${index + 1}`}
                                value={row.retention.tipo}
                                onChange={(e) =>
                                  setRows(
                                    rows.map((r, i) =>
                                      i === index
                                        ? {
                                            ...r,
                                            retention: {
                                              ...r.retention!,
                                              tipo: e.target.value,
                                            },
                                          }
                                        : r,
                                    ),
                                  )
                                }
                                className="rounded border bg-background p-2"
                              >
                                <option value="iibb">IIBB</option>
                                <option value="ganancias">Ganancias</option>
                              </select>
                              <Input
                                className="w-36"
                                type="number"
                                min="0"
                                step="0.01"
                                aria-label={`Retención ${index + 1}`}
                                value={row.retention.monto || ""}
                                onChange={(e) =>
                                  setRows(
                                    rows.map((r, i) =>
                                      i === index
                                        ? {
                                            ...r,
                                            retention: {
                                              ...r.retention!,
                                              monto: Number(e.target.value),
                                            },
                                          }
                                        : r,
                                    ),
                                  )
                                }
                              />
                            </>
                          )}
                          {rows.length > 1 && (
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() =>
                                setRows(rows.filter((_, i) => i !== index))
                              }
                            >
                              Quitar medio {index + 1}
                            </Button>
                          )}
                        </div>
                      </div>
                    ))}
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() =>
                        setRows([
                          ...rows,
                          {
                            method: "transferencia",
                            amount: "",
                            reference: "",
                          },
                        ])
                      }
                    >
                      Agregar medio
                    </Button>
                    <p className="text-sm">
                      Medios y retenciones: ${fmtMoney(total)}
                    </p>
                    <div className="grid grid-cols-3 gap-2">
                      <Input
                        aria-label="Nombre del receptor del cobro"
                        placeholder="Nombre o razón social"
                        value={receiver.razonSocial}
                        onChange={(e) =>
                          setReceiver({
                            ...receiver,
                            razonSocial: e.target.value,
                          })
                        }
                      />
                      <Input
                        aria-label="CUIT del receptor del cobro"
                        placeholder="CUIT"
                        value={receiver.cuit}
                        onChange={(e) =>
                          setReceiver({ ...receiver, cuit: e.target.value })
                        }
                      />
                      <Input
                        aria-label="DNI del receptor del cobro"
                        placeholder="DNI"
                        value={receiver.dni}
                        onChange={(e) =>
                          setReceiver({ ...receiver, dni: e.target.value })
                        }
                      />
                    </div>
                  </fieldset>
                )}
                {review.canPrepare && (
                  <p className="text-sm text-muted-foreground">
                    Al confirmar se registra el cobro una sola vez
                    {closeRooms
                      ? " y se cierran las habitaciones elegidas"
                      : ""}
                    . Las facturas se verifican por separado; una emisión
                    pendiente no revierte las salidas realizadas.
                  </p>
                )}
              </div>
            )}
          </div>
        )}
        {batch && (
          <div className="space-y-3" role="status">
            <p className="font-medium">
              {batch.collection.done
                ? `Cobro original verificado · $${fmtMoney(batch.total)}`
                : "Verificando el cobro original…"}
            </p>
            {batch.invoices.map((invoice: any) => (
              <div
                key={invoice.reservationId}
                className="rounded border p-3 text-sm"
              >
                <strong>
                  Hab. {invoice.roomNumber} · ${fmtMoney(invoice.amount)}
                </strong>
                <p>
                  {invoice.done
                    ? `Emitida: ${invoice.invoice.type} ${invoice.invoice.point}-${invoice.invoice.number}`
                    : invoice.needsReview
                      ? "El comprobante original requiere revisión."
                      : "Emisión pendiente de verificar."}
                </p>
                {errors[invoice.reservationId] && (
                  <p className="text-destructive">
                    {errors[invoice.reservationId]}
                  </p>
                )}
                {invoice.invoice && (
                  <a
                    href={`/api/billing/invoices/${invoice.invoice.id}/pdf`}
                    target="_blank"
                    rel="noreferrer"
                    className="text-primary underline"
                  >
                    Ver comprobante
                  </a>
                )}
              </div>
            ))}
            <p className="text-sm">
              {batch.status === "completed"
                ? "Cierre documentado."
                : busy
                  ? "Procesando y verificando cada habitación…"
                  : "El seguimiento conserva el cobro y cada factura original. Se verificará automáticamente al volver a abrir este cierre."}
            </p>
            {!busy &&
              !batch.collection.done &&
              !batch.collection.review &&
              batch.canCollect && (
                <Button
                  variant="outline"
                  onClick={async () => {
                    try {
                      await request("POST", `${path}/${batch.id}/retire`, {});
                      sessionStorage.removeItem(key);
                      setBatch(null);
                      setReview(null);
                      setError(null);
                      history.refetch();
                    } catch (e) {
                      setError(parseApiError(e));
                    }
                  }}
                >
                  Corregir cierre sin actividad registrada
                </Button>
              )}
          </div>
        )}
        {preparationPending && !busy && !batch && (
          <p role="status" className="text-sm">
            Se conservó la preparación original. Se verificará automáticamente
            al volver a abrir este cierre.
          </p>
        )}
        {error && (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}
        {!busy && !!history.data?.length && (
          <details className="text-sm">
            <summary>Cierres por habitación registrados</summary>
            <div className="space-y-2 pt-2">
              {history.data.map((item) => (
                <Button
                  key={item.id}
                  variant="outline"
                  size="sm"
                  disabled={item.status === "retired"}
                  onClick={() => {
                    sessionStorage.setItem(
                      key,
                      JSON.stringify({ id: item.id }),
                    );
                    void run(item.id);
                  }}
                >
                  {item.rows.map((r: any) => r.roomNumber).join(", ")} ·{" "}
                  {item.status === "completed"
                    ? "Documentado"
                    : item.status === "retired"
                      ? "Sin actividad"
                      : "En seguimiento"}
                </Button>
              ))}
            </div>
          </details>
        )}
        <DialogFooter>
          <Button
            variant="outline"
            disabled={busy}
            onClick={() => onOpenChange(false)}
          >
            Cerrar
          </Button>
          {!batch && (
            <Button
              disabled={
                busy ||
                preparationPending ||
                preview.isPending ||
                !review?.canPrepare ||
                (review.total > 0 &&
                  (Math.round(total * 100) !== Math.round(review.total * 100) ||
                    rows.some((r) => !r.reference.trim())))
              }
              onClick={confirm}
            >
              {busy
                ? "Verificando…"
                : closeRooms
                  ? "Cobrar, cerrar y facturar por habitación"
                  : "Cobrar y facturar por habitación"}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
