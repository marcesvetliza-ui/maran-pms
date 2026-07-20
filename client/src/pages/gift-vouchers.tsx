import { useState } from "react";
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
  Trash2,
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
import { Separator } from "@/components/ui/separator";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import type { GiftVoucher } from "@shared/schema";
import { insertGiftVoucherSchema } from "@shared/schema";

// ── Types ──────────────────────────────────────────────────────────────────────

type Status = "activo" | "usado" | "vencido" | "cancelado";
type Area = "alojamiento" | "restaurant" | "spa" | "otro";
type ValueType = "monetario" | "descriptivo";

const AREA_LABELS: Record<Area, string> = {
  alojamiento: "Alojamiento",
  restaurant: "Restaurant",
  spa: "Spa",
  otro: "Otro",
};

const STATUS_CONFIG: Record<Status, { label: string; color: string; icon: any }> = {
  activo:    { label: "Activo",    color: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400",  icon: CheckCircle2 },
  usado:     { label: "Usado",     color: "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400",         icon: CheckCircle2 },
  vencido:   { label: "Vencido",   color: "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400", icon: Clock },
  cancelado: { label: "Cancelado", color: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400",          icon: XCircle },
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
      const res = await apiRequest("POST", `/api/gift-vouchers/${voucher!.id}/use`, { usedNotes: notes });
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
                <p><span className="font-medium">Valor:</span> ${Number(voucher.valueAmount).toLocaleString("es-AR")}</p>
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
    ? `$${Number(v.valueAmount).toLocaleString("es-AR")}`
    : v.description;

  const expiryDisplay = v.expiresAt
    ? format(new Date(v.expiresAt + "T12:00:00"), "dd 'de' MMMM 'de' yyyy", { locale: es })
    : "Sin vencimiento";

  const html = `
    <!DOCTYPE html>
    <html lang="es">
    <head>
      <meta charset="UTF-8" />
      <title>Voucher ${v.voucherCode}</title>
      <style>
        @page { size: A5 landscape; margin: 10mm; }
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body { font-family: 'Segoe UI', Arial, sans-serif; background: #fff; color: #222; }
        .card {
          border: 3px solid #1a1a2e;
          border-radius: 16px;
          padding: 24px 32px;
          max-width: 180mm;
          position: relative;
          overflow: hidden;
        }
        .watermark {
          position: absolute;
          top: 50%; left: 50%;
          transform: translate(-50%,-50%) rotate(-20deg);
          font-size: 96px;
          opacity: 0.04;
          font-weight: 900;
          pointer-events: none;
          white-space: nowrap;
        }
        .header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 20px; }
        .hotel-name { font-size: 22px; font-weight: 800; color: #1a1a2e; line-height: 1.2; }
        .hotel-sub { font-size: 11px; color: #666; }
        .gift-label {
          background: #1a1a2e;
          color: white;
          padding: 6px 14px;
          border-radius: 20px;
          font-size: 13px;
          font-weight: 600;
          letter-spacing: 0.05em;
        }
        .value-block {
          text-align: center;
          margin: 16px 0;
          padding: 14px;
          background: linear-gradient(135deg, #1a1a2e 0%, #2d3561 100%);
          border-radius: 12px;
          color: white;
        }
        .value-num { font-size: 42px; font-weight: 900; }
        .value-desc { font-size: 15px; opacity: 0.85; margin-top: 2px; }
        .area-badge {
          display: inline-block;
          background: #f0f4ff;
          color: #2d3561;
          padding: 3px 10px;
          border-radius: 8px;
          font-size: 12px;
          font-weight: 600;
          margin-bottom: 6px;
        }
        .desc-text { font-size: 14px; color: #444; margin-bottom: 12px; }
        .info-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin-top: 14px; }
        .info-item { font-size: 12px; }
        .info-label { color: #888; font-size: 11px; text-transform: uppercase; letter-spacing: 0.05em; }
        .info-value { font-weight: 600; color: #222; }
        .code-block {
          margin-top: 18px;
          padding: 10px;
          background: #f5f5f5;
          border-radius: 8px;
          text-align: center;
          font-family: monospace;
          font-size: 18px;
          font-weight: 800;
          letter-spacing: 0.12em;
          color: #1a1a2e;
        }
        .footer { margin-top: 16px; font-size: 10px; color: #aaa; text-align: center; }
      </style>
    </head>
    <body>
      <div class="card">
        <div class="watermark">REGALO</div>
        <div class="header">
          <div>
            <div class="hotel-name">Maran Suites &amp; Towers</div>
            <div class="hotel-sub">Hotel Boutique · Buenos Aires</div>
          </div>
          <div class="gift-label">🎁 VOUCHER REGALO</div>
        </div>

        <div class="value-block">
          ${v.valueType === "monetario" && v.valueAmount
            ? `<div class="value-num">$${Number(v.valueAmount).toLocaleString("es-AR")}</div>`
            : `<div class="value-desc" style="font-size:18px;font-weight:700;">${v.description}</div>`
          }
          ${v.valueType === "monetario" ? `<div class="value-desc">${v.description}</div>` : ""}
        </div>

        <div>
          <span class="area-badge">${(AREA_LABELS as any)[v.area] ?? v.area}</span>
          <div class="desc-text"></div>
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
    </body>
    </html>
  `;

  const w = window.open("", "_blank");
  if (!w) return;
  w.document.write(html);
  w.document.close();
  w.onload = () => { w.print(); };
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
              <div><p className="text-muted-foreground text-xs uppercase tracking-wide">Valor</p><p className="font-medium text-green-600 font-mono">${Number(voucher.valueAmount).toLocaleString("es-AR")}</p></div>
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
            <div><p className="text-muted-foreground text-xs uppercase tracking-wide">Emitido</p><p>{format(new Date(voucher.issuedAt), "dd/MM/yyyy HH:mm")}</p></div>
            <div><p className="text-muted-foreground text-xs uppercase tracking-wide">Vence</p><p>{voucher.expiresAt ? format(new Date(voucher.expiresAt + "T12:00:00"), "dd/MM/yyyy") : "—"}</p></div>
            {voucher.pricePaid && <div><p className="text-muted-foreground text-xs uppercase tracking-wide">Precio cobrado</p><p className="font-mono">${Number(voucher.pricePaid).toLocaleString("es-AR")}</p></div>}
            {voucher.paymentMethod && <div><p className="text-muted-foreground text-xs uppercase tracking-wide">Forma de pago</p><p className="capitalize">{voucher.paymentMethod}</p></div>}
          </div>
          {voucher.status === "usado" && (
            <>
              <Separator />
              <div className="grid grid-cols-2 gap-3">
                {voucher.usedAt && <div><p className="text-muted-foreground text-xs uppercase tracking-wide">Usado el</p><p>{format(new Date(voucher.usedAt), "dd/MM/yyyy HH:mm")}</p></div>}
                {voucher.usedBy && <div><p className="text-muted-foreground text-xs uppercase tracking-wide">Canjeado por</p><p>{voucher.usedBy}</p></div>}
                {voucher.usedNotes && <div className="col-span-2"><p className="text-muted-foreground text-xs uppercase tracking-wide">Notas de uso</p><p>{voucher.usedNotes}</p></div>}
              </div>
            </>
          )}
          {voucher.notes && (
            <>
              <Separator />
              <div><p className="text-muted-foreground text-xs uppercase tracking-wide">Notas internas</p><p>{voucher.notes}</p></div>
            </>
          )}
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

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      await apiRequest("DELETE", `/api/gift-vouchers/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/gift-vouchers"] });
      toast({ title: "Voucher eliminado" });
      setDeleteTarget(null);
    },
    onError: () => toast({ title: "Error al eliminar", variant: "destructive" }),
  });

  // Stats
  const totalActivos = vouchers.filter((v) => v.status === "activo").length;
  const totalUsados  = vouchers.filter((v) => v.status === "usado").length;
  const totalValor   = vouchers
    .filter((v) => v.status === "activo" && v.valueAmount)
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
      <div className="grid grid-cols-3 gap-4">
        <Card>
          <CardContent className="pt-4 pb-3">
            <p className="text-xs text-muted-foreground uppercase tracking-wide">Activos</p>
            <p className="text-2xl font-bold text-green-600">{totalActivos}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-3">
            <p className="text-xs text-muted-foreground uppercase tracking-wide">Canjeados</p>
            <p className="text-2xl font-bold text-gray-500">{totalUsados}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-3">
            <p className="text-xs text-muted-foreground uppercase tracking-wide">Valor en circulación</p>
            <p className="text-2xl font-bold font-mono">${totalValor.toLocaleString("es-AR")}</p>
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
            <SelectItem value="usado">Usado</SelectItem>
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
                          ? `$${Number(v.valueAmount).toLocaleString("es-AR")}`
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
                            {v.status === "activo" && (
                              <DropdownMenuItem onClick={() => setSelectedForUse(v)}>
                                <CheckCircle2 className="h-4 w-4 mr-2 text-green-600" /> Marcar como usado
                              </DropdownMenuItem>
                            )}
                            <DropdownMenuItem
                              className="text-red-600"
                              onClick={() => setDeleteTarget(v)}
                            >
                              <Trash2 className="h-4 w-4 mr-2" /> Eliminar
                            </DropdownMenuItem>
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

      <AlertDialog open={!!deleteTarget} onOpenChange={(v) => !v && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar voucher?</AlertDialogTitle>
            <AlertDialogDescription>
              Se eliminará el voucher <strong>{deleteTarget?.voucherCode}</strong> permanentemente. Esta acción no se puede deshacer.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-cancel-delete">Cancelar</AlertDialogCancel>
            <AlertDialogAction
              className="bg-red-600 hover:bg-red-700"
              onClick={() => deleteTarget && deleteMutation.mutate(deleteTarget.id)}
              data-testid="button-confirm-delete"
            >
              Eliminar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
