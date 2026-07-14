import { useState, useRef } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Calendar, User, DollarSign, Bed, Users, LogIn, LogOut, ExternalLink, FileText, Ban, ArrowLeftRight, Sunrise, Sunset, TrendingUp, AlertCircle, AlertTriangle, Heart, StickyNote, Undo2, Building2, Percent, X, Printer } from "lucide-react";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { getLocalToday } from "@/lib/utils";
import { formatDateReadable } from "@/lib/planning-utils";
import type { ReservationWithDetails, ReservationStatus } from "@shared/schema";
import { EmitirFacturaDialog } from "@/pages/billing";
import type { EmitirFacturaInitialValues } from "@/pages/billing";

function getStatusBadge(status: ReservationStatus) {
  const config: Record<ReservationStatus, { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
    tentative:   { label: "Tentativa",    variant: "outline" },
    pending:     { label: "Pendiente",    variant: "secondary" },
    confirmed:   { label: "Confirmada",   variant: "default" },
    web_checkin: { label: "Pre Check-In", variant: "default" },
    checked_in:  { label: "Check-in",     variant: "default" },
    checked_out: { label: "Check-out",    variant: "outline" },
    cancelled:   { label: "Cancelada",    variant: "destructive" },
  };
  return config[status] || { label: status, variant: "outline" };
}

