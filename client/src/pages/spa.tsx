import { useState, useMemo } from "react";
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
} from "lucide-react";

type SpaCabin = {
  id: string;
  name: string;
  description: string | null;
  isActive: string | null;
};

type SpaTreatmentCategory = {
  id: string;
  name: string;
  description: string | null;
  sortOrder: number | null;
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

const HOURS = Array.from({ length: 15 }, (_, i) => i + 8);

const appointmentFormSchema = z.object({
  cabinId: z.string().min(1, "Seleccione un gabinete"),
  treatmentId: z.string().min(1, "Seleccione un tratamiento"),
  guestName: z.string().min(1, "El nombre es requerido"),
  guestLastName: z.string().optional(),
  guestPhone: z.string().optional(),
  guestEmail: z.string().email("Email invalido").optional().or(z.literal("")),
  appointmentDate: z.string().min(1, "La fecha es requerida"),
  startTime: z.string().min(1, "La hora de inicio es requerida"),
  notes: z.string().optional(),
});

type AppointmentFormValues = z.infer<typeof appointmentFormSchema>;

export default function SpaPage() {
  const [startDate, setStartDate] = useState(startOfDay(new Date()));
  const [selectedAppointment, setSelectedAppointment] = useState<SpaAppointment | null>(null);
  const [isNewDialogOpen, setIsNewDialogOpen] = useState(false);
  const [preselectedDate, setPreselectedDate] = useState<string | null>(null);
  const [preselectedTime, setPreselectedTime] = useState<string | null>(null);
  const [preselectedCabin, setPreselectedCabin] = useState<string | null>(null);
  const { toast } = useToast();

  const endDate = addDays(startDate, 14);

  const dates = useMemo(() => {
    const result = [];
    for (let i = 0; i < 15; i++) {
      result.push(addDays(startDate, i));
    }
    return result;
  }, [startDate]);

  const { data: cabins = [], isLoading: cabinsLoading } = useQuery<SpaCabin[]>({
    queryKey: ["/api/spa/cabins"],
  });

  const { data: treatments = [] } = useQuery<SpaTreatment[]>({
    queryKey: ["/api/spa/treatments"],
  });

  const { data: appointments = [], isLoading: appointmentsLoading } = useQuery<SpaAppointment[]>({
    queryKey: ["/api/spa/appointments", format(startDate, "yyyy-MM-dd"), format(endDate, "yyyy-MM-dd")],
    queryFn: async () => {
      const response = await fetch(
        `/api/spa/appointments?startDate=${format(startDate, "yyyy-MM-dd")}&endDate=${format(endDate, "yyyy-MM-dd")}`
      );
      if (!response.ok) throw new Error("Error fetching appointments");
      return response.json();
    },
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
      appointmentDate: "",
      startTime: "",
      notes: "",
    },
  });

  const createAppointmentMutation = useMutation({
    mutationFn: async (data: AppointmentFormValues) => {
      const treatment = treatments.find((t) => t.id === data.treatmentId);
      const durationMinutes = treatment?.durationMinutes ?? 60;
      
      const [hours, minutes] = data.startTime.split(":").map(Number);
      const endHours = hours + Math.floor((minutes + durationMinutes) / 60);
      const endMinutes = (minutes + durationMinutes) % 60;
      const endTime = `${endHours.toString().padStart(2, "0")}:${endMinutes.toString().padStart(2, "0")}`;

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
      form.reset();
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
      setSelectedAppointment(null);
    },
    onError: () => {
      toast({ title: "Error al actualizar el turno", variant: "destructive" });
    },
  });

  const handlePreviousWeek = () => {
    setStartDate(addDays(startDate, -7));
  };

  const handleNextWeek = () => {
    setStartDate(addDays(startDate, 7));
  };

  const handleToday = () => {
    setStartDate(startOfDay(new Date()));
  };

  const handleCellClick = (date: Date, hour: number, cabinId: string) => {
    setPreselectedDate(format(date, "yyyy-MM-dd"));
    setPreselectedTime(`${hour.toString().padStart(2, "0")}:00`);
    setPreselectedCabin(cabinId);
    form.reset({
      cabinId,
      treatmentId: "",
      guestName: "",
      guestLastName: "",
      guestPhone: "",
      guestEmail: "",
      appointmentDate: format(date, "yyyy-MM-dd"),
      startTime: `${hour.toString().padStart(2, "0")}:00`,
      notes: "",
    });
    setIsNewDialogOpen(true);
  };

  const getAppointmentsForSlot = (date: Date, hour: number, cabinId: string) => {
    return appointments.filter((apt) => {
      if (apt.cabinId !== cabinId) return false;
      const aptDate = parseISO(apt.appointmentDate);
      if (!isSameDay(aptDate, date)) return false;
      const [aptHour] = apt.startTime.split(":").map(Number);
      return aptHour === hour;
    });
  };

  const getAppointmentSpan = (appointment: SpaAppointment) => {
    const [startHour, startMin] = appointment.startTime.split(":").map(Number);
    const [endHour, endMin] = appointment.endTime.split(":").map(Number);
    const startMinutes = startHour * 60 + startMin;
    const endMinutes = endHour * 60 + endMin;
    return Math.ceil((endMinutes - startMinutes) / 60);
  };

  const onSubmit = (data: AppointmentFormValues) => {
    createAppointmentMutation.mutate(data);
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
          <Button variant="outline" size="icon" onClick={handlePreviousWeek} data-testid="button-prev-week">
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Button variant="outline" onClick={handleToday} data-testid="button-today">
            Hoy
          </Button>
          <Button variant="outline" size="icon" onClick={handleNextWeek} data-testid="button-next-week">
            <ChevronRight className="h-4 w-4" />
          </Button>
          <span className="text-sm text-muted-foreground ml-2">
            {format(startDate, "d MMM", { locale: es })} - {format(endDate, "d MMM yyyy", { locale: es })}
          </span>
        </div>
        <Button onClick={() => {
          form.reset();
          setPreselectedDate(null);
          setPreselectedTime(null);
          setPreselectedCabin(null);
          setIsNewDialogOpen(true);
        }} data-testid="button-new-appointment">
          <Plus className="h-4 w-4 mr-2" />
          Nuevo Turno
        </Button>
      </div>

      <Card className="flex-1 flex flex-col overflow-hidden">
        <CardHeader className="py-3 px-4">
          <CardTitle className="text-base">Planning de Turnos - 15 dias</CardTitle>
        </CardHeader>
        <CardContent className="flex-1 p-0 overflow-hidden">
          <ScrollArea className="h-full">
            <div className="min-w-[2000px]">
              <table className="w-full border-collapse">
                <thead className="sticky top-0 z-10 bg-background">
                  <tr>
                    <th className="border-b border-r p-2 text-left text-xs font-medium text-muted-foreground w-24 sticky left-0 bg-background z-20">
                      Hora
                    </th>
                    {dates.map((date, i) => {
                      const isToday = isSameDay(date, new Date());
                      return (
                        <th
                          key={i}
                          className={`border-b border-r p-2 text-center text-xs font-medium ${
                            isToday ? "bg-primary/10 text-primary" : "text-muted-foreground"
                          }`}
                          style={{ minWidth: `${100 / 15}%` }}
                        >
                          <div>{format(date, "EEE", { locale: es })}</div>
                          <div className="font-bold">{format(date, "d")}</div>
                        </th>
                      );
                    })}
                  </tr>
                </thead>
                <tbody>
                  {HOURS.map((hour) => (
                    activeCabins.map((cabin, cabinIdx) => (
                      <tr key={`${hour}-${cabin.id}`}>
                        <td className="border-b border-r p-1 text-xs text-muted-foreground sticky left-0 bg-background z-10">
                          {cabinIdx === 0 && (
                            <div className="font-medium">{`${hour.toString().padStart(2, "0")}:00`}</div>
                          )}
                          <div className="text-[10px] truncate" title={cabin.name}>
                            {cabin.name.replace("Cabina ", "").substring(0, 15)}
                          </div>
                        </td>
                        {dates.map((date, dateIdx) => {
                          const cellAppointments = getAppointmentsForSlot(date, hour, cabin.id);
                          const isToday = isSameDay(date, new Date());

                          return (
                            <td
                              key={dateIdx}
                              className={`border-b border-r p-0.5 h-10 align-top cursor-pointer hover-elevate ${
                                isToday ? "bg-primary/5" : ""
                              }`}
                              onClick={() => {
                                if (cellAppointments.length === 0) {
                                  handleCellClick(date, hour, cabin.id);
                                }
                              }}
                              data-testid={`cell-${format(date, "yyyy-MM-dd")}-${hour}-${cabin.id}`}
                            >
                              {cellAppointments.map((apt) => (
                                <div
                                  key={apt.id}
                                  className={`rounded px-1 py-0.5 text-[10px] cursor-pointer truncate ${appointmentStatusColors[apt.status]}`}
                                  style={{
                                    height: `${getAppointmentSpan(apt) * 40 - 4}px`,
                                  }}
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setSelectedAppointment(apt);
                                  }}
                                  title={`${apt.guestName} ${apt.guestLastName || ""} - ${treatments.find(t => t.id === apt.treatmentId)?.name || ""}`}
                                  data-testid={`appointment-${apt.id}`}
                                >
                                  <div className="font-medium truncate">{apt.guestName}</div>
                                  <div className="truncate opacity-75">
                                    {treatments.find(t => t.id === apt.treatmentId)?.name}
                                  </div>
                                </div>
                              ))}
                            </td>
                          );
                        })}
                      </tr>
                    ))
                  ))}
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
              <div className="grid grid-cols-2 gap-4">
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
                          {HOURS.map((h) => (
                            <SelectItem key={h} value={`${h.toString().padStart(2, "0")}:00`}>
                              {`${h.toString().padStart(2, "0")}:00`}
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
                name="cabinId"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Gabinete</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger data-testid="select-cabin">
                          <SelectValue placeholder="Seleccionar gabinete" />
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
        <DialogContent className="max-w-md">
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
                {selectedAppointment.guestEmail && (
                  <div className="flex items-center gap-2 text-sm">
                    <Mail className="h-4 w-4 text-muted-foreground" />
                    <span>{selectedAppointment.guestEmail}</span>
                  </div>
                )}
              </div>

              <div className="border-t pt-4">
                <h4 className="text-sm font-medium mb-2">Tratamiento</h4>
                <p className="text-sm text-muted-foreground">
                  {treatments.find(t => t.id === selectedAppointment.treatmentId)?.name || "N/A"}
                </p>
                <p className="text-sm font-medium mt-1">
                  ${parseFloat(treatments.find(t => t.id === selectedAppointment.treatmentId)?.price || "0").toLocaleString()}
                </p>
              </div>

              <div className="border-t pt-4">
                <h4 className="text-sm font-medium mb-2">Gabinete</h4>
                <p className="text-sm text-muted-foreground">
                  {cabins.find(c => c.id === selectedAppointment.cabinId)?.name || "N/A"}
                </p>
              </div>

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
                    onClick={() => updateAppointmentMutation.mutate({ id: selectedAppointment.id, status: "in_progress" })}
                    disabled={updateAppointmentMutation.isPending}
                    data-testid="button-start-appointment"
                  >
                    Iniciar
                  </Button>
                )}
                {selectedAppointment.status === "in_progress" && (
                  <Button
                    variant="default"
                    onClick={() => updateAppointmentMutation.mutate({ id: selectedAppointment.id, status: "completed" })}
                    disabled={updateAppointmentMutation.isPending}
                    data-testid="button-complete-appointment"
                  >
                    Completar
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
                      onClick={() => updateAppointmentMutation.mutate({ id: selectedAppointment.id, status: "no_show" })}
                      disabled={updateAppointmentMutation.isPending}
                      data-testid="button-noshow-appointment"
                    >
                      No Show
                    </Button>
                    <Button
                      variant="destructive"
                      onClick={() => updateAppointmentMutation.mutate({ id: selectedAppointment.id, status: "cancelled" })}
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
    </div>
  );
}
