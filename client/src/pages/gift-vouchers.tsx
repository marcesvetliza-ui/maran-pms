import { useState } from "react";
import { fmtMoney } from "@/lib/utils";
import { formatHotelDateTime } from "@/lib/hotelTime";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import {
  Gift,
  Plus,
  Search,
  CheckCircle2,
  XCircle,
  Clock,
  Filter,
  Printer,
  Ban,
  Eye,
  MoreHorizontal,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import type { GiftVoucher, GiftVoucherApplication, GiftVoucherEvent } from "@shared/schema";
import { insertGiftVoucherSchema } from "@shared/schema";

// ── Types ──────────────────────────────────────────────────────────────────────

type Status = "activo" | "activo_facturado" | "reservado" | "utilizado" | "vencido" | "cancelado";
type Area = "alojamiento" | "restaurant" | "spa" | "otro";
type ValueType = "monetario" | "descriptivo";

const AREA_LABELS: Record<Area, string> = {
  alojamiento: "Alojamiento",
  restaurant: "Restaurant",
  spa: "Spa",
  otro: "Otro",
};

const STATUS_CONFIG: Record<Status, { label: string; color: string; icon: any }> = {
  activo:            { label: "Activo",            color: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400",  icon: CheckCircle2 },
  activo_facturado:  { label: "Activo Facturado",  color: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400", icon: CheckCircle2 },
  reservado:         { label: "Reservado",         color: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400",      icon: Clock },
  utilizado:         { label: "Utilizado",         color: "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400",         icon: CheckCircle2 },
  vencido:           { label: "Vencido",           color: "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400", icon: Clock },
  cancelado:         { label: "Cancelado",         color: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400",          icon: XCircle },
};

const PAYMENT_METHODS = [
  { value: "efectivo",      label: "Efectivo" },
  { value: "tarjeta",       label: "Tarjeta" },
  { value: "transferencia", label: "Transferencia" },
  { value: "otro",          label: "Otro" },
];

// ── Form schema ────────────────────────────────────────────────────────────────

const voucherFormSchema = insertGiftVoucherSchema.extend({
  area:      z.enum(["alojamiento", "restaurant", "spa", "otro"]),
  valueType: z.enum(["monetario", "descriptivo"]),
}).omit({ voucherCode: true });

type VoucherFormValues = z.infer<typeof voucherFormSchema>;

// ── Status badge ───────────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: Status }) {
  const cfg = STATUS_CONFIG[status] ?? STATUS_CONFIG.activo;
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${cfg.color}`}>
      <cfg.icon className="h-3 w-3" />
      {cfg.label}
    </span>
  );
}

// ── Create Dialog ──────────────────────────────────────────────────────────────

function CreateVoucherDialog({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const { toast } = useToast();
  const form = useForm<VoucherFormValues>({
    resolver: zodResolver(voucherFormSchema),
    defaultValues: {
      area: "alojamiento",
      description: "",
      valueType: "monetario",
      valueAmount: null,
      buyerName: "",
      buyerPhone: "",
      buyerEmail: "",
      beneficiaryName: "",
      expiresAt: null,
      pricePaid: null,
      paymentMethod: null,
      notes: "",
      status: "activo",
    },
  });

  const valueType = form.watch("valueType");

  const mutation = useMutation({
    mutationFn: async (data: VoucherFormValues) => {
      const res = await apiRequest("POST", "/api/gift-vouchers", data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/gift-vouchers"] });
      toast({ title: "Voucher creado correctamente" });
      form.reset();
      onClose();
    },
    onError: () => toast({ title: "Error al crear voucher", variant: "destructive" }),
  });

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Gift className="h-5 w-5 text-primary" />
            Nuevo Voucher Regalo
          </DialogTitle>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit((d) => mutation.mutate(d))} className="space-y-4">

            {/* Area + Value Type */}
            <div className="grid grid-cols-2 gap-4">
              <FormField control={form.control} name="area" render={({ field }) => (
                <FormItem>
                  <FormLabel>Área</FormLabel>
                  <Select value={field.value} onValueChange={field.onChange}>
                    <FormControl>
                      <SelectTrigger data-testid="select-area">
                        <SelectValue />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value="alojamiento">Alojamiento</SelectItem>
                      <SelectItem value="restaurant">Restaurant</SelectItem>
                      <SelectItem value="spa">Spa</SelectItem>
                      <SelectItem value="otro">Otro</SelectItem>
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )} />

              <FormField control={form.control} name="valueType" render={({ field }) => (
                <FormItem>
                  <FormLabel>Tipo de valor</FormLabel>
                  <Select value={field.value} onValueChange={field.onChange}>
                    <FormControl>
                      <SelectTrigger data-testid="select-value-type">
                        <SelectValue />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value="monetario">Monetario ($)</SelectItem>
                      <SelectItem value="descriptivo">Descriptivo</SelectItem>
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )} />
            </div>

            {/* Description */}
            <FormField control={form.control} name="description" render={({ field }) => (
              <FormItem>
                <FormLabel>Descripción del servicio/beneficio</FormLabel>
                <FormControl>
                  <Input {...field} placeholder="Ej: Noche de alojamiento doble con desayuno" data-testid="input-description" />
                </FormControl>
                <FormMessage />
              </FormItem>
            )} />

            {/* Value amount (only for monetario) */}
            {valueType === "monetario" && (
              <FormField control={form.control} name="valueAmount" render={({ field }) => (
                <FormItem>
                  <FormLabel>Saldo a regalar ($)</FormLabel>
                  <FormControl>
                    <Input
                      type="number"
                      min="0"
                      step="0.01"
                      placeholder="0.00"
                      value={field.value ?? ""}
                      onChange={(e) => field.onChange(e.target.value ? e.target.value : null)}
                      data-testid="input-value-amount"
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )} />
            )}

            <Separator />

            {/* Buyer */}
            <p className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Comprador</p>
            <div className="grid grid-cols-2 gap-4">
              <FormField control={form.control} name="buyerName" render={({ field }) => (
                <FormItem>
                  <FormLabel>Nombre *</FormLabel>
                  <FormControl>
                    <Input {...field} placeholder="Nombre del comprador" data-testid="input-buyer-name" />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )} />
              <FormField control={form.control} name="buyerPhone" render={({ field }) => (
                <FormItem>
                  <FormLabel>Teléfono</FormLabel>
                  <FormControl>
                    <Input {...field} value={field.value ?? ""} placeholder="+54 9 11..." data-testid="input-buyer-phone" />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )} />
            </div>
            <FormField control={form.control} name="buyerEmail" render={({ field }) => (
              <FormItem>
                <FormLabel>Email</FormLabel>
                <FormControl>
                  <Input {...field} value={field.value ?? ""} type="email" placeholder="comprador@email.com" data-testid="input-buyer-email" />
                </FormControl>
                <FormMessage />
              </FormItem>
            )} />

            <Separator />

            {/* Beneficiary */}
            <p className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Beneficiario</p>
            <FormField control={form.control} name="beneficiaryName" render={({ field }) => (
              <FormItem>
                <FormLabel>Nombre del beneficiario</FormLabel>
                <FormControl>
                  <Input {...field} value={field.value ?? ""} placeholder="A nombre de quién es el regalo" data-testid="input-beneficiary-name" />
                </FormControl>
                <FormMessage />
              </FormItem>
            )} />

            <Separator />

            {/* Payment & Expiry */}
            <p className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Pago y Vencimiento</p>
            <div className="grid grid-cols-2 gap-4">
              <FormField control={form.control} name="pricePaid" render={({ field }) => (
                <FormItem>
                  <FormLabel>Precio cobrado ($)</FormLabel>
                  <FormControl>
                    <Input
                      type="number"
                      min="0"
                      step="0.01"
                      placeholder="0.00"
                      value={field.value ?? ""}
                      onChange={(e) => field.onChange(e.target.value ? e.target.value : null)}
                      data-testid="input-price-paid"
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )} />

              <FormField control={form.control} name="paymentMethod" render={({ field }) => (
                <FormItem>
                  <FormLabel>Forma de pago</FormLabel>
                  <Select value={field.value ?? "none"} onValueChange={(v) => field.onChange(v === "none" ? null : v)}>
                    <FormControl>
                      <SelectTrigger data-testid="select-payment-method">
                        <SelectValue placeholder="Seleccionar..." />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value="none">— Sin especificar —</SelectItem>
                      {PAYMENT_METHODS.map((m) => (
                        <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )} />
            </div>

            <FormField control={form.control} name="expiresAt" render={({ field }) => (
              <FormItem>
                <FormLabel>Fecha de vencimiento</FormLabel>
                <FormControl>
                  <Input
                    type="date"
                    value={field.value ?? ""}
                    onChange={(e) => field.onChange(e.target.value || null)}
                    data-testid="input-expires-at"
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )} />

            {/* Notes */}
            <FormField control={form.control} name="notes" render={({ field }) => (
              <FormItem>
                <FormLabel>Notas internas</FormLabel>
                <FormControl>
                  <Textarea {...field} value={field.value ?? ""} rows={2} placeholder="Observaciones..." data-testid="input-notes" />
                </FormControl>
                <FormMessage />
              </FormItem>
            )} />

            <DialogFooter>
              <Button type="button" variant="outline" onClick={onClose} data-testid="button-cancel-create">
                Cancelar
              </Button>
              <Button type="submit" disabled={mutation.isPending} data-testid="button-submit-create">
                {mutation.isPending ? "Guardando..." : "Crear Voucher"}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}

// ── Mark Used Dialog ───────────────────────────────────────────────────────────

function MarkUsedDialog({
  voucher,
  onClose,
}: {
  voucher: GiftVoucher | null;
  onClose: () => void;
}) {
  const { toast } = useToast();
  const [notes, setNotes] = useState("");

  const mutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", `/api/gift-vouchers/${voucher!.id}/mark-used`, { usedNotes: notes });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/gift-vouchers"] });
      toast({ title: "Voucher marcado como usado" });
      onClose();
    },
    onError: () => toast({ title: "Error al marcar el voucher", variant: "destructive" }),
  });

  return (
    <Dialog open={!!voucher} onOpenChange={(v) => !v && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CheckCircle2 className="h-5 w-5 text-green-600" />
            Marcar como Usado
          </DialogTitle>
        </DialogHeader>

        {voucher && (
          <div className="space-y-4">
            <div className="p-3 rounded-lg bg-muted text-sm space-y-1">
              <p><span className="font-medium">Código:</span> {voucher.voucherCode}</p>
              <p><span className="font-medium">Beneficiario:</span> {voucher.beneficiaryName || voucher.buyerName}</p>
              <p><span className="font-medium">Descripción:</span> {voucher.description}</p>
              {voucher.valueAmount && (
                <p><span className="font-medium">Valor:</span> ${fmtMoney(voucher.valueAmount)}</p>
              )}
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">Notas de uso (opcional)</label>
              <Textarea
                rows={3}
                placeholder="Ej: Canjeado en check-in habitación 102"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                data-testid="input-used-notes"
              />
            </div>
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={onClose} data-testid="button-cancel-use">Cancelar</Button>
          <Button
            onClick={() => mutation.mutate()}
            disabled={mutation.isPending}
            className="bg-green-600 hover:bg-green-700 text-white"
            data-testid="button-confirm-use"
          >
            {mutation.isPending ? "Guardando..." : "Confirmar uso"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Print Voucher ──────────────────────────────────────────────────────────────

function printVoucher(v: GiftVoucher) {
  const valueDisplay = v.valueType === "monetario" && v.valueAmount
    ? `$${fmtMoney(v.valueAmount)}`
    : v.description;

  const expiryDisplay = v.expiresAt
    ? format(new Date(v.expiresAt + "T12:00:00"), "dd 'de' MMMM 'de' yyyy", { locale: es })
    : "Sin vencimiento";

  const origin = window.location.origin;

  const html = `
    <!DOCTYPE html>
    <html lang="es">
    <head>
      <meta charset="UTF-8" />
      <title>Voucher ${v.voucherCode}</title>
      <link rel="preconnect" href="https://fonts.googleapis.com" />
      <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
      <style>
        @import url('https://fonts.googleapis.com/css2?family=Montserrat:wght@400;500;600;700;800&family=JetBrains+Mono:wght@400;700&display=swap');

        :root {
          /* marca */
          --maran-bordo:       #791127;   /* borde, nombre, cápsula, código   */
          --maran-bordo-deep:  #4F0A19;   /* cierre del degradé               */
          --maran-ocre:        #D26829;   /* filete superior, detalles        */
          --maran-ocre-text:   #B8551C;   /* ocre legible sobre claro         */
          --maran-ocre-soft:   #FBF0E8;   /* fondo cápsula de área            */

          /* neutros */
          --maran-tinta:       #241B1E;   /* texto principal, valores         */
          --maran-gris:        #5C5153;   /* descripción, subtítulo           */
          --maran-gris-soft:   #8C807C;   /* etiquetas, pie legal              */
          --maran-linea:       #DED7D3;   /* divisores de la grilla           */
          --maran-hueso:       #F7F5F3;   /* franja del código                */
          --maran-blanco:      #FFFFFF;

          /* tipografía */
          --maran-font:        'Montserrat', system-ui, sans-serif;
          --maran-font-mono:   'JetBrains Mono', ui-monospace, monospace;

          /* bloque de valor */
          --maran-valor-bg:    linear-gradient(135deg, #791127 0%, #4F0A19 100%);
        }

        @page { size: A5 landscape; margin: 10mm; }
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body { font-family: var(--maran-font); background: #fff; color: var(--maran-tinta); }
        .card {
          border: 3px solid var(--maran-bordo);
          border-radius: 16px;
          padding: 24px 32px;
          max-width: 180mm;
          position: relative;
          overflow: hidden;
        }
        .card::before {
          content: "";
          position: absolute;
          top: 0; left: 0; right: 0;
          height: 3px;
          background: var(--maran-ocre);
        }
        .watermark {
          position: absolute;
          top: 50%; left: 50%;
          transform: translate(-50%,-50%);
          width: 44mm;
          height: auto;
          opacity: 0.06;
          pointer-events: none;
        }
        .header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 20px; position: relative; }
        .hotel-logo { height: 84px; width: auto; display: block; }
        .gift-label {
          background: var(--maran-bordo);
          color: var(--maran-blanco);
          padding: 6px 14px;
          border-radius: 20px;
          font-size: 12px;
          font-weight: 600;
          letter-spacing: 0.14em;
          text-transform: uppercase;
          white-space: nowrap;
        }
        .value-block {
          text-align: center;
          margin: 16px 0;
          padding: 14px;
          background: var(--maran-valor-bg);
          border-radius: 12px;
          color: var(--maran-blanco);
          position: relative;
        }
        .value-num { font-size: 40px; font-weight: 800; letter-spacing: -0.02em; font-variant-numeric: tabular-nums; }
        .value-desc { font-size: 14px; font-weight: 500; opacity: 1; margin-top: 2px; }
        .area-row { margin-bottom: 12px; position: relative; }
        .area-badge {
          display: inline-block;
          background: var(--maran-ocre-soft);
          color: var(--maran-ocre-text);
          padding: 3px 10px;
          border-radius: 8px;
          font-size: 11px;
          font-weight: 700;
          letter-spacing: 0.12em;
          text-transform: uppercase;
        }
        .info-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin-top: 14px; position: relative; }
        .info-item { font-size: 12px; }
        .info-label { color: var(--maran-gris-soft); font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.14em; }
        .info-value { font-size: 13px; font-weight: 600; color: var(--maran-tinta); margin-top: 2px; }
        .code-block {
          margin-top: 18px;
          padding: 10px;
          background: var(--maran-hueso);
          border-radius: 8px;
          text-align: center;
          font-family: var(--maran-font-mono);
          font-size: 17px;
          font-weight: 700;
          letter-spacing: 0.12em;
          color: var(--maran-bordo);
          position: relative;
        }
        .footer { margin-top: 16px; font-size: 9.5px; font-weight: 500; color: var(--maran-gris-soft); text-align: center; position: relative; }
      </style>
    </head>
    <body>
      <div class="card">
        <img class="watermark" src="${origin}/isologo-circulo.png" alt="" width="648" height="662" />
        <div class="header">
          <div>
            <img class="hotel-logo" src="${origin}/logo-maran.png" alt="Maran Suites &amp; Towers" width="166" height="84" />
          </div>
          <div class="gift-label">Voucher regalo</div>
        </div>

        <div class="value-block">
          ${v.valueType === "monetario" && v.valueAmount
            ? `<div class="value-num">$${fmtMoney(v.valueAmount)}</div>`
            : `<div class="value-desc" style="font-size:18px;font-weight:700;">${v.description}</div>`
          }
          ${v.valueType === "monetario" ? `<div class="value-desc">${v.description}</div>` : ""}
        </div>

        <div class="area-row">
          <span class="area-badge">${(AREA_LABELS as any)[v.area] ?? v.area}</span>
        </div>

        <div class="info-grid">
          <div class="info-item">
            <div class="info-label">Para</div>
            <div class="info-value">${v.beneficiaryName || v.buyerName}</div>
          </div>
          <div class="info-item">
            <div class="info-label">De parte de</div>
            <div class="info-value">${v.buyerName}</div>
          </div>
          <div class="info-item">
            <div class="info-label">Emitido</div>
            <div class="info-value">${format(new Date(v.issuedAt), "dd/MM/yyyy")}</div>
          </div>
          <div class="info-item">
            <div class="info-label">Vence</div>
            <div class="info-value">${expiryDisplay}</div>
          </div>
        </div>

        <div class="code-block">${v.voucherCode}</div>
        <div class="footer">Este voucher es personal e intransferible · Para canjearlo presentarlo en recepción</div>
      </div>
      <script>
        (function () {
          function printWhenReady() {
            var imgs = Array.prototype.slice.call(document.images);
            Promise.all(imgs.map(function (img) {
              if (img.complete && img.naturalWidth > 0) return Promise.resolve();
              return new Promise(function (resolve) {
                img.addEventListener("load", resolve);
                img.addEventListener("error", resolve);
              });
            })).then(function () {
              setTimeout(function () { window.print(); }, 50);
            });
          }
          if (document.readyState === "complete") printWhenReady();
          else window.addEventListener("load", printWhenReady);
        })();
      </script>
    </body>
    </html>
  `;

  const w = window.open("", "_blank");
  if (!w) return;
  w.document.write(html);
  w.document.close();
}

// ── Historial (aplicaciones + eventos de auditoría) ─────────────────────────────

const EVENT_TYPE_LABELS: Record<string, string> = {
  emitido: "Emitido", facturado: "Facturado", reservado: "Reservado",
  liberado: "Liberado", utilizado: "Utilizado", cancelado: "Cancelado",
  reactivado: "Reactivado", vencido: "Vencido", editado: "Editado",
};

function VoucherHistory({ voucherId }: { voucherId: string }) {
  const { data, isLoading } = useQuery<{ applications: GiftVoucherApplication[]; events: GiftVoucherEvent[] }>({
    queryKey: ["/api/gift-vouchers", voucherId, "history"],
    queryFn: async () => {
      const res = await fetch(`/api/gift-vouchers/${voucherId}/history`, { credentials: "include" });
      return res.json();
    },
  });

  if (isLoading) return <p className="text-xs text-muted-foreground">Cargando historial...</p>;
  const events = data?.events || [];
  if (events.length === 0) return <p className="text-xs text-muted-foreground">Sin eventos registrados</p>;

  return (
    <div>
      <p className="text-muted-foreground text-xs uppercase tracking-wide mb-2">Historial</p>
      <div className="space-y-1.5 max-h-48 overflow-y-auto">
        {events.map((e) => (
          <div key={e.id} className="text-xs flex items-start gap-2 border-l-2 border-muted pl-2">
            <div className="flex-1">
              <span className="font-medium">{EVENT_TYPE_LABELS[e.eventType] || e.eventType}</span>
              {e.fieldChanged && <span className="text-muted-foreground"> — {e.fieldChanged}: "{e.oldValue ?? "—"}" → "{e.newValue ?? "—"}"</span>}
              {e.reason && <span className="text-muted-foreground"> — {e.reason}</span>}
              <div className="text-muted-foreground">{formatHotelDateTime(e.performedAt)}{e.performedBy ? ` · ${e.performedBy}` : ""}</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Detail Dialog ──────────────────────────────────────────────────────────────

function DetailDialog({ voucher, onClose }: { voucher: GiftVoucher | null; onClose: () => void }) {
  if (!voucher) return null;
  return (
    <Dialog open={!!voucher} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Gift className="h-5 w-5 text-primary" />
            Detalle del Voucher
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4 text-sm">
          <div className="flex items-center justify-between">
            <span className="font-mono text-lg font-bold">{voucher.voucherCode}</span>
            <StatusBadge status={voucher.status as Status} />
          </div>
          <Separator />
          <div className="grid grid-cols-2 gap-3">
            <div><p className="text-muted-foreground text-xs uppercase tracking-wide">Área</p><p className="font-medium">{AREA_LABELS[voucher.area as Area] ?? voucher.area}</p></div>
            <div><p className="text-muted-foreground text-xs uppercase tracking-wide">Tipo</p><p className="font-medium">{voucher.valueType === "monetario" ? "Monetario" : "Descriptivo"}</p></div>
            <div className="col-span-2"><p className="text-muted-foreground text-xs uppercase tracking-wide">Descripción</p><p className="font-medium">{voucher.description}</p></div>
            {voucher.valueAmount && (
              <div><p className="text-muted-foreground text-xs uppercase tracking-wide">Valor</p><p className="font-medium text-green-600 font-mono">${fmtMoney(voucher.valueAmount)}</p></div>
            )}
          </div>
          <Separator />
          <div className="grid grid-cols-2 gap-3">
            <div><p className="text-muted-foreground text-xs uppercase tracking-wide">Comprador</p><p className="font-medium">{voucher.buyerName}</p></div>
            {voucher.beneficiaryName && <div><p className="text-muted-foreground text-xs uppercase tracking-wide">Beneficiario</p><p className="font-medium">{voucher.beneficiaryName}</p></div>}
            {voucher.buyerPhone && <div><p className="text-muted-foreground text-xs uppercase tracking-wide">Teléfono</p><p>{voucher.buyerPhone}</p></div>}
            {voucher.buyerEmail && <div><p className="text-muted-foreground text-xs uppercase tracking-wide">Email</p><p>{voucher.buyerEmail}</p></div>}
          </div>
          <Separator />
          <div className="grid grid-cols-2 gap-3">
            <div><p className="text-muted-foreground text-xs uppercase tracking-wide">Emitido</p><p>{formatHotelDateTime(voucher.issuedAt)}</p></div>
            <div><p className="text-muted-foreground text-xs uppercase tracking-wide">Vence</p><p>{voucher.expiresAt ? format(new Date(voucher.expiresAt + "T12:00:00"), "dd/MM/yyyy") : "—"}</p></div>
            {voucher.pricePaid && <div><p className="text-muted-foreground text-xs uppercase tracking-wide">Precio cobrado</p><p className="font-mono">${fmtMoney(voucher.pricePaid)}</p></div>}
            {voucher.paymentMethod && <div><p className="text-muted-foreground text-xs uppercase tracking-wide">Forma de pago</p><p className="capitalize">{voucher.paymentMethod}</p></div>}
          </div>
          {voucher.status === "utilizado" && (
            <>
              <Separator />
              <div className="grid grid-cols-2 gap-3">
                {voucher.usedAt && <div><p className="text-muted-foreground text-xs uppercase tracking-wide">Usado el</p><p>{formatHotelDateTime(voucher.usedAt)}</p></div>}
                {voucher.usedBy && <div><p className="text-muted-foreground text-xs uppercase tracking-wide">Canjeado por</p><p>{voucher.usedBy}</p></div>}
                {voucher.usedNotes && <div className="col-span-2"><p className="text-muted-foreground text-xs uppercase tracking-wide">Notas de uso</p><p>{voucher.usedNotes}</p></div>}
              </div>
            </>
          )}
          {voucher.status === "cancelado" && (
            <>
              <Separator />
              <div className="grid grid-cols-2 gap-3">
                {voucher.cancelledAt && <div><p className="text-muted-foreground text-xs uppercase tracking-wide">Cancelado el</p><p>{formatHotelDateTime(voucher.cancelledAt)}</p></div>}
                {voucher.cancelledBy && <div><p className="text-muted-foreground text-xs uppercase tracking-wide">Cancelado por</p><p>{voucher.cancelledBy}</p></div>}
                {voucher.cancelReason && <div className="col-span-2"><p className="text-muted-foreground text-xs uppercase tracking-wide">Motivo</p><p>{voucher.cancelReason}</p></div>}
              </div>
            </>
          )}
          {voucher.notes && (
            <>
              <Separator />
              <div><p className="text-muted-foreground text-xs uppercase tracking-wide">Notas internas</p><p>{voucher.notes}</p></div>
            </>
          )}
          <Separator />
          <VoucherHistory voucherId={voucher.id} />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => printVoucher(voucher)} data-testid="button-print-detail">
            <Printer className="h-4 w-4 mr-2" /> Imprimir
          </Button>
          <Button variant="outline" onClick={onClose}>Cerrar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Main Page ──────────────────────────────────────────────────────────────────

export default function GiftVouchersPage() {
  const { toast } = useToast();

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [areaFilter, setAreaFilter] = useState("all");
  const [showCreate, setShowCreate] = useState(false);
  const [selectedForUse, setSelectedForUse] = useState<GiftVoucher | null>(null);
  const [selectedForDetail, setSelectedForDetail] = useState<GiftVoucher | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<GiftVoucher | null>(null);
  const [cancelReason, setCancelReason] = useState("");

  const { data: vouchers = [], isLoading } = useQuery<GiftVoucher[]>({
    queryKey: ["/api/gift-vouchers", statusFilter, areaFilter, search],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (statusFilter !== "all") params.set("status", statusFilter);
      if (areaFilter !== "all") params.set("area", areaFilter);
      if (search.trim()) params.set("search", search.trim());
      const res = await fetch(`/api/gift-vouchers?${params.toString()}`, { credentials: "include" });
      if (!res.ok) throw new Error("Error cargando vouchers");
      return res.json();
    },
  });

  const cancelMutation = useMutation({
    mutationFn: async ({ id, reason }: { id: string; reason: string }) => {
      const res = await apiRequest("POST", `/api/gift-vouchers/${id}/cancel`, { reason });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body?.error || "Error al cancelar el voucher");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/gift-vouchers"] });
      toast({ title: "Voucher cancelado" });
      setDeleteTarget(null);
      setCancelReason("");
    },
    onError: (err: any) => toast({ title: err?.message || "Error al cancelar el voucher", variant: "destructive" }),
  });

  // Stats
  const totalActivos    = vouchers.filter((v) => ["activo", "activo_facturado"].includes(v.status)).length;
  const totalReservados = vouchers.filter((v) => v.status === "reservado").length;
  const totalUtilizados = vouchers.filter((v) => v.status === "utilizado").length;
  const totalValor      = vouchers
    .filter((v) => ["activo", "activo_facturado", "reservado"].includes(v.status) && v.valueAmount)
    .reduce((acc, v) => acc + Number(v.valueAmount), 0);

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-primary/10">
            <Gift className="h-6 w-6 text-primary" />
          </div>
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Vouchers Regalo</h1>
            <p className="text-sm text-muted-foreground">Gestión de gift vouchers para huéspedes y clientes</p>
          </div>
        </div>
        <Button onClick={() => setShowCreate(true)} data-testid="button-new-voucher">
          <Plus className="h-4 w-4 mr-2" />
          Nuevo Voucher
        </Button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-4 pb-3">
            <p className="text-xs text-muted-foreground uppercase tracking-wide">Activos</p>
            <p className="text-2xl font-bold text-green-600">{totalActivos}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-3">
            <p className="text-xs text-muted-foreground uppercase tracking-wide">Reservados</p>
            <p className="text-2xl font-bold text-blue-600">{totalReservados}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-3">
            <p className="text-xs text-muted-foreground uppercase tracking-wide">Utilizados</p>
            <p className="text-2xl font-bold text-gray-500">{totalUtilizados}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-3">
            <p className="text-xs text-muted-foreground uppercase tracking-wide">Valor en circulación</p>
            <p className="text-2xl font-bold font-mono">${fmtMoney(totalValor)}</p>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Buscar por código, comprador, beneficiario..."
            className="pl-9"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            data-testid="input-search"
          />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-40" data-testid="select-status-filter">
            <Filter className="h-4 w-4 mr-2 text-muted-foreground" />
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos los estados</SelectItem>
            <SelectItem value="activo">Activo</SelectItem>
            <SelectItem value="activo_facturado">Activo Facturado</SelectItem>
            <SelectItem value="reservado">Reservado</SelectItem>
            <SelectItem value="utilizado">Utilizado</SelectItem>
            <SelectItem value="vencido">Vencido</SelectItem>
            <SelectItem value="cancelado">Cancelado</SelectItem>
          </SelectContent>
        </Select>
        <Select value={areaFilter} onValueChange={setAreaFilter}>
          <SelectTrigger className="w-40" data-testid="select-area-filter">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todas las áreas</SelectItem>
            <SelectItem value="alojamiento">Alojamiento</SelectItem>
            <SelectItem value="restaurant">Restaurant</SelectItem>
            <SelectItem value="spa">Spa</SelectItem>
            <SelectItem value="otro">Otro</SelectItem>
          </SelectContent>
        </Select>
        {(statusFilter !== "all" || areaFilter !== "all" || search) && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => { setStatusFilter("all"); setAreaFilter("all"); setSearch(""); }}
            data-testid="button-clear-filters"
          >
            Limpiar filtros
          </Button>
        )}
      </div>

      {/* Table */}
      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-8 text-center text-muted-foreground">Cargando vouchers...</div>
          ) : vouchers.length === 0 ? (
            <div className="p-12 text-center">
              <Gift className="h-12 w-12 mx-auto text-muted-foreground/30 mb-3" />
              <p className="text-muted-foreground">No hay vouchers para los filtros aplicados</p>
              {statusFilter === "all" && areaFilter === "all" && !search && (
                <Button className="mt-4" onClick={() => setShowCreate(true)} data-testid="button-create-first">
                  <Plus className="h-4 w-4 mr-2" /> Crear el primer voucher
                </Button>
              )}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-muted/40">
                    <th className="text-left px-4 py-3 font-medium text-muted-foreground">Código</th>
                    <th className="text-left px-4 py-3 font-medium text-muted-foreground">Estado</th>
                    <th className="text-left px-4 py-3 font-medium text-muted-foreground">Área</th>
                    <th className="text-left px-4 py-3 font-medium text-muted-foreground">Descripción</th>
                    <th className="text-left px-4 py-3 font-medium text-muted-foreground">Beneficiario</th>
                    <th className="text-right px-4 py-3 font-medium text-muted-foreground">Valor</th>
                    <th className="text-left px-4 py-3 font-medium text-muted-foreground">Emitido</th>
                    <th className="text-left px-4 py-3 font-medium text-muted-foreground">Vence</th>
                    <th className="px-4 py-3"></th>
                  </tr>
                </thead>
                <tbody>
                  {vouchers.map((v) => (
                    <tr key={v.id} className="border-b hover:bg-muted/30 transition-colors" data-testid={`row-voucher-${v.id}`}>
                      <td className="px-4 py-3 font-mono font-semibold text-primary">{v.voucherCode}</td>
                      <td className="px-4 py-3"><StatusBadge status={v.status as Status} /></td>
                      <td className="px-4 py-3 text-muted-foreground">{AREA_LABELS[v.area as Area] ?? v.area}</td>
                      <td className="px-4 py-3 max-w-[200px] truncate" title={v.description}>{v.description}</td>
                      <td className="px-4 py-3">{v.beneficiaryName || v.buyerName}</td>
                      <td className="px-4 py-3 text-right font-mono">
                        {v.valueType === "monetario" && v.valueAmount
                          ? `$${fmtMoney(v.valueAmount)}`
                          : <span className="text-muted-foreground text-xs">—</span>
                        }
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">{format(new Date(v.issuedAt), "dd/MM/yy")}</td>
                      <td className="px-4 py-3 text-muted-foreground">
                        {v.expiresAt
                          ? format(new Date(v.expiresAt + "T12:00:00"), "dd/MM/yy")
                          : <span className="text-xs">—</span>
                        }
                      </td>
                      <td className="px-4 py-3">
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon" className="h-8 w-8" data-testid={`button-actions-${v.id}`}>
                              <MoreHorizontal className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem onClick={() => setSelectedForDetail(v)}>
                              <Eye className="h-4 w-4 mr-2" /> Ver detalle
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => printVoucher(v)}>
                              <Printer className="h-4 w-4 mr-2" /> Imprimir voucher
                            </DropdownMenuItem>
                            {["activo", "activo_facturado"].includes(v.status) && (
                              <DropdownMenuItem onClick={() => setSelectedForUse(v)}>
                                <CheckCircle2 className="h-4 w-4 mr-2 text-green-600" /> Marcar como usado
                              </DropdownMenuItem>
                            )}
                            {!["utilizado", "cancelado"].includes(v.status) && (
                              <DropdownMenuItem
                                className="text-red-600"
                                onClick={() => setDeleteTarget(v)}
                              >
                                <Ban className="h-4 w-4 mr-2" /> Cancelar voucher
                              </DropdownMenuItem>
                            )}
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div className="px-4 py-2 text-xs text-muted-foreground border-t">
                {vouchers.length} voucher{vouchers.length !== 1 ? "s" : ""}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Dialogs */}
      <CreateVoucherDialog open={showCreate} onClose={() => setShowCreate(false)} />
      <MarkUsedDialog voucher={selectedForUse} onClose={() => setSelectedForUse(null)} />
      <DetailDialog voucher={selectedForDetail} onClose={() => setSelectedForDetail(null)} />

      <AlertDialog open={!!deleteTarget} onOpenChange={(v) => { if (!v) { setDeleteTarget(null); setCancelReason(""); } }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Cancelar voucher?</AlertDialogTitle>
            <AlertDialogDescription>
              El voucher <strong>{deleteTarget?.voucherCode}</strong> queda cancelado, no se borra — sigue visible con su historial completo.
              {" "}Se puede reactivar más adelante si hace falta.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="py-2">
            <Label htmlFor="cancel-reason" className="text-sm">Motivo de la cancelación *</Label>
            <Textarea
              id="cancel-reason"
              value={cancelReason}
              onChange={(e) => setCancelReason(e.target.value)}
              placeholder="Ej: el cliente pidió reembolso, error de carga..."
              rows={2}
              data-testid="input-cancel-reason"
            />
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-cancel-delete">Volver</AlertDialogCancel>
            <AlertDialogAction
              className="bg-red-600 hover:bg-red-700"
              disabled={!cancelReason.trim() || cancelMutation.isPending}
              onClick={() => deleteTarget && cancelMutation.mutate({ id: deleteTarget.id, reason: cancelReason.trim() })}
              data-testid="button-confirm-delete"
            >
              Cancelar voucher
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
