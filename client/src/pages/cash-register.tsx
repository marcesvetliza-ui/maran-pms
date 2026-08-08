import { useState, useEffect } from "react";
import { fmtMoney } from "@/lib/utils";
import { useAuth } from "@/App";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  DollarSign,
  Clock,
  Plus,
  Printer,
  History,
  Eye,
  CircleDot,
  XCircle,
  ClipboardList,
  Ban,
  AlertTriangle,
  BarChart3,
  CreditCard,
  Moon,
  RefreshCw,
  CheckCircle,
  ChevronsUpDown,
  Building2,
  Plane,
  User,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";

type CashConfig = {
  area: string;
  areaLabel: string;
  shiftsPerDay: number;
  isActive: boolean;
};

type CashShift = {
  id: string;
  area: string;
  shiftNumber: number;
  openedBy?: string | null;
  closedBy?: string;
  openedAt: string;
  closedAt?: string;
  notes?: string;
  status: string;
  autoCreado?: boolean;
  turnoAnteriorId?: string | null;
  turnoTipo?: string | null;
};

type CashMovement = {
  id: number;
  shiftId: number;
  area: string;
  sourceType: string;
  sourceLabel?: string;
  paymentMethod: string;
  amount: number;
  movementType: string;
  receiptType?: string;
  description?: string;
  createdAt: string;
  anulado?: boolean;
  motivoAnulacion?: string;
};

type ShiftDetail = {
  shift: CashShift;
  movements: CashMovement[];
  summary: Record<string, { count: number; total: number }>;
};

const PAYMENT_METHOD_MAP: Record<string, string> = {
  cash: "Efectivo",
  debit_card: "Débito",
  credit_card: "Crédito",
  transfer: "Transferencia",
  mercadopago: "MercadoPago",
  current_account: "Cuenta Corriente",
  cuenta_corriente: "Cuenta Corriente",
  room_charge: "Cargo a Habitación",
  cuenta_habitacion: "Cargo a Habitación",
  efectivo: "Efectivo",
  tarjeta_credito: "Crédito",
  tarjeta_debito: "Débito",
  transferencia: "Transferencia",
};

const NON_CASH_METHODS = new Set(["room_charge", "cuenta_habitacion", "current_account", "cuenta_corriente"]);

const AREA_COLORS: Record<string, string> = {
  reception: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400",
  restaurant: "bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-400",
  spa: "bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-400",
  events: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400",
};

const AREA_LABEL_MAP: Record<string, string> = {
  reception: "Recepción",
  restaurant: "Restaurante",
  spa: "SPA",
  events: "Eventos",
};

const DIAS_SEMANA = ["Domingo", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"];
const TURNO_TIPO_OPTIONS = [
  { value: "mañana", label: "Mañana", hours: "06:00 – 14:00" },
  { value: "tarde",  label: "Tarde",  hours: "14:00 – 22:00" },
  { value: "noche",  label: "Noche",  hours: "22:00 – 06:00" },
];

function formatShiftLabel(shift: CashShift): string {
  const d = new Date(shift.openedAt);
  const day = DIAS_SEMANA[d.getDay()];
  if (shift.turnoTipo) {
    const tipo = TURNO_TIPO_OPTIONS.find(t => t.value === shift.turnoTipo);
    return `${day} ${tipo ? tipo.label : shift.turnoTipo}`;
  }
  return `Turno #${shift.shiftNumber}`;
}

function formatCurrency(value: number): string {
  return "$ " + Math.round(value).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ".");
}

function formatTime(dateStr: string): string {
  const d = new Date(dateStr);
  return d.toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit" });
}

function formatDate(dateStr: string): string {
  const d = new Date(dateStr);
  return d.toLocaleDateString("es-AR");
}

function formatDateTime(dateStr: string): string {
  if (!dateStr) return "-";
  const d = new Date(dateStr);
  const isCurrentYear = d.getFullYear() === new Date().getFullYear();
  const datepart = isCurrentYear
    ? d.toLocaleDateString("es-AR", { day: "2-digit", month: "2-digit" })
    : d.toLocaleDateString("es-AR", { day: "2-digit", month: "2-digit", year: "numeric" });
  const timepart = d.toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit" });
  return `${datepart} ${timepart}`;
}

const METHOD_ALIASES: Record<string, string> = {
  efectivo: "cash",
  tarjeta_credito: "credit_card",
  tarjeta_debito: "debit_card",
  transferencia: "transfer",
  cuenta_corriente: "current_account",
  cuenta_habitacion: "room_charge",
};
function normalizePaymentMethod(method: string): string {
  return METHOD_ALIASES[method] ?? method;
}

function buildSummaryFromMovements(movements: CashMovement[]) {
  const summary: Record<string, { count: number; total: number; items: CashMovement[] }> = {};
  for (const m of movements) {
    if (m.anulado) continue;
    const key = normalizePaymentMethod(m.paymentMethod);
    if (!summary[key]) {
      summary[key] = { count: 0, total: 0, items: [] };
    }
    summary[key].items.push(m);
    if (m.movementType === "informational") continue;
    summary[key].count += 1;
    const amt = parseFloat(String(m.amount)) || 0;
    summary[key].total += m.movementType === "income" ? amt : -amt;
  }
  return summary;
}

function SummaryTable({ movements }: { movements: CashMovement[] }) {
  const [expanded, setExpanded] = useState<string | null>(null);
  const summary = buildSummaryFromMovements(movements);
  const totalGeneral = Object.values(summary).reduce((s, v) => s + v.total, 0);
  const totalTx = Object.values(summary).reduce((s, v) => s + v.count, 0);

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Método</TableHead>
          <TableHead className="text-center">Transacciones</TableHead>
          <TableHead className="text-right">Total</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {Object.entries(summary).map(([method, data]) => (
          <>
            <TableRow
              key={method}
              className={`cursor-pointer hover:bg-muted/40 transition-colors ${NON_CASH_METHODS.has(method) ? "text-muted-foreground italic" : ""}`}
              onClick={() => setExpanded(expanded === method ? null : method)}
            >
              <TableCell>
                <span className="flex items-center gap-1">
                  {expanded === method
                    ? <ChevronUp className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                    : <ChevronDown className="h-3.5 w-3.5 text-muted-foreground shrink-0" />}
                  {PAYMENT_METHOD_MAP[method] || method}
                  {NON_CASH_METHODS.has(method) && <span className="ml-1 text-xs not-italic">(no efectivo)</span>}
                </span>
              </TableCell>
              <TableCell className="text-center">
                <span className="underline decoration-dotted cursor-pointer">{data.count}</span>
              </TableCell>
              <TableCell className="text-right">{formatCurrency(data.total)}</TableCell>
            </TableRow>
            {expanded === method && (
              <TableRow key={`${method}-detail`}>
                <TableCell colSpan={3} className="p-0 bg-muted/20">
                  <div className="px-4 py-2 space-y-0.5">
                    {data.items.map((m, i) => (
                      <div key={m.id ?? i} className="flex items-center gap-3 py-1 text-xs border-b border-muted/50 last:border-0">
                        <span className="text-muted-foreground w-11 shrink-0 tabular-nums">{formatTime(m.createdAt)}</span>
                        <span className="flex-1 truncate font-medium">
                          {(m as any).sourceLabel || (m as any).description || "—"}
                        </span>
                        <span className={`shrink-0 font-semibold tabular-nums ${m.movementType === "expense" ? "text-red-600" : m.movementType === "informational" ? "text-muted-foreground line-through" : ""}`}>
                          {m.movementType === "expense" ? "- " : ""}{formatCurrency(Math.abs(parseFloat(String(m.amount))))}
                        </span>
                      </div>
                    ))}
                  </div>
                </TableCell>
              </TableRow>
            )}
          </>
        ))}
        <TableRow className="font-bold border-t-2">
          <TableCell>TOTAL GENERAL</TableCell>
          <TableCell className="text-center">{totalTx}</TableCell>
          <TableCell className="text-right">{formatCurrency(totalGeneral)}</TableCell>
        </TableRow>
      </TableBody>
    </Table>
  );
}