export function ReservationDetailModal({
  open,
  onOpenChange,
  reservationId,
  onNavigate,
  onEdit,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  reservationId: string | null;
  onNavigate: (path: string) => void;
  onEdit?: (reservation: ReservationWithDetails) => void;
}) {
  const { toast } = useToast();
  const [isEditing, setIsEditing] = useState(false);
  const [retroDialogOpen, setRetroDialogOpen] = useState(false);
  const [retroMotivo, setRetroMotivo] = useState("");
  const [dirtyRoomDialogOpen, setDirtyRoomDialogOpen] = useState(false);
  const [editCheckIn, setEditCheckIn] = useState("");
  const [editCheckOut, setEditCheckOut] = useState("");
  const [editChannel, setEditChannel] = useState("");
  const [editNotes, setEditNotes] = useState("");
  const [editEarlyCheckIn, setEditEarlyCheckIn] = useState(false);
  const [editLateCheckOut, setEditLateCheckOut] = useState(false);
  const [editRatePerNight, setEditRatePerNight] = useState("");
  const [checkoutStep, setCheckoutStep] = useState(0);
  const [checkoutReceiptType, setCheckoutReceiptType] = useState("cierre_habitacion");
  const [showCheckoutFactura, setShowCheckoutFactura] = useState(false);
  const [checkoutFacturaInitial, setCheckoutFacturaInitial] = useState<EmitirFacturaInitialValues | undefined>(undefined);
  const checkoutPendingInvoiceRef = useRef(false);
  const checkoutReceiptTypeRef = useRef("cierre_habitacion");
  const checkoutFacturaInitialRef = useRef<EmitirFacturaInitialValues | undefined>(undefined);
  const [checkoutPaymentMethod, setCheckoutPaymentMethod] = useState("efectivo");
  const [checkoutPayAmount, setCheckoutPayAmount] = useState("");
  const [checkoutBillingTarget, setCheckoutBillingTarget] = useState<"guest" | "company" | "agency">("guest");
  const [checkoutCompanyId, setCheckoutCompanyId] = useState("");
  const [checkoutAgencyId, setCheckoutAgencyId] = useState("");
  const [showRetencion, setShowRetencion] = useState(false);
  const [retencionTipo, setRetencionTipo] = useState<"iibb" | "ganancias">("iibb");
  const [retencionMonto, setRetencionMonto] = useState("");

  const { data: companies = [] } = useQuery<any[]>({ queryKey: ["/api/companies"] });
  const { data: agencies = [] } = useQuery<any[]>({ queryKey: ["/api/agencies"] });

  const { data: reservation, isLoading } = useQuery<ReservationWithDetails>({
    queryKey: ["/api/reservations", reservationId],
    queryFn: async () => {
      const res = await fetch(`/api/reservations/${reservationId}`);
      if (!res.ok) throw new Error("Failed to fetch reservation");
      return res.json();
    },
    enabled: !!reservationId && open,
  });

  const { data: guestPreferences = [] } = useQuery<any[]>({
    queryKey: ["/api/guests", reservation?.guestId, "preferences"],
    queryFn: async () => {
      const res = await fetch(`/api/guests/${reservation!.guestId}/preferences`);
      if (!res.ok) return [];
      return res.json();
    },
    enabled: !!reservation?.guestId && open,
  });
  const activePrefs = guestPreferences.filter((p: any) => p.isActive);
  const criticalPrefs = activePrefs.filter((p: any) => p.priority === "critical" || p.priority === "high");

  const updateReservationMutation = useMutation({
    mutationFn: async (data: Record<string, unknown>) => {
      return apiRequest("PATCH", `/api/reservations/${reservationId}`, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/reservations"] });
      queryClient.invalidateQueries({ queryKey: ["/api/reservations", reservationId] });
      queryClient.invalidateQueries({ predicate: (query) =>
        Array.isArray(query.queryKey) && query.queryKey[0] === "/api/planning"
      });
      toast({ title: "Reserva actualizada" });
      setIsEditing(false);
    },
    onError: () => {
      toast({ title: "Error", description: "No se pudo actualizar la reserva.", variant: "destructive" });
    },
  });

  const { data: billingConfig } = useQuery<any>({ queryKey: ["/api/billing/config"] });

  const addPaymentMutation = useMutation({
    mutationFn: async (data: Record<string, unknown>) => {
      const today = new Date().toLocaleDateString("en-CA", { timeZone: "America/Argentina/Buenos_Aires" });
      return apiRequest("POST", `/api/payments`, { ...data, reservationId, date: data.date || today });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/reservations", reservationId] });
      queryClient.invalidateQueries({ queryKey: ["/api/payments"] });
    },
    onError: (error: any) => {
      const message = error?.data?.error || error?.message || "No se pudo registrar el pago";
      toast({ title: "Error al registrar pago", description: message, variant: "destructive" });
    },
  });

  const startCheckout = (res?: typeof reservation) => {
    const r = res || reservation;
    setCheckoutStep(1);
    setCheckoutReceiptType("cierre_habitacion");
    setCheckoutPayAmount("");
    setShowRetencion(false);
    setRetencionMonto("");
    setRetencionTipo("iibb");
    if (r?.companyId) {
      setCheckoutPaymentMethod("cuenta_corriente");
      setCheckoutBillingTarget("company");
      setCheckoutCompanyId(r.companyId);
      setCheckoutAgencyId("");
    } else if (r?.agencyId) {
      setCheckoutPaymentMethod("cuenta_corriente");
      setCheckoutBillingTarget("agency");
      setCheckoutAgencyId(r.agencyId);
      setCheckoutCompanyId("");
    } else {
      setCheckoutPaymentMethod("efectivo");
      setCheckoutBillingTarget("guest");
      setCheckoutCompanyId("");
      setCheckoutAgencyId("");
    }
  };

  const startEditing = () => {
    if (!reservation) return;
    setEditCheckIn(reservation.checkInDate); setEditCheckOut(reservation.checkOutDate);
    setEditChannel(reservation.source || "directo"); setEditNotes(reservation.notes || "");
    setEditEarlyCheckIn(!!reservation.earlyCheckIn); setEditLateCheckOut(!!reservation.lateCheckOut);
    setEditRatePerNight(reservation.finalRatePerNight?.toString() || "");
    setIsEditing(true);
  };

  const saveEdit = () => {
    const ci = new Date(editCheckIn + "T12:00:00");
    const co = new Date(editCheckOut + "T12:00:00");
    const nights = Math.max(1, Math.round((co.getTime() - ci.getTime()) / (1000 * 60 * 60 * 24)));
    const rate = parseFloat(editRatePerNight) || 0;
    updateReservationMutation.mutate({
      checkInDate: editCheckIn, checkOutDate: editCheckOut, source: editChannel, notes: editNotes,
      earlyCheckIn: editEarlyCheckIn, lateCheckOut: editLateCheckOut, finalRatePerNight: editRatePerNight,
      nights, totalRoomAmount: (rate * nights).toFixed(2),
    });
  };

  const checkInMutation = useMutation({
    mutationFn: async ({ motivo }: { motivo?: string } = {}) =>
      apiRequest("POST", `/api/reservations/${reservationId}/check-in`, motivo ? { motivo } : {}),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/reservations"] });
      queryClient.invalidateQueries({ predicate: (query) => Array.isArray(query.queryKey) && query.queryKey[0] === "/api/planning" });
      queryClient.invalidateQueries({ queryKey: ["/api/dashboard/stats"] });
      queryClient.invalidateQueries({ queryKey: ["/api/dashboard/arrivals"] });
      queryClient.invalidateQueries({ queryKey: ["/api/dashboard/departures"] });
      queryClient.invalidateQueries({ queryKey: ["/api/rooms"] });
      toast({ title: "Check-in realizado", description: "El huesped ha sido registrado." });
      setRetroDialogOpen(false);
      setRetroMotivo("");
      onOpenChange(false);
    },
    onError: (error: any) => {
      let body: any = {};
      try {
        const msg = error?.message || "";
        const jsonStart = msg.indexOf("{");
        if (jsonStart !== -1) body = JSON.parse(msg.slice(jsonStart));
      } catch {}
      if (body?.error === "CHECK_IN_RETROACTIVO") {
        setRetroDialogOpen(true);
      } else {
        toast({ title: "Error en Check-in", description: body?.error || body?.message || error?.message || "No se pudo realizar el check-in.", variant: "destructive" });
      }
    },
  });

  const checkOutMutation = useMutation({
    mutationFn: async () => apiRequest("POST", `/api/reservations/${reservationId}/check-out`, { forceCheckout: true }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/reservations"] });
      queryClient.invalidateQueries({ predicate: (query) => Array.isArray(query.queryKey) && query.queryKey[0] === "/api/planning" });
      queryClient.invalidateQueries({ queryKey: ["/api/dashboard/stats"] });
      queryClient.invalidateQueries({ queryKey: ["/api/dashboard/arrivals"] });
      queryClient.invalidateQueries({ queryKey: ["/api/dashboard/departures"] });
      queryClient.invalidateQueries({ queryKey: ["/api/rooms"] });
      toast({ title: "Check-out realizado", description: "El huésped ha sido despedido." });
      onOpenChange(false);
      const savedReceiptType = checkoutReceiptTypeRef.current;
      if (checkoutPendingInvoiceRef.current) {
        checkoutPendingInvoiceRef.current = false;
        setCheckoutFacturaInitial(checkoutFacturaInitialRef.current);
        checkoutFacturaInitialRef.current = undefined;
        setShowCheckoutFactura(true);
      } else if (["cierre_habitacion", "voucher", "ticket"].includes(savedReceiptType)) {
        window.open(`/api/reservations/${reservationId}/folio/pdf`, "_blank");
      }
    },
    onError: (error: any) => {
      const message = error?.data?.error || error?.message || "No se pudo realizar el check-out.";
      if (message.includes("saldo pendiente") || message.includes("balance")) {
        toast({ title: "Saldo Pendiente", description: message, variant: "destructive" });
      } else {
        toast({ title: "Error", description: message, variant: "destructive" });
      }
    },
  });

  const undoCheckOutMutation = useMutation({
    mutationFn: async () => apiRequest("POST", `/api/reservations/${reservationId}/undo-checkout`, {}),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/reservations"] });
      queryClient.invalidateQueries({ predicate: (query) => Array.isArray(query.queryKey) && query.queryKey[0] === "/api/planning" });
      queryClient.invalidateQueries({ queryKey: ["/api/dashboard/stats"] });
      queryClient.invalidateQueries({ queryKey: ["/api/rooms"] });
      toast({ title: "Check-out revertido", description: "La reserva volvió a Check-in y la habitación quedó Ocupada." });
      onOpenChange(false);
    },
    onError: (error: any) => {
      let description = "No se pudo revertir el check-out.";
      try { const b = JSON.parse(error.message.replace(/^\d+:\s*/, "")); if (b.error) description = b.error; } catch {}
      toast({ title: "Error", description, variant: "destructive" });
    },
  });

  const undoCheckInMutation = useMutation({
    mutationFn: async () => apiRequest("POST", `/api/reservations/${reservationId}/undo-checkin`, {}),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/reservations"] });
      queryClient.invalidateQueries({ predicate: (query) => Array.isArray(query.queryKey) && query.queryKey[0] === "/api/planning" });
      queryClient.invalidateQueries({ queryKey: ["/api/dashboard/stats"] });
      queryClient.invalidateQueries({ queryKey: ["/api/rooms"] });
      toast({ title: "Check-in revertido", description: "La reserva volvió a Confirmada y la habitación quedó Limpia." });
      onOpenChange(false);
    },
    onError: (error: any) => {
      let description = "No se pudo revertir el check-in.";
      try { const b = JSON.parse(error.message.replace(/^\d+:\s*/, "")); if (b.error) description = b.error; } catch {}
      toast({ title: "Error", description, variant: "destructive" });
    },
  });

  const cancelReservationMutation = useMutation({
    mutationFn: async () => apiRequest("POST", `/api/reservations/${reservationId}/cancel`, {
      reason: "Anulado desde Planning",
      cancelledBy: "Recepción",
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/reservations"] });
      queryClient.invalidateQueries({ predicate: (query) => Array.isArray(query.queryKey) && query.queryKey[0] === "/api/planning" });
      queryClient.invalidateQueries({ queryKey: ["/api/dashboard/stats"] });
      queryClient.invalidateQueries({ queryKey: ["/api/rooms"] });
      queryClient.invalidateQueries({ queryKey: ["/api/cancelled-reservations"], exact: false });
      toast({ title: "Reserva anulada" });
      onOpenChange(false);
    },
    onError: (error: any) => {
      let description = "No se pudo anular la reserva.";
      try {
        const body = JSON.parse(error.message.replace(/^\d+:\s*/, ""));
        if (body.error) description = body.error;
      } catch {}
      toast({ title: "Error", description, variant: "destructive" });
    },
  });

  if (!reservationId) return null;

  const statusBadge = reservation ? getStatusBadge(reservation.status) : null;
  const todayLocal = getLocalToday();
  const isCheckInDateValid = reservation ? (() => {
    const todayMs = new Date(todayLocal + "T12:00:00").getTime();
    const ciMs = new Date(reservation.checkInDate + "T12:00:00").getTime();
    const diffDays = Math.round((ciMs - todayMs) / (1000 * 60 * 60 * 24));
    return diffDays <= 1; // today, any past date, or tomorrow (early check-in)
  })() : false;
  const isCheckOutDateValid = reservation ? (() => {
    const todayMs = new Date(todayLocal + "T12:00:00").getTime();
    const coMs = new Date(reservation.checkOutDate + "T12:00:00").getTime();
    const diffDays = Math.round((coMs - todayMs) / (1000 * 60 * 60 * 24));
    return diffDays <= 1; // today, any past date, or tomorrow
  })() : false;
  const canCheckIn = (
    reservation?.status === "confirmed" ||
    reservation?.status === "web_checkin" ||
    reservation?.status === "pending" ||
    reservation?.status === "tentative"
  ) && isCheckInDateValid;
  const canCheckOut = reservation?.status === "checked_in" && isCheckOutDateValid;
  const canUndoCheckIn = reservation?.status === "checked_in" && reservation?.checkInDate === todayLocal;
  const canUndoCheckOut = reservation?.status === "checked_out" && reservation?.checkOutDate === todayLocal;
  const canCancel = reservation?.status === "confirmed" || reservation?.status === "web_checkin" || reservation?.status === "pending" || reservation?.status === "tentative";
  const totalCharges = reservation?.charges?.reduce((sum, c) => sum + parseFloat(c.amount), 0) || 0;

  const printConfirmation = () => {
    if (!reservation) return;
    window.open(`/api/reservations/${reservation.id}/confirmation-pdf`, "_blank");
  };

  return (
    <>
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[95vw] max-w-2xl max-h-[90vh] overflow-y-auto overflow-x-hidden">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Calendar className="h-5 w-5" />
            Detalle de Reserva
          </DialogTitle>
          {reservation && <DialogDescription>Codigo: {reservation.reservationCode}</DialogDescription>}
        </DialogHeader>

        {isLoading ? (
          <div className="space-y-3 py-4">
            <Skeleton className="h-6 w-full" />
            <Skeleton className="h-6 w-3/4" />
            <Skeleton className="h-6 w-1/2" />
          </div>
        ) : reservation ? (
          checkoutStep > 0 ? (
            <div className="space-y-4 py-2">
              <div className="flex items-center gap-2 mb-2">
                {[1,2,3].map(s => <div key={s} className={`flex-1 h-1.5 rounded-full ${s <= checkoutStep ? "bg-primary" : "bg-muted"}`} />)}
              </div>
              <p className="text-xs text-muted-foreground text-center">
                Paso {checkoutStep} de 3: {checkoutStep === 1 ? "Resumen de cuenta" : checkoutStep === 2 ? "Pago y comprobante" : "Confirmar"}
              </p>

              {checkoutStep === 1 && (() => {
                const totalPayments = reservation.payments?.reduce((s, p) => s + parseFloat(p.amount), 0) || 0;
                const totalAmount = parseFloat(reservation.totalRoomAmount || "0") + totalCharges;
                const balance = totalAmount - totalPayments;
                const fmt = (d: string) => { try { const [y,m,dy] = d.split("-"); return `${dy}/${m}/${y}`; } catch { return d; } };
                const methodLabel: Record<string, string> = { efectivo: "Efectivo", tarjeta_debito: "Tarjeta Déb.", tarjeta_credito: "Tarjeta Cré.", transferencia: "Transferencia", mercadopago: "MercadoPago", cuenta_corriente: "Cta. Cte.", efectivo_usd: "Efectivo USD" };
                return (
                  <div className="space-y-3">
                    {reservation.isUpgrade && (
                      <div className="flex items-center gap-1.5 px-2.5 py-1.5 bg-amber-50 dark:bg-amber-950/30 border border-amber-300 dark:border-amber-700 rounded-md">
                        <TrendingUp className="h-3.5 w-3.5 text-amber-600 dark:text-amber-400 shrink-0" />
                        <span className="text-xs font-semibold text-amber-700 dark:text-amber-300">Up Grade aplicado</span>
                        {reservation.originalRoomTypeId && (reservation as any).originalRoomType && (
                          <span className="text-xs text-amber-600/80 dark:text-amber-400/80 ml-1">
                            — Tarifa: {(reservation as any).originalRoomType.name}
                          </span>
                        )}
                      </div>
                    )}
                    {reservation.notes && (
                      <div className="flex gap-2 px-3 py-2.5 bg-yellow-50 dark:bg-yellow-950/30 border border-yellow-300 dark:border-yellow-700 rounded-md">
                        <StickyNote className="h-4 w-4 text-yellow-600 dark:text-yellow-400 shrink-0 mt-0.5" />
                        <div>
                          <div className="text-xs font-semibold text-yellow-700 dark:text-yellow-400 mb-0.5">Notas de la reserva</div>
                          <div className="text-xs text-yellow-800 dark:text-yellow-300 whitespace-pre-wrap">{reservation.notes}</div>
                        </div>
                      </div>
                    )}

                    {/* Cargos detallados */}
                    <div className="rounded-md border overflow-hidden text-sm">
                      <div className="px-3 py-1.5 bg-muted/60 text-xs font-semibold text-muted-foreground uppercase tracking-wide">Cargos</div>
                      <div className="divide-y">
                        <div className="flex justify-between items-start px-3 py-2">
                          <div>
                            <div>Alojamiento hab. {reservation.room?.roomNumber}</div>
                            <div className="text-xs text-muted-foreground">{reservation.nights} noche{(reservation.nights ?? 1) !== 1 ? "s" : ""} × ${parseFloat(reservation.finalRatePerNight || "0").toLocaleString("es-AR", { minimumFractionDigits: 0 })}/noche</div>
                          </div>
                          <span className="font-medium">${parseFloat(reservation.totalRoomAmount || "0").toLocaleString("es-AR", { minimumFractionDigits: 2 })}</span>
                        </div>
                        {(reservation.charges ?? []).map((c: any) => (
                          <div key={c.id} className="flex justify-between items-start px-3 py-2">
                            <div>
                              <div>{c.description}</div>
                              <div className="text-xs text-muted-foreground">{fmt(c.date)}</div>
                            </div>
                            <span>${parseFloat(c.amount).toLocaleString("es-AR", { minimumFractionDigits: 2 })}</span>
                          </div>
                        ))}
                      </div>
                      <div className="flex justify-between items-center px-3 py-2 border-t bg-muted/30 font-semibold">
                        <span>Total</span>
                        <span>${totalAmount.toLocaleString("es-AR", { minimumFractionDigits: 2 })}</span>
                      </div>
                    </div>

                    {/* Pagos registrados */}
                    {(reservation.payments ?? []).length > 0 && (
                      <div className="rounded-md border overflow-hidden text-sm">
                        <div className="px-3 py-1.5 bg-muted/60 text-xs font-semibold text-muted-foreground uppercase tracking-wide">Pagos registrados</div>
                        <div className="divide-y">
                          {(reservation.payments ?? []).map((p: any) => (
                            <div key={p.id} className="flex justify-between items-start px-3 py-2">
                              <div>
                                <div>{methodLabel[p.method] || p.method}</div>
                                <div className="text-xs text-muted-foreground">{fmt(p.date)}</div>
                              </div>
                              <span className="text-green-600 font-medium">-${parseFloat(p.amount).toLocaleString("es-AR", { minimumFractionDigits: 2 })}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    <div className="flex justify-between items-center font-bold text-base p-3 rounded-md bg-muted/50">
                      <span>Saldo</span>
                      <span className={balance > 0 ? "text-destructive" : "text-green-600"}>${balance.toLocaleString("es-AR", { minimumFractionDigits: 2 })}</span>
                    </div>

                    <div className="flex items-center justify-between gap-2">
                      <Button variant="outline" size="sm" onClick={() => window.open(`/api/reservations/${reservationId}/folio/pdf`, "_blank")} data-testid="button-print-summary">
                        <Printer className="h-3.5 w-3.5 mr-1.5" /> Imprimir resumen
                      </Button>
                      <div className="flex gap-2">
                        <Button variant="outline" size="sm" onClick={() => setCheckoutStep(0)}>Cancelar</Button>
                        <Button size="sm" onClick={() => setCheckoutStep(2)} data-testid="button-checkout-step1-next">{balance > 0 ? "Registrar Pago" : "Siguiente"}</Button>
                      </div>
                    </div>
                  </div>
                );
              })()}

              {checkoutStep === 2 && (() => {
                const totalPayments = reservation.payments?.reduce((s, p) => s + parseFloat(p.amount), 0) || 0;
                const totalAmount = parseFloat(reservation.totalRoomAmount || "0") + totalCharges;
                const balance = totalAmount - totalPayments;
                return (
                  <div className="space-y-3">
                    {balance > 0 && (
                      <div className="p-3 bg-orange-500/10 border border-orange-500/30 rounded-md text-sm">
                        Saldo pendiente: <span className="font-bold">${balance.toFixed(2)}</span>
                      </div>
                    )}
                    {balance > 0 && (
                      <div className="grid grid-cols-2 gap-3">
                        <div className="space-y-1">
                          <Label className="text-xs">Monto</Label>
                          <Input type="number" min={0} step="0.01" value={checkoutPayAmount || balance.toFixed(2)} onChange={(e) => setCheckoutPayAmount(e.target.value)} data-testid="input-checkout-amount" />
                        </div>
                        <div className="space-y-1">
                          <Label className="text-xs">Método de pago</Label>
                          <Select value={checkoutPaymentMethod} onValueChange={setCheckoutPaymentMethod}>
                            <SelectTrigger data-testid="select-checkout-method"><SelectValue /></SelectTrigger>
                            <SelectContent>
                              <SelectItem value="efectivo">Efectivo</SelectItem>
                              <SelectItem value="tarjeta_debito">Tarjeta Débito</SelectItem>
                              <SelectItem value="tarjeta_credito">Tarjeta Crédito</SelectItem>
                              <SelectItem value="transferencia">Transferencia</SelectItem>
                              <SelectItem value="mercadopago">MercadoPago</SelectItem>
                              <SelectItem value="cuenta_corriente">Cta. Corriente</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                      </div>
                    )}
                    {balance > 0 && checkoutPaymentMethod === "cuenta_corriente" && (
                      <div className="grid grid-cols-2 gap-3">
                        <div className="space-y-1">
                          <Label className="text-xs">Facturar a</Label>
                          <Select value={checkoutBillingTarget} onValueChange={(v) => { setCheckoutBillingTarget(v as "guest" | "company" | "agency"); setCheckoutCompanyId(""); setCheckoutAgencyId(""); }}>
                            <SelectTrigger data-testid="select-checkout-billing-target"><SelectValue /></SelectTrigger>
                            <SelectContent>
                              <SelectItem value="guest">Huésped</SelectItem>
                              <SelectItem value="company">Empresa</SelectItem>
                              <SelectItem value="agency">Agencia</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                        {checkoutBillingTarget === "company" && (
                          <div className="space-y-1">
                            <Label className="text-xs flex items-center gap-1"><Building2 className="h-3 w-3" />Empresa</Label>
                            <Select value={checkoutCompanyId} onValueChange={setCheckoutCompanyId}>
                              <SelectTrigger data-testid="select-checkout-company"><SelectValue placeholder="Seleccionar..." /></SelectTrigger>
                              <SelectContent>
                                {companies.filter((c: any) => c.id).map((c: any) => (
                                  <SelectItem key={c.id} value={c.id}>{c.razonSocial || c.nombreFantasia || c.name || c.id}</SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>
                        )}
                        {checkoutBillingTarget === "agency" && (
                          <div className="space-y-1">
                            <Label className="text-xs flex items-center gap-1"><Building2 className="h-3 w-3" />Agencia</Label>
                            <Select value={checkoutAgencyId} onValueChange={setCheckoutAgencyId}>
                              <SelectTrigger data-testid="select-checkout-agency"><SelectValue placeholder="Seleccionar..." /></SelectTrigger>
                              <SelectContent>
                                {agencies.filter((a: any) => a.id).map((a: any) => (
                                  <SelectItem key={a.id} value={a.id}>{a.razonSocial || a.nombreFantasia || a.name || a.id}</SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>
                        )}
                      </div>
                    )}
                    <div className="space-y-1">
                      <Label className="text-xs">Tipo de comprobante</Label>
                      <Select value={checkoutReceiptType} onValueChange={setCheckoutReceiptType}>
                        <SelectTrigger data-testid="select-checkout-receipt"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="cierre_habitacion">Cierre de habitación</SelectItem>
                          <SelectItem value="ticket">Ticket</SelectItem>
                          <SelectItem value="factura_a">Factura A</SelectItem>
                          <SelectItem value="factura_b">Factura B</SelectItem>
                          <SelectItem value="factura_c">Factura C</SelectItem>
                          <SelectItem value="voucher">Voucher (No Fiscal)</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    {/* Retención impositiva */}
                    {balance > 0 && (!showRetencion ? (
                      <Button type="button" variant="ghost" size="sm" className="h-7 px-2 text-xs text-muted-foreground w-fit" onClick={() => setShowRetencion(true)} data-testid="button-show-retencion">
                        <Percent className="h-3 w-3 mr-1" /> Agregar retención impositiva
                      </Button>
                    ) : (
                      <div className="rounded-md border border-amber-200 bg-amber-50 dark:bg-amber-900/10 dark:border-amber-800 p-3 space-y-2">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-1.5">
                            <Percent className="h-3.5 w-3.5 text-amber-700 dark:text-amber-400" />
                            <span className="text-sm font-medium text-amber-800 dark:text-amber-300">Retención impositiva</span>
                          </div>
                          <Button type="button" variant="ghost" size="sm" className="h-6 w-6 p-0 text-amber-700" onClick={() => { setShowRetencion(false); setRetencionMonto(""); }}>
                            <X className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                        <div className="grid grid-cols-2 gap-2">
                          <div>
                            <Label className="text-xs">Tipo</Label>
                            <Select value={retencionTipo} onValueChange={(v) => setRetencionTipo(v as "iibb" | "ganancias")}>
                              <SelectTrigger className="h-8 text-sm" data-testid="select-retencion-tipo"><SelectValue /></SelectTrigger>
                              <SelectContent>
                                <SelectItem value="iibb">IIBB (Ingresos Brutos)</SelectItem>
                                <SelectItem value="ganancias">Ganancias</SelectItem>
                              </SelectContent>
                            </Select>
                          </div>
                          <div>
                            <Label className="text-xs">Monto retenido</Label>
                            <Input type="number" step="0.01" min="0" value={retencionMonto} onChange={(e) => setRetencionMonto(e.target.value)} placeholder="0.00" className="h-8 text-sm" data-testid="input-retencion-monto" />
                          </div>
                        </div>
                        {retencionMonto && parseFloat(retencionMonto) > 0 && (checkoutPayAmount || balance > 0) && (
                          <div className="text-xs text-amber-800 dark:text-amber-300 bg-amber-100/60 dark:bg-amber-900/30 rounded p-2">
                            <span className="font-medium">Neto:</span> ${parseFloat(checkoutPayAmount || balance.toFixed(2)).toFixed(2)} &nbsp;
                            <span className="font-medium">+ Ret. {retencionTipo === "iibb" ? "IIBB" : "Ganancias"}:</span> ${parseFloat(retencionMonto).toFixed(2)} &nbsp;
                            <span className="font-semibold">= Total cubierto: ${(parseFloat(checkoutPayAmount || balance.toFixed(2)) + parseFloat(retencionMonto)).toFixed(2)}</span>
                          </div>
                        )}
                      </div>
                    ))}

                    <div className="flex justify-end gap-2">
                      <Button variant="outline" size="sm" onClick={() => setCheckoutStep(1)}>Atrás</Button>
                      {balance > 0 && (
                        <Button size="sm" onClick={() => {
                          const netAmount = checkoutPayAmount || balance.toFixed(2);
                          if (!netAmount || parseFloat(netAmount) <= 0) { toast({ title: "Ingresá un monto válido", variant: "destructive" }); return; }
                          if (checkoutPaymentMethod === "cuenta_corriente" && checkoutBillingTarget === "company" && !checkoutCompanyId && !reservation.companyId) {
                            toast({ title: "Seleccioná una empresa", variant: "destructive" }); return;
                          }
                          if (checkoutPaymentMethod === "cuenta_corriente" && checkoutBillingTarget === "agency" && !checkoutAgencyId && !reservation.agencyId) {
                            toast({ title: "Seleccioná una agencia", variant: "destructive" }); return;
                          }
                          const retMonto = showRetencion && retencionMonto && parseFloat(retencionMonto) > 0 ? parseFloat(retencionMonto) : 0;
                          const grossAmount = (parseFloat(netAmount) + retMonto).toFixed(2);
                          const notes = retMonto > 0 ? JSON.stringify({ retencion: { tipo: retencionTipo, monto: retMonto, neto: parseFloat(netAmount) } }) : null;
                          addPaymentMutation.mutate({
                            amount: grossAmount,
                            method: checkoutPaymentMethod,
                            receiptType: checkoutReceiptType,
                            billingTarget: checkoutBillingTarget,
                            companyId: checkoutBillingTarget === "company" ? (checkoutCompanyId || reservation.companyId || undefined) : undefined,
                            agencyId: checkoutBillingTarget === "agency" ? (checkoutAgencyId || reservation.agencyId || undefined) : undefined,
                            ...(notes ? { notes } : {}),
                          }, { onSuccess: () => {
                            if (["factura_a", "factura_b", "factura_c"].includes(checkoutReceiptType)) {
                              checkoutPendingInvoiceRef.current = true;
                            }
                            setCheckoutStep(3);
                          } });
                        }} disabled={addPaymentMutation.isPending} data-testid="button-checkout-pay">
                          {addPaymentMutation.isPending ? "Procesando..." : "Registrar Pago"}
                        </Button>
                      )}
                      <Button variant={balance > 0 ? "ghost" : "default"} size="sm" onClick={() => {
                        checkoutReceiptTypeRef.current = checkoutReceiptType;
                        checkoutPendingInvoiceRef.current = ["factura_a", "factura_b", "factura_c"].includes(checkoutReceiptType);
                        setCheckoutStep(3);
                      }} data-testid="button-checkout-skip-pay">{balance > 0 ? "Omitir pago" : "Siguiente"}</Button>
                    </div>
                  </div>
                );
              })()}

              {checkoutStep === 3 && (
                <div className="space-y-3">
                  <div className="p-3 bg-muted/50 rounded-md text-sm space-y-1">
                    <p>Se realizará el check-out de <span className="font-bold">{reservation.guest?.lastName} {reservation.guest?.firstName}</span>.</p>
                    <p>Habitación <span className="font-bold">{reservation.room?.roomNumber}</span> quedará en estado <Badge variant="outline" className="text-orange-700">Sucia</Badge>.</p>
                    <p>Se creará tarea de limpieza en Housekeeping.</p>
                  </div>
                  <div className="flex justify-end gap-2">
                    <Button variant="outline" size="sm" onClick={() => setCheckoutStep(2)}>Atrás</Button>
                    <Button variant="destructive" size="sm" onClick={() => {
                      checkoutReceiptTypeRef.current = checkoutReceiptType;
                      checkoutPendingInvoiceRef.current = ["factura_a", "factura_b", "factura_c"].includes(checkoutReceiptType);
                      if (checkoutPendingInvoiceRef.current && reservation) {
                        const g = reservation.guest as any;
                        const comp = (reservation as any).company;
                        const ag = (reservation as any).agency;
                        const nights = reservation.nights || 1;
                        const roomNum = reservation.room?.roomNumber || "";
                        const activeCharges = (reservation.charges ?? []).filter((c: any) => (c as any).status !== "anulado");
                        checkoutFacturaInitialRef.current = {
                          razonSocial: comp?.razonSocial || comp?.name || ag?.razonSocial || ag?.nombreFantasia ||
                            (g ? `${g.lastName || ""} ${g.firstName || ""}`.trim() : undefined),
                          cuit: comp?.cuilCuit || ag?.cuilCuit || g?.cuilCuit || undefined,
                          dni: (!comp && !ag) ? (g?.documentNumber || undefined) : undefined,
                          condicionIva: comp?.condicionIva || ag?.condicionIva || undefined,
                          domicilio: comp?.direccion || comp?.domicilio || ag?.direccion || ag?.domicilio || undefined,
                          items: [
                            {
                              descripcion: `Alojamiento Hab. ${roomNum} (${nights} noche${nights !== 1 ? "s" : ""})`,
                              precioUnitario: parseFloat(reservation.totalRoomAmount || "0"),
                            },
                            ...activeCharges.map((c: any) => ({
                              descripcion: c.description || "Cargo adicional",
                              precioUnitario: parseFloat(c.amount),
                            })),
                          ],
                        };
                      }
                      checkOutMutation.mutate();
                      setCheckoutStep(0);
                    }} disabled={checkOutMutation.isPending} data-testid="button-checkout-confirm">
                      {checkOutMutation.isPending ? "Procesando..." : "Confirmar Check-out"}
                    </Button>
                  </div>
                </div>
              )}
            </div>
          ) : isEditing ? (
            <div className="space-y-4 py-2">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <Label className="text-xs">Check-in</Label>
                  <Input type="date" value={editCheckIn} onChange={(e) => setEditCheckIn(e.target.value)} data-testid="input-edit-checkin" />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Check-out</Label>
                  <Input type="date" value={editCheckOut} onChange={(e) => setEditCheckOut(e.target.value)} data-testid="input-edit-checkout" />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Canal</Label>
                  <Select value={editChannel} onValueChange={setEditChannel}>
                    <SelectTrigger data-testid="select-edit-channel"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {(["directo","booking","expedia","airbnb","despegar","telefono","email","web","agencia","otro"] as const).map(s => (
                        <SelectItem key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Tarifa/noche</Label>
                  <Input type="number" min={0} step="0.01" value={editRatePerNight} onChange={(e) => setEditRatePerNight(e.target.value)} data-testid="input-edit-rate" />
                </div>
              </div>
              <div className="flex items-center gap-4">
                <label className="flex items-center gap-2 text-sm cursor-pointer">
                  <input type="checkbox" checked={editEarlyCheckIn} onChange={(e) => setEditEarlyCheckIn(e.target.checked)} className="rounded" data-testid="check-edit-early" />
                  <Sunrise className="h-4 w-4 text-orange-400" /> Early Check-in
                </label>
                <label className="flex items-center gap-2 text-sm cursor-pointer">
                  <input type="checkbox" checked={editLateCheckOut} onChange={(e) => setEditLateCheckOut(e.target.checked)} className="rounded" data-testid="check-edit-late" />
                  <Sunset className="h-4 w-4 text-purple-400" /> Late Check-out
                </label>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Observaciones</Label>
                <Textarea value={editNotes} onChange={(e) => setEditNotes(e.target.value)} rows={2} data-testid="input-edit-notes" />
              </div>
              <div className="flex justify-end gap-2">
                <Button variant="outline" size="sm" onClick={() => setIsEditing(false)}>Cancelar</Button>
                <Button size="sm" onClick={saveEdit} disabled={updateReservationMutation.isPending} data-testid="button-save-edit">
                  {updateReservationMutation.isPending ? "Guardando..." : "Guardar Cambios"}
                </Button>
              </div>
            </div>
          ) : (
            <div className="space-y-4 py-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <User className="h-4 w-4 text-muted-foreground" />
                  <span className="font-medium">{reservation.guest?.lastName} {reservation.guest?.firstName}</span>
                </div>
                <Badge variant={statusBadge?.variant}>{statusBadge?.label}</Badge>
              </div>
              <Separator />
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div className="space-y-1">
                  <div className="text-muted-foreground">Habitacion</div>
                  <div className="font-medium flex items-center gap-1"><Bed className="h-4 w-4" />{reservation.room?.roomNumber} - {reservation.room?.roomType?.name}</div>
                </div>
                <div className="space-y-1">
                  <div className="text-muted-foreground">Huespedes</div>
                  <div className="font-medium flex items-center gap-1"><Users className="h-4 w-4" />{reservation.numberOfGuests} persona(s)</div>
                </div>
                <div className="space-y-1">
                  <div className="text-muted-foreground">Check-in</div>
                  <div className="font-medium">{formatDateReadable(reservation.checkInDate)}</div>
                </div>
                <div className="space-y-1">
                  <div className="text-muted-foreground">Check-out</div>
                  <div className="font-medium">{formatDateReadable(reservation.checkOutDate)}</div>
                </div>
                <div className="space-y-1">
                  <div className="text-muted-foreground">Noches</div>
                  <div className="font-medium">{reservation.nights}</div>
                </div>
                <div className="space-y-1">
                  <div className="text-muted-foreground">Tarifa/noche</div>
                  <div className="font-medium">${reservation.finalRatePerNight}</div>
                </div>
              </div>
              <Separator />
              <div className="flex items-center justify-between bg-muted/50 rounded-md p-3">
                <div className="flex items-center gap-2">
                  <DollarSign className="h-5 w-5 text-muted-foreground" />
                  <div>
                    <div className="text-sm text-muted-foreground">Total Habitacion</div>
                    <div className="font-semibold">${reservation.totalRoomAmount}</div>
                  </div>
                </div>
                {totalCharges > 0 && (
                  <div className="text-right">
                    <div className="text-sm text-muted-foreground">Cargos extras</div>
                    <div className="font-semibold">${totalCharges.toFixed(2)}</div>
                  </div>
                )}
              </div>
              {reservation.notes && (
                <div className="text-sm bg-muted/30 rounded-md p-3">
                  <div className="text-muted-foreground mb-1">Notas:</div>
                  <div style={{ whiteSpace: "pre-wrap" }}>{reservation.notes}</div>
                </div>
              )}
              {activePrefs.length > 0 && (
                <div className={`p-3 rounded-lg border ${criticalPrefs.length > 0 ? "border-red-300 bg-red-50 dark:border-red-800 dark:bg-red-950/30" : "border-orange-200 bg-orange-50 dark:border-orange-800 dark:bg-orange-950/30"}`} data-testid="planning-preference-alert">
                  <div className="flex items-center gap-2 mb-2">
                    {criticalPrefs.length > 0 ? (
                      <AlertTriangle className="h-4 w-4 text-red-500" />
                    ) : (
                      <Heart className="h-4 w-4 text-orange-500" />
                    )}
                    <span className="font-medium text-sm text-foreground">
                      Preferencias del huésped ({activePrefs.length})
                    </span>
                  </div>
                  <div className="space-y-1.5">
                    {activePrefs.map((pref: any) => (
                      <div key={pref.id} className="flex items-center gap-2 text-sm">
                        <Badge
                          variant="outline"
                          className={`text-xs ${
                            pref.priority === "critical" ? "border-red-400 text-red-700 dark:text-red-300" :
                            pref.priority === "high" ? "border-orange-400 text-orange-700 dark:text-orange-300" :
                            ""
                          }`}
                        >
                          {pref.priority === "critical" ? "Crítica" : pref.priority === "high" ? "Alta" : pref.priority === "low" ? "Baja" : "Normal"}
                        </Badge>
                        <span className="text-foreground">{pref.title}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )
        ) : null}

        {!isEditing && (
          <DialogFooter className="flex-col gap-2 sm:flex-row sm:flex-wrap">
            {reservation && (
              <Button variant="outline" onClick={printConfirmation} className="w-full sm:w-auto" data-testid="button-print-confirmation">
                <FileText className="h-4 w-4 mr-2" />Confirmación
              </Button>
            )}
            {reservation && reservation.status !== "checked_out" && reservation.status !== "cancelled" && onEdit && (
              reservation.isGroup && reservation.groupId ? (
                <Button variant="outline" size="sm" onClick={() => { onOpenChange(false); onNavigate(`/groups/${reservation.groupId}`); }} className="w-full sm:w-auto" data-testid="button-edit-group-reservation">
                  <Users className="h-4 w-4 mr-2" />Ver en Grupo
                </Button>
              ) : (
                <Button variant="outline" size="sm" onClick={() => { onEdit(reservation); onOpenChange(false); }} className="w-full sm:w-auto" data-testid="button-edit-reservation">
                  <ArrowLeftRight className="h-4 w-4 mr-2" />Editar
                </Button>
              )
            )}
            {canCheckIn && (
              <Button
                onClick={() => {
                  const roomStatus = reservation?.room?.status;
                  if (roomStatus === "dirty" || roomStatus === "cleaning" || roomStatus === "maintenance") {
                    setDirtyRoomDialogOpen(true);
                    return;
                  }
                  checkInMutation.mutate({});
                }}
                disabled={checkInMutation.isPending}
                className="w-full sm:w-auto"
                data-testid="button-checkin-quick"
              >
                <LogIn className="h-4 w-4 mr-2" />{checkInMutation.isPending ? "Procesando..." : "Check-in"}
              </Button>
            )}
            {canCheckOut && (
              <Button onClick={startCheckout} variant="secondary" className="w-full sm:w-auto" data-testid="button-checkout-quick">
                <LogOut className="h-4 w-4 mr-2" />Check-out
              </Button>
            )}
            {canUndoCheckOut && (
              <Button variant="outline" size="sm" onClick={() => { if (window.confirm("¿Revertir el check-out? La reserva volverá a Check-in y la habitación quedará Ocupada.")) { undoCheckOutMutation.mutate(); } }} disabled={undoCheckOutMutation.isPending} className="w-full sm:w-auto text-orange-600 border-orange-300 hover:bg-orange-50 dark:text-orange-400 dark:border-orange-700 dark:hover:bg-orange-950/30" data-testid="button-undo-checkout">
                <Undo2 className="h-4 w-4 mr-2" />{undoCheckOutMutation.isPending ? "Revirtiendo..." : "Revertir Check-out"}
              </Button>
            )}
            {canUndoCheckIn && (
              <Button variant="outline" size="sm" onClick={() => { if (window.confirm("¿Revertir el check-in? La reserva volverá a Confirmada y la habitación quedará Limpia.")) { undoCheckInMutation.mutate(); } }} disabled={undoCheckInMutation.isPending} className="w-full sm:w-auto text-orange-600 border-orange-300 hover:bg-orange-50 dark:text-orange-400 dark:border-orange-700 dark:hover:bg-orange-950/30" data-testid="button-undo-checkin">
                <Undo2 className="h-4 w-4 mr-2" />{undoCheckInMutation.isPending ? "Revirtiendo..." : "Revertir Check-in"}
              </Button>
            )}
            {canCancel && (
              <Button variant="destructive" size="sm" onClick={() => { if (window.confirm("¿Está seguro que desea cancelar esta reserva?")) { cancelReservationMutation.mutate(); } }} disabled={cancelReservationMutation.isPending} className="w-full sm:w-auto" data-testid="button-cancel-reservation">
                <Ban className="h-4 w-4 mr-2" />{cancelReservationMutation.isPending ? "Cancelando..." : "Anular"}
              </Button>
            )}
            <Button variant="outline" onClick={() => { onOpenChange(false); onNavigate(`/reservations?view=${reservationId}`); }} className="w-full sm:w-auto" data-testid="button-view-full">
              <ExternalLink className="h-4 w-4 mr-2" />Ver Completo
            </Button>
            {reservation && !isEditing && checkoutStep === 0 && reservation.status !== "checked_out" && reservation.status !== "cancelled" && (
              <Button variant="ghost" size="sm" onClick={startEditing} className="w-full sm:w-auto" data-testid="button-start-edit">
                Editar fechas/tarifa
              </Button>
            )}
          </DialogFooter>
        )}
      </DialogContent>

      {/* Retroactive check-in dialog */}
      <Dialog open={retroDialogOpen} onOpenChange={(open) => { setRetroDialogOpen(open); if (!open) setRetroMotivo(""); }}>
        <DialogContent className="w-[95vw] max-w-md">
          <DialogHeader>
            <DialogTitle>Check-in retroactivo</DialogTitle>
            <DialogDescription>
              La fecha de check-in es anterior a hoy. Ingresá el motivo para registrarlo.
            </DialogDescription>
          </DialogHeader>
          <div className="py-2">
            <Label htmlFor="retro-motivo-planning">Motivo (obligatorio)</Label>
            <Input
              id="retro-motivo-planning"
              className="mt-1"
              placeholder="Ej: El huésped llegó ayer sin registrar..."
              value={retroMotivo}
              onChange={(e) => setRetroMotivo(e.target.value)}
              data-testid="input-retro-motivo-planning"
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setRetroDialogOpen(false); setRetroMotivo(""); }}>Cancelar</Button>
            <Button
              disabled={!retroMotivo.trim() || checkInMutation.isPending}
              onClick={() => { if (retroMotivo.trim()) checkInMutation.mutate({ motivo: retroMotivo }); }}
              data-testid="button-confirm-retro-checkin-planning"
            >
              {checkInMutation.isPending ? "Procesando..." : "Confirmar Check-in"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Aviso: habitación sucia o en mantenimiento */}
      <Dialog open={dirtyRoomDialogOpen} onOpenChange={setDirtyRoomDialogOpen}>
        <DialogContent className="w-[95vw] max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-orange-700 dark:text-orange-400">
              <AlertCircle className="h-5 w-5" />
              Habitación no disponible
            </DialogTitle>
            <DialogDescription>
              La habitación <strong>{reservation?.room?.roomNumber}</strong> figura como{" "}
              <strong>
                {reservation?.room?.status === "dirty"
                  ? "sucia"
                  : reservation?.room?.status === "maintenance"
                  ? "en mantenimiento"
                  : "en limpieza"}
              </strong>{" "}
              en el sistema. ¿Desea registrar el check-in de todas formas?
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDirtyRoomDialogOpen(false)} data-testid="button-cancel-dirty-warning-planning">
              Cancelar
            </Button>
            <Button
              variant="destructive"
              onClick={() => { setDirtyRoomDialogOpen(false); checkInMutation.mutate({}); }}
              disabled={checkInMutation.isPending}
              data-testid="button-confirm-dirty-checkin-planning"
            >
              Confirmar de todas formas
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Dialog>

    {showCheckoutFactura && (
      <EmitirFacturaDialog
        open={showCheckoutFactura}
        onClose={() => setShowCheckoutFactura(false)}
        config={billingConfig}
        initialValues={checkoutFacturaInitial}
      />
    )}
  </>
  );
}
