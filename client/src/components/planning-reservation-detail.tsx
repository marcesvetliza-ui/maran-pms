import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Calendar, User, DollarSign, Bed, Users, LogIn, LogOut, ExternalLink, FileText, Ban, ArrowLeftRight, Sunrise, Sunset, TrendingUp, AlertCircle, StickyNote, Undo2 } from "lucide-react";
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
  const [checkoutReceiptType, setCheckoutReceiptType] = useState("ticket");
  const [checkoutPaymentMethod, setCheckoutPaymentMethod] = useState("efectivo");
  const [checkoutPayAmount, setCheckoutPayAmount] = useState("");

  const { data: reservation, isLoading } = useQuery<ReservationWithDetails>({
    queryKey: ["/api/reservations", reservationId],
    queryFn: async () => {
      const res = await fetch(`/api/reservations/${reservationId}`);
      if (!res.ok) throw new Error("Failed to fetch reservation");
      return res.json();
    },
    enabled: !!reservationId && open,
  });

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

  const startCheckout = () => {
    setCheckoutStep(1); setCheckoutReceiptType("ticket"); setCheckoutPaymentMethod("efectivo"); setCheckoutPayAmount("");
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
      toast({ title: "Check-out realizado", description: "El huesped ha sido despedido." });
      onOpenChange(false);
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
                {[1,2,3,4].map(s => <div key={s} className={`flex-1 h-1.5 rounded-full ${s <= checkoutStep ? "bg-primary" : "bg-muted"}`} />)}
              </div>
              <p className="text-xs text-muted-foreground text-center">
                Paso {checkoutStep} de 4: {checkoutStep === 1 ? "Resumen de cuenta" : checkoutStep === 2 ? "Pago" : checkoutStep === 3 ? "Comprobante" : "Confirmar"}
              </p>

              {checkoutStep === 1 && (() => {
                const totalPayments = reservation.payments?.reduce((s, p) => s + parseFloat(p.amount), 0) || 0;
                const totalAmount = parseFloat(reservation.totalRoomAmount || "0") + totalCharges;
                const balance = totalAmount - totalPayments;
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
                    <div className="p-3 bg-muted/50 rounded-md space-y-1">
                      <div className="flex justify-between text-sm"><span>Habitación ({reservation.nights} noches)</span><span>${parseFloat(reservation.totalRoomAmount || "0").toLocaleString("es-AR", { minimumFractionDigits: 2 })}</span></div>
                      {totalCharges > 0 && <div className="flex justify-between text-sm"><span>Cargos extras</span><span>${totalCharges.toFixed(2)}</span></div>}
                      <div className="flex justify-between text-sm border-t pt-1"><span>Pagado</span><span className="text-green-600">-${totalPayments.toFixed(2)}</span></div>
                      <div className="flex justify-between font-bold pt-1 border-t"><span>Saldo</span><span className={balance > 0 ? "text-destructive" : "text-green-600"}>${balance.toFixed(2)}</span></div>
                    </div>
                    <div className="flex justify-end gap-2">
                      <Button variant="outline" size="sm" onClick={() => setCheckoutStep(0)}>Cancelar</Button>
                      <Button size="sm" onClick={() => setCheckoutStep(balance > 0 ? 2 : 3)} data-testid="button-checkout-step1-next">{balance > 0 ? "Registrar Pago" : "Siguiente"}</Button>
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
                    <div className="p-3 bg-orange-500/10 border border-orange-500/30 rounded-md text-sm">
                      Saldo pendiente: <span className="font-bold">${balance.toFixed(2)}</span>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-1">
                        <Label className="text-xs">Monto</Label>
                        <Input type="number" min={0} step="0.01" value={checkoutPayAmount || balance.toFixed(2)} onChange={(e) => setCheckoutPayAmount(e.target.value)} data-testid="input-checkout-amount" />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs">Método</Label>
                        <Select value={checkoutPaymentMethod} onValueChange={setCheckoutPaymentMethod}>
                          <SelectTrigger data-testid="select-checkout-method"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="efectivo">Efectivo</SelectItem>
                            <SelectItem value="tarjeta_debito">Tarjeta Débito</SelectItem>
                            <SelectItem value="tarjeta_credito">Tarjeta Crédito</SelectItem>
                            <SelectItem value="transferencia">Transferencia</SelectItem>
                            <SelectItem value="mercadopago">MercadoPago</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                    <div className="flex justify-end gap-2">
                      <Button variant="outline" size="sm" onClick={() => setCheckoutStep(1)}>Atrás</Button>
                      <Button size="sm" onClick={() => {
                        const amount = checkoutPayAmount || balance.toFixed(2);
                        if (!amount || parseFloat(amount) <= 0) { toast({ title: "Ingresá un monto válido", variant: "destructive" }); return; }
                        addPaymentMutation.mutate({ amount, method: checkoutPaymentMethod, receiptType: checkoutReceiptType }, { onSuccess: () => setCheckoutStep(3) });
                      }} disabled={addPaymentMutation.isPending} data-testid="button-checkout-pay">
                        {addPaymentMutation.isPending ? "Procesando..." : "Registrar Pago"}
                      </Button>
                      <Button variant="ghost" size="sm" onClick={() => setCheckoutStep(3)} data-testid="button-checkout-skip-pay">Omitir</Button>
                    </div>
                  </div>
                );
              })()}

              {checkoutStep === 3 && (
                <div className="space-y-3">
                  <div className="space-y-1">
                    <Label className="text-xs">Tipo de Comprobante</Label>
                    <Select value={checkoutReceiptType} onValueChange={setCheckoutReceiptType}>
                      <SelectTrigger data-testid="select-checkout-receipt"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="ticket">Ticket</SelectItem>
                        <SelectItem value="factura_a">Factura A</SelectItem>
                        <SelectItem value="factura_b">Factura B</SelectItem>
                        <SelectItem value="factura_c">Factura C</SelectItem>
                        <SelectItem value="voucher">Voucher (No Fiscal)</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="flex justify-end gap-2">
                    <Button variant="outline" size="sm" onClick={() => setCheckoutStep(2)}>Atrás</Button>
                    <Button size="sm" onClick={() => setCheckoutStep(4)} data-testid="button-checkout-step3-next">Siguiente</Button>
                  </div>
                </div>
              )}

              {checkoutStep === 4 && (
                <div className="space-y-3">
                  <div className="p-3 bg-muted/50 rounded-md text-sm space-y-1">
                    <p>Se realizará el check-out de <span className="font-bold">{reservation.guest?.lastName} {reservation.guest?.firstName}</span>.</p>
                    <p>Habitación <span className="font-bold">{reservation.room?.roomNumber}</span> quedará en estado <Badge variant="outline" className="text-orange-700">Sucia</Badge>.</p>
                    <p>Se creará tarea de limpieza en Housekeeping.</p>
                  </div>
                  <div className="flex justify-end gap-2">
                    <Button variant="outline" size="sm" onClick={() => setCheckoutStep(3)}>Atrás</Button>
                    <Button variant="destructive" size="sm" onClick={() => { checkOutMutation.mutate(); setCheckoutStep(0); }} disabled={checkOutMutation.isPending} data-testid="button-checkout-confirm">
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
  );
}
