import { useState, useRef } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Calendar, User, DollarSign, Bed, Users, LogIn, LogOut, ExternalLink, FileText, Ban, Pencil, Sunrise, Sunset, TrendingUp, AlertCircle, AlertTriangle, Heart, StickyNote, Undo2, Building2, Percent, X, Printer } from "lucide-react";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
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
import { useAuth } from "@/App";
import { getLocalToday, fmtMoney, toArgentinaDateStr } from "@/lib/utils";
import { formatDateReadable } from "@/lib/planning-utils";
import type { ReservationWithDetails, ReservationStatus } from "@shared/schema";
import { PrefacturaDialog } from "@/components/PrefacturaDialog";

function getStatusBadge(status: ReservationStatus) {
  const config: Record<ReservationStatus, { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
    tentative:   { label: "Tentativa",    variant: "outline" },
    pending:     { label: "Pendiente",    variant: "secondary" },
    confirmed:   { label: "Confirmada",   variant: "default" },
    web_checkin: { label: "Pre Check-In", variant: "default" },
    checked_in:  { label: "Check-in",     variant: "default" },
    checked_out: { label: "Check-out",    variant: "outline" },
    cancelled:   { label: "Cancelada",    variant: "destructive" },
    no_show:     { label: "No se presentó", variant: "destructive" },
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
  const { user } = useAuth();
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
  const [adjacentWarning, setAdjacentWarning] = useState<{ type: "early" | "late"; code: string; pendingValue: boolean } | null>(null);
  const [prefacturaOpen, setPrefacturaOpen] = useState(false);

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


  const startCheckout = () => {
    setPrefacturaOpen(true);
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
      nights, totalRoomAmount: rate > 0 ? (rate * nights).toFixed(2) : null,
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
      cancelledBy: user?.username || "Recepción",
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
  const canUndoCheckOut = reservation?.status === "checked_out" &&
    reservation?.checkedOutAt != null &&
    toArgentinaDateStr(new Date(reservation.checkedOutAt)) === todayLocal;
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
          isEditing ? (
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
                  <input type="checkbox" checked={editEarlyCheckIn} onChange={async (e) => {
                    const checked = e.target.checked;
                    if (checked && reservation) {
                      const res = await fetch(`/api/reservations/check-adjacent?roomId=${reservation.roomId}&date=${reservation.checkInDate}&direction=before`, { credentials: "include" });
                      const adj = res.ok ? await res.json() : null;
                      if (adj) {
                        setAdjacentWarning({ type: "early", code: adj.reservationCode, pendingValue: true });
                        return;
                      }
                    }
                    setEditEarlyCheckIn(checked);
                  }} className="rounded" data-testid="check-edit-early" />
                  <Sunrise className="h-4 w-4 text-orange-400" /> Early Check-in
                </label>
                <label className="flex items-center gap-2 text-sm cursor-pointer">
                  <input type="checkbox" checked={editLateCheckOut} onChange={async (e) => {
                    const checked = e.target.checked;
                    if (checked && reservation) {
                      const res = await fetch(`/api/reservations/check-adjacent?roomId=${reservation.roomId}&date=${reservation.checkOutDate}&direction=after`, { credentials: "include" });
                      const adj = res.ok ? await res.json() : null;
                      if (adj) {
                        setAdjacentWarning({ type: "late", code: adj.reservationCode, pendingValue: true });
                        return;
                      }
                    }
                    setEditLateCheckOut(checked);
                  }} className="rounded" data-testid="check-edit-late" />
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
              {(reservation.companyId || reservation.agencyId) && (() => {
                const linkedCompany = reservation.companyId ? companies.find((c: any) => c.id === reservation.companyId) : null;
                const linkedAgency = reservation.agencyId ? agencies.find((a: any) => a.id === reservation.agencyId) : null;
                const entity = linkedCompany || linkedAgency;
                const entityName = entity ? (entity.razonSocial || entity.nombreFantasia || "—") : null;
                return entityName ? (
                  <div className="flex items-center gap-2 text-sm">
                    <Building2 className="h-4 w-4 text-muted-foreground shrink-0" />
                    <span className="font-medium text-foreground">{entityName}</span>
                    <Badge variant="outline" className="text-[10px] py-0">
                      {linkedCompany ? "Empresa" : "Agencia"}
                    </Badge>
                  </div>
                ) : null;
              })()}
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
                  <div className="font-medium flex items-center gap-2 flex-wrap">
                    {formatDateReadable(reservation.checkOutDate)}
                    <span className="text-xs font-normal text-muted-foreground bg-muted px-1.5 py-0.5 rounded-full whitespace-nowrap">
                      {reservation.nights} {reservation.nights === 1 ? "noche" : "noches"}
                    </span>
                  </div>
                </div>
                <div className="space-y-1">
                  <div className="text-muted-foreground">Tarifa/noche</div>
                  <div className="font-medium">${fmtMoney(reservation.finalRatePerNight || 0)}</div>
                </div>
              </div>
              <Separator />
              {(() => {
                const totalRoom = parseFloat(reservation.totalRoomAmount || "0");
                const totalAdvances = (reservation.payments ?? [])
                  .filter((p: any) => p.status === "active")
                  .reduce((s: number, p: any) => s + parseFloat(p.amount), 0);
                const totalToInvoice = totalRoom + totalCharges - totalAdvances;
                return (
                  <div className="bg-muted/50 rounded-md p-3 space-y-2">
                    <div className="grid grid-cols-2 gap-x-4 gap-y-2">
                      <div>
                        <div className="text-xs text-muted-foreground">Total Habitación</div>
                        <div className="font-semibold text-sm">${fmtMoney(totalRoom)}</div>
                      </div>
                      <div className="text-right">
                        <div className="text-xs text-muted-foreground">Cargos extras</div>
                        <div className="font-semibold text-sm">${fmtMoney(totalCharges)}</div>
                      </div>
                      {totalAdvances > 0 && (
                        <div>
                          <div className="text-xs text-muted-foreground">Anticipos</div>
                          <div className="font-semibold text-sm text-green-600 dark:text-green-400">−${fmtMoney(totalAdvances)}</div>
                        </div>
                      )}
                      <div className={totalAdvances > 0 ? "text-right" : "col-span-2 text-right"}>
                        <div className="text-xs text-muted-foreground">Total a facturar</div>
                        <div className={`font-bold text-base ${totalToInvoice <= 0 ? "text-green-600 dark:text-green-400" : "text-foreground"}`}>
                          ${fmtMoney(Math.max(0, totalToInvoice))}
                          {totalToInvoice <= 0 && <span className="text-xs font-normal ml-1 opacity-70">saldado</span>}
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })()}
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
                  <Pencil className="h-4 w-4 mr-2" />Editar
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

    <AlertDialog open={!!adjacentWarning} onOpenChange={(open) => { if (!open) setAdjacentWarning(null); }}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-amber-500" />
            {adjacentWarning?.type === "early" ? "Reserva saliente el mismo día" : "Reserva entrante el mismo día"}
          </AlertDialogTitle>
          <AlertDialogDescription>
            {adjacentWarning?.type === "early"
              ? <>La habitación tiene otra reserva (<strong>{adjacentWarning?.code}</strong>) que hace check-out ese mismo día. Aplicar Early Check-in puede generar solapamiento de horarios.</>
              : <>La habitación tiene otra reserva (<strong>{adjacentWarning?.code}</strong>) que hace check-in ese mismo día. Aplicar Late Check-out puede generar solapamiento de horarios.</>
            }
            {" "}¿Querés aplicarlo de todas formas?
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel onClick={() => setAdjacentWarning(null)}>Cancelar</AlertDialogCancel>
          <AlertDialogAction onClick={() => {
            if (adjacentWarning?.type === "early") setEditEarlyCheckIn(true);
            else setEditLateCheckOut(true);
            setAdjacentWarning(null);
          }}>
            Aplicar de todas formas
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>

    {reservationId && (
      <PrefacturaDialog
        open={prefacturaOpen}
        onClose={() => setPrefacturaOpen(false)}
        reservationId={reservationId}
        reservation={reservation as any}
        mode="checkout"
        onCheckoutComplete={() => { setPrefacturaOpen(false); onOpenChange(false); }}
      />
    )}
  </>
  );
}
