import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { useToast } from "@/hooks/use-toast";
import { 
  Plus, 
  UtensilsCrossed, 
  Users, 
  CircleDollarSign, 
  Clock, 
  MapPin, 
  Square, 
  Circle, 
  RectangleHorizontal,
  X,
  CreditCard,
  Loader2,
  CalendarDays,
  Phone,
  Mail,
  Trash2,
  Check,
  XCircle,
} from "lucide-react";

type RestaurantArea = {
  id: string;
  name: string;
  areaType: "indoor" | "outdoor" | "terrace" | "bar" | "private";
  capacity: number;
  isActive: string;
  notes: string | null;
};

type RestaurantTable = {
  id: string;
  tableNumber: string;
  areaId: string;
  capacity: number;
  shape: "square" | "round" | "rectangular";
  status: "available" | "occupied" | "reserved" | "cleaning" | "blocked";
  positionX: number;
  positionY: number;
  isActive: string;
  area?: RestaurantArea;
};

type MenuCategory = {
  id: string;
  name: string;
  description: string | null;
  displayOrder: number | null;
  isActive: string | null;
};

type MenuItem = {
  id: string;
  categoryId: string;
  name: string;
  description: string | null;
  price: string;
  preparationTime: number | null;
  isAvailable: string | null;
  isActive: string | null;
  allergens: string | null;
  displayOrder: number | null;
  category?: MenuCategory;
};

type RestaurantOrder = {
  id: string;
  orderNumber: string;
  tableId: string | null;
  status: "open" | "in_progress" | "served" | "closed" | "cancelled";
  covers: number;
  subtotal: string;
  tax: string;
  total: string;
  openedAt: string;
  table?: RestaurantTable;
  items?: Array<{
    id: string;
    menuItemId: string;
    quantity: number;
    unitPrice: string;
    subtotal: string;
    menuItem?: MenuItem;
  }>;
};

type TableReservation = {
  id: string;
  tableId: string;
  guestName: string;
  guestPhone: string | null;
  guestEmail: string | null;
  partySize: number;
  reservationDate: string;
  reservationTime: string;
  status: "pending" | "confirmed" | "seated" | "completed" | "cancelled" | "no_show";
  notes: string | null;
  createdAt: string;
  table?: RestaurantTable;
};

const reservationStatusColors: Record<string, string> = {
  pending: "bg-yellow-500/20 text-yellow-700 dark:text-yellow-400",
  confirmed: "bg-blue-500/20 text-blue-700 dark:text-blue-400",
  seated: "bg-green-500/20 text-green-700 dark:text-green-400",
  completed: "bg-gray-500/20 text-gray-700 dark:text-gray-400",
  cancelled: "bg-red-500/20 text-red-700 dark:text-red-400",
  no_show: "bg-orange-500/20 text-orange-700 dark:text-orange-400",
};

const reservationStatusLabels: Record<string, string> = {
  pending: "Pendiente",
  confirmed: "Confirmada",
  seated: "Sentado",
  completed: "Completada",
  cancelled: "Cancelada",
  no_show: "No se presento",
};

const reservationFormSchema = z.object({
  tableId: z.string().min(1, "Debe seleccionar una mesa"),
  guestName: z.string().min(1, "El nombre es requerido"),
  guestPhone: z.string().optional(),
  guestEmail: z.string().email("Email invalido").optional().or(z.literal("")),
  partySize: z.coerce.number().min(1, "Minimo 1 persona"),
  reservationDate: z.string().min(1, "La fecha es requerida"),
  reservationTime: z.string().min(1, "La hora es requerida"),
  notes: z.string().optional(),
});

type ReservationFormValues = z.infer<typeof reservationFormSchema>;

const tableStatusColors: Record<string, string> = {
  available: "bg-green-500/20 text-green-700 dark:text-green-400",
  occupied: "bg-red-500/20 text-red-700 dark:text-red-400",
  reserved: "bg-blue-500/20 text-blue-700 dark:text-blue-400",
  cleaning: "bg-yellow-500/20 text-yellow-700 dark:text-yellow-400",
  blocked: "bg-gray-500/20 text-gray-700 dark:text-gray-400",
};

const tableStatusLabels: Record<string, string> = {
  available: "Disponible",
  occupied: "Ocupada",
  reserved: "Reservada",
  cleaning: "Limpieza",
  blocked: "Bloqueada",
};

const areaTypeLabels: Record<string, string> = {
  indoor: "Interior",
  outdoor: "Exterior",
  terrace: "Terraza",
  bar: "Bar",
  private: "Privado",
};

