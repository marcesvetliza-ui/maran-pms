import { useMemo, useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useAuth } from "@/App";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { fmtMoney } from "@/lib/utils";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Receipt, ArrowLeft } from "lucide-react";
import { EmitirFacturaDialog, NotaCreditoDialog } from "@/pages/billing";
import { InvoiceDialog, type Supplier, type AccountingAccount } from "@/pages/purchase-invoices";
import { InternalMovementForm, TransferStockForm } from "@/pages/inventory";

// Notas de Crédito/Débito siempre deben asociarse a una factura existente
// (exigencia de ARCA) — nunca se emiten como comprobante nuevo. El backend
// ya lo exige en POST /api/billing/invoices (ver server/billing/routes.ts),
// así que acá se resuelven con el mismo flujo de "buscar factura → asociar"
// que ya usa el botón por área (emitir-comprobante-button.tsx).
const NC_ND_TIPOS = new Set(["NCA", "NCB", "NCM", "NDA", "NDB", "NDM"]);

// ── Áreas ──────────────────────────────────────────────────────────────────────
// Mismos identificadores de área que ya usa EmitirComprobanteButton
// (client/src/components/emitir-comprobante-button.tsx: "recepcion", "spa").

type AreaId = "recepcion" | "restaurant" | "spa" | "events" | "compras" | "inventario";

const AREAS: { id: AreaId; label: string; roles: string[] }[] = [
  { id: "recepcion", label: "Alojamiento", roles: ["admin", "manager", "reception", "jefe_recepcion", "comercial"] },
  { id: "restaurant", label: "Restaurant", roles: ["admin", "manager", "restaurant", "jefe_recepcion", "comercial"] },
  { id: "spa", label: "Spa", roles: ["admin", "manager", "spa", "jefe_recepcion", "comercial"] },
  { id: "events", label: "Eventos", roles: ["admin", "manager", "events", "jefe_recepcion", "comercial"] },
  { id: "compras", label: "Compras", roles: ["admin", "manager", "resp_deposito", "resp_administracion"] },
  { id: "inventario", label: "Inventario", roles: ["admin", "manager", "resp_deposito", "resp_administracion"] },
];

// ── Operaciones y tipos ──────────────────────────────────────────────────────

type Operacion = "venta" | "compra" | "movimiento";

const OPERACIONES: { id: Operacion; label: string; areas: AreaId[] }[] = [
  { id: "venta", label: "Venta", areas: ["recepcion", "restaurant", "spa", "events"] },
  { id: "compra", label: "Compra", areas: ["compras"] },
  { id: "movimiento", label: "Movimiento Interno", areas: ["inventario"] },
];

// Tipos de venta fiscales, comunes a toda área (el punto de venta/condición de
// IVA sigue las mismas reglas que ya aplica EmitirFacturaDialog).
const TIPOS_VENTA: { value: string; label: string }[] = [
  { value: "FA", label: "Factura A" },
  { value: "FB", label: "Factura B" },
  { value: "FM", label: "Factura MiPyME A" },
  { value: "ticket", label: "Ticket" },
  { value: "NCA", label: "Nota de Crédito A" },
  { value: "NCB", label: "Nota de Crédito B" },
  { value: "NCM", label: "Nota de Crédito MiPyME" },
  { value: "NDA", label: "Nota de Débito A" },
  { value: "NDB", label: "Nota de Débito B" },
  { value: "NDM", label: "Nota de Débito MiPyME" },
];

// Vouchers no fiscales que YA existen en el sistema (NON_FISCAL_TIPOS_SET en
// billing.tsx) — no son un tipo "Voucher" genérico nuevo, cada uno solo
// corresponde a su área.
const VOUCHERS_POR_AREA: Partial<Record<AreaId, { value: string; label: string }[]>> = {
  recepcion: [{ value: "cierre_habitacion", label: "Voucher Habitaciones" }],
  spa: [{ value: "cierre_spa", label: "Voucher SPA" }],
  restaurant: [
    { value: "voucher_justo", label: "Voucher Justo" },
    { value: "voucher_pedidos_ya", label: "Voucher PedidosYa" },
  ],
};

const TIPOS_COMPRA: { value: string; label: string }[] = [
  { value: "FACT-A", label: "Factura A" },
  { value: "FACT-B", label: "Factura B" },
  { value: "FACT-C", label: "Factura C" },
  { value: "NC-A", label: "Nota de Crédito A" },
  { value: "NC-B", label: "Nota de Crédito B" },
  { value: "NC-C", label: "Nota de Crédito C" },
  { value: "REMITO", label: "Remito" },
];

