import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import {
  DoorOpen,
  Plus,
  Search,
  Filter,
  MoreHorizontal,
  Pencil,
  Trash2,
  Wrench,
  Sparkles,
  CheckCircle,
  Accessibility,
  Fence,
  BedDouble,
  Sofa,
  ShowerHead,
  BedSingle,
  Users,
  Home,
  AlertTriangle,
  ReceiptText,
  X,
} from "lucide-react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { queryClient, apiRequest } from "@/lib/queryClient";
import type { RoomWithType, RoomType, InsertRoom, RoomStatus, ChargeType } from "@shared/schema";

function RoomStatusBadge({ status }: { status: RoomStatus }) {
  const statusConfig: Record<RoomStatus, { label: string; className: string }> = {
    available: { label: "Disponible", className: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400" },
    occupied: { label: "Ocupada", className: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400" },
    dirty: { label: "Sucia", className: "bg-orange-200 text-orange-900 dark:bg-orange-900/40 dark:text-orange-400" },
    cleaning: { label: "Limpieza", className: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400" },
    maintenance: { label: "Mantenimiento", className: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400" },
    oos: { label: "Fuera de Servicio", className: "bg-gray-100 text-gray-800 dark:bg-gray-900/30 dark:text-gray-400" },
  };

  const config = statusConfig[status];

  return <Badge className={config.className}>{config.label}</Badge>;
}

const featureConfig: Record<string, { icon: typeof Accessibility; label: string }> = {
  accessible: { icon: Accessibility, label: "Accesible" },
  balcony: { icon: Fence, label: "Balcon" },
  separable_bed: { icon: BedDouble, label: "Cama separable" },
  sofa_bed: { icon: Sofa, label: "Sofa cama" },
  shower_only: { icon: ShowerHead, label: "Solo ducha" },
  extra_bed: { icon: BedSingle, label: "Cama extra" },
  twin_config: { icon: BedSingle, label: "Config. Twin" },
  living_room: { icon: Home, label: "Living" },
};

function RoomFeatures({ features, maxOccupancy }: { features?: string[] | null; maxOccupancy?: number | null }) {
  if (!features || features.length === 0) {
    return maxOccupancy ? (
      <div className="flex items-center gap-1 text-muted-foreground">
        <Users className="h-3 w-3" />
        <span className="text-xs">{maxOccupancy}</span>
      </div>
    ) : null;
  }

  return (
    <div className="flex items-center gap-1 flex-wrap">
      {maxOccupancy && (
        <Tooltip>
          <TooltipTrigger asChild>
            <div className="flex items-center gap-0.5 text-muted-foreground">
              <Users className="h-3 w-3" />
              <span className="text-xs">{maxOccupancy}</span>
            </div>
          </TooltipTrigger>
          <TooltipContent>Max. {maxOccupancy} pax</TooltipContent>
        </Tooltip>
      )}
      {features.map((feature) => {
        const config = featureConfig[feature];
        if (!config) return null;
        const Icon = config.icon;
        return (
          <Tooltip key={feature}>
            <TooltipTrigger asChild>
              <div className="text-muted-foreground">
                <Icon className="h-3.5 w-3.5" />
              </div>
            </TooltipTrigger>
            <TooltipContent>{config.label}</TooltipContent>
          </Tooltip>
        );
      })}
    </div>
  );
}

function RoomFormDialog({
  room,
  roomTypes,
  open,
  onOpenChange,
  onSuccess,
}: {
  room?: RoomWithType;
  roomTypes: RoomType[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
}) {
  const { toast } = useToast();
  const isEditing = !!room;

  const [formData, setFormData] = useState<Partial<InsertRoom>>({
    roomNumber: room?.roomNumber || "",
    roomTypeId: room?.roomTypeId || "",
    floor: room?.floor || 1,
    status: room?.status || "available",
    notes: room?.notes || "",
  });

  useEffect(() => {
    if (open) {
      setFormData({
        roomNumber: room?.roomNumber || "",
        roomTypeId: room?.roomTypeId || "",
        floor: room?.floor || 1,
        status: room?.status || "available",
        notes: room?.notes || "",
      });
    }
  }, [open, room?.id]);

  const mutation = useMutation({
    mutationFn: async (data: Partial<InsertRoom>) => {
      if (isEditing) {
        return apiRequest("PATCH", `/api/rooms/${room.id}`, data);
      }
      return apiRequest("POST", "/api/rooms", data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/rooms"] });
      queryClient.invalidateQueries({ queryKey: ["/api/dashboard/stats"] });
      toast({
        title: isEditing ? "Habitación actualizada" : "Habitación creada",
        description: `La habitación ${formData.roomNumber} ha sido ${isEditing ? "actualizada" : "creada"} exitosamente.`,
      });
      onSuccess();
      onOpenChange(false);
    },
    onError: () => {
      toast({
        title: "Error",
        description: "No se pudo guardar la habitación. Intente nuevamente.",
        variant: "destructive",
      });
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    mutation.mutate(formData);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>{isEditing ? "Editar Habitación" : "Nueva Habitación"}</DialogTitle>
          <DialogDescription>
            {isEditing
              ? "Modifica los detalles de la habitación."
              : "Ingresa los datos para crear una nueva habitación."}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit}>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="roomNumber">Número de Habitación</Label>
              <Input
                id="roomNumber"
                value={formData.roomNumber}
                onChange={(e) => setFormData({ ...formData, roomNumber: e.target.value })}
                placeholder="101"
                required
                data-testid="input-room-number"
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="roomType">Tipo de Habitación</Label>
              <Select
                value={formData.roomTypeId}
                onValueChange={(value) => setFormData({ ...formData, roomTypeId: value })}
              >
                <SelectTrigger data-testid="select-room-type">
                  <SelectValue placeholder="Seleccionar tipo" />
                </SelectTrigger>
                <SelectContent>
                  {roomTypes.filter(type => type.id).map((type) => (
                    <SelectItem key={type.id} value={type.id}>
                      {type.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="floor">Piso</Label>
              <Input
                id="floor"
                type="number"
                min={1}
                value={formData.floor}
                onChange={(e) => setFormData({ ...formData, floor: parseInt(e.target.value) })}
                data-testid="input-floor"
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="status">Estado</Label>
              <Select
                value={formData.status}
                onValueChange={(value) => setFormData({ ...formData, status: value as RoomStatus })}
              >
                <SelectTrigger data-testid="select-status">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="available">Disponible</SelectItem>
                  <SelectItem value="occupied">Ocupada</SelectItem>
                  <SelectItem value="dirty">Sucia</SelectItem>
                  <SelectItem value="cleaning">Limpieza</SelectItem>
                  <SelectItem value="maintenance">Mantenimiento</SelectItem>
                  <SelectItem value="oos">Fuera de Servicio</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="notes">Notas</Label>
              <Textarea
                id="notes"
                value={formData.notes || ""}
                onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                placeholder="Notas adicionales..."
                data-testid="input-notes"
              />
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button type="submit" disabled={mutation.isPending} data-testid="button-submit-room">
              {mutation.isPending ? "Guardando..." : isEditing ? "Guardar Cambios" : "Crear Habitación"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export default function RoomsPage() {
  const { toast } = useToast();
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [typeFilter, setTypeFilter] = useState<string>("all");
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [selectedRoom, setSelectedRoom] = useState<RoomWithType | undefined>();
  const [maintenanceTarget, setMaintenanceTarget] = useState<RoomWithType | null>(null);
  const [maintenanceDescription, setMaintenanceDescription] = useState("");

  // ── Charge Types panel ──────────────────────────────────────────────────────
  const [chargesSheetOpen, setChargesSheetOpen] = useState(false);
  const [editingCT, setEditingCT] = useState<ChargeType | null>(null);
  const [ctLabel, setCtLabel] = useState("");
  const [ctDescription, setCtDescription] = useState("");
  const [ctAmount, setCtAmount] = useState("");
  const [ctCategory, setCtCategory] = useState("otros");
  const [ctAllowPriceEdit, setCtAllowPriceEdit] = useState(false);
  const [ctFormOpen, setCtFormOpen] = useState(false);
  const [deletingCTId, setDeletingCTId] = useState<string | null>(null);

  const { data: chargeTypesList = [] } = useQuery<ChargeType[]>({
    queryKey: ["/api/charge-types"],
    enabled: chargesSheetOpen,
  });

  function openNewCT() {
    setEditingCT(null);
    setCtLabel(""); setCtDescription(""); setCtAmount(""); setCtCategory("otros"); setCtAllowPriceEdit(false);
    setCtFormOpen(true);
  }
  function openEditCT(ct: ChargeType) {
    setEditingCT(ct);
    setCtLabel(ct.label); setCtDescription(ct.description);
    setCtAmount(String(ct.defaultAmount)); setCtCategory(ct.category);
    setCtAllowPriceEdit(ct.allowPriceEdit ?? false);
    setCtFormOpen(true);
  }

  const saveCTMutation = useMutation({
    mutationFn: () => editingCT
      ? apiRequest("PATCH", `/api/charge-types/${editingCT.id}`, { label: ctLabel, description: ctDescription, defaultAmount: parseFloat(ctAmount), category: ctCategory, allowPriceEdit: ctAllowPriceEdit })
      : apiRequest("POST", "/api/charge-types", { label: ctLabel, description: ctDescription, defaultAmount: parseFloat(ctAmount), category: ctCategory, allowPriceEdit: ctAllowPriceEdit }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/charge-types"] });
      setCtFormOpen(false);
      toast({ title: editingCT ? "Cargo actualizado" : "Cargo creado" });
    },
    onError: (e: any) => toast({ title: "Error", description: e?.message, variant: "destructive" }),
  });

  const deleteCTMutation = useMutation({
    mutationFn: (id: string) => apiRequest("DELETE", `/api/charge-types/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/charge-types"] });
      setDeletingCTId(null);
      toast({ title: "Cargo eliminado" });
    },
    onError: (e: any) => toast({ title: "Error", description: e?.message, variant: "destructive" }),
  });

  const CT_CATEGORIES = [
    { value: "otros", label: "Otros" },
    { value: "restaurant", label: "Restaurant" },
    { value: "spa", label: "SPA" },
    { value: "minibar", label: "Minibar" },
    { value: "room", label: "Habitación" },
    { value: "adjustment", label: "Ajuste" },
  ];

  const { data: rooms, isLoading } = useQuery<RoomWithType[]>({
    queryKey: ["/api/rooms"],
  });

  const { data: roomTypes } = useQuery<RoomType[]>({
    queryKey: ["/api/room-types"],
  });

  const { data: workOrders } = useQuery<any[]>({
    queryKey: ["/api/maintenance/work-orders"],
  });

  const openWorkOrderRoomIds = new Set(
    (workOrders || [])
      .filter((wo) => wo.status === "pending" || wo.status === "in_progress")
      .map((wo) => wo.roomId)
      .filter(Boolean)
  );

  const updateStatusMutation = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: RoomStatus }) => {
      return apiRequest("PATCH", `/api/rooms/${id}`, { status });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/rooms"] });
      queryClient.invalidateQueries({ queryKey: ["/api/dashboard/stats"] });
      toast({ title: "Estado actualizado", description: "El estado de la habitación ha sido actualizado." });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      return apiRequest("DELETE", `/api/rooms/${id}`, undefined);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/rooms"] });
      queryClient.invalidateQueries({ queryKey: ["/api/dashboard/stats"] });
      toast({ title: "Habitación eliminada", description: "La habitación ha sido eliminada del sistema." });
    },
  });

  const createWorkOrderMutation = useMutation({
    mutationFn: async ({ roomId, roomNumber, description }: { roomId: string; roomNumber: string; description: string }) => {
      return apiRequest("POST", "/api/maintenance/work-orders", {
        title: `Reporte hab. ${roomNumber}`,
        description: description || null,
        roomId,
        category: "general",
        priority: "medium",
        status: "pending",
        reportedBy: "Recepción",
        reportedAt: new Date().toISOString(),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/maintenance/work-orders"] });
      toast({
        title: "Reporte enviado",
        description: "Se creó una orden de trabajo en Mantenimiento. La habitación no fue bloqueada.",
      });
      setMaintenanceTarget(null);
      setMaintenanceDescription("");
    },
    onError: () => {
      toast({ title: "Error", description: "No se pudo crear la orden de trabajo.", variant: "destructive" });
    },
  });

  const filteredRooms = rooms?.filter((room) => {
    const matchesSearch = room.roomNumber.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesStatus = statusFilter === "all" || room.status === statusFilter;
    const matchesType = typeFilter === "all" || room.roomTypeId === typeFilter;
    return matchesSearch && matchesStatus && matchesType;
  })?.sort((a, b) => {
    if (a.floor !== b.floor) return a.floor - b.floor;
    const numA = parseInt(a.roomNumber.replace(/\D/g, ''), 10) || 0;
    const numB = parseInt(b.roomNumber.replace(/\D/g, ''), 10) || 0;
    if (numA !== numB) return numA - numB;
    return a.roomNumber.localeCompare(b.roomNumber);
  });

  const handleEditRoom = (room: RoomWithType) => {
    setSelectedRoom(room);
    setDialogOpen(true);
  };

  const handleNewRoom = () => {
    setSelectedRoom(undefined);
    setDialogOpen(true);
  };

  const statusCounts = {
    all: rooms?.length || 0,
    available: rooms?.filter((r) => r.status === "available").length || 0,
    occupied: rooms?.filter((r) => r.status === "occupied").length || 0,
    dirty: rooms?.filter((r) => r.status === "dirty").length || 0,
    cleaning: rooms?.filter((r) => r.status === "cleaning").length || 0,
    maintenance: rooms?.filter((r) => r.status === "maintenance").length || 0,
    oos: rooms?.filter((r) => r.status === "oos").length || 0,
  };

  return (
    <div className="flex flex-col gap-6 p-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight" data-testid="text-rooms-title">
            Habitaciones
          </h1>
          <p className="text-muted-foreground">Gestiona el inventario de habitaciones del hotel</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => setChargesSheetOpen(true)} data-testid="button-charge-types">
            <ReceiptText className="mr-2 h-4 w-4" />
            Cargos en habitaciones
          </Button>
          <Button onClick={handleNewRoom} data-testid="button-new-room">
            <Plus className="mr-2 h-4 w-4" />
            Nueva Habitación
          </Button>
        </div>
      </div>

      {/* Status Summary Cards */}
      <div className="grid gap-4 md:grid-cols-6">
        {[
          { key: "all", label: "Total", color: "bg-muted" },
          { key: "available", label: "Disponibles", color: "bg-green-100 dark:bg-green-900/30" },
          { key: "occupied", label: "Ocupadas", color: "bg-blue-100 dark:bg-blue-900/30" },
          { key: "dirty", label: "Sucias", color: "bg-orange-200 dark:bg-orange-900/30" },
          { key: "cleaning", label: "Limpieza", color: "bg-yellow-100 dark:bg-yellow-900/30" },
          { key: "maintenance", label: "Mantenimiento", color: "bg-red-100 dark:bg-red-900/30" },
        ].map(({ key, label, color }) => (
          <Card
            key={key}
            className={`cursor-pointer hover-elevate ${statusFilter === key ? "ring-2 ring-primary" : ""}`}
            onClick={() => setStatusFilter(key)}
          >
            <CardContent className={`p-4 ${color} rounded-lg`}>
              <div className="text-2xl font-bold">{statusCounts[key as keyof typeof statusCounts]}</div>
              <div className="text-sm text-muted-foreground">{label}</div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="p-4">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Buscar por número de habitación..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10"
                data-testid="input-search-rooms"
              />
            </div>
            <Select value={typeFilter} onValueChange={setTypeFilter}>
              <SelectTrigger className="w-[180px]" data-testid="select-filter-type">
                <Filter className="mr-2 h-4 w-4" />
                <SelectValue placeholder="Tipo" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos los tipos</SelectItem>
                {roomTypes?.filter(type => type.id).map((type) => (
                  <SelectItem key={type.id} value={type.id}>
                    {type.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <div className="flex gap-1">
              <Button
                variant={viewMode === "grid" ? "default" : "outline"}
                size="icon"
                onClick={() => setViewMode("grid")}
                data-testid="button-view-grid"
              >
                <DoorOpen className="h-4 w-4" />
              </Button>
              <Button
                variant={viewMode === "list" ? "default" : "outline"}
                size="icon"
                onClick={() => setViewMode("list")}
                data-testid="button-view-list"
              >
                <MoreHorizontal className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Rooms Display */}
      {isLoading ? (
        <div className={viewMode === "grid" ? "grid gap-4 md:grid-cols-3 lg:grid-cols-4" : ""}>
          {[...Array(8)].map((_, i) => (
            <Skeleton key={i} className={viewMode === "grid" ? "h-32" : "h-16 mb-2"} />
          ))}
        </div>
      ) : filteredRooms && filteredRooms.length > 0 ? (
        viewMode === "grid" ? (
          <div className="grid gap-4 md:grid-cols-3 lg:grid-cols-4">
            {filteredRooms.map((room) => (
              <Card
                key={room.id}
                className={`hover-elevate cursor-pointer ${
                  room.status === "available"
                    ? "border-green-200 dark:border-green-800"
                    : room.status === "occupied"
                    ? "border-blue-200 dark:border-blue-800"
                    : room.status === "dirty"
                    ? "border-orange-400 dark:border-orange-700"
                    : room.status === "cleaning"
                    ? "border-yellow-200 dark:border-yellow-800"
                    : "border-red-200 dark:border-red-800"
                }`}
                data-testid={`room-card-${room.id}`}
              >
                <CardHeader className="pb-2">
                  <div className="flex items-center justify-between gap-2">
                    <CardTitle className="text-2xl">{room.roomNumber}</CardTitle>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon">
                          <MoreHorizontal className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => handleEditRoom(room)}>
                          <Pencil className="mr-2 h-4 w-4" />
                          Editar
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem
                          onClick={() => updateStatusMutation.mutate({ id: room.id, status: "available" })}
                        >
                          <CheckCircle className="mr-2 h-4 w-4 text-green-600" />
                          Marcar Disponible
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          onClick={() => updateStatusMutation.mutate({ id: room.id, status: "cleaning" })}
                        >
                          <Sparkles className="mr-2 h-4 w-4 text-yellow-600" />
                          Enviar a Limpieza
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          onClick={() => { setMaintenanceTarget(room); setMaintenanceDescription(""); }}
                        >
                          <Wrench className="mr-2 h-4 w-4 text-orange-500" />
                          Reportar a Mantenimiento
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem
                          className="text-destructive"
                          onClick={() => deleteMutation.mutate(room.id)}
                        >
                          <Trash2 className="mr-2 h-4 w-4" />
                          Eliminar
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                  <CardDescription>Piso {room.floor}</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="flex flex-col gap-2">
                    <div className="flex items-center gap-2 flex-wrap">
                      <RoomStatusBadge status={room.status} />
                      <span className="text-sm text-muted-foreground">
                        {room.roomType?.name || "Sin tipo"}
                      </span>
                      {openWorkOrderRoomIds.has(room.id) && (
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <span className="inline-flex items-center gap-1 rounded-full bg-orange-100 dark:bg-orange-900/30 px-2 py-0.5 text-xs font-medium text-orange-700 dark:text-orange-400">
                              <AlertTriangle className="h-3 w-3" />
                              Mant. pendiente
                            </span>
                          </TooltipTrigger>
                          <TooltipContent>Tiene una orden de mantenimiento abierta</TooltipContent>
                        </Tooltip>
                      )}
                    </div>
                    <RoomFeatures features={room.features} maxOccupancy={room.maxOccupancy} />
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        ) : (
          <Card>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Numero</TableHead>
                  <TableHead>Tipo</TableHead>
                  <TableHead>Piso</TableHead>
                  <TableHead>Pax</TableHead>
                  <TableHead>Caracteristicas</TableHead>
                  <TableHead>Estado</TableHead>
                  <TableHead className="w-[50px]"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredRooms.map((room) => (
                  <TableRow key={room.id} data-testid={`room-row-${room.id}`}>
                    <TableCell className="font-medium">{room.roomNumber}</TableCell>
                    <TableCell>{room.roomType?.name || "Sin tipo"}</TableCell>
                    <TableCell>{room.floor}</TableCell>
                    <TableCell>{room.maxOccupancy || 2}</TableCell>
                    <TableCell>
                      <RoomFeatures features={room.features} />
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2 flex-wrap">
                        <RoomStatusBadge status={room.status} />
                        {openWorkOrderRoomIds.has(room.id) && (
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <span className="inline-flex items-center gap-1 rounded-full bg-orange-100 dark:bg-orange-900/30 px-2 py-0.5 text-xs font-medium text-orange-700 dark:text-orange-400">
                                <AlertTriangle className="h-3 w-3" />
                                Mant.
                              </span>
                            </TooltipTrigger>
                            <TooltipContent>Tiene una orden de mantenimiento abierta</TooltipContent>
                          </Tooltip>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon">
                            <MoreHorizontal className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={() => handleEditRoom(room)}>
                            <Pencil className="mr-2 h-4 w-4" />
                            Editar
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem
                            onClick={() => updateStatusMutation.mutate({ id: room.id, status: "available" })}
                          >
                            <CheckCircle className="mr-2 h-4 w-4 text-green-600" />
                            Marcar Disponible
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            onClick={() => updateStatusMutation.mutate({ id: room.id, status: "cleaning" })}
                          >
                            <Sparkles className="mr-2 h-4 w-4 text-yellow-600" />
                            Enviar a Limpieza
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            onClick={() => { setMaintenanceTarget(room); setMaintenanceDescription(""); }}
                          >
                            <Wrench className="mr-2 h-4 w-4 text-orange-500" />
                            Reportar a Mantenimiento
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem
                            className="text-destructive"
                            onClick={() => deleteMutation.mutate(room.id)}
                          >
                            <Trash2 className="mr-2 h-4 w-4" />
                            Eliminar
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Card>
        )
      ) : (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12 text-center">
            <DoorOpen className="h-16 w-16 text-muted-foreground/50 mb-4" />
            <h3 className="text-lg font-semibold mb-2">No hay habitaciones</h3>
            <p className="text-muted-foreground mb-4">
              {searchQuery || statusFilter !== "all" || typeFilter !== "all"
                ? "No se encontraron habitaciones con los filtros aplicados."
                : "Comienza agregando la primera habitación del hotel."}
            </p>
            {!searchQuery && statusFilter === "all" && typeFilter === "all" && (
              <Button onClick={handleNewRoom}>
                <Plus className="mr-2 h-4 w-4" />
                Agregar Primera Habitación
              </Button>
            )}
          </CardContent>
        </Card>
      )}

      {/* Room Form Dialog */}
      <RoomFormDialog
        room={selectedRoom}
        roomTypes={roomTypes || []}
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        onSuccess={() => setSelectedRoom(undefined)}
      />

      {/* Maintenance Report Dialog */}
      <Dialog open={!!maintenanceTarget} onOpenChange={(o) => { if (!o) { setMaintenanceTarget(null); setMaintenanceDescription(""); } }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Wrench className="h-5 w-5 text-orange-500" />
              Reportar problema — Hab. {maintenanceTarget?.roomNumber}
            </DialogTitle>
            <DialogDescription>
              Se creará una orden de trabajo en el módulo de Mantenimiento. La habitación <strong>no será bloqueada</strong>.
            </DialogDescription>
          </DialogHeader>
          <div className="py-2">
            <label className="text-sm font-medium mb-1.5 block">Descripción del problema (opcional)</label>
            <Textarea
              placeholder="Ej: Grifo con pérdida, lámpara quemada, aire acondicionado sin frío..."
              value={maintenanceDescription}
              onChange={(e) => setMaintenanceDescription(e.target.value)}
              rows={3}
              data-testid="input-maintenance-description"
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setMaintenanceTarget(null); setMaintenanceDescription(""); }}>
              Cancelar
            </Button>
            <Button
              onClick={() => {
                if (maintenanceTarget) {
                  createWorkOrderMutation.mutate({
                    roomId: maintenanceTarget.id,
                    roomNumber: maintenanceTarget.roomNumber,
                    description: maintenanceDescription,
                  });
                }
              }}
              disabled={createWorkOrderMutation.isPending}
              data-testid="button-submit-maintenance"
            >
              {createWorkOrderMutation.isPending ? "Enviando..." : "Enviar a Mantenimiento"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Dialog: Cargos en Habitaciones ────────────────────────────────── */}
      <Dialog open={chargesSheetOpen} onOpenChange={v => { setChargesSheetOpen(v); if (!v) setCtFormOpen(false); }}>
        <DialogContent className="max-w-lg flex flex-col max-h-[85vh]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ReceiptText className="h-5 w-5 text-primary" />
              Cargos en habitaciones
            </DialogTitle>
            <DialogDescription>
              Cargos predefinidos que aparecen al agregar consumos a una reserva.
            </DialogDescription>
          </DialogHeader>

          <div className="flex-1 overflow-y-auto space-y-3 pr-1">
            {chargeTypesList.length === 0 && (
              <p className="text-sm text-muted-foreground text-center py-8">Sin cargos configurados</p>
            )}
            {chargeTypesList.map(ct => (
              <div key={ct.id} className="flex items-center gap-3 border rounded-lg px-3 py-2.5">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5">
                    <p className="text-sm font-medium truncate">{ct.label}</p>
                    {ct.allowPriceEdit && (
                      <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400 shrink-0">Variable</span>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground">{ct.description} · {ct.category}</p>
                </div>
                <span className="text-sm font-semibold shrink-0 tabular-nums">
                  {ct.allowPriceEdit
                    ? <span className="text-muted-foreground italic text-xs">ref. ${parseFloat(String(ct.defaultAmount)).toLocaleString("es-AR")}</span>
                    : `$${parseFloat(String(ct.defaultAmount)).toLocaleString("es-AR")}`
                  }
                </span>
                <div className="flex gap-1 shrink-0">
                  <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => openEditCT(ct)} data-testid={`btn-edit-ct-${ct.id}`}>
                    <Pencil className="h-3.5 w-3.5" />
                  </Button>
                  {deletingCTId === ct.id ? (
                    <div className="flex gap-1">
                      <Button size="icon" variant="destructive" className="h-7 w-7" onClick={() => deleteCTMutation.mutate(ct.id)}>
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                      <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => setDeletingCTId(null)}>
                        <X className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  ) : (
                    <Button size="icon" variant="ghost" className="h-7 w-7 text-muted-foreground hover:text-destructive" onClick={() => setDeletingCTId(ct.id)} data-testid={`btn-delete-ct-${ct.id}`}>
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  )}
                </div>
              </div>
            ))}
          </div>

          {/* Inline form to create / edit */}
          {ctFormOpen ? (
            <div className="border-t pt-4 space-y-3">
              <p className="text-sm font-semibold">{editingCT ? "Editar cargo" : "Nuevo cargo"}</p>
              <div className="space-y-1.5">
                <Label htmlFor="ct-label">Nombre visible</Label>
                <Input id="ct-label" value={ctLabel} onChange={e => setCtLabel(e.target.value)} placeholder="Ej: Cochera (por día)" data-testid="input-ct-label" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="ct-desc">Descripción (aparece en el folio)</Label>
                <Input id="ct-desc" value={ctDescription} onChange={e => setCtDescription(e.target.value)} placeholder="Ej: Cochera" data-testid="input-ct-description" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="ct-amount">{ctAllowPriceEdit ? "Precio de referencia ($)" : "Precio por defecto ($)"}</Label>
                  <Input id="ct-amount" type="number" min="0" step="0.01" value={ctAmount} onChange={e => setCtAmount(e.target.value)} data-testid="input-ct-amount" />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="ct-category">Categoría</Label>
                  <Select value={ctCategory} onValueChange={setCtCategory}>
                    <SelectTrigger id="ct-category" data-testid="select-ct-category"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {CT_CATEGORIES.map(c => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div
                className={`flex items-start gap-3 rounded-lg border px-3 py-2.5 cursor-pointer transition-colors ${ctAllowPriceEdit ? "border-primary/40 bg-primary/5" : "border-border bg-muted/20"}`}
                onClick={() => setCtAllowPriceEdit(v => !v)}
                data-testid="toggle-ct-allow-price-edit"
              >
                <div className={`mt-0.5 h-4 w-4 shrink-0 rounded border-2 flex items-center justify-center transition-colors ${ctAllowPriceEdit ? "bg-primary border-primary" : "border-muted-foreground/40"}`}>
                  {ctAllowPriceEdit && <svg className="h-2.5 w-2.5 text-primary-foreground" fill="none" viewBox="0 0 12 12"><path d="M2 6l3 3 5-5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>}
                </div>
                <div>
                  <p className="text-sm font-medium leading-none">Precio variable</p>
                  <p className="text-xs text-muted-foreground mt-0.5">El recepcionista ingresa el importe al cargar este cargo</p>
                </div>
              </div>
              <div className="flex gap-2 pt-1">
                <Button variant="outline" className="flex-1" onClick={() => setCtFormOpen(false)}>Cancelar</Button>
                <Button
                  className="flex-1"
                  disabled={!ctLabel.trim() || !ctDescription.trim() || !ctAmount || parseFloat(ctAmount) <= 0 || saveCTMutation.isPending}
                  onClick={() => saveCTMutation.mutate()}
                  data-testid="btn-save-ct"
                >
                  {saveCTMutation.isPending ? "Guardando…" : "Guardar"}
                </Button>
              </div>
            </div>
          ) : (
            <div className="border-t pt-4">
              <Button className="w-full" variant="outline" onClick={openNewCT} data-testid="btn-new-ct">
                <Plus className="mr-2 h-4 w-4" />
                Agregar nuevo cargo
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
