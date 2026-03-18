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
  Package,
  Search,
  Pencil,
  Plus,
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
import type { RoomWithType, RoomStatus, HousekeepingTaskWithRoom, LostFoundItem, InsertLostFound, Guest } from "@shared/schema";
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
                  <p className="text-sm font-medium truncate">{displayedGuest.firstName} {displayedGuest.lastName}</p>
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
              <Popover open={guestPopoverOpen} onOpenChange={setGuestPopoverOpen}>
                <PopoverTrigger asChild>
                  <Button
                    type="button"
                    variant="outline"
                    className="w-full justify-start text-muted-foreground font-normal mt-1"
                    data-testid="button-lf-guest-selector"
                  >
                    <Search className="mr-2 h-4 w-4" />
                    Buscar huésped por nombre o DNI...
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="p-0 w-80" align="start">
                  <Command>
                    <CommandInput
                      placeholder="Nombre, apellido o DNI..."
                      value={guestSearch}
                      onValueChange={setGuestSearch}
                      data-testid="input-lf-guest-search"
                    />
                    <CommandList>
                      <CommandEmpty>No se encontraron huéspedes</CommandEmpty>
                      <CommandGroup>
                        {filteredGuests.map(g => (
                          <CommandItem
                            key={g.id}
                            onSelect={() => handleSelectGuest(g)}
                            data-testid={`item-lf-guest-${g.id}`}
                          >
                            <div>
                              <p className="text-sm font-medium">{g.firstName} {g.lastName}</p>
                              {g.documentNumber && (
                                <p className="text-xs text-muted-foreground">DNI/Pas: {g.documentNumber}</p>
                              )}
                            </div>
                          </CommandItem>
                        ))}
                      </CommandGroup>
                    </CommandList>
                  </Command>
                </PopoverContent>
              </Popover>
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
                guestName={guest ? `${guest.firstName} ${guest.lastName}` : undefined}
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

// ===================== HOUSEKEEPING MAIN =====================

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

  const { data: lostFoundActive = [] } = useQuery<LostFoundItem[]>({
    queryKey: ["/api/lost-found", "en_custodia"],
    queryFn: () => fetch("/api/lost-found?status=en_custodia").then(r => r.json()),
  });
  const lostFoundCount = lostFoundActive.length;

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
    <div className="p-6 space-y-4">
      <div className="flex items-center gap-2">
        <ClipboardCheck className="h-6 w-6 text-muted-foreground" />
        <h1 className="text-2xl font-bold" data-testid="text-page-title">Housekeeping</h1>
      </div>

      <Tabs defaultValue="rooms">
        <TabsList>
          <TabsTrigger value="rooms">Habitaciones</TabsTrigger>
          <TabsTrigger value="lost-found" data-testid="tab-lost-found" className="gap-1">
            <Package className="h-4 w-4" />
            Objetos Perdidos
            {lostFoundCount > 0 && (
              <Badge className="ml-1 h-5 min-w-5 px-1 text-xs bg-amber-500 text-white border-0 flex items-center justify-center">
                {lostFoundCount}
              </Badge>
            )}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="rooms">
          <div className="space-y-6 mt-2">
            <div className="flex items-center justify-end gap-2">
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
          </div>
        </TabsContent>

        <TabsContent value="lost-found">
          <LostFoundTab />
        </TabsContent>
      </Tabs>

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
