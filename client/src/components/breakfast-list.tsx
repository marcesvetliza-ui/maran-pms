import { useQuery } from "@tanstack/react-query";
import { Coffee, Printer } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

type BreakfastEntry = {
  reservationId: string;
  roomNumber: string;
  checkIn: string;
  checkOut: string;
  adults: number;
  children: number;
  guestName: string;
};

type BreakfastListProps = {
  enabled: boolean;
  variant?: "card" | "plain";
  onClose?: () => void;
};

const formatDate = (date: string) =>
  date
    ? new Date(`${date}T12:00:00`).toLocaleDateString("es-ES", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
      })
    : "—";

const getTomorrowLabel = () => {
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  return tomorrow.toLocaleDateString("es-ES", {
    weekday: "long",
    day: "2-digit",
    month: "long",
    year: "numeric",
  });
};

function printBreakfastList(entries: BreakfastEntry[]) {
  const tomorrowLabel = getTomorrowLabel();
  const totalPax = entries.reduce((sum, entry) => sum + entry.adults, 0);
  const rows = entries
    .map(
      (entry) => `<tr>
        <td>${entry.roomNumber}</td>
        <td>${entry.guestName}</td>
        <td style="text-align:center">${entry.adults}</td>
        <td>${formatDate(entry.checkIn)}</td>
        <td>${formatDate(entry.checkOut)}</td>
      </tr>`,
    )
    .join("");
  const html = `<!DOCTYPE html><html lang="es"><head><meta charset="UTF-8">
    <title>Listado Desayunos — ${tomorrowLabel}</title>
    <style>
      body { font-family: Arial, sans-serif; font-size: 11px; margin: 20px; color: #111; }
      h1 { font-size: 15px; margin-bottom: 2px; }
      p.sub { font-size: 11px; color: #555; margin: 0 0 12px; }
      table { width: 100%; border-collapse: collapse; }
      th { background: #f0f0f0; border: 1px solid #ccc; padding: 5px 6px; text-align: left; font-size: 10px; text-transform: uppercase; }
      td { border: 1px solid #ddd; padding: 4px 6px; }
      tfoot td { background: #f0f0f0; font-weight: bold; }
      @media print { @page { margin: 15mm; } }
    </style></head><body>
    <h1>Listado de Desayunos — Maran Suites & Towers</h1>
    <p class="sub">${tomorrowLabel} · ${entries.length} habitación(es) · ${totalPax} persona(s)</p>
    <table>
      <thead><tr><th>Hab.</th><th>Titular</th><th>Pax</th><th>Ingreso</th><th>Egreso</th></tr></thead>
      <tbody>${rows}</tbody>
      <tfoot><tr><td colspan="2">TOTAL</td><td style="text-align:center">${totalPax}</td><td colspan="2"></td></tr></tfoot>
    </table>
    <script>window.onload=()=>{window.print();}</script>
    </body></html>`;
  const printWindow = window.open("", "_blank");
  if (printWindow) {
    printWindow.document.write(html);
    printWindow.document.close();
  }
}

export function BreakfastList({ enabled, variant = "card", onClose }: BreakfastListProps) {
  const { data = [], isLoading, isError } = useQuery<BreakfastEntry[]>({
    queryKey: ["/api/dashboard/breakfasts"],
    enabled,
  });

  const content = (
    <>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-base font-semibold flex items-center gap-2">
            <Coffee className="h-5 w-5" />
            Desayunos — {getTomorrowLabel()}
          </h3>
          <p className="text-sm text-muted-foreground mt-1">
            Habitaciones con desayuno incluido para mañana
          </p>
        </div>
        <div className="flex items-center gap-2">
          {!isLoading && data.length > 0 && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => printBreakfastList(data)}
              data-testid="button-print-breakfasts"
            >
              <Printer className="h-4 w-4 mr-1" />
              Imprimir
            </Button>
          )}
          {onClose && (
            <Button variant="ghost" size="sm" onClick={onClose}>
              Cerrar
            </Button>
          )}
        </div>
      </div>

      <div className="mt-4">
        {isLoading ? (
          <div className="space-y-2">
            {[...Array(3)].map((_, index) => <Skeleton key={index} className="h-10 w-full" />)}
          </div>
        ) : isError ? (
          <p className="text-sm text-destructive text-center py-4">
            No se pudo cargar el listado de desayunos.
          </p>
        ) : data.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-4">
            No hay reservas activas para mañana.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-muted-foreground text-xs uppercase">
                  <th className="text-left py-2 px-2 font-medium">Hab.</th>
                  <th className="text-left py-2 px-2 font-medium">Titular</th>
                  <th className="text-center py-2 px-2 font-medium">Pax</th>
                  <th className="text-left py-2 px-2 font-medium">Ingreso</th>
                  <th className="text-left py-2 px-2 font-medium">Egreso</th>
                </tr>
              </thead>
              <tbody>
                {data.map((entry) => (
                  <tr key={entry.reservationId} className="border-b hover:bg-muted/40">
                    <td className="py-1.5 px-2 font-semibold">{entry.roomNumber}</td>
                    <td className="py-1.5 px-2 font-medium">{entry.guestName}</td>
                    <td className="py-1.5 px-2 text-center font-semibold">{entry.adults}</td>
                    <td className="py-1.5 px-2">{formatDate(entry.checkIn)}</td>
                    <td className="py-1.5 px-2">{formatDate(entry.checkOut)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t-2 bg-muted/30">
                  <td colSpan={2} className="py-1.5 px-2 font-semibold text-xs uppercase text-muted-foreground">
                    Total
                  </td>
                  <td className="py-1.5 px-2 text-center font-bold">
                    {data.reduce((sum, entry) => sum + entry.adults, 0)}
                  </td>
                  <td colSpan={2} />
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </div>
    </>
  );

  if (variant === "plain") return content;

  return (
    <Card>
      <CardHeader className="sr-only">
        <CardTitle>Desayunos de mañana</CardTitle>
        <CardDescription>Listado de habitaciones con desayuno</CardDescription>
      </CardHeader>
      <CardContent className="pt-6">{content}</CardContent>
    </Card>
  );
}