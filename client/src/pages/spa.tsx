import { useState, useMemo, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area";
import { useToast } from "@/hooks/use-toast";
import { format, addDays, startOfDay, parseISO, isSameDay } from "date-fns";
import { es } from "date-fns/locale";
import { 
  Plus, 
  ChevronLeft, 
  ChevronRight,
  Clock,
  User,
  Phone,
  Mail,
  Loader2,
  Calendar,
  Sparkles,
  CreditCard,
  Home,
  Receipt,
} from "lucide-react";

type SpaCabin = {
  id: string;
  name: string;
  description: string | null;
  isActive: string | null;
};

type SpaTreatment = {
  id: string;
  categoryId: string | null;
  name: string;
  description: string | null;
  durationMinutes: number;
  price: string;
  isActive: string | null;
};

type SpaAppointment = {
  id: string;
  cabinId: string;
  treatmentId: string;
  guestName: string;
  guestLastName: string | null;
  guestPhone: string | null;
  guestEmail: string | null;
  reservationId: string | null;
  appointmentDate: string;
  startTime: string;
  endTime: string;
  status: "pending" | "confirmed" | "in_progress" | "completed" | "cancelled" | "no_show";
  notes: string | null;
  createdAt: string;
  cabin?: SpaCabin;
  treatment?: SpaTreatment;
};

type SpaAccountItem = {
  id: string;
  accountId: string;
  description: string;
  quantity: number;
  unitPrice: string;
  subtotal: string;
  itemType: string;
  notes: string | null;
  createdAt: string;
};

type SpaAccount = {
  id: string;
  appointmentId: string;
  guestName: string;
  reservationId: string | null;
  status: "open" | "closed" | "cancelled";
  subtotal: string;
  total: string;
  notes: string | null;
  openedAt: string;
  closedAt: string | null;
  closedBy: string | null;
  chargedTo: string | null;
  items: SpaAccountItem[];
};

type Reservation = {
  id: string;
  guestId: string;
  roomId: string;
  status: string;
  guest?: { firstName: string; lastName: string };
  room?: { roomNumber: string };
};

const appointmentStatusColors: Record<string, string> = {
  pending: "bg-yellow-500/20 text-yellow-700 dark:text-yellow-400 border-yellow-500/30",
  confirmed: "bg-blue-500/20 text-blue-700 dark:text-blue-400 border-blue-500/30",
  in_progress: "bg-green-500/20 text-green-700 dark:text-green-400 border-green-500/30",
  completed: "bg-gray-500/20 text-gray-700 dark:text-gray-400 border-gray-500/30",
  cancelled: "bg-red-500/20 text-red-700 dark:text-red-400 border-red-500/30",
  no_show: "bg-orange-500/20 text-orange-700 dark:text-orange-400 border-orange-500/30",
};

const appointmentStatusLabels: Record<string, string> = {
  pending: "Pendiente",
  confirmed: "Confirmado",
  in_progress: "En Curso",
  completed: "Completado",
  cancelled: "Cancelado",
  no_show: "No Show",
};

const TIME_SLOTS: string[] = [];
for (let h = 8; h < 22; h++) {
  TIME_SLOTS.push(`${h.toString().padStart(2, "0")}:00`);
  TIME_SLOTS.push(`${h.toString().padStart(2, "0")}:30`);
}
TIME_SLOTS.push("22:00");

const appointmentFormSchema = z.object({
  cabinId: z.string().min(1, "Seleccione un gabinete"),
  treatmentId: z.string().min(1, "Seleccione un tratamiento"),
  guestName: z.string().min(1, "El nombre es requerido"),
  guestLastName: z.string().optional(),
  guestPhone: z.string().optional(),
  guestEmail: z.string().email("Email invalido").optional().or(z.literal("")),
  appointmentDate: z.string().min(1, "La fecha es requerida"),
  startTime: z.string().min(1, "La hora de inicio es requerida"),
  reservationId: z.string().optional(),
  notes: z.string().optional(),
});

type AppointmentFormValues = z.infer<typeof appointmentFormSchema>;

function timeToMinutes(time: string): number {
  const [h, m] = time.split(":").map(Number);
  return h * 60 + m;
}

export default function SpaPage() {
  const [selectedDate, setSelectedDate] = useState(startOfDay(new Date()));
  const [selectedAppointment, setSelectedAppointment] = useState<SpaAppointment | null>(null);
  const [isNewDialogOpen, setIsNewDialogOpen] = useState(false);
  const [isCloseDialogOpen, setIsCloseDialogOpen] = useState(false);
  const [selectedReservationForCharge, setSelectedReservationForCharge] = useState<string>("");
  const { toast } = useToast();

  const { data: cabins = [], isLoading: cabinsLoading } = useQuery<SpaCabin[]>({
    queryKey: ["/api/spa/cabins"],
  });

  const { data: treatments = [] } = useQuery<SpaTreatment[]>({
    queryKey: ["/api/spa/treatments"],
  });

  const { data: checkedInReservations = [] } = useQuery<Reservation[]>({
    queryKey: ["/api/reservations"],
    select: (data) => data.filter((r) => r.status === "checked_in"),
  });

  const dateStr = format(selectedDate, "yyyy-MM-dd");
  const { data: appointments = [], isLoading: appointmentsLoading } = useQuery<SpaAppointment[]>({
    queryKey: ["/api/spa/appointments", dateStr, dateStr],
    queryFn: async () => {
      const response = await fetch(
        `/api/spa/appointments?startDate=${dateStr}&endDate=${dateStr}`
      );
      if (!response.ok) throw new Error("Error fetching appointments");
      return response.json();
    },
  });

  const { data: selectedAccount, refetch: refetchAccount } = useQuery<SpaAccount>({
    queryKey: ["/api/spa/accounts/by-appointment", selectedAppointment?.id],
    queryFn: async () => {
      if (!selectedAppointment) throw new Error("No appointment selected");
      const response = await fetch(`/api/spa/accounts/by-appointment/${selectedAppointment.id}`);
      if (!response.ok) throw new Error("Account not found");
      return response.json();
    },
    enabled: !!selectedAppointment,
  });

  const activeCabins = cabins.filter((c) => c.isActive === "true");

  const form = useForm<AppointmentFormValues>({
    resolver: zodResolver(appointmentFormSchema),
    defaultValues: {
      cabinId: "",
      treatmentId: "",
      guestName: "",
      guestLastName: "",
      guestPhone: "",
      guestEmail: "",
      appointmentDate: dateStr,
      startTime: "",
      reservationId: "",
      notes: "",
    },
  });

  const createAppointmentMutation = useMutation({
    mutationFn: async (data: AppointmentFormValues) => {
      const treatment = treatments.find((t) => t.id === data.treatmentId);
      const durationMinutes = treatment?.durationMinutes ?? 60;
      
      const startMinutes = timeToMinutes(data.startTime);
      const endMinutes = startMinutes + durationMinutes;
      const endHours = Math.floor(endMinutes / 60);
      const endMins = endMinutes % 60;
      const endTime = `${endHours.toString().padStart(2, "0")}:${endMins.toString().padStart(2, "0")}`;

      return apiRequest("POST", "/api/spa/appointments", {
        ...data,
        endTime,
        status: "confirmed",
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/spa/appointments"] });
      toast({ title: "Turno creado correctamente" });
      setIsNewDialogOpen(false);
      form.reset({
        cabinId: "",
        treatmentId: "",
        guestName: "",
        guestLastName: "",
        guestPhone: "",
        guestEmail: "",
        appointmentDate: dateStr,
        startTime: "",
        reservationId: "",
        notes: "",
      });
    },
    onError: () => {
      toast({ title: "Error al crear el turno", variant: "destructive" });
    },
  });

  const updateAppointmentMutation = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) => {
      return apiRequest("PATCH", `/api/spa/appointments/${id}`, { status });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/spa/appointments"] });
      toast({ title: "Turno actualizado" });
    },
    onError: () => {
      toast({ title: "Error al actualizar el turno", variant: "destructive" });
    },
  });

  const closeAccountMutation = useMutation({
    mutationFn: async ({ accountId, chargedTo }: { accountId: string; chargedTo: string }) => {
      return apiRequest("POST", `/api/spa/accounts/${accountId}/close`, { chargedTo });
    },
    onSuccess: async () => {
      if (selectedAppointment) {
        await updateAppointmentMutation.mutateAsync({ id: selectedAppointment.id, status: "completed" });
      }
      queryClient.invalidateQueries({ queryKey: ["/api/spa/accounts"] });
      queryClient.invalidateQueries({ queryKey: ["/api/spa/appointments"] });
      toast({ title: "Cuenta cerrada correctamente" });
      setIsCloseDialogOpen(false);
      setSelectedAppointment(null);
      setSelectedReservationForCharge("");
    },
    onError: () => {
      toast({ title: "Error al cerrar la cuenta", variant: "destructive" });
    },
  });

  const handlePreviousDay = () => {
    setSelectedDate(addDays(selectedDate, -1));
  };

  const handleNextDay = () => {
    setSelectedDate(addDays(selectedDate, 1));
  };

  const handleToday = () => {
    setSelectedDate(startOfDay(new Date()));
  };

  const handleCellClick = (cabinId: string, time: string) => {
    form.reset({
      cabinId,
      treatmentId: "",
      guestName: "",
      guestLastName: "",
      guestPhone: "",
      guestEmail: "",
      appointmentDate: dateStr,
      startTime: time,
      reservationId: "",
      notes: "",
    });
    setIsNewDialogOpen(true);
  };

  const getAppointmentForSlot = (cabinId: string, slotTime: string): SpaAppointment | null => {
    const slotMinutes = timeToMinutes(slotTime);
    
    for (const apt of appointments) {
      if (apt.cabinId !== cabinId) continue;
      const aptDate = parseISO(apt.appointmentDate);
      if (!isSameDay(aptDate, selectedDate)) continue;
      
      const startMinutes = timeToMinutes(apt.startTime);
      const endMinutes = timeToMinutes(apt.endTime);
      
      if (slotMinutes >= startMinutes && slotMinutes < endMinutes) {
        return apt;
      }
    }
    return null;
  };

  const isSlotStart = (cabinId: string, slotTime: string): boolean => {
    return appointments.some(apt => 
      apt.cabinId === cabinId && 
      apt.startTime === slotTime &&
      isSameDay(parseISO(apt.appointmentDate), selectedDate)
    );
  };

  const getAppointmentColSpan = (appointment: SpaAppointment): number => {
    const startMinutes = timeToMinutes(appointment.startTime);
    const endMinutes = timeToMinutes(appointment.endTime);
    return Math.ceil((endMinutes - startMinutes) / 30);
  };

  const onSubmit = (data: AppointmentFormValues) => {
    createAppointmentMutation.mutate(data);
  };

  const handleCompleteAppointment = () => {
    if (selectedAccount && selectedAccount.status === "open") {
      setIsCloseDialogOpen(true);
    } else {
      if (selectedAppointment) {
        updateAppointmentMutation.mutate({ id: selectedAppointment.id, status: "completed" });
        setSelectedAppointment(null);
      }
    }
  };

  const handleCloseAccount = (chargedTo: string) => {
    if (selectedAccount) {
      closeAccountMutation.mutate({ accountId: selectedAccount.id, chargedTo });
    }
  };

  if (cabinsLoading || appointmentsLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full p-4 gap-4">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-md bg-primary/10">
            <Sparkles className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h1 className="text-2xl font-bold" data-testid="text-page-title">SPA</h1>
            <p className="text-sm text-muted-foreground">
              Gestion de turnos y tratamientos
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="icon" onClick={handlePreviousDay} data-testid="button-prev-day">
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Button variant="outline" onClick={handleToday} data-testid="button-today">
            Hoy
          </Button>
          <Button variant="outline" size="icon" onClick={handleNextDay} data-testid="button-next-day">
            <ChevronRight className="h-4 w-4" />
          </Button>
          <span className="text-sm font-medium ml-2">
            {format(selectedDate, "EEEE d 'de' MMMM yyyy", { locale: es })}
          </span>
        </div>
        <Button onClick={() => {
          form.reset({
            cabinId: "",
            treatmentId: "",
            guestName: "",
            guestLastName: "",
            guestPhone: "",
            guestEmail: "",
            appointmentDate: dateStr,
            startTime: "",
            reservationId: "",
            notes: "",
          });
          setIsNewDialogOpen(true);
        }} data-testid="button-new-appointment">
          <Plus className="h-4 w-4 mr-2" />
          Nuevo Turno
        </Button>
      </div>

      <Card className="flex-1 flex flex-col overflow-hidden">
        <CardHeader className="py-3 px-4">
          <CardTitle className="text-base">Planning del Dia - Gabinetes</CardTitle>
        </CardHeader>
        <CardContent className="flex-1 p-0 overflow-hidden">
          <ScrollArea className="h-full">
            <div className="min-w-[1800px]">
              <table className="w-full border-collapse table-fixed">
                <thead className="sticky top-0 z-10 bg-background">
                  <tr>
                    <th className="border-b border-r p-2 text-left text-xs font-medium text-muted-foreground w-40 sticky left-0 bg-background z-20">
                      Gabinete
                    </th>
                    {TIME_SLOTS.map((time) => (
                      <th
                        key={time}
                        className="border-b border-r p-1 text-center text-[10px] font-medium text-muted-foreground"
                        style={{ width: "50px", minWidth: "50px" }}
                      >
                        {time}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {activeCabins.map((cabin) => {
                    const skipSlots = new Set<number>();
                    
                    return (
                      <tr key={cabin.id} className="h-14">
                        <td className="border-b border-r p-2 text-sm font-medium sticky left-0 bg-background z-10">
                          <div className="truncate" title={cabin.name}>
                            {cabin.name}
                          </div>
                          <div className="text-[10px] text-muted-foreground truncate">
                            {cabin.description}
                          </div>
                        </td>
                        {TIME_SLOTS.map((time, slotIdx) => {
                          if (skipSlots.has(slotIdx)) {
                            return null;
                          }

                          const appointment = getAppointmentForSlot(cabin.id, time);
                          const isStart = isSlotStart(cabin.id, time);
                          
                          if (appointment && isStart) {
                            const colSpan = getAppointmentColSpan(appointment);
                            for (let i = 1; i < colSpan; i++) {
                              skipSlots.add(slotIdx + i);
                            }
                            
                            return (
                              <td
                                key={slotIdx}
                                colSpan={colSpan}
                                className="border-b border-r p-0.5 h-14"
                              >
                                <div
                                  className={`h-full rounded px-2 py-1 cursor-pointer flex flex-col justify-center ${appointmentStatusColors[appointment.status]}`}
                                  onClick={() => setSelectedAppointment(appointment)}
                                  title={`${appointment.guestName} ${appointment.guestLastName || ""} - ${treatments.find(t => t.id === appointment.treatmentId)?.name || ""}`}
                                  data-testid={`appointment-${appointment.id}`}
                                >
                                  <div className="text-xs font-medium truncate">
                                    {appointment.guestName} {appointment.guestLastName || ""}
                                  </div>
                                  <div className="text-[10px] truncate opacity-75">
                                    {treatments.find(t => t.id === appointment.treatmentId)?.name}
                                  </div>
                                  <div className="text-[10px] opacity-60">
                                    {appointment.startTime} - {appointment.endTime}
                                  </div>
                                </div>
                              </td>
                            );
                          }

                          if (appointment && !isStart) {
                            return null;
                          }

                          return (
                            <td
                              key={slotIdx}
                              className="border-b border-r p-0.5 h-14 cursor-pointer hover-elevate"
                              onClick={() => handleCellClick(cabin.id, time)}
                              data-testid={`cell-${cabin.id}-${time}`}
                            />
                          );
                        })}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <ScrollBar orientation="horizontal" />
          </ScrollArea>
        </CardContent>
      </Card>

      <Dialog open={isNewDialogOpen} onOpenChange={setIsNewDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Nuevo Turno SPA</DialogTitle>
          </DialogHeader>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
              <FormField
                control={form.control}
                name="appointmentDate"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Fecha</FormLabel>
                    <FormControl>
                      <Input type="date" {...field} data-testid="input-appointment-date" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <div className="grid grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="cabinId"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Gabinete</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value}>
                        <FormControl>
                          <SelectTrigger data-testid="select-cabin">
                            <SelectValue placeholder="Seleccionar" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {activeCabins.map((cabin) => (
                            <SelectItem key={cabin.id} value={cabin.id}>
                              {cabin.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="startTime"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Hora</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value}>
                        <FormControl>
                          <SelectTrigger data-testid="select-start-time">
                            <SelectValue placeholder="Seleccionar" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {TIME_SLOTS.slice(0, -1).map((time) => (
                            <SelectItem key={time} value={time}>
                              {time}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <FormField
                control={form.control}
                name="treatmentId"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Tratamiento</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger data-testid="select-treatment">
                          <SelectValue placeholder="Seleccionar tratamiento" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {treatments.filter(t => t.isActive === "true").map((treatment) => (
                          <SelectItem key={treatment.id} value={treatment.id}>
                            {treatment.name} - ${parseFloat(treatment.price).toLocaleString()} ({treatment.durationMinutes}min)
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="reservationId"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Huesped del Hotel (opcional)</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger data-testid="select-reservation">
                          <SelectValue placeholder="Seleccionar huesped" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="">Sin asociar</SelectItem>
                        {checkedInReservations.map((res) => (
                          <SelectItem key={res.id} value={res.id}>
                            Hab. {res.room?.roomNumber} - {res.guest?.firstName} {res.guest?.lastName}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <div className="grid grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="guestName"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Nombre</FormLabel>
                      <FormControl>
                        <Input {...field} data-testid="input-guest-name" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="guestLastName"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Apellido</FormLabel>
                      <FormControl>
                        <Input {...field} data-testid="input-guest-lastname" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="guestPhone"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Telefono</FormLabel>
                      <FormControl>
                        <Input {...field} data-testid="input-guest-phone" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="guestEmail"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Email</FormLabel>
                      <FormControl>
                        <Input type="email" {...field} data-testid="input-guest-email" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <FormField
                control={form.control}
                name="notes"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Notas</FormLabel>
                    <FormControl>
                      <Textarea {...field} data-testid="input-notes" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <DialogFooter>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setIsNewDialogOpen(false)}
                >
                  Cancelar
                </Button>
                <Button type="submit" disabled={createAppointmentMutation.isPending} data-testid="button-submit-appointment">
                  {createAppointmentMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                  Crear Turno
                </Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>

      <Dialog open={!!selectedAppointment} onOpenChange={() => setSelectedAppointment(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Detalle del Turno</DialogTitle>
          </DialogHeader>
          {selectedAppointment && (
            <div className="space-y-4">
              <div className="flex items-center gap-2">
                <Badge className={appointmentStatusColors[selectedAppointment.status]}>
                  {appointmentStatusLabels[selectedAppointment.status]}
                </Badge>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <div className="flex items-center gap-2 text-sm">
                    <Calendar className="h-4 w-4 text-muted-foreground" />
                    <span>{format(parseISO(selectedAppointment.appointmentDate), "EEEE d 'de' MMMM", { locale: es })}</span>
                  </div>
                  <div className="flex items-center gap-2 text-sm">
                    <Clock className="h-4 w-4 text-muted-foreground" />
                    <span>{selectedAppointment.startTime} - {selectedAppointment.endTime}</span>
                  </div>
                  <div className="flex items-center gap-2 text-sm">
                    <User className="h-4 w-4 text-muted-foreground" />
                    <span>{selectedAppointment.guestName} {selectedAppointment.guestLastName || ""}</span>
                  </div>
                  {selectedAppointment.guestPhone && (
                    <div className="flex items-center gap-2 text-sm">
                      <Phone className="h-4 w-4 text-muted-foreground" />
                      <span>{selectedAppointment.guestPhone}</span>
                    </div>
                  )}
                </div>
                <div className="space-y-2">
                  <h4 className="text-sm font-medium">Tratamiento</h4>
                  <p className="text-sm text-muted-foreground">
                    {treatments.find(t => t.id === selectedAppointment.treatmentId)?.name || "N/A"}
                  </p>
                  <h4 className="text-sm font-medium">Gabinete</h4>
                  <p className="text-sm text-muted-foreground">
                    {cabins.find(c => c.id === selectedAppointment.cabinId)?.name || "N/A"}
                  </p>
                </div>
              </div>

              {selectedAccount && selectedAccount.items.length > 0 && (
                <div className="border-t pt-4">
                  <h4 className="text-sm font-medium mb-2 flex items-center gap-2">
                    <Receipt className="h-4 w-4" />
                    Cuenta
                  </h4>
                  <div className="space-y-1 text-sm">
                    {selectedAccount.items.map((item) => (
                      <div key={item.id} className="flex justify-between">
                        <span>{item.description} x{item.quantity}</span>
                        <span>${parseFloat(item.subtotal).toLocaleString()}</span>
                      </div>
                    ))}
                    <div className="flex justify-between font-bold pt-2 border-t">
                      <span>Total</span>
                      <span>${parseFloat(selectedAccount.total).toLocaleString()}</span>
                    </div>
                  </div>
                  {selectedAccount.status === "closed" && (
                    <Badge className="mt-2" variant="secondary">
                      Cuenta cerrada - {selectedAccount.chargedTo?.startsWith("room:") ? "Cargo a habitacion" : "Facturado"}
                    </Badge>
                  )}
                </div>
              )}

              {selectedAppointment.notes && (
                <div className="border-t pt-4">
                  <h4 className="text-sm font-medium mb-2">Notas</h4>
                  <p className="text-sm text-muted-foreground">{selectedAppointment.notes}</p>
                </div>
              )}

              <DialogFooter className="flex-wrap gap-2">
                {selectedAppointment.status === "confirmed" && (
                  <Button
                    variant="default"
                    onClick={() => {
                      updateAppointmentMutation.mutate({ id: selectedAppointment.id, status: "in_progress" });
                    }}
                    disabled={updateAppointmentMutation.isPending}
                    data-testid="button-start-appointment"
                  >
                    Iniciar
                  </Button>
                )}
                {selectedAppointment.status === "in_progress" && (
                  <Button
                    variant="default"
                    onClick={handleCompleteAppointment}
                    disabled={updateAppointmentMutation.isPending || closeAccountMutation.isPending}
                    data-testid="button-complete-appointment"
                  >
                    <CreditCard className="h-4 w-4 mr-2" />
                    Completar y Cerrar
                  </Button>
                )}
                {selectedAppointment.status === "pending" && (
                  <Button
                    variant="default"
                    onClick={() => updateAppointmentMutation.mutate({ id: selectedAppointment.id, status: "confirmed" })}
                    disabled={updateAppointmentMutation.isPending}
                    data-testid="button-confirm-appointment"
                  >
                    Confirmar
                  </Button>
                )}
                {["pending", "confirmed"].includes(selectedAppointment.status) && (
                  <>
                    <Button
                      variant="outline"
                      onClick={() => {
                        updateAppointmentMutation.mutate({ id: selectedAppointment.id, status: "no_show" });
                        setSelectedAppointment(null);
                      }}
                      disabled={updateAppointmentMutation.isPending}
                      data-testid="button-noshow-appointment"
                    >
                      No Show
                    </Button>
                    <Button
                      variant="destructive"
                      onClick={() => {
                        updateAppointmentMutation.mutate({ id: selectedAppointment.id, status: "cancelled" });
                        setSelectedAppointment(null);
                      }}
                      disabled={updateAppointmentMutation.isPending}
                      data-testid="button-cancel-appointment"
                    >
                      Cancelar
                    </Button>
                  </>
                )}
              </DialogFooter>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={isCloseDialogOpen} onOpenChange={setIsCloseDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Cerrar Cuenta SPA</DialogTitle>
          </DialogHeader>
          {selectedAccount && (
            <div className="space-y-4">
              <div className="space-y-2">
                <h4 className="font-medium">Resumen</h4>
                {selectedAccount.items.map((item) => (
                  <div key={item.id} className="flex justify-between text-sm py-1 border-b">
                    <span>{item.description} x{item.quantity}</span>
                    <span>${parseFloat(item.subtotal).toLocaleString()}</span>
                  </div>
                ))}
                <div className="flex justify-between text-lg font-bold pt-2">
                  <span>Total</span>
                  <span>${parseFloat(selectedAccount.total).toLocaleString()}</span>
                </div>
              </div>

              <div className="space-y-3 pt-4 border-t">
                <h4 className="font-medium">Forma de Pago</h4>
                
                {checkedInReservations.length > 0 && (
                  <div className="space-y-2">
                    <p className="text-sm text-muted-foreground">Cargar a habitacion:</p>
                    <Select 
                      value={selectedReservationForCharge} 
                      onValueChange={setSelectedReservationForCharge}
                    >
                      <SelectTrigger data-testid="select-room-charge">
                        <SelectValue placeholder="Seleccionar habitacion" />
                      </SelectTrigger>
                      <SelectContent>
                        {checkedInReservations.map((res) => (
                          <SelectItem key={res.id} value={res.id}>
                            Hab. {res.room?.roomNumber} - {res.guest?.firstName} {res.guest?.lastName}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {selectedReservationForCharge && (
                      <Button 
                        className="w-full" 
                        onClick={() => handleCloseAccount(`room:${selectedReservationForCharge}`)}
                        disabled={closeAccountMutation.isPending}
                        data-testid="button-charge-room"
                      >
                        {closeAccountMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                        <Home className="h-4 w-4 mr-2" />
                        Cargar a Habitacion
                      </Button>
                    )}
                  </div>
                )}

                <div className="pt-2">
                  <Button 
                    variant="outline" 
                    className="w-full"
                    onClick={() => handleCloseAccount("invoice")}
                    disabled={closeAccountMutation.isPending}
                    data-testid="button-invoice"
                  >
                    {closeAccountMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                    <Receipt className="h-4 w-4 mr-2" />
                    Facturar Directamente
                  </Button>
                </div>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
