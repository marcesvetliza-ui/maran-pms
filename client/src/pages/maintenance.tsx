import { useState } from "react";
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
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { format, parseISO } from "date-fns";
import { es } from "date-fns/locale";
import { 
  Plus, 
  Loader2,
  Wrench,
  AlertTriangle,
  Clock,
  CheckCircle,
  User,
  Phone,
  Mail,
  Building2,
  Trash2,
  Edit,
  Play,
} from "lucide-react";

type Room = {
  id: string;
  roomNumber: string;
  floor: number;
};

type MaintenanceStaff = {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
  specialty: string | null;
  isActive: string;
};

type WorkOrder = {
  id: string;
  orderCode: string;
  title: string;
  description: string | null;
  roomId: string | null;
  location: string | null;
  category: "plumbing" | "electrical" | "hvac" | "furniture" | "cleaning" | "appliances" | "structure" | "general";
  priority: "low" | "medium" | "high" | "urgent";
  status: "pending" | "assigned" | "in_progress" | "completed" | "cancelled";
  assignedToId: string | null;
  reportedBy: string | null;
  reportedAt: string;
  scheduledDate: string | null;
  completedAt: string | null;
  completedBy: string | null;
  estimatedCost: string | null;
  actualCost: string | null;
  notes: string | null;
  room?: Room;
  assignedTo?: MaintenanceStaff;
};

type DashboardStats = {
  pending: number;
  inProgress: number;
  completedToday: number;
  urgent: number;
  totalStaff: number;
  recentOrders: WorkOrder[];
};

const priorityColors: Record<string, string> = {
  low: "bg-gray-500/20 text-gray-700 dark:text-gray-400 border-gray-500/30",
  medium: "bg-blue-500/20 text-blue-700 dark:text-blue-400 border-blue-500/30",
  high: "bg-orange-500/20 text-orange-700 dark:text-orange-400 border-orange-500/30",
  urgent: "bg-red-500/20 text-red-700 dark:text-red-400 border-red-500/30",
};

const priorityLabels: Record<string, string> = {
  low: "Baja",
  medium: "Media",
  high: "Alta",
  urgent: "Urgente",
};

const statusColors: Record<string, string> = {
  pending: "bg-yellow-500/20 text-yellow-700 dark:text-yellow-400 border-yellow-500/30",
  assigned: "bg-blue-500/20 text-blue-700 dark:text-blue-400 border-blue-500/30",
  in_progress: "bg-purple-500/20 text-purple-700 dark:text-purple-400 border-purple-500/30",
  completed: "bg-green-500/20 text-green-700 dark:text-green-400 border-green-500/30",
  cancelled: "bg-gray-500/20 text-gray-700 dark:text-gray-400 border-gray-500/30",
};

const statusLabels: Record<string, string> = {
  pending: "Pendiente",
  assigned: "Asignada",
  in_progress: "En Progreso",
  completed: "Completada",
  cancelled: "Cancelada",
};

const categoryLabels: Record<string, string> = {
  plumbing: "Plomeria",
  electrical: "Electricidad",
  hvac: "Climatizacion",
  furniture: "Mobiliario",
  cleaning: "Limpieza",
  appliances: "Electrodomesticos",
  structure: "Estructura",
  general: "General",
};

const workOrderFormSchema = z.object({
  title: z.string().min(1, "El titulo es requerido"),
  description: z.string().optional(),
  roomId: z.string().optional(),
  location: z.string().optional(),
  category: z.enum(["plumbing", "electrical", "hvac", "furniture", "cleaning", "appliances", "structure", "general"]),
  priority: z.enum(["low", "medium", "high", "urgent"]),
  assignedToId: z.string().optional(),
  scheduledDate: z.string().optional(),
  estimatedCost: z.string().optional(),
  notes: z.string().optional(),
});

type WorkOrderFormValues = z.infer<typeof workOrderFormSchema>;

const staffFormSchema = z.object({
  name: z.string().min(1, "El nombre es requerido"),
  phone: z.string().optional(),
  email: z.string().email("Email invalido").optional().or(z.literal("")),
  specialty: z.string().optional(),
});

