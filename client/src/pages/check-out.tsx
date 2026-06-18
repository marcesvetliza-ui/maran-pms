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
  AlertCircle,
  Loader2,
  RotateCcw,
  Building2,
  ListChecks,
  X,
} from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
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
  const [showOverdueDialog, setShowOverdueDialog] = useState(false);
  const [bulkClosing, setBulkClosing] = useState(false);
  const [selectedReservation, setSelectedReservation] = useState<ReservationWithDetails | null>(null);
  const [wizardStep, setWizardStep] = useState(0);
  const [addChargeOpen, setAddChargeOpen] = useState(false);
  const [newChargeDesc, setNewChargeDesc] = useState("");
  const [newChargeAmount, setNewChargeAmount] = useState("");
  const [paymentAmount, setPaymentAmount] = useState("");
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("efectivo");
  const [paymentReference, setPaymentReference] = useState("");
  const [paymentReceiptType, setPaymentReceiptType] = useState("cierre_habitacion");
  const [paymentBillingTarget, setPaymentBillingTarget] = useState<"guest" | "company" | "agency">("guest");
  const [checkoutComplete, setCheckoutComplete] = useState(false);
  const [finalSummary, setFinalSummary] = useState<{ guestName: string; roomNumber: string; checkOutDate: string; totalPaid: number; methods: string[] } | null>(null);
  const [ccCompanyId, setCcCompanyId] = useState("");
  const [ccAgencyId, setCcAgencyId] = useState("");
  const [earlyCheckoutDialog, setEarlyCheckoutDialog] = useState(false);
  const [itemPayMode, setItemPayMode] = useState(false);
  const [selectedItemIds, setSelectedItemIds] = useState<Set<string>>(new Set());

  const handleToggleItem = (id: string, amount: number) => {
    const next = new Set(selectedItemIds);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelectedItemIds(next);
    if (folio) {
      let total = 0;
      if (next.has("accommodation")) total += folio.roomTotal;
      (folio.charges || []).forEach((c: any) => {
        if (next.has(c.id)) total += parseFloat(c.amount);
      });
      setPaymentAmount(total > 0 ? total.toFixed(2) : "");
    }
  };

  const exitItemPayMode = () => {
    setItemPayMode(false);
    setSelectedItemIds(new Set());
    setPaymentAmount("");
  };

  const { data: reservations, isLoading } = useQuery<ReservationWithDetails[]>({
    queryKey: ["/api/dashboard/departures"],
  });

  const { data: companies = [] } = useQuery<{ id: string; name: string }[]>({
    queryKey: ["/api/companies"],
  });
  const { data: agencies = [] } = useQuery<{ id: string; name: string }[]>({
    queryKey: ["/api/agencies"],
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
    onError: (error: any) => {
      toast({ title: "Error", description: error?.message || "No se pudo agregar el cargo", variant: "destructive" });
    },
  });

  const addPaymentMutation = useMutation({
    mutationFn: async (data: { amount: string; method: PaymentMethod; reference: string; receiptType: string; billingTarget: "guest" | "company" | "agency"; companyId?: string; agencyId?: string }) => {
      return apiRequest("POST", "/api/payments", {
        reservationId: selectedReservation!.id,
        amount: data.amount,
        method: data.method,
        date: getLocalToday(),
        reference: data.reference || null,
        receiptType: data.receiptType,
        billingTarget: data.billingTarget,
        companyId: data.companyId || null,
        agencyId: data.agencyId || null,
      });
    },
    onSuccess: () => {
      refetchFolio();
      setPaymentAmount("");
      setPaymentReference("");
      setPaymentReceiptType("cierre_habitacion");
      setPaymentBillingTarget("guest");
      setCcCompanyId("");
      setCcAgencyId("");
      setItemPayMode(false);
      setSelectedItemIds(new Set());
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

  const undoCheckoutMutation = useMutation({
    mutationFn: async (id: string) => {
      return apiRequest("POST", `/api/reservations/${id}/undo-checkout`, {});
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/reservations"] });
      queryClient.invalidateQueries({ queryKey: ["/api/reservations/check-out"] });
      queryClient.invalidateQueries({ queryKey: ["/api/rooms"] });
      queryClient.invalidateQueries({ queryKey: ["/api/dashboard/stats"] });
      toast({ title: "Check-out anulado", description: "El huésped permanece en la habitación." });
      cancelWizard();
    },
    onError: async (error: any) => {
      let message = "No se pudo anular el check-out.";
      try { if (error?.message) message = error.message; } catch {}
      toast({ title: "Error", description: message, variant: "destructive" });
    },
  });

  const bulkCheckoutOverdueMutation = useMutation({
    mutationFn: async (force: boolean = false) => {
      return apiRequest("POST", `/api/reservations/bulk-checkout-overdue`, { force });
    },
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ["/api/reservations"] });
      queryClient.invalidateQueries({ queryKey: ["/api/reservations/check-out"] });
      queryClient.invalidateQueries({ queryKey: ["/api/rooms"] });
      queryClient.invalidateQueries({ queryKey: ["/api/dashboard/stats"] });
      setBulkClosing(false);
      setShowOverdueDialog(false);
      toast({
        title: "Cierre masivo completado",
        description: `${data.closed} salidas registradas. ${data.skipped > 0 ? `${data.skipped} con saldo pendiente (requieren revisión manual).` : ""}`,
      });
    },
    onError: () => {
      setBulkClosing(false);
      toast({ title: "Error", description: "No se pudo completar el cierre masivo.", variant: "destructive" });
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
        guestName: `${selectedReservation?.guest?.lastName} ${selectedReservation?.guest?.firstName}`,
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
  const overdueReservations = reservations?.filter((res) => res.checkOutDate < today) ?? [];
  const filteredReservations = reservations?.filter((res) => {
    if (res.checkOutDate > today) return false;
    const guestName = `${res.guest?.lastName} ${res.guest?.firstName}`.toLowerCase();
    return (
      guestName.includes(searchQuery.toLowerCase()) ||
      res.room?.roomNumber?.toLowerCase().includes(searchQuery.toLowerCase())
    );
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
  const isHistorical = selectedReservation ? selectedReservation.checkOutDate < today : false;
  const isEarlyCheckout = selectedReservation ? selectedReservation.checkOutDate > today : false;

  if (wizardStep > 0 && selectedReservation) {
    return (
      <div className="flex flex-col gap-6 p-6">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={cancelWizard} data-testid="button-cancel-wizard">
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div>
            <h1 className="text-2xl font-bold tracking-tight" data-testid="text-wizard-title">
              Check-out — {selectedReservation.guest?.lastName} {selectedReservation.guest?.firstName}
            </h1>
            <p className="text-muted-foreground">Hab. {selectedReservation.room?.roomNumber}</p>
          </div>
        </div>

        {selectedReservation.status !== "checked_in" && (
          <div className="flex items-start gap-3 rounded-lg border border-amber-300 bg-amber-50 dark:border-amber-700 dark:bg-amber-950/40 px-4 py-3" data-testid="banner-no-checkin">
            <AlertCircle className="h-5 w-5 text-amber-600 dark:text-amber-400 mt-0.5 shrink-0" />
            <div>
              <p className="font-semibold text-amber-800 dark:text-amber-300">Check-in no procesado en el sistema</p>
              <p className="text-sm text-amber-700 dark:text-amber-400">
                Esta reserva nunca fue marcada como ingresada. El sistema procesará el check-out directamente y cerrará la habitación.
              </p>
            </div>
          </div>
        )}
        {isHistorical && (
          <div className="flex items-start gap-3 rounded-lg border border-amber-300 bg-amber-50 dark:border-amber-700 dark:bg-amber-950/40 px-4 py-3" data-testid="banner-historical-checkout">
            <AlertCircle className="h-5 w-5 text-amber-600 dark:text-amber-400 mt-0.5 shrink-0" />
            <div>
              <p className="font-semibold text-amber-800 dark:text-amber-300">Cerrando habitación histórica</p>
              <p className="text-sm text-amber-700 dark:text-amber-400">
                La fecha de salida original era {formatDateAR(selectedReservation.checkOutDate)}.
                El sistema cerrará la habitación tal como está, sin permitir modificaciones.
                El cierre quedará registrado con fecha de hoy.
              </p>
            </div>
          </div>
        )}
        {isEarlyCheckout && (
          <div className="flex items-start gap-3 rounded-lg border border-orange-300 bg-orange-50 dark:border-orange-800 dark:bg-orange-950/40 px-4 py-3" data-testid="banner-early-checkout">
            <AlertCircle className="h-5 w-5 text-orange-600 dark:text-orange-400 mt-0.5 shrink-0" />
            <div>
              <p className="font-semibold text-orange-800 dark:text-orange-300">Salida anticipada</p>
              <p className="text-sm text-orange-700 dark:text-orange-400">
                La fecha de salida programada era <strong>{formatDateAR(selectedReservation.checkOutDate)}</strong>.
                Se registrará el check-out con la fecha de hoy.
              </p>
            </div>
          </div>
        )}

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
                  {!isHistorical && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setAddChargeOpen(true)}
                      data-testid="button-add-charge"
                    >
                      <Plus className="h-4 w-4 mr-1" /> Agregar cargo
                    </Button>
                  )}
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
                  <p className="text-sm font-medium">{balance < -0.01 ? "Saldo a favor del huésped" : "Saldo pendiente"}</p>
                  <p className={`text-2xl font-bold ${balance > 0.01 ? "text-red-600 dark:text-red-400" : "text-green-600 dark:text-green-400"}`} data-testid="text-balance">
                    {balance < -0.01 ? `+$${Math.abs(balance).toFixed(2)}` : `$${balance.toFixed(2)}`}
                  </p>
                </div>
                {balance <= 0.01 && <CircleCheck className="h-8 w-8 text-green-500" />}
              </CardContent>
            </Card>

            <div className="flex justify-end">
              <Button onClick={() => setWizardStep(2)} data-testid="button-continue-to-payment">
                {isHistorical ? "Continuar al cierre" : "Continuar al pago"} <ChevronRight className="h-4 w-4 ml-1" />
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
            {isHistorical && (
              <Card className="border-amber-300 bg-amber-50 dark:bg-amber-900/10 dark:border-amber-800">
                <CardContent className="flex items-start gap-3 py-4">
                  <AlertCircle className="h-5 w-5 text-amber-500 mt-0.5 shrink-0" />
                  <div>
                    <p className="font-semibold text-amber-700 dark:text-amber-400">Cierre histórico</p>
                    <p className="text-sm text-muted-foreground">
                      La habitación se cerrará con fecha de hoy.
                      {balance > 0.01 && (
                        <span className="block mt-0.5 font-medium text-amber-700 dark:text-amber-400">
                          Podés registrar el pago antes de cerrar.
                        </span>
                      )}
                    </p>
                  </div>
                </CardContent>
              </Card>
            )}

            {balance <= 0.01 ? (
              !isHistorical && (
                <Card className="border-green-300 bg-green-50 dark:bg-green-900/10 dark:border-green-800">
                  <CardContent className="flex flex-col items-center py-8 gap-3">
                    <CircleCheck className="h-12 w-12 text-green-500" />
                    <h3 className="text-lg font-semibold text-green-700 dark:text-green-400" data-testid="text-account-settled">Cuenta saldada</h3>
                    <p className="text-sm text-muted-foreground">El huésped no tiene saldo pendiente.</p>
                  </CardContent>
                </Card>
              )
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

                    {/* Panel de selección por ítem */}
                    {itemPayMode && folio && (
                      <div className="rounded-md border border-amber-200 bg-amber-50 dark:bg-amber-900/10 dark:border-amber-800">
                        <div className="flex items-center justify-between px-3 py-2 border-b border-amber-200 dark:border-amber-800">
                          <div className="flex items-center gap-2">
                            <ListChecks className="h-4 w-4 text-amber-700 dark:text-amber-400" />
                            <span className="text-sm font-medium text-amber-800 dark:text-amber-300">Seleccionar ítems a cobrar</span>
                          </div>
                          <Button variant="ghost" size="sm" className="h-6 w-6 p-0 text-amber-700 hover:text-amber-900 dark:text-amber-400" onClick={exitItemPayMode}>
                            <X className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                        <div className="divide-y divide-amber-100 dark:divide-amber-800/40">
                          {/* Alojamiento */}
                          {folio.roomTotal > 0 && (
                            <label className="flex items-center gap-3 px-3 py-2.5 cursor-pointer hover:bg-amber-100/60 dark:hover:bg-amber-800/20 transition-colors">
                              <Checkbox
                                checked={selectedItemIds.has("accommodation")}
                                onCheckedChange={() => handleToggleItem("accommodation", folio.roomTotal)}
                                data-testid="checkbox-item-accommodation"
                              />
                              <div className="flex-1 min-w-0">
                                <p className="text-sm font-medium text-foreground truncate">Alojamiento ({folio.nights} noche{folio.nights !== 1 ? "s" : ""})</p>
                                <p className="text-xs text-muted-foreground">${folio.roomRate ? parseFloat(folio.roomRate).toFixed(0) : "—"}/noche</p>
                              </div>
                              <span className="text-sm font-semibold text-foreground shrink-0">${folio.roomTotal.toFixed(2)}</span>
                            </label>
                          )}
                          {/* Cargos adicionales */}
                          {(folio.charges || []).map((c: any) => (
                            <label key={c.id} className="flex items-center gap-3 px-3 py-2.5 cursor-pointer hover:bg-amber-100/60 dark:hover:bg-amber-800/20 transition-colors">
                              <Checkbox
                                checked={selectedItemIds.has(c.id)}
                                onCheckedChange={() => handleToggleItem(c.id, parseFloat(c.amount))}
                                data-testid={`checkbox-item-${c.id}`}
                              />
                              <div className="flex-1 min-w-0">
                                <p className="text-sm font-medium text-foreground truncate">{c.description}</p>
                                {c.date && <p className="text-xs text-muted-foreground">{c.date}</p>}
                              </div>
                              <span className="text-sm font-semibold text-foreground shrink-0">${parseFloat(c.amount).toFixed(2)}</span>
                            </label>
                          ))}
                        </div>
                        {selectedItemIds.size > 0 && (
                          <div className="flex items-center justify-between px-3 py-2 border-t border-amber-200 dark:border-amber-800 bg-amber-100/50 dark:bg-amber-900/20">
                            <span className="text-xs text-amber-800 dark:text-amber-400">{selectedItemIds.size} ítem{selectedItemIds.size !== 1 ? "s" : ""} seleccionado{selectedItemIds.size !== 1 ? "s" : ""}</span>
                            <span className="text-sm font-bold text-amber-900 dark:text-amber-300">${paymentAmount || "0.00"}</span>
                          </div>
                        )}
                      </div>
                    )}

                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <div className="flex items-center justify-between mb-1.5">
                          <Label>Monto</Label>
                          {!itemPayMode && folio && ((folio.charges || []).length > 0 || folio.roomTotal > 0) && (
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-6 px-2 text-xs text-amber-700 hover:text-amber-900 hover:bg-amber-100 dark:text-amber-400 dark:hover:bg-amber-900/30"
                              onClick={() => { setItemPayMode(true); setPaymentAmount(""); setSelectedItemIds(new Set()); }}
                              data-testid="button-item-pay-mode"
                            >
                              <ListChecks className="h-3 w-3 mr-1" />
                              Por ítem
                            </Button>
                          )}
                        </div>
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
                        <Label>Tipo de comprobante</Label>
                        <Select value={paymentReceiptType} onValueChange={setPaymentReceiptType}>
                          <SelectTrigger data-testid="select-receipt-type">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="cierre_habitacion">Cierre de habitación</SelectItem>
                            <SelectItem value="factura_a">Factura A</SelectItem>
                            <SelectItem value="factura_b">Factura B</SelectItem>
                            <SelectItem value="voucher">Voucher (No Fiscal)</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div>
                        <Label>Facturar a</Label>
                        <Select value={paymentBillingTarget} onValueChange={(v) => { setPaymentBillingTarget(v as "guest" | "company" | "agency"); setCcCompanyId(""); setCcAgencyId(""); }}>
                          <SelectTrigger data-testid="select-billing-target">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="guest">Huésped</SelectItem>
                            <SelectItem value="company">Empresa</SelectItem>
                            <SelectItem value="agency">Agencia</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </div>

                    {/* Selector de entidad cuando el método es Cuenta Corriente */}
                    {paymentMethod === "cuenta_corriente" && paymentBillingTarget === "company" && (
                      <div className="rounded-md border border-blue-200 bg-blue-50 dark:bg-blue-900/10 dark:border-blue-800 p-3">
                        <div className="flex items-center gap-2 mb-2">
                          <Building2 className="h-4 w-4 text-blue-600 dark:text-blue-400" />
                          <Label className="text-sm font-medium text-blue-800 dark:text-blue-300">Empresa — Cuenta Corriente</Label>
                        </div>
                        <Select value={ccCompanyId} onValueChange={setCcCompanyId}>
                          <SelectTrigger data-testid="select-cc-company">
                            <SelectValue placeholder="Seleccionar empresa..." />
                          </SelectTrigger>
                          <SelectContent>
                            {companies.filter((c: any) => c.id).map((c: any) => (
                              <SelectItem key={c.id} value={c.id}>
                                {c.razonSocial || c.nombreFantasia || c.name || c.id}
                              </SelectItem>
                            ))}
                            {companies.length === 0 && (
                              <div className="py-3 px-2 text-sm text-muted-foreground text-center">No hay empresas registradas</div>
                            )}
                          </SelectContent>
                        </Select>
                        {!ccCompanyId && <p className="text-xs text-blue-700 dark:text-blue-400 mt-1">Seleccioná la empresa para cargar a su cuenta corriente.</p>}
                      </div>
                    )}
                    {paymentMethod === "cuenta_corriente" && paymentBillingTarget === "agency" && (
                      <div className="rounded-md border border-blue-200 bg-blue-50 dark:bg-blue-900/10 dark:border-blue-800 p-3">
                        <div className="flex items-center gap-2 mb-2">
                          <Building2 className="h-4 w-4 text-blue-600 dark:text-blue-400" />
                          <Label className="text-sm font-medium text-blue-800 dark:text-blue-300">Agencia — Cuenta Corriente</Label>
                        </div>
                        <Select value={ccAgencyId} onValueChange={setCcAgencyId}>
                          <SelectTrigger data-testid="select-cc-agency">
                            <SelectValue placeholder="Seleccionar agencia..." />
                          </SelectTrigger>
                          <SelectContent>
                            {agencies.filter((a: any) => a.id).map((a: any) => (
                              <SelectItem key={a.id} value={a.id}>
                                {a.razonSocial || a.nombreFantasia || a.name || a.id}
                              </SelectItem>
                            ))}
                            {agencies.length === 0 && (
                              <div className="py-3 px-2 text-sm text-muted-foreground text-center">No hay agencias registradas</div>
                            )}
                          </SelectContent>
                        </Select>
                        {!ccAgencyId && <p className="text-xs text-blue-700 dark:text-blue-400 mt-1">Seleccioná la agencia para cargar a su cuenta corriente.</p>}
                      </div>
                    )}

                    <div className="grid grid-cols-1 gap-3">
                      <div>
                        <Label>Referencia (opcional)</Label>
                        <Input
                          value={paymentReference}
                          onChange={(e) => setPaymentReference(e.target.value)}
                          placeholder="N° de comprobante..."
                          data-testid="input-payment-reference"
                        />
                      </div>
                    </div>
                    <Button
                      onClick={() => {
                        const amount = paymentAmount || balance.toFixed(2);
                        if (!amount || parseFloat(amount) <= 0) {
                          toast({ title: "Ingresá un monto válido", variant: "destructive" });
                          return;
                        }
                        if (paymentMethod === "cuenta_corriente" && paymentBillingTarget === "company" && !ccCompanyId) {
                          toast({ title: "Seleccioná una empresa", description: "Elegí a qué empresa cargar la cuenta corriente.", variant: "destructive" });
                          return;
                        }
                        if (paymentMethod === "cuenta_corriente" && paymentBillingTarget === "agency" && !ccAgencyId) {
                          toast({ title: "Seleccioná una agencia", description: "Elegí a qué agencia cargar la cuenta corriente.", variant: "destructive" });
                          return;
                        }
                        addPaymentMutation.mutate({
                          amount,
                          method: paymentMethod,
                          reference: paymentReference,
                          receiptType: paymentReceiptType,
                          billingTarget: paymentBillingTarget,
                          companyId: paymentBillingTarget === "company" ? ccCompanyId : undefined,
                          agencyId: paymentBillingTarget === "agency" ? ccAgencyId : undefined,
                        });
                      }}
                      disabled={addPaymentMutation.isPending}
                      data-testid="button-register-payment"
                    >
                      {addPaymentMutation.isPending ? (
                        <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Registrando...</>
                      ) : "Registrar pago"}
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

                <Card className={balance < -0.01 ? "border-green-300 bg-green-50 dark:bg-green-900/10 dark:border-green-800" : "border-red-300 bg-red-50 dark:bg-red-900/10 dark:border-red-800"}>
                  <CardContent className="flex items-center justify-between p-4">
                    <p className="font-medium">{balance < -0.01 ? "Saldo a favor del huésped" : "Saldo restante"}</p>
                    <p className={`text-xl font-bold ${balance < -0.01 ? "text-green-600 dark:text-green-400" : "text-red-600 dark:text-red-400"}`} data-testid="text-remaining-balance">
                      {balance < -0.01 ? `+$${Math.abs(balance).toFixed(2)}` : `$${balance.toFixed(2)}`}
                    </p>
                  </CardContent>
                </Card>
              </>
            )}

            <div className="flex justify-between">
              <Button variant="outline" onClick={() => setWizardStep(1)} data-testid="button-back-to-summary">
                <ChevronLeft className="h-4 w-4 mr-1" /> Volver al resumen
              </Button>
              <Button
                onClick={() => {
                  if (isEarlyCheckout) { setEarlyCheckoutDialog(true); return; }
                  selectedReservation && checkOutMutation.mutate(selectedReservation.id);
                }}
                disabled={(!isHistorical && balance > 0.01) || checkOutMutation.isPending}
                variant={isHistorical ? "destructive" : isEarlyCheckout ? "outline" : "default"}
                className={isEarlyCheckout ? "border-orange-400 text-orange-700 hover:bg-orange-50 dark:border-orange-600 dark:text-orange-300" : ""}
                data-testid="button-confirm-checkout"
              >
                {checkOutMutation.isPending ? (
                  <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Procesando...</>
                ) : isHistorical ? "Cerrar Habitación Histórica" : isEarlyCheckout ? "Confirmar salida anticipada" : "Confirmar Check-out"}
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

            <div className="flex flex-col sm:flex-row justify-center gap-3">
              <Button
                variant="outline"
                className="border-red-300 text-red-700 hover:bg-red-50 dark:border-red-700 dark:text-red-400 dark:hover:bg-red-900/20"
                onClick={() => selectedReservation && undoCheckoutMutation.mutate(selectedReservation.id)}
                disabled={undoCheckoutMutation.isPending}
                data-testid="button-undo-checkout"
              >
                {undoCheckoutMutation.isPending
                  ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Anulando...</>
                  : <><RotateCcw className="h-4 w-4 mr-2" />Anular check-out</>
                }
              </Button>
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
          <div className="ml-auto flex items-center gap-2">
            {overdueReservations.length > 0 && (
              <button
                onClick={() => setShowOverdueDialog(true)}
                className="flex items-center gap-1.5 rounded-md border border-red-300 bg-red-50 px-3 py-1.5 text-sm font-medium text-red-700 hover:bg-red-100 dark:border-red-800 dark:bg-red-900/20 dark:text-red-400 dark:hover:bg-red-900/40 transition-colors"
                data-testid="button-overdue-checkouts"
              >
                <ListChecks className="h-4 w-4" />
                Cierre masivo
              </button>
            )}
            <Badge className="bg-orange-100 text-orange-800 dark:bg-orange-900/40 dark:text-orange-400" data-testid="badge-active-count">
              {filteredReservations?.length || 0} pendientes
            </Badge>
          </div>
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
          {filteredReservations.slice().sort((a, b) => parseInt(a.room?.roomNumber || "0") - parseInt(b.room?.roomNumber || "0")).map((reservation) => (
            <Card
              key={reservation.id}
              className="hover-elevate"
              data-testid={`checkout-card-${reservation.id}`}
            >
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-full bg-blue-100 text-blue-600 dark:bg-blue-900/40 dark:text-blue-400 font-semibold">
                      {reservation.guest?.lastName?.[0]}{reservation.guest?.firstName?.[0]}
                    </div>
                    <div>
                      <CardTitle className="text-lg">
                        {reservation.guest?.lastName} {reservation.guest?.firstName}
                      </CardTitle>
                      <CardDescription>{reservation.guest?.phone || reservation.guest?.email}</CardDescription>
                    </div>
                  </div>
                  <div className="flex flex-col items-end gap-1">
                    {reservation.status === "checked_in" ? (
                      <Badge className="bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-400">Alojado</Badge>
                    ) : (
                      <Badge className="bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-400" data-testid={`badge-no-checkin-${reservation.id}`}>Sin check-in</Badge>
                    )}
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
                : "No hay check-outs programados para hoy ni vencidos."}
            </p>
          </CardContent>
        </Card>
      )}

      <Dialog open={showOverdueDialog} onOpenChange={setShowOverdueDialog}>
        <DialogContent className="max-w-2xl max-h-[80vh] flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-red-700 dark:text-red-400">
              <AlertCircle className="h-5 w-5" />
              Habitaciones no cerradas ({overdueReservations.length})
            </DialogTitle>
            <DialogDescription>
              Estas reservas superaron su fecha de check-out sin haber sido procesadas.
            </DialogDescription>
          </DialogHeader>
          <div className="flex-1 overflow-y-auto space-y-3 py-2">
            {overdueReservations.length === 0 ? (
              <p className="text-center text-muted-foreground py-6">No hay habitaciones pendientes de cierre.</p>
            ) : (
              overdueReservations.map((reservation) => {
                const daysDiff = Math.floor(
                  (new Date(today).getTime() - new Date(reservation.checkOutDate).getTime()) / 86400000
                );
                return (
                  <div
                    key={reservation.id}
                    className="flex items-center justify-between gap-4 rounded-lg border border-red-200 bg-red-50 p-4 dark:border-red-800 dark:bg-red-900/20"
                    data-testid={`overdue-row-${reservation.id}`}
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="flex h-9 w-9 items-center justify-center rounded-full bg-red-100 text-red-700 dark:bg-red-900/50 dark:text-red-300 font-semibold text-sm shrink-0">
                        {reservation.guest?.lastName?.[0]}{reservation.guest?.firstName?.[0]}
                      </div>
                      <div className="min-w-0">
                        <p className="font-medium text-sm truncate">
                          {reservation.guest?.lastName} {reservation.guest?.firstName}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          Hab. {reservation.room?.roomNumber} · Venció: {formatDateAR(reservation.checkOutDate)}
                          {" "}
                          <span className="text-red-600 dark:text-red-400 font-medium">
                            (hace {daysDiff} {daysDiff === 1 ? "día" : "días"})
                          </span>
                        </p>
                      </div>
                    </div>
                    <Button
                      size="sm"
                      variant="destructive"
                      onClick={() => {
                        setShowOverdueDialog(false);
                        startCheckout(reservation);
                      }}
                      data-testid={`button-checkout-overdue-${reservation.id}`}
                    >
                      <LogOut className="h-3.5 w-3.5 mr-1" />
                      Check-out
                    </Button>
                  </div>
                );
              })
            )}
          </div>
          <DialogFooter className="flex-col sm:flex-row gap-2">
            <Button variant="outline" onClick={() => setShowOverdueDialog(false)}>Cancelar</Button>
            {overdueReservations.length > 0 && (
              <>
                <Button
                  variant="secondary"
                  disabled={bulkCheckoutOverdueMutation.isPending}
                  data-testid="button-bulk-checkout-overdue"
                  onClick={() => {
                    setBulkClosing(true);
                    bulkCheckoutOverdueMutation.mutate(false);
                  }}
                >
                  {bulkCheckoutOverdueMutation.isPending ? (
                    <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Cerrando...</>
                  ) : (
                    <><LogOut className="h-4 w-4 mr-2" />Cerrar saldo $0 ({overdueReservations.length})</>
                  )}
                </Button>
                <Button
                  variant="destructive"
                  disabled={bulkCheckoutOverdueMutation.isPending}
                  data-testid="button-bulk-checkout-force"
                  onClick={() => {
                    setBulkClosing(true);
                    bulkCheckoutOverdueMutation.mutate(true);
                  }}
                >
                  {bulkCheckoutOverdueMutation.isPending ? (
                    <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Cerrando...</>
                  ) : (
                    <><LogOut className="h-4 w-4 mr-2" />Forzar cierre de TODAS</>
                  )}
                </Button>
              </>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
      {/* Diálogo confirmación salida anticipada */}
      <Dialog open={earlyCheckoutDialog} onOpenChange={(open) => { if (!open) setEarlyCheckoutDialog(false); }}>
        <DialogContent className="sm:max-w-[420px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-orange-700 dark:text-orange-400">
              <AlertCircle className="h-5 w-5" />
              Salida anticipada
            </DialogTitle>
          </DialogHeader>
          <div className="py-2 text-sm text-muted-foreground space-y-2">
            <p>
              La fecha de salida programada era{" "}
              <strong className="text-orange-700 dark:text-orange-400">
                {selectedReservation ? formatDateAR(selectedReservation.checkOutDate) : ""}
              </strong>.
            </p>
            <p>El check-out se registrará con la fecha de hoy. ¿Confirmar salida anticipada?</p>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={() => setEarlyCheckoutDialog(false)} data-testid="button-cancel-early-checkout">
              Cancelar
            </Button>
            <Button
              onClick={() => {
                setEarlyCheckoutDialog(false);
                selectedReservation && checkOutMutation.mutate(selectedReservation.id);
              }}
              disabled={checkOutMutation.isPending}
              data-testid="button-confirm-early-checkout"
            >
              Confirmar salida anticipada
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
