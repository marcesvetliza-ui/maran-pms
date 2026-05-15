import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Calendar, User, DollarSign, Bed, Users, LogIn, LogOut, ExternalLink, FileText, Ban, ArrowLeftRight, Sunrise, Sunset } from "lucide-react";
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
    tentative: { label: "Tentativa", variant: "outline" },
    pending: { label: "Pendiente", variant: "secondary" },
    confirmed: { label: "Confirmada", variant: "default" },
    checked_in: { label: "Check-in", variant: "default" },
    checked_out: { label: "Check-out", variant: "outline" },
    cancelled: { label: "Cancelada", variant: "destructive" },
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
    mutationFn: async () => apiRequest("POST", `/api/reservations/${reservationId}/check-in`, {}),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/reservations"] });
      queryClient.invalidateQueries({ predicate: (query) => Array.isArray(query.queryKey) && query.queryKey[0] === "/api/planning" });
      queryClient.invalidateQueries({ queryKey: ["/api/dashboard/stats"] });
      queryClient.invalidateQueries({ queryKey: ["/api/dashboard/arrivals"] });
      queryClient.invalidateQueries({ queryKey: ["/api/dashboard/departures"] });
      queryClient.invalidateQueries({ queryKey: ["/api/rooms"] });
      toast({ title: "Check-in realizado", description: "El huesped ha sido registrado." });
      onOpenChange(false);
    },
    onError: (error: any) => {
      const message = error?.data?.error || error?.message || "No se pudo realizar el check-in.";
      toast({ title: "Error en Check-in", description: message, variant: "destructive" });
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

  const cancelReservationMutation = useMutation({
    mutationFn: async () => apiRequest("PATCH", `/api/reservations/${reservationId}`, { status: "cancelled" }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/reservations"] });
      queryClient.invalidateQueries({ predicate: (query) => Array.isArray(query.queryKey) && query.queryKey[0] === "/api/planning" });
      queryClient.invalidateQueries({ queryKey: ["/api/dashboard/stats"] });
      queryClient.invalidateQueries({ queryKey: ["/api/rooms"] });
      toast({ title: "Reserva cancelada" });
      onOpenChange(false);
    },
    onError: (error: any) => {
      toast({ title: "Error", description: error?.message || "No se pudo cancelar", variant: "destructive" });
    },
  });

  if (!reservationId) return null;

  const statusBadge = reservation ? getStatusBadge(reservation.status) : null;
  const todayLocal = getLocalToday();
  const isCheckInDateValid = reservation ? (() => {
    const todayMs = new Date(todayLocal + "T12:00:00").getTime();
    const ciMs = new Date(reservation.checkInDate + "T12:00:00").getTime();
    return Math.abs(Math.round((ciMs - todayMs) / (1000 * 60 * 60 * 24))) <= 1;
  })() : false;
  const isCheckOutDateValid = reservation ? (() => {
    const todayMs = new Date(todayLocal + "T12:00:00").getTime();
    const coMs = new Date(reservation.checkOutDate + "T12:00:00").getTime();
    return Math.abs(Math.round((coMs - todayMs) / (1000 * 60 * 60 * 24))) <= 1;
  })() : false;
  const canCheckIn = (reservation?.status === "confirmed" || reservation?.status === "pending") && isCheckInDateValid;
  const canCheckOut = reservation?.status === "checked_in" && isCheckOutDateValid;
  const canCancel = reservation?.status === "confirmed" || reservation?.status === "pending" || reservation?.status === "tentative";
  const totalCharges = reservation?.charges?.reduce((sum, c) => sum + parseFloat(c.amount), 0) || 0;

  const printConfirmation = () => {
    if (!reservation) return;
    const guest = reservation.guest;
    const room = reservation.room;
    const guestName = `${(guest?.lastName || "").toUpperCase()} ${guest?.firstName || ""}`.trim();
    const formatShort = (dateStr: string) => { const [y, m, d] = dateStr.split("-"); return `${d}/${m}/${y}`; };
    const checkIn = formatShort(reservation.checkInDate);
    const checkOut = formatShort(reservation.checkOutDate);
    const nights = Math.round((new Date(reservation.checkOutDate).getTime() - new Date(reservation.checkInDate).getTime()) / (1000 * 60 * 60 * 24));
    const roomTypeName = room?.roomType?.name || "Habitación";
    const dailyRate = reservation.finalRatePerNight ? `$${Number(reservation.finalRatePerNight).toLocaleString("es-AR", { minimumFractionDigits: 2 })}` : "$0.00";
    const totalRate = reservation.totalRoomAmount ? `$${Number(reservation.totalRoomAmount).toLocaleString("es-AR", { minimumFractionDigits: 2 })}` : "$0.00";
    const pax = reservation.numberOfGuests || 1;
    const reservationCode = reservation.reservationCode || reservation.id;
    const company = (reservation as any).company?.razonSocial || (reservation as any).company?.nombreFantasia || "";
    const earlyCheckIn = reservation.earlyCheckIn;
    const earlyCheckInTime = reservation.earlyCheckInTime || "";
    const earlyCheckInCharge = reservation.earlyCheckInCharge ? parseFloat(String(reservation.earlyCheckInCharge)) : 0;
    const lateCheckOut = reservation.lateCheckOut;
    const lateCheckOutTime = reservation.lateCheckOutTime || "";
    const lateCheckOutCharge = reservation.lateCheckOutCharge ? parseFloat(String(reservation.lateCheckOutCharge)) : 0;
    const formatMoney = (n: number) => `$${n.toLocaleString("es-AR", { minimumFractionDigits: 2 })}`;
    const totalConExtras = parseFloat(reservation.totalRoomAmount || "0") + (earlyCheckIn ? earlyCheckInCharge : 0) + (lateCheckOut ? lateCheckOutCharge : 0);
    const totalConExtrasStr = formatMoney(totalConExtras);

    const html = `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <title>Confirmación de Reserva - ${guestName}</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: Arial, sans-serif; font-size: 12px; color: #333; background: white; }
    .page { max-width: 780px; margin: 0 auto; padding: 0; }
    .header-photo { width: 100%; height: 180px; background: linear-gradient(180deg, #2c5f8a 0%, #1a3a5c 60%, #0d2035 100%); display: flex; align-items: center; justify-content: center; color: rgba(255,255,255,0.3); font-size: 13px; letter-spacing: 2px; text-transform: uppercase; }
    .logo-bar { display: flex; align-items: center; justify-content: space-between; padding: 14px 24px; border-bottom: 2px solid #c8a97e; background: #fff; }
    .logo-left { display: flex; align-items: center; gap: 14px; }
    .logo-circle { width: 56px; height: 56px; border-radius: 50%; border: 2px solid #c8a97e; display: flex; align-items: center; justify-content: center; font-size: 7px; font-weight: bold; color: #c8a97e; text-align: center; line-height: 1.3; letter-spacing: 0.5px; text-transform: uppercase; padding: 6px; }
    .logo-name { font-size: 20px; font-weight: bold; color: #8b5e2a; font-family: Georgia, serif; line-height: 1.1; }
    .logo-name span { display: block; font-size: 11px; font-weight: normal; color: #999; letter-spacing: 2px; text-transform: uppercase; font-family: Arial, sans-serif; }
    .logo-badge { text-align: center; font-size: 8px; color: #888; border: 1px solid #ccc; border-radius: 4px; padding: 6px 10px; line-height: 1.5; }
    .logo-badge strong { display: block; font-size: 10px; color: #c8a97e; }
    .content { padding: 20px 28px; }
    .reservation-header { display: grid; grid-template-columns: 1fr 1fr 1fr 1fr 1fr; gap: 0; border: 1px solid #ccc; margin-bottom: 18px; }
    .reservation-header .cell { padding: 6px 10px; border-right: 1px solid #ccc; }
    .reservation-header .cell:last-child { border-right: none; }
    .reservation-header .cell-label { font-size: 8px; color: #888; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 3px; }
    .reservation-header .cell-value { font-size: 12px; font-weight: bold; color: #111; }
    .greeting { font-size: 12px; color: #444; line-height: 1.6; margin-bottom: 18px; }
    .details-table { width: 100%; border-collapse: collapse; margin-bottom: 18px; font-size: 11px; }
    .details-table td { padding: 5px 10px; border: 1px solid #ddd; vertical-align: middle; }
    .details-table .label-col { background: #f5f5f5; font-weight: bold; color: #555; width: 45%; }
    .details-table .value-col { color: #111; font-size: 12px; }
    .rates-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 0; border: 1px solid #ddd; margin-bottom: 4px; }
    .rates-grid .rate-cell { padding: 5px 10px; border-right: 1px solid #ddd; border-bottom: 1px solid #ddd; font-size: 11px; }
    .rates-grid .rate-cell:nth-child(even) { border-right: none; }
    .rates-grid .rate-label { font-weight: bold; color: #555; background: #f5f5f5; font-size: 10px; }
    .rates-grid .rate-value { color: #111; }
    .total-box { border: 2px solid #333; text-align: center; padding: 6px; font-size: 13px; font-weight: bold; margin-bottom: 18px; color: #111; }
    .total-box span { font-size: 10px; font-weight: normal; color: #555; margin-right: 8px; }
    .conditions { font-size: 10px; color: #444; line-height: 1.7; margin-bottom: 20px; }
    .conditions p { margin-bottom: 3px; }
    .conditions p::before { content: "» "; color: #888; }
    .sustainable { font-size: 10px; color: #4a7c59; font-style: italic; margin-bottom: 20px; }
    .footer { border-top: 2px solid #c8a97e; padding: 12px 0 0; display: flex; align-items: center; justify-content: space-between; font-size: 10px; color: #555; }
    .footer-left { line-height: 1.8; }
    .footer-right { font-size: 13px; font-weight: bold; color: #8b5e2a; letter-spacing: 1px; text-transform: uppercase; }
    @media print { body { margin: 0; } .page { max-width: 100%; } }
  </style>
</head>
<body>
<div class="page">
  <div class="header-photo">MARAN SUITES &amp; TOWERS · PARANÁ</div>
  <div class="logo-bar">
    <div class="logo-left">
      <div class="logo-circle">Hotel<br>&amp; Spa<br>MARAN<br>SUITES<br>&amp; Towers</div>
      <div class="logo-name">MARAN SUITES &amp; TOWERS<span>Hotel &amp; Spa · Paraná, Entre Ríos</span></div>
    </div>
    <div class="logo-badge"><strong>PLATA</strong>CERTIFICACIÓN<br>EN SOSTENIBILIDAD<br>HOTELES MÁS VERDES</div>
  </div>
  <div class="content">
    <div class="reservation-header">
      <div class="cell"><div class="cell-label">Apellido y Nombre / Last Name and Name</div><div class="cell-value">${guestName}</div></div>
      <div class="cell"><div class="cell-label">Check In</div><div class="cell-value">${checkIn}</div></div>
      <div class="cell"><div class="cell-label">Check Out</div><div class="cell-value">${checkOut}</div></div>
      <div class="cell"><div class="cell-label">Cant. de Pax</div><div class="cell-value">${pax}</div></div>
      <div class="cell"><div class="cell-label">Nº de Reserva</div><div class="cell-value">${reservationCode}</div></div>
    </div>
    ${company ? `<div class="reservation-header" style="margin-top:-14px;"><div class="cell" style="grid-column: span 5; border-right: none;"><div class="cell-label">Empresa / Company</div><div class="cell-value">${company}</div></div></div>` : ""}
    <div class="greeting"><strong>Estimado/a,</strong><br>Gracias por efectuar su reserva, será un placer recibirlo en nuestra casa. A continuación detallamos la información correspondiente a la misma.</div>
    <table class="details-table">
      <tr><td class="label-col">Cantidad de noches / Number of nights</td><td class="value-col">${nights}</td></tr>
      <tr><td class="label-col">Categoría de Habitación / Type of Room</td><td class="value-col">${roomTypeName}</td></tr>
    </table>
    <div class="rates-grid">
      <div class="rate-cell rate-label">Tarífa diaria / Daily rate</div>
      <div class="rate-cell rate-value">${dailyRate}</div>
      <div class="rate-cell rate-label">Total Alojamiento / Total room rate</div>
      <div class="rate-cell rate-value">${totalRate}</div>
      ${earlyCheckIn ? `<div class="rate-cell rate-label" style="color:#b45309;">Early Check-in${earlyCheckInTime ? ` (${earlyCheckInTime} hs)` : ""}</div><div class="rate-cell rate-value" style="color:#b45309;">${formatMoney(earlyCheckInCharge)}</div>` : ""}
      ${lateCheckOut ? `<div class="rate-cell rate-label" style="color:#7c3aed;">Late Check-out${lateCheckOutTime ? ` (${lateCheckOutTime} hs)` : ""}</div><div class="rate-cell rate-value" style="color:#7c3aed;">${formatMoney(lateCheckOutCharge)}</div>` : ""}
    </div>
    <div class="total-box"><span>Tarífa Total / Total rate:</span>${totalConExtrasStr}</div>
    <div class="conditions">
      <p>La tarifa incluye desayuno buffet y gimnasio con turno previo.</p>
      <p>La cochera tiene costo adicional. El mismo se encuentra detallado en la parte superior.</p>
      <p>Nuestro horario de Check in es a partir de las ${earlyCheckIn && earlyCheckInTime ? earlyCheckInTime : "15:00"} Hs y el Check out es hasta las ${lateCheckOut && lateCheckOutTime ? lateCheckOutTime : "10:00"} Hs.</p>
      <p>Early Check in o Late Check out tienen costo adicional del 50% del valor de una noche.</p>
      <p>Importante: En el momento de ingreso, deberá acreditar su identidad con su respectivo DNI.</p>
    </div>
    <div class="sustainable">Somos un hotel certificado en acciones sustentables, por lo que no es necesario que se imprima esta confirmación de reserva, la misma es válida en formato digital.</div>
    <div class="footer">
      <div class="footer-left">Alameda de la Federación y Mitre, Paraná (3100) Entre Ríos, Argentina<br>✉ reservas@maran.com.ar &nbsp;|&nbsp; +54 9 343 503 8070 &nbsp;|&nbsp; ☎ +54 (0343) 423 5444</div>
      <div class="footer-right">maran.com.ar</div>
    </div>
  </div>
</div>
<script>window.onload = function() { window.print(); };</script>
</body>
</html>`;

    const printWindow = window.open("", "_blank");
    if (printWindow) { printWindow.document.write(html); printWindow.document.close(); }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[95vw] max-w-[560px] max-h-[90vh] overflow-y-auto">
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
          <DialogFooter className="flex-col gap-2 sm:flex-row">
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
              <Button onClick={() => checkInMutation.mutate()} disabled={checkInMutation.isPending} className="w-full sm:w-auto" data-testid="button-checkin-quick">
                <LogIn className="h-4 w-4 mr-2" />{checkInMutation.isPending ? "Procesando..." : "Check-in"}
              </Button>
            )}
            {canCheckOut && (
              <Button onClick={startCheckout} variant="secondary" className="w-full sm:w-auto" data-testid="button-checkout-quick">
                <LogOut className="h-4 w-4 mr-2" />Check-out
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
    </Dialog>
  );
}
