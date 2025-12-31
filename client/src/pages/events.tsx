import { useState, useMemo } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { format, addDays, startOfDay, parseISO, isSameDay, addWeeks, subWeeks } from "date-fns";
import { es } from "date-fns/locale";
import { 
  Plus, 
  ChevronLeft, 
  ChevronRight,
  Calendar,
  User,
  Phone,
  Mail,
  Loader2,
  Building2,
  Users,
  Clock,
  CreditCard,
  Trash2,
  Edit,
} from "lucide-react";

type EventRoom = {
  id: string;
  name: string;
  capacity: number;
  description: string | null;
  isActive: boolean;
};

type EventChargeType = {
  id: string;
  name: string;
  category: string;
  defaultPrice: string;
  description: string | null;
  isActive: boolean;
};

type EventCharge = {
  id: string;
  eventId: string;
  chargeTypeId: string | null;
  description: string;
  quantity: number;
  unitPrice: string;
  totalAmount: string;
  date: string;
  notes: string | null;
  createdAt: string;
};

type HotelEvent = {
  id: string;
  eventCode: string;
  name: string;
  eventRoomId: string;
  eventType: "corporate" | "social" | "wedding" | "conference" | "meeting" | "other";
  contactName: string;
  contactPhone: string | null;
  contactEmail: string | null;
  companyId: string | null;
  startDate: string;
  endDate: string;
  startTime: string | null;
  endTime: string | null;
  attendees: number;
  status: "tentative" | "confirmed" | "in_progress" | "completed" | "cancelled";
  notes: string | null;
  createdAt: string;
  eventRoom?: EventRoom;
  charges?: EventCharge[];
};

type Company = {
  id: string;
  name: string;
};

const eventStatusColors: Record<string, string> = {
  tentative: "bg-yellow-500/20 text-yellow-700 dark:text-yellow-400 border-yellow-500/30",
  confirmed: "bg-blue-500/20 text-blue-700 dark:text-blue-400 border-blue-500/30",
  in_progress: "bg-green-500/20 text-green-700 dark:text-green-400 border-green-500/30",
  completed: "bg-gray-500/20 text-gray-700 dark:text-gray-400 border-gray-500/30",
  cancelled: "bg-red-500/20 text-red-700 dark:text-red-400 border-red-500/30",
};

const eventStatusLabels: Record<string, string> = {
  tentative: "Tentativo",
  confirmed: "Confirmado",
  in_progress: "En Curso",
  completed: "Completado",
  cancelled: "Cancelado",
};

const eventTypeLabels: Record<string, string> = {
  corporate: "Corporativo",
  social: "Social",
  wedding: "Boda",
  conference: "Conferencia",
  meeting: "Reunion",
  other: "Otro",
};

const eventFormSchema = z.object({
  eventRoomId: z.string().min(1, "Seleccione un salon"),
  name: z.string().min(1, "El nombre del evento es requerido"),
  eventType: z.enum(["corporate", "social", "wedding", "conference", "meeting", "other"]),
  contactName: z.string().min(1, "El nombre de contacto es requerido"),
  contactPhone: z.string().optional(),
  contactEmail: z.string().email("Email invalido").optional().or(z.literal("")),
  startDate: z.string().min(1, "La fecha de inicio es requerida"),
  endDate: z.string().min(1, "La fecha de fin es requerida"),
  startTime: z.string().optional(),
  endTime: z.string().optional(),
  attendees: z.number().min(1, "Debe tener al menos 1 asistente"),
  notes: z.string().optional(),
});

type EventFormValues = z.infer<typeof eventFormSchema>;

const chargeFormSchema = z.object({
  chargeTypeId: z.string().optional(),
  description: z.string().min(1, "La descripcion es requerida"),
  quantity: z.number().min(1, "La cantidad debe ser al menos 1"),
  unitPrice: z.string().min(1, "El precio es requerido"),
  notes: z.string().optional(),
});