type StaffFormValues = z.infer<typeof staffFormSchema>;

export default function MaintenancePage() {
  const [selectedOrder, setSelectedOrder] = useState<WorkOrder | null>(null);
  const [isNewOrderDialogOpen, setIsNewOrderDialogOpen] = useState(false);
  const [isNewStaffDialogOpen, setIsNewStaffDialogOpen] = useState(false);
  const [editingStaff, setEditingStaff] = useState<MaintenanceStaff | null>(null);
  const [statusFilter, setStatusFilter] = useState<string>("active");
  const { toast } = useToast();

  const { data: dashboardStats, isLoading: isLoadingStats } = useQuery<DashboardStats>({
    queryKey: ["/api/maintenance/dashboard"],
  });

  const { data: workOrders = [], isLoading: isLoadingOrders } = useQuery<WorkOrder[]>({
    queryKey: ["/api/maintenance/work-orders"],
  });

  const { data: staff = [], isLoading: isLoadingStaff } = useQuery<MaintenanceStaff[]>({
    queryKey: ["/api/maintenance/staff"],
  });

  const { data: rooms = [] } = useQuery<Room[]>({
    queryKey: ["/api/rooms"],
  });

  const orderForm = useForm<WorkOrderFormValues>({
    resolver: zodResolver(workOrderFormSchema),
    defaultValues: {
      title: "",
      description: "",
      roomId: "",
      location: "",
      category: "general",
      priority: "medium",
      assignedToId: "",
      scheduledDate: "",
      estimatedCost: "",
      notes: "",
    },
  });

  const staffForm = useForm<StaffFormValues>({
    resolver: zodResolver(staffFormSchema),
    defaultValues: {
      name: "",
      phone: "",
      email: "",
      specialty: "",
    },
  });

  const createOrderMutation = useMutation({
    mutationFn: async (data: WorkOrderFormValues) => {
      return apiRequest("POST", "/api/maintenance/work-orders", {
        ...data,
        roomId: data.roomId || null,
        assignedToId: data.assignedToId || null,
        status: data.assignedToId ? "assigned" : "pending",
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/maintenance/work-orders"] });
      queryClient.invalidateQueries({ queryKey: ["/api/maintenance/dashboard"] });
      setIsNewOrderDialogOpen(false);
      orderForm.reset();
      toast({ title: "Orden de trabajo creada", description: "La orden fue creada exitosamente" });
    },
    onError: () => {
      toast({ title: "Error", description: "No se pudo crear la orden de trabajo", variant: "destructive" });
    },
  });

  const updateOrderMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: Partial<WorkOrder> }) => {
      return apiRequest("PATCH", `/api/maintenance/work-orders/${id}`, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/maintenance/work-orders"] });
      queryClient.invalidateQueries({ queryKey: ["/api/maintenance/dashboard"] });
      setSelectedOrder(null);
      toast({ title: "Orden actualizada", description: "Los cambios fueron guardados" });
    },
    onError: () => {
      toast({ title: "Error", description: "No se pudo actualizar la orden", variant: "destructive" });
    },
  });

  const deleteOrderMutation = useMutation({
    mutationFn: async (id: string) => {
      return apiRequest("DELETE", `/api/maintenance/work-orders/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/maintenance/work-orders"] });
      queryClient.invalidateQueries({ queryKey: ["/api/maintenance/dashboard"] });
      setSelectedOrder(null);
      toast({ title: "Orden eliminada" });
    },
    onError: () => {
      toast({ title: "Error", description: "No se pudo eliminar la orden", variant: "destructive" });
    },
  });

  const createStaffMutation = useMutation({
    mutationFn: async (data: StaffFormValues) => {
      return apiRequest("POST", "/api/maintenance/staff", data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/maintenance/staff"] });
      queryClient.invalidateQueries({ queryKey: ["/api/maintenance/dashboard"] });
      setIsNewStaffDialogOpen(false);
      staffForm.reset();
      toast({ title: "Personal agregado", description: "El tecnico fue agregado exitosamente" });
    },
    onError: () => {
      toast({ title: "Error", description: "No se pudo agregar el personal", variant: "destructive" });
    },
  });

  const updateStaffMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: Partial<MaintenanceStaff> }) => {
      return apiRequest("PATCH", `/api/maintenance/staff/${id}`, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/maintenance/staff"] });
      setEditingStaff(null);
      staffForm.reset();
      toast({ title: "Personal actualizado" });
    },
    onError: () => {
      toast({ title: "Error", description: "No se pudo actualizar el personal", variant: "destructive" });
    },
  });

  const deleteStaffMutation = useMutation({
    mutationFn: async (id: string) => {
      return apiRequest("DELETE", `/api/maintenance/staff/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/maintenance/staff"] });
      queryClient.invalidateQueries({ queryKey: ["/api/maintenance/dashboard"] });
      toast({ title: "Personal eliminado" });
    },
    onError: () => {
      toast({ title: "Error", description: "No se pudo eliminar el personal", variant: "destructive" });
    },
  });

  const filteredOrders = workOrders.filter((order) => {
    if (statusFilter === "active") {
      return order.status !== "completed" && order.status !== "cancelled";
    }
    if (statusFilter === "completed") {
      return order.status === "completed";
    }
    return true;
  });

  const sortedOrders = [...filteredOrders].sort((a, b) => {
    const priorityOrder = { urgent: 0, high: 1, medium: 2, low: 3 };
    return (priorityOrder[a.priority] || 2) - (priorityOrder[b.priority] || 2);
  });

  const handleStatusChange = (order: WorkOrder, newStatus: string) => {
    updateOrderMutation.mutate({
      id: order.id,
      data: { status: newStatus as WorkOrder["status"] },
    });
  };

  const handleAssign = (order: WorkOrder, staffId: string) => {
    updateOrderMutation.mutate({
      id: order.id,
      data: { 
        assignedToId: staffId,
        status: "assigned",
      },
    });
  };

  const openEditStaff = (member: MaintenanceStaff) => {
    setEditingStaff(member);
    staffForm.reset({
      name: member.name,
      phone: member.phone || "",
      email: member.email || "",
      specialty: member.specialty || "",
    });
  };

  if (isLoadingStats || isLoadingOrders || isLoadingStaff) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold" data-testid="text-page-title">Mantenimiento</h1>
          <p className="text-muted-foreground">Gestione ordenes de trabajo y personal de mantenimiento</p>
        </div>
        <Button onClick={() => setIsNewOrderDialogOpen(true)} data-testid="button-new-order">
          <Plus className="mr-2 h-4 w-4" />
          Nueva Orden
        </Button>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-5">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Pendientes</CardTitle>
            <Clock className="h-4 w-4 text-yellow-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold" data-testid="text-pending-count">{dashboardStats?.pending || 0}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">En Progreso</CardTitle>
            <Wrench className="h-4 w-4 text-blue-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold" data-testid="text-in-progress-count">{dashboardStats?.inProgress || 0}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Completadas Hoy</CardTitle>
            <CheckCircle className="h-4 w-4 text-green-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold" data-testid="text-completed-count">{dashboardStats?.completedToday || 0}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Urgentes</CardTitle>
            <AlertTriangle className="h-4 w-4 text-red-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold" data-testid="text-urgent-count">{dashboardStats?.urgent || 0}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Tecnicos</CardTitle>
            <User className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold" data-testid="text-staff-count">{dashboardStats?.totalStaff || 0}</div>
          </CardContent>
        </Card>
      </div>

      <Tabs defaultValue="orders" className="space-y-4">
        <TabsList>
          <TabsTrigger value="orders" data-testid="tab-orders">Ordenes de Trabajo</TabsTrigger>
          <TabsTrigger value="staff" data-testid="tab-staff">Personal</TabsTrigger>
        </TabsList>

        <TabsContent value="orders" className="space-y-4">
          <div className="flex flex-wrap items-center gap-2">
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-[180px]" data-testid="select-status-filter">
                <SelectValue placeholder="Filtrar por estado" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="active">Activas</SelectItem>
                <SelectItem value="completed">Completadas</SelectItem>
                <SelectItem value="all">Todas</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <Card>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Codigo</TableHead>
                  <TableHead>Titulo</TableHead>
                  <TableHead>Ubicacion</TableHead>
                  <TableHead>Categoria</TableHead>
                  <TableHead>Prioridad</TableHead>
                  <TableHead>Estado</TableHead>
                  <TableHead>Asignado a</TableHead>
                  <TableHead>Acciones</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {sortedOrders.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={8} className="text-center text-muted-foreground py-8">
                      No hay ordenes de trabajo
                    </TableCell>
                  </TableRow>
                ) : (
                  sortedOrders.map((order) => (
                    <TableRow key={order.id} data-testid={`row-order-${order.id}`}>
                      <TableCell className="font-mono text-sm">{order.orderCode}</TableCell>
                      <TableCell className="font-medium">{order.title}</TableCell>
                      <TableCell>
                        {order.room ? `Hab. ${order.room.roomNumber}` : order.location || "-"}
                      </TableCell>
                      <TableCell>{categoryLabels[order.category]}</TableCell>
                      <TableCell>
                        <Badge className={priorityColors[order.priority]}>
                          {priorityLabels[order.priority]}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Badge className={statusColors[order.status]}>
                          {statusLabels[order.status]}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        {order.assignedTo ? order.assignedTo.name : (
                          <Select onValueChange={(value) => handleAssign(order, value)}>
                            <SelectTrigger className="w-[140px]" data-testid={`select-assign-${order.id}`}>
                              <SelectValue placeholder="Asignar" />
                            </SelectTrigger>
                            <SelectContent>
                              {staff.filter(s => s.isActive === "true").map((s) => (
                                <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        )}
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1">
                          <Button
                            size="icon"
                            variant="ghost"
                            onClick={() => setSelectedOrder(order)}
                            data-testid={`button-view-order-${order.id}`}
                          >
                            <Edit className="h-4 w-4" />
                          </Button>
                          {order.status === "assigned" && (
                            <Button
                              size="icon"
                              variant="ghost"
                              onClick={() => handleStatusChange(order, "in_progress")}
                              data-testid={`button-start-order-${order.id}`}
                            >
                              <Play className="h-4 w-4" />
                            </Button>
                          )}
                          {order.status === "in_progress" && (
                            <Button
                              size="icon"
                              variant="ghost"
                              onClick={() => handleStatusChange(order, "completed")}
                              data-testid={`button-complete-order-${order.id}`}
                            >
                              <CheckCircle className="h-4 w-4" />
                            </Button>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </Card>
        </TabsContent>

        <TabsContent value="staff" className="space-y-4">
          <div className="flex justify-end">
            <Button onClick={() => setIsNewStaffDialogOpen(true)} data-testid="button-new-staff">
              <Plus className="mr-2 h-4 w-4" />
              Agregar Tecnico
            </Button>
          </div>

          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {staff.map((member) => (
              <Card key={member.id} data-testid={`card-staff-${member.id}`}>
                <CardHeader className="flex flex-row items-start justify-between gap-2 space-y-0">
                  <div>
                    <CardTitle className="text-lg">{member.name}</CardTitle>
                    {member.specialty && (
                      <p className="text-sm text-muted-foreground mt-1">{member.specialty}</p>
                    )}
                  </div>
                  <Badge className={member.isActive === "true" ? "bg-green-500/20 text-green-700" : "bg-gray-500/20 text-gray-500"}>
                    {member.isActive === "true" ? "Activo" : "Inactivo"}
                  </Badge>
                </CardHeader>
                <CardContent className="space-y-2">
                  {member.phone && (
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <Phone className="h-4 w-4" />
                      {member.phone}
                    </div>
                  )}
                  {member.email && (
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <Mail className="h-4 w-4" />
                      {member.email}
                    </div>
                  )}
                  <div className="flex items-center gap-2 pt-2">
                    <Button size="sm" variant="outline" onClick={() => openEditStaff(member)} data-testid={`button-edit-staff-${member.id}`}>
                      <Edit className="h-4 w-4 mr-1" />
                      Editar
                    </Button>
                    <Button 
                      size="sm" 
                      variant="outline" 
                      onClick={() => {
                        if (confirm("Eliminar este tecnico?")) {
                          deleteStaffMutation.mutate(member.id);
                        }
                      }}
                      data-testid={`button-delete-staff-${member.id}`}
                    >
                      <Trash2 className="h-4 w-4 mr-1" />
                      Eliminar
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </TabsContent>
      </Tabs>

      <Dialog open={isNewOrderDialogOpen} onOpenChange={setIsNewOrderDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Nueva Orden de Trabajo</DialogTitle>
            <DialogDescription>Complete los datos para crear una nueva orden de trabajo</DialogDescription>
          </DialogHeader>
          <Form {...orderForm}>
            <form onSubmit={orderForm.handleSubmit((data) => createOrderMutation.mutate(data))} className="space-y-4">
              <FormField
                control={orderForm.control}
                name="title"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Titulo</FormLabel>
                    <FormControl>
                      <Input placeholder="Descripcion breve del problema" {...field} data-testid="input-order-title" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={orderForm.control}
                name="description"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Descripcion</FormLabel>
                    <FormControl>
                      <Textarea placeholder="Detalles adicionales" {...field} data-testid="input-order-description" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <div className="grid grid-cols-2 gap-4">
                <FormField
                  control={orderForm.control}
                  name="roomId"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Habitacion</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value}>
                        <FormControl>
                          <SelectTrigger data-testid="select-order-room">
                            <SelectValue placeholder="Seleccionar" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="">Ninguna</SelectItem>
                          {rooms.map((room) => (
                            <SelectItem key={room.id} value={room.id}>
                              {room.roomNumber} (Piso {room.floor})
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={orderForm.control}
                  name="location"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Otra ubicacion</FormLabel>
                      <FormControl>
                        <Input placeholder="Ej: Lobby, Restaurante" {...field} data-testid="input-order-location" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <FormField
                  control={orderForm.control}
                  name="category"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Categoria</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value}>
                        <FormControl>
                          <SelectTrigger data-testid="select-order-category">
                            <SelectValue placeholder="Seleccionar" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {Object.entries(categoryLabels).map(([value, label]) => (
                            <SelectItem key={value} value={value}>{label}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={orderForm.control}
                  name="priority"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Prioridad</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value}>
                        <FormControl>
                          <SelectTrigger data-testid="select-order-priority">
                            <SelectValue placeholder="Seleccionar" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {Object.entries(priorityLabels).map(([value, label]) => (
                            <SelectItem key={value} value={value}>{label}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
              <FormField
                control={orderForm.control}
                name="assignedToId"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Asignar a</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger data-testid="select-order-assigned">
                          <SelectValue placeholder="Sin asignar" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="">Sin asignar</SelectItem>
                        {staff.filter(s => s.isActive === "true").map((s) => (
                          <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={orderForm.control}
                name="notes"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Notas</FormLabel>
                    <FormControl>
                      <Textarea placeholder="Notas adicionales" {...field} data-testid="input-order-notes" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setIsNewOrderDialogOpen(false)}>
                  Cancelar
                </Button>
                <Button type="submit" disabled={createOrderMutation.isPending} data-testid="button-submit-order">
                  {createOrderMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Crear Orden
                </Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>

      <Dialog open={!!selectedOrder} onOpenChange={() => setSelectedOrder(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Orden {selectedOrder?.orderCode}</DialogTitle>
            <DialogDescription>{selectedOrder?.title}</DialogDescription>
          </DialogHeader>
          {selectedOrder && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-sm text-muted-foreground">Estado</p>
                  <Badge className={statusColors[selectedOrder.status]}>
                    {statusLabels[selectedOrder.status]}
                  </Badge>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Prioridad</p>
                  <Badge className={priorityColors[selectedOrder.priority]}>
                    {priorityLabels[selectedOrder.priority]}
                  </Badge>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-sm text-muted-foreground">Categoria</p>
                  <p className="font-medium">{categoryLabels[selectedOrder.category]}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Ubicacion</p>
                  <p className="font-medium">
                    {selectedOrder.room ? `Hab. ${selectedOrder.room.roomNumber}` : selectedOrder.location || "No especificada"}
                  </p>
                </div>
              </div>
              {selectedOrder.description && (
                <div>
                  <p className="text-sm text-muted-foreground">Descripcion</p>
                  <p>{selectedOrder.description}</p>
                </div>
              )}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-sm text-muted-foreground">Reportada</p>
                  <p className="font-medium">
                    {format(parseISO(selectedOrder.reportedAt), "dd/MM/yyyy HH:mm", { locale: es })}
                  </p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Asignado a</p>
                  <p className="font-medium">{selectedOrder.assignedTo?.name || "Sin asignar"}</p>
                </div>
              </div>
              {selectedOrder.completedAt && (
                <div>
                  <p className="text-sm text-muted-foreground">Completada</p>
                  <p className="font-medium">
                    {format(parseISO(selectedOrder.completedAt), "dd/MM/yyyy HH:mm", { locale: es })}
                  </p>
                </div>
              )}
              {selectedOrder.notes && (
                <div>
                  <p className="text-sm text-muted-foreground">Notas</p>
                  <p>{selectedOrder.notes}</p>
                </div>
              )}
              <DialogFooter className="flex flex-wrap gap-2">
                {selectedOrder.status === "pending" && (
                  <Button
                    variant="outline"
                    onClick={() => handleStatusChange(selectedOrder, "cancelled")}
                  >
                    Cancelar Orden
                  </Button>
                )}
                {selectedOrder.status === "assigned" && (
                  <Button onClick={() => handleStatusChange(selectedOrder, "in_progress")} data-testid="button-start-order">
                    <Play className="mr-2 h-4 w-4" />
                    Iniciar Trabajo
                  </Button>
                )}
                {selectedOrder.status === "in_progress" && (
                  <Button onClick={() => handleStatusChange(selectedOrder, "completed")} data-testid="button-complete-order">
                    <CheckCircle className="mr-2 h-4 w-4" />
                    Completar
                  </Button>
                )}
                <Button
                  variant="destructive"
                  onClick={() => {
                    if (confirm("Eliminar esta orden?")) {
                      deleteOrderMutation.mutate(selectedOrder.id);
                    }
                  }}
                >
                  <Trash2 className="mr-2 h-4 w-4" />
                  Eliminar
                </Button>
              </DialogFooter>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={isNewStaffDialogOpen || !!editingStaff} onOpenChange={(open) => {
        if (!open) {
          setIsNewStaffDialogOpen(false);
          setEditingStaff(null);
          staffForm.reset();
        }
      }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{editingStaff ? "Editar Tecnico" : "Nuevo Tecnico"}</DialogTitle>
            <DialogDescription>Complete los datos del personal de mantenimiento</DialogDescription>
          </DialogHeader>
          <Form {...staffForm}>
            <form onSubmit={staffForm.handleSubmit((data) => {
              if (editingStaff) {
                updateStaffMutation.mutate({ id: editingStaff.id, data });
              } else {
                createStaffMutation.mutate(data);
              }
            })} className="space-y-4">
              <FormField
                control={staffForm.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Nombre Completo</FormLabel>
                    <FormControl>
                      <Input placeholder="Nombre y Apellido" {...field} data-testid="input-staff-name" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={staffForm.control}
                name="specialty"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Especialidad</FormLabel>
                    <FormControl>
                      <Input placeholder="Ej: Plomeria, Electricidad" {...field} data-testid="input-staff-specialty" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={staffForm.control}
                name="phone"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Telefono</FormLabel>
                    <FormControl>
                      <Input placeholder="+54 343 ..." {...field} data-testid="input-staff-phone" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={staffForm.control}
                name="email"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Email</FormLabel>
                    <FormControl>
                      <Input type="email" placeholder="email@ejemplo.com" {...field} data-testid="input-staff-email" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => {
                  setIsNewStaffDialogOpen(false);
                  setEditingStaff(null);
                  staffForm.reset();
                }}>
                  Cancelar
                </Button>
                <Button type="submit" disabled={createStaffMutation.isPending || updateStaffMutation.isPending} data-testid="button-submit-staff">
                  {(createStaffMutation.isPending || updateStaffMutation.isPending) && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  {editingStaff ? "Guardar" : "Agregar"}
                </Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
