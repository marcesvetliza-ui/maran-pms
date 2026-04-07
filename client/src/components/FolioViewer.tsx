import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import {
  ArrowDownCircle,
  ArrowUpCircle,
  ReceiptText,
  FileX,
  ChevronsUpDown,
  Landmark,
  Download,
} from "lucide-react";

interface FolioMovement {
  id: string;
  folioId: string;
  type: string;
  amount: string;
  description: string;
  sourceType?: string;
  paymentMethod?: string;
  registeredBy?: string;
  receiptType?: string;
  createdAt: string;
}

interface FolioData {
  id: string;
  codigo: string;
  entityType: string;
  entityId: string;
  status: string;
  totalCharges: string;
  totalPayments: string;
  balance: string;
  openedAt: string;
  closedAt?: string;
  movements: FolioMovement[];
}

const MOVEMENT_LABELS: Record<string, string> = {
  charge: "Cargo",
  payment: "Pago",
  advance: "Anticipo",
  discount: "Descuento",
  adjustment: "Ajuste",
  transfer_in: "Transferencia entrada",
  transfer_out: "Transferencia salida",
  void: "Anulación",
};

const PAYMENT_METHOD_LABELS: Record<string, string> = {
  efectivo: "Efectivo",
  cash: "Efectivo",
  tarjeta_debito: "Tarj. Débito",
  debit_card: "Tarj. Débito",
  tarjeta_credito: "Tarj. Crédito",
  credit_card: "Tarj. Crédito",
  transferencia: "Transferencia",
  transfer: "Transferencia",
  mercadopago: "MercadoPago",
  cuenta_corriente: "Cta. Corriente",
  current_account: "Cta. Corriente",
};

function movementIcon(type: string) {
  switch (type) {
    case "charge": return <ArrowUpCircle className="h-4 w-4 text-red-500" />;
    case "payment":
    case "advance": return <ArrowDownCircle className="h-4 w-4 text-green-600" />;
    case "discount": return <ChevronsUpDown className="h-4 w-4 text-blue-500" />;
    case "void": return <FileX className="h-4 w-4 text-orange-500" />;
    case "transfer_in":
    case "transfer_out": return <Landmark className="h-4 w-4 text-purple-500" />;
    default: return <ReceiptText className="h-4 w-4 text-muted-foreground" />;
  }
}

function isDebit(type: string) {
  return ["charge", "transfer_in"].includes(type);
}

function formatCurrency(value: string | number) {
  return new Intl.NumberFormat("es-AR", { style: "currency", currency: "ARS", maximumFractionDigits: 0 }).format(Number(value));
}

function formatDate(iso: string) {
  try {
    return format(new Date(iso), "dd/MM/yy HH:mm", { locale: es });
  } catch {
    return iso;
  }
}

interface Props {
  entityType: string;
  entityId: string;
}

