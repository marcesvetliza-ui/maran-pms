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
  ChevronRight,
  Lock,
  CalendarRange,
} from "lucide-react";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { useAuth } from "@/App";
import type { SystemIncident } from "@shared/schema";

type Room = {
  id: string;
  roomNumber: string;
  floor: number;
  status: string;
  roomType?: { id: string; name: string } | null;
};

type MaintenanceStaff = {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
  specialty: string | null;
  isActive: string;
};

type MaintenanceBlock = {
  id: string;
  workOrderId: string | null;
  roomId: string;
  blockFrom: string;
  blockTo: string;
  blockedBy: string;
  notes: string | null;
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
  maintenanceBlock?: MaintenanceBlock | null;
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

const SEVERITY_CONFIG: Record<string, { label: string; color: string }> = {
  baja:    { label: "Baja",    color: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400" },
  media:   { label: "Media",   color: "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400" },
  alta:    { label: "Alta",    color: "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400" },
  critica: { label: "Crítica", color: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400" },
};
const STATUS_CONFIG_INC: Record<string, { label: string; color: string }> = {
  pendiente:   { label: "Pendiente",   color: "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300" },
  en_revision: { label: "En revisión", color: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400" },
  resuelto:    { label: "Resuelto",    color: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400" },
  descartado:  { label: "Descartado",  color: "bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-500" },
};
const INC_MODULES = [
  "planning", "reservas", "check-in", "check-out", "grupos",
  "restaurant", "spa", "eventos", "housekeeping", "hospitalidad",
  "inventario", "cajas", "reportes", "administracion", "otro",
];

function IncidenciasTab() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [filterStatus, setFilterStatus] = useState("all");
  const [filterSeverity, setFilterSeverity] = useState("all");
  const [filterModule, setFilterModule] = useState("all");
  const [isNewDialogOpen, setIsNewDialogOpen] = useState(false);
  const [isDetailDialogOpen, setIsDetailDialogOpen] = useState(false);
  const [selectedIncident, setSelectedIncident] = useState<SystemIncident | null>(null);
  const [newTitle, setNewTitle] = useState("");
  const [newDesc, setNewDesc] = useState("");
  const [newModule, setNewModule] = useState("otro");
  const [newSeverity, setNewSeverity] = useState("media");
  const [updateStatus, setUpdateStatus] = useState("");
  const [updateAssigned, setUpdateAssigned] = useState("");
  const [updateResolution, setUpdateResolution] = useState("");
  const [updateResolvedBy, setUpdateResolvedBy] = useState("");

  const queryParams = new URLSearchParams();
  if (filterStatus !== "all") queryParams.set("status", filterStatus);
  if (filterSeverity !== "all") queryParams.set("severity", filterSeverity);
  if (filterModule !== "all") queryParams.set("module", filterModule);

  const { data: incidents = [], isLoading } = useQuery<SystemIncident[]>({
    queryKey: ["/api/incidents", filterStatus, filterSeverity, filterModule],
    queryFn: async () => {
      const res = await fetch(`/api/incidents?${queryParams.toString()}`, { credentials: "include" });
      if (!res.ok) throw new Error("Error cargando incidentes");
      return res.json();
    },
  });

  const { data: stats } = useQuery<any>({
    queryKey: ["/api/incidents/stats"],
    queryFn: async () => {
      const res = await fetch("/api/incidents/stats", { credentials: "include" });
      if (!res.ok) return {};
      return res.json();
    },
  });

  const createMutation = useMutation({
    mutationFn: async (data: any) => {
      const res = await fetch("/api/incidents", { method: "POST", headers: { "Content-Type": "application/json" }, credentials: "include", body: JSON.stringify(data) });
      if (!res.ok) throw new Error("Error al crear incidente");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/incidents"] });
      queryClient.invalidateQueries({ queryKey: ["/api/incidents/stats"] });
      setIsNewDialogOpen(false);
      setNewTitle(""); setNewDesc(""); setNewModule("otro"); setNewSeverity("media");
      toast({ title: "Incidencia registrada" });
    },
    onError: () => toast({ title: "Error", description: "No se pudo registrar la incidencia", variant: "destructive" }),
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: any }) => {
      const res = await fetch(`/api/incidents/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, credentials: "include", body: JSON.stringify(data) });
      if (!res.ok) throw new Error("Error al actualizar");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/incidents"] });
      queryClient.invalidateQueries({ queryKey: ["/api/incidents/stats"] });
      setIsDetailDialogOpen(false);
      toast({ title: "Incidencia actualizada" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/incidents/${id}`, { method: "DELETE", credentials: "include" });
      if (!res.ok) throw new Error("Error al eliminar");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/incidents"] });
      queryClient.invalidateQueries({ queryKey: ["/api/incidents/stats"] });
      setIsDetailDialogOpen(false);
      toast({ title: "Incidencia eliminada" });
    },
  });

  const openDetail = (incident: SystemIncident) => {
    setSelectedIncident(incident);
    setUpdateStatus(incident.status);
    setUpdateAssigned(incident.assignedTo || "");
    setUpdateResolution(incident.resolutionNotes || "");
    setUpdateResolvedBy(incident.resolvedBy || "");
    setIsDetailDialogOpen(true);
  };

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Card className="border-l-4 border-l-gray-400"><CardContent className="p-4"><p className="text-2xl font-bold">{stats?.pendiente ?? 0}</p><p className="text-xs text-muted-foreground">Pendientes</p></CardContent></Card>
        <Card className="border-l-4 border-l-blue-400"><CardContent className="p-4"><p className="text-2xl font-bold">{stats?.en_revision ?? 0}</p><p className="text-xs text-muted-foreground">En revisión</p></CardContent></Card>
        <Card className="border-l-4 border-l-red-400"><CardContent className="p-4"><p className="text-2xl font-bold">{stats?.criticos ?? 0}</p><p className="text-xs text-muted-foreground">Críticos abiertos</p></CardContent></Card>
        <Card className="border-l-4 border-l-green-400"><CardContent className="p-4"><p className="text-2xl font-bold">{stats?.resuelto ?? 0}</p><p className="text-xs text-muted-foreground">Resueltos</p></CardContent></Card>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <Select value={filterStatus} onValueChange={setFilterStatus}>
          <SelectTrigger className="w-36"><SelectValue placeholder="Estado" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos</SelectItem>
            <SelectItem value="pendiente">Pendiente</SelectItem>
            <SelectItem value="en_revision">En revisión</SelectItem>
            <SelectItem value="resuelto">Resuelto</SelectItem>
            <SelectItem value="descartado">Descartado</SelectItem>
          </SelectContent>
        </Select>
        <Select value={filterSeverity} onValueChange={setFilterSeverity}>
          <SelectTrigger className="w-36"><SelectValue placeholder="Gravedad" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todas</SelectItem>
            <SelectItem value="critica">Crítica</SelectItem>
            <SelectItem value="alta">Alta</SelectItem>
            <SelectItem value="media">Media</SelectItem>
            <SelectItem value="baja">Baja</SelectItem>
          </SelectContent>
        </Select>
        <Select value={filterModule} onValueChange={setFilterModule}>
          <SelectTrigger className="w-40"><SelectValue placeholder="Módulo" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos los módulos</SelectItem>
            {INC_MODULES.map(m => (
              <SelectItem key={m} value={m}>{m.charAt(0).toUpperCase() + m.slice(1)}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <div className="ml-auto">
          <Button onClick={() => setIsNewDialogOpen(true)} data-testid="btn-new-incident">
            <Plus className="h-4 w-4 mr-2" />Reportar incidencia
          </Button>
        </div>
      </div>

      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-8 text-center text-muted-foreground">Cargando...</div>
          ) : incidents.length === 0 ? (
            <div className="p-8 text-center text-muted-foreground">No hay incidencias con los filtros actuales</div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Título</TableHead>
                  <TableHead>Módulo</TableHead>
                  <TableHead>Gravedad</TableHead>
                  <TableHead>Estado</TableHead>
                  <TableHead>Reportado por</TableHead>
                  <TableHead>Fecha</TableHead>
                  <TableHead className="w-10"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {incidents.map((incident) => (
                  <TableRow key={incident.id} className="cursor-pointer hover:bg-muted/50" onClick={() => openDetail(incident)} data-testid={`incident-row-${incident.id}`}>
                    <TableCell className="font-medium max-w-[200px] truncate">{incident.title}</TableCell>
                    <TableCell className="capitalize text-sm">{incident.module}</TableCell>
                    <TableCell><Badge className={`text-xs ${SEVERITY_CONFIG[incident.severity]?.color}`}>{SEVERITY_CONFIG[incident.severity]?.label ?? incident.severity}</Badge></TableCell>
                    <TableCell><Badge className={`text-xs ${STATUS_CONFIG_INC[incident.status]?.color}`}>{STATUS_CONFIG_INC[incident.status]?.label ?? incident.status}</Badge></TableCell>
                    <TableCell className="text-sm">{incident.reportedBy}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">{new Date(incident.reportedAt).toLocaleDateString("es-AR")}</TableCell>
                    <TableCell><ChevronRight className="h-4 w-4 text-muted-foreground" /></TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Dialog open={isNewDialogOpen} onOpenChange={setIsNewDialogOpen}>
        <DialogContent className="w-[95vw] max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>Reportar incidencia</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div><Label>Título *</Label><Input value={newTitle} onChange={e => setNewTitle(e.target.value)} placeholder="Descripción breve del problema" data-testid="input-incident-title" /></div>
            <div><Label>Descripción detallada *</Label><Textarea value={newDesc} onChange={e => setNewDesc(e.target.value)} placeholder="¿Qué pasó? ¿Cómo reproducirlo?" rows={4} data-testid="input-incident-desc" /></div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Módulo</Label>
                <Select value={newModule} onValueChange={setNewModule}>
                  <SelectTrigger data-testid="select-incident-module"><SelectValue /></SelectTrigger>
                  <SelectContent>{INC_MODULES.map(m => <SelectItem key={m} value={m}>{m.charAt(0).toUpperCase() + m.slice(1)}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div>
                <Label>Gravedad</Label>
                <Select value={newSeverity} onValueChange={setNewSeverity}>
                  <SelectTrigger data-testid="select-incident-severity"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="baja">Baja — no bloquea</SelectItem>
                    <SelectItem value="media">Media — dificulta</SelectItem>
                    <SelectItem value="alta">Alta — bloquea parcial</SelectItem>
                    <SelectItem value="critica">Crítica — sistema caído</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div><Label>Reportado por</Label><Input value={user?.fullName || user?.username || ""} readOnly className="bg-muted" data-testid="input-incident-reporter" /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsNewDialogOpen(false)}>Cancelar</Button>
            <Button onClick={() => createMutation.mutate({ title: newTitle, description: newDesc, module: newModule, severity: newSeverity, reportedBy: user?.fullName || user?.username || "Usuario" })} disabled={!newTitle.trim() || !newDesc.trim() || createMutation.isPending} data-testid="btn-submit-incident">
              {createMutation.isPending ? "Guardando..." : "Reportar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={isDetailDialogOpen} onOpenChange={setIsDetailDialogOpen}>
        <DialogContent className="w-[95vw] max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle className="flex items-center gap-2"><AlertTriangle className="h-5 w-5" />{selectedIncident?.title}</DialogTitle></DialogHeader>
          {selectedIncident && (
            <div className="space-y-4">
              <div className="flex flex-wrap gap-2">
                <Badge className={SEVERITY_CONFIG[selectedIncident.severity]?.color}>{SEVERITY_CONFIG[selectedIncident.severity]?.label}</Badge>
                <Badge variant="outline" className="capitalize">{selectedIncident.module}</Badge>
                <Badge className={STATUS_CONFIG_INC[selectedIncident.status]?.color}>{STATUS_CONFIG_INC[selectedIncident.status]?.label}</Badge>
              </div>
              <div className="text-sm text-muted-foreground border rounded-lg p-3 bg-muted/20 whitespace-pre-wrap">{selectedIncident.description}</div>
              <div className="text-xs text-muted-foreground">Reportado por <strong>{selectedIncident.reportedBy}</strong> el {new Date(selectedIncident.reportedAt).toLocaleString("es-AR")}</div>
              {selectedIncident.resolvedAt && <div className="text-xs text-muted-foreground">Resuelto por <strong>{selectedIncident.resolvedBy}</strong> el {new Date(selectedIncident.resolvedAt).toLocaleString("es-AR")}</div>}
              <div className="border-t pt-4 space-y-3">
                <p className="text-sm font-medium">Actualizar estado</p>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label className="text-xs">Estado</Label>
                    <Select value={updateStatus} onValueChange={setUpdateStatus}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="pendiente">Pendiente</SelectItem>
                        <SelectItem value="en_revision">En revisión</SelectItem>
                        <SelectItem value="resuelto">Resuelto</SelectItem>
                        <SelectItem value="descartado">Descartado</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div><Label className="text-xs">Asignado a</Label><Input value={updateAssigned} onChange={e => setUpdateAssigned(e.target.value)} placeholder="Responsable" /></div>
                </div>
                {(updateStatus === "resuelto" || updateStatus === "descartado") && (
                  <div><Label className="text-xs">Resuelto por</Label><Input value={updateResolvedBy} onChange={e => setUpdateResolvedBy(e.target.value)} placeholder="Quien resolvió" /></div>
                )}
                <div><Label className="text-xs">Notas de resolución</Label><Textarea value={updateResolution} onChange={e => setUpdateResolution(e.target.value)} placeholder="¿Cómo se resolvió?" rows={3} /></div>
              </div>
            </div>
          )}
          <DialogFooter className="flex-wrap gap-2">
            {user?.role === "admin" && selectedIncident && (
              <Button variant="destructive" size="sm" onClick={() => deleteMutation.mutate(selectedIncident.id)} disabled={deleteMutation.isPending} className="mr-auto">Eliminar</Button>
            )}
            <Button variant="outline" onClick={() => setIsDetailDialogOpen(false)}>Cerrar</Button>
            <Button onClick={() => selectedIncident && updateMutation.mutate({ id: selectedIncident.id, data: { status: updateStatus, assignedTo: updateAssigned || null, resolvedBy: updateResolvedBy || null, resolutionNotes: updateResolution || null } })} disabled={updateMutation.isPending}>
              {updateMutation.isPending ? "Guardando..." : "Guardar cambios"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default function MaintenancePage() {
  const [selectedOrder, setSelectedOrder] = useState<WorkOrder | null>(null);
  const [isNewOrderDialogOpen, setIsNewOrderDialogOpen] = useState(false);
  const [isNewStaffDialogOpen, setIsNewStaffDialogOpen] = useState(false);
  const [editingStaff, setEditingStaff] = useState<MaintenanceStaff | null>(null);
  const [statusFilter, setStatusFilter] = useState<string>("active");
  // Block state for new order form
  const [blockRoom, setBlockRoom] = useState(false);
  const [blockFrom, setBlockFrom] = useState("");
  const [blockTo, setBlockTo] = useState("");
  // Block state for detail/edit dialog
  const [detailBlockEnabled, setDetailBlockEnabled] = useState(false);
  const [detailBlockFrom, setDetailBlockFrom] = useState("");
  const [detailBlockTo, setDetailBlockTo] = useState("");
  const { toast } = useToast();
  const { user } = useAuth();

  type ConflictRes = { id: string; guestName: string; checkInDate: string; checkOutDate: string; status: string };
  const [blockConflicts, setBlockConflicts] = useState<ConflictRes[]>([]);
  const [pendingBlockAction, setPendingBlockAction] = useState<
    | { type: "add_block"; payload: { workOrderId: string; roomId: string; blockFrom: string; blockTo: string; blockedBy: string } }
    | { type: "new_order"; orderData: any }
    | null
  >(null);

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
      const roomIdClean = data.roomId && data.roomId !== "none" ? data.roomId : null;
      return apiRequest("POST", "/api/maintenance/work-orders", {
        ...data,
        roomId: roomIdClean,
        assignedToId: data.assignedToId && data.assignedToId !== "none" ? data.assignedToId : null,
        status: data.assignedToId && data.assignedToId !== "none" ? "assigned" : "pending",
        // Block fields — only sent when toggle is on
        blockRoom: blockRoom && !!roomIdClean && !!blockFrom && !!blockTo,
        blockFrom: blockRoom ? blockFrom : undefined,
        blockTo: blockRoom ? blockTo : undefined,
        blockedBy: blockRoom ? (user?.username || "Sistema") : undefined,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/maintenance/work-orders"] });
      queryClient.invalidateQueries({ queryKey: ["/api/maintenance/dashboard"] });
      queryClient.invalidateQueries({ queryKey: ["/api/planning"] });
      setIsNewOrderDialogOpen(false);
      orderForm.reset();
      setBlockRoom(false);
      setBlockFrom("");
      setBlockTo("");
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

  const addBlockMutation = useMutation({
    mutationFn: async ({ workOrderId, roomId, blockFrom, blockTo, blockedBy }: {
      workOrderId: string; roomId: string; blockFrom: string; blockTo: string; blockedBy: string;
    }) => {
      return apiRequest("POST", "/api/maintenance/blocks", { workOrderId, roomId, blockFrom, blockTo, blockedBy });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/maintenance/work-orders"] });
      queryClient.invalidateQueries({ queryKey: ["/api/planning"] });
      setDetailBlockEnabled(false);
      setDetailBlockFrom("");
      setDetailBlockTo("");
      toast({ title: "Bloqueo aplicado", description: "La habitación fue bloqueada en el planning." });
    },
    onError: () => {
      toast({ title: "Error", description: "No se pudo crear el bloqueo.", variant: "destructive" });
    },
  });

  const removeBlockMutation = useMutation({
    mutationFn: async (blockId: string) => {
      return apiRequest("DELETE", `/api/maintenance/blocks/${blockId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/maintenance/work-orders"] });
      queryClient.invalidateQueries({ queryKey: ["/api/planning"] });
      toast({ title: "Bloqueo eliminado", description: "La habitación fue desbloqueada del planning." });
    },
    onError: () => {
      toast({ title: "Error", description: "No se pudo eliminar el bloqueo.", variant: "destructive" });
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

  const clearMaintenanceFlagMutation = useMutation({
    mutationFn: async (roomId: string) => {
      return apiRequest("PATCH", `/api/housekeeping/room/${roomId}/status`, { status: "available" });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/rooms"] });
      queryClient.invalidateQueries({ queryKey: ["/api/planning"] });
      toast({ title: "Habitación disponible", description: "La habitación volvió a estado disponible" });
    },
    onError: () => {
      toast({ title: "Error", description: "No se pudo actualizar la habitación", variant: "destructive" });
    },
  });

  // Helper: execute the pending block action after conflict confirmation
  const executeBlockAction = (action: NonNullable<typeof pendingBlockAction>) => {
    if (action.type === "add_block") {
      addBlockMutation.mutate(action.payload);
    } else {
      createOrderMutation.mutate(action.orderData);
    }
    setBlockConflicts([]);
    setPendingBlockAction(null);
  };

  // Helper: check conflicts, then either proceed or show warning dialog
  const checkConflictsAndProceed = async (
    roomId: string,
    from: string,
    to: string,
    action: NonNullable<typeof pendingBlockAction>
  ) => {
    try {
      const res = await fetch(
        `/api/maintenance/blocks/check-conflicts?roomId=${encodeURIComponent(roomId)}&from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`,
        { credentials: "include" }
      );
      const conflicts: ConflictRes[] = await res.json();
      if (Array.isArray(conflicts) && conflicts.length > 0) {
        setBlockConflicts(conflicts);
        setPendingBlockAction(action);
      } else {
        executeBlockAction(action);
      }
    } catch {
      executeBlockAction(action); // If check fails, proceed anyway
    }
  };

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
          <TabsTrigger value="rooms" data-testid="tab-rooms">
            <Wrench className="h-4 w-4 mr-1" />
            Habitaciones
            {rooms.filter(r => r.status === "maintenance").length > 0 && (
              <span className="ml-1.5 bg-red-500 text-white text-[10px] rounded-full px-1.5 py-0.5 font-bold leading-none">
                {rooms.filter(r => r.status === "maintenance").length}
              </span>
            )}
          </TabsTrigger>
          <TabsTrigger value="staff" data-testid="tab-staff">Personal</TabsTrigger>
          <TabsTrigger value="bitacora" data-testid="tab-bitacora">
            <AlertTriangle className="h-4 w-4 mr-1" />
            Bitácora
          </TabsTrigger>
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
                        <div className="flex items-center gap-1.5">
                          <span>{order.room ? `Hab. ${order.room.roomNumber}` : order.location || "-"}</span>
                          {order.maintenanceBlock && (
                            <span title={`Bloqueada: ${order.maintenanceBlock.blockFrom} → ${order.maintenanceBlock.blockTo}`}>
                              <Lock className="h-3.5 w-3.5 text-orange-500" />
                            </span>
                          )}
                        </div>
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

        <TabsContent value="rooms" className="space-y-4">
          {rooms.filter(r => r.status === "maintenance").length === 0 ? (
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-12 text-center">
                <Wrench className="h-10 w-10 text-muted-foreground mb-3" />
                <p className="text-muted-foreground font-medium">Sin habitaciones en mantenimiento</p>
                <p className="text-sm text-muted-foreground mt-1">Cuando Housekeeping marque una habitación con la herramienta, aparecerá aquí.</p>
              </CardContent>
            </Card>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {rooms
                .filter(r => r.status === "maintenance")
                .sort((a, b) => a.roomNumber.localeCompare(b.roomNumber, undefined, { numeric: true }))
                .map(room => (
                  <Card key={room.id} className="border-l-4 border-l-red-500" data-testid={`card-maintenance-room-${room.id}`}>
                    <CardContent className="p-4 space-y-3">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <Wrench className="h-4 w-4 text-red-500" />
                          <span className="text-xl font-bold">{room.roomNumber}</span>
                        </div>
                        <Badge variant="destructive" className="text-xs">Mantenimiento</Badge>
                      </div>
                      {room.roomType && (
                        <p className="text-sm text-muted-foreground">{room.roomType.name}</p>
                      )}
                      <p className="text-xs text-muted-foreground">
                        Marcada por Housekeeping — no bloquea reservas
                      </p>
                      <div className="flex gap-2 pt-1">
                        <Button
                          size="sm"
                          variant="outline"
                          className="flex-1 text-xs"
                          onClick={() => clearMaintenanceFlagMutation.mutate(room.id)}
                          disabled={clearMaintenanceFlagMutation.isPending}
                          data-testid={`button-clear-maintenance-${room.id}`}
                        >
                          Marcar disponible
                        </Button>
                        <Button
                          size="sm"
                          className="flex-1 text-xs"
                          onClick={() => {
                            orderForm.reset({
                              title: `Hab. ${room.roomNumber} — mantenimiento`,
                              roomId: room.id,
                              description: "",
                              location: "",
                              category: "general",
                              priority: "medium",
                              assignedToId: "",
                              scheduledDate: "",
                              estimatedCost: "",
                              notes: "",
                            });
                            setIsNewOrderDialogOpen(true);
                          }}
                          data-testid={`button-create-order-room-${room.id}`}
                        >
                          Crear orden
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="bitacora" className="space-y-4">
          <IncidenciasTab />
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
            <form onSubmit={orderForm.handleSubmit(async (data) => {
              const roomIdClean = data.roomId && data.roomId !== "none" ? data.roomId : null;
              if (blockRoom && roomIdClean && blockFrom && blockTo) {
                await checkConflictsAndProceed(roomIdClean, blockFrom, blockTo, { type: "new_order", orderData: data });
              } else {
                createOrderMutation.mutate(data);
              }
            })} className="space-y-4">
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
                          <SelectItem value="none">Ninguna</SelectItem>
                          {[...rooms]
                            .sort((a, b) => Number(a.roomNumber) - Number(b.roomNumber))
                            .map((room) => (
                              <SelectItem key={room.id} value={room.id}>
                                Hab. {room.roomNumber} — Piso {room.floor}
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
                        <SelectItem value="none">Sin asignar</SelectItem>
                        {staff.filter(s => s.isActive === "true").map((s) => (
                          <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
              {/* Bloqueo opcional de habitación */}
              {orderForm.watch("roomId") && orderForm.watch("roomId") !== "none" && orderForm.watch("roomId") !== "" && (
                <div className="rounded-lg border border-orange-200 dark:border-orange-800 bg-orange-50 dark:bg-orange-950/30 p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Lock className="h-4 w-4 text-orange-600 dark:text-orange-400" />
                      <span className="text-sm font-medium text-orange-800 dark:text-orange-300">Bloquear habitación en el planning</span>
                    </div>
                    <Switch
                      checked={blockRoom}
                      onCheckedChange={setBlockRoom}
                      data-testid="switch-block-room"
                    />
                  </div>
                  {blockRoom && (
                    <div className="space-y-3 pt-1">
                      <p className="text-xs text-orange-700 dark:text-orange-400">
                        La habitación aparecerá bloqueada en el planning durante el período indicado.
                      </p>
                      <div className="grid grid-cols-2 gap-3">
                        <div className="space-y-1">
                          <Label className="text-xs text-muted-foreground">Desde</Label>
                          <Input
                            type="date"
                            value={blockFrom}
                            onChange={e => setBlockFrom(e.target.value)}
                            data-testid="input-block-from"
                            className="text-sm"
                          />
                        </div>
                        <div className="space-y-1">
                          <Label className="text-xs text-muted-foreground">Hasta</Label>
                          <Input
                            type="date"
                            value={blockTo}
                            onChange={e => setBlockTo(e.target.value)}
                            data-testid="input-block-to"
                            className="text-sm"
                          />
                        </div>
                      </div>
                      {blockFrom && blockTo && blockTo < blockFrom && (
                        <p className="text-xs text-red-600">La fecha de fin debe ser posterior a la de inicio.</p>
                      )}
                    </div>
                  )}
                </div>
              )}
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

      <Dialog open={!!selectedOrder} onOpenChange={() => { setSelectedOrder(null); setDetailBlockEnabled(false); setDetailBlockFrom(""); setDetailBlockTo(""); }}>
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
              {selectedOrder.maintenanceBlock ? (
                <div className="rounded-lg border border-orange-200 dark:border-orange-800 bg-orange-50 dark:bg-orange-950/30 p-3">
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <Lock className="h-4 w-4 text-orange-600 dark:text-orange-400" />
                      <span className="text-sm font-medium text-orange-800 dark:text-orange-300">Habitación bloqueada en el planning</span>
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-destructive hover:text-destructive h-7 px-2 text-xs"
                      onClick={() => {
                        if (confirm("¿Eliminar el bloqueo del planning?")) {
                          removeBlockMutation.mutate(selectedOrder.maintenanceBlock!.id);
                        }
                      }}
                      disabled={removeBlockMutation.isPending}
                    >
                      Eliminar bloqueo
                    </Button>
                  </div>
                  <div className="grid grid-cols-3 gap-2 text-sm">
                    <div>
                      <p className="text-xs text-muted-foreground">Desde</p>
                      <p className="font-medium">{selectedOrder.maintenanceBlock.blockFrom}</p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Hasta</p>
                      <p className="font-medium">{selectedOrder.maintenanceBlock.blockTo}</p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Bloqueado por</p>
                      <p className="font-medium">{selectedOrder.maintenanceBlock.blockedBy}</p>
                    </div>
                  </div>
                </div>
              ) : selectedOrder.roomId ? (
                <div className="rounded-lg border border-dashed border-muted-foreground/30 p-3 space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Lock className="h-4 w-4 text-muted-foreground" />
                      <Label className="text-sm font-medium">Bloquear habitación en el planning</Label>
                    </div>
                    <Switch
                      checked={detailBlockEnabled}
                      onCheckedChange={(v) => { setDetailBlockEnabled(v); setDetailBlockFrom(""); setDetailBlockTo(""); }}
                    />
                  </div>
                  {detailBlockEnabled && (
                    <div className="space-y-2 pt-1">
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <Label className="text-xs text-muted-foreground mb-1 block">Desde</Label>
                          <Input
                            type="date"
                            value={detailBlockFrom}
                            onChange={(e) => setDetailBlockFrom(e.target.value)}
                          />
                        </div>
                        <div>
                          <Label className="text-xs text-muted-foreground mb-1 block">Hasta</Label>
                          <Input
                            type="date"
                            value={detailBlockTo}
                            onChange={(e) => setDetailBlockTo(e.target.value)}
                            min={detailBlockFrom}
                          />
                        </div>
                      </div>
                      {detailBlockFrom && detailBlockTo && detailBlockTo < detailBlockFrom && (
                        <p className="text-xs text-destructive">La fecha de fin debe ser posterior al inicio.</p>
                      )}
                      <Button
                        size="sm"
                        disabled={!detailBlockFrom || !detailBlockTo || detailBlockTo < detailBlockFrom || addBlockMutation.isPending}
                        onClick={() => {
                          checkConflictsAndProceed(
                            selectedOrder.roomId!,
                            detailBlockFrom,
                            detailBlockTo,
                            { type: "add_block", payload: {
                              workOrderId: selectedOrder.id,
                              roomId: selectedOrder.roomId!,
                              blockFrom: detailBlockFrom,
                              blockTo: detailBlockTo,
                              blockedBy: user?.username || "Sistema",
                            }}
                          );
                        }}
                      >
                        <Lock className="mr-2 h-3.5 w-3.5" />
                        {addBlockMutation.isPending ? "Bloqueando..." : "Aplicar bloqueo"}
                      </Button>
                    </div>
                  )}
                </div>
              ) : null}
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

      {/* Dialog de conflictos — se muestra cuando el bloqueo se superpone con reservas activas */}
      <Dialog open={blockConflicts.length > 0} onOpenChange={(open) => { if (!open) { setBlockConflicts([]); setPendingBlockAction(null); } }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-orange-600 dark:text-orange-400">
              <AlertTriangle className="h-5 w-5" />
              Reservas activas en esa habitación
            </DialogTitle>
            <DialogDescription>
              Las siguientes reservas se superponen con el período de bloqueo. Podés confirmar el bloqueo de todas formas o cancelar para reubicar primero a los huéspedes.
            </DialogDescription>
          </DialogHeader>
          <div className="rounded-lg border border-orange-200 dark:border-orange-800 bg-orange-50 dark:bg-orange-950/30 divide-y divide-orange-100 dark:divide-orange-900">
            {blockConflicts.map((c) => (
              <div key={c.id} className="px-3 py-2">
                <p className="font-medium text-sm">{c.guestName || "Sin nombre"}</p>
                <p className="text-xs text-muted-foreground">
                  Check-in: {c.checkInDate} · Check-out: {c.checkOutDate} · <span className="capitalize">{c.status}</span>
                </p>
              </div>
            ))}
          </div>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              variant="outline"
              onClick={() => { setBlockConflicts([]); setPendingBlockAction(null); }}
              data-testid="button-conflict-cancel"
            >
              Cancelar
            </Button>
            <Button
              variant="destructive"
              onClick={() => pendingBlockAction && executeBlockAction(pendingBlockAction)}
              data-testid="button-conflict-confirm"
            >
              Confirmar bloqueo de todas formas
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
