import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { getLocalToday, formatDateAR } from "@/lib/utils";
import {
  LogOut,
  Search,
  Calendar,
  User,
  DoorOpen,
  Check,
  Clock,
  CreditCard,
  Plus,
  ChevronRight,
  ChevronLeft,
  CircleCheck,
  Trash2,
  ArrowLeft,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
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
import { queryClient, apiRequest } from "@/lib/queryClient";
import type { ReservationWithDetails, Charge, Payment, PaymentMethod } from "@shared/schema";

const paymentMethodLabels: Record<PaymentMethod, string> = {
  efectivo: "Efectivo",
  tarjeta_debito: "Tarjeta Débito",
  tarjeta_credito: "Tarjeta Crédito",
  transferencia: "Transferencia",
  mercadopago: "MercadoPago",
  cuenta_corriente: "Cuenta Corriente",
};

interface FolioData {
  reservationCode: string;
  guestName: string;
  roomNumber: string;
  checkInDate: string;
  checkOutDate: string;
  nights: number;
  roomRate: string;
  roomTotal: number;
  charges: Charge[];
  totalCharges: number;
  payments: Payment[];
  totalPayments: number;
  grandTotal: number;
  balance: number;
}

export default function CheckOutPage() {
  const { toast } = useToast();
  const [, setLocation] = useLocation();
  const [searchQuery, setSearchQuery] = useState("");
  const [showAllCheckouts, setShowAllCheckouts] = useState(false);
  const [selectedReservation, setSelectedReservation] = useState<ReservationWithDetails | null>(null);
  const [wizardStep, setWizardStep] = useState(0);
  const [addChargeOpen, setAddChargeOpen] = useState(false);
  const [newChargeDesc, setNewChargeDesc] = useState("");
  const [newChargeAmount, setNewChargeAmount] = useState("");
  const [paymentAmount, setPaymentAmount] = useState("");
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("efectivo");
  const [paymentReference, setPaymentReference] = useState("");
  const [paymentBillingTarget, setPaymentBillingTarget] = useState<"guest" | "company">("guest");
  const [checkoutComplete, setCheckoutComplete] = useState(false);
  const [finalSummary, setFinalSummary] = useState<{ guestName: string; roomNumber: string; checkOutDate: string; totalPaid: number; methods: string[] } | null>(null);

  const { data: reservations, isLoading } = useQuery<ReservationWithDetails[]>({
    queryKey: ["/api/reservations/check-out"],
  });

  const { data: folio, refetch: refetchFolio } = useQuery<FolioData>({
    queryKey: ["/api/reservations", selectedReservation?.id, "folio"],
    queryFn: async () => {
      const res = await fetch(`/api/reservations/${selectedReservation!.id}/folio`);
      return res.json();
    },
    enabled: !!selectedReservation,
  });

  const addChargeMutation = useMutation({
    mutationFn: async (data: { description: string; amount: string }) => {
      return apiRequest("POST", "/api/charges", {
        reservationId: selectedReservation!.id,
        description: data.description,
        amount: data.amount,
        date: getLocalToday(),
        category: "otros",
      });
    },
    onSuccess: () => {
      refetchFolio();
      setAddChargeOpen(false);
      setNewChargeDesc("");
      setNewChargeAmount("");
      toast({ title: "Cargo agregado" });
    },
  });

  const addPaymentMutation = useMutation({
    mutationFn: async (data: { amount: string; method: PaymentMethod; reference: string; billingTarget: "guest" | "company" }) => {
      return apiRequest("POST", "/api/payments", {
        reservationId: selectedReservation!.id,
        amount: data.amount,
        method: data.method,
        date: getLocalToday(),
        reference: data.reference || null,
        billingTarget: data.billingTarget,
      });
    },
    onSuccess: () => {
      refetchFolio();
      setPaymentAmount("");
      setPaymentReference("");
      setPaymentBillingTarget("guest");
      toast({ title: "Pago registrado" });
    },
    onError: (error: any) => {
      const message = error?.data?.error || error?.message || "No se pudo registrar el pago";
      toast({
        title: "Error al registrar pago",
        description: message,
        variant: "destructive",
      });
      console.error("Payment error:", error);
    },
  });

  const checkOutMutation = useMutation({
    mutationFn: async (id: string) => {
      return apiRequest("POST", `/api/reservations/${id}/check-out`, {});
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/reservations"] });
      queryClient.invalidateQueries({ queryKey: ["/api/reservations/check-out"] });
      queryClient.invalidateQueries({ queryKey: ["/api/reservations/recent"] });
      queryClient.invalidateQueries({ queryKey: ["/api/rooms"] });
      queryClient.invalidateQueries({ queryKey: ["/api/dashboard/stats"] });
      queryClient.invalidateQueries({ predicate: (query) => 
        Array.isArray(query.queryKey) && query.queryKey[0] === "/api/planning"
      });
      queryClient.invalidateQueries({ queryKey: ["/api/housekeeping"] });

      const methods = folio?.payments?.map(p => paymentMethodLabels[p.method as PaymentMethod] || p.method) || [];
      setFinalSummary({
        guestName: `${selectedReservation?.guest?.firstName} ${selectedReservation?.guest?.lastName}`,
        roomNumber: selectedReservation?.room?.roomNumber || "",
        checkOutDate: new Date().toLocaleDateString("es-AR"),
        totalPaid: folio?.totalPayments || 0,
        methods: [...new Set(methods)],
      });
      setCheckoutComplete(true);
      setWizardStep(3);
    },
    onError: async (error: any) => {
      let message = "No se pudo realizar el check-out. Intente nuevamente.";
      try {
        if (error?.message) message = error.message;
      } catch {}
      toast({
        title: "Error",
        description: message,
        variant: "destructive",
      });
    },
  });

  const today = getLocalToday();
  const filteredReservations = reservations?.filter((res) => {
    const guestName = `${res.guest?.firstName} ${res.guest?.lastName}`.toLowerCase();
    const matchesSearch =
      guestName.includes(searchQuery.toLowerCase()) ||
      res.room?.roomNumber?.toLowerCase().includes(searchQuery.toLowerCase());
    if (!matchesSearch) return false;
    if (showAllCheckouts) return true;
    const isToday = res.checkOutDate === today;
    const isOverdue = res.checkOutDate < today;
    return isToday || isOverdue;
  });

  const startCheckout = (reservation: ReservationWithDetails) => {
    setSelectedReservation(reservation);
    setWizardStep(1);
    setCheckoutComplete(false);
    setFinalSummary(null);
  };

  const cancelWizard = () => {
    setSelectedReservation(null);
    setWizardStep(0);
    setCheckoutComplete(false);
    setFinalSummary(null);
  };

  const todayDisplay = new Date().toLocaleDateString("es-ES", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  const balance = folio?.balance || 0;

  if (wizardStep > 0 && selectedReservation) {
    return (
      <div className="flex flex-col gap-6 p-6">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={cancelWizard} data-testid="button-cancel-wizard">
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div>
            <h1 className="text-2xl font-bold tracking-tight" data-testid="text-wizard-title">
              Check-out — {selectedReservation.guest?.firstName} {selectedReservation.guest?.lastName}
            </h1>
            <p className="text-muted-foreground">Hab. {selectedReservation.room?.roomNumber}</p>
          </div>
        </div>

        <div className="flex items-center gap-2 mb-2">
          {[1, 2, 3].map((step) => (
            <div key={step} className="flex items-center gap-2">
              <div
                className={`flex h-8 w-8 items-center justify-center rounded-full text-sm font-semibold ${
                  wizardStep === step
                    ? "bg-primary text-primary-foreground"
                    : wizardStep > step
                    ? "bg-green-500 text-white"
                    : "bg-muted text-muted-foreground"
                }`}
                data-testid={`step-indicator-${step}`}
              >
                {wizardStep > step ? <Check className="h-4 w-4" /> : step}
              </div>
              <span className={`text-sm ${wizardStep === step ? "font-semibold" : "text-muted-foreground"}`}>
                {step === 1 ? "Resumen" : step === 2 ? "Pago" : "Confirmación"}
              </span>
              {step < 3 && <ChevronRight className="h-4 w-4 text-muted-foreground" />}
            </div>
          ))}
        </div>

        {wizardStep === 1 && (
          <div className="grid gap-4">
            <Card>
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-base">Cargos</CardTitle>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setAddChargeOpen(true)}
                    data-testid="button-add-charge"
                  >
                    <Plus className="h-4 w-4 mr-1" /> Agregar cargo
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Descripción</TableHead>
                      <TableHead>Fecha</TableHead>
                      <TableHead className="text-right">Monto</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    <TableRow className="bg-muted/50">
                      <TableCell className="font-medium">Alojamiento ({folio?.nights || selectedReservation.nights} noches)</TableCell>
                      <TableCell>{formatDateAR(selectedReservation.checkInDate)} → {formatDateAR(selectedReservation.checkOutDate)}</TableCell>
                      <TableCell className="text-right font-medium">${(folio?.roomTotal || parseFloat(selectedReservation.totalRoomAmount || "0")).toFixed(2)}</TableCell>
                    </TableRow>
                    {folio?.charges?.map((charge) => (
                      <TableRow key={charge.id} data-testid={`charge-row-${charge.id}`}>
                        <TableCell>{charge.description}</TableCell>
                        <TableCell>{formatDateAR(charge.date)}</TableCell>
                        <TableCell className="text-right">${parseFloat(charge.amount).toFixed(2)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
                <div className="flex justify-end mt-3 pt-3 border-t">
                  <div className="text-right">
                    <p className="text-sm text-muted-foreground">Total cargos</p>
                    <p className="text-lg font-bold" data-testid="text-total-charges">${(folio?.grandTotal || 0).toFixed(2)}</p>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Pagos registrados</CardTitle>
              </CardHeader>
              <CardContent>
                {folio?.payments && folio.payments.length > 0 ? (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Fecha</TableHead>
                        <TableHead>Método</TableHead>
                        <TableHead className="text-right">Monto</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {folio.payments.map((payment) => (
                        <TableRow key={payment.id} data-testid={`payment-row-${payment.id}`}>
                          <TableCell>{formatDateAR(payment.date)}</TableCell>
                          <TableCell>{paymentMethodLabels[payment.method as PaymentMethod] || payment.method}</TableCell>
                          <TableCell className="text-right">${parseFloat(payment.amount).toFixed(2)}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                ) : (
                  <p className="text-sm text-muted-foreground text-center py-4">Sin pagos registrados</p>
                )}
                <div className="flex justify-end mt-3 pt-3 border-t">
                  <div className="text-right">
                    <p className="text-sm text-muted-foreground">Total pagado</p>
                    <p className="text-lg font-bold" data-testid="text-total-payments">${(folio?.totalPayments || 0).toFixed(2)}</p>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className={balance > 0.01 ? "border-red-300 bg-red-50 dark:bg-red-900/10 dark:border-red-800" : "border-green-300 bg-green-50 dark:bg-green-900/10 dark:border-green-800"}>
              <CardContent className="flex items-center justify-between p-4">
                <div>
                  <p className="text-sm font-medium">Saldo pendiente</p>
                  <p className={`text-2xl font-bold ${balance > 0.01 ? "text-red-600 dark:text-red-400" : "text-green-600 dark:text-green-400"}`} data-testid="text-balance">
                    ${balance.toFixed(2)}
                  </p>
                </div>
                {balance <= 0.01 && <CircleCheck className="h-8 w-8 text-green-500" />}
              </CardContent>
            </Card>

            <div className="flex justify-end">
              <Button onClick={() => setWizardStep(2)} data-testid="button-continue-to-payment">
                Continuar al pago <ChevronRight className="h-4 w-4 ml-1" />
              </Button>
            </div>

            <Dialog open={addChargeOpen} onOpenChange={setAddChargeOpen}>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Agregar cargo</DialogTitle>
                  <DialogDescription>Agregar un cargo de último momento al folio.</DialogDescription>
                </DialogHeader>
                <div className="grid gap-4 py-4">
                  <div>
                    <Label>Descripción</Label>
                    <Input
                      value={newChargeDesc}
                      onChange={(e) => setNewChargeDesc(e.target.value)}
                      placeholder="Ej: Minibar, Lavandería..."
                      data-testid="input-charge-description"
                    />
                  </div>
                  <div>
                    <Label>Monto</Label>
                    <Input
                      type="number"
                      step="0.01"
                      min="0"
                      value={newChargeAmount}
                      onChange={(e) => setNewChargeAmount(e.target.value)}
                      placeholder="0.00"
                      data-testid="input-charge-amount"
                    />
                  </div>
                </div>
                <DialogFooter>
                  <Button variant="outline" onClick={() => setAddChargeOpen(false)}>Cancelar</Button>
                  <Button
                    onClick={() => addChargeMutation.mutate({ description: newChargeDesc, amount: newChargeAmount })}
                    disabled={!newChargeDesc || !newChargeAmount || addChargeMutation.isPending}
                    data-testid="button-confirm-charge"
                  >
                    {addChargeMutation.isPending ? "Guardando..." : "Agregar"}
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </div>
        )}

        {wizardStep === 2 && (
          <div className="grid gap-4">
            {balance <= 0.01 ? (
              <Card className="border-green-300 bg-green-50 dark:bg-green-900/10 dark:border-green-800">
                <CardContent className="flex flex-col items-center py-8 gap-3">
                  <CircleCheck className="h-12 w-12 text-green-500" />
                  <h3 className="text-lg font-semibold text-green-700 dark:text-green-400" data-testid="text-account-settled">Cuenta saldada</h3>
                  <p className="text-sm text-muted-foreground">El huésped no tiene saldo pendiente.</p>
                </CardContent>
              </Card>
            ) : (
              <>
                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-base">Registrar pago</CardTitle>
                    <CardDescription>
                      Saldo pendiente: <span className="font-bold text-red-600 dark:text-red-400">${balance.toFixed(2)}</span>
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="grid gap-4">
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <Label>Monto</Label>
                        <Input
                          type="number"
                          step="0.01"
                          min="0"
                          value={paymentAmount}
                          onChange={(e) => setPaymentAmount(e.target.value)}
                          placeholder={balance.toFixed(2)}
                          data-testid="input-payment-amount"
                        />
                      </div>
                      <div>
                        <Label>Método de pago</Label>
                        <Select value={paymentMethod} onValueChange={(v) => setPaymentMethod(v as PaymentMethod)}>
                          <SelectTrigger data-testid="select-payment-method">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {Object.entries(paymentMethodLabels).map(([value, label]) => (
                              <SelectItem key={value} value={value}>{label}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <Label>Referencia (opcional)</Label>
                        <Input
                          value={paymentReference}
                          onChange={(e) => setPaymentReference(e.target.value)}
                          placeholder="N° de comprobante..."
                          data-testid="input-payment-reference"
                        />
                      </div>
                      <div>
                        <Label>Facturar a</Label>
                        <Select value={paymentBillingTarget} onValueChange={(v) => setPaymentBillingTarget(v as "guest" | "company")}>
                          <SelectTrigger data-testid="select-billing-target">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="guest">Huésped</SelectItem>
                            <SelectItem value="company">Empresa</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                    <Button
                      onClick={() => {
                        const amount = paymentAmount || balance.toFixed(2);
                        if (!amount || parseFloat(amount) <= 0) {
                          toast({ title: "Ingresá un monto válido", variant: "destructive" });
                          return;
                        }
                        addPaymentMutation.mutate({
                          amount,
                          method: paymentMethod,
                          reference: paymentReference,
                          billingTarget: paymentBillingTarget,
                        });
                      }}
                      disabled={addPaymentMutation.isPending}
                      data-testid="button-register-payment"
                    >
                      {addPaymentMutation.isPending ? "Registrando..." : "Registrar pago"}
                    </Button>
                  </CardContent>
                </Card>

                {folio?.payments && folio.payments.length > 0 && (
                  <Card>
                    <CardHeader className="pb-3">
                      <CardTitle className="text-base">Pagos registrados</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Método</TableHead>
                            <TableHead className="text-right">Monto</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {folio.payments.map((p) => (
                            <TableRow key={p.id}>
                              <TableCell>
                                <div className="flex items-center gap-1.5">
                                  <span>{paymentMethodLabels[p.method as PaymentMethod] || p.method}</span>
                                  {(p as any).billingTarget === "company" && (
                                    <Badge variant="secondary" className="text-xs">Empresa</Badge>
                                  )}
                                </div>
                              </TableCell>
                              <TableCell className="text-right">${parseFloat(p.amount).toFixed(2)}</TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </CardContent>
                  </Card>
                )}

                <Card className="border-red-300 bg-red-50 dark:bg-red-900/10 dark:border-red-800">
                  <CardContent className="flex items-center justify-between p-4">
                    <p className="font-medium">Saldo restante</p>
                    <p className="text-xl font-bold text-red-600 dark:text-red-400" data-testid="text-remaining-balance">${balance.toFixed(2)}</p>
                  </CardContent>
                </Card>
              </>
            )}

            <div className="flex justify-between">
              <Button variant="outline" onClick={() => setWizardStep(1)} data-testid="button-back-to-summary">
                <ChevronLeft className="h-4 w-4 mr-1" /> Volver al resumen
              </Button>
              <Button
                onClick={() => selectedReservation && checkOutMutation.mutate(selectedReservation.id)}
                disabled={balance > 0.01 || checkOutMutation.isPending}
                data-testid="button-confirm-checkout"
              >
                {checkOutMutation.isPending ? "Procesando..." : "Confirmar Check-out"}
              </Button>
            </div>
          </div>
        )}

        {wizardStep === 3 && checkoutComplete && finalSummary && (
          <div className="grid gap-4">
            <Card className="border-green-300 bg-green-50 dark:bg-green-900/10 dark:border-green-800">
              <CardContent className="flex flex-col items-center py-8 gap-4">
                <div className="flex h-16 w-16 items-center justify-center rounded-full bg-green-100 dark:bg-green-900/40">
                  <CircleCheck className="h-10 w-10 text-green-600 dark:text-green-400" />
                </div>
                <h2 className="text-xl font-bold text-green-700 dark:text-green-400" data-testid="text-checkout-complete">
                  Check-out completado
                </h2>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Resumen final</CardTitle>
              </CardHeader>
              <CardContent className="grid gap-3">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <p className="text-sm text-muted-foreground">Huésped</p>
                    <p className="font-medium" data-testid="text-summary-guest">{finalSummary.guestName}</p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Habitación</p>
                    <p className="font-medium" data-testid="text-summary-room">{finalSummary.roomNumber}</p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Fecha de salida</p>
                    <p className="font-medium" data-testid="text-summary-date">{finalSummary.checkOutDate}</p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Total cobrado</p>
                    <p className="font-medium" data-testid="text-summary-total">${finalSummary.totalPaid.toFixed(2)}</p>
                  </div>
                </div>
                {finalSummary.methods.length > 0 && (
                  <div>
                    <p className="text-sm text-muted-foreground">Método(s) de pago</p>
                    <div className="flex gap-2 mt-1">
                      {finalSummary.methods.map((m) => (
                        <Badge key={m} variant="secondary">{m}</Badge>
                      ))}
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>

            <Card className="bg-blue-50 border-blue-200 dark:bg-blue-900/10 dark:border-blue-800">
              <CardContent className="flex items-center gap-3 p-4">
                <DoorOpen className="h-5 w-5 text-blue-600 dark:text-blue-400" />
                <p className="text-sm" data-testid="text-housekeeping-notice">
                  La habitación <strong>{finalSummary.roomNumber}</strong> fue enviada a Housekeeping para limpieza.
                </p>
              </CardContent>
            </Card>

            <div className="flex justify-center">
              <Button onClick={() => setLocation("/planning")} data-testid="button-back-to-planning">
                Volver al Planning
              </Button>
            </div>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6 p-6">
      <div className="flex flex-col gap-1">
        <h1 className="text-3xl font-bold tracking-tight" data-testid="text-checkout-title">
          Check-out
        </h1>
        <p className="text-muted-foreground capitalize">{todayDisplay}</p>
      </div>

      <Card className="bg-orange-50 border-orange-200 dark:bg-orange-900/20 dark:border-orange-800">
        <CardContent className="flex items-center gap-4 p-4">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-orange-100 dark:bg-orange-900/40">
            <LogOut className="h-6 w-6 text-orange-600 dark:text-orange-400" />
          </div>
          <div>
            <h3 className="font-semibold">Registro de Salidas</h3>
            <p className="text-sm text-muted-foreground">
              Huéspedes activos listos para check-out
            </p>
          </div>
          <Badge className="ml-auto bg-orange-100 text-orange-800 dark:bg-orange-900/40 dark:text-orange-400" data-testid="badge-active-count">
            {reservations?.length || 0} activos
          </Badge>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-4">
          <div className="flex items-center gap-3">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Buscar por nombre de huésped o número de habitación..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10"
                data-testid="input-search-checkout"
              />
            </div>
            <Button
              variant={showAllCheckouts ? "default" : "outline"}
              size="sm"
              onClick={() => setShowAllCheckouts(!showAllCheckouts)}
              data-testid="button-toggle-all-checkouts"
            >
              {showAllCheckouts ? "Solo hoy" : "Ver todos"}
            </Button>
          </div>
        </CardContent>
      </Card>

      {isLoading ? (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {[...Array(3)].map((_, i) => (
            <Skeleton key={i} className="h-48" />
          ))}
        </div>
      ) : filteredReservations && filteredReservations.length > 0 ? (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {filteredReservations.map((reservation) => (
            <Card
              key={reservation.id}
              className="hover-elevate"
              data-testid={`checkout-card-${reservation.id}`}
            >
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-full bg-blue-100 text-blue-600 dark:bg-blue-900/40 dark:text-blue-400 font-semibold">
                      {reservation.guest?.firstName?.[0]}{reservation.guest?.lastName?.[0]}
                    </div>
                    <div>
                      <CardTitle className="text-lg">
                        {reservation.guest?.firstName} {reservation.guest?.lastName}
                      </CardTitle>
                      <CardDescription>{reservation.guest?.phone || reservation.guest?.email}</CardDescription>
                    </div>
                  </div>
                  <div className="flex flex-col items-end gap-1">
                    <Badge className="bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-400">
                      Alojado
                    </Badge>
                    {reservation.checkOutDate === today ? (
                      <Badge className="text-xs bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-400" data-testid={`badge-today-${reservation.id}`}>Hoy</Badge>
                    ) : reservation.checkOutDate < today ? (
                      <Badge className="text-xs bg-orange-100 text-orange-800 dark:bg-orange-900/40 dark:text-orange-400" data-testid={`badge-overdue-${reservation.id}`}>Vencido</Badge>
                    ) : null}
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <div className="flex items-center gap-2 text-sm">
                    <DoorOpen className="h-4 w-4 text-muted-foreground" />
                    <span>Hab. {reservation.room?.roomNumber}</span>
                  </div>
                  <div className="flex items-center gap-2 text-sm">
                    <User className="h-4 w-4 text-muted-foreground" />
                    <span>{reservation.numberOfGuests} huésped(es)</span>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="flex items-center gap-2 text-sm">
                    <Calendar className="h-4 w-4 text-muted-foreground" />
                    <span>Desde: {formatDateAR(reservation.checkInDate)}</span>
                  </div>
                  <div className="flex items-center gap-2 text-sm">
                    <Clock className="h-4 w-4 text-muted-foreground" />
                    <span>Hasta: {formatDateAR(reservation.checkOutDate)}</span>
                  </div>
                </div>
                <div className="flex items-center justify-between p-3 bg-muted rounded-lg">
                  <div className="flex items-center gap-2">
                    <CreditCard className="h-4 w-4 text-muted-foreground" />
                    <span className="text-sm">Total habitación</span>
                  </div>
                  <span className="text-lg font-bold">${parseFloat(reservation.totalRoomAmount || "0").toFixed(2)}</span>
                </div>
                <div className="pt-2">
                  <Button
                    variant="outline"
                    className="w-full border-orange-300 text-orange-700 hover:bg-orange-50 dark:border-orange-700 dark:text-orange-400 dark:hover:bg-orange-900/20"
                    onClick={() => startCheckout(reservation)}
                    data-testid={`button-checkout-${reservation.id}`}
                  >
                    <LogOut className="mr-2 h-4 w-4" />
                    Realizar Check-out
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12 text-center">
            <LogOut className="h-16 w-16 text-muted-foreground/50 mb-4" />
            <h3 className="text-lg font-semibold mb-2">No hay check-outs pendientes</h3>
            <p className="text-muted-foreground">
              {searchQuery
                ? "No se encontraron huéspedes con los criterios de búsqueda."
                : "No hay huéspedes alojados actualmente."}
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