export default function FolioViewer({ entityType, entityId }: Props) {
  const { data: folio, isLoading } = useQuery<FolioData | null>({
    queryKey: ["/api/folios", entityType, entityId],
    queryFn: async () => {
      const res = await fetch(`/api/folios/${entityType}/${entityId}`);
      if (!res.ok) throw new Error("Error cargando folio");
      return res.json();
    },
    enabled: !!entityId,
  });

  if (isLoading) {
    return (
      <div className="space-y-2 p-4">
        <Skeleton className="h-6 w-48" />
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-3/4" />
      </div>
    );
  }

  if (!folio) {
    return (
      <div className="py-8 text-center text-muted-foreground">
        <ReceiptText className="mx-auto mb-2 h-8 w-8 opacity-40" />
        <p className="text-sm">No hay folio registrado todavía.</p>
        <p className="text-xs mt-1">Se creará automáticamente al agregar el primer cargo o pago.</p>
      </div>
    );
  }

  const balance = Number(folio.balance);
  const charges = Number(folio.totalCharges);
  const paymentsTotal = Number(folio.totalPayments);

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <ReceiptText className="h-5 w-5 text-primary" />
          <span className="font-semibold text-sm">{folio.codigo}</span>
          <Badge variant={folio.status === "open" ? "secondary" : folio.status === "invoiced" ? "default" : "outline"}>
            {folio.status === "open" ? "Abierto" : folio.status === "closed" ? "Cerrado" : "Facturado"}
          </Badge>
        </div>
        <div className="flex items-center gap-2">
          {folio.openedAt && (
            <span className="text-xs text-muted-foreground">
              Abierto {formatDate(folio.openedAt)}
            </span>
          )}
          <Button
            variant="outline"
            size="sm"
            className="h-7 gap-1 text-xs"
            data-testid="button-download-folio-pdf"
            onClick={() => window.open(`/api/folios/${entityType}/${entityId}/pdf`, "_blank")}
          >
            <Download className="h-3 w-3" />
            PDF
          </Button>
        </div>
      </div>

      {/* Totals */}
      <div className="grid grid-cols-3 gap-3">
        <div className="rounded-lg border bg-red-50 dark:bg-red-950/20 p-3 text-center">
          <p className="text-xs text-muted-foreground mb-1">Cargos</p>
          <p className="font-bold text-red-600 dark:text-red-400">{formatCurrency(charges)}</p>
        </div>
        <div className="rounded-lg border bg-green-50 dark:bg-green-950/20 p-3 text-center">
          <p className="text-xs text-muted-foreground mb-1">Pagado</p>
          <p className="font-bold text-green-600 dark:text-green-400">{formatCurrency(paymentsTotal)}</p>
        </div>
        <div className={`rounded-lg border p-3 text-center ${balance > 0 ? "bg-orange-50 dark:bg-orange-950/20" : "bg-blue-50 dark:bg-blue-950/20"}`}>
          <p className="text-xs text-muted-foreground mb-1">Saldo</p>
          <p className={`font-bold ${balance > 0 ? "text-orange-600 dark:text-orange-400" : "text-blue-600 dark:text-blue-400"}`}>
            {formatCurrency(balance)}
          </p>
        </div>
      </div>

      <Separator />

      {/* Movements */}
      <div className="space-y-1">
        <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2">
          Movimientos ({folio.movements.length})
        </p>
        {folio.movements.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-4">Sin movimientos aún</p>
        ) : (
          folio.movements.map((mov) => {
            const debit = isDebit(mov.type);
            return (
              <div key={mov.id} className="flex items-start gap-3 py-2 border-b last:border-0">
                <div className="mt-0.5 shrink-0">{movementIcon(mov.type)}</div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="text-sm font-medium truncate">{mov.description}</span>
                    <span className={`text-sm font-bold shrink-0 ${debit ? "text-red-600" : "text-green-600"}`}>
                      {debit ? "+" : "-"}{formatCurrency(mov.amount)}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 mt-0.5">
                    <span className="text-xs text-muted-foreground">
                      {MOVEMENT_LABELS[mov.type] ?? mov.type}
                    </span>
                    {mov.paymentMethod && (
                      <>
                        <span className="text-xs text-muted-foreground">·</span>
                        <span className="text-xs text-muted-foreground">
                          {PAYMENT_METHOD_LABELS[mov.paymentMethod] ?? mov.paymentMethod}
                        </span>
                      </>
                    )}
                    <span className="text-xs text-muted-foreground">·</span>
                    <span className="text-xs text-muted-foreground">{formatDate(mov.createdAt)}</span>
                    {mov.registeredBy && (
                      <>
                        <span className="text-xs text-muted-foreground">·</span>
                        <span className="text-xs text-muted-foreground">{mov.registeredBy}</span>
                      </>
                    )}
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>

      {folio.closedAt && (
        <div className="text-xs text-muted-foreground text-right">
          Cerrado {formatDate(folio.closedAt)}{folio.closedBy ? ` por ${folio.closedBy}` : ""}
        </div>
      )}
    </div>
  );
}
