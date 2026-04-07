import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import {
  ArrowLeft, Users, AlertTriangle, ChevronDown, ChevronRight,
  Hotel, Receipt, CreditCard, Search,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";

type GuestDebtReservation = {
  reservationId: string;
  reservationCode: string;
  roomNumber: string;
  checkInDate: string;
  checkOutDate: string;
  status: string;
  alojamiento: number;
  extras: number;
  pagado: number;
  saldo: number;
};

type GuestDebt = {
  guestId: string;
  guestName: string;
  documentNumber?: string;
  documentType?: string;
  reservations: GuestDebtReservation[];
  totalAlojamiento: number;
  totalExtras: number;
  totalPagado: number;
  totalDeuda: number;
};

const fmt = (n: number) =>
  new Intl.NumberFormat("es-AR", { style: "currency", currency: "ARS", maximumFractionDigits: 0 }).format(n);

const fmtDate = (iso: string) => {
  if (!iso) return "-";
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
};

const STATUS_MAP: Record<string, { label: string; variant: "default" | "secondary" | "outline" }> = {
  confirmed: { label: "Confirmada", variant: "secondary" },
  checked_in: { label: "En Casa", variant: "default" },
};

function GuestRow({ g }: { g: GuestDebt }) {
  const [open, setOpen] = useState(false);
  const hasMultiple = g.reservations.length > 1;
  return (
    <>
      <TableRow
        className="cursor-pointer hover:bg-muted/50 transition-colors"
        onClick={() => hasMultiple && setOpen(!open)}
        data-testid={`row-guest-debt-${g.guestId}`}
      >
        <TableCell>
          <div className="flex items-center gap-2">
            {hasMultiple && (
              open ? <ChevronDown className="h-4 w-4 text-muted-foreground" /> : <ChevronRight className="h-4 w-4 text-muted-foreground" />
            )}
            <div>
              <p className="font-medium">{g.guestName}</p>
              {g.documentNumber && (
                <p className="text-xs text-muted-foreground">{g.documentType || "DOC"}: {g.documentNumber}</p>
              )}
            </div>
          </div>
        </TableCell>
        <TableCell>
          {g.reservations.length === 1 ? (
            <div>
              <p className="font-mono text-xs">{g.reservations[0].reservationCode}</p>
              <p className="text-xs text-muted-foreground">Hab. {g.reservations[0].roomNumber}</p>
            </div>
          ) : (
            <Badge variant="outline">{g.reservations.length} reservas</Badge>
          )}
        </TableCell>
        <TableCell className="text-right text-sm">{fmt(g.totalAlojamiento)}</TableCell>
        <TableCell className="text-right text-sm">{fmt(g.totalExtras)}</TableCell>
        <TableCell className="text-right text-sm text-green-600">{fmt(g.totalPagado)}</TableCell>
        <TableCell className="text-right">
          <span className="font-bold text-red-600">{fmt(g.totalDeuda)}</span>
        </TableCell>
      </TableRow>
      {open && g.reservations.map(r => (
        <TableRow key={r.reservationId} className="bg-muted/30" data-testid={`row-subreservation-${r.reservationId}`}>
          <TableCell className="pl-10">
            <div className="flex items-center gap-2">
              <Hotel className="h-3 w-3 text-muted-foreground" />
              <span className="text-xs text-muted-foreground">
                {fmtDate(r.checkInDate)} → {fmtDate(r.checkOutDate)}
              </span>
            </div>
          </TableCell>
          <TableCell>
            <div>
              <p className="font-mono text-xs">{r.reservationCode}</p>
              <p className="text-xs text-muted-foreground">Hab. {r.roomNumber}</p>
            </div>
          </TableCell>
          <TableCell className="text-right text-xs">{fmt(r.alojamiento)}</TableCell>
          <TableCell className="text-right text-xs">{fmt(r.extras)}</TableCell>
          <TableCell className="text-right text-xs text-green-600">{fmt(r.pagado)}</TableCell>
          <TableCell className="text-right">
            <span className="text-xs font-semibold text-red-600">{fmt(r.saldo)}</span>
          </TableCell>
        </TableRow>
      ))}
    </>
  );
}

export default function AdminDeudaHuespedesPage() {
  const [search, setSearch] = useState("");

  const { data: guests = [], isLoading } = useQuery<GuestDebt[]>({
    queryKey: ["/api/reports/guest-debt"],
    queryFn: async () => {
      const res = await fetch("/api/reports/guest-debt", { credentials: "include" });
      if (!res.ok) throw new Error("Error");
      return res.json();
    },
    refetchInterval: 60_000,
  });

  const filtered = guests.filter(g =>
    !search || g.guestName.toLowerCase().includes(search.toLowerCase()) ||
    g.documentNumber?.includes(search) ||
    g.reservations.some(r => r.reservationCode.toLowerCase().includes(search.toLowerCase()) || r.roomNumber?.includes(search))
  );

  const totals = filtered.reduce(
    (acc, g) => ({
      alojamiento: acc.alojamiento + g.totalAlojamiento,
      extras: acc.extras + g.totalExtras,
      pagado: acc.pagado + g.totalPagado,
      deuda: acc.deuda + g.totalDeuda,
    }),
    { alojamiento: 0, extras: 0, pagado: 0, deuda: 0 }
  );

  return (
    <div className="flex flex-col gap-6 p-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Link href="/administration">
          <Button variant="ghost" size="sm" className="gap-2">
            <ArrowLeft className="h-4 w-4" />
            Administración
          </Button>
        </Link>
        <div className="flex-1">
          <h1 className="text-2xl font-bold tracking-tight">Deuda por Huésped</h1>
          <p className="text-muted-foreground text-sm">
            Saldos pendientes de reservas activas — alojamiento y extras
          </p>
        </div>
      </div>

      {/* Summary cards */}
      {!isLoading && (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-2 mb-1">
                <Users className="h-4 w-4 text-primary" />
                <span className="text-xs text-muted-foreground">Huéspedes con deuda</span>
              </div>
              <p className="text-2xl font-bold">{filtered.length}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-2 mb-1">
                <Hotel className="h-4 w-4 text-blue-500" />
                <span className="text-xs text-muted-foreground">Total Alojamiento</span>
              </div>
              <p className="text-xl font-bold text-blue-600">{fmt(totals.alojamiento)}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-2 mb-1">
                <Receipt className="h-4 w-4 text-purple-500" />
                <span className="text-xs text-muted-foreground">Total Extras</span>
              </div>
              <p className="text-xl font-bold text-purple-600">{fmt(totals.extras)}</p>
            </CardContent>
          </Card>
          <Card className="border-red-200 dark:border-red-900">
            <CardContent className="p-4">
              <div className="flex items-center gap-2 mb-1">
                <AlertTriangle className="h-4 w-4 text-red-500" />
                <span className="text-xs text-muted-foreground">Deuda Total</span>
              </div>
              <p className="text-xl font-bold text-red-600">{fmt(totals.deuda)}</p>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Search */}
      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Buscar huésped, habitación, código..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="pl-9"
          data-testid="input-search-guest-debt"
        />
      </div>

      {/* Table */}
      {isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}
        </div>
      ) : filtered.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            <CreditCard className="mx-auto h-10 w-10 opacity-30 mb-2" />
            <p className="text-sm font-medium">
              {guests.length === 0 ? "No hay deudas pendientes" : "No se encontraron resultados"}
            </p>
            {guests.length === 0 && (
              <p className="text-xs mt-1">Todas las reservas activas están al día</p>
            )}
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/50">
                  <TableHead>Huésped</TableHead>
                  <TableHead>Reserva / Hab.</TableHead>
                  <TableHead className="text-right">Alojamiento</TableHead>
                  <TableHead className="text-right">Extras</TableHead>
                  <TableHead className="text-right text-green-700">Pagado</TableHead>
                  <TableHead className="text-right text-red-700">Deuda</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map(g => <GuestRow key={g.guestId} g={g} />)}
                {/* Totals row */}
                <TableRow className="bg-muted font-bold border-t-2">
                  <TableCell colSpan={2}>TOTAL ({filtered.length} huéspedes)</TableCell>
                  <TableCell className="text-right">{fmt(totals.alojamiento)}</TableCell>
                  <TableCell className="text-right">{fmt(totals.extras)}</TableCell>
                  <TableCell className="text-right text-green-600">{fmt(totals.pagado)}</TableCell>
                  <TableCell className="text-right text-red-600">{fmt(totals.deuda)}</TableCell>
                </TableRow>
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
