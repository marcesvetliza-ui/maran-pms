import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import {
  Sparkles,
  CheckCircle,
  Play,
  Clock,
  AlertCircle,
  Filter,
  ClipboardCheck,
  Bed,
  Wrench,
  XCircle,
  MoreHorizontal,
  MessageSquare,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
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
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { queryClient, apiRequest } from "@/lib/queryClient";
import type { RoomWithType, RoomStatus, HousekeepingTaskWithRoom } from "@shared/schema";

type TaskStatus = "pending" | "in_progress" | "completed" | "inspected";
type TaskType = "checkout_clean" | "stayover_clean" | "deep_clean" | "inspection" | "turndown" | "maintenance_prep";
type Priority = "low" | "normal" | "high" | "urgent";

const statusConfig: Record<RoomStatus, { label: string; icon: typeof Sparkles; className: string; bgClass: string }> = {
  available: { label: "Disponible", icon: CheckCircle, className: "text-green-600 dark:text-green-400", bgClass: "bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800" },
  occupied: { label: "Ocupada", icon: Bed, className: "text-blue-600 dark:text-blue-400", bgClass: "bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800" },
  dirty: { label: "Sucia", icon: AlertCircle, className: "text-orange-600 dark:text-orange-400", bgClass: "bg-orange-50 dark:bg-orange-900/20 border-orange-200 dark:border-orange-800" },
  cleaning: { label: "Limpiando", icon: Sparkles, className: "text-yellow-600 dark:text-yellow-400", bgClass: "bg-yellow-50 dark:bg-yellow-900/20 border-yellow-200 dark:border-yellow-800" },
  maintenance: { label: "Mantenimiento", icon: Wrench, className: "text-red-600 dark:text-red-400", bgClass: "bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800" },
  oos: { label: "Fuera Servicio", icon: XCircle, className: "text-gray-600 dark:text-gray-400", bgClass: "bg-gray-50 dark:bg-gray-900/20 border-gray-200 dark:border-gray-800" },
};

const taskStatusConfig: Record<TaskStatus, { label: string; className: string }> = {
  pending: { label: "Pendiente", className: "bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-400" },
  in_progress: { label: "En Progreso", className: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400" },
  completed: { label: "Completada", className: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400" },
  inspected: { label: "Inspeccionada", className: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400" },
};

const taskTypeLabels: Record<TaskType, string> = {
  checkout_clean: "Limpieza Check-out",
  stayover_clean: "Limpieza Estancia",
  deep_clean: "Limpieza Profunda",
  inspection: "Inspeccion",
  turndown: "Turndown",
  maintenance_prep: "Prep. Mantenimiento",
};

const priorityConfig: Record<Priority, { label: string; className: string }> = {
  low: { label: "Baja", className: "bg-gray-100 text-gray-800 dark:bg-gray-900/30 dark:text-gray-400" },
  normal: { label: "Normal", className: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400" },
  high: { label: "Alta", className: "bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-400" },
  urgent: { label: "Urgente", className: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400" },
};

function RoomCard({ 
  room, 
  tasks, 
  onStartTask, 
  onCompleteTask,
  onCreateTask,
  onUpdateStatus,
  onOpenDetails,
  onEditBedConfig,
}: { 
  room: RoomWithType;
  tasks: HousekeepingTaskWithRoom[];
  onStartTask: (taskId: string) => void;
  onCompleteTask: (taskId: string) => void;
  onCreateTask: (roomId: string) => void;
  onUpdateStatus: (roomId: string, status: RoomStatus) => void;
  onOpenDetails: (roomId: string) => void;
  onEditBedConfig: (roomId: string, currentConfig: string) => void;
}) {
  const config = statusConfig[room.status];
  const Icon = config.icon;
  const pendingTasks = tasks.filter(t => t.status === "pending" || t.status === "in_progress");
  const hasNotes = tasks.some(t => t.notes);
  
  return (
    <Card className={`${config.bgClass} border transition-all`}>
      <CardContent className="p-3">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <span className="font-bold text-lg">{room.roomNumber}</span>
            <Icon className={`h-4 w-4 ${config.className}`} />
          </div>
          <div className="flex items-center gap-1">
            {hasNotes && (
              <MessageSquare className="h-3 w-3 text-muted-foreground" />
            )}
            <Badge variant="outline" className="text-xs">
              {room.roomType?.code || "N/A"}
            </Badge>
            <Popover>
              <PopoverTrigger asChild>
                <Button 
                  size="icon" 
                  variant="ghost" 
                  className="h-6 w-6"
                  data-testid={`button-room-menu-${room.id}`}
                >
                  <MoreHorizontal className="h-3 w-3" />
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-48 p-2" align="end">
                <div className="space-y-1">
                  <Button 
                    size="sm" 
                    variant="ghost" 
                    className="w-full justify-start h-8 text-xs"
                    onClick={() => onOpenDetails(room.id)}
                    data-testid={`button-details-${room.id}`}
                  >
                    <MessageSquare className="h-3 w-3 mr-2" />
                    Ver Detalles / Notas
                  </Button>
                  <Button 
                    size="sm" 
                    variant="ghost" 
                    className="w-full justify-start h-8 text-xs"
                    onClick={() => onUpdateStatus(room.id, "available")}
                    data-testid={`button-quick-available-${room.id}`}
                  >
                    <CheckCircle className="h-3 w-3 mr-2 text-green-500" />
                    Marcar Disponible
                  </Button>
                  <Button 
                    size="sm" 
                    variant="ghost" 
                    className="w-full justify-start h-8 text-xs"
                    onClick={() => onUpdateStatus(room.id, "dirty")}
                    data-testid={`button-quick-dirty-${room.id}`}
                  >
                    <AlertCircle className="h-3 w-3 mr-2 text-orange-500" />
                    Marcar Sucia
                  </Button>
                  <Button 
                    size="sm" 
                    variant="ghost" 
                    className="w-full justify-start h-8 text-xs"
                    onClick={() => onUpdateStatus(room.id, "maintenance")}
                    data-testid={`button-quick-maintenance-${room.id}`}
                  >
                    <Wrench className="h-3 w-3 mr-2 text-red-500" />
                    Mantenimiento
                  </Button>
                  <Button 
                    size="sm" 
                    variant="ghost" 
                    className="w-full justify-start h-8 text-xs"
                    onClick={() => onEditBedConfig(room.id, room.bedConfig || "")}
                    data-testid={`button-edit-bedconfig-${room.id}`}
                  >
                    <Bed className="h-3 w-3 mr-2 text-blue-500" />
                    Cambiar Camaje {room.bedConfig ? `(${room.bedConfig})` : ""}
                  </Button>
                </div>
              </PopoverContent>
            </Popover>
          </div>
        </div>
        
        <div className="text-xs text-muted-foreground mb-2">
          {config.label}
        </div>
        
        {pendingTasks.length > 0 ? (
          <div className="space-y-1">
            {pendingTasks.map(task => (
              <div key={task.id} className="flex items-center justify-between gap-1">
                <Badge className={`${taskStatusConfig[task.status as TaskStatus].className} text-xs`}>
                  {taskTypeLabels[task.taskType as TaskType] || task.taskType}
                </Badge>
                {task.status === "pending" && (
                  <Button 
                    size="sm" 
                    variant="ghost" 
                    className="h-6 px-2"
                    onClick={() => onStartTask(task.id)}
                    data-testid={`button-start-task-${task.id}`}
                  >
                    <Play className="h-3 w-3" />
                  </Button>
                )}
                {task.status === "in_progress" && (
                  <Button 
                    size="sm" 
                    variant="ghost" 
                    className="h-6 px-2"
                    onClick={() => onCompleteTask(task.id)}
                    data-testid={`button-complete-task-${task.id}`}
                  >
                    <CheckCircle className="h-3 w-3" />
                  </Button>
                )}
              </div>
            ))}
          </div>
        ) : (
          <div className="flex gap-1 flex-wrap">
            {room.status === "dirty" && (
              <>
                <Button 
                  size="sm" 
                  variant="outline" 
                  className="h-6 px-2 text-xs"
                  onClick={() => onUpdateStatus(room.id, "available")}
                  data-testid={`button-mark-clean-${room.id}`}
                >
                  <CheckCircle className="h-3 w-3 mr-1" />
                  Marcar Limpia
                </Button>
                <Button 
                  size="sm" 
                  variant="ghost" 
                  className="h-6 px-2 text-xs"
                  onClick={() => onCreateTask(room.id)}
                  data-testid={`button-create-task-${room.id}`}
                >
                  <Sparkles className="h-3 w-3 mr-1" />
                  Tarea
                </Button>
              </>
            )}
            {room.status === "cleaning" && (
              <Button 
                size="sm" 
                variant="outline" 
                className="h-6 px-2 text-xs"
                onClick={() => onUpdateStatus(room.id, "available")}
                data-testid={`button-finish-clean-${room.id}`}
              >
                <CheckCircle className="h-3 w-3 mr-1" />
                Marcar Limpia
              </Button>
            )}
            {room.status === "available" && (
              <Button 
                size="sm" 
                variant="ghost" 
                className="h-6 px-2 text-xs text-muted-foreground"
                onClick={() => onUpdateStatus(room.id, "dirty")}
                data-testid={`button-mark-dirty-${room.id}`}
              >
                Marcar Sucia
              </Button>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default function Housekeeping() {
  const { toast } = useToast();
  const [floorFilter, setFloorFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [createTaskDialogOpen, setCreateTaskDialogOpen] = useState(false);
  const [detailsDialogOpen, setDetailsDialogOpen] = useState(false);
  const [selectedRoomId, setSelectedRoomId] = useState<string | null>(null);
  const [taskType, setTaskType] = useState<TaskType>("checkout_clean");
  const [priority, setPriority] = useState<Priority>("normal");
  const [notes, setNotes] = useState("");
  const [detailNotes, setDetailNotes] = useState("");

  const { data: rooms, isLoading: roomsLoading } = useQuery<RoomWithType[]>({
    queryKey: ["/api/rooms"],
  });

  const today = new Date().toISOString().split("T")[0];
  const { data: tasks, isLoading: tasksLoading } = useQuery<HousekeepingTaskWithRoom[]>({
    queryKey: ["/api/housekeeping", { date: today }],
  });

  const startTaskMutation = useMutation({
    mutationFn: (taskId: string) => apiRequest("POST", `/api/housekeeping/${taskId}/start`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/housekeeping"] });
      queryClient.invalidateQueries({ queryKey: ["/api/rooms"] });
      toast({ title: "Tarea iniciada", description: "La limpieza ha comenzado." });
    },
    onError: () => {
      toast({ title: "Error", description: "No se pudo iniciar la tarea.", variant: "destructive" });
    },
  });

  const completeTaskMutation = useMutation({
    mutationFn: (taskId: string) => apiRequest("POST", `/api/housekeeping/${taskId}/complete`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/housekeeping"] });
      queryClient.invalidateQueries({ queryKey: ["/api/rooms"] });
      queryClient.invalidateQueries({ queryKey: ["/api/dashboard/stats"] });
      toast({ title: "Tarea completada", description: "La habitacion esta lista." });
    },
    onError: () => {
      toast({ title: "Error", description: "No se pudo completar la tarea.", variant: "destructive" });
    },
  });

  const updateRoomStatusMutation = useMutation({
    mutationFn: ({ roomId, status }: { roomId: string; status: RoomStatus }) => 
      apiRequest("PATCH", `/api/housekeeping/room/${roomId}/status`, { status }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/rooms"] });
      queryClient.invalidateQueries({ queryKey: ["/api/dashboard/stats"] });
      toast({ title: "Estado actualizado" });
    },
    onError: () => {
      toast({ title: "Error", description: "No se pudo actualizar el estado.", variant: "destructive" });
    },
  });

  const createTaskMutation = useMutation({
    mutationFn: (data: { roomId: string; taskType: string; priority: string; notes?: string; scheduledDate: string }) => 
      apiRequest("POST", "/api/housekeeping", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/housekeeping"] });
      setCreateTaskDialogOpen(false);
      setSelectedRoomId(null);
      setNotes("");
      toast({ title: "Tarea creada", description: "La tarea de limpieza ha sido asignada." });
    },
    onError: () => {
      toast({ title: "Error", description: "No se pudo crear la tarea.", variant: "destructive" });
    },
  });

  const floors = rooms ? Array.from(new Set(rooms.map(r => r.floor))).sort((a, b) => a - b) : [];
  
  const filteredRooms = rooms?.filter(room => {
    if (floorFilter !== "all" && room.floor !== parseInt(floorFilter)) return false;
    if (statusFilter !== "all" && room.status !== statusFilter) return false;
    return true;
  }) || [];

  const roomsByFloor = filteredRooms.reduce((acc, room) => {
    if (!acc[room.floor]) acc[room.floor] = [];
    acc[room.floor].push(room);
    return acc;
  }, {} as Record<number, RoomWithType[]>);

  const getTasksForRoom = (roomId: string) => 
    tasks?.filter(t => t.roomId === roomId) || [];

  const stats = rooms ? {
    available: rooms.filter(r => r.status === "available").length,
    occupied: rooms.filter(r => r.status === "occupied").length,
    dirty: rooms.filter(r => r.status === "dirty").length,
    cleaning: rooms.filter(r => r.status === "cleaning").length,
    maintenance: rooms.filter(r => r.status === "maintenance").length,
  } : { available: 0, occupied: 0, dirty: 0, cleaning: 0, maintenance: 0 };

  const handleCreateTask = (roomId: string) => {
    setSelectedRoomId(roomId);
    setCreateTaskDialogOpen(true);
  };

  const handleOpenDetails = (roomId: string) => {
    setSelectedRoomId(roomId);
    const roomTasks = getTasksForRoom(roomId);
    const existingNotes = roomTasks.find(t => t.notes)?.notes || "";
    setDetailNotes(existingNotes);
    setDetailsDialogOpen(true);
  };

  const [bedConfigDialogOpen, setBedConfigDialogOpen] = useState(false);
  const [bedConfigRoomId, setBedConfigRoomId] = useState<string | null>(null);
  const [bedConfigValue, setBedConfigValue] = useState("");

  const bedConfigOptions = [
    { value: "MAT", label: "Matrimonial" },
    { value: "TWIN", label: "Twin (2 camas)" },
    { value: "MAT_CC", label: "Matrimonial + Cama cuna" },
    { value: "TWIN_CC", label: "Twin + Cama cuna" },
    { value: "MAT_EXTRA", label: "Matrimonial + Extra" },
    { value: "MAT_CC_EXTRA", label: "Matrimonial + Cuna + Extra" },
  ];

  const updateBedConfigMutation = useMutation({
    mutationFn: ({ roomId, bedConfig }: { roomId: string; bedConfig: string }) =>
      apiRequest("PATCH", `/api/rooms/${roomId}`, { bedConfig }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/rooms"] });
      setBedConfigDialogOpen(false);
      setBedConfigRoomId(null);
      toast({ title: "Camaje actualizado" });
    },
    onError: () => {
      toast({ title: "Error", description: "No se pudo actualizar el camaje.", variant: "destructive" });
    },
  });

  const handleEditBedConfig = (roomId: string, currentConfig: string) => {
    setBedConfigRoomId(roomId);
    setBedConfigValue(currentConfig || "");
    setBedConfigDialogOpen(true);
  };

  const selectedRoom = rooms?.find(r => r.id === selectedRoomId);
  const selectedRoomTasks = selectedRoomId ? getTasksForRoom(selectedRoomId) : [];

  const handleSubmitTask = () => {
    if (!selectedRoomId) return;
    createTaskMutation.mutate({
      roomId: selectedRoomId,
      taskType,
      priority,
      notes: notes || undefined,
      scheduledDate: today,
    });
  };

  if (roomsLoading || tasksLoading) {
    return (
      <div className="p-6 space-y-6">
        <Skeleton className="h-8 w-48" />
        <div className="grid grid-cols-4 gap-4">
          {[1, 2, 3, 4].map(i => <Skeleton key={i} className="h-24" />)}
        </div>
        <div className="grid grid-cols-7 gap-3">
          {Array(14).fill(0).map((_, i) => <Skeleton key={i} className="h-32" />)}
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div className="flex items-center gap-2">
          <ClipboardCheck className="h-6 w-6 text-muted-foreground" />
          <h1 className="text-2xl font-bold" data-testid="text-page-title">Housekeeping</h1>
        </div>
        
        <div className="flex items-center gap-2">
          <Filter className="h-4 w-4 text-muted-foreground" />
          <Select value={floorFilter} onValueChange={setFloorFilter}>
            <SelectTrigger className="w-32" data-testid="select-floor-filter">
              <SelectValue placeholder="Piso" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos los pisos</SelectItem>
              {floors.map(floor => (
                <SelectItem key={floor} value={floor.toString()}>Piso {floor}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-40" data-testid="select-status-filter">
              <SelectValue placeholder="Estado" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos los estados</SelectItem>
              <SelectItem value="available">Disponible</SelectItem>
              <SelectItem value="occupied">Ocupada</SelectItem>
              <SelectItem value="dirty">Sucia</SelectItem>
              <SelectItem value="cleaning">Limpiando</SelectItem>
              <SelectItem value="maintenance">Mantenimiento</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2">
              <CheckCircle className="h-5 w-5 text-green-500" />
              <div>
                <p className="text-2xl font-bold" data-testid="stat-available">{stats.available}</p>
                <p className="text-xs text-muted-foreground">Disponibles</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2">
              <Bed className="h-5 w-5 text-blue-500" />
              <div>
                <p className="text-2xl font-bold" data-testid="stat-occupied">{stats.occupied}</p>
                <p className="text-xs text-muted-foreground">Ocupadas</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2">
              <AlertCircle className="h-5 w-5 text-orange-500" />
              <div>
                <p className="text-2xl font-bold" data-testid="stat-dirty">{stats.dirty}</p>
                <p className="text-xs text-muted-foreground">Sucias</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-yellow-500" />
              <div>
                <p className="text-2xl font-bold" data-testid="stat-cleaning">{stats.cleaning}</p>
                <p className="text-xs text-muted-foreground">Limpiando</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2">
              <Wrench className="h-5 w-5 text-red-500" />
              <div>
                <p className="text-2xl font-bold" data-testid="stat-maintenance">{stats.maintenance}</p>
                <p className="text-xs text-muted-foreground">Mantenimiento</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {Object.entries(roomsByFloor)
        .sort(([a], [b]) => parseInt(a) - parseInt(b))
        .map(([floor, floorRooms]) => (
          <div key={floor} className="space-y-3">
            <h2 className="text-lg font-semibold flex items-center gap-2">
              <Clock className="h-4 w-4 text-muted-foreground" />
              Piso {floor}
            </h2>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-7 gap-3">
              {floorRooms
                .sort((a, b) => a.roomNumber.localeCompare(b.roomNumber))
                .map(room => (
                  <RoomCard
                    key={room.id}
                    room={room}
                    tasks={getTasksForRoom(room.id)}
                    onStartTask={(taskId) => startTaskMutation.mutate(taskId)}
                    onCompleteTask={(taskId) => completeTaskMutation.mutate(taskId)}
                    onCreateTask={handleCreateTask}
                    onUpdateStatus={(roomId, status) => 
                      updateRoomStatusMutation.mutate({ roomId, status })
                    }
                    onOpenDetails={handleOpenDetails}
                    onEditBedConfig={handleEditBedConfig}
                  />
                ))}
            </div>
          </div>
        ))}

      <Dialog open={createTaskDialogOpen} onOpenChange={setCreateTaskDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Crear Tarea de Limpieza</DialogTitle>
            <DialogDescription>
              Asignar una nueva tarea para la habitacion {rooms?.find(r => r.id === selectedRoomId)?.roomNumber}
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Tipo de Tarea</Label>
              <Select value={taskType} onValueChange={(v) => setTaskType(v as TaskType)}>
                <SelectTrigger data-testid="select-task-type">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="checkout_clean">Limpieza Check-out</SelectItem>
                  <SelectItem value="stayover_clean">Limpieza Estancia</SelectItem>
                  <SelectItem value="deep_clean">Limpieza Profunda</SelectItem>
                  <SelectItem value="inspection">Inspeccion</SelectItem>
                  <SelectItem value="turndown">Turndown</SelectItem>
                  <SelectItem value="maintenance_prep">Prep. Mantenimiento</SelectItem>
                </SelectContent>
              </Select>
            </div>
            
            <div className="space-y-2">
              <Label>Prioridad</Label>
              <Select value={priority} onValueChange={(v) => setPriority(v as Priority)}>
                <SelectTrigger data-testid="select-priority">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="low">Baja</SelectItem>
                  <SelectItem value="normal">Normal</SelectItem>
                  <SelectItem value="high">Alta</SelectItem>
                  <SelectItem value="urgent">Urgente</SelectItem>
                </SelectContent>
              </Select>
            </div>
            
            <div className="space-y-2">
              <Label>Notas (opcional)</Label>
              <Textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Instrucciones adicionales..."
                data-testid="input-notes"
              />
            </div>
          </div>
          
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateTaskDialogOpen(false)}>
              Cancelar
            </Button>
            <Button 
              onClick={handleSubmitTask} 
              disabled={createTaskMutation.isPending}
              data-testid="button-submit-task"
            >
              {createTaskMutation.isPending ? "Creando..." : "Crear Tarea"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={detailsDialogOpen} onOpenChange={setDetailsDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Habitacion {selectedRoom?.roomNumber}</DialogTitle>
            <DialogDescription>
              {selectedRoom?.roomType?.name} - {statusConfig[selectedRoom?.status || "available"].label}
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4">
            <div className="space-y-2">
              <Label className="text-sm font-medium">Estado Actual</Label>
              <div className="flex gap-2 flex-wrap">
                <Button 
                  size="sm" 
                  variant={selectedRoom?.status === "available" ? "default" : "outline"}
                  onClick={() => {
                    if (selectedRoomId) {
                      updateRoomStatusMutation.mutate({ roomId: selectedRoomId, status: "available" });
                    }
                  }}
                  data-testid="button-detail-available"
                >
                  <CheckCircle className="h-3 w-3 mr-1" />
                  Disponible
                </Button>
                <Button 
                  size="sm" 
                  variant={selectedRoom?.status === "dirty" ? "default" : "outline"}
                  onClick={() => {
                    if (selectedRoomId) {
                      updateRoomStatusMutation.mutate({ roomId: selectedRoomId, status: "dirty" });
                    }
                  }}
                  data-testid="button-detail-dirty"
                >
                  <AlertCircle className="h-3 w-3 mr-1" />
                  Sucia
                </Button>
                <Button 
                  size="sm" 
                  variant={selectedRoom?.status === "maintenance" ? "default" : "outline"}
                  onClick={() => {
                    if (selectedRoomId) {
                      updateRoomStatusMutation.mutate({ roomId: selectedRoomId, status: "maintenance" });
                    }
                  }}
                  data-testid="button-detail-maintenance"
                >
                  <Wrench className="h-3 w-3 mr-1" />
                  Mantenimiento
                </Button>
              </div>
            </div>

            {selectedRoomTasks.length > 0 && (
              <div className="space-y-2">
                <Label className="text-sm font-medium">Tareas de Hoy</Label>
                <div className="space-y-2">
                  {selectedRoomTasks.map(task => (
                    <div key={task.id} className="flex items-center justify-between p-2 rounded-md bg-muted/50">
                      <div>
                        <Badge className={`${taskStatusConfig[task.status as TaskStatus].className} text-xs`}>
                          {taskTypeLabels[task.taskType as TaskType]}
                        </Badge>
                        <Badge className={`${priorityConfig[task.priority as Priority].className} text-xs ml-1`}>
                          {priorityConfig[task.priority as Priority].label}
                        </Badge>
                        {task.notes && (
                          <p className="text-xs text-muted-foreground mt-1">{task.notes}</p>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="space-y-2">
              <Label className="text-sm font-medium">Agregar Nota Rapida</Label>
              <Textarea
                value={detailNotes}
                onChange={(e) => setDetailNotes(e.target.value)}
                placeholder="Observaciones, problemas, solicitudes especiales..."
                className="text-sm"
                data-testid="input-detail-notes"
              />
              <Button 
                size="sm" 
                variant="outline"
                onClick={() => {
                  if (selectedRoomId && detailNotes.trim()) {
                    createTaskMutation.mutate({
                      roomId: selectedRoomId,
                      taskType: "inspection",
                      priority: "normal",
                      notes: detailNotes,
                      scheduledDate: today,
                    });
                    setDetailsDialogOpen(false);
                  }
                }}
                disabled={!detailNotes.trim()}
                data-testid="button-save-note"
              >
                <MessageSquare className="h-3 w-3 mr-1" />
                Guardar como Tarea
              </Button>
            </div>
          </div>
          
          <DialogFooter>
            <Button variant="outline" onClick={() => setDetailsDialogOpen(false)}>
              Cerrar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={bedConfigDialogOpen} onOpenChange={setBedConfigDialogOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Cambiar Camaje</DialogTitle>
            <DialogDescription>
              Habitación {rooms?.find(r => r.id === bedConfigRoomId)?.roomNumber || ""}
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-3 py-2">
            <Label>Tipo de camaje</Label>
            <Select value={bedConfigValue} onValueChange={setBedConfigValue}>
              <SelectTrigger data-testid="select-bed-config-housekeeping">
                <SelectValue placeholder="Seleccionar camaje" />
              </SelectTrigger>
              <SelectContent>
                {bedConfigOptions.map(opt => (
                  <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setBedConfigDialogOpen(false)}>
              Cancelar
            </Button>
            <Button
              onClick={() => bedConfigRoomId && updateBedConfigMutation.mutate({ roomId: bedConfigRoomId, bedConfig: bedConfigValue })}
              disabled={updateBedConfigMutation.isPending}
              data-testid="button-save-bed-config"
            >
              {updateBedConfigMutation.isPending ? "Guardando..." : "Guardar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