type ChargeFormValues = z.infer<typeof chargeFormSchema>;

type PlanningEvent = {
  id: string;
  name: string;
  contactName: string;
  startDate: string;
  endDate: string;
  status: "tentative" | "confirmed" | "in_progress" | "completed" | "cancelled";
  eventType: "corporate" | "social" | "wedding" | "conference" | "meeting" | "other";
};

type EventPlanningResponse = {
  rooms: EventRoom[];
  days: string[];
  events: Record<string, PlanningEvent>;
  cellEvents: Record<string, Record<string, string>>;
};

export default function EventsPage() {
  const [weekStart, setWeekStart] = useState(startOfDay(new Date()));
  const [selectedEvent, setSelectedEvent] = useState<HotelEvent | null>(null);
  const [isNewDialogOpen, setIsNewDialogOpen] = useState(false);
  const [isChargeDialogOpen, setIsChargeDialogOpen] = useState(false);
  const [prefilledRoomId, setPrefilledRoomId] = useState<string>("");
  const [prefilledDate, setPrefilledDate] = useState<string>("");
  const { toast } = useToast();

  const weekDays = useMemo(() => {
    return Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
  }, [weekStart]);

  const startDateStr = format(weekStart, "yyyy-MM-dd");
  const endDateStr = format(addDays(weekStart, 6), "yyyy-MM-dd");

  const { data: eventRooms = [], isLoading: roomsLoading } = useQuery<EventRoom[]>({
    queryKey: ["/api/events/rooms"],
  });

  const { data: chargeTypes = [] } = useQuery<EventChargeType[]>({
    queryKey: ["/api/events/charge-types"],
  });

  const { data: planningData, isLoading: planningLoading } = useQuery<EventPlanningResponse>({
    queryKey: ["/api/events/planning", startDateStr, endDateStr],
    queryFn: () => 
      fetch(`/api/events/planning?start=${startDateStr}&end=${endDateStr}`)
        .then(res => res.json()),
  });

  const eventsMap = planningData?.events || {};
  const cellEventsMap = planningData?.cellEvents || {};

  const eventForm = useForm<EventFormValues>({
    resolver: zodResolver(eventFormSchema),
    defaultValues: {
      eventRoomId: "",
      name: "",
      eventType: "corporate",
      contactName: "",
      contactPhone: "",
      contactEmail: "",
      startDate: "",
      endDate: "",
      startTime: "",
      endTime: "",
      attendees: 10,
      notes: "",
    },
  });

  const chargeForm = useForm<ChargeFormValues>({
    resolver: zodResolver(chargeFormSchema),
    defaultValues: {
      chargeTypeId: "",
      description: "",
      quantity: 1,
      unitPrice: "",
      notes: "",
    },
  });

  const createEventMutation = useMutation({
    mutationFn: (data: EventFormValues) => apiRequest("POST", "/api/events", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/events/planning"] });
      queryClient.invalidateQueries({ queryKey: ["/api/events"] });
      setIsNewDialogOpen(false);
      eventForm.reset();
      toast({ title: "Evento creado exitosamente" });
    },
    onError: () => {
      toast({ title: "Error al crear el evento", variant: "destructive" });
    },
  });

  const updateEventMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<EventFormValues & { status: string }> }) =>
      apiRequest("PATCH", `/api/events/${id}`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/events/planning"] });
      queryClient.invalidateQueries({ queryKey: ["/api/events"] });
      toast({ title: "Evento actualizado" });
    },
    onError: () => {
      toast({ title: "Error al actualizar el evento", variant: "destructive" });
    },
  });

  const createChargeMutation = useMutation({
    mutationFn: ({ eventId, data }: { eventId: string; data: ChargeFormValues }) =>
      apiRequest("POST", `/api/events/${eventId}/charges`, data),
    onSuccess: async () => {
      queryClient.invalidateQueries({ queryKey: ["/api/events/planning"] });
      if (selectedEvent) {
        const response = await fetch(`/api/events/${selectedEvent.id}`);
        if (response.ok) {
          const updatedEvent = await response.json();
          setSelectedEvent(updatedEvent);
        }
      }
      setIsChargeDialogOpen(false);
      chargeForm.reset();
      toast({ title: "Cargo agregado" });
    },
    onError: () => {
      toast({ title: "Error al agregar el cargo", variant: "destructive" });
    },
  });

  const deleteChargeMutation = useMutation({
    mutationFn: (chargeId: string) => apiRequest("DELETE", `/api/events/charges/${chargeId}`),
    onSuccess: async () => {
      queryClient.invalidateQueries({ queryKey: ["/api/events/planning"] });
      if (selectedEvent) {
        const response = await fetch(`/api/events/${selectedEvent.id}`);
        if (response.ok) {
          const updatedEvent = await response.json();
          setSelectedEvent(updatedEvent);
        }
      }
      toast({ title: "Cargo eliminado" });
    },
    onError: () => {
      toast({ title: "Error al eliminar el cargo", variant: "destructive" });
    },
  });

  const handleCellClick = (roomId: string, date: Date) => {
    const dateStr = format(date, "yyyy-MM-dd");
    setPrefilledRoomId(roomId);
    setPrefilledDate(dateStr);
    eventForm.reset({
      eventRoomId: roomId,
      name: "",
      eventType: "corporate",
      contactName: "",
      contactPhone: "",
      contactEmail: "",
      startDate: dateStr,
      endDate: dateStr,
      startTime: "",
      endTime: "",
      attendees: 10,
      notes: "",
    });
    setIsNewDialogOpen(true);
  };

  const handleEventClick = async (eventId: string) => {
    try {
      const response = await fetch(`/api/events/${eventId}`);
      if (response.ok) {
        const fullEvent = await response.json();
        setSelectedEvent(fullEvent);
      }
    } catch (error) {
      toast({ title: "Error al cargar el evento", variant: "destructive" });
    }
  };

  const onSubmitEvent = (data: EventFormValues) => {
    createEventMutation.mutate(data);
  };

  const onSubmitCharge = (data: ChargeFormValues) => {
    if (!selectedEvent) return;
    createChargeMutation.mutate({ eventId: selectedEvent.id, data });
  };

  const handleChargeTypeSelect = (chargeTypeId: string) => {
    const chargeType = chargeTypes.find(ct => ct.id === chargeTypeId);
    if (chargeType) {
      chargeForm.setValue("description", chargeType.name);
      chargeForm.setValue("unitPrice", chargeType.defaultPrice);
    }
  };

  const getEventsForCell = (roomId: string, date: Date): PlanningEvent[] => {
    const dateStr = format(date, "yyyy-MM-dd");
    const eventId = cellEventsMap[roomId]?.[dateStr];
    if (eventId && eventsMap[eventId]) {
      return [eventsMap[eventId]];
    }
    return [];
  };

  const calculateEventTotal = (event: HotelEvent): number => {
    if (!event.charges) return 0;
    return event.charges.reduce((sum, charge) => sum + parseFloat(charge.totalAmount), 0);
  };

  if (roomsLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full p-4 gap-4">
      <Card>
        <CardHeader className="pb-4">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <CardTitle className="flex items-center gap-2">
              <Calendar className="h-5 w-5" />
              Eventos - Planificacion Semanal
            </CardTitle>
            <div className="flex flex-wrap items-center gap-2">
              <div className="flex items-center gap-1">
                <Button
                  variant="outline"
                  size="icon"
                  onClick={() => setWeekStart(subWeeks(weekStart, 1))}
                  data-testid="button-prev-week"
                >
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <span className="text-sm font-medium min-w-[180px] text-center">
                  {format(weekStart, "d MMM", { locale: es })} - {format(addDays(weekStart, 6), "d MMM yyyy", { locale: es })}
                </span>
                <Button
                  variant="outline"
                  size="icon"
                  onClick={() => setWeekStart(addWeeks(weekStart, 1))}
                  data-testid="button-next-week"
                >
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
              <Button onClick={() => setWeekStart(startOfDay(new Date()))} variant="outline" data-testid="button-today">
                Hoy
              </Button>
              <Button
                onClick={() => {
                  eventForm.reset();
                  setPrefilledRoomId("");
                  setPrefilledDate("");
                  setIsNewDialogOpen(true);
                }}
                data-testid="button-new-event"
              >
                <Plus className="h-4 w-4 mr-2" />
                Nuevo Evento
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <ScrollArea className="w-full">
            <div className="min-w-[900px]">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[150px] sticky left-0 bg-background z-10">Salon</TableHead>
                    {weekDays.map((day) => (
                      <TableHead key={day.toISOString()} className="text-center min-w-[120px]">
                        <div className="flex flex-col">
                          <span className="text-xs text-muted-foreground">
                            {format(day, "EEE", { locale: es })}
                          </span>
                          <span className={isSameDay(day, new Date()) ? "font-bold text-primary" : ""}>
                            {format(day, "d")}
                          </span>
                        </div>
                      </TableHead>
                    ))}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {eventRooms.filter(r => r.isActive).map((room) => (
                    <TableRow key={room.id}>
                      <TableCell className="font-medium sticky left-0 bg-background z-10">
                        <div className="flex flex-col">
                          <span>{room.name}</span>
                          <span className="text-xs text-muted-foreground">
                            Cap: {room.capacity}
                          </span>
                        </div>
                      </TableCell>
                      {weekDays.map((day) => {
                        const cellEvents = getEventsForCell(room.id, day);
                        return (
                          <TableCell
                            key={day.toISOString()}
                            className="p-1 align-top cursor-pointer hover-elevate min-h-[80px]"
                            onClick={() => cellEvents.length === 0 && handleCellClick(room.id, day)}
                            data-testid={`cell-${room.id}-${format(day, "yyyy-MM-dd")}`}
                          >
                            <div className="flex flex-col gap-1">
                              {cellEvents.map((event) => (
                                <div
                                  key={event.id}
                                  className={`p-1.5 rounded-md text-xs cursor-pointer ${eventStatusColors[event.status]}`}
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleEventClick(event.id);
                                  }}
                                  data-testid={`event-${event.id}`}
                                >
                                  <div className="font-medium truncate">{event.name}</div>
                                  <div className="text-xs opacity-80 truncate">{event.contactName}</div>
                                </div>
                              ))}
                              {cellEvents.length === 0 && (
                                <div className="h-16 flex items-center justify-center">
                                  <Plus className="h-4 w-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
                                </div>
                              )}
                            </div>
                          </TableCell>
                        );
                      })}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
            <ScrollBar orientation="horizontal" />
          </ScrollArea>
        </CardContent>
      </Card>

      <Dialog open={isNewDialogOpen} onOpenChange={setIsNewDialogOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Nuevo Evento</DialogTitle>
            <DialogDescription>
              Complete los datos del evento
            </DialogDescription>
          </DialogHeader>
          <Form {...eventForm}>
            <form onSubmit={eventForm.handleSubmit(onSubmitEvent)} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <FormField
                  control={eventForm.control}
                  name="name"
                  render={({ field }) => (
                    <FormItem className="col-span-2">
                      <FormLabel>Nombre del Evento</FormLabel>
                      <FormControl>
                        <Input placeholder="Nombre del evento" {...field} data-testid="input-event-name" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={eventForm.control}
                  name="eventRoomId"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Salon</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value}>
                        <FormControl>
                          <SelectTrigger data-testid="select-event-room">
                            <SelectValue placeholder="Seleccionar salon" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {eventRooms.filter(r => r.isActive).map((room) => (
                            <SelectItem key={room.id} value={room.id}>
                              {room.name} (Cap: {room.capacity})
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={eventForm.control}
                  name="eventType"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Tipo de Evento</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value}>
                        <FormControl>
                          <SelectTrigger data-testid="select-event-type">
                            <SelectValue placeholder="Seleccionar tipo" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="corporate">Corporativo</SelectItem>
                          <SelectItem value="social">Social</SelectItem>
                          <SelectItem value="wedding">Boda</SelectItem>
                          <SelectItem value="conference">Conferencia</SelectItem>
                          <SelectItem value="meeting">Reunion</SelectItem>
                          <SelectItem value="other">Otro</SelectItem>
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={eventForm.control}
                  name="contactName"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Persona de Contacto</FormLabel>
                      <FormControl>
                        <Input placeholder="Nombre de contacto" {...field} data-testid="input-contact-name" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={eventForm.control}
                  name="contactPhone"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Telefono</FormLabel>
                      <FormControl>
                        <Input placeholder="Telefono" {...field} data-testid="input-contact-phone" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={eventForm.control}
                  name="contactEmail"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Email</FormLabel>
                      <FormControl>
                        <Input type="email" placeholder="Email" {...field} data-testid="input-contact-email" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={eventForm.control}
                  name="attendees"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Asistentes</FormLabel>
                      <FormControl>
                        <Input
                          type="number"
                          min={1}
                          {...field}
                          onChange={(e) => field.onChange(parseInt(e.target.value) || 1)}
                          data-testid="input-attendees"
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={eventForm.control}
                  name="startDate"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Fecha Inicio</FormLabel>
                      <FormControl>
                        <Input type="date" {...field} data-testid="input-start-date" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={eventForm.control}
                  name="endDate"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Fecha Fin</FormLabel>
                      <FormControl>
                        <Input type="date" {...field} data-testid="input-end-date" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={eventForm.control}
                  name="startTime"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Hora Inicio</FormLabel>
                      <FormControl>
                        <Input type="time" {...field} data-testid="input-start-time" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={eventForm.control}
                  name="endTime"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Hora Fin</FormLabel>
                      <FormControl>
                        <Input type="time" {...field} data-testid="input-end-time" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={eventForm.control}
                  name="notes"
                  render={({ field }) => (
                    <FormItem className="col-span-2">
                      <FormLabel>Notas</FormLabel>
                      <FormControl>
                        <Textarea placeholder="Notas adicionales" {...field} data-testid="input-notes" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setIsNewDialogOpen(false)}>
                  Cancelar
                </Button>
                <Button type="submit" disabled={createEventMutation.isPending} data-testid="button-submit-event">
                  {createEventMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                  Crear Evento
                </Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>

      <Dialog open={!!selectedEvent} onOpenChange={(open) => !open && setSelectedEvent(null)}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <span>{selectedEvent?.name}</span>
              {selectedEvent && (
                <Badge className={eventStatusColors[selectedEvent.status]}>
                  {eventStatusLabels[selectedEvent.status]}
                </Badge>
              )}
            </DialogTitle>
            <DialogDescription>
              Codigo: {selectedEvent?.eventCode}
            </DialogDescription>
          </DialogHeader>

          {selectedEvent && (
            <Tabs defaultValue="details" className="w-full">
              <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="details">Detalles</TabsTrigger>
                <TabsTrigger value="charges">Cargos</TabsTrigger>
              </TabsList>

              <TabsContent value="details" className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <div className="flex items-center gap-2 text-sm">
                      <Building2 className="h-4 w-4 text-muted-foreground" />
                      <span className="font-medium">Salon:</span>
                      <span>{selectedEvent.eventRoom?.name}</span>
                    </div>
                    <div className="flex items-center gap-2 text-sm">
                      <Calendar className="h-4 w-4 text-muted-foreground" />
                      <span className="font-medium">Fecha:</span>
                      <span>
                        {format(parseISO(selectedEvent.startDate), "d MMM yyyy", { locale: es })}
                        {selectedEvent.startDate !== selectedEvent.endDate && (
                          <> - {format(parseISO(selectedEvent.endDate), "d MMM yyyy", { locale: es })}</>
                        )}
                      </span>
                    </div>
                    {selectedEvent.startTime && (
                      <div className="flex items-center gap-2 text-sm">
                        <Clock className="h-4 w-4 text-muted-foreground" />
                        <span className="font-medium">Horario:</span>
                        <span>
                          {selectedEvent.startTime} - {selectedEvent.endTime || "..."}
                        </span>
                      </div>
                    )}
                    <div className="flex items-center gap-2 text-sm">
                      <Users className="h-4 w-4 text-muted-foreground" />
                      <span className="font-medium">Asistentes:</span>
                      <span>{selectedEvent.attendees}</span>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <div className="flex items-center gap-2 text-sm">
                      <User className="h-4 w-4 text-muted-foreground" />
                      <span className="font-medium">Contacto:</span>
                      <span>{selectedEvent.contactName}</span>
                    </div>
                    {selectedEvent.contactPhone && (
                      <div className="flex items-center gap-2 text-sm">
                        <Phone className="h-4 w-4 text-muted-foreground" />
                        <span>{selectedEvent.contactPhone}</span>
                      </div>
                    )}
                    {selectedEvent.contactEmail && (
                      <div className="flex items-center gap-2 text-sm">
                        <Mail className="h-4 w-4 text-muted-foreground" />
                        <span>{selectedEvent.contactEmail}</span>
                      </div>
                    )}
                  </div>
                </div>

                {selectedEvent.notes && (
                  <div className="p-3 rounded-md bg-muted">
                    <p className="text-sm">{selectedEvent.notes}</p>
                  </div>
                )}

                <div className="flex flex-wrap gap-2 pt-4 border-t">
                  {selectedEvent.status === "tentative" && (
                    <Button
                      onClick={() => {
                        updateEventMutation.mutate({ 
                          id: selectedEvent.id, 
                          data: { status: "confirmed" } 
                        });
                        setSelectedEvent({ ...selectedEvent, status: "confirmed" });
                      }}
                      data-testid="button-confirm-event"
                    >
                      Confirmar
                    </Button>
                  )}
                  {selectedEvent.status === "confirmed" && (
                    <Button
                      onClick={() => {
                        updateEventMutation.mutate({ 
                          id: selectedEvent.id, 
                          data: { status: "in_progress" } 
                        });
                        setSelectedEvent({ ...selectedEvent, status: "in_progress" });
                      }}
                      data-testid="button-start-event"
                    >
                      Iniciar
                    </Button>
                  )}
                  {selectedEvent.status === "in_progress" && (
                    <Button
                      onClick={() => {
                        updateEventMutation.mutate({ 
                          id: selectedEvent.id, 
                          data: { status: "completed" } 
                        });
                        setSelectedEvent({ ...selectedEvent, status: "completed" });
                      }}
                      data-testid="button-complete-event"
                    >
                      Completar
                    </Button>
                  )}
                  {(selectedEvent.status === "tentative" || selectedEvent.status === "confirmed") && (
                    <Button
                      variant="destructive"
                      onClick={() => {
                        updateEventMutation.mutate({ 
                          id: selectedEvent.id, 
                          data: { status: "cancelled" } 
                        });
                        setSelectedEvent({ ...selectedEvent, status: "cancelled" });
                      }}
                      data-testid="button-cancel-event"
                    >
                      Cancelar
                    </Button>
                  )}
                </div>
              </TabsContent>

              <TabsContent value="charges" className="space-y-4">
                <div className="flex items-center justify-between">
                  <h4 className="font-medium">Cargos del Evento</h4>
                  <Button
                    size="sm"
                    onClick={() => {
                      chargeForm.reset();
                      setIsChargeDialogOpen(true);
                    }}
                    data-testid="button-add-charge"
                  >
                    <Plus className="h-4 w-4 mr-2" />
                    Agregar Cargo
                  </Button>
                </div>

                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Descripcion</TableHead>
                      <TableHead className="text-right">Cantidad</TableHead>
                      <TableHead className="text-right">Precio Unit.</TableHead>
                      <TableHead className="text-right">Total</TableHead>
                      <TableHead className="w-[50px]"></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {selectedEvent.charges?.map((charge) => (
                      <TableRow key={charge.id}>
                        <TableCell>{charge.description}</TableCell>
                        <TableCell className="text-right">{charge.quantity}</TableCell>
                        <TableCell className="text-right">${charge.unitPrice}</TableCell>
                        <TableCell className="text-right font-medium">${charge.totalAmount}</TableCell>
                        <TableCell>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => deleteChargeMutation.mutate(charge.id)}
                            data-testid={`button-delete-charge-${charge.id}`}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                    {(!selectedEvent.charges || selectedEvent.charges.length === 0) && (
                      <TableRow>
                        <TableCell colSpan={5} className="text-center text-muted-foreground">
                          No hay cargos registrados
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>

                <div className="flex justify-end border-t pt-4">
                  <div className="text-lg font-bold">
                    Total: ${calculateEventTotal(selectedEvent).toFixed(2)}
                  </div>
                </div>
              </TabsContent>
            </Tabs>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={isChargeDialogOpen} onOpenChange={setIsChargeDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Agregar Cargo</DialogTitle>
            <DialogDescription>
              Seleccione un tipo predefinido o ingrese manualmente
            </DialogDescription>
          </DialogHeader>
          <Form {...chargeForm}>
            <form onSubmit={chargeForm.handleSubmit(onSubmitCharge)} className="space-y-4">
              <div className="space-y-4">
                <div>
                  <FormLabel>Tipo Predefinido</FormLabel>
                  <Select
                    onValueChange={(value) => {
                      chargeForm.setValue("chargeTypeId", value);
                      handleChargeTypeSelect(value);
                    }}
                  >
                    <SelectTrigger data-testid="select-charge-type">
                      <SelectValue placeholder="Seleccionar tipo (opcional)" />
                    </SelectTrigger>
                    <SelectContent>
                      {chargeTypes.filter(ct => ct.isActive).map((ct) => (
                        <SelectItem key={ct.id} value={ct.id}>
                          {ct.name} - ${ct.defaultPrice}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <FormField
                  control={chargeForm.control}
                  name="description"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Descripcion</FormLabel>
                      <FormControl>
                        <Input placeholder="Descripcion del cargo" {...field} data-testid="input-charge-description" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <div className="grid grid-cols-2 gap-4">
                  <FormField
                    control={chargeForm.control}
                    name="quantity"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Cantidad</FormLabel>
                        <FormControl>
                          <Input
                            type="number"
                            min={1}
                            {...field}
                            onChange={(e) => field.onChange(parseInt(e.target.value) || 1)}
                            data-testid="input-charge-quantity"
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={chargeForm.control}
                    name="unitPrice"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Precio Unitario</FormLabel>
                        <FormControl>
                          <Input placeholder="0.00" {...field} data-testid="input-charge-price" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                <FormField
                  control={chargeForm.control}
                  name="notes"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Notas</FormLabel>
                      <FormControl>
                        <Textarea placeholder="Notas adicionales" {...field} data-testid="input-charge-notes" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setIsChargeDialogOpen(false)}>
                  Cancelar
                </Button>
                <Button type="submit" disabled={createChargeMutation.isPending} data-testid="button-submit-charge">
                  {createChargeMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                  Agregar
                </Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