export default function RestaurantPage() {
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState("floor");
  const [selectedArea, setSelectedArea] = useState<string>("all");
  const [selectedTable, setSelectedTable] = useState<RestaurantTable | null>(null);
  const [isNewOrderDialogOpen, setIsNewOrderDialogOpen] = useState(false);
  const [isOrderDialogOpen, setIsOrderDialogOpen] = useState(false);
  const [currentOrder, setCurrentOrder] = useState<RestaurantOrder | null>(null);
  const [newCovers, setNewCovers] = useState(2);
  const [orderView, setOrderView] = useState<"folio" | "menu" | "delete">("menu");
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [pendingItem, setPendingItem] = useState<MenuItem | null>(null);
  const [itemNotes, setItemNotes] = useState("");
  const [isCloseDialogOpen, setIsCloseDialogOpen] = useState(false);
  const [isReservationDialogOpen, setIsReservationDialogOpen] = useState(false);
  const [isDailyReservationsOpen, setIsDailyReservationsOpen] = useState(false);
  const [reservationDate, setReservationDate] = useState(new Date().toISOString().split("T")[0]);
  const [editingReservation, setEditingReservation] = useState<TableReservation | null>(null);

  const reservationForm = useForm<ReservationFormValues>({
    resolver: zodResolver(reservationFormSchema),
    defaultValues: {
      tableId: "",
      guestName: "",
      guestPhone: "",
      guestEmail: "",
      partySize: 2,
      reservationDate: new Date().toISOString().split("T")[0],
      reservationTime: "20:00",
      notes: "",
    },
  });

  const { data: areas = [], isLoading: areasLoading } = useQuery<RestaurantArea[]>({
    queryKey: ["/api/restaurant/areas"],
  });

  const { data: tables = [], isLoading: tablesLoading } = useQuery<RestaurantTable[]>({
    queryKey: ["/api/restaurant/tables"],
  });

  const { data: menuCategories = [] } = useQuery<MenuCategory[]>({
    queryKey: ["/api/restaurant/menu/categories"],
  });

  const { data: menuItems = [] } = useQuery<MenuItem[]>({
    queryKey: ["/api/restaurant/menu/items"],
  });

  const { data: orders = [], isLoading: ordersLoading } = useQuery<RestaurantOrder[]>({
    queryKey: ["/api/restaurant/orders"],
  });

  const { data: reservations = [] } = useQuery<TableReservation[]>({
    queryKey: ["/api/restaurant/table-reservations"],
  });

  const todayReservations = reservations.filter(r => 
    r.reservationDate === new Date().toISOString().split("T")[0] && 
    r.status !== "cancelled" && r.status !== "completed"
  );

  const createReservationMutation = useMutation({
    mutationFn: async (data: ReservationFormValues) => {
      const res = await apiRequest("POST", "/api/restaurant/table-reservations", data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/restaurant/table-reservations"] });
      setIsReservationDialogOpen(false);
      reservationForm.reset();
      toast({ title: "Reserva creada", description: "La reserva ha sido registrada" });
    },
  });

  const updateReservationMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: Partial<TableReservation> }) => {
      const res = await apiRequest("PATCH", `/api/restaurant/table-reservations/${id}`, data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/restaurant/table-reservations"] });
      setEditingReservation(null);
      toast({ title: "Reserva actualizada" });
    },
  });

  const deleteReservationMutation = useMutation({
    mutationFn: async (id: string) => {
      await apiRequest("DELETE", `/api/restaurant/table-reservations/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/restaurant/table-reservations"] });
      toast({ title: "Reserva eliminada" });
    },
  });

  const createOrderMutation = useMutation({
    mutationFn: async (data: { tableId: string; covers: number }) => {
      const res = await apiRequest("POST", "/api/restaurant/orders", data);
      return res.json();
    },
    onSuccess: (order: RestaurantOrder) => {
      queryClient.invalidateQueries({ queryKey: ["/api/restaurant/orders"] });
      queryClient.invalidateQueries({ queryKey: ["/api/restaurant/tables"] });
      setCurrentOrder(order);
      setIsNewOrderDialogOpen(false);
      setOrderView("menu");
      setSelectedCategory(null);
      setIsOrderDialogOpen(true);
      toast({ title: "Pedido creado", description: `Pedido ${order.orderNumber} iniciado` });
    },
  });

  const addItemMutation = useMutation({
    mutationFn: async (data: { orderId: string; menuItemId: string; quantity: number; notes?: string }) => {
      const res = await apiRequest("POST", `/api/restaurant/orders/${data.orderId}/items`, { 
        menuItemId: data.menuItemId, 
        quantity: data.quantity,
        notes: data.notes,
      });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/restaurant/orders"] });
      setPendingItem(null);
      setItemNotes("");
      toast({ title: "Item agregado" });
    },
  });

  const deleteItemMutation = useMutation({
    mutationFn: async (data: { orderId: string; itemId: string }) => {
      const res = await apiRequest("DELETE", `/api/restaurant/orders/${data.orderId}/items/${data.itemId}`);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/restaurant/orders"] });
      toast({ title: "Item eliminado" });
    },
  });

  const closeOrderMutation = useMutation({
    mutationFn: async (orderId: string) => {
      const res = await apiRequest("POST", `/api/restaurant/orders/${orderId}/close`, { chargeToRoom: false });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/restaurant/orders"] });
      queryClient.invalidateQueries({ queryKey: ["/api/restaurant/tables"] });
      setCurrentOrder(null);
      toast({ title: "Pedido cerrado" });
    },
  });

  const filteredTables = selectedArea === "all" 
    ? tables 
    : tables.filter((t) => t.areaId === selectedArea);

  const activeOrders = orders.filter((o) => o.status !== "closed" && o.status !== "cancelled");

  const handleTableClick = (table: RestaurantTable) => {
    setSelectedTable(table);
    if (table.status === "available") {
      setIsNewOrderDialogOpen(true);
    } else if (table.status === "occupied") {
      const tableOrder = orders.find((o) => o.tableId === table.id && o.status !== "closed" && o.status !== "cancelled");
      if (tableOrder) {
        setCurrentOrder(tableOrder);
        setOrderView("menu");
        setSelectedCategory(null);
        setIsOrderDialogOpen(true);
      }
    }
  };

  const handleConfirmItem = () => {
    if (currentOrder && pendingItem) {
      addItemMutation.mutate({
        orderId: currentOrder.id,
        menuItemId: pendingItem.id,
        quantity: 1,
        notes: itemNotes || undefined,
      });
    }
  };

  const handleCancelItem = () => {
    setPendingItem(null);
    setItemNotes("");
  };

  const getUpdatedOrder = () => {
    if (!currentOrder) return null;
    return orders.find(o => o.id === currentOrder.id) || currentOrder;
  };

  const getOrderItems = () => {
    const order = getUpdatedOrder();
    return order?.items || [];
  };

  const TableShape = ({ shape }: { shape: string }) => {
    switch (shape) {
      case "round":
        return <Circle className="h-4 w-4" />;
      case "rectangular":
        return <RectangleHorizontal className="h-4 w-4" />;
      default:
        return <Square className="h-4 w-4" />;
    }
  };

  if (areasLoading || tablesLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold" data-testid="text-page-title">Restaurante</h1>
          <p className="text-muted-foreground">Gestiona mesas, pedidos y menu</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Button 
            variant="outline" 
            onClick={() => setIsDailyReservationsOpen(true)}
            data-testid="button-daily-reservations"
          >
            <CalendarDays className="h-4 w-4 mr-2" />
            Reservas del dia
            {todayReservations.length > 0 && (
              <Badge variant="secondary" className="ml-2">{todayReservations.length}</Badge>
            )}
          </Button>
          <Badge variant="outline" className="gap-1">
            <UtensilsCrossed className="h-3 w-3" />
            {activeOrders.length} pedidos activos
          </Badge>
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="floor" data-testid="tab-floor">
            <MapPin className="h-4 w-4 mr-2" />
            Plano de Mesas
          </TabsTrigger>
          <TabsTrigger value="orders" data-testid="tab-orders">
            <Clock className="h-4 w-4 mr-2" />
            Pedidos
          </TabsTrigger>
          <TabsTrigger value="menu" data-testid="tab-menu">
            <UtensilsCrossed className="h-4 w-4 mr-2" />
            Menu
          </TabsTrigger>
          <TabsTrigger value="reservations" data-testid="tab-reservations">
            <CalendarDays className="h-4 w-4 mr-2" />
            Reservas
            {todayReservations.length > 0 && (
              <Badge variant="secondary" className="ml-2">{todayReservations.length}</Badge>
            )}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="floor" className="space-y-4">
          <div className="flex items-center gap-2 flex-wrap">
            <Select value={selectedArea} onValueChange={setSelectedArea}>
              <SelectTrigger className="w-48" data-testid="select-area">
                <SelectValue placeholder="Filtrar por area" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas las areas</SelectItem>
                {areas.map((area) => (
                  <SelectItem key={area.id} value={area.id}>
                    {area.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <div className="flex gap-2 text-sm text-muted-foreground">
              {Object.entries(tableStatusLabels).map(([key, label]) => (
                <div key={key} className="flex items-center gap-1">
                  <div className={`w-3 h-3 rounded-full ${tableStatusColors[key]}`} />
                  <span>{label}</span>
                </div>
              ))}
            </div>
          </div>

          {areas.length === 0 ? (
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-12 text-center">
                <MapPin className="h-12 w-12 text-muted-foreground mb-4" />
                <h3 className="text-lg font-semibold mb-2">Sin areas configuradas</h3>
                <p className="text-muted-foreground mb-4">Agrega areas y mesas para comenzar</p>
                <Button data-testid="button-add-area">
                  <Plus className="h-4 w-4 mr-2" />
                  Agregar Area
                </Button>
              </CardContent>
            </Card>
          ) : (
            <div className="grid gap-6">
              {(selectedArea === "all" ? areas : areas.filter((a) => a.id === selectedArea)).map((area) => {
                const areaTables = filteredTables.filter((t) => t.areaId === area.id);
                const maxX = Math.max(...areaTables.map(t => t.positionX), 3);
                const maxY = Math.max(...areaTables.map(t => t.positionY), 5);
                
                return (
                  <Card key={area.id}>
                    <CardHeader className="pb-3">
                      <div className="flex items-center justify-between gap-4 flex-wrap">
                        <CardTitle className="text-lg flex items-center gap-2">
                          {area.name}
                        </CardTitle>
                        <span className="text-sm text-muted-foreground">
                          {areaTables.length} mesas
                        </span>
                      </div>
                    </CardHeader>
                    <CardContent>
                      <div 
                        className="grid gap-2 p-4 bg-muted/30 rounded-lg"
                        style={{
                          gridTemplateColumns: `repeat(${maxX + 1}, minmax(70px, 1fr))`,
                          gridTemplateRows: `repeat(${maxY + 1}, 70px)`,
                        }}
                      >
                        {Array.from({ length: (maxX + 1) * (maxY + 1) }).map((_, idx) => {
                          const x = idx % (maxX + 1);
                          const y = Math.floor(idx / (maxX + 1));
                          const table = areaTables.find(t => t.positionX === x && t.positionY === y);
                          
                          if (!table) {
                            return <div key={`empty-${x}-${y}`} className="opacity-0" />;
                          }
                          
                          return (
                            <button
                              key={table.id}
                              onClick={() => handleTableClick(table)}
                              className={`p-2 border-2 transition-all hover-elevate flex flex-col items-center justify-center gap-1 ${
                                tableStatusColors[table.status]
                              } ${table.shape === "round" ? "rounded-full" : "rounded-md"}`}
                              style={{
                                gridColumn: x + 1,
                                gridRow: y + 1,
                              }}
                              data-testid={`table-${table.tableNumber}`}
                            >
                              <span className="font-bold text-lg">{table.tableNumber}</span>
                              <div className="flex items-center gap-1 text-xs">
                                <Users className="h-3 w-3" />
                                {table.capacity}
                              </div>
                            </button>
                          );
                        })}
                      </div>
                      {areaTables.length === 0 && (
                        <div className="text-center py-8 text-muted-foreground">
                          No hay mesas en esta area
                        </div>
                      )}
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </TabsContent>

        <TabsContent value="orders" className="space-y-4">
          {ordersLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : activeOrders.length === 0 ? (
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-12 text-center">
                <UtensilsCrossed className="h-12 w-12 text-muted-foreground mb-4" />
                <h3 className="text-lg font-semibold mb-2">Sin pedidos activos</h3>
                <p className="text-muted-foreground">Los pedidos aparecerán aquí cuando las mesas esten ocupadas</p>
              </CardContent>
            </Card>
          ) : (
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {activeOrders.map((order) => (
                <Card key={order.id} data-testid={`order-card-${order.orderNumber}`}>
                  <CardHeader className="pb-2">
                    <div className="flex items-center justify-between gap-2">
                      <CardTitle className="text-base">{order.orderNumber}</CardTitle>
                      <Badge variant={order.status === "open" ? "default" : "secondary"}>
                        {order.status === "open" ? "Abierto" : order.status === "in_progress" ? "En Proceso" : "Servido"}
                      </Badge>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    {order.table && (
                      <div className="flex items-center gap-2 text-sm">
                        <MapPin className="h-4 w-4 text-muted-foreground" />
                        Mesa {order.table.tableNumber}
                      </div>
                    )}
                    <div className="flex items-center gap-2 text-sm">
                      <Users className="h-4 w-4 text-muted-foreground" />
                      {order.covers} comensales
                    </div>
                    <div className="flex items-center gap-2 text-sm">
                      <Clock className="h-4 w-4 text-muted-foreground" />
                      {new Date(order.openedAt).toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit" })}
                    </div>
                    <div className="pt-2 border-t flex items-center justify-between">
                      <span className="font-semibold">Total:</span>
                      <span className="text-lg font-bold">
                        ${parseFloat(order.total).toLocaleString("es-AR", { minimumFractionDigits: 2 })}
                      </span>
                    </div>
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        className="flex-1"
                        onClick={() => {
                          setCurrentOrder(order);
                          setOrderView("menu");
                          setSelectedCategory(null);
                          setIsOrderDialogOpen(true);
                        }}
                        data-testid={`button-add-items-${order.orderNumber}`}
                      >
                        <Plus className="h-4 w-4 mr-1" />
                        Items
                      </Button>
                      <Button
                        size="sm"
                        className="flex-1"
                        onClick={() => closeOrderMutation.mutate(order.id)}
                        disabled={closeOrderMutation.isPending}
                        data-testid={`button-close-${order.orderNumber}`}
                      >
                        <CreditCard className="h-4 w-4 mr-1" />
                        Cerrar
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="menu" className="space-y-4">
          <div className="flex items-center justify-between gap-4 flex-wrap">
            <h2 className="text-lg font-semibold">Carta del Restaurante</h2>
            <Button data-testid="button-add-menu-item">
              <Plus className="h-4 w-4 mr-2" />
              Agregar Plato
            </Button>
          </div>
          {menuCategories.length === 0 ? (
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-12 text-center">
                <UtensilsCrossed className="h-12 w-12 text-muted-foreground mb-4" />
                <h3 className="text-lg font-semibold mb-2">Menu vacio</h3>
                <p className="text-muted-foreground mb-4">Agrega categorias y platos al menu</p>
                <Button data-testid="button-add-category">
                  <Plus className="h-4 w-4 mr-2" />
                  Agregar Categoria
                </Button>
              </CardContent>
            </Card>
          ) : (
            <div className="grid gap-6">
              {menuCategories.map((category) => (
                <Card key={category.id}>
                  <CardHeader>
                    <CardTitle>{category.name}</CardTitle>
                    {category.description && (
                      <p className="text-sm text-muted-foreground">{category.description}</p>
                    )}
                  </CardHeader>
                  <CardContent>
                    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                      {menuItems
                        .filter((item) => item.categoryId === category.id)
                        .map((item) => (
                          <div
                            key={item.id}
                            className="p-3 border rounded-md flex items-start justify-between gap-2"
                            data-testid={`menu-item-${item.id}`}
                          >
                            <div className="flex-1">
                              <div className="font-medium">{item.name}</div>
                              {item.description && (
                                <p className="text-sm text-muted-foreground line-clamp-2">{item.description}</p>
                              )}
                              {item.preparationTime && (
                                <div className="flex items-center gap-1 text-xs text-muted-foreground mt-1">
                                  <Clock className="h-3 w-3" />
                                  {item.preparationTime} min
                                </div>
                              )}
                            </div>
                            <div className="text-right">
                              <div className="font-semibold">
                                ${parseFloat(item.price).toLocaleString("es-AR", { minimumFractionDigits: 2 })}
                              </div>
                              {item.isAvailable === "false" && (
                                <Badge variant="destructive" className="text-xs">No disponible</Badge>
                              )}
                            </div>
                          </div>
                        ))}
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="reservations" className="space-y-4">
          <div className="flex items-center justify-between gap-4 flex-wrap">
            <h2 className="text-lg font-semibold">Reservas de Mesa</h2>
            <div className="flex items-center gap-2 flex-wrap">
              <Input
                type="date"
                value={reservationDate}
                onChange={(e) => setReservationDate(e.target.value)}
                className="w-40"
                data-testid="input-reservation-date-filter"
              />
              <Button onClick={() => setIsReservationDialogOpen(true)} data-testid="button-new-reservation">
                <Plus className="h-4 w-4 mr-2" />
                Nueva Reserva
              </Button>
            </div>
          </div>

          {reservations.filter(r => r.reservationDate === reservationDate).length === 0 ? (
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-12 text-center">
                <CalendarDays className="h-12 w-12 text-muted-foreground mb-4" />
                <h3 className="text-lg font-semibold mb-2">Sin reservas para esta fecha</h3>
                <p className="text-muted-foreground mb-4">No hay reservas programadas</p>
                <Button onClick={() => setIsReservationDialogOpen(true)} data-testid="button-add-first-reservation">
                  <Plus className="h-4 w-4 mr-2" />
                  Crear Reserva
                </Button>
              </CardContent>
            </Card>
          ) : (
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {reservations
                .filter(r => r.reservationDate === reservationDate)
                .sort((a, b) => a.reservationTime.localeCompare(b.reservationTime))
                .map((reservation) => {
                  const table = tables.find(t => t.id === reservation.tableId);
                  return (
                    <Card key={reservation.id} data-testid={`reservation-card-${reservation.id}`}>
                      <CardHeader className="pb-3">
                        <div className="flex items-center justify-between gap-2">
                          <CardTitle className="text-base">{reservation.guestName}</CardTitle>
                          <Badge className={reservationStatusColors[reservation.status]}>
                            {reservationStatusLabels[reservation.status]}
                          </Badge>
                        </div>
                      </CardHeader>
                      <CardContent className="space-y-2">
                        <div className="flex items-center gap-2 text-sm">
                          <Clock className="h-4 w-4 text-muted-foreground" />
                          <span>{reservation.reservationTime}</span>
                        </div>
                        <div className="flex items-center gap-2 text-sm">
                          <MapPin className="h-4 w-4 text-muted-foreground" />
                          <span>Mesa {table?.tableNumber || "?"}</span>
                        </div>
                        <div className="flex items-center gap-2 text-sm">
                          <Users className="h-4 w-4 text-muted-foreground" />
                          <span>{reservation.partySize} personas</span>
                        </div>
                        {reservation.guestPhone && (
                          <div className="flex items-center gap-2 text-sm text-muted-foreground">
                            <Phone className="h-4 w-4" />
                            <span>{reservation.guestPhone}</span>
                          </div>
                        )}
                        {reservation.notes && (
                          <p className="text-sm text-muted-foreground mt-2">{reservation.notes}</p>
                        )}
                        <div className="flex items-center gap-2 pt-2">
                          {reservation.status === "pending" && (
                            <Button 
                              size="sm" 
                              onClick={() => updateReservationMutation.mutate({ id: reservation.id, data: { status: "confirmed" } })}
                              data-testid={`button-confirm-${reservation.id}`}
                            >
                              <Check className="h-4 w-4 mr-1" />
                              Confirmar
                            </Button>
                          )}
                          {(reservation.status === "pending" || reservation.status === "confirmed") && (
                            <Button 
                              size="sm" 
                              variant="outline"
                              onClick={() => updateReservationMutation.mutate({ id: reservation.id, data: { status: "seated" } })}
                              data-testid={`button-seat-${reservation.id}`}
                            >
                              Sentar
                            </Button>
                          )}
                          {reservation.status !== "cancelled" && reservation.status !== "completed" && (
                            <Button 
                              size="sm" 
                              variant="ghost"
                              onClick={() => updateReservationMutation.mutate({ id: reservation.id, data: { status: "cancelled" } })}
                              data-testid={`button-cancel-${reservation.id}`}
                            >
                              <XCircle className="h-4 w-4" />
                            </Button>
                          )}
                          <Button 
                            size="icon" 
                            variant="ghost"
                            onClick={() => deleteReservationMutation.mutate(reservation.id)}
                            data-testid={`button-delete-${reservation.id}`}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </CardContent>
                    </Card>
                  );
                })}
            </div>
          )}
        </TabsContent>
      </Tabs>

      <Dialog open={isNewOrderDialogOpen} onOpenChange={setIsNewOrderDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Nuevo Pedido - Mesa {selectedTable?.tableNumber}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="covers">Cantidad de comensales</Label>
              <Input
                id="covers"
                type="number"
                min={1}
                max={selectedTable?.capacity || 10}
                value={newCovers}
                onChange={(e) => setNewCovers(parseInt(e.target.value) || 1)}
                data-testid="input-covers"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsNewOrderDialogOpen(false)}>
              Cancelar
            </Button>
            <Button
              onClick={() => {
                if (selectedTable) {
                  createOrderMutation.mutate({ tableId: selectedTable.id, covers: newCovers });
                }
              }}
              disabled={createOrderMutation.isPending}
              data-testid="button-create-order"
            >
              {createOrderMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Crear Pedido
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={isOrderDialogOpen} onOpenChange={(open) => {
        setIsOrderDialogOpen(open);
        if (!open) {
          setPendingItem(null);
          setItemNotes("");
          setSelectedCategory(null);
        }
      }}>
        <DialogContent className="max-w-3xl max-h-[90vh] flex flex-col">
          <DialogHeader>
            <div className="flex items-center justify-between gap-4">
              <DialogTitle>
                {currentOrder?.orderNumber} - Mesa {currentOrder?.table?.tableNumber || selectedTable?.tableNumber}
              </DialogTitle>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setOrderView("folio")}
                className={orderView === "folio" ? "bg-muted" : ""}
                data-testid="button-view-folio"
              >
                <CircleDollarSign className="h-4 w-4 mr-1" />
                Ver Folio
              </Button>
            </div>
          </DialogHeader>

          {orderView === "folio" && (
            <div className="flex-1 overflow-y-auto space-y-4">
              <h3 className="font-semibold text-lg">Resumen de Consumos</h3>
              {getOrderItems().length === 0 ? (
                <p className="text-muted-foreground text-center py-8">No hay items en este pedido</p>
              ) : (
                <div className="space-y-2">
                  {getOrderItems().map((item) => (
                    <div key={item.id} className="flex items-center justify-between p-3 border rounded-md">
                      <div>
                        <span className="font-medium">{item.menuItem?.name || "Item"}</span>
                        <span className="text-muted-foreground ml-2">x{item.quantity}</span>
                      </div>
                      <span className="font-semibold">
                        ${parseFloat(item.subtotal).toLocaleString("es-AR", { minimumFractionDigits: 2 })}
                      </span>
                    </div>
                  ))}
                  <div className="pt-4 border-t flex items-center justify-between text-lg font-bold">
                    <span>Total:</span>
                    <span>
                      ${parseFloat(getUpdatedOrder()?.total || "0").toLocaleString("es-AR", { minimumFractionDigits: 2 })}
                    </span>
                  </div>
                </div>
              )}
              <Button 
                variant="outline" 
                onClick={() => setOrderView("menu")} 
                className="w-full"
                data-testid="button-back-to-menu"
              >
                Volver al Menu
              </Button>
            </div>
          )}

          {orderView === "delete" && (
            <div className="flex-1 overflow-y-auto space-y-4">
              <h3 className="font-semibold text-lg">Eliminar Items</h3>
              {getOrderItems().length === 0 ? (
                <p className="text-muted-foreground text-center py-8">No hay items para eliminar</p>
              ) : (
                <div className="space-y-2">
                  {getOrderItems().map((item) => (
                    <div key={item.id} className="flex items-center justify-between p-3 border rounded-md">
                      <div>
                        <span className="font-medium">{item.menuItem?.name || "Item"}</span>
                        <span className="text-muted-foreground ml-2">x{item.quantity}</span>
                      </div>
                      <Button
                        size="sm"
                        variant="destructive"
                        onClick={() => {
                          if (currentOrder) {
                            deleteItemMutation.mutate({ orderId: currentOrder.id, itemId: item.id });
                          }
                        }}
                        disabled={deleteItemMutation.isPending}
                        data-testid={`button-delete-item-${item.id}`}
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    </div>
                  ))}
                </div>
              )}
              <Button 
                variant="outline" 
                onClick={() => setOrderView("menu")} 
                className="w-full"
                data-testid="button-back-from-delete"
              >
                Volver al Menu
              </Button>
            </div>
          )}

          {orderView === "menu" && !pendingItem && (
            <div className="flex-1 overflow-y-auto space-y-4">
              <div className="flex flex-wrap gap-2">
                {menuCategories.map((cat) => (
                  <Button
                    key={cat.id}
                    variant={selectedCategory === cat.id ? "default" : "outline"}
                    size="sm"
                    onClick={() => setSelectedCategory(selectedCategory === cat.id ? null : cat.id)}
                    data-testid={`button-category-${cat.id}`}
                  >
                    {cat.name}
                  </Button>
                ))}
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setOrderView("delete")}
                  className="text-destructive border-destructive"
                  data-testid="button-delete-mode"
                >
                  <X className="h-4 w-4 mr-1" />
                  Borrar Item
                </Button>
              </div>

              {selectedCategory ? (
                <div className="grid gap-2 sm:grid-cols-2">
                  {menuItems
                    .filter((item) => item.categoryId === selectedCategory && item.isAvailable !== "false")
                    .map((item) => (
                      <button
                        key={item.id}
                        className="p-3 border rounded-md text-left hover-elevate flex items-center justify-between"
                        onClick={() => setPendingItem(item)}
                        data-testid={`select-item-${item.id}`}
                      >
                        <span className="font-medium">{item.name}</span>
                        <span className="text-muted-foreground">
                          ${parseFloat(item.price).toLocaleString("es-AR", { minimumFractionDigits: 2 })}
                        </span>
                      </button>
                    ))}
                </div>
              ) : (
                <div className="text-center py-8 text-muted-foreground">
                  Selecciona una categoria para ver los platos
                </div>
              )}
            </div>
          )}

          {orderView === "menu" && pendingItem && (
            <div className="flex-1 space-y-4">
              <div className="p-4 border rounded-md bg-muted/30">
                <h3 className="font-semibold text-lg mb-1">{pendingItem.name}</h3>
                <p className="text-muted-foreground">
                  ${parseFloat(pendingItem.price).toLocaleString("es-AR", { minimumFractionDigits: 2 })}
                </p>
                {pendingItem.description && (
                  <p className="text-sm text-muted-foreground mt-2">{pendingItem.description}</p>
                )}
              </div>
              <div className="space-y-2">
                <Label htmlFor="item-notes">Observaciones (opcional)</Label>
                <Textarea
                  id="item-notes"
                  value={itemNotes}
                  onChange={(e) => setItemNotes(e.target.value)}
                  placeholder="Ej: sin sal, termino medio, etc."
                  rows={2}
                  data-testid="input-item-notes"
                />
              </div>
              <p className="font-medium">Agregar este item?</p>
              <div className="flex gap-2">
                <Button 
                  className="flex-1" 
                  onClick={handleConfirmItem}
                  disabled={addItemMutation.isPending}
                  data-testid="button-confirm-item"
                >
                  {addItemMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                  Si
                </Button>
                <Button 
                  variant="outline" 
                  className="flex-1" 
                  onClick={handleCancelItem}
                  data-testid="button-cancel-item"
                >
                  No
                </Button>
              </div>
            </div>
          )}

          <DialogFooter className="flex-col sm:flex-row gap-2 border-t pt-4">
            <Button
              variant="destructive"
              size="lg"
              className="w-full sm:w-auto"
              onClick={() => {
                setIsOrderDialogOpen(false);
                setIsCloseDialogOpen(true);
              }}
              data-testid="button-close-table"
            >
              <CreditCard className="h-5 w-5 mr-2" />
              Cerrar Mesa
            </Button>
            <Button 
              onClick={() => setIsOrderDialogOpen(false)} 
              className="w-full sm:w-auto"
              data-testid="button-done"
            >
              Listo
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={isCloseDialogOpen} onOpenChange={setIsCloseDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Cerrar Mesa - {currentOrder?.orderNumber}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <h3 className="font-semibold">Resumen de Consumos</h3>
            {getOrderItems().length === 0 ? (
              <p className="text-muted-foreground text-center py-4">No hay items en este pedido</p>
            ) : (
              <div className="space-y-2 max-h-60 overflow-y-auto">
                {getOrderItems().map((item) => (
                  <div key={item.id} className="flex items-center justify-between py-2 border-b">
                    <div>
                      <span>{item.menuItem?.name || "Item"}</span>
                      <span className="text-muted-foreground ml-2">x{item.quantity}</span>
                    </div>
                    <span>
                      ${parseFloat(item.subtotal).toLocaleString("es-AR", { minimumFractionDigits: 2 })}
                    </span>
                  </div>
                ))}
              </div>
            )}
            <div className="pt-4 border-t space-y-2">
              <div className="flex justify-between">
                <span>Subtotal:</span>
                <span>${parseFloat(getUpdatedOrder()?.subtotal || "0").toLocaleString("es-AR", { minimumFractionDigits: 2 })}</span>
              </div>
              <div className="flex justify-between">
                <span>IVA:</span>
                <span>${parseFloat(getUpdatedOrder()?.tax || "0").toLocaleString("es-AR", { minimumFractionDigits: 2 })}</span>
              </div>
              <div className="flex justify-between text-xl font-bold">
                <span>Total:</span>
                <span>${parseFloat(getUpdatedOrder()?.total || "0").toLocaleString("es-AR", { minimumFractionDigits: 2 })}</span>
              </div>
            </div>
          </div>
          <DialogFooter className="flex-col sm:flex-row gap-2">
            <Button 
              variant="outline" 
              onClick={() => setIsCloseDialogOpen(false)}
              className="w-full sm:w-auto"
            >
              Volver
            </Button>
            <Button
              variant="destructive"
              onClick={() => {
                if (currentOrder) {
                  closeOrderMutation.mutate(currentOrder.id);
                  setIsCloseDialogOpen(false);
                }
              }}
              disabled={closeOrderMutation.isPending}
              className="w-full sm:w-auto"
              data-testid="button-confirm-close"
            >
              {closeOrderMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Confirmar Cierre
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={isReservationDialogOpen} onOpenChange={setIsReservationDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Nueva Reserva</DialogTitle>
          </DialogHeader>
          <Form {...reservationForm}>
            <form onSubmit={reservationForm.handleSubmit((data) => createReservationMutation.mutate(data))} className="space-y-4">
              <FormField
                control={reservationForm.control}
                name="guestName"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Nombre del huesped *</FormLabel>
                    <FormControl>
                      <Input {...field} placeholder="Nombre completo" data-testid="input-guest-name" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <div className="grid grid-cols-2 gap-4">
                <FormField
                  control={reservationForm.control}
                  name="guestPhone"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Telefono</FormLabel>
                      <FormControl>
                        <Input {...field} placeholder="+54 11 xxxx-xxxx" data-testid="input-guest-phone" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={reservationForm.control}
                  name="guestEmail"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Email</FormLabel>
                      <FormControl>
                        <Input {...field} type="email" placeholder="email@ejemplo.com" data-testid="input-guest-email" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <FormField
                  control={reservationForm.control}
                  name="reservationDate"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Fecha *</FormLabel>
                      <FormControl>
                        <Input {...field} type="date" data-testid="input-reservation-date" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={reservationForm.control}
                  name="reservationTime"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Hora *</FormLabel>
                      <FormControl>
                        <Input {...field} type="time" data-testid="input-reservation-time" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <FormField
                  control={reservationForm.control}
                  name="tableId"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Mesa *</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value}>
                        <FormControl>
                          <SelectTrigger data-testid="select-table">
                            <SelectValue placeholder="Seleccionar mesa" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {tables.filter(t => t.isActive === "true").map((table) => (
                            <SelectItem key={table.id} value={table.id}>
                              Mesa {table.tableNumber} ({table.capacity} pers.)
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={reservationForm.control}
                  name="partySize"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Personas *</FormLabel>
                      <FormControl>
                        <Input {...field} type="number" min={1} data-testid="input-party-size" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
              <FormField
                control={reservationForm.control}
                name="notes"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Notas</FormLabel>
                    <FormControl>
                      <Textarea {...field} placeholder="Preferencias, alergias, ocasion especial..." data-testid="input-reservation-notes" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setIsReservationDialogOpen(false)}>
                  Cancelar
                </Button>
                <Button
                  type="submit"
                  disabled={createReservationMutation.isPending}
                  data-testid="button-save-reservation"
                >
                  {createReservationMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                  Guardar Reserva
                </Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>

      <Dialog open={isDailyReservationsOpen} onOpenChange={setIsDailyReservationsOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Reservas del Dia - {new Date().toLocaleDateString("es-AR", { weekday: "long", day: "numeric", month: "long" })}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            {todayReservations.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <CalendarDays className="h-12 w-12 mx-auto mb-4 opacity-50" />
                <p>No hay reservas para hoy</p>
              </div>
            ) : (
              <div className="space-y-3 max-h-96 overflow-y-auto">
                {todayReservations
                  .sort((a, b) => a.reservationTime.localeCompare(b.reservationTime))
                  .map((reservation) => {
                    const table = tables.find(t => t.id === reservation.tableId);
                    return (
                      <div 
                        key={reservation.id} 
                        className="flex items-center justify-between p-3 border rounded-md gap-4"
                        data-testid={`daily-reservation-${reservation.id}`}
                      >
                        <div className="flex items-center gap-4">
                          <div className="text-lg font-bold">{reservation.reservationTime}</div>
                          <div>
                            <div className="font-medium">{reservation.guestName}</div>
                            <div className="text-sm text-muted-foreground">
                              Mesa {table?.tableNumber || "?"} - {reservation.partySize} personas
                            </div>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <Badge className={reservationStatusColors[reservation.status]}>
                            {reservationStatusLabels[reservation.status]}
                          </Badge>
                          {reservation.status === "pending" && (
                            <Button 
                              size="sm" 
                              onClick={() => updateReservationMutation.mutate({ id: reservation.id, data: { status: "confirmed" } })}
                            >
                              <Check className="h-4 w-4" />
                            </Button>
                          )}
                          {(reservation.status === "pending" || reservation.status === "confirmed") && (
                            <Button 
                              size="sm" 
                              variant="outline"
                              onClick={() => updateReservationMutation.mutate({ id: reservation.id, data: { status: "seated" } })}
                            >
                              Sentar
                            </Button>
                          )}
                        </div>
                      </div>
                    );
                  })}
              </div>
            )}
          </div>
          <DialogFooter>
            <Button onClick={() => setIsDailyReservationsOpen(false)}>
              Cerrar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
