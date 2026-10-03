import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, RefreshCw } from "lucide-react";
import { despegarUnbilledQueryOptions, type DespegarUnbilledRow } from "@shared/despegarUnbilled";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

export function DespegarUnbilledSection() {
  const { data: rows = [], isLoading, isError, isFetching, refetch } = useQuery<DespegarUnbilledRow[]>(despegarUnbilledQueryOptions);

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between gap-2">
          <CardTitle className="text-sm flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-amber-500" />
            Reservas Despegar sin facturar
          </CardTitle>
          <Button variant="outline" size="sm" disabled={isFetching} onClick={() => void refetch()}>
            <RefreshCw className={`h-4 w-4 mr-2 ${isFetching ? "animate-spin" : ""}`} />
            Actualizar
          </Button>
        </div>
        <p className="text-xs text-muted-foreground">
          Hicieron check-out y no tienen una factura vigente de importe mayor a $0.
          Incluye reservas vinculadas a la agencia Despegar, pendientes de la orden de pago.
          El listado se actualiza automáticamente cada minuto.
        </p>
      </CardHeader>
      <CardContent className="p-0">
        {isLoading ? (
          <div className="p-4"><Skeleton className="h-20 w-full" /></div>
        ) : isError ? (
          <p role="alert" className="text-sm text-destructive p-4">
            No se pudo actualizar el listado de Despegar. Usá Actualizar para reintentar.
          </p>
        ) : rows.length === 0 ? (
          <p className="text-sm text-muted-foreground p-4 text-center">No hay reservas de Despegar sin facturar.</p>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Hab.</TableHead>
                  <TableHead>Huésped</TableHead>
                  <TableHead>Código</TableHead>
                  <TableHead>Ingreso</TableHead>
                  <TableHead>Salida</TableHead>
                  <TableHead className="text-right">Importe alojamiento</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map(row => (
                  <TableRow key={row.reservationId} data-testid={`row-despegar-unbilled-${row.reservationId}`}>
                    <TableCell className="font-medium">{row.roomNumber}</TableCell>
                    <TableCell>{row.guestName}</TableCell>
                    <TableCell className="font-mono text-xs">{row.reservationCode ?? "—"}</TableCell>
                    <TableCell>{row.checkInDate}</TableCell>
                    <TableCell>{row.checkOutDate}</TableCell>
                    <TableCell className="text-right">
                      {row.totalRoomAmount != null
                        ? `$${row.totalRoomAmount.toLocaleString("es-AR", { minimumFractionDigits: 2 })}`
                        : "—"}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}