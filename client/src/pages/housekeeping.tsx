import { useState, useEffect, useRef, useCallback } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { useAuth } from "@/App";
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
  Package,
  Search,
  Pencil,
  Plus,
  LogIn,
  LogOut,
  Smartphone,
  LayoutGrid,
  ChevronRight,
  Star,
  Timer,
  StopCircle,
  Boxes,
  RotateCcw,
  CheckCheck,
  Trash2,
  Users,
  CalendarClock,
  X,
  Ban,
  ShieldCheck,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
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
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { queryClient, apiRequest } from "@/lib/queryClient";
import type { RoomWithType, RoomStatus, HousekeepingTaskWithRoom, LostFoundItem, InsertLostFound, Guest, LoanItem, ItemLoanWithItem } from "@shared/schema";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";

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
  limpia_ocupada: { label: "Limpia ocupada", icon: ShieldCheck, className: "text-emerald-600 dark:text-emerald-400", bgClass: "bg-emerald-50 dark:bg-emerald-900/20 border-emerald-200 dark:border-emerald-800 border-dashed" },
  no_molestar: { label: "No molestar", icon: Ban, className: "text-purple-600 dark:text-purple-400", bgClass: "bg-purple-50 dark:bg-purple-900/20 border-purple-200 dark:border-purple-800" },
  inspected: { label: "Inspeccionada", icon: ShieldCheck, className: "text-teal-600 dark:text-teal-400", bgClass: "bg-teal-50 dark:bg-teal-900/20 border-teal-200 dark:border-teal-800" },
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
  isOccupied,
  onStartTask, 
  onCompleteTask,
  onCreateTask,
  onUpdateStatus,
  onOpenDetails,
  onEditBedConfig,
}: { 
  room: RoomWithType;
  tasks: HousekeepingTaskWithRoom[];
  isOccupied: boolean;
  onStartTask: (taskId: string) => void;
  onCompleteTask: (taskId: string) => void;
  onCreateTask: (roomId: string) => void;
  onUpdateStatus: (roomId: string, status: RoomStatus) => void;
  onOpenDetails: (roomId: string) => void;
  onEditBedConfig: (roomId: string, currentConfig: string) => void;
}) {
  const [, navigate] = useLocation();
  const config = statusConfig[room.status];
  const Icon = config.icon;
  const pendingTasks = tasks.filter(t => t.status === "pending" || t.status === "in_progress");
  const hasNotes = tasks.some(t => t.notes);
  const taskWithNote = tasks.find(t => t.notes && (t.status === "pending" || t.status === "in_progress"));
  
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
                    onClick={() => onUpdateStatus(room.id, isOccupied ? "limpia_ocupada" : "available")}
                    data-testid={`button-quick-available-${room.id}`}
                  >
                    <CheckCircle className="h-3 w-3 mr-2 text-green-500" />
                    Marcar Limpia
                  </Button>
                  {isOccupied && (
                    <Button
                      size="sm"
                      variant="ghost"
                      className="w-full justify-start h-8 text-xs"
                      onClick={() => onUpdateStatus(room.id, "no_molestar")}
                      data-testid={`button-quick-no-molestar-${room.id}`}
                    >
                      <Ban className="h-3 w-3 mr-2 text-purple-500" />
                      No molestar
                    </Button>
                  )}
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
                    onClick={() => {
                      onUpdateStatus(room.id, "maintenance");
                      navigate(`/maintenance?newOrder=${room.id}&roomNumber=${encodeURIComponent(room.roomNumber)}`);
                    }}
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
                onClick={() => onUpdateStatus(room.id, isOccupied ? "limpia_ocupada" : "available")}
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
            {(room.status === "occupied" || room.status === "no_molestar") && (
              <Button
                size="sm"
                variant="outline"
                className="h-6 px-2 text-xs border-emerald-400 text-emerald-700"
                onClick={() => onUpdateStatus(room.id, "limpia_ocupada")}
                data-testid={`button-limpia-ocupada-${room.id}`}
              >
                <ShieldCheck className="h-3 w-3 mr-1" />
                Limpia ocupada
              </Button>
            )}
            {(room.status === "occupied" || room.status === "limpia_ocupada") && (
              <Button
                size="sm"
                variant="outline"
                className="h-6 px-2 text-xs border-purple-400 text-purple-700"
                onClick={() => onUpdateStatus(room.id, "no_molestar")}
                data-testid={`button-no-molestar-${room.id}`}
              >
                <Ban className="h-3 w-3 mr-1" />
                No molestar
              </Button>
            )}
            {(room.status === "limpia_ocupada" || room.status === "no_molestar") && (
              <Button
                size="sm"
                variant="ghost"
                className="h-6 px-2 text-xs text-muted-foreground"
                onClick={() => onUpdateStatus(room.id, "occupied")}
                data-testid={`button-back-occupied-${room.id}`}
              >
                Quitar estado
              </Button>
            )}
          </div>
        )}
        {taskWithNote?.notes && (
          <div
            className="flex items-start gap-1 mt-1 text-xs text-muted-foreground italic"
            title={taskWithNote.notes}
          >
            <MessageSquare className="h-3 w-3 shrink-0 mt-0.5" />
            <span className="line-clamp-1">{taskWithNote.notes}</span>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ===================== LOST & FOUND =====================

const LF_STATUS_CONFIG: Record<string, { label: string; className: string }> = {
  en_custodia: { label: "En custodia", className: "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300" },
  contactado:  { label: "Contactado",  className: "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300" },
  entregado:   { label: "Entregado",   className: "bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300" },
  descartado:  { label: "Descartado",  className: "bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400" },
};

const LF_CATEGORY_ICON: Record<string, string> = {
  ropa: "👔", electronica: "📱", documento: "📄", accesorio: "💍", otro: "📦",
};

const LF_CATEGORY_LABEL: Record<string, string> = {
  ropa: "Ropa", electronica: "Electrónica", documento: "Documento", accesorio: "Accesorio", otro: "Otro",
};

function LostFoundCard({
  item,
  guestName,
  onEdit,
  onDeliver,
  onStatusChange,
}: {
  item: LostFoundItem;
  guestName?: string;
  onEdit: () => void;
  onDeliver: () => void;
  onStatusChange: (status: string) => void;
}) {
  const cfg = LF_STATUS_CONFIG[item.status] || LF_STATUS_CONFIG.en_custodia;
  const daysInCustody = Math.floor((Date.now() - new Date(item.foundDate + "T12:00:00").getTime()) / 86400000);

  return (
    <div className="flex items-start justify-between p-4 border rounded-lg hover:bg-muted/30 transition-colors" data-testid={`lost-found-card-${item.id}`}>
      <div className="flex items-start gap-3 min-w-0">
        <span className="text-2xl mt-0.5 shrink-0">{LF_CATEGORY_ICON[item.category] || "📦"}</span>
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-medium">{item.description}</span>
            <Badge className={`${cfg.className} border-0 text-xs`}>{cfg.label}</Badge>
            {daysInCustody > 30 && item.status === "en_custodia" && (
              <Badge variant="destructive" className="text-xs">+30 días</Badge>
            )}
          </div>
          <div className="text-sm text-muted-foreground mt-0.5">
            <span className="font-mono">{item.codigo}</span>
            {" · "}{item.location}
            {" · "}{new Date(item.foundDate + "T12:00:00").toLocaleDateString("es-AR")}
            {" · "}Encontrado por: {item.foundBy}
          </div>
          {guestName && (
            <p className="text-xs text-primary font-medium mt-0.5">👤 Huésped: {guestName}</p>
          )}
          {item.storageLocation && (
            <p className="text-xs text-muted-foreground">Guardado en: {item.storageLocation}</p>
          )}
          {item.notes && (
            <p className="text-xs text-muted-foreground italic mt-0.5">{item.notes}</p>
          )}
          {item.status === "entregado" && item.claimedBy && (
            <p className="text-xs text-green-600 dark:text-green-400 mt-0.5">
              Entregado a: {item.claimedBy}{item.claimedDate && ` · ${new Date(item.claimedDate + "T12:00:00").toLocaleDateString("es-AR")}`}
            </p>
          )}
        </div>
      </div>
      <div className="flex items-center gap-1 ml-4 shrink-0">
        {item.status === "en_custodia" && (
          <Button size="sm" variant="outline" onClick={() => onStatusChange("contactado")} data-testid={`button-contacted-${item.id}`}>
            Contactado
          </Button>
        )}
        {(item.status === "en_custodia" || item.status === "contactado") && (
          <Button size="sm" onClick={onDeliver} data-testid={`button-deliver-${item.id}`}>
            Entregar
          </Button>
        )}
        <Button size="icon" variant="ghost" onClick={onEdit} data-testid={`button-edit-lf-${item.id}`}>
          <Pencil className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}

function LostFoundForm({
  item,
  open,
  onOpenChange,
  onSubmit,
  isPending,
}: {
  item: LostFoundItem | null;
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onSubmit: (data: Partial<InsertLostFound>) => void;
  isPending: boolean;
}) {
  const today = new Date().toLocaleDateString("en-CA", { timeZone: "America/Argentina/Buenos_Aires" });
  const [description, setDescription] = useState(item?.description || "");
  const [category, setCategory] = useState<string>(item?.category || "otro");
  const [location, setLocation] = useState(item?.location || "");
  const [foundDate, setFoundDate] = useState(item?.foundDate || today);
  const [foundBy, setFoundBy] = useState(item?.foundBy || "");
  const [storageLocation, setStorageLocation] = useState(item?.storageLocation || "");
  const [notes, setNotes] = useState(item?.notes || "");
  const [guestId, setGuestId] = useState<string | null>(item?.guestId || null);
  const [selectedGuest, setSelectedGuest] = useState<Guest | null>(null);
  const [guestSearch, setGuestSearch] = useState("");
  const [guestPopoverOpen, setGuestPopoverOpen] = useState(false);
  const [selectedRoomId, setSelectedRoomId] = useState<string>("");

  const { data: guests = [] } = useQuery<Guest[]>({ queryKey: ["/api/guests"] });
  const { data: rooms = [] } = useQuery<RoomWithType[]>({ queryKey: ["/api/rooms"] });

  // Cuando se edita un item ya existente con guestId, mostramos el huésped cargado
  const displayedGuest = selectedGuest || (guestId ? guests.find(g => g.id === guestId) || null : null);

  const filteredGuests = guests.filter(g => {
    const q = guestSearch.toLowerCase();
    return (
      g.firstName.toLowerCase().includes(q) ||
      g.lastName.toLowerCase().includes(q) ||
      (g.documentNumber || "").toLowerCase().includes(q)
    );
  }).slice(0, 20);

  const handleSelectGuest = (g: Guest) => {
    setSelectedGuest(g);
    setGuestId(g.id);
    setGuestSearch("");
    setGuestPopoverOpen(false);
  };

  const handleRoomChange = (roomId: string) => {
    setSelectedRoomId(roomId);
    const room = rooms.find(r => r.id === roomId);
    if (room && !location) {
      setLocation(`Hab. ${room.roomNumber}`);
    }
  };

  const handleSubmit = () => {
    if (!description.trim() || !location.trim() || !foundDate || !foundBy.trim()) return;
    onSubmit({
      description: description.trim(),
      category: category as any,
      location: location.trim(),
      foundDate,
      foundBy: foundBy.trim(),
      storageLocation: storageLocation.trim() || undefined,
      notes: notes.trim() || undefined,
      guestId: guestId || undefined,
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{item ? "Editar objeto" : "Registrar objeto perdido"}</DialogTitle>
          <DialogDescription>
            {item ? `Código: ${item.codigo}` : "El código se generará automáticamente"}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3 py-2">
          <div>
            <Label>Descripción *</Label>
            <Input value={description} onChange={e => setDescription(e.target.value)} placeholder="Ej: Notebook Dell negra, Pasaporte argentino..." data-testid="input-lf-description" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Categoría *</Label>
              <Select value={category} onValueChange={setCategory}>
                <SelectTrigger data-testid="select-lf-category"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Object.entries(LF_CATEGORY_LABEL).map(([v, l]) => (
                    <SelectItem key={v} value={v}>{LF_CATEGORY_ICON[v]} {l}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Fecha encontrado *</Label>
              <Input type="date" value={foundDate} onChange={e => setFoundDate(e.target.value)} data-testid="input-lf-date" />
            </div>
          </div>

          {/* Huésped asociado */}
          <div>
            <Label>Huésped asociado</Label>
            {displayedGuest ? (
              <div className="flex items-center gap-2 mt-1 p-2 border rounded-md bg-muted/40">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{displayedGuest.lastName} {displayedGuest.firstName}</p>
                  {displayedGuest.documentNumber && (
                    <p className="text-xs text-muted-foreground">DNI/Pasaporte: {displayedGuest.documentNumber}</p>
                  )}
                </div>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  className="h-7 px-2 text-destructive shrink-0"
                  onClick={() => { setSelectedGuest(null); setGuestId(null); }}
                  data-testid="button-lf-clear-guest"
                >
                  <XCircle className="h-4 w-4" />
                </Button>
              </div>
            ) : (
              <div className="relative mt-1">
                <div className="relative">
                  <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground pointer-events-none" />
                  <Input
                    placeholder="Buscar huésped por nombre o DNI..."
                    value={guestSearch}
                    onChange={e => { setGuestSearch(e.target.value); setGuestPopoverOpen(e.target.value.length > 0); }}
                    onFocus={() => { if (guestSearch.length > 0) setGuestPopoverOpen(true); }}
                    onBlur={() => setTimeout(() => setGuestPopoverOpen(false), 300)}
                    className="pl-8"
                    data-testid="input-lf-guest-search"
                  />
                </div>
                {guestPopoverOpen && filteredGuests.length > 0 && (
                  <div className="absolute z-50 w-full mt-1 border rounded-md bg-popover shadow-md max-h-52 overflow-y-auto">
                    {filteredGuests.map(g => (
                      <button
                        key={g.id}
                        type="button"
                        className="w-full text-left px-3 py-2 hover:bg-accent text-sm"
                        onMouseDown={(e) => e.preventDefault()}
                        onClick={() => handleSelectGuest(g)}
                        data-testid={`item-lf-guest-${g.id}`}
                      >
                        <p className="font-medium">{g.lastName} {g.firstName}</p>
                        {g.documentNumber && (
                          <p className="text-xs text-muted-foreground">DNI/Pas: {g.documentNumber}</p>
                        )}
                      </button>
                    ))}
                  </div>
                )}
                {guestPopoverOpen && guestSearch.length > 0 && filteredGuests.length === 0 && (
                  <div className="absolute z-50 w-full mt-1 border rounded-md bg-popover shadow-md px-3 py-2 text-sm text-muted-foreground">
                    No se encontraron huéspedes
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Habitación donde se hospedaba */}
          <div>
            <Label>Habitación donde se hospedaba</Label>
            <Select value={selectedRoomId} onValueChange={handleRoomChange}>
              <SelectTrigger data-testid="select-lf-room" className="mt-1">
                <SelectValue placeholder="Seleccionar habitación..." />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__none__">Sin especificar</SelectItem>
                {rooms
                  .slice()
                  .sort((a, b) => parseInt(a.roomNumber) - parseInt(b.roomNumber))
                  .filter(r => r.id)
                  .map(r => (
                    <SelectItem key={r.id} value={r.id}>
                      Hab. {r.roomNumber} — Piso {r.floor}
                      {(r as any).roomType?.name ? ` · ${(r as any).roomType.name}` : ""}
                    </SelectItem>
                  ))}
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label>Lugar donde fue encontrado *</Label>
            <Input
              value={location}
              onChange={e => setLocation(e.target.value)}
              placeholder="Ej: Hab. 305, Lobby, Restaurant..."
              data-testid="input-lf-location"
            />
          </div>
          <div>
            <Label>Encontrado por *</Label>
            <Input value={foundBy} onChange={e => setFoundBy(e.target.value)} placeholder="Nombre del empleado" data-testid="input-lf-found-by" />
          </div>
          <div>
            <Label>Lugar de custodia</Label>
            <Input value={storageLocation} onChange={e => setStorageLocation(e.target.value)} placeholder="Ej: Depósito, Recepción..." data-testid="input-lf-storage" />
          </div>
          <div>
            <Label>Notas</Label>
            <Textarea value={notes} onChange={e => setNotes(e.target.value)} placeholder="Observaciones adicionales..." rows={2} data-testid="input-lf-notes" />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={handleSubmit} disabled={isPending || !description.trim() || !location.trim() || !foundDate || !foundBy.trim()} data-testid="button-lf-save">
            {isPending ? "Guardando..." : item ? "Guardar cambios" : "Registrar objeto"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function DeliveryDialog({
  item,
  open,
  onOpenChange,
  onConfirm,
  isPending,
}: {
  item: LostFoundItem;
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onConfirm: (data: { status: string; claimedBy: string; claimedDate: string; deliveryType: string; deliveredBy: string; notes?: string }) => void;
  isPending: boolean;
}) {
  const today = new Date().toLocaleDateString("en-CA", { timeZone: "America/Argentina/Buenos_Aires" });
  const [claimedBy, setClaimedBy] = useState("");
  const [claimedDate, setClaimedDate] = useState(today);
  const [deliveryType, setDeliveryType] = useState("retiro_hotel");
  const [deliveredBy, setDeliveredBy] = useState("");
  const [notes, setNotes] = useState("");

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Registrar entrega</DialogTitle>
          <DialogDescription>{item.description} · {item.codigo}</DialogDescription>
        </DialogHeader>
        <div className="space-y-3 py-2">
          <div>
            <Label>Retirado por *</Label>
            <Input value={claimedBy} onChange={e => setClaimedBy(e.target.value)} placeholder="Nombre de quien retira" data-testid="input-delivery-claimed-by" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Fecha de retiro *</Label>
              <Input type="date" value={claimedDate} onChange={e => setClaimedDate(e.target.value)} data-testid="input-delivery-date" />
            </div>
            <div>
              <Label>Tipo de entrega</Label>
              <Select value={deliveryType} onValueChange={setDeliveryType}>
                <SelectTrigger data-testid="select-delivery-type"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="retiro_hotel">Retiro en hotel</SelectItem>
                  <SelectItem value="envio">Envío</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div>
            <Label>Entregado por (operador)</Label>
            <Input value={deliveredBy} onChange={e => setDeliveredBy(e.target.value)} placeholder="Nombre del empleado que entrega" data-testid="input-delivery-by" />
          </div>
          <div>
            <Label>Notas</Label>
            <Textarea value={notes} onChange={e => setNotes(e.target.value)} placeholder="Observaciones..." rows={2} data-testid="input-delivery-notes" />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button
            onClick={() => onConfirm({ status: "entregado", claimedBy, claimedDate, deliveryType, deliveredBy, notes: notes || undefined })}
            disabled={isPending || !claimedBy.trim() || !claimedDate}
            data-testid="button-delivery-confirm"
          >
            {isPending ? "Procesando..." : "Confirmar entrega"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function LostFoundTab() {
  const { toast } = useToast();
  const [showForm, setShowForm] = useState(false);
  const [editingItem, setEditingItem] = useState<LostFoundItem | null>(null);
  const [statusFilter, setStatusFilter] = useState<string>("activos");
  const [categoryFilter, setCategoryFilter] = useState<string>("todos");
  const [searchText, setSearchText] = useState("");
  const [showDeliveryDialog, setShowDeliveryDialog] = useState(false);
  const [deliveringItem, setDeliveringItem] = useState<LostFoundItem | null>(null);

  const { data: items = [], isLoading } = useQuery<LostFoundItem[]>({
    queryKey: ["/api/lost-found", statusFilter, categoryFilter, searchText],
    queryFn: () => {
      const params = new URLSearchParams();
      if (statusFilter !== "activos" && statusFilter !== "todos") params.set("status", statusFilter);
      if (categoryFilter !== "todos") params.set("category", categoryFilter);
      if (searchText) params.set("search", searchText);
      return fetch(`/api/lost-found?${params}`).then(r => r.json());
    },
  });

  const { data: allGuests = [] } = useQuery<Guest[]>({ queryKey: ["/api/guests"] });

  const visibleItems = statusFilter === "activos"
    ? items.filter(i => i.status === "en_custodia" || i.status === "contactado")
    : items;

  const createMutation = useMutation({
    mutationFn: (data: Partial<InsertLostFound>) =>
      apiRequest("POST", "/api/lost-found", data).then(r => r.json()),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/lost-found"] });
      setShowForm(false);
      toast({ title: "Objeto registrado exitosamente" });
    },
    onError: () => toast({ title: "Error al registrar", variant: "destructive" }),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, ...data }: { id: string } & Partial<InsertLostFound>) =>
      apiRequest("PATCH", `/api/lost-found/${id}`, data).then(r => r.json()),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/lost-found"] });
      setShowForm(false);
      setEditingItem(null);
      toast({ title: "Objeto actualizado" });
    },
    onError: () => toast({ title: "Error al actualizar", variant: "destructive" }),
  });

  const updateStatusMutation = useMutation({
    mutationFn: ({ id, ...data }: { id: string; status: string; claimedBy?: string; claimedDate?: string; deliveryType?: string; deliveredBy?: string; notes?: string }) =>
      apiRequest("PATCH", `/api/lost-found/${id}/status`, data).then(r => r.json()),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/lost-found"] });
      setShowDeliveryDialog(false);
      setDeliveringItem(null);
      toast({ title: "Estado actualizado" });
    },
    onError: () => toast({ title: "Error al actualizar estado", variant: "destructive" }),
  });

  return (
    <div className="space-y-4 mt-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2 flex-1 flex-wrap">
          <div className="relative flex-1 min-w-48 max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Buscar por descripción, lugar, código..."
              value={searchText}
              onChange={e => setSearchText(e.target.value)}
              className="pl-9"
              data-testid="input-lf-search"
            />
          </div>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-36" data-testid="select-lf-status">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="activos">Activos</SelectItem>
              <SelectItem value="en_custodia">En custodia</SelectItem>
              <SelectItem value="contactado">Contactado</SelectItem>
              <SelectItem value="entregado">Entregados</SelectItem>
              <SelectItem value="descartado">Descartados</SelectItem>
              <SelectItem value="todos">Todos</SelectItem>
            </SelectContent>
          </Select>
          <Select value={categoryFilter} onValueChange={setCategoryFilter}>
            <SelectTrigger className="w-36" data-testid="select-lf-category">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="todos">Todas categorías</SelectItem>
              {Object.entries(LF_CATEGORY_LABEL).map(([v, l]) => (
                <SelectItem key={v} value={v}>{LF_CATEGORY_ICON[v]} {l}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <Button onClick={() => { setEditingItem(null); setShowForm(true); }} data-testid="button-lf-new">
          <Plus className="h-4 w-4 mr-1" /> Registrar objeto
        </Button>
      </div>

      {isLoading ? (
        <div className="space-y-2">
          {[...Array(3)].map((_, i) => <Skeleton key={i} className="h-20 w-full rounded-lg" />)}
        </div>
      ) : visibleItems.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground">
          <Package className="h-12 w-12 mx-auto mb-3 opacity-30" />
          <p className="text-sm font-medium">No hay objetos registrados</p>
          <p className="text-xs mt-1">Los objetos encontrados en el hotel aparecerán aquí</p>
        </div>
      ) : (
        <div className="space-y-2">
          {visibleItems.map(item => {
            const guest = item.guestId ? allGuests.find(g => g.id === item.guestId) : undefined;
            return (
              <LostFoundCard
                key={item.id}
                item={item}
                guestName={guest ? `${guest.lastName} ${guest.firstName}` : undefined}
                onEdit={() => { setEditingItem(item); setShowForm(true); }}
                onDeliver={() => { setDeliveringItem(item); setShowDeliveryDialog(true); }}
                onStatusChange={status => updateStatusMutation.mutate({ id: item.id, status })}
              />
            );
          })}
        </div>
      )}

      {showForm && (
        <LostFoundForm
          key={editingItem?.id ?? "new"}
          item={editingItem}
          open={showForm}
          onOpenChange={setShowForm}
          isPending={createMutation.isPending || updateMutation.isPending}
          onSubmit={data => {
            if (editingItem) {
              updateMutation.mutate({ id: editingItem.id, ...data });
            } else {
              createMutation.mutate(data);
            }
          }}
        />
      )}

      {showDeliveryDialog && deliveringItem && (
        <DeliveryDialog
          item={deliveringItem}
          open={showDeliveryDialog}
          onOpenChange={setShowDeliveryDialog}
          isPending={updateStatusMutation.isPending}
          onConfirm={data => updateStatusMutation.mutate({ id: deliveringItem.id, ...data })}
        />
      )}
    </div>
  );
}

// ===================== MOBILE ROOM CARD =====================

// ─── Elapsed time hook ────────────────────────────────────────────────────────
function useElapsedTime(startedAt: Date | string | null | undefined): string {
  const [elapsed, setElapsed] = useState(0);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (!startedAt) { setElapsed(0); return; }
    const start = new Date(startedAt).getTime();
    const tick = () => setElapsed(Math.floor((Date.now() - start) / 1000));
    tick();
    intervalRef.current = setInterval(tick, 1000);
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, [startedAt]);

  const m = Math.floor(elapsed / 60).toString().padStart(2, "0");
  const s = (elapsed % 60).toString().padStart(2, "0");
  return `${m}:${s}`;
}

// ─── Pending action type ───────────────────────────────────────────────────────
interface PendingAction {
  title: string;
  description: string;
  confirmLabel: string;
  confirmClass?: string;
  fn: () => void;
}

// ─── MobileRoomCard ───────────────────────────────────────────────────────────
function MobileRoomCard({
  room,
  tasks,
  checkoutToday,
  checkinToday,
  isOccupied,
  onStartTask,
  onCompleteTask,
  onInspectTask,
  onUpdateStatus,
  onQuickStart,
  isUpdating,
}: {
  room: RoomWithType;
  tasks: HousekeepingTaskWithRoom[];
  checkoutToday: boolean;
  checkinToday: boolean;
  isOccupied: boolean;
  onStartTask: (taskId: string) => void;
  onCompleteTask: (taskId: string) => void;
  onInspectTask: (taskId: string) => void;
  onUpdateStatus: (roomId: string, status: RoomStatus) => void;
  onQuickStart: (roomId: string) => void;
  isUpdating: boolean;
}) {
  const [, navigate] = useLocation();
  const config = statusConfig[room.status];
  const Icon = config.icon;
  const [pending, setPending] = useState<PendingAction | null>(null);

  const activeTask = tasks.find(t => t.status === "in_progress");
  const pendingTask = tasks.find(t => t.status === "pending");
  const completedTask = tasks.find(t => t.status === "completed");
  const currentTask = activeTask || pendingTask || completedTask;

  const isUrgent = checkoutToday && (room.status === "dirty" || room.status === "occupied");

  // Cronómetro — corre solo cuando hay tarea activa con startedAt
  const elapsed = useElapsedTime(activeTask?.startedAt);

  // Helper para pedir confirmación antes de ejecutar cualquier acción
  const confirm = useCallback((action: PendingAction) => {
    setPending(action);
  }, []);

  const handleConfirm = () => {
    pending?.fn();
    setPending(null);
  };

  return (
    <>
      <div
        className={`rounded-xl border-2 p-4 space-y-3 transition-all ${
          isUrgent
            ? "border-red-400 dark:border-red-600 bg-red-50/60 dark:bg-red-950/20"
            : room.status === "dirty"
            ? "border-orange-300 dark:border-orange-700 bg-orange-50/50 dark:bg-orange-950/20"
            : room.status === "cleaning"
            ? "border-yellow-300 dark:border-yellow-700 bg-yellow-50/50 dark:bg-yellow-950/20"
            : room.status === "available"
            ? "border-green-200 dark:border-green-800 bg-green-50/30 dark:bg-green-950/10"
            : "border-border bg-muted/20"
        }`}
        data-testid={`card-mobile-room-${room.id}`}
      >
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="text-3xl font-bold tracking-tight">{room.roomNumber}</span>
            <div className="flex flex-col gap-0.5">
              <div className={`flex items-center gap-1 text-sm font-medium ${config.className}`}>
                <Icon className="h-4 w-4" />
                {config.label}
              </div>
              <span className="text-xs text-muted-foreground">{room.roomType?.name || room.roomType?.code || "—"} · Piso {room.floor}</span>
            </div>
          </div>
          <div className="flex flex-col items-end gap-1">
            {isUrgent && (
              <Badge className="bg-red-500 text-white border-0 text-xs animate-pulse">
                ⚠ Checkout hoy
              </Badge>
            )}
            {checkinToday && (
              <Badge className="bg-blue-500 text-white border-0 text-xs">
                Check-in hoy
              </Badge>
            )}
            {room.bedConfig && (
              <span className="text-xs text-muted-foreground font-medium">{room.bedConfig}</span>
            )}
          </div>
        </div>

        {/* Task info + cronómetro */}
        {currentTask && (
          <div className={`rounded-lg px-3 py-2 text-sm ${
            currentTask.status === "in_progress" ? "bg-yellow-100 dark:bg-yellow-900/30 text-yellow-800 dark:text-yellow-300" :
            currentTask.status === "completed" ? "bg-green-100 dark:bg-green-900/30 text-green-800 dark:text-green-300" :
            "bg-orange-100 dark:bg-orange-900/30 text-orange-800 dark:text-orange-300"
          }`}>
            <div className="flex items-center justify-between">
              <div>
                <span className="font-medium">{taskTypeLabels[currentTask.taskType as TaskType] || currentTask.taskType}</span>
                {" · "}
                <span>{taskStatusConfig[currentTask.status as TaskStatus].label}</span>
              </div>
              {/* Cronómetro: solo visible cuando la tarea está en progreso */}
              {activeTask && (
                <div className="flex items-center gap-1.5 bg-yellow-200 dark:bg-yellow-800/50 rounded-md px-2 py-0.5">
                  <Timer className="h-3.5 w-3.5 animate-pulse" />
                  <span className="font-mono font-bold text-base tracking-widest" data-testid={`timer-room-${room.id}`}>
                    {elapsed}
                  </span>
                </div>
              )}
            </div>
            {currentTask.notes && (
              <p className="text-xs mt-0.5 opacity-80 truncate">{currentTask.notes}</p>
            )}
          </div>
        )}

        {/* Main action buttons */}
        <div className="flex flex-col gap-2">
          {/* No active task on a dirty/occupied room → Quick start */}
          {!currentTask && (room.status === "dirty" || (checkoutToday && room.status === "occupied")) && (
            <Button
              className="w-full h-12 text-base bg-orange-500 hover:bg-orange-600 text-white"
              disabled={isUpdating}
              onClick={() => confirm({
                title: `Iniciar limpieza — Hab. ${room.roomNumber}`,
                description: "Se creará una tarea de limpieza y comenzará a correr el cronómetro. ¿Continuar?",
                confirmLabel: "Sí, iniciar",
                confirmClass: "bg-orange-500 hover:bg-orange-600",
                fn: () => onQuickStart(room.id),
              })}
              data-testid={`button-quick-start-${room.id}`}
            >
              <Play className="h-5 w-5 mr-2" />
              Iniciar limpieza
            </Button>
          )}

          {/* Pending task → Start */}
          {pendingTask && !activeTask && (
            <Button
              className="w-full h-12 text-base bg-yellow-500 hover:bg-yellow-600 text-white"
              disabled={isUpdating}
              onClick={() => confirm({
                title: `Iniciar tarea — Hab. ${room.roomNumber}`,
                description: "Se registrará el inicio de la tarea y comenzará el cronómetro. ¿Continuar?",
                confirmLabel: "Sí, iniciar",
                confirmClass: "bg-yellow-500 hover:bg-yellow-600",
                fn: () => onStartTask(pendingTask.id),
              })}
              data-testid={`button-start-task-${pendingTask.id}`}
            >
              <Play className="h-5 w-5 mr-2" />
              Iniciar tarea
            </Button>
          )}

          {/* Active task OR cleaning-status room → Finalizar limpieza */}
          {(activeTask || (!activeTask && !pendingTask && room.status === "cleaning")) && (
            <Button
              className="w-full h-12 text-base bg-green-500 hover:bg-green-600 text-white font-semibold shadow-sm"
              disabled={isUpdating}
              onClick={() => confirm({
                title: `Finalizar limpieza — Hab. ${room.roomNumber}`,
                description: activeTask
                  ? `La limpieza duró ${elapsed}. ¿Marcar la habitación como limpia y lista?`
                  : "¿Marcar la habitación como limpia y lista?",
                confirmLabel: "Sí, lista",
                confirmClass: "bg-green-500 hover:bg-green-600",
                fn: () => activeTask
                  ? onCompleteTask(activeTask.id)
                  : onUpdateStatus(room.id, isOccupied ? "limpia_ocupada" : "available"),
              })}
              data-testid={activeTask ? `button-complete-task-${activeTask.id}` : `button-finish-cleaning-${room.id}`}
            >
              <CheckCircle className="h-5 w-5 mr-2" />
              {activeTask ? `Finalizar (${elapsed})` : "Finalizar limpieza"}
            </Button>
          )}

          {/* Completed task → Inspect */}
          {completedTask && !activeTask && !pendingTask && (
            <Button
              className="w-full h-12 text-base bg-blue-500 hover:bg-blue-600 text-white"
              disabled={isUpdating}
              onClick={() => confirm({
                title: `Inspeccionar — Hab. ${room.roomNumber}`,
                description: "¿Confirmar que la habitación fue inspeccionada y está aprobada?",
                confirmLabel: "Sí, aprobar",
                confirmClass: "bg-blue-500 hover:bg-blue-600",
                fn: () => onInspectTask(completedTask.id),
              })}
              data-testid={`button-inspect-task-${completedTask.id}`}
            >
              <Star className="h-5 w-5 mr-2" />
              Aprobar (inspección)
            </Button>
          )}

          {/* Already available and no action needed */}
          {room.status === "available" && !currentTask && !checkoutToday && (
            <div className="text-center text-sm text-green-600 dark:text-green-400 font-medium py-1">
              <CheckCircle className="h-4 w-4 inline mr-1" />
              Lista
            </div>
          )}
        </div>

        {/* Quick status row */}
        <div className="flex flex-wrap items-center gap-1.5 pt-1 border-t border-border/50">
          <span className="text-xs text-muted-foreground w-full mb-0.5">Cambiar estado:</span>
          <button
            className="text-[11px] px-2 py-1.5 rounded-md bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 font-medium disabled:opacity-40"
            onClick={() => confirm({
              title: `Disponible — Hab. ${room.roomNumber}`,
              description: "¿Marcar esta habitación como disponible?",
              confirmLabel: "Sí, disponible",
              fn: () => onUpdateStatus(room.id, "available"),
            })}
            disabled={isUpdating || room.status === "available"}
            data-testid={`button-set-available-${room.id}`}
          >
            Disponible
          </button>
          <button
            className="text-[11px] px-2 py-1.5 rounded-md bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400 font-medium disabled:opacity-40"
            onClick={() => confirm({
              title: `Limpia ocupada — Hab. ${room.roomNumber}`,
              description: "¿Marcar esta habitación como limpia con huésped?",
              confirmLabel: "Sí",
              fn: () => onUpdateStatus(room.id, "limpia_ocupada"),
            })}
            disabled={isUpdating || room.status === "limpia_ocupada"}
            data-testid={`button-set-limpia-ocupada-${room.id}`}
          >
            Limpia ocup.
          </button>
          <button
            className="text-[11px] px-2 py-1.5 rounded-md bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-400 font-medium disabled:opacity-40"
            onClick={() => confirm({
              title: `No molestar — Hab. ${room.roomNumber}`,
              description: "¿Activar estado No molestar?",
              confirmLabel: "Sí",
              fn: () => onUpdateStatus(room.id, "no_molestar"),
            })}
            disabled={isUpdating || room.status === "no_molestar"}
            data-testid={`button-set-no-molestar-${room.id}`}
          >
            No molestar
          </button>
          <button
            className="text-[11px] px-2 py-1.5 rounded-md bg-orange-100 dark:bg-orange-900/30 text-orange-700 dark:text-orange-400 font-medium disabled:opacity-40"
            onClick={() => confirm({
              title: `Sucia — Hab. ${room.roomNumber}`,
              description: "¿Marcar esta habitación como sucia?",
              confirmLabel: "Sí, sucia",
              fn: () => onUpdateStatus(room.id, "dirty"),
            })}
            disabled={isUpdating || room.status === "dirty"}
            data-testid={`button-set-dirty-${room.id}`}
          >
            Sucia
          </button>
          <button
            className="text-[11px] px-2 py-1.5 rounded-md bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400 font-medium disabled:opacity-40"
            onClick={() => confirm({
              title: `Mantenimiento — Hab. ${room.roomNumber}`,
              description: "¿Pasar esta habitación a estado de mantenimiento?",
              confirmLabel: "Sí, mantenimiento",
              fn: () => {
                onUpdateStatus(room.id, "maintenance");
                navigate(`/maintenance?newOrder=${room.id}&roomNumber=${encodeURIComponent(room.roomNumber)}`);
              },
            })}
            disabled={isUpdating || room.status === "maintenance"}
            data-testid={`button-set-maintenance-${room.id}`}
          >
            Mant.
          </button>
        </div>
      </div>

      {/* Confirmation dialog — local al componente, no bloquea otras tarjetas */}
      <AlertDialog open={!!pending} onOpenChange={open => !open && setPending(null)}>
        <AlertDialogContent className="max-w-sm mx-4">
          <AlertDialogHeader>
            <AlertDialogTitle>{pending?.title}</AlertDialogTitle>
            <AlertDialogDescription className="text-base">
              {pending?.description}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="gap-2 flex-col sm:flex-row">
            <AlertDialogCancel className="w-full sm:w-auto">
              Cancelar
            </AlertDialogCancel>
            <AlertDialogAction
              className={`w-full sm:w-auto text-white ${pending?.confirmClass || "bg-primary hover:bg-primary/90"}`}
              onClick={handleConfirm}
              data-testid="button-confirm-action"
            >
              {pending?.confirmLabel || "Confirmar"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

// ===================== HOUSEKEEPING MAIN =====================

export default function Housekeeping() {
  const { user } = useAuth();
  const { toast } = useToast();
  const isSupervisor = ["admin", "manager", "gobernanta", "responsable_area"].includes(user?.role ?? "");
  const isMucama = user?.role === "housekeeping";
  const [floorFilter, setFloorFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [mobileView, setMobileView] = useState(() => localStorage.getItem("hk_mobile_view") === "true");
  const toggleMobileView = () => setMobileView(v => { const next = !v; localStorage.setItem("hk_mobile_view", String(next)); return next; });
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

  const today = new Date().toLocaleDateString("en-CA", { timeZone: "America/Argentina/Buenos_Aires" });
  const { data: tasks, isLoading: tasksLoading } = useQuery<HousekeepingTaskWithRoom[]>({
    queryKey: ["/api/housekeeping", today],
    queryFn: () =>
      fetch(`/api/housekeeping?date=${today}`, { credentials: "include" }).then(r => r.json()),
  });

  const { data: hkStaff = [] } = useQuery<any[]>({
    queryKey: ["/api/housekeeping/staff"],
    enabled: isSupervisor,
  });

  const { data: checkouts = [] } = useQuery<any[]>({
    queryKey: ["/api/reservations/check-out"],
  });
  const { data: checkins = [] } = useQuery<any[]>({
    queryKey: ["/api/reservations/check-in"],
  });

  const { data: lostFoundActive = [] } = useQuery<LostFoundItem[]>({
    queryKey: ["/api/lost-found", "en_custodia"],
    queryFn: () => fetch("/api/lost-found?status=en_custodia").then(r => r.json()),
  });
  const lostFoundCount = lostFoundActive.length;

  // ── Elementos Prestados ────────────────────────────────────────────────
  const [loansDialogOpen, setLoansDialogOpen] = useState(false);
  const [loansCatalogOpen, setLoansCatalogOpen] = useState(false);
  const [newLoanOpen, setNewLoanOpen] = useState(false);
  const [newLoanItemId, setNewLoanItemId] = useState("");
  const [newLoanRoom, setNewLoanRoom] = useState("");
  const [newLoanQty, setNewLoanQty] = useState("1");
  const [newLoanNotes, setNewLoanNotes] = useState("");
  const [editingLoanItem, setEditingLoanItem] = useState<LoanItem | null>(null);
  const [loanItemName, setLoanItemName] = useState("");
  const [loanItemDesc, setLoanItemDesc] = useState("");
  const [loanItemQty, setLoanItemQty] = useState("1");

  const { data: loanItemsList = [] } = useQuery<LoanItem[]>({ queryKey: ["/api/loan-items"] });
  const { data: activeLoans = [] } = useQuery<ItemLoanWithItem[]>({ queryKey: ["/api/item-loans"] });

  const createLoanMutation = useMutation({
    mutationFn: () => apiRequest("POST", "/api/item-loans", {
      loanItemId: newLoanItemId, roomNumber: newLoanRoom,
      quantity: parseInt(newLoanQty) || 1, notes: newLoanNotes || null,
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/item-loans"] });
      toast({ title: "Préstamo registrado" });
      setNewLoanOpen(false); setNewLoanItemId(""); setNewLoanRoom(""); setNewLoanQty("1"); setNewLoanNotes("");
    },
    onError: () => toast({ title: "Error", description: "No se pudo registrar el préstamo", variant: "destructive" }),
  });

  const returnLoanMutation = useMutation({
    mutationFn: (id: string) => apiRequest("PATCH", `/api/item-loans/${id}/return`, {}),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/item-loans"] });
      toast({ title: "Devolución registrada" });
    },
    onError: () => toast({ title: "Error", description: "No se pudo registrar la devolución", variant: "destructive" }),
  });

  const saveLoanItemMutation = useMutation({
    mutationFn: () => {
      const payload = { name: loanItemName.trim(), description: loanItemDesc || null, totalQuantity: parseInt(loanItemQty) || 1 };
      if (editingLoanItem) return apiRequest("PATCH", `/api/loan-items/${editingLoanItem.id}`, payload);
      return apiRequest("POST", "/api/loan-items", payload);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/loan-items"] });
      toast({ title: editingLoanItem ? "Elemento actualizado" : "Elemento creado" });
      setEditingLoanItem(null); setLoanItemName(""); setLoanItemDesc(""); setLoanItemQty("1");
    },
    onError: () => toast({ title: "Error", description: "No se pudo guardar", variant: "destructive" }),
  });

  const deleteLoanItemMutation = useMutation({
    mutationFn: (id: string) => apiRequest("DELETE", `/api/loan-items/${id}`, {}),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/loan-items"] });
      toast({ title: "Elemento eliminado" });
    },
    onError: () => toast({ title: "Error", description: "No se pudo eliminar", variant: "destructive" }),
  });

  const openEditLoanItem = (item: LoanItem) => {
    setEditingLoanItem(item);
    setLoanItemName(item.name);
    setLoanItemDesc(item.description || "");
    setLoanItemQty(String(item.totalQuantity));
  };

  // Group active loans by item name for summary
  const loanSummary = activeLoans.reduce<Record<string, { name: string; rooms: string[] }>>((acc, loan) => {
    const key = loan.loanItemId;
    if (!acc[key]) acc[key] = { name: loan.loanItem?.name || "Desconocido", rooms: [] };
    const qty = loan.quantity > 1 ? `Hab. ${loan.roomNumber} (×${loan.quantity})` : `Hab. ${loan.roomNumber}`;
    acc[key].rooms.push(qty);
    return acc;
  }, {});

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
    mutationFn: (taskId: string) => apiRequest("POST", `/api/housekeeping/${taskId}/complete`).then(r => r.json()),
    onSuccess: (completedTask: any) => {
      queryClient.invalidateQueries({ queryKey: ["/api/housekeeping"] });
      queryClient.invalidateQueries({ queryKey: ["/api/rooms"] });
      queryClient.invalidateQueries({ queryKey: ["/api/dashboard/stats"] });
      const roomNum = rooms?.find(r => r.id === completedTask?.roomId)?.roomNumber;
      toast({
        title: `✅ Limpieza finalizada${roomNum ? ` — Hab. ${roomNum}` : ""}`,
        description: "La habitación quedó disponible.",
        duration: 6000,
      });
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

  const inspectTaskMutation = useMutation({
    mutationFn: (taskId: string) => apiRequest("POST", `/api/housekeeping/${taskId}/inspect`, { inspectedBy: "Supervisor" }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/housekeeping"] });
      queryClient.invalidateQueries({ queryKey: ["/api/rooms"] });
      toast({ title: "Habitación aprobada", description: "La inspección fue registrada." });
    },
    onError: () => toast({ title: "Error", description: "No se pudo registrar la inspección.", variant: "destructive" }),
  });

  const quickStartMutation = useMutation({
    mutationFn: async (roomId: string) => {
      const resp = await apiRequest("POST", "/api/housekeeping", {
        roomId,
        taskType: "checkout_clean",
        priority: "high",
        scheduledDate: today,
      });
      if (!resp.ok) throw new Error("create failed");
      const task = await resp.json();
      const startResp = await apiRequest("POST", `/api/housekeeping/${task.id}/start`);
      if (!startResp.ok) throw new Error("start failed");
      return { task, roomId };
    },
    onSuccess: ({ roomId }) => {
      queryClient.invalidateQueries({ queryKey: ["/api/housekeeping"] });
      queryClient.invalidateQueries({ queryKey: ["/api/rooms"] });
      const roomNum = rooms?.find(r => r.id === roomId)?.roomNumber;
      toast({
        title: `🧹 Limpieza iniciada${roomNum ? ` — Hab. ${roomNum}` : ""}`,
        description: "El cronómetro está corriendo. Presioná \"Finalizar\" cuando termines.",
        duration: 5000,
      });
    },
    onError: () => toast({ title: "Error", description: "No se pudo iniciar la limpieza.", variant: "destructive" }),
  });

  const assignMutation = useMutation({
    mutationFn: (data: { roomId: string; assignedTo: string | null; date: string }) =>
      apiRequest("POST", "/api/housekeeping/assign", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/housekeeping"] });
      toast({ title: "Asignación guardada" });
    },
    onError: () => toast({ title: "Error al asignar", variant: "destructive" }),
  });

  const floors = rooms ? Array.from(new Set(rooms.map(r => r.floor).filter((f): f is number => f != null))).sort((a, b) => a - b) : [];
  
  const filteredRooms = rooms?.filter(room => {
    if (floorFilter !== "all" && room.floor !== parseInt(floorFilter)) return false;
    if (statusFilter !== "all" && room.status !== statusFilter) return false;
    return true;
  }) || [];

  // Para mucamas: solo muestran sus habitaciones asignadas. Si no tiene ninguna asignada, ve todas.
  const myAssignedRoomIds = isMucama
    ? new Set((tasks ?? []).filter(t => t.assignedTo === user?.id).map(t => t.roomId))
    : null;
  const mobileRooms = (isMucama && myAssignedRoomIds && myAssignedRoomIds.size > 0)
    ? filteredRooms.filter(r => myAssignedRoomIds.has(r.id))
    : filteredRooms;

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

  const salidashoy = checkouts.filter((r: any) => r.checkOutDate === today).length;
  const entradasHoy = checkins.filter((r: any) => r.checkInDate === today && r.status === "confirmed").length;
  const continuaciones = rooms?.filter(r => r.status === "occupied").length ?? 0;

  const checkoutRoomIds = new Set(
    checkouts.filter((r: any) => r.checkOutDate === today).map((r: any) => r.roomId)
  );
  const checkinRoomIds = new Set(
    checkins.filter((r: any) => r.checkInDate === today && r.status === "confirmed").map((r: any) => r.roomId)
  );
  const tareasHoy = tasks?.length ?? 0;
  const tareasCompletadas = tasks?.filter(t => t.status === "completed" || t.status === "inspected").length ?? 0;

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
    <div className="p-6 space-y-4">
      <div className="flex items-center gap-2">
        <ClipboardCheck className="h-6 w-6 text-muted-foreground" />
        <h1 className="text-2xl font-bold" data-testid="text-page-title">Housekeeping</h1>
      </div>

      <Tabs defaultValue="rooms">
        <TabsList>
          <TabsTrigger value="rooms">Habitaciones</TabsTrigger>
          {isSupervisor && (
            <TabsTrigger value="turno" data-testid="tab-turno" className="gap-1">
              <CalendarClock className="h-4 w-4" />
              Turno
            </TabsTrigger>
          )}
          <TabsTrigger value="lost-found" data-testid="tab-lost-found" className="gap-1">
            <Package className="h-4 w-4" />
            Objetos Perdidos
            {lostFoundCount > 0 && (
              <Badge className="ml-1 h-5 min-w-5 px-1 text-xs bg-amber-500 text-white border-0 flex items-center justify-center">
                {lostFoundCount}
              </Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="elementos-prestados" data-testid="tab-elementos-prestados" className="gap-1">
            <Boxes className="h-4 w-4" />
            Elementos Prestados
            {activeLoans.length > 0 && (
              <Badge className="ml-1 h-5 min-w-5 px-1 text-xs bg-blue-500 text-white border-0 flex items-center justify-center">
                {activeLoans.length}
              </Badge>
            )}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="rooms">
          <div className="space-y-6 mt-2">

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 p-4 bg-muted/30 rounded-lg border">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-md bg-amber-100 dark:bg-amber-900/30">
                  <LogOut className="h-4 w-4 text-amber-600 dark:text-amber-400" />
                </div>
                <div>
                  <p className="text-xl font-bold">{salidashoy}</p>
                  <p className="text-xs text-muted-foreground">Salidas hoy</p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-md bg-blue-100 dark:bg-blue-900/30">
                  <Bed className="h-4 w-4 text-blue-600 dark:text-blue-400" />
                </div>
                <div>
                  <p className="text-xl font-bold">{continuaciones}</p>
                  <p className="text-xs text-muted-foreground">Continuaciones</p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-md bg-green-100 dark:bg-green-900/30">
                  <LogIn className="h-4 w-4 text-green-600 dark:text-green-400" />
                </div>
                <div>
                  <p className="text-xl font-bold">{entradasHoy}</p>
                  <p className="text-xs text-muted-foreground">Entradas hoy</p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-md bg-purple-100 dark:bg-purple-900/30">
                  <CheckCircle className="h-4 w-4 text-purple-600 dark:text-purple-400" />
                </div>
                <div>
                  <p className="text-xl font-bold">
                    {tareasCompletadas}
                    <span className="text-sm font-normal text-muted-foreground">/{tareasHoy}</span>
                  </p>
                  <p className="text-xs text-muted-foreground">Tareas listas</p>
                </div>
              </div>
            </div>
            {tareasHoy > 0 && (
              <div className="h-1.5 w-full bg-muted rounded-full overflow-hidden -mt-2">
                <div
                  className="h-full bg-green-500 transition-all duration-500"
                  style={{ width: `${Math.round((tareasCompletadas / tareasHoy) * 100)}%` }}
                />
              </div>
            )}

            <div className="flex items-center justify-between gap-2 flex-wrap">
              <div className="flex items-center gap-2 flex-wrap">
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
              <button
                onClick={toggleMobileView}
                data-testid="button-toggle-mobile-view"
                title={mobileView ? "Cambiar a vista escritorio" : "Cambiar a vista móvil (táctil)"}
                className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-medium border transition-colors ${
                  mobileView
                    ? "bg-violet-100 dark:bg-violet-900/40 border-violet-400 text-violet-800 dark:text-violet-300"
                    : "bg-muted border-border text-muted-foreground hover:text-foreground"
                }`}
              >
                {mobileView ? <LayoutGrid className="h-3.5 w-3.5" /> : <Smartphone className="h-3.5 w-3.5" />}
                {mobileView ? "Vista escritorio" : "Vista móvil"}
              </button>
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

      {mobileView ? (
        /* ── VISTA MÓVIL ── */
        <div className="space-y-3">
          {isMucama && myAssignedRoomIds && myAssignedRoomIds.size > 0 && (
            <div className="flex items-center gap-2 px-1 py-2 text-sm text-muted-foreground border-b">
              <Users className="h-4 w-4" />
              <span>Mostrando tus <strong>{myAssignedRoomIds.size}</strong> habitaciones asignadas</span>
            </div>
          )}
          {isMucama && myAssignedRoomIds && myAssignedRoomIds.size === 0 && (
            <div className="flex items-center gap-2 px-1 py-2 text-sm text-amber-600 border-b border-amber-200 bg-amber-50 rounded-lg">
              <Users className="h-4 w-4" />
              <span>Sin asignación aún — mostrando todas las habitaciones</span>
            </div>
          )}
          {mobileRooms.length === 0 && (
            <div className="text-center py-16 text-muted-foreground">
              <Sparkles className="h-12 w-12 mx-auto mb-3 opacity-30" />
              <p className="text-sm font-medium">No hay habitaciones que mostrar</p>
            </div>
          )}
          {/* Urgentes primero: checkout hoy + sucia/ocupada */}
          {mobileRooms
            .slice()
            .sort((a, b) => {
              const urgentA = checkoutRoomIds.has(a.id) && (a.status === "dirty" || a.status === "occupied") ? 0 : 1;
              const urgentB = checkoutRoomIds.has(b.id) && (b.status === "dirty" || b.status === "occupied") ? 0 : 1;
              if (urgentA !== urgentB) return urgentA - urgentB;
              const orderMap: Record<string, number> = { dirty: 1, cleaning: 2, maintenance: 3, occupied: 4, available: 5, oos: 6 };
              const oA = orderMap[a.status] ?? 9;
              const oB = orderMap[b.status] ?? 9;
              if (oA !== oB) return oA - oB;
              return parseInt(a.roomNumber) - parseInt(b.roomNumber);
            })
            .map(room => (
              <MobileRoomCard
                key={room.id}
                room={room}
                tasks={getTasksForRoom(room.id)}
                checkoutToday={checkoutRoomIds.has(room.id)}
                checkinToday={checkinRoomIds.has(room.id)}
                isOccupied={
                  (room.status === "occupied" || room.status === "cleaning" || room.status === "limpia_ocupada" || room.status === "no_molestar") &&
                  !checkoutRoomIds.has(room.id)
                }
                onStartTask={(taskId) => startTaskMutation.mutate(taskId)}
                onCompleteTask={(taskId) => completeTaskMutation.mutate(taskId)}
                onInspectTask={(taskId) => inspectTaskMutation.mutate(taskId)}
                onUpdateStatus={(roomId, status) => updateRoomStatusMutation.mutate({ roomId, status })}
                onQuickStart={(roomId) => quickStartMutation.mutate(roomId)}
                isUpdating={
                  startTaskMutation.isPending ||
                  completeTaskMutation.isPending ||
                  inspectTaskMutation.isPending ||
                  updateRoomStatusMutation.isPending ||
                  quickStartMutation.isPending
                }
              />
            ))}
        </div>
      ) : (
        /* ── VISTA ESCRITORIO (grid existente) ── */
        <>
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
                        isOccupied={
                          (room.status === "occupied" || room.status === "cleaning" || room.status === "limpia_ocupada" || room.status === "no_molestar") &&
                          !checkoutRoomIds.has(room.id)
                        }
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
        </>
      )}
          </div>
        </TabsContent>

        {isSupervisor && (
        <TabsContent value="turno">
          <div className="mt-4 space-y-6">
            {/* ── Cards por mucama ── */}
            <div className="space-y-3">
              <h3 className="text-sm font-semibold text-muted-foreground flex items-center gap-2">
                <Users className="h-4 w-4" /> Personal asignado hoy
              </h3>
              {hkStaff.length === 0 && (
                <p className="text-sm text-muted-foreground py-4 text-center">
                  No hay mucamas/gobernanta registradas aún. Creá usuarios con perfil Housekeeping o Gobernanta.
                </p>
              )}
              {hkStaff.map((staff: any) => {
                const staffTasks = (tasks ?? []).filter(t => t.assignedTo === staff.id);
                const roleLabel: Record<string, string> = { housekeeping: "Mucama", gobernanta: "Gobernanta", responsable_area: "Resp. Área" };
                return (
                  <Card key={staff.id} className="border">
                    <CardContent className="p-4">
                      <div className="flex items-start gap-3">
                        <div className="w-9 h-9 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                          <span className="text-sm font-bold text-primary">{staff.fullName.charAt(0).toUpperCase()}</span>
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <p className="font-medium text-sm truncate">{staff.fullName}</p>
                            <Badge variant="outline" className="text-xs shrink-0">{roleLabel[staff.role] ?? staff.role}</Badge>
                          </div>
                          <p className="text-xs text-muted-foreground mb-2">
                            {staffTasks.length === 0 ? "Sin habitaciones asignadas" : `${staffTasks.length} hab. asignada${staffTasks.length !== 1 ? "s" : ""}`}
                          </p>
                          {staffTasks.length > 0 && (
                            <div className="flex flex-wrap gap-1.5">
                              {staffTasks.map(t => (
                                <div key={t.id} className="flex items-center gap-1 bg-muted rounded px-2 py-0.5 text-xs">
                                  <span className="font-medium">Hab. {t.room?.roomNumber}</span>
                                  <button
                                    className="text-muted-foreground hover:text-destructive ml-0.5"
                                    title="Desasignar"
                                    onClick={() => assignMutation.mutate({ roomId: t.roomId, assignedTo: null, date: today })}
                                  >
                                    <X className="h-3 w-3" />
                                  </button>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>

            {/* ── Habitaciones a asignar ── */}
            <div className="space-y-3">
              <h3 className="text-sm font-semibold text-muted-foreground flex items-center gap-2">
                <Sparkles className="h-4 w-4" /> Habitaciones del turno
              </h3>
              {rooms
                ?.filter(r => ["dirty", "cleaning", "occupied"].includes(r.status))
                .sort((a, b) => parseInt(a.roomNumber) - parseInt(b.roomNumber))
                .map(room => {
                  const task = (tasks ?? []).find(t => t.roomId === room.id);
                  const assignedStaff = task?.assignedTo ? hkStaff.find((s: any) => s.id === task.assignedTo) : null;
                  const statusLabel: Record<string, string> = { dirty: "Sucia", cleaning: "Limpiando", occupied: "Ocupada" };
                  const statusColor: Record<string, string> = { dirty: "bg-orange-100 text-orange-700", cleaning: "bg-yellow-100 text-yellow-700", occupied: "bg-blue-100 text-blue-700" };
                  return (
                    <div key={room.id} className="flex items-center gap-3 p-3 rounded-lg border bg-card">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-sm">Hab. {room.roomNumber}</span>
                          <span className={`text-xs px-1.5 py-0.5 rounded font-medium ${statusColor[room.status] ?? "bg-muted text-muted-foreground"}`}>
                            {statusLabel[room.status] ?? room.status}
                          </span>
                          {checkoutRoomIds.has(room.id) && (
                            <span className="text-xs bg-red-100 text-red-600 px-1.5 py-0.5 rounded font-medium">Checkout hoy</span>
                          )}
                        </div>
                        {assignedStaff && (
                          <p className="text-xs text-muted-foreground mt-0.5">Asignada a: <strong>{assignedStaff.fullName}</strong></p>
                        )}
                      </div>
                      <Select
                        value={task?.assignedTo ?? "__none__"}
                        onValueChange={(val) => assignMutation.mutate({ roomId: room.id, assignedTo: val === "__none__" ? null : val, date: today })}
                        disabled={assignMutation.isPending}
                      >
                        <SelectTrigger className="w-36 h-8 text-xs" data-testid={`select-assign-${room.id}`}>
                          <SelectValue placeholder="Asignar a…" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="__none__">— Sin asignar —</SelectItem>
                          {hkStaff.map((s: any) => (
                            <SelectItem key={s.id} value={s.id}>{s.fullName}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  );
                })}
              {rooms && rooms.filter(r => ["dirty", "cleaning", "occupied"].includes(r.status)).length === 0 && (
                <p className="text-sm text-muted-foreground py-6 text-center">No hay habitaciones que requieran limpieza hoy.</p>
              )}
            </div>
          </div>
        </TabsContent>
        )}

        <TabsContent value="lost-found">
          <LostFoundTab />
        </TabsContent>

        <TabsContent value="elementos-prestados">
          <div className="space-y-4 mt-2">
            {/* Header con acciones */}
            <div className="flex items-center justify-between flex-wrap gap-2">
              <div>
                <h2 className="text-lg font-semibold">Elementos Prestados</h2>
                <p className="text-sm text-muted-foreground">
                  {activeLoans.length === 0 ? "Sin préstamos activos" : `${activeLoans.length} préstamo${activeLoans.length !== 1 ? "s" : ""} activo${activeLoans.length !== 1 ? "s" : ""}`}
                </p>
              </div>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={() => { setLoansCatalogOpen(true); setEditingLoanItem(null); setLoanItemName(""); setLoanItemDesc(""); setLoanItemQty("1"); }} data-testid="button-open-catalog">
                  <Pencil className="h-4 w-4 mr-1.5" />
                  Editar catálogo
                </Button>
                <Button size="sm" onClick={() => { setNewLoanOpen(true); setNewLoanItemId(""); setNewLoanRoom(""); setNewLoanQty("1"); setNewLoanNotes(""); }} data-testid="button-new-loan">
                  <Plus className="h-4 w-4 mr-1.5" />
                  Registrar préstamo
                </Button>
              </div>
            </div>

            {/* Resumen por tipo */}
            {Object.values(loanSummary).length > 0 && (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {Object.values(loanSummary).map(({ name, rooms: roomList }) => (
                  <div key={name} className="flex items-start gap-3 p-3 bg-blue-50 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-800 rounded-lg">
                    <div className="p-1.5 rounded-md bg-blue-100 dark:bg-blue-900/40 shrink-0">
                      <Boxes className="h-4 w-4 text-blue-600 dark:text-blue-400" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-blue-800 dark:text-blue-200">{name}s prestadas: {roomList.length}</p>
                      <p className="text-xs text-blue-600 dark:text-blue-400 truncate">{roomList.join(" · ")}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Lista de préstamos activos */}
            {activeLoans.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 text-center">
                <Boxes className="h-12 w-12 mx-auto mb-3 opacity-25" />
                <p className="text-muted-foreground">No hay elementos prestados actualmente</p>
                <Button size="sm" variant="outline" className="mt-4" onClick={() => setNewLoanOpen(true)}>
                  <Plus className="h-4 w-4 mr-1.5" />Registrar primer préstamo
                </Button>
              </div>
            ) : (
              <div className="space-y-2">
                {activeLoans.map(loan => (
                  <div key={loan.id} className="flex items-center gap-4 p-3 border rounded-lg bg-card hover:bg-muted/30 transition-colors" data-testid={`loan-row-${loan.id}`}>
                    <div className="p-2 rounded-md bg-muted shrink-0">
                      <Boxes className="h-4 w-4 text-muted-foreground" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-medium text-sm">{loan.loanItem?.name}</span>
                        {loan.quantity > 1 && <Badge variant="secondary" className="text-xs">×{loan.quantity}</Badge>}
                        <Badge variant="outline" className="text-xs font-bold">Hab. {loan.roomNumber}</Badge>
                      </div>
                      <div className="flex items-center gap-3 mt-0.5">
                        <p className="text-xs text-muted-foreground">
                          {new Date(loan.lentAt!).toLocaleString("es-AR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}
                        </p>
                        {loan.notes && <p className="text-xs text-muted-foreground italic truncate max-w-[200px]">{loan.notes}</p>}
                      </div>
                    </div>
                    <Button
                      size="sm"
                      variant="outline"
                      className="shrink-0 text-green-600 border-green-300 hover:bg-green-50 dark:border-green-700 dark:hover:bg-green-950/30"
                      onClick={() => returnLoanMutation.mutate(loan.id)}
                      disabled={returnLoanMutation.isPending}
                      data-testid={`button-return-loan-${loan.id}`}
                    >
                      <CheckCheck className="h-4 w-4 mr-1.5" />
                      Devuelto
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </TabsContent>
      </Tabs>

      {/* ── Dialog: Registrar préstamo ─────────────────────────────────────── */}
      <Dialog open={newLoanOpen} onOpenChange={v => { setNewLoanOpen(v); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Registrar préstamo</DialogTitle>
            <DialogDescription>Indicá el elemento, cantidad y habitación destino.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-1">
            <div className="space-y-1.5">
              <Label>Elemento</Label>
              <Select value={newLoanItemId} onValueChange={setNewLoanItemId}>
                <SelectTrigger data-testid="select-loan-item">
                  <SelectValue placeholder="Seleccionar elemento…" />
                </SelectTrigger>
                <SelectContent>
                  {loanItemsList.map(item => (
                    <SelectItem key={item.id} value={item.id}>{item.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Habitación</Label>
                <Select value={newLoanRoom} onValueChange={setNewLoanRoom}>
                  <SelectTrigger data-testid="select-loan-room">
                    <SelectValue placeholder="Hab…" />
                  </SelectTrigger>
                  <SelectContent>
                    {(rooms || []).slice().sort((a, b) => parseInt(a.roomNumber) - parseInt(b.roomNumber)).map(r => (
                      <SelectItem key={r.id} value={r.roomNumber}>Hab. {r.roomNumber}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Cantidad</Label>
                <Input type="number" min="1" max="20" value={newLoanQty} onChange={e => setNewLoanQty(e.target.value)} data-testid="input-loan-qty" />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Notas <span className="text-muted-foreground text-xs">(opcional)</span></Label>
              <Input value={newLoanNotes} onChange={e => setNewLoanNotes(e.target.value)} placeholder="Ej: marca específica, estado…" data-testid="input-loan-notes" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setNewLoanOpen(false)}>Cancelar</Button>
            <Button
              disabled={!newLoanItemId || !newLoanRoom || createLoanMutation.isPending}
              onClick={() => createLoanMutation.mutate()}
              data-testid="button-save-loan"
            >
              {createLoanMutation.isPending ? "Guardando…" : "Registrar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Dialog: Catálogo de elementos ──────────────────────────────────── */}
      <Dialog open={loansCatalogOpen} onOpenChange={v => { setLoansCatalogOpen(v); if (!v) { setEditingLoanItem(null); setLoanItemName(""); setLoanItemDesc(""); setLoanItemQty("1"); } }}>
        <DialogContent className="max-w-md flex flex-col max-h-[80vh]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Boxes className="h-5 w-5 text-primary" />
              Catálogo de elementos prestables
            </DialogTitle>
            <DialogDescription>Administrá los elementos que el hotel puede prestar a las habitaciones.</DialogDescription>
          </DialogHeader>

          <div className="flex-1 overflow-y-auto space-y-2 pr-1">
            {loanItemsList.length === 0 && (
              <p className="text-sm text-muted-foreground text-center py-6">Sin elementos configurados</p>
            )}
            {loanItemsList.map(item => (
              <div key={item.id} className={`flex items-center gap-3 p-3 border rounded-lg transition-colors ${editingLoanItem?.id === item.id ? "border-primary bg-primary/5" : "hover:bg-muted/30"}`}>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium">{item.name}</p>
                  <p className="text-xs text-muted-foreground">Stock: {item.totalQuantity} {item.description ? `— ${item.description}` : ""}</p>
                </div>
                <div className="flex gap-1 shrink-0">
                  <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => openEditLoanItem(item)} data-testid={`button-edit-loanitem-${item.id}`}>
                    <Pencil className="h-3.5 w-3.5" />
                  </Button>
                  <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive hover:text-destructive" onClick={() => { if (window.confirm(`¿Eliminar "${item.name}"?`)) deleteLoanItemMutation.mutate(item.id); }} data-testid={`button-delete-loanitem-${item.id}`}>
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
            ))}
          </div>

          {/* Form inline */}
          <div className="border-t pt-4 space-y-3">
            <p className="text-sm font-semibold">{editingLoanItem ? `Editando: ${editingLoanItem.name}` : "Nuevo elemento"}</p>
            <div className="grid grid-cols-3 gap-2">
              <div className="col-span-2 space-y-1">
                <Label className="text-xs">Nombre</Label>
                <Input value={loanItemName} onChange={e => setLoanItemName(e.target.value)} placeholder="Ej: Plancha" data-testid="input-loanitem-name" />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Stock total</Label>
                <Input type="number" min="1" value={loanItemQty} onChange={e => setLoanItemQty(e.target.value)} data-testid="input-loanitem-qty" />
              </div>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Descripción <span className="text-muted-foreground">(opcional)</span></Label>
              <Input value={loanItemDesc} onChange={e => setLoanItemDesc(e.target.value)} placeholder="Ej: Plancha de ropa 1200W" data-testid="input-loanitem-desc" />
            </div>
            <div className="flex gap-2">
              {editingLoanItem && (
                <Button variant="outline" size="sm" className="flex-none" onClick={() => { setEditingLoanItem(null); setLoanItemName(""); setLoanItemDesc(""); setLoanItemQty("1"); }}>
                  <RotateCcw className="h-3.5 w-3.5 mr-1" />Cancelar
                </Button>
              )}
              <Button
                size="sm"
                className="flex-1"
                disabled={!loanItemName.trim() || saveLoanItemMutation.isPending}
                onClick={() => saveLoanItemMutation.mutate()}
                data-testid="button-save-loanitem"
              >
                {saveLoanItemMutation.isPending ? "Guardando…" : editingLoanItem ? "Guardar cambios" : "Agregar elemento"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

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
