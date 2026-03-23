import { useState } from "react";
import { useLocation } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import {
  User,
  ArrowLeft,
  Plus,
  TrendingUp,
  TrendingDown,
  Search,
  Loader2,
  CreditCard,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import type { AccountMovement } from "@shared/schema";

type GuestSummary = {
  id: string;
  name: string;
  balance: number;
  lastMovement: string | null;
};

type AccountData = {
  movements: AccountMovement[];
  balance: number;
};

export default function CcHuespedesPage() {
  const [, navigate] = useLocation();
  const { toast } = useToast();

  const [searchTerm, setSearchTerm] = useState("");
  const [viewingGuest, setViewingGuest] = useState<GuestSummary | null>(null);
  const [registerPaymentOpen, setRegisterPaymentOpen] = useState(false);
  const [paymentAmount, setPaymentAmount] = useState("");
  const [paymentDescription, setPaymentDescription] = useState("Pago recibido");
  const [paymentReference, setPaymentReference] = useState("");
  const [paymentDate, setPaymentDate] = useState(new Date().toISOString().split("T")[0]);

  const { data: summary, isLoading } = useQuery<{
    guests: GuestSummary[];
  }>({
    queryKey: ["/api/account-summary"],
  });

  const { data: accountData, refetch: refetchAccount } = useQuery<AccountData>({
    queryKey: ["/api/guests", viewingGuest?.id, "account"],
    queryFn: async () => {
      const res = await fetch(`/api/guests/${viewingGuest!.id}/account`);
      return res.json();
    },
    enabled: !!viewingGuest,
  });

  const registerPaymentMutation = useMutation({
    mutationFn: async () => {
      return apiRequest("POST", `/api/guests/${viewingGuest!.id}/account/payment`, {
        amount: paymentAmount,
        description: paymentDescription,
        reference: paymentReference || null,
        date: paymentDate,
      });
    },
    onSuccess: () => {
      toast({ title: "Pago registrado correctamente" });
      setRegisterPaymentOpen(false);
      setPaymentAmount("");
      setPaymentDescription("Pago recibido");
      setPaymentReference("");
      refetchAccount();
      queryClient.invalidateQueries({ queryKey: ["/api/account-summary"] });
    },
    onError: () => {
      toast({ title: "Error al registrar pago", variant: "destructive" });
    },
  });

  const guests = summary?.guests ?? [];
  const filtered = guests.filter(g =>
    g.name.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const totalDebt = guests.reduce((s, g) => s + g.balance, 0);

  return (
    <div className="p-6 space-y-6 max-w-4xl mx-auto">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Button
          variant="ghost"
          size="icon"
          onClick={() => navigate("/admin/cuentas")}
          data-testid="button-back-cuentas"
        >
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div>
          <h1 className="text-3xl font-bold tracking-tight" data-testid="text-cc-huespedes-title">
            CC Otros (Huéspedes)
          </h1>
          <p className="text-muted-foreground text-sm">
            Cuentas corrientes de personas físicas — saldos y movimientos
          </p>
        </div>
      </div>

      {/* Resumen total */}
      {!isLoading && (
        <Card className={`border-2 ${totalDebt > 0 ? "border-red-200 dark:border-red-800 bg-red-50/30 dark:bg-red-950/10" : "border-green-200 dark:border-green-800"}`}>
          <CardContent className="pt-6 pb-4 flex items-center justify-between flex-wrap gap-4">
            <div>
              <p className="text-sm text-muted-foreground">Total pendiente — Huéspedes</p>
              <p className={`text-3xl font-bold ${totalDebt > 0 ? "text-red-600" : "text-green-600"}`}
                data-testid="text-total-cc-huespedes">
                ${totalDebt.toLocaleString("es-AR", { minimumFractionDigits: 2 })}
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                {guests.length} huésped(es) con saldo
              </p>
            </div>
            <User className="h-10 w-10 text-muted-foreground/30" />
          </CardContent>
        </Card>
      )}

      {/* Buscador */}
      <div className="relative">
        <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Buscar huésped..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="pl-9"
          data-testid="input-search-cc-huesped"
        />
      </div>

      {/* Lista de huéspedes */}
      {isLoading ? (
        <div className="space-y-2">
          {[1, 2, 3].map(i => <Skeleton key={i} className="h-20 rounded-xl" />)}
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-20 text-muted-foreground">
          <User className="h-12 w-12 mx-auto mb-3 opacity-20" />
          <p className="text-sm">
            {guests.length === 0
              ? "No hay huéspedes con cuenta corriente activa"
              : "Sin resultados para la búsqueda"}
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map(g => (
            <div
              key={g.id}
              className="flex items-center justify-between p-4 rounded-xl border bg-background hover:bg-muted/30 cursor-pointer transition-colors"
              onClick={() => setViewingGuest(g)}
              data-testid={`row-cc-huesped-${g.id}`}
            >
              <div className="flex items-center gap-3">
                <div className="h-9 w-9 rounded-full bg-muted flex items-center justify-center shrink-0">
                  <User className="h-4 w-4 text-muted-foreground" />
                </div>
                <div>
                  <p className="font-medium text-sm">{g.name}</p>
                  {g.lastMovement && (
                    <p className="text-xs text-muted-foreground">
                      Último movimiento: {g.lastMovement}
                    </p>
                  )}
                </div>
              </div>
              <div className="text-right">
                <p className={`font-bold text-sm ${g.balance > 0 ? "text-red-600" : "text-green-600"}`}>
                  ${g.balance.toLocaleString("es-AR", { minimumFractionDigits: 2 })}
                </p>
                <p className="text-[11px] text-muted-foreground">
                  {g.balance > 0 ? "Pendiente" : "Al día"}
                </p>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Detalle de cuenta del huésped */}
      <Sheet open={!!viewingGuest} onOpenChange={(open) => { if (!open) setViewingGuest(null); }}>
        <SheetContent className="w-full sm:max-w-2xl overflow-y-auto">
          <SheetHeader className="mb-4">
            <SheetTitle className="flex items-center gap-2">
              <User className="h-5 w-5" />
              {viewingGuest?.name}
            </SheetTitle>
            <SheetDescription>Cuenta corriente — movimientos y saldo</SheetDescription>
          </SheetHeader>

          {/* Saldo actual */}
          <div className={`rounded-md p-4 mb-4 flex items-center justify-between gap-4 ${
            (accountData?.balance || 0) > 0
              ? "bg-red-50 border border-red-200 dark:bg-red-950/30 dark:border-red-800"
              : "bg-green-50 border border-green-200 dark:bg-green-950/30 dark:border-green-800"
          }`}>
            <div>
              <p className="text-sm text-muted-foreground">Saldo actual</p>
              <p className={`text-3xl font-bold ${
                (accountData?.balance || 0) > 0 ? "text-red-600 dark:text-red-400" : "text-green-600 dark:text-green-400"
              }`} data-testid="text-guest-account-balance">
                ${Math.abs(accountData?.balance || 0).toLocaleString("es-AR", { minimumFractionDigits: 2 })}
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                {(accountData?.balance || 0) > 0 ? "Saldo pendiente de cobro" : "Sin deuda pendiente"}
              </p>
            </div>
            <Button
              onClick={() => setRegisterPaymentOpen(true)}
              disabled={(accountData?.balance || 0) <= 0}
              data-testid="button-register-guest-payment"
            >
              <Plus className="h-4 w-4 mr-2" />
              Registrar pago
            </Button>
          </div>

          {/* Movimientos */}
          {!accountData ? (
            <div className="space-y-2">
              {[1, 2, 3].map(i => <Skeleton key={i} className="h-12" />)}
            </div>
          ) : accountData.movements.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <CreditCard className="h-8 w-8 mx-auto mb-2 opacity-30" />
              <p className="text-sm">Sin movimientos registrados</p>
            </div>
          ) : (
            <div className="border rounded-md overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Fecha</TableHead>
                    <TableHead>Descripción</TableHead>
                    <TableHead>Ref.</TableHead>
                    <TableHead className="text-right">Monto</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {[...accountData.movements]
                    .sort((a, b) => String(b.date).localeCompare(String(a.date)))
                    .map((m) => (
                      <TableRow key={m.id} data-testid={`row-movement-${m.id}`}>
                        <TableCell className="text-xs">{m.date}</TableCell>
                        <TableCell className="text-xs">{m.description}</TableCell>
                        <TableCell className="text-xs text-muted-foreground">{m.reference || "—"}</TableCell>
                        <TableCell className="text-right">
                          <div className="flex items-center justify-end gap-1">
                            {parseFloat(m.amount) > 0
                              ? <TrendingUp className="h-3 w-3 text-red-500" />
                              : <TrendingDown className="h-3 w-3 text-green-500" />
                            }
                            <span className={`text-sm font-medium ${parseFloat(m.amount) > 0 ? "text-red-600" : "text-green-600"}`}>
                              ${Math.abs(parseFloat(m.amount)).toLocaleString("es-AR", { minimumFractionDigits: 2 })}
                            </span>
                          </div>
                          <p className="text-[10px] text-muted-foreground text-right">
                            {parseFloat(m.amount) > 0 ? "Cargo" : "Pago"}
                          </p>
                        </TableCell>
                      </TableRow>
                    ))}
                </TableBody>
              </Table>
            </div>
          )}
        </SheetContent>
      </Sheet>

      {/* Dialog para registrar pago */}
      <Dialog open={registerPaymentOpen} onOpenChange={setRegisterPaymentOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Registrar pago — {viewingGuest?.name}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="grid gap-1.5">
              <Label>Monto</Label>
              <Input
                type="number"
                min="0"
                step="0.01"
                placeholder="0.00"
                value={paymentAmount}
                onChange={(e) => setPaymentAmount(e.target.value)}
                data-testid="input-guest-payment-amount"
              />
            </div>
            <div className="grid gap-1.5">
              <Label>Descripción</Label>
              <Input
                value={paymentDescription}
                onChange={(e) => setPaymentDescription(e.target.value)}
                data-testid="input-guest-payment-description"
              />
            </div>
            <div className="grid gap-1.5">
              <Label>Referencia (opcional)</Label>
              <Input
                value={paymentReference}
                onChange={(e) => setPaymentReference(e.target.value)}
                placeholder="Nº recibo, transferencia..."
                data-testid="input-guest-payment-reference"
              />
            </div>
            <div className="grid gap-1.5">
              <Label>Fecha</Label>
              <Input
                type="date"
                value={paymentDate}
                onChange={(e) => setPaymentDate(e.target.value)}
                data-testid="input-guest-payment-date"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRegisterPaymentOpen(false)}>
              Cancelar
            </Button>
            <Button
              onClick={() => registerPaymentMutation.mutate()}
              disabled={!paymentAmount || parseFloat(paymentAmount) <= 0 || registerPaymentMutation.isPending}
              data-testid="button-confirm-guest-payment"
            >
              {registerPaymentMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Confirmar pago
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