function printClosingSummary(
  shift: CashShift,
  movements: CashMovement[],
  efectivoSistema: number,
  efectivoContado: number
) {
  const activos = movements.filter(m => !m.anulado);
  const anulados = movements.filter(m => m.anulado);
  const summary = buildSummaryFromMovements(movements);
  const totalGeneral = Object.values(summary).reduce((s, v) => s + v.total, 0);
  const totalTx = Object.values(summary).reduce((s, v) => s + v.count, 0);
  const areaLabel = AREA_LABEL_MAP[shift.area] || shift.area;
  const diferencia = efectivoContado - efectivoSistema;
  const shiftDateObj = new Date(shift.openedAt);
  const shiftDateStr = shiftDateObj.toLocaleDateString("es-AR", { weekday: "long", day: "2-digit", month: "2-digit", year: "numeric" });
  const shiftDateShort = shiftDateObj.toLocaleDateString("es-AR", { day: "2-digit", month: "2-digit", year: "numeric" });

  // Group active movements by payment method (normalized to avoid duplicates)
  const byMethod: Record<string, CashMovement[]> = {};
  for (const m of activos) {
    const key = normalizePaymentMethod(m.paymentMethod);
    if (!byMethod[key]) byMethod[key] = [];
    byMethod[key].push(m);
  }

  const methodBoxes = Object.entries(byMethod).map(([method, movs]) => {
    const label = PAYMENT_METHOD_MAP[method] || method;
    const total = movs.filter(m => m.movementType !== "informational").reduce((s, m) => s + (m.movementType === "income" ? 1 : -1) * parseFloat(String(m.amount)), 0);
    const isEfectivo = method === "cash";
    const borderColor = isEfectivo ? "#2b6cb0" : "#553c9a";
    const headerBg = isEfectivo ? "#ebf8ff" : "#faf5ff";
    const rows = movs.map(m => {
      const amt = parseFloat(String(m.amount));
      const esInformational = m.movementType === "informational";
      const esIngreso = m.movementType === "income";
      return `<tr style="${esInformational ? "opacity:0.65;font-style:italic;" : ""}">
        <td style="padding:5px 8px;border-bottom:1px solid #eee;font-size:11px;color:#666">${formatTime(m.createdAt)}</td>
        <td style="padding:5px 8px;border-bottom:1px solid #eee;font-size:12px">${m.description || (m as any).sourceLabel || "-"}</td>
        <td style="padding:5px 8px;border-bottom:1px solid #eee;font-size:11px;text-align:center">
          ${esInformational
            ? `<span style="background:#e2e8f0;color:#64748b;padding:1px 6px;border-radius:3px;font-size:10px">Solo registro</span>`
            : `<span style="background:${esIngreso ? "#c6f6d5" : "#fed7d7"};color:${esIngreso ? "#276749" : "#9b2c2c"};padding:1px 6px;border-radius:3px;font-size:10px">${esIngreso ? "Ingreso" : "Egreso"}</span>`
          }
        </td>
        <td style="padding:5px 8px;border-bottom:1px solid #eee;font-size:12px;text-align:right;font-weight:${esIngreso ? "600" : "normal"};color:${esInformational ? "#94a3b8" : esIngreso ? "#276749" : "#9b2c2c"}">${esIngreso ? "" : ""}${formatCurrency(amt)}</td>
      </tr>`;
    }).join("");

    const diferenciaEfectivo = isEfectivo ? `
      <div style="margin-top:8px;padding:8px;background:${Math.abs(diferencia) > 0 ? "#fff5f5" : "#f0fff4"};border:1px solid ${Math.abs(diferencia) > 0 ? "#fc8181" : "#9ae6b4"};border-radius:4px">
        <div style="display:flex;justify-content:space-between;font-size:11px"><span>Sistema:</span><span>${formatCurrency(efectivoSistema)}</span></div>
        <div style="display:flex;justify-content:space-between;font-size:11px"><span>Contado:</span><span>${formatCurrency(efectivoContado)}</span></div>
        <div style="display:flex;justify-content:space-between;font-size:12px;font-weight:bold;color:${diferencia !== 0 ? "#c53030" : "#276749"};margin-top:4px">
          <span>Diferencia:</span><span>${diferencia > 0 ? "+" : ""}${formatCurrency(diferencia)}</span>
        </div>
      </div>` : "";

    return `
    <div style="border:2px solid ${borderColor};border-radius:8px;margin-bottom:16px;overflow:hidden;page-break-inside:avoid">
      <div style="background:${headerBg};padding:10px 14px;border-bottom:1px solid ${borderColor};display:flex;justify-content:space-between;align-items:center">
        <span style="font-weight:bold;font-size:14px;color:${borderColor}">${label}</span>
        <span style="font-weight:bold;font-size:15px">${formatCurrency(total)}</span>
      </div>
      <div style="padding:8px 0">
        <table style="width:100%;border-collapse:collapse">
          <thead>
            <tr style="background:#f9f9f9">
              <th style="padding:4px 8px;font-size:10px;text-align:left;color:#888;font-weight:600;text-transform:uppercase">Hora</th>
              <th style="padding:4px 8px;font-size:10px;text-align:left;color:#888;font-weight:600;text-transform:uppercase">Descripción</th>
              <th style="padding:4px 8px;font-size:10px;text-align:center;color:#888;font-weight:600;text-transform:uppercase">Tipo</th>
              <th style="padding:4px 8px;font-size:10px;text-align:right;color:#888;font-weight:600;text-transform:uppercase">Monto</th>
            </tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
      ${isEfectivo ? `<div style="padding:0 12px 12px 12px">${diferenciaEfectivo}</div>` : ""}
    </div>`;
  }).join("");

  const anulSection = anulados.length > 0 ? `
<div style="border:1px solid #ccc;border-radius:6px;margin-top:8px;overflow:hidden">
  <div style="background:#f5f5f5;padding:8px 12px;font-weight:bold;font-size:12px;color:#666">
    Movimientos Anulados (${anulados.length})
  </div>
  <table style="width:100%;border-collapse:collapse">
    <thead><tr style="background:#fafafa">
      <th style="padding:5px 8px;font-size:10px;text-align:left;border-bottom:1px solid #eee">Hora</th>
      <th style="padding:5px 8px;font-size:10px;text-align:left;border-bottom:1px solid #eee">Descripción</th>
      <th style="padding:5px 8px;font-size:10px;text-align:left;border-bottom:1px solid #eee">Método</th>
      <th style="padding:5px 8px;font-size:10px;text-align:right;border-bottom:1px solid #eee">Monto</th>
      <th style="padding:5px 8px;font-size:10px;text-align:left;border-bottom:1px solid #eee">Motivo</th>
    </tr></thead>
    <tbody>${anulados.map(m => `<tr style="color:#aaa">
      <td style="padding:5px 8px;font-size:11px;border-bottom:1px solid #f0f0f0;text-decoration:line-through">${formatTime(m.createdAt)}</td>
      <td style="padding:5px 8px;font-size:11px;border-bottom:1px solid #f0f0f0;text-decoration:line-through">${m.description || (m as any).sourceLabel || "-"}</td>
      <td style="padding:5px 8px;font-size:11px;border-bottom:1px solid #f0f0f0">${PAYMENT_METHOD_MAP[m.paymentMethod] || m.paymentMethod}</td>
      <td style="padding:5px 8px;font-size:11px;border-bottom:1px solid #f0f0f0;text-align:right;text-decoration:line-through">${formatCurrency(Math.abs(parseFloat(String(m.amount))))}</td>
      <td style="padding:5px 8px;font-size:10px;border-bottom:1px solid #f0f0f0;color:#999">${(m as any).motivoAnulacion || "-"}</td>
    </tr>`).join("")}</tbody>
  </table>
</div>` : "";

  const html = `<!DOCTYPE html><html><head><title>Cierre de Turno - ${areaLabel}</title>
<style>
  body{font-family:Arial,Helvetica,sans-serif;padding:20px;max-width:680px;margin:0 auto;color:#222}
  @media print{body{padding:10px}}
</style>
</head><body>
<div style="text-align:center;margin-bottom:16px;padding-bottom:12px;border-bottom:2px solid #333">
  <div style="font-size:11px;color:#888;text-transform:uppercase;letter-spacing:1px">Maran Suites & Towers</div>
  <div style="font-size:20px;font-weight:bold;margin:4px 0">Cierre de Turno</div>
  <div style="font-size:14px;color:#555">${areaLabel} — ${shift.turnoTipo ? formatShiftLabel(shift) : `Turno #${shift.shiftNumber}`}</div>
  <div style="font-size:13px;font-weight:600;color:#444;margin-top:4px">${shiftDateStr}</div>
</div>

<div style="display:flex;justify-content:space-between;margin-bottom:16px;font-size:12px;gap:16px">
  <div>
    <div style="color:#888;font-size:10px;text-transform:uppercase;margin-bottom:2px">Abierto por</div>
    <div><strong>${shift.openedBy || "-"}</strong> ${formatTime(shift.openedAt)}</div>
  </div>
  <div>
    <div style="color:#888;font-size:10px;text-transform:uppercase;margin-bottom:2px">Cerrado por</div>
    <div><strong>${shift.closedBy || "-"}</strong> ${shift.closedAt ? formatTime(shift.closedAt) : "-"}</div>
  </div>
  <div style="text-align:right">
    <div style="color:#888;font-size:10px;text-transform:uppercase;margin-bottom:2px">Total general</div>
    <div style="font-size:16px;font-weight:bold">${formatCurrency(totalGeneral)}</div>
    <div style="color:#888;font-size:10px">${totalTx} transacciones</div>
  </div>
</div>

<div style="font-size:12px;font-weight:600;color:#444;text-transform:uppercase;letter-spacing:0.5px;margin-bottom:10px;padding-bottom:4px;border-bottom:1px solid #ddd">
  Detalle por Forma de Pago
</div>

${methodBoxes}

${anulSection}

<div style="text-align:center;margin-top:20px;padding-top:10px;border-top:1px solid #eee;font-size:10px;color:#aaa">
  Generado el ${new Date().toLocaleString("es-AR")} | Maran Suites & Towers
</div>
<script>window.onload=function(){window.print();}<\/script>
</body></html>`;

  const w = window.open("", "_blank");
  if (w) { w.document.write(html); w.document.close(); }
}

function AreaTab({ area, config }: { area: string; config: CashConfig }) {
  const { user } = useAuth();
  const isAdmin = ["admin", "manager", "jefe_recepcion", "resp_administracion"].includes(user?.role ?? "");
  const { toast } = useToast();
  const [openShiftDialog, setOpenShiftDialog] = useState(false);
  const [closeShiftDialog, setCloseShiftDialog] = useState(false);
  const [closeStep, setCloseStep] = useState<1 | 2>(1);
  const [movementDialog, setMovementDialog] = useState(false);
  const [tomarTurnoDialog, setTomarTurnoDialog] = useState(false);
  const [openedBy, setOpenedBy] = useState("");

  type UserBasic = { id: string; username: string; fullName?: string | null; role: string };
  const { data: allUsers = [] } = useQuery<UserBasic[]>({ queryKey: ["/api/staff/users"] });
  const AREA_TO_ROLE: Record<string, string> = { reception: "reception", restaurant: "restaurant", spa: "spa", events: "events" };
  const areaRole = AREA_TO_ROLE[area] ?? area;
  const relevantUsers = allUsers.filter(u => u.role === areaRole || u.role === "admin" || u.role === "manager" || u.role === "jefe_recepcion" || u.role === "resp_administracion");
  const getDisplayName = (u: UserBasic) => u.fullName || u.username;
  const [openNotes, setOpenNotes] = useState("");
  const [turnoTipoOpen, setTurnoTipoOpen] = useState("tarde");
  const [turnoTipoTomar, setTurnoTipoTomar] = useState("tarde");
  const [turnoTipoClose, setTurnoTipoClose] = useState("tarde");
  const [closedBy, setClosedBy] = useState("");
  const [closeNotes, setCloseNotes] = useState("");
  const [operadorSiguiente, setOperadorSiguiente] = useState("");
  const [expandedMovId, setExpandedMovId] = useState<number | null>(null);
  const [billetes20000, setBilletes20000] = useState(0);
  const [billetes10000, setBilletes10000] = useState(0);
  const [billetes2000, setBilletes2000] = useState(0);
  const [billetes1000, setBilletes1000] = useState(0);
  const [billetes500, setBilletes500] = useState(0);
  const [billetes200, setBilletes200] = useState(0);
  const [billetes100, setBilletes100] = useState(0);
  const [billetes50, setBilletes50] = useState(0);
  const [billetes20, setBilletes20] = useState(0);
  const [billetes10, setBilletes10] = useState(0);
  const [monedas, setMonedas] = useState(0);
  const [extrasConteo, setExtrasConteo] = useState<{ label: string; amount: number }[]>([]);
  const [movType, setMovType] = useState("income");
  const [movDesc, setMovDesc] = useState("");
  const [movMethod, setMovMethod] = useState("cash");
  const [movAmount, setMovAmount] = useState("");
  const [movReceipt, setMovReceipt] = useState("");
  const [movReceiptNumber, setMovReceiptNumber] = useState("");
  const [movProveedor, setMovProveedor] = useState("");
  const [movExpenseCategory, setMovExpenseCategory] = useState("");
  // Cobro cuenta corriente
  const [movCCEntityType, setMovCCEntityType] = useState<"company" | "agency" | "guest">("company");
  const [movCCEntityId, setMovCCEntityId] = useState("");
  const [movCCEntityName, setMovCCEntityName] = useState("");
  const [movCCOpen, setMovCCOpen] = useState(false);
  const [movCCSearch, setMovCCSearch] = useState("");
  const [closingSummaryData, setClosingSummaryData] = useState<{ shift: CashShift; movements: CashMovement[]; turnoNuevo?: CashShift; efectivoContado: number; efectivoSistema: number } | null>(null);

  const efectivoContado =
    billetes20000 * 20000 + billetes10000 * 10000 + billetes2000 * 2000 +
    billetes1000 * 1000 + billetes500 * 500 + billetes200 * 200 +
    billetes100 * 100 + billetes50 * 50 + billetes20 * 20 + billetes10 * 10 +
    monedas + extrasConteo.reduce((s, e) => s + e.amount, 0);

  function resetCloseDialog() {
    setCloseStep(1);
    setClosedBy("");
    setCloseNotes("");
    setTurnoTipoClose(currentShift?.turnoTipo || "tarde");
    setOperadorSiguiente("");
    setBilletes20000(0); setBilletes10000(0); setBilletes2000(0);
    setBilletes1000(0); setBilletes500(0); setBilletes200(0);
    setBilletes100(0); setBilletes50(0); setBilletes20(0); setBilletes10(0);
    setMonedas(0); setExtrasConteo([]);
  }

  const { data: currentShift, isLoading: shiftLoading } = useQuery<CashShift | null>({
    queryKey: ["/api/cash/shifts/current", `?area=${area}`],
    queryFn: async () => {
      const res = await fetch(`/api/cash/shifts/current?area=${area}`, { credentials: "include" });
      if (!res.ok) {
        if (res.status === 404) return null;
        throw new Error("Error loading shift");
      }
      const data = await res.json();
      return data || null;
    },
  });

  const { data: movements = [], isLoading: movementsLoading } = useQuery<CashMovement[]>({
    queryKey: ["/api/cash/movements", `?shiftId=${currentShift?.id}`],
    queryFn: async () => {
      if (!currentShift?.id) return [];
      const res = await fetch(`/api/cash/movements?shiftId=${currentShift.id}`, { credentials: "include" });
      if (!res.ok) throw new Error("Error loading movements");
      return res.json();
    },
    enabled: !!currentShift?.id,
  });

  const { data: changelogHoy = [] } = useQuery<any[]>({
    queryKey: ["/api/reservations/changelog/hoy"],
    queryFn: async () => {
      const res = await fetch("/api/reservations/changelog/hoy", { credentials: "include" });
      if (!res.ok) return [];
      return res.json();
    },
  });

  // Para cobro CC
  const { data: accountSummaryCC } = useQuery<{
    companies: { id: string; name: string; balance: number }[];
    agencies: { id: string; name: string; balance: number }[];
    guests: { id: string; name: string; balance: number }[];
  }>({
    queryKey: ["/api/account-summary"],
    enabled: movementDialog,
  });

  const ccEntities = (() => {
    if (!accountSummaryCC) return [];
    if (movCCEntityType === "company") return [...accountSummaryCC.companies].sort((a, b) => a.name.localeCompare(b.name, "es"));
    if (movCCEntityType === "agency") return [...accountSummaryCC.agencies].sort((a, b) => a.name.localeCompare(b.name, "es"));
    return [...(accountSummaryCC.guests ?? [])].sort((a, b) => a.name.localeCompare(b.name, "es"));
  })();

  const isEfectivo = (method: string) => method === "cash" || method === "efectivo";
  const efectivoSistema = movements.filter(m => !m.anulado && isEfectivo(m.paymentMethod) && m.movementType !== "informational").reduce((s, m) => s + (m.movementType === "income" ? 1 : -1) * parseFloat(String(m.amount)), 0);
  const diferencia = efectivoContado - efectivoSistema;

  const openShiftMutation = useMutation({
    mutationFn: async () => {
      return apiRequest("POST", "/api/cash/shifts/open", {
        area,
        openedBy,
        notes: openNotes || undefined,
        turnoTipo: turnoTipoOpen || undefined,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/cash/shifts/current"] });
      const tipoLabel = TURNO_TIPO_OPTIONS.find(t => t.value === turnoTipoOpen)?.label || turnoTipoOpen;
      toast({ title: "Turno abierto", description: `Turno ${tipoLabel} abierto para ${config.areaLabel}` });
      setOpenShiftDialog(false);
      setOpenedBy(user?.fullName || user?.username || "");
      setOpenNotes("");
    },
    onError: (err: any) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  const isCobro = movType === "cobro_cc";

  const addMovementMutation = useMutation({
    mutationFn: async () => {
      if (!isAdmin) {
        return apiRequest("POST", "/api/cash/movements", {
          shiftId: currentShift!.id,
          area,
          sourceType: "manual",
          sourceLabel: "Inicio de caja",
          paymentMethod: "cash",
          amount: parseFloat(movAmount),
          movementType: "income",
          description: "Inicio de caja",
        });
      }
      const label = isCobro ? `Cobro CC — ${movCCEntityName}` : movDesc;
      return apiRequest("POST", "/api/cash/movements", {
        shiftId: currentShift!.id,
        area,
        sourceType: isCobro ? "cobro_cc" : "manual",
        sourceLabel: label,
        paymentMethod: movMethod,
        amount: parseFloat(movAmount),
        movementType: movType === "expense" ? "expense" : "income",
        receiptType: movReceipt || undefined,
        receiptNumber: movReceiptNumber || undefined,
        proveedor: movProveedor || undefined,
        expenseCategory: movExpenseCategory || undefined,
        description: label,
        ...(isCobro ? { ccEntityType: movCCEntityType, ccEntityId: movCCEntityId, ccEntityName: movCCEntityName } : {}),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/cash/movements"] });
      queryClient.invalidateQueries({ queryKey: ["/api/account-summary"] });
      queryClient.invalidateQueries({ queryKey: ["/api/account-movements"] });
      toast({ title: "Movimiento registrado", description: "El movimiento fue agregado correctamente" });
      setMovementDialog(false);
      setMovType("income");
      setMovDesc("");
      setMovMethod("cash");
      setMovAmount("");
      setMovReceipt("");
      setMovCCEntityId("");
      setMovCCEntityName("");
      setMovCCEntityType("company");
    },
    onError: (err: any) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  const [anularMovTarget, setAnularMovTarget] = useState<number | null>(null);
  const [anularMovMotivo, setAnularMovMotivo] = useState("");
  const [anularMovForce, setAnularMovForce] = useState(false);

  const anularMovementMutation = useMutation({
    mutationFn: async ({ id, motivo, force }: { id: number; motivo: string; force?: boolean }) =>
      apiRequest("PATCH", `/api/cash/movements/${id}/anular`, { motivoAnulacion: motivo || "Corrección admin", forceAdmin: force }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/cash/movements"] });
      setAnularMovTarget(null);
      setAnularMovMotivo("");
      setAnularMovForce(false);
      toast({ title: "Movimiento anulado", description: "El movimiento fue anulado correctamente" });
    },
    onError: (err: any) => {
      toast({ title: "Error al anular", description: err.message, variant: "destructive" });
      console.error("Anular movement error:", err);
    },
  });

  const closeShiftMutation = useMutation({
    mutationFn: async () => {
      return apiRequest("POST", `/api/cash/shifts/${currentShift!.id}/close`, {
        closedBy,
        efectivoContado,
        operadorSiguiente: (operadorSiguiente === "_ninguno" || !operadorSiguiente.trim()) ? null : operadorSiguiente.trim(),
        notes: closeNotes || undefined,
        turnoTipo: turnoTipoClose || undefined,
      });
    },
    onSuccess: (result: any) => {
      const sysEfect = movements.filter(m => !m.anulado && isEfectivo(m.paymentMethod) && m.movementType !== "informational").reduce((s, m) => s + (m.movementType === "income" ? 1 : -1) * parseFloat(String(m.amount)), 0);
      setClosingSummaryData({ shift: { ...currentShift!, closedBy, closedAt: new Date().toISOString() }, movements, turnoNuevo: result.turnoNuevo, efectivoContado, efectivoSistema: sysEfect });
      queryClient.invalidateQueries({ queryKey: ["/api/cash/shifts/current"] });
      queryClient.invalidateQueries({ queryKey: ["/api/cash/movements"] });
      queryClient.invalidateQueries({ queryKey: ["/api/cash/summary"] });
      queryClient.invalidateQueries({ queryKey: ["/api/cash/shifts/autocreados"] });
      toast({ title: "Turno cerrado", description: `Turno #${currentShift!.shiftNumber} cerrado. Nuevo turno abierto automáticamente.` });
      setCloseShiftDialog(false);
      resetCloseDialog();
    },
    onError: (err: any) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  const tomarTurnoMutation = useMutation({
    mutationFn: async ({ operador, turnoTipo }: { operador: string; turnoTipo: string }) => {
      return apiRequest("PATCH", `/api/cash/shifts/${currentShift!.id}/tomar`, { operador, turnoTipo });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/cash/shifts/current"] });
      queryClient.invalidateQueries({ queryKey: ["/api/cash/shifts/autocreados"] });
      toast({ title: "Turno tomado", description: "El operador fue asignado al turno activo." });
      setTomarTurnoDialog(false);
      setOpenedBy(user?.fullName || user?.username || "");
      setTurnoTipoTomar("tarde");
    },
    onError: (err: any) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  if (shiftLoading) {
    return (
      <div className="space-y-4 p-4">
        <Skeleton className="h-20 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  return (
    <div className="space-y-6 p-4">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-2">
          <CardTitle className="flex items-center gap-2">
            <CircleDot className="h-5 w-5" />
            Estado del Turno - {config.areaLabel}
          </CardTitle>
          {currentShift && (
            <Button
              size="sm"
              variant="destructive"
              onClick={() => setCloseShiftDialog(true)}
              data-testid={`btn-close-shift-header-${area}`}
            >
              <XCircle className="h-3.5 w-3.5 mr-1.5" />
              Cerrar turno
            </Button>
          )}
        </CardHeader>
        <CardContent>
          {!currentShift ? (
            <div className="flex flex-col items-center gap-4 py-8">
              <p className="text-muted-foreground" data-testid={`text-no-shift-${area}`}>
                No hay turno abierto para {config.areaLabel}
              </p>
              <Button
                className="bg-green-600 hover:bg-green-700 text-white no-default-hover-elevate"
                onClick={() => setOpenShiftDialog(true)}
                data-testid={`btn-open-shift-${area}`}
              >
                <Plus className="h-4 w-4 mr-2" />
                Abrir Turno
              </Button>
            </div>
          ) : (
            <div className="flex flex-wrap items-center gap-3">
              {currentShift.autoCreado && !currentShift.openedBy ? (
                <Badge className="bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400">
                  ⚠ Turno autocreado — sin operador
                </Badge>
              ) : (
                <Badge className="bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400">
                  Turno abierto
                </Badge>
              )}
              <span className="text-sm text-muted-foreground flex items-center gap-1">
                <Clock className="h-4 w-4" />
                {formatTime(currentShift.openedAt)}
                {currentShift.openedBy ? ` — ${currentShift.openedBy}` : ""}
              </span>
              <span className="text-sm font-medium" data-testid={`text-shift-info-${area}`}>
                {formatShiftLabel(currentShift)}
                <span className="ml-1 text-xs text-muted-foreground font-normal">#{currentShift.shiftNumber}</span>
              </span>
              {(!currentShift.openedBy || currentShift.autoCreado) && (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setTomarTurnoDialog(true)}
                  data-testid={`btn-tomar-turno-${area}`}
                  className="text-yellow-700 border-yellow-400 hover:bg-yellow-50"
                >
                  Tomar turno
                </Button>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {currentShift && (
        <>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between gap-2">
              <CardTitle className="flex items-center gap-2">
                <DollarSign className="h-5 w-5" />
                Movimientos
              </CardTitle>
              <Button
                onClick={() => setMovementDialog(true)}
                data-testid={`btn-manual-movement-${area}`}
              >
                <Plus className="h-4 w-4 mr-2" />
                {isAdmin ? "Registrar movimiento manual" : "Registrar fondo inicial"}
              </Button>
            </CardHeader>
            <CardContent>
              {movementsLoading ? (
                <div className="space-y-2">
                  {[...Array(3)].map((_, i) => (
                    <Skeleton key={i} className="h-12 w-full" />
                  ))}
                </div>
              ) : movements.length === 0 ? (
                <p className="text-center text-muted-foreground py-8">No hay movimientos registrados</p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Fecha / Hora</TableHead>
                      <TableHead>Origen</TableHead>
                      <TableHead>Descripción</TableHead>
                      <TableHead>Método de pago</TableHead>
                      <TableHead>Tipo</TableHead>
                      <TableHead className="text-right">Monto</TableHead>
                      <TableHead className="w-14"></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {movements.map((m) => (
                      <>
                      <TableRow key={m.id} data-testid={`movement-row-${m.id}`} className={`${m.anulado ? "opacity-40" : ""} cursor-pointer hover:bg-muted/40`} onClick={() => setExpandedMovId(expandedMovId === m.id ? null : m.id)}>
                        <TableCell className={`text-xs tabular-nums ${m.anulado ? "line-through text-muted-foreground" : ""}`}>{formatDateTime(m.createdAt)}</TableCell>
                        <TableCell>
                          {m.anulado ? (
                            <Badge variant="destructive" className="text-xs">ANULADO</Badge>
                          ) : (
                            <Badge className={AREA_COLORS[m.area] || ""}>
                              {AREA_LABEL_MAP[m.area] || m.area}
                            </Badge>
                          )}
                        </TableCell>
                        <TableCell className={m.anulado ? "line-through text-muted-foreground" : ""}>{m.description || m.sourceLabel || "-"}</TableCell>
                        <TableCell className={m.anulado ? "text-muted-foreground" : ""}>{PAYMENT_METHOD_MAP[m.paymentMethod] || m.paymentMethod}</TableCell>
                        <TableCell>
                          {m.anulado ? (
                            <span />
                          ) : m.sourceType === "cobro_cc" ? (
                            <Badge className="bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400">Cobro CC</Badge>
                          ) : m.movementType === "income" ? (
                            <Badge className="bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400">Ingreso</Badge>
                          ) : (
                            <Badge className="bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400">Egreso</Badge>
                          )}
                        </TableCell>
                        <TableCell className={`text-right font-medium ${m.anulado ? "line-through text-muted-foreground" : ""}`}>{formatCurrency(m.amount)}</TableCell>
                        <TableCell className="text-right">
                          <div className="flex items-center justify-end gap-1">
                            {!m.anulado && (m.sourceType === "manual" || isAdmin) && (
                              <Button
                                size="icon"
                                variant="ghost"
                                className="h-6 w-6"
                                onClick={(e) => { e.stopPropagation(); setAnularMovTarget(m.id); setAnularMovMotivo(""); setAnularMovForce(false); }}
                                title={m.sourceType !== "manual" ? "Anular movimiento (admin)" : "Anular movimiento"}
                                data-testid={`button-anular-movement-${m.id}`}
                              >
                                <Ban className="h-3 w-3 text-destructive" />
                              </Button>
                            )}
                            <Button size="icon" variant="ghost" className="h-6 w-6" onClick={(e) => { e.stopPropagation(); setExpandedMovId(expandedMovId === m.id ? null : m.id); }} data-testid={`button-expand-movement-${m.id}`}>
                              {expandedMovId === m.id
                                ? <ChevronUp className="h-3 w-3 text-muted-foreground" />
                                : <ChevronDown className="h-3 w-3 text-muted-foreground" />}
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                      {expandedMovId === m.id && (
                        <TableRow key={`${m.id}-detail`} className="bg-muted/20 hover:bg-muted/20">
                          <TableCell colSpan={7} className="py-2 px-4">
                            <div className="grid grid-cols-2 md:grid-cols-4 gap-x-6 gap-y-1 text-xs text-muted-foreground">
                              <div><span className="font-medium text-foreground">ID movimiento:</span> #{m.id}</div>
                              {m.sourceType && m.sourceType !== "manual" && (
                                <div><span className="font-medium text-foreground">Origen:</span> {m.sourceType === "cobro_cc" ? "Cobro CC" : m.sourceType === "reservation" ? "Reserva" : m.sourceType === "restaurant" ? "Restaurant" : m.sourceType === "spa" ? "SPA" : m.sourceType === "event" ? "Evento" : m.sourceType}</div>
                              )}
                              {m.sourceLabel && m.sourceLabel !== m.description && (
                                <div><span className="font-medium text-foreground">Referencia:</span> {m.sourceLabel}</div>
                              )}
                              {(m as any).proveedor && (
                                <div><span className="font-medium text-foreground">Proveedor:</span> {(m as any).proveedor}</div>
                              )}
                              {(m as any).expenseCategory && (
                                <div><span className="font-medium text-foreground">Categoría:</span> {{
                                  servicios: "Servicios", insumos: "Insumos / Materiales", sueldos: "Sueldos / Personal",
                                  impuestos: "Impuestos / Tasas", alquileres: "Alquileres", mantenimiento: "Mantenimiento", otro: "Otro"
                                }[(m as any).expenseCategory] || (m as any).expenseCategory}</div>
                              )}
                              {(m as any).receiptType && (
                                <div><span className="font-medium text-foreground">Comprobante:</span> {(m as any).receiptType}{(m as any).receiptNumber ? ` — ${(m as any).receiptNumber}` : ""}</div>
                              )}
                              {(m as any).motivoAnulacion && (
                                <div className="col-span-2 text-destructive"><span className="font-medium">Motivo anulación:</span> {(m as any).motivoAnulacion}</div>
                              )}
                              <div><span className="font-medium text-foreground">Registrado:</span> {formatDateTime(m.createdAt)}</div>
                            </div>
                          </TableCell>
                        </TableRow>
                      )}
                      </>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Resumen Parcial</CardTitle>
            </CardHeader>
            <CardContent>
              <SummaryTable movements={movements} />
            </CardContent>
          </Card>
        </>
      )}

      <Dialog open={openShiftDialog} onOpenChange={setOpenShiftDialog}>
        <DialogContent className="w-[95vw] max-w-sm max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Abrir Turno — {config.areaLabel}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <label className="text-sm font-medium">Tipo de turno *</label>
              <div className="grid grid-cols-3 gap-2 mt-1.5">
                {TURNO_TIPO_OPTIONS.map(opt => (
                  <button
                    key={opt.value}
                    onClick={() => setTurnoTipoOpen(opt.value)}
                    className={`flex flex-col items-center gap-0.5 py-2.5 px-2 rounded-md border text-sm font-medium transition-colors ${turnoTipoOpen === opt.value ? "bg-primary text-primary-foreground border-primary" : "border-border hover:bg-muted"}`}
                    data-testid={`btn-turno-tipo-${opt.value}-${area}`}
                  >
                    <span>{opt.label}</span>
                    <span className={`text-[10px] font-normal ${turnoTipoOpen === opt.value ? "text-primary-foreground/70" : "text-muted-foreground"}`}>{opt.hours}</span>
                  </button>
                ))}
              </div>
            </div>
            <div>
              <label className="text-sm font-medium">Responsable *</label>
              <Select value={openedBy} onValueChange={setOpenedBy}>
                <SelectTrigger data-testid={`select-opened-by-${area}`}>
                  <SelectValue placeholder="Seleccionar responsable..." />
                </SelectTrigger>
                <SelectContent>
                  {relevantUsers.map(u => (
                    <SelectItem key={u.id} value={getDisplayName(u)}>{getDisplayName(u)}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-sm font-medium">Observaciones</label>
              <Textarea
                value={openNotes}
                onChange={(e) => setOpenNotes(e.target.value)}
                placeholder="Observaciones opcionales"
                data-testid={`input-open-notes-${area}`}
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              onClick={() => openShiftMutation.mutate()}
              disabled={!openedBy.trim() || openShiftMutation.isPending}
              data-testid={`btn-confirm-open-shift-${area}`}
            >
              Confirmar apertura
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={movementDialog} onOpenChange={(open) => {
        setMovementDialog(open);
        if (!open) {
          setMovType("income");
          setMovDesc("");
          setMovMethod("cash");
          setMovAmount("");
          setMovReceipt("");
          setMovReceiptNumber("");
          setMovProveedor("");
          setMovExpenseCategory("");
          setMovCCEntityId("");
          setMovCCEntityName("");
          setMovCCEntityType("company");
          setMovCCSearch("");
        }
      }}>
        <DialogContent className="w-[95vw] max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{isAdmin ? "Registrar Movimiento Manual" : "Registrar Fondo Inicial de Caja"}</DialogTitle>
          </DialogHeader>
          {!isAdmin ? (
            <div className="space-y-4">
              <div className="p-3 bg-blue-50 dark:bg-blue-900/20 rounded-md border border-blue-200 dark:border-blue-800">
                <p className="text-sm text-blue-800 dark:text-blue-300 font-medium">Fondo inicial de caja</p>
                <p className="text-xs text-blue-600 dark:text-blue-400 mt-0.5">
                  Este registro declara el monto inicial con el que se abre la caja. Solo efectivo.
                </p>
              </div>
              <div>
                <label className="text-sm font-medium">Monto inicial ($) *</label>
                <Input
                  type="number"
                  value={movAmount}
                  onChange={e => setMovAmount(e.target.value)}
                  placeholder="0"
                  data-testid={`input-mov-amount-${area}`}
                />
              </div>
              <DialogFooter>
                <Button
                  onClick={() => addMovementMutation.mutate()}
                  disabled={!movAmount || addMovementMutation.isPending}
                  data-testid={`btn-confirm-movement-${area}`}
                >
                  {addMovementMutation.isPending ? "Registrando..." : "Registrar fondo"}
                </Button>
              </DialogFooter>
            </div>
          ) : (
          <>
          <div className="space-y-4">
            {/* Tipo de movimiento */}
            <div>
              <label className="text-sm font-medium">Tipo</label>
              <Select value={movType} onValueChange={(v) => {
                setMovType(v);
                setMovCCEntityId("");
                setMovCCEntityName("");
              }}>
                <SelectTrigger data-testid={`select-mov-type-${area}`}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="income">Ingreso manual</SelectItem>
                  {isAdmin && <SelectItem value="expense">Egreso (solo admin)</SelectItem>}
                </SelectContent>
              </Select>
            </div>

            {/* Bloque específico para cobro CC */}
            {isCobro && (
              <div className="border rounded-lg p-3 space-y-3 bg-muted/30">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Cuenta corriente a cobrar</p>

                {/* Tipo de entidad */}
                <div>
                  <label className="text-sm font-medium">Tipo</label>
                  <Select value={movCCEntityType} onValueChange={(v: "company" | "agency" | "guest") => {
                    setMovCCEntityType(v);
                    setMovCCEntityId("");
                    setMovCCEntityName("");
                  }}>
                    <SelectTrigger data-testid={`select-cc-entity-type-${area}`}>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="company">
                        <span className="flex items-center gap-2"><Building2 className="h-3.5 w-3.5" />Empresa</span>
                      </SelectItem>
                      <SelectItem value="agency">
                        <span className="flex items-center gap-2"><Plane className="h-3.5 w-3.5" />Agencia</span>
                      </SelectItem>
                      <SelectItem value="guest">
                        <span className="flex items-center gap-2"><User className="h-3.5 w-3.5" />Cliente</span>
                      </SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {/* Selector de entidad — buscador inline (evita conflicto Popover+Dialog) */}
                <div>
                  <label className="text-sm font-medium">
                    {movCCEntityType === "company" ? "Empresa" : movCCEntityType === "agency" ? "Agencia" : "Cliente"}
                  </label>

                  {/* Si ya hay una seleccionada, mostrar con botón para cambiar */}
                  {movCCEntityId ? (
                    <div className="flex items-center justify-between border rounded-md px-3 py-2 bg-muted/30 mt-1">
                      <div>
                        <span className="font-medium text-sm">{movCCEntityName}</span>
                        {ccEntities.find(e => e.id === movCCEntityId) && (
                          <span className={`ml-2 text-xs font-semibold ${ccEntities.find(e => e.id === movCCEntityId)!.balance > 0 ? "text-red-600" : "text-green-600"}`}>
                            Saldo: ${ccEntities.find(e => e.id === movCCEntityId)!.balance.toLocaleString("es-AR", { minimumFractionDigits: 2 })}
                          </span>
                        )}
                      </div>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-6 text-xs"
                        onClick={() => { setMovCCEntityId(""); setMovCCEntityName(""); setMovCCSearch(""); }}
                        data-testid={`btn-cc-clear-${area}`}
                      >
                        Cambiar
                      </Button>
                    </div>
                  ) : (
                    <div className="mt-1 space-y-1">
                      <Input
                        placeholder="Buscar por nombre..."
                        value={movCCSearch}
                        onChange={(e) => setMovCCSearch(e.target.value)}
                        data-testid={`input-cc-search-${area}`}
                        autoComplete="off"
                      />
                      {ccEntities.length > 0 && (
                        <div className="border rounded-md max-h-40 overflow-y-auto bg-background">
                          {ccEntities
                            .filter(e => !movCCSearch || e.name.toLowerCase().includes(movCCSearch.toLowerCase()))
                            .map(e => (
                              <button
                                key={e.id}
                                type="button"
                                className="w-full flex items-center justify-between px-3 py-2 text-sm hover:bg-muted transition-colors text-left border-b last:border-b-0"
                                onClick={() => { setMovCCEntityId(e.id); setMovCCEntityName(e.name); setMovCCSearch(""); }}
                                data-testid={`btn-cc-entity-${e.id}`}
                              >
                                <span>{e.name}</span>
                                {e.balance !== 0 && (
                                  <span className={`text-xs font-semibold tabular-nums ml-2 shrink-0 ${e.balance > 0 ? "text-red-600" : "text-green-600"}`}>
                                    ${e.balance.toLocaleString("es-AR", { minimumFractionDigits: 2 })}
                                  </span>
                                )}
                              </button>
                            ))}
                          {ccEntities.filter(e => !movCCSearch || e.name.toLowerCase().includes(movCCSearch.toLowerCase())).length === 0 && (
                            <p className="text-sm text-muted-foreground px-3 py-2">Sin resultados</p>
                          )}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Descripción — solo para movimientos no-CC */}
            {!isCobro && (
              <div>
                <label className="text-sm font-medium">Descripción</label>
                <Input
                  value={movDesc}
                  onChange={(e) => setMovDesc(e.target.value)}
                  placeholder="Descripción del movimiento"
                  data-testid={`input-mov-desc-${area}`}
                />
              </div>
            )}

            {/* Método de pago */}
            <div>
              <label className="text-sm font-medium">Método de pago</label>
              <Select value={movMethod} onValueChange={setMovMethod}>
                <SelectTrigger data-testid={`select-mov-method-${area}`}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(PAYMENT_METHOD_MAP)
                    .filter(([key]) => !["room_charge", "cuenta_habitacion", "current_account", "cuenta_corriente"].includes(key))
                    .map(([key, label]) => (
                      <SelectItem key={key} value={key}>{label}</SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </div>

            {/* Monto */}
            <div>
              <label className="text-sm font-medium">Monto</label>
              <Input
                type="number"
                value={movAmount}
                onChange={(e) => setMovAmount(e.target.value)}
                placeholder="0"
                data-testid={`input-mov-amount-${area}`}
              />
            </div>

            {/* Campos extra para egresos */}
            {movType === "expense" && (
              <div className="border rounded-lg p-3 space-y-3 bg-muted/20">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Datos del egreso</p>
                <div>
                  <label className="text-sm font-medium">Proveedor / Beneficiario <span className="text-destructive">*</span></label>
                  <Input
                    value={movProveedor}
                    onChange={(e) => setMovProveedor(e.target.value)}
                    placeholder="A quién se le pagó"
                    data-testid={`input-mov-proveedor-${area}`}
                  />
                </div>
                <div>
                  <label className="text-sm font-medium">Categoría <span className="text-destructive">*</span></label>
                  <Select value={movExpenseCategory} onValueChange={setMovExpenseCategory}>
                    <SelectTrigger data-testid={`select-mov-category-${area}`}>
                      <SelectValue placeholder="Seleccionar categoría..." />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="servicios">Servicios</SelectItem>
                      <SelectItem value="insumos">Insumos / Materiales</SelectItem>
                      <SelectItem value="sueldos">Sueldos / Personal</SelectItem>
                      <SelectItem value="impuestos">Impuestos / Tasas</SelectItem>
                      <SelectItem value="alquileres">Alquileres</SelectItem>
                      <SelectItem value="mantenimiento">Mantenimiento</SelectItem>
                      <SelectItem value="otro">Otro</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            )}

            {/* Comprobante */}
            <div>
              <label className="text-sm font-medium">
                Comprobante {movType === "expense" ? <span className="text-destructive">*</span> : <span className="text-muted-foreground text-xs">(opcional)</span>}
              </label>
              <Select value={movReceipt} onValueChange={setMovReceipt}>
                <SelectTrigger data-testid={`select-mov-receipt-${area}`}>
                  <SelectValue placeholder="Seleccionar..." />
                </SelectTrigger>
                <SelectContent>
                  {movType === "expense" ? (
                    <>
                      <SelectItem value="ticket">Ticket</SelectItem>
                      <SelectItem value="factura_a">Factura A</SelectItem>
                      <SelectItem value="factura_b">Factura B</SelectItem>
                      <SelectItem value="factura_c">Factura C</SelectItem>
                      <SelectItem value="remito">Remito</SelectItem>
                      <SelectItem value="recibo">Recibo</SelectItem>
                    </>
                  ) : (
                    <>
                      <SelectItem value="ticket">Ticket</SelectItem>
                      <SelectItem value="remito">Remito</SelectItem>
                      <SelectItem value="recibo">Recibo</SelectItem>
                    </>
                  )}
                </SelectContent>
              </Select>
            </div>

            {/* N° de comprobante */}
            {movReceipt && (
              <div>
                <label className="text-sm font-medium">N° de comprobante {movType === "expense" && <span className="text-destructive">*</span>}</label>
                <Input
                  value={movReceiptNumber}
                  onChange={(e) => setMovReceiptNumber(e.target.value)}
                  placeholder="Ej: 0001-00003456"
                  data-testid={`input-mov-receipt-number-${area}`}
                />
              </div>
            )}
          </div>
          <DialogFooter>
            <Button
              onClick={() => addMovementMutation.mutate()}
              disabled={
                !movAmount ||
                addMovementMutation.isPending ||
                (isCobro ? !movCCEntityId : !movDesc.trim()) ||
                (movType === "expense" && (!movReceipt || !movProveedor.trim() || !movExpenseCategory || !movReceiptNumber.trim()))
              }
              data-testid={`btn-confirm-movement-${area}`}
            >
              Registrar
            </Button>
          </DialogFooter>
          </>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={closeShiftDialog} onOpenChange={(open) => { if (!open) { setCloseShiftDialog(false); resetCloseDialog(); } }}>
        <DialogContent className="max-w-2xl w-[95vw] max-h-[90vh] flex flex-col">
          <DialogHeader className="shrink-0">
            <DialogTitle>
              Cerrar Turno — {config.areaLabel}
              {currentShift && (
                <span className="ml-2 text-sm font-normal text-muted-foreground">
                  {formatShiftLabel(currentShift)} <span className="text-xs">#{currentShift.shiftNumber}</span>
                </span>
              )}
            </DialogTitle>
          </DialogHeader>

          <div className="flex-1 overflow-y-auto pr-1 -mr-1">
          {closeStep === 1 && (
            <div className="space-y-4 pb-2">

              {/* Tipo de turno — siempre visible para identificarlo */}
              <div className="border rounded-lg p-3 bg-muted/20">
                <p className="text-sm font-semibold mb-2">
                  ¿Qué turno estás cerrando?
                  {currentShift?.turnoTipo && (
                    <span className="ml-2 text-xs font-normal text-muted-foreground">(ya identificado)</span>
                  )}
                </p>
                <div className="grid grid-cols-3 gap-2">
                  {TURNO_TIPO_OPTIONS.map(opt => (
                    <button
                      key={opt.value}
                      onClick={() => setTurnoTipoClose(opt.value)}
                      className={`flex flex-col items-center gap-0.5 py-2 px-2 rounded-md border text-sm font-medium transition-colors ${turnoTipoClose === opt.value ? "bg-primary text-primary-foreground border-primary" : "border-border hover:bg-muted"}`}
                      data-testid={`btn-close-turno-tipo-${opt.value}`}
                    >
                      <span>{opt.label}</span>
                      <span className={`text-[10px] font-normal ${turnoTipoClose === opt.value ? "text-primary-foreground/70" : "text-muted-foreground"}`}>{opt.hours}</span>
                    </button>
                  ))}
                </div>
              </div>

              <SummaryTable movements={movements} />

              <div className="border rounded-lg p-4 space-y-2 bg-muted/20">
                <p className="text-sm font-semibold">Conteo de efectivo físico</p>
                {[
                  { label: "Billetes $20.000", val: billetes20000, set: setBilletes20000, mult: 20000 },
                  { label: "Billetes $10.000", val: billetes10000, set: setBilletes10000, mult: 10000 },
                  { label: "Billetes $2.000",  val: billetes2000,  set: setBilletes2000,  mult: 2000  },
                  { label: "Billetes $1.000",  val: billetes1000,  set: setBilletes1000,  mult: 1000  },
                  { label: "Billetes $500",    val: billetes500,   set: setBilletes500,   mult: 500   },
                  { label: "Billetes $200",    val: billetes200,   set: setBilletes200,   mult: 200   },
                  { label: "Billetes $100",    val: billetes100,   set: setBilletes100,   mult: 100   },
                  { label: "Billetes $50",     val: billetes50,    set: setBilletes50,    mult: 50    },
                  { label: "Billetes $20",     val: billetes20,    set: setBilletes20,    mult: 20    },
                  { label: "Billetes $10",     val: billetes10,    set: setBilletes10,    mult: 10    },
                  { label: "Monedas ($)",      val: monedas,       set: setMonedas,       mult: 1     },
                ].map(({ label, val, set, mult }) => (
                  <div key={label} className="flex items-center gap-3">
                    <span className="text-xs w-36 shrink-0">{label}</span>
                    <Input type="number" min={0} value={val || ""} onChange={e => set(Math.max(0, parseInt(e.target.value) || 0))}
                      className="w-20 h-7 text-sm" />
                    {mult > 1 && <span className="text-xs text-muted-foreground">= ${(val * mult).toLocaleString("es-AR")}</span>}
                  </div>
                ))}

                {/* Extras: moneda extranjera, cheques, otros */}
                <div className="border-t pt-2 space-y-1">
                  <p className="text-xs font-medium text-muted-foreground">Otros (cheques, moneda extranjera, etc.)</p>
                  {extrasConteo.map((ex, i) => (
                    <div key={i} className="flex items-center gap-2">
                      <Input
                        value={ex.label}
                        onChange={e => setExtrasConteo(prev => prev.map((r, j) => j === i ? { ...r, label: e.target.value } : r))}
                        placeholder="Descripción (ej: USD 50)"
                        className="h-7 text-xs flex-1"
                      />
                      <Input
                        type="number" min={0} step="0.01"
                        value={ex.amount || ""}
                        onChange={e => setExtrasConteo(prev => prev.map((r, j) => j === i ? { ...r, amount: parseFloat(e.target.value) || 0 } : r))}
                        placeholder="Monto $"
                        className="w-24 h-7 text-xs"
                      />
                      <button onClick={() => setExtrasConteo(prev => prev.filter((_, j) => j !== i))} className="text-muted-foreground hover:text-destructive text-xs px-1">✕</button>
                    </div>
                  ))}
                  <button
                    onClick={() => setExtrasConteo(prev => [...prev, { label: "", amount: 0 }])}
                    className="text-xs text-primary hover:underline"
                  >+ Agregar fila</button>
                </div>

                <div className="border-t pt-2 flex justify-between text-sm font-semibold">
                  <span>Total contado:</span>
                  <span>${fmtMoney(efectivoContado)}</span>
                </div>

                <div className={`flex justify-between text-sm ${diferencia !== 0 ? "text-red-600" : "text-green-600"}`}>
                  <span>Sistema (efectivo):</span>
                  <span>${fmtMoney(efectivoSistema)}</span>
                </div>
                {diferencia !== 0 ? (
                  <div className="flex justify-between text-sm font-semibold text-red-600 bg-red-50 dark:bg-red-950/20 px-2 py-1 rounded border border-red-200 dark:border-red-800">
                    <span>Diferencia:</span>
                    <span>{diferencia > 0 ? "+" : ""}{fmtMoney(diferencia)}</span>
                  </div>
                ) : (
                  <div className="flex items-center gap-2 text-sm text-green-700 dark:text-green-400 font-medium">
                    <span>✓</span>
                    <span>Efectivo cuadra con el sistema</span>
                  </div>
                )}
              </div>

              <div>
                <label className="text-sm font-medium">Cerrado por *</label>
                <Select value={closedBy} onValueChange={setClosedBy}>
                  <SelectTrigger data-testid={`select-closed-by-${area}`}>
                    <SelectValue placeholder="Seleccionar quien cierra..." />
                  </SelectTrigger>
                  <SelectContent>
                    {relevantUsers.map(u => (
                      <SelectItem key={u.id} value={getDisplayName(u)}>{getDisplayName(u)}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="text-sm font-medium">Observaciones</label>
                <Textarea value={closeNotes} onChange={e => setCloseNotes(e.target.value)} placeholder="Observaciones opcionales" data-testid={`input-close-notes-${area}`} />
              </div>
            </div>
          )}

          {closeStep === 2 && (
            <div className="space-y-4 pb-2">
              <div className="flex items-center gap-2 text-green-700">
                <span className="text-lg">✓</span>
                <span className="font-medium">{currentShift ? formatShiftLabel(currentShift) : ""} listo para cerrarse</span>
              </div>
              <div className="border rounded-lg p-4 bg-muted/20 space-y-1">
                <p className="text-sm font-semibold">Próximo turno</p>
                <p className="text-xs text-muted-foreground">El sistema abrirá automáticamente el siguiente turno con saldo inicial $0.</p>
                <p className="text-xs text-muted-foreground mt-1">Efectivo contado: <strong>${fmtMoney(efectivoContado)}</strong></p>
              </div>
              <div>
                <label className="text-sm font-medium">¿Quién toma el siguiente turno? <span className="text-muted-foreground font-normal">(opcional)</span></label>
                <Select value={operadorSiguiente} onValueChange={setOperadorSiguiente}>
                  <SelectTrigger data-testid={`select-next-operator-${area}`}>
                    <SelectValue placeholder="Sin relevo inmediato" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="_ninguno">Sin relevo inmediato</SelectItem>
                    {relevantUsers.map(u => (
                      <SelectItem key={u.id} value={getDisplayName(u)}>{getDisplayName(u)}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          )}
          </div>

          <DialogFooter className="gap-2 shrink-0 pt-2 border-t">
            {closeStep === 2 && (
              <Button variant="outline" onClick={() => setCloseStep(1)}>← Atrás</Button>
            )}
            {closeStep === 1 && area === "recepcion" ? (
              <Button onClick={() => setCloseStep(2)} disabled={!closedBy.trim()} data-testid={`btn-next-close-step-${area}`}>
                Siguiente →
              </Button>
            ) : (
              <Button variant="destructive" onClick={() => closeShiftMutation.mutate()}
                disabled={!closedBy.trim() || closeShiftMutation.isPending} data-testid={`btn-confirm-close-shift-${area}`}>
                {closeShiftMutation.isPending ? "Cerrando..." : "Confirmar y cerrar turno"}
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={tomarTurnoDialog} onOpenChange={setTomarTurnoDialog}>
        <DialogContent className="w-[95vw] max-w-sm max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Tomar turno — {config.areaLabel}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">Este turno fue creado automáticamente. Seleccioná el tipo y el operador que lo tomará.</p>
            <div>
              <label className="text-sm font-medium">Tipo de turno *</label>
              <div className="grid grid-cols-3 gap-2 mt-1.5">
                {TURNO_TIPO_OPTIONS.map(opt => (
                  <button
                    key={opt.value}
                    onClick={() => setTurnoTipoTomar(opt.value)}
                    className={`flex flex-col items-center gap-0.5 py-2.5 px-2 rounded-md border text-sm font-medium transition-colors ${turnoTipoTomar === opt.value ? "bg-primary text-primary-foreground border-primary" : "border-border hover:bg-muted"}`}
                    data-testid={`btn-turno-tipo-tomar-${opt.value}-${area}`}
                  >
                    <span>{opt.label}</span>
                    <span className={`text-[10px] font-normal ${turnoTipoTomar === opt.value ? "text-primary-foreground/70" : "text-muted-foreground"}`}>{opt.hours}</span>
                  </button>
                ))}
              </div>
            </div>
            <div>
              <label className="text-sm font-medium">Operador *</label>
              <Select value={openedBy} onValueChange={setOpenedBy}>
                <SelectTrigger data-testid={`select-tomar-turno-operador-${area}`}>
                  <SelectValue placeholder="Seleccionar operador..." />
                </SelectTrigger>
                <SelectContent>
                  {relevantUsers.map(u => (
                    <SelectItem key={u.id} value={getDisplayName(u)}>{getDisplayName(u)}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button
              onClick={() => tomarTurnoMutation.mutate({ operador: openedBy, turnoTipo: turnoTipoTomar })}
              disabled={!openedBy.trim() || tomarTurnoMutation.isPending}
              data-testid={`btn-confirm-tomar-turno-${area}`}
            >
              {tomarTurnoMutation.isPending ? "Guardando..." : "Tomar turno"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!closingSummaryData} onOpenChange={() => setClosingSummaryData(null)}>
        <DialogContent className="max-w-2xl w-[95vw] max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Resumen de Cierre</DialogTitle>
          </DialogHeader>
          {closingSummaryData && (
            <div className="space-y-4 pr-1">
              <SummaryTable movements={closingSummaryData.movements} />

              {changelogHoy.length > 0 && (
                <div className="border-t pt-4">
                  <h4 className="font-semibold mb-3 flex items-center gap-2 text-sm">
                    <ClipboardList className="h-4 w-4" />
                    Modificaciones de reservas del día
                  </h4>
                  <div className="space-y-1 text-xs">
                    {changelogHoy.map((entry: any) => {
                      const d = new Date(entry.fecha);
                      const hora = `${String(d.getHours()).padStart(2,"0")}:${String(d.getMinutes()).padStart(2,"0")}`;
                      return (
                        <div key={entry.id} className="flex items-start gap-2 py-1 border-b border-dashed border-muted-foreground/20" data-testid={`changelog-hoy-${entry.id}`}>
                          <span className="text-muted-foreground w-10 shrink-0">{hora}</span>
                          <span className="text-muted-foreground w-24 shrink-0 truncate">{entry.guestFirstName} {entry.guestLastName}</span>
                          <span className="text-muted-foreground w-20 shrink-0">[{entry.reservationCode}]</span>
                          <span className="flex-1">{entry.descripcion}</span>
                          <span className="text-muted-foreground shrink-0 ml-auto">{entry.operador}</span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              <DialogFooter>
                <Button
                  onClick={() => printClosingSummary(closingSummaryData.shift, closingSummaryData.movements, closingSummaryData.efectivoSistema, closingSummaryData.efectivoContado)}
                  data-testid={`btn-print-closing-${area}`}
                >
                  <Printer className="h-4 w-4 mr-2" />
                  Imprimir
                </Button>
              </DialogFooter>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Anular Movimiento Dialog */}
      <Dialog open={anularMovTarget !== null} onOpenChange={(open) => {
        if (!open) { setAnularMovTarget(null); setAnularMovMotivo(""); setAnularMovForce(false); }
      }}>
        <DialogContent className="w-[95vw] max-w-[400px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-destructive">
              <AlertTriangle className="h-5 w-5" />
              Anular Movimiento
            </DialogTitle>
            <DialogDescription>
              Esta acción anula el movimiento. Seguirá visible en la lista con estado ANULADO y no afectará los totales de cierre.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <Label htmlFor="motivo-anular-mov">Motivo de anulación (opcional)</Label>
            <Textarea
              id="motivo-anular-mov"
              placeholder="Ej: Error de carga, duplicado..."
              value={anularMovMotivo}
              onChange={(e) => setAnularMovMotivo(e.target.value)}
              rows={3}
              data-testid="input-motivo-anular-mov"
            />
            {isAdmin && (
              <div className="flex items-center gap-2 p-2 rounded bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800">
                <input
                  type="checkbox"
                  id="force-anular-check"
                  checked={anularMovForce}
                  onChange={(e) => setAnularMovForce(e.target.checked)}
                  data-testid="check-force-anular"
                />
                <Label htmlFor="force-anular-check" className="text-amber-800 dark:text-amber-300 text-sm cursor-pointer">
                  Forzar anulación (omitir restricción de turno cerrado)
                </Label>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setAnularMovTarget(null); setAnularMovMotivo(""); setAnularMovForce(false); }}>
              Cancelar
            </Button>
            <Button
              variant="destructive"
              onClick={() => {
                if (anularMovTarget === null) return;
                anularMovementMutation.mutate({ id: anularMovTarget, motivo: anularMovMotivo, force: anularMovForce });
              }}
              disabled={anularMovementMutation.isPending}
              data-testid="button-confirm-anular-mov"
            >
              {anularMovementMutation.isPending ? "Anulando..." : "Confirmar Anulación"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function HistorialTab() {
  const [areaFilter, setAreaFilter] = useState("all");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [detailShiftId, setDetailShiftId] = useState<number | null>(null);

  const queryParams = new URLSearchParams();
  if (areaFilter !== "all") queryParams.set("area", areaFilter);
  if (dateFrom) queryParams.set("from", dateFrom);
  if (dateTo) queryParams.set("to", dateTo);
  const qs = queryParams.toString();

  const { data: history = [], isLoading } = useQuery<any[]>({
    queryKey: ["/api/cash/summary", qs],
    queryFn: async () => {
      const res = await fetch(`/api/cash/summary${qs ? "?" + qs : ""}`, { credentials: "include" });
      if (!res.ok) throw new Error("Error loading history");
      return res.json();
    },
  });

  const { data: shiftDetail, isLoading: detailLoading } = useQuery<ShiftDetail>({
    queryKey: ["/api/cash/shifts", detailShiftId],
    queryFn: async () => {
      const res = await fetch(`/api/cash/shifts/${detailShiftId}`, { credentials: "include" });
      if (!res.ok) throw new Error("Error loading detail");
      return res.json();
    },
    enabled: !!detailShiftId,
  });

  const { data: cancelledOrders = [] } = useQuery<any[]>({
    queryKey: ["/api/restaurant/orders/cancelled-in-shift", detailShiftId],
    queryFn: async () => {
      if (!shiftDetail) return [];
      const from = shiftDetail.shift.openedAt;
      const to = shiftDetail.shift.closedAt || new Date().toISOString();
      const res = await fetch(`/api/restaurant/orders?status=cancelled&from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`, { credentials: "include" });
      if (!res.ok) return [];
      return res.json();
    },
    enabled: !!detailShiftId && !!shiftDetail,
  });

  return (
    <div className="space-y-6 p-4">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <History className="h-5 w-5" />
            Historial de Caja
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap items-end gap-4 mb-6">
            <div>
              <label className="text-sm font-medium">Área</label>
              <Select value={areaFilter} onValueChange={setAreaFilter}>
                <SelectTrigger className="w-[180px]" data-testid="select-history-area">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todas</SelectItem>
                  <SelectItem value="reception">Recepción</SelectItem>
                  <SelectItem value="restaurant">Restaurante</SelectItem>
                  <SelectItem value="spa">SPA</SelectItem>
                  <SelectItem value="events">Eventos</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-sm font-medium">Desde</label>
              <Input
                type="date"
                value={dateFrom}
                onChange={(e) => setDateFrom(e.target.value)}
                data-testid="input-history-from"
              />
            </div>
            <div>
              <label className="text-sm font-medium">Hasta</label>
              <Input
                type="date"
                value={dateTo}
                onChange={(e) => setDateTo(e.target.value)}
                data-testid="input-history-to"
              />
            </div>
          </div>

          {isLoading ? (
            <div className="space-y-2">
              {[...Array(3)].map((_, i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          ) : history.length === 0 ? (
            <p className="text-center text-muted-foreground py-8">No hay registros para los filtros seleccionados</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Fecha</TableHead>
                  <TableHead>Área</TableHead>
                  <TableHead>Turno</TableHead>
                  <TableHead>Abierto por</TableHead>
                  <TableHead>Cerrado por</TableHead>
                  <TableHead>Hora apertura</TableHead>
                  <TableHead>Hora cierre</TableHead>
                  <TableHead className="text-right">Total general</TableHead>
                  <TableHead>Acciones</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {history.map((row: any) => (
                  <TableRow key={row.id} data-testid={`history-row-${row.id}`}>
                    <TableCell>{row.shift ? formatDate(row.shift.openedAt) : formatDate(row.closedAt)}</TableCell>
                    <TableCell>
                      <Badge className={AREA_COLORS[row.area] || ""}>
                        {AREA_LABEL_MAP[row.area] || row.area}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      {row.shift ? (
                        <span className="text-sm">
                          {row.shift.turnoTipo
                            ? formatShiftLabel(row.shift)
                            : `#${row.shift.shiftNumber}`}
                        </span>
                      ) : "-"}
                    </TableCell>
                    <TableCell>{row.shift?.openedBy || "-"}</TableCell>
                    <TableCell>{row.shift?.closedBy || row.closedBy || "-"}</TableCell>
                    <TableCell>{row.shift ? formatTime(row.shift.openedAt) : "-"}</TableCell>
                    <TableCell>{row.shift?.closedAt ? formatTime(row.shift.closedAt) : (row.closedAt ? formatTime(row.closedAt) : "-")}</TableCell>
                    <TableCell className="text-right font-medium">
                      {row.totalGeneral != null ? formatCurrency(row.totalGeneral) : "-"}
                    </TableCell>
                    <TableCell>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setDetailShiftId(row.shiftId)}
                        data-testid={`btn-view-detail-${row.id}`}
                      >
                        <Eye className="h-4 w-4 mr-1" />
                        Ver detalle
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Dialog open={!!detailShiftId} onOpenChange={() => setDetailShiftId(null)}>
        <DialogContent className="w-[95vw] max-w-3xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Detalle del Turno</DialogTitle>
          </DialogHeader>
          {detailLoading ? (
            <div className="space-y-2">
              {[...Array(3)].map((_, i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          ) : shiftDetail ? (
            <div className="space-y-6">
              <div className="flex flex-wrap items-center gap-4">
                <Badge className={AREA_COLORS[shiftDetail.shift.area] || ""}>
                  {AREA_LABEL_MAP[shiftDetail.shift.area] || shiftDetail.shift.area}
                </Badge>
                <span className="text-sm font-medium">
                  {formatShiftLabel(shiftDetail.shift)}
                  <span className="ml-1 text-xs text-muted-foreground font-normal">#{shiftDetail.shift.shiftNumber}</span>
                </span>
                <span className="text-sm text-muted-foreground">
                  {shiftDetail.shift.openedBy} — {formatDateTime(shiftDetail.shift.openedAt)}
                  {shiftDetail.shift.closedAt && ` / ${shiftDetail.shift.closedBy} — ${formatDateTime(shiftDetail.shift.closedAt)}`}
                </span>
              </div>

              <div>
                <h3 className="font-semibold mb-2">Resumen por método</h3>
                <SummaryTable movements={shiftDetail.movements} />
              </div>

              <div>
                <h3 className="font-semibold mb-2">Movimientos</h3>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Hora</TableHead>
                      <TableHead>Descripción</TableHead>
                      <TableHead>Método</TableHead>
                      <TableHead>Tipo</TableHead>
                      <TableHead className="text-right">Monto</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {shiftDetail.movements.map((m) => (
                      <TableRow key={m.id}>
                        <TableCell className="text-xs tabular-nums">{formatDateTime(m.createdAt)}</TableCell>
                        <TableCell>{m.description || m.sourceLabel || "-"}</TableCell>
                        <TableCell>{PAYMENT_METHOD_MAP[m.paymentMethod] || m.paymentMethod}</TableCell>
                        <TableCell>
                          {m.movementType === "informational" ? (
                            <Badge className="bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400">Solo registro</Badge>
                          ) : m.movementType === "income" ? (
                            <Badge className="bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400">Ingreso</Badge>
                          ) : (
                            <Badge className="bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400">Egreso</Badge>
                          )}
                        </TableCell>
                        <TableCell className="text-right font-medium">{formatCurrency(m.amount)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>

              {cancelledOrders.length > 0 && (
                <div>
                  <h3 className="font-semibold mb-2 flex items-center gap-2 text-destructive">
                    <XCircle className="h-4 w-4" />
                    Tickets Cancelados ({cancelledOrders.length})
                  </h3>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Hora</TableHead>
                        <TableHead>Ticket</TableHead>
                        <TableHead>Mesa</TableHead>
                        <TableHead className="text-right">Total</TableHead>
                        <TableHead>Motivo</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {cancelledOrders.map((o: any) => (
                        <TableRow key={o.id} className="opacity-75">
                          <TableCell>{o.closedAt ? formatTime(o.closedAt) : "-"}</TableCell>
                          <TableCell className="font-medium">{o.orderLabel || o.orderNumber}</TableCell>
                          <TableCell>{o.table?.tableNumber ? `Mesa ${o.table.tableNumber}` : "—"}</TableCell>
                          <TableCell className="text-right line-through text-muted-foreground">
                            {formatCurrency(o.total || 0)}
                          </TableCell>
                          <TableCell className="text-sm text-muted-foreground italic max-w-[160px] truncate" title={o.cancellationReason}>
                            {o.cancellationReason || "—"}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}

              <DialogFooter>
                <Button
                  onClick={() => printClosingSummary(shiftDetail.shift, shiftDetail.movements)}
                  data-testid={`btn-print-detail-${detailShiftId}`}
                >
                  <Printer className="h-4 w-4 mr-2" />
                  Imprimir
                </Button>
              </DialogFooter>
            </div>
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}

const MODULO_LABEL: Record<string, string> = {
  reserva: "Recepción",
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
<div class="footer">Generado el ${new Date().toLocaleString("es-AR")} | Maran Suites & Towers</div>
<script>window.onload=function(){window.print();}<\/script>
</body></html>`;
  const w = window.open("", "_blank");
  if (w) { w.document.write(html); w.document.close(); }
}

function ResumenDiaTab() {
  const today = new Date().toLocaleDateString("en-CA", { timeZone: "America/Argentina/Buenos_Aires" });
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
            Ejecutado el {new Date(audit.executedAt).toLocaleString("es-AR")} por {audit.executedBy}
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
                <p className="text-xs text-muted-foreground">{new Date(status.lastAudit.executedAt).toLocaleString("es-AR")}</p>
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
                  <TableRow key={audit.id}>
                    <TableCell className="font-mono text-sm">{audit.auditDate}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {new Date(audit.executedAt).toLocaleString("es-AR")}
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
  // Any authenticated user who reaches this page can at least see global tabs (historial/resumen/night-audit)
  const canSeeGlobalTabs = true;

  const [parteSeleccionado, setParteSeleccionado] = useState<string | null>(() =>
    sessionStorage.getItem("caja_parte_activo")
  );
  const [mostrarSelectorParte, setMostrarSelectorParte] = useState(false);
  const [currentTab, setCurrentTab] = useState<string | undefined>(undefined);

  useEffect(() => {
    if (isAdminOrManager && !parteSeleccionado && !isLoading && allActiveConfigs.length > 0) {
      setMostrarSelectorParte(true);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isLoading]);

  function seleccionarParte(area: string) {
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

      <Tabs value={currentTab ?? defaultTab} onValueChange={setCurrentTab}>
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
              <AreaTab area={c.area} config={c} />
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
        </Tabs>
    </div>
  );
}