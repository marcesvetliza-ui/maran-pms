import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/App";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Receipt, ArrowLeft } from "lucide-react";
import { EmitirFacturaDialog } from "@/pages/billing";
import { InvoiceDialog, type Supplier, type AccountingAccount } from "@/pages/purchase-invoices";
import { InternalMovementForm, TransferStockForm } from "@/pages/inventory";

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

              {operacion === "venta" && (
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
