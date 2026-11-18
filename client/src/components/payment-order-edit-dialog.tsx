import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { PAYMENT_ORDER_METHODS, type PaymentOrderEdit } from "@shared/payment-order-edit";
import { apiRequest, parseApiError, queryClient } from "@/lib/queryClient";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";

type Snapshot = PaymentOrderEdit & { history: Array<{ user_name: string; timestamp: string; details: string }> };
export function PaymentOrderEditDialog({ id, onClose }: { id: number; onClose: () => void }) {
  const snapshot = useQuery<Snapshot>({
    queryKey: ["/api/payment-orders", id, "edit"],
    queryFn: async () => (await apiRequest("GET", `/api/payment-orders/${id}/edit`)).json(),
    staleTime: 0, gcTime: 0, refetchOnWindowFocus: false, retry: false,
  });
  const [saving, setSaving] = useState(false);
  return <Dialog open onOpenChange={open => { if (!open && !saving) onClose(); }}>
    <DialogContent className="max-w-xl w-[95vw] max-h-[90dvh] overflow-y-auto">
      <DialogHeader><DialogTitle>Editar orden de pago</DialogTitle><DialogDescription>Corregí fecha, forma de pago y observaciones de la OP.</DialogDescription></DialogHeader>
      {snapshot.isPending || !snapshot.isFetchedAfterMount ? <p role="status">Cargando orden de pago…</p> : snapshot.error ? <>
        <p role="alert" className="text-destructive">{parseApiError(snapshot.error)}</p><Button variant="outline" onClick={() => snapshot.refetch()}>Reintentar</Button>
      </> : snapshot.data && <EditForm key={id} op={snapshot.data} onClose={onClose} onSaving={setSaving} />}
    </DialogContent>
  </Dialog>;
}

function EditForm({ op, onClose, onSaving }: { op: Snapshot; onClose: () => void; onSaving: (saving: boolean) => void }) {
  const { toast } = useToast();
  const [form, setForm] = useState({ fecha: op.fecha, formaPago: op.forma_pago, observaciones: op.observaciones || "", motivo: "" });
  const change = (key: keyof typeof form, value: string) => setForm(previous => ({ ...previous, [key]: value }));
  const save = useMutation({
    mutationFn: async () => {
      onSaving(true);
      return (await apiRequest("PATCH", `/api/payment-orders/${op.id}`, { ...form, expectedVersion: op.edit_version })).json();
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["/api/payment-orders"] });
      toast({ title: "Orden de pago actualizada", description: `Se guardaron los cambios de la OP ${op.numero}.` });
      onClose();
    },
    onSettled: () => onSaving(false),
  });
  const dirty = form.fecha !== op.fecha || form.formaPago !== op.forma_pago || form.observaciones !== (op.observaciones || "");
  const valid = dirty && !!form.fecha && form.motivo.trim().length >= 3;
  const methodChanged = form.formaPago !== op.forma_pago;
  const unknownMethod = !PAYMENT_ORDER_METHODS.some(method => method.value === op.forma_pago);
  return <form className="space-y-4" onSubmit={event => { event.preventDefault(); if (valid && !save.isPending) save.mutate(); }}>
    <div className="rounded-md bg-muted p-3 text-sm space-y-1"><p className="font-medium">OP {op.numero} · {op.supplier_nombre}</p><p>Total abonado: ${Number(op.total_abonado).toLocaleString("es-AR", { minimumFractionDigits: 2 })}</p></div>
    <p className="text-sm text-muted-foreground">Se conservan el número, el proveedor, las facturas aplicadas, los importes y las retenciones. Los documentos descargados reflejarán la corrección.</p>
    <div className="grid gap-3 sm:grid-cols-2">
      <div><Label htmlFor="op-edit-date">Fecha de la OP</Label><Input id="op-edit-date" type="date" value={form.fecha} onChange={event => change("fecha", event.target.value)} disabled={save.isPending} required /></div>
      <div><Label htmlFor="op-edit-method">Forma de pago</Label><Select value={form.formaPago} onValueChange={value => change("formaPago", value)} disabled={save.isPending || op.non_fiscal}><SelectTrigger id="op-edit-method"><SelectValue /></SelectTrigger><SelectContent>{unknownMethod && <SelectItem value={op.forma_pago}>{op.forma_pago.replaceAll("_", " ")} (actual)</SelectItem>}{PAYMENT_ORDER_METHODS.map(method => <SelectItem key={method.value} value={method.value}>{method.label}</SelectItem>)}</SelectContent></Select></div>
    </div>
    {op.non_fiscal && <p className="text-sm text-muted-foreground">Las compras no fiscales se abonan en efectivo.</p>}
    {methodChanged && <p role="status" className="text-sm rounded-md border p-3">El total abonado se registrará en {PAYMENT_ORDER_METHODS.find(method => method.value === form.formaPago)?.label.toLowerCase()}. Si había varios medios de pago, se reemplazará esa distribución por el medio elegido.</p>}
    {form.fecha !== op.fecha && <p className="text-sm text-muted-foreground">La corrección actualizará la fecha y el período del asiento de esta OP, y la fecha de su constancia de IIBB cuando corresponda.</p>}
    <div><Label htmlFor="op-edit-notes">Observaciones</Label><Textarea id="op-edit-notes" value={form.observaciones} onChange={event => change("observaciones", event.target.value)} maxLength={5000} disabled={save.isPending} /></div>
    <div><Label htmlFor="op-edit-reason">Motivo de la corrección</Label><Textarea id="op-edit-reason" value={form.motivo} onChange={event => change("motivo", event.target.value)} maxLength={500} disabled={save.isPending} placeholder="Por ejemplo: fecha cargada por error" required /></div>
    {save.error && <p role="alert" className="text-sm text-destructive">{parseApiError(save.error)}</p>}
    {!!op.history?.length && <details className="text-sm"><summary className="cursor-pointer">Últimas correcciones ({op.history.length})</summary><ul className="mt-2 space-y-2">{op.history.map((entry, index) => {
      let detail: any; try { detail = typeof entry.details === "string" ? JSON.parse(entry.details) : entry.details; } catch { detail = {}; }
      return <li key={index} className="rounded border p-2"><p>{entry.user_name} · {new Date(entry.timestamp).toLocaleString("es-AR", { timeZone: "America/Argentina/Buenos_Aires" })}</p><p>{detail.reason}</p></li>;
    })}</ul></details>}
    <DialogFooter><Button type="button" variant="outline" onClick={onClose} disabled={save.isPending}>Cancelar</Button><Button type="submit" disabled={!valid || save.isPending}>{save.isPending ? "Guardando…" : "Guardar cambios"}</Button></DialogFooter>
  </form>;
}