const TIPOS_MOVIMIENTO: { value: string; label: string }[] = [
  { value: "desayuno", label: "Desayuno" },
  { value: "evento", label: "Evento" },
  { value: "desperdicio", label: "Desperdicio" },
  { value: "transferencia", label: "Transferencia entre depósitos" },
  { value: "otro", label: "Otro" },
];

function tiposParaSeleccion(operacion: Operacion, area: AreaId | ""): { value: string; label: string }[] {
  if (operacion === "venta") {
    if (!area) return TIPOS_VENTA;
    return [...TIPOS_VENTA, ...(VOUCHERS_POR_AREA[area] ?? [])];
  }
  if (operacion === "compra") return TIPOS_COMPRA;
  if (operacion === "movimiento") return TIPOS_MOVIMIENTO;
  return [];
}

export default function EmitirComprobantePage() {
  const { user } = useAuth();
  const role = user?.role || "";

  // Mismas queries que ya usan EmitirComprobanteButton (config de venta) y
  // PurchaseInvoicesPage (proveedores/cuentas contables para compra) — no se
  // duplica lógica de negocio, solo se reutiliza el mismo contrato de datos.
  const { data: billingConfig } = useQuery<any>({ queryKey: ["/api/billing/config"] });

  const { data: rawSuppliers = [] } = useQuery<any[]>({ queryKey: ["/api/accounting-suppliers"] });
  const suppliers: Supplier[] = useMemo(() => rawSuppliers.map((r: any) => ({
    id: r.id, razonSocial: r.razon_social, cuit: r.cuit, condicionIva: r.condicion_iva,
    alicuotaIibb: parseFloat(r.alicuota_iibb || "0"),
    alicuotaGanancias: parseFloat(r.alicuota_ganancias || "0"),
    alicuotaIva: parseFloat(r.alicuota_iva || "0"),
    cuentaContableId: r.cuenta_contable_id ? parseInt(r.cuenta_contable_id) : undefined,
  })), [rawSuppliers]);

  const { data: rawAccounts = [] } = useQuery<any[]>({ queryKey: ["/api/accounting-accounts"] });
  const accounts: AccountingAccount[] = useMemo(() => rawAccounts.map((r: any) => ({
    id: r.id, codigo: r.codigo, nombre: r.nombre, tipo: r.tipo,
  })), [rawAccounts]);

  const areasPermitidas = useMemo(
    () => AREAS.filter((a) => a.roles.includes(role)),
    [role],
  );

  const [area, setArea] = useState<AreaId | "">(areasPermitidas.length === 1 ? areasPermitidas[0].id : "");
  const [operacion, setOperacion] = useState<Operacion | "">("");
  const [tipo, setTipo] = useState<string>("");

  const operacionesDisponibles = useMemo(
    () => OPERACIONES.filter((op) => !area || op.areas.includes(area as AreaId)),
    [area],
  );

  const tipos = useMemo(
    () => (operacion ? tiposParaSeleccion(operacion, area) : []),
    [operacion, area],
  );

  const areaFija = areasPermitidas.length === 1;
  const seleccionCompleta = !!area && !!operacion && !!tipo;

  const resetSeleccion = () => {
    setOperacion("");
    setTipo("");
  };

  if (areasPermitidas.length === 0) {
    return (
      <div className="flex flex-col gap-6 p-6">
        <Card className="max-w-2xl">
          <CardHeader>
            <CardTitle>Emitir Comprobante</CardTitle>
            <CardDescription>Tu usuario no tiene ningún área habilitada para emitir comprobantes.</CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6 p-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2" data-testid="text-emitir-comprobante-title">
          <Receipt className="h-7 w-7 text-primary" />
          Emitir Comprobante
        </h1>
        <p className="text-muted-foreground">Centro único para ventas, compras y movimientos internos de mercadería</p>
      </div>

      <Card className="max-w-5xl">
        <CardContent className="pt-6 space-y-6">
          {!seleccionCompleta ? (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="space-y-2">
                <label className="text-sm font-medium">Área</label>
                <Select
                  value={area}
                  onValueChange={(v) => { setArea(v as AreaId); setOperacion(""); setTipo(""); }}
                  disabled={areaFija}
                >
                  <SelectTrigger data-testid="select-area">
                    <SelectValue placeholder="Elegir área..." />
                  </SelectTrigger>
                  <SelectContent>
                    {areasPermitidas.map((a) => (
                      <SelectItem key={a.id} value={a.id}>{a.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium">Operación</label>
                <Select
                  value={operacion}
                  onValueChange={(v) => { setOperacion(v as Operacion); setTipo(""); }}
                  disabled={!area}
                >
                  <SelectTrigger data-testid="select-operacion">
                    <SelectValue placeholder="Elegir operación..." />
                  </SelectTrigger>
                  <SelectContent>
                    {operacionesDisponibles.map((op) => (
                      <SelectItem key={op.id} value={op.id}>{op.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium">Tipo</label>
                <Select value={tipo} onValueChange={setTipo} disabled={!operacion}>
                  <SelectTrigger data-testid="select-tipo">
                    <SelectValue placeholder="Elegir tipo..." />
                  </SelectTrigger>
                  <SelectContent>
                    {tipos.map((t) => (
                      <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="flex items-center gap-2 flex-wrap">
                <Button variant="ghost" size="sm" onClick={resetSeleccion} data-testid="button-volver-seleccion">
                  <ArrowLeft className="h-4 w-4 mr-1" /> Cambiar selección
                </Button>
                <Badge variant="secondary">{AREAS.find((a) => a.id === area)?.label}</Badge>
                <Badge variant="secondary">{OPERACIONES.find((o) => o.id === operacion)?.label}</Badge>
                <Badge>{tipos.find((t) => t.value === tipo)?.label}</Badge>
              </div>

              {operacion === "venta" && !NC_ND_TIPOS.has(tipo) && (
                <EmitirFacturaDialog
                  embedded
                  open
                  onClose={resetSeleccion}
                  config={billingConfig}
                  allowedTipos={[tipo]}
                  cashArea={area}
                  showPaymentMethod
                  operationKey={`centro-comprobantes-venta-${area}-${tipo}`}
                />
              )}

              {operacion === "venta" && NC_ND_TIPOS.has(tipo) && (
                <NotaCreditoDebitoSearch area={area as AreaId} tipo={tipo} onClose={resetSeleccion} />
              )}

              {operacion === "compra" && (
                <InvoiceDialog
                  embedded
                  unifiedLayout
                  open
                  onClose={resetSeleccion}
                  suppliers={suppliers}
                  accounts={accounts}
                />
              )}

              {operacion === "movimiento" && tipo === "transferencia" && (
                <TransferStockForm
                  embedded
                  open
                  onClose={resetSeleccion}
                />
              )}

              {operacion === "movimiento" && tipo !== "transferencia" && (
                <InternalMovementForm
                  embedded
                  open
                  onClose={resetSeleccion}
                  initialMotivo={tipo}
                />
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// ── Notas de Crédito/Débito: buscar la factura origen antes de emitir ──────────
// Mismo criterio que emitir-comprobante-button.tsx: solo facturas activas
// (no anuladas) de los tipos que ARCA acepta como comprobante original.
function NotaCreditoDebitoSearch({ area, tipo, onClose }: { area: AreaId; tipo: string; onClose: () => void }) {
  const [search, setSearch] = useState("");
  const [selectedInvoiceId, setSelectedInvoiceId] = useState<number | null>(null);
  const esNotaCredito = tipo.startsWith("NC");

  const { data: invoices = [] } = useQuery<any[]>({
    queryKey: ["/api/billing/invoices", { area, cliente: search }],
    queryFn: () =>
      fetch(`/api/billing/invoices?area=${encodeURIComponent(area)}${search ? `&cliente=${encodeURIComponent(search)}` : ""}`, { credentials: "include" }).then(r => r.json()),
  });

  const candidatos = (invoices || []).filter((i: any) =>
    i.estado !== "anulada" && ["FA", "FB", "FT", "FM"].includes(i.tipo_comprobante)
  );

  if (selectedInvoiceId !== null) {
    return esNotaCredito
      ? <NotaCreditoDialog invoiceId={selectedInvoiceId} onClose={onClose} />
      : <NotaDebitoCentroDialog invoiceId={selectedInvoiceId} onClose={onClose} />;
  }

  return (
    <div className="space-y-3">
      <Label htmlFor="buscar-comprobante-nc-nd">Buscar la factura original por cliente</Label>
      <Input
        id="buscar-comprobante-nc-nd"
        placeholder="Nombre, razón social, CUIT..."
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        data-testid="input-buscar-comprobante-nc-nd"
      />
      <div className="max-h-72 overflow-y-auto space-y-1.5 rounded-md border p-1.5">
        {candidatos.length === 0 && (
          <p className="text-sm text-muted-foreground text-center py-6">
            {search ? "Sin comprobantes encontrados" : "Escribí para buscar la factura original"}
          </p>
        )}
        {candidatos.map((inv: any) => (
          <button
            key={inv.id}
            type="button"
            className="w-full text-left border rounded-md p-2.5 text-sm hover:bg-muted/50"
            onClick={() => setSelectedInvoiceId(inv.id)}
            data-testid={`row-invoice-nc-nd-${inv.id}`}
          >
            <div className="flex justify-between">
              <span>{inv.tipo_comprobante} {String(inv.punto_venta).padStart(4, "0")}-{String(inv.numero).padStart(8, "0")}</span>
              <span className="font-medium">${fmtMoney(inv.monto_total)}</span>
            </div>
            <div className="text-xs text-muted-foreground">{inv.cliente_razon_social}</div>
          </button>
        ))}
      </div>
    </div>
  );
}

// Nota de Débito genérica sobre una factura existente — pega contra el mismo
// endpoint que ya exige factura origen por diseño (POST /invoices/:id/nota-debito,
// ver server/billing/routes.ts). No confundir con NotaDebitoDialog de
// PrefacturaDialog.tsx, que es un flujo distinto (reversión de una NC ya
// emitida, acoplado a una reserva) — acá el caso es "ND directa sobre una
// factura", igual que ya resuelve NotaCreditoDialog para las NC.
function NotaDebitoCentroDialog({ invoiceId, onClose }: { invoiceId: number; onClose: () => void }) {
  const { toast } = useToast();
  const { data: invoice } = useQuery<any>({
    queryKey: ["/api/billing/invoices", invoiceId],
    queryFn: () => fetch(`/api/billing/invoices/${invoiceId}`, { credentials: "include" }).then((r) => r.json()),
    enabled: !!invoiceId,
  });
  const [motivo, setMotivo] = useState("");
  const [monto, setMonto] = useState("");

  const saldoPendiente = invoice
    ? Math.max(0, (parseFloat(invoice.monto_total) || 0) - (parseFloat(invoice.monto_acreditado || "0") || 0))
    : 0;
  const montoNum = parseFloat(monto) || 0;
  const montoInvalido = !monto || montoNum <= 0 || montoNum > saldoPendiente + 0.01;

  const mutation = useMutation({
    mutationFn: (body: { motivo: string; monto: number }) => apiRequest("POST", `/api/billing/invoices/${invoiceId}/nota-debito`, body),
    onSuccess: async (res: any) => {
      const data = await res.json();
      queryClient.invalidateQueries({ queryKey: ["/api/billing/invoices"] });
      toast({ title: "Nota de Débito emitida", description: `${data.tipoComprobante ?? data.tipo_comprobante} N° ${String(data.puntoVenta ?? data.punto_venta).padStart(4, "0")}-${String(data.numero).padStart(8, "0")}` });
      onClose();
    },
    onError: (e: any) => toast({ title: "Error", description: e?.message || "No se pudo emitir la Nota de Débito", variant: "destructive" }),
  });

  if (!invoice) return null;

  return (
    <Dialog open={!!invoiceId} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle>Emitir Nota de Débito</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div className="bg-muted/30 rounded-lg p-3 text-sm space-y-1">
            <div className="font-medium">Factura original:</div>
            <div className="text-muted-foreground text-xs">
              {invoice.tipo_comprobante} {String(invoice.punto_venta).padStart(4, "0")}-{String(invoice.numero).padStart(8, "0")} — {invoice.cliente_razon_social}
            </div>
            <div className="text-muted-foreground text-xs">
              Total: ${fmtMoney(invoice.monto_total)} · Saldo pendiente: ${fmtMoney(saldoPendiente)}
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="nd-motivo">Motivo *</Label>
            <Input id="nd-motivo" value={motivo} onChange={(e) => setMotivo(e.target.value)} data-testid="input-nd-motivo" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="nd-monto">Importe *</Label>
            <Input
              id="nd-monto"
              type="number"
              min="0"
              max={saldoPendiente}
              step="0.01"
              value={monto}
              onChange={(e) => setMonto(e.target.value)}
              data-testid="input-nd-monto"
            />
            {montoInvalido && monto && (
              <p className="text-xs text-destructive">El importe debe ser mayor a $0 y no superar el saldo pendiente.</p>
            )}
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button
            disabled={montoInvalido || !motivo.trim() || mutation.isPending}
            onClick={() => mutation.mutate({ motivo: motivo.trim(), monto: montoNum })}
            data-testid="button-submit-nd"
          >
            Emitir Nota de Débito
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
