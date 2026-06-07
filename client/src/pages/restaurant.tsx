import { useState, useCallback, useRef, useEffect } from "react";
import { useAuth } from "@/App";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandInput, CommandList, CommandItem, CommandEmpty } from "@/components/ui/command";
import { Textarea } from "@/components/ui/textarea";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
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
  Trash2,
  Check,
  XCircle,
  GripVertical,
  Settings,
  Edit,
  Eye,
  Search,
  BookOpen,
  Receipt,
  ChefHat,
  Banknote,
  ArrowUpDown,
  Pencil,
  Minus,
  ClipboardList,
  ChevronLeft,
  CheckCircle2,
  Printer,
  ArrowRightLeft,
  Smartphone,
} from "lucide-react";
import { Link } from "wouter";

type RestaurantArea = {
  id: string;
  name: string;
  areaType: "indoor" | "outdoor" | "terrace" | "bar" | "private";
  capacity: number;
  hasTables: string | null;
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
  hasWindow: string | null;
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

type OrderSplit = {
  id: string;
  orderId: string;
  splitNumber: number;
  amount: string;
  method: string | null;
  receiptType: string | null;
  isPaid: string | null;
  paidAt: string | null;
  createdAt: string | null;
};

type RestaurantOrder = {
  id: string;
  orderNumber: string;
  tableId: string | null;
  areaId: string | null;
  status: "open" | "in_progress" | "served" | "closed" | "cancelled";
  covers: number;
  waiterName: string | null;
  orderLabel: string | null;
  activeCourse: number | null;
  subtotal: string;
  tax: string;
  total: string;
  openedAt: string;
  receiptType: string | null;
  paymentMethod: string | null;
  table?: RestaurantTable;
  area?: RestaurantArea;
  items?: Array<{
    id: string;
    menuItemId: string;
    quantity: number;
    unitPrice: string;
    subtotal: string;
    menuItem?: MenuItem;
    notes?: string | null;
    status?: string;
    course?: number | null;
    sentAt?: string | null;
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

type TimeSlot = {
  id: string;
  time: string;
  label: string | null;
  isActive: string | null;
  displayOrder: number | null;
};

type RecipeIngredient = {
  id: string;
  recipeId: string;
  inventoryItemId: string | null;
  ingredientName: string;
  quantity: string;
  unit: string;
  unitCost: string;
};

type Recipe = {
  id: string;
  menuItemId: string;
  notes: string | null;
  menuItem?: MenuItem;
  ingredients: RecipeIngredient[];
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
  available: "bg-green-500/20 text-green-700 dark:text-green-400 border-green-500/40",
  occupied: "bg-red-500/20 text-red-700 dark:text-red-400 border-red-500/40",
  reserved: "bg-blue-500/20 text-blue-700 dark:text-blue-400 border-blue-500/40",
  cleaning: "bg-yellow-500/20 text-yellow-700 dark:text-yellow-400 border-yellow-500/40",
  blocked: "bg-gray-500/20 text-gray-700 dark:text-gray-400 border-gray-500/40",
};

const tableStatusLabels: Record<string, string> = {
  available: "Disponible",
  occupied: "Ocupada",
  reserved: "Reservada",
  cleaning: "Limpieza",
  blocked: "Bloqueada",
};

const SHOW_FACTURA_C = false;

const receiptTypeLabels: Record<string, string> = {
  ticket: "Ticket",
  cierre_mesa: "Cierre de mesa",
  factura_a: "Factura A",
  factura_b: "Factura B",
  voucher: "Voucher (No Fiscal)",
  nota_credito: "Nota de Credito",
  ...(SHOW_FACTURA_C ? { factura_c: "Factura C" } : {}),
};

const paymentMethodLabels: Record<string, string> = {
  efectivo: "Efectivo",
  tarjeta_debito: "Tarjeta Debito",
  tarjeta_credito: "Tarjeta Credito",
  transferencia: "Transferencia",
  cuenta_habitacion: "Cuenta Habitacion",
  mercadopago: "MercadoPago",
  pedidos_ya: "Pedidos Ya",
};

const menuItemFormSchema = z.object({
  name: z.string().min(1, "El nombre es requerido"),
  categoryId: z.string().min(1, "La categoria es requerida"),
  description: z.string().optional(),
  price: z.coerce.number().min(0, "El precio debe ser positivo"),
  preparationTime: z.coerce.number().min(0).optional(),
  isAvailable: z.string().default("true"),
  isEditable: z.string().default("false"),
});

type MenuItemFormValues = z.infer<typeof menuItemFormSchema>;

const categoryFormSchema = z.object({
  name: z.string().min(1, "El nombre es requerido"),
  description: z.string().optional(),
  displayOrder: z.coerce.number().default(0),
});

type CategoryFormValues = z.infer<typeof categoryFormSchema>;

function useElapsedTime(openedAt: string | null | undefined): string {
  const [, setTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setTick(t => t + 1), 60000);
    return () => clearInterval(id);
  }, []);
  if (!openedAt) return "";
  const diff = Math.floor((Date.now() - new Date(openedAt).getTime()) / 60000);
  if (diff < 60) return `${diff}min`;
  const h = Math.floor(diff / 60);
  const m = diff % 60;
  return m > 0 ? `${h}h ${m}min` : `${h}h`;
}

function TableElapsedBadge({ openedAt }: { openedAt: string }) {
  const elapsed = useElapsedTime(openedAt);
  if (!elapsed) return null;
  return <span className="text-[9px] opacity-70 font-medium">{elapsed}</span>;
}

export default function RestaurantPage() {
  const { user } = useAuth();
  const canEditLayout = ["admin", "manager", "responsable_area"].includes(user?.role || "");
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState("floor");
  const [selectedArea, setSelectedArea] = useState<string>("all");
  const [selectedTable, setSelectedTable] = useState<RestaurantTable | null>(null);
  const [isNewOrderDialogOpen, setIsNewOrderDialogOpen] = useState(false);
  const [isOrderDialogOpen, setIsOrderDialogOpen] = useState(false);
  const [currentOrder, setCurrentOrder] = useState<RestaurantOrder | null>(null);
  const [newCovers, setNewCovers] = useState(2);
  const [orderView, setOrderView] = useState<"folio" | "menu" | "delete" | "comanda" | "review">("menu");
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [pendingItem, setPendingItem] = useState<MenuItem | null>(null);
  const [itemNotes, setItemNotes] = useState("");
  const [isCloseDialogOpen, setIsCloseDialogOpen] = useState(false);
  const [isReservationDialogOpen, setIsReservationDialogOpen] = useState(false);
  const [isDailyReservationsOpen, setIsDailyReservationsOpen] = useState(false);
  const [reservationDate, setReservationDate] = useState(new Date().toISOString().split("T")[0]);
  const [editingReservation, setEditingReservation] = useState<TableReservation | null>(null);
  const [isEditReservationOpen, setIsEditReservationOpen] = useState(false);
  const [isEditMode, setIsEditMode] = useState(false);
  const [draggedTable, setDraggedTable] = useState<RestaurantTable | null>(null);
  const [isAddTableDialogOpen, setIsAddTableDialogOpen] = useState(false);
  const [isEditTableDialogOpen, setIsEditTableDialogOpen] = useState(false);
  const [editingTable, setEditingTable] = useState<RestaurantTable | null>(null);
  const [editTableCapacity, setEditTableCapacity] = useState(4);
  const [editTableShape, setEditTableShape] = useState("square");
  const [editTableWindow, setEditTableWindow] = useState(false);
  const [reservationSortBy, setReservationSortBy] = useState<"name" | "time">("time");
  const [showPastReservations, setShowPastReservations] = useState(false);
  const [isMenuItemDialogOpen, setIsMenuItemDialogOpen] = useState(false);
  const [editingMenuItem, setEditingMenuItem] = useState<MenuItem | null>(null);
  const [isCategoryDialogOpen, setIsCategoryDialogOpen] = useState(false);
  const [editingCategory, setEditingCategory] = useState<MenuCategory | null>(null);
  const [reservationSearch, setReservationSearch] = useState("");
  const [closeReceiptType, setCloseReceiptType] = useState("ticket");
  const [closePaymentMethod, setClosePaymentMethod] = useState("efectivo");
  const [closeDiscount, setCloseDiscount] = useState("");
  const [closeDiscountType, setCloseDiscountType] = useState<"amount" | "percent">("amount");
  const [closeRoomId, setCloseRoomId] = useState("");
  const [roomSearchFilter, setRoomSearchFilter] = useState("");
  const [editingAreaId, setEditingAreaId] = useState<string | null>(null);
  const [editingAreaName, setEditingAreaName] = useState("");
  const [isTimeSlotsDialogOpen, setIsTimeSlotsDialogOpen] = useState(false);
  const [newTimeSlot, setNewTimeSlot] = useState("");
  const [isRecipeDialogOpen, setIsRecipeDialogOpen] = useState(false);
  const [selectedRecipeItem, setSelectedRecipeItem] = useState<MenuItem | null>(null);
  const [newIngredientName, setNewIngredientName] = useState("");
  const [newIngredientQty, setNewIngredientQty] = useState("");
  const [newIngredientUnit, setNewIngredientUnit] = useState("g");
  const [newIngredientCost, setNewIngredientCost] = useState("");
  const [newIngredientInventoryId, setNewIngredientInventoryId] = useState("");
  const [ingredientComboOpen, setIngredientComboOpen] = useState(false);
  const [ingredientSearch, setIngredientSearch] = useState("");
  const [recipeSearch, setRecipeSearch] = useState("");
  const [recipeCategoryFilter, setRecipeCategoryFilter] = useState("all");
  const [newTableNumber, setNewTableNumber] = useState("");
  const [newTableCapacity, setNewTableCapacity] = useState(4);
  const [newTableShape, setNewTableShape] = useState("square");
  const [newTableArea, setNewTableArea] = useState("");
  const [newTableWindow, setNewTableWindow] = useState(false);
  const [newWaiterName, setNewWaiterName] = useState("");
  const [newOrderLabel, setNewOrderLabel] = useState("");
  const [isDirectOrderDialogOpen, setIsDirectOrderDialogOpen] = useState(false);
  const [directOrderAreaId, setDirectOrderAreaId] = useState("");
  const [itemCourse, setItemCourse] = useState(1);
  const [itemQuantity, setItemQuantity] = useState(1);
  const [customItemPrice, setCustomItemPrice] = useState("");
  const [customItemName, setCustomItemName] = useState("");
  const [isEditableItem, setIsEditableItem] = useState(false);
  const [isSplitMode, setIsSplitMode] = useState(false);
  const [splitParts, setSplitParts] = useState(2);
  const [isTransferMode, setIsTransferMode] = useState(false);
  const [transferSelectedIds, setTransferSelectedIds] = useState<Set<string>>(new Set());
  const [transferTargetOrderId, setTransferTargetOrderId] = useState<string>("");
  const [transferNewWaiter, setTransferNewWaiter] = useState("");
  const [editingCovers, setEditingCovers] = useState(false);
  const [coversInput, setCoversInput] = useState(1);
  const [showCancelOrderDialog, setShowCancelOrderDialog] = useState(false);
  const [cancelOrderReason, setCancelOrderReason] = useState("");
  const [splitReceiptType, setSplitReceiptType] = useState("ticket");
  const [splitPayMethod, setSplitPayMethod] = useState("efectivo");
  const [splitPayMethods, setSplitPayMethods] = useState<Record<string, string>>({});
  const [splitReceiptTypes, setSplitReceiptTypes] = useState<Record<string, string>>({});
  const [splitRoomIds, setSplitRoomIds] = useState<Record<string, string>>({});
  const [splitRoomSearchFilters, setSplitRoomSearchFilters] = useState<Record<string, string>>({});
  const [splitEditAmounts, setSplitEditAmounts] = useState<Record<string, string>>({});
  const [menuSearch, setMenuSearch] = useState("");
  const menuSearchRef = useRef<HTMLInputElement>(null);
  const [showItemNotes, setShowItemNotes] = useState(false);
  const [reservationViewMode, setReservationViewMode] = useState<"day" | "all" | "past">("day");
  const [reservationDateFilter, setReservationDateFilter] = useState(
    new Date().toLocaleDateString("en-CA", { timeZone: "America/Argentina/Buenos_Aires" })
  );
  const [reservationSearchText, setReservationSearchText] = useState("");
  const [closeBillingName, setCloseBillingName] = useState("");
  const [closeBillingCuit, setCloseBillingCuit] = useState("");
  const [closeBillingCompanyId, setCloseBillingCompanyId] = useState("");
  const [closeCcEntityType, setCloseCcEntityType] = useState<"company" | "agency">("company");
  const [closeCcEntityId, setCloseCcEntityId] = useState("");

  const courseLabels: Record<number, string> = { 1: "Entradas", 2: "Platos Principales", 3: "Postres" };
  const courseShortLabels: Record<number, string> = { 1: "Entrada", 2: "Principal", 3: "Postre" };

  function inferCourseFromCategory(categoryName: string): number | null {
    const name = categoryName.toLowerCase();
    if (name.includes("entrada") || name.includes("aperitivo")) return 1;
    if (name.includes("principal") || name.includes("segundo") || name.includes("plato")) return 2;
    if (name.includes("postre") || name.includes("dulce")) return 3;
    if (name.includes("bebida") || name.includes("cerveza") || name.includes("vino") || name.includes("espumante") || name.includes("jugo") || name.includes("gaseosa")) return null;
    return null;
  }

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

  const menuItemForm = useForm<MenuItemFormValues>({
    resolver: zodResolver(menuItemFormSchema),
    defaultValues: {
      name: "",
      categoryId: "",
      description: "",
      price: 0,
      preparationTime: 0,
      isAvailable: "true",
      isEditable: "false",
    },
  });

  const categoryForm = useForm<CategoryFormValues>({
    resolver: zodResolver(categoryFormSchema),
    defaultValues: { name: "", description: "", displayOrder: 0 },
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

  const { data: inHouseRooms = [] } = useQuery<{ roomId: string; roomNumber: string; guestName: string; reservationId: string }[]>({
    queryKey: ["/api/rooms/in-house"],
  });

  const { data: reservations = [] } = useQuery<TableReservation[]>({
    queryKey: ["/api/restaurant/table-reservations"],
  });

  const { data: timeSlots = [] } = useQuery<TimeSlot[]>({
    queryKey: ["/api/restaurant/time-slots"],
  });

  const { data: recipes = [] } = useQuery<Recipe[]>({
    queryKey: ["/api/restaurant/recipes"],
  });

  const { data: restaurantInventoryItems = [] } = useQuery<any[]>({
    queryKey: ["/api/inventory/items"],
    enabled: isRecipeDialogOpen,
  });

  const { data: companies = [] } = useQuery<{ id: string; name: string; razonSocial: string; nombreFantasia?: string | null; cuilCuit: string }[]>({
    queryKey: ["/api/companies"],
  });
  const { data: agencies = [] } = useQuery<{ id: string; name: string }[]>({
    queryKey: ["/api/agencies"],
  });

  const todayStr = new Date().toLocaleDateString("en-CA", { timeZone: "America/Argentina/Buenos_Aires" });
  const todayReservations = reservations.filter(r =>
    r.reservationDate === todayStr &&
    r.status !== "cancelled" && r.status !== "completed"
  );

  const getCategoryPriority = (name: string) => {
    const n = name.toLowerCase();
    if (n.includes("sin alcohol")) return 1;
    if (n.includes("bebida") && !n.includes("alcohol")) return 2;
    if (n.includes("con alcohol") || (n.includes("bebida") && n.includes("alcohol"))) return 3;
    if (n.includes("alcohol")) return 4;
    if (n.includes("entrada")) return 5;
    if (n.includes("postre")) return 90;
    return 50;
  };
  const sortedCategories = [...menuCategories].sort((a, b) => {
    const pa = getCategoryPriority(a.name);
    const pb = getCategoryPriority(b.name);
    if (pa !== pb) return pa - pb;
    return (a.displayOrder ?? 0) - (b.displayOrder ?? 0);
  });

  const createReservationMutation = useMutation({
    mutationFn: async (data: ReservationFormValues) => {
      const res = await apiRequest("POST", "/api/restaurant/table-reservations", { ...data, status: "confirmed" });
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
    mutationFn: async (data: { tableId?: string; areaId?: string; covers: number; waiterName: string; orderLabel?: string }) => {
      const res = await apiRequest("POST", "/api/restaurant/orders", data);
      return res.json();
    },
    onSuccess: (order: RestaurantOrder) => {
      queryClient.invalidateQueries({ queryKey: ["/api/restaurant/orders"] });
      queryClient.invalidateQueries({ queryKey: ["/api/restaurant/tables"] });
      setCurrentOrder(order);
      setIsNewOrderDialogOpen(false);
      setIsDirectOrderDialogOpen(false);
      setNewWaiterName("");
      setNewOrderLabel("");
      setOrderView("menu");
      setSelectedCategory(null);
      setIsOrderDialogOpen(true);
      toast({ title: "Pedido creado", description: `Pedido ${order.orderNumber} iniciado` });
    },
  });

  const addItemMutation = useMutation({
    mutationFn: async (data: { orderId: string; menuItemId: string; quantity: number; notes?: string; course?: number; customPrice?: string; customName?: string }) => {
      const res = await apiRequest("POST", `/api/restaurant/orders/${data.orderId}/items`, {
        menuItemId: data.menuItemId,
        quantity: data.quantity,
        notes: data.notes,
        course: data.course === null ? null : (data.course || 1),
        customPrice: data.customPrice,
        customName: data.customName,
      });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/restaurant/orders"] });
      setPendingItem(null);
      setItemNotes("");
      setItemQuantity(1);
      setIsEditableItem(false);
      setCustomItemName("");
      setCustomItemPrice("");
      toast({ title: "Item agregado" });
    },
  });

  const advanceCourseMutation = useMutation({
    mutationFn: async (orderId: string) => {
      const res = await apiRequest("POST", `/api/restaurant/orders/${orderId}/advance-course`);
      return res.json();
    },
    onSuccess: (data: { activeCourse: number; activatedItems: number }) => {
      queryClient.invalidateQueries({ queryKey: ["/api/restaurant/orders"] });
      toast({ title: `Curso activado: ${courseLabels[data.activeCourse]}`, description: `${data.activatedItems} items enviados a cocina` });
    },
  });

  const updateItemCourseMutation = useMutation({
    mutationFn: async (data: { orderId: string; itemId: string; course: number }) => {
      const res = await apiRequest("PATCH", `/api/restaurant/orders/${data.orderId}/items/${data.itemId}`, { course: data.course });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/restaurant/orders"] });
    },
  });

  const updateAreaNameMutation = useMutation({
    mutationFn: async (data: { id: string; name: string }) => {
      const res = await apiRequest("PATCH", `/api/restaurant/areas/${data.id}`, { name: data.name });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/restaurant/areas"] });
      setEditingAreaId(null);
      toast({ title: "Área actualizada" });
    },
  });

  const handleSaveAreaName = (id: string) => {
    if (!editingAreaName.trim()) return;
    updateAreaNameMutation.mutate({ id, name: editingAreaName.trim() });
  };

  const createSplitMutation = useMutation({
    mutationFn: async (data: { orderId: string; parts: number }) => {
      const res = await apiRequest("POST", `/api/restaurant/orders/${data.orderId}/split`, { parts: data.parts });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/restaurant/orders"] });
      toast({ title: "Cuenta dividida" });
    },
  });

  const paySplitMutation = useMutation({
    mutationFn: async (data: { orderId: string; splitId: string; method: string; receiptType: string; roomReservationId?: string }) => {
      const res = await apiRequest("PATCH", `/api/restaurant/orders/${data.orderId}/split/${data.splitId}`, {
        method: data.method,
        receiptType: data.receiptType,
        roomReservationId: data.roomReservationId,
      });
      return res.json();
    },
    onSuccess: (data: { split: OrderSplit; allPaid: boolean }) => {
      queryClient.invalidateQueries({ queryKey: ["/api/restaurant/orders"] });
      queryClient.invalidateQueries({ queryKey: ["/api/restaurant/tables"] });
      if (data.allPaid) {
        setCurrentOrder(null);
        setIsCloseDialogOpen(false);
        setIsSplitMode(false);
        toast({ title: "Todas las partes pagadas — mesa cerrada" });
      } else {
        toast({ title: "Parte cobrada" });
      }
    },
  });

  const cancelSplitMutation = useMutation({
    mutationFn: async (orderId: string) => {
      await apiRequest("DELETE", `/api/restaurant/orders/${orderId}/split`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/restaurant/orders"] });
      setIsSplitMode(false);
      toast({ title: "División cancelada" });
    },
  });

  const updateCoversMutation = useMutation({
    mutationFn: async ({ orderId, covers }: { orderId: string; covers: number }) => {
      const res = await apiRequest("PATCH", `/api/restaurant/orders/${orderId}`, { covers });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/restaurant/orders"] });
      setEditingCovers(false);
      toast({ title: "Comensales actualizados" });
    },
    onError: () => toast({ title: "Error al actualizar comensales", variant: "destructive" }),
  });

  const cancelOrderMutation = useMutation({
    mutationFn: async ({ orderId, reason }: { orderId: string; reason: string }) => {
      const res = await apiRequest("POST", `/api/restaurant/orders/${orderId}/cancel`, { reason });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/restaurant/orders"] });
      queryClient.invalidateQueries({ queryKey: ["/api/restaurant/tables"] });
      setShowCancelOrderDialog(false);
      setCancelOrderReason("");
      setIsOrderDialogOpen(false);
      setCurrentOrder(null);
      toast({ title: "Ticket cancelado", description: "La mesa quedó disponible." });
    },
    onError: (e: any) => toast({ title: e?.message || "Error al cancelar", variant: "destructive" }),
  });

  const transferItemsMutation = useMutation({
    mutationFn: async (data: { orderId: string; itemIds: string[]; targetOrderId: string; newOrderData?: any }) => {
      const res = await apiRequest("POST", `/api/restaurant/orders/${data.orderId}/transfer-items`, {
        itemIds: data.itemIds,
        targetOrderId: data.targetOrderId,
        newOrderData: data.newOrderData,
      });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/restaurant/orders"] });
      queryClient.invalidateQueries({ queryKey: ["/api/restaurant/tables"] });
      setIsTransferMode(false);
      setTransferSelectedIds(new Set());
      setTransferTargetOrderId("");
      setTransferNewWaiter("");
      toast({ title: "Ítems transferidos correctamente" });
    },
    onError: (e: any) => toast({ title: e?.message || "Error al transferir ítems", variant: "destructive" }),
  });

  const updateSplitAmountMutation = useMutation({
    mutationFn: async ({ orderId, splitId, amount }: { orderId: string; splitId: string; amount: string }) => {
      const res = await apiRequest("PATCH", `/api/restaurant/orders/${orderId}/split/${splitId}`, { amount });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/restaurant/orders"] });
    },
    onError: () => {
      toast({ title: "Error al actualizar monto", variant: "destructive" });
    },
  });

  const deleteItemMutation = useMutation({
    mutationFn: async (data: { orderId: string; itemId: string }) => {
      const res = await apiRequest("DELETE", `/api/restaurant/orders/${data.orderId}/items/${data.itemId}`);
      if (res.status === 204 || res.status === 200) return { success: true };
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/restaurant/orders"] });
      toast({ title: "Item eliminado" });
    },
    onError: () => {
      toast({ title: "Error al eliminar item", variant: "destructive" });
    },
  });

  const closeOrderMutation = useMutation({
    mutationFn: async (data: { orderId: string; receiptType: string; paymentMethod: string; discount?: number; discountType?: string; roomReservationId?: string; billingName?: string; billingCuit?: string; ccEntityType?: string; ccEntityId?: string }) => {
      const res = await apiRequest("POST", `/api/restaurant/orders/${data.orderId}/close`, {
        chargeToRoom: data.paymentMethod === "cuenta_habitacion",
        receiptType: data.receiptType,
        paymentMethod: data.paymentMethod,
        discount: data.discount,
        discountType: data.discountType,
        roomReservationId: data.roomReservationId,
        billingName: data.billingName,
        billingCuit: data.billingCuit,
        ccEntityType: data.ccEntityType,
        ccEntityId: data.ccEntityId,
      });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/restaurant/orders"] });
      queryClient.invalidateQueries({ queryKey: ["/api/restaurant/tables"] });
      setCurrentOrder(null);
      setIsCloseDialogOpen(false);
      setCloseDiscount("");
      setCloseDiscountType("amount");
      setCloseRoomId("");
      setCloseBillingName("");
      setCloseBillingCuit("");
      setCloseBillingCompanyId("");
      setCloseCcEntityType("company");
      setCloseCcEntityId("");
      toast({ title: "Pedido cerrado" });
    },
  });

  const updateTableMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: Record<string, unknown> }) => {
      const res = await apiRequest("PATCH", `/api/restaurant/tables/${id}`, data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/restaurant/tables"] });
    },
  });

  const createTableMutation = useMutation({
    mutationFn: async (data: Record<string, unknown>) => {
      const res = await apiRequest("POST", "/api/restaurant/tables", data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/restaurant/tables"] });
      setIsAddTableDialogOpen(false);
      setNewTableNumber("");
      setNewTableCapacity(4);
      setNewTableShape("square");
      setNewTableWindow(false);
      toast({ title: "Mesa creada" });
    },
  });

  const deleteTableMutation = useMutation({
    mutationFn: async (id: string) => {
      await apiRequest("DELETE", `/api/restaurant/tables/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/restaurant/tables"] });
      toast({ title: "Mesa eliminada" });
    },
  });

  const createMenuItemMutation = useMutation({
    mutationFn: async (data: MenuItemFormValues) => {
      const res = await apiRequest("POST", "/api/restaurant/menu/items", {
        ...data,
        price: data.price.toString(),
      });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/restaurant/menu/items"] });
      setIsMenuItemDialogOpen(false);
      menuItemForm.reset();
      toast({ title: "Plato creado" });
    },
  });

  const updateMenuItemMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: MenuItemFormValues }) => {
      const res = await apiRequest("PATCH", `/api/restaurant/menu/items/${id}`, {
        ...data,
        price: data.price.toString(),
      });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/restaurant/menu/items"] });
      setIsMenuItemDialogOpen(false);
      setEditingMenuItem(null);
      menuItemForm.reset();
      toast({ title: "Plato actualizado" });
    },
  });

  const deleteMenuItemMutation = useMutation({
    mutationFn: async (id: string) => {
      await apiRequest("DELETE", `/api/restaurant/menu/items/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/restaurant/menu/items"] });
      toast({ title: "Plato eliminado" });
    },
  });

  const createCategoryMutation = useMutation({
    mutationFn: async (data: CategoryFormValues) => {
      const res = await apiRequest("POST", "/api/restaurant/menu/categories", data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/restaurant/menu/categories"] });
      setIsCategoryDialogOpen(false);
      categoryForm.reset();
      toast({ title: "Categoria creada" });
    },
  });

  const updateCategoryMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: CategoryFormValues }) => {
      const res = await apiRequest("PATCH", `/api/restaurant/menu/categories/${id}`, data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/restaurant/menu/categories"] });
      setIsCategoryDialogOpen(false);
      setEditingCategory(null);
      categoryForm.reset();
      toast({ title: "Categoria actualizada" });
    },
  });

  const deleteCategoryMutation = useMutation({
    mutationFn: async (id: string) => {
      await apiRequest("DELETE", `/api/restaurant/menu/categories/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/restaurant/menu/categories"] });
      toast({ title: "Categoria eliminada" });
    },
  });

  const createTimeSlotMutation = useMutation({
    mutationFn: async (time: string) => {
      const res = await apiRequest("POST", "/api/restaurant/time-slots", { time });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/restaurant/time-slots"] });
      setNewTimeSlot("");
      toast({ title: "Horario agregado" });
    },
  });

  const deleteTimeSlotMutation = useMutation({
    mutationFn: async (id: string) => {
      await apiRequest("DELETE", `/api/restaurant/time-slots/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/restaurant/time-slots"] });
      toast({ title: "Horario eliminado" });
    },
  });

  const createRecipeMutation = useMutation({
    mutationFn: async (menuItemId: string) => {
      const res = await apiRequest("POST", "/api/restaurant/recipes", { menuItemId });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/restaurant/recipes"] });
    },
  });

  const addIngredientMutation = useMutation({
    mutationFn: async (data: { recipeId: string; ingredientName: string; quantity: string; unit: string; unitCost: string; inventoryItemId?: string | null }) => {
      const res = await apiRequest("POST", `/api/restaurant/recipes/${data.recipeId}/ingredients`, data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/restaurant/recipes"] });
      setNewIngredientName("");
      setNewIngredientQty("");
      setNewIngredientUnit("g");
      setNewIngredientCost("");
      setNewIngredientInventoryId("");
      setIngredientSearch("");
      setIngredientComboOpen(false);
      toast({ title: "Ingrediente agregado" });
    },
  });

  const deleteIngredientMutation = useMutation({
    mutationFn: async (id: string) => {
      await apiRequest("DELETE", `/api/restaurant/recipe-ingredients/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/restaurant/recipes"] });
      toast({ title: "Ingrediente eliminado" });
    },
  });

  const filteredTables = selectedArea === "all"
    ? tables
    : tables.filter((t) => t.areaId === selectedArea);

  const activeOrders = orders.filter((o) => o.status !== "closed" && o.status !== "cancelled");

  const handleTableClick = (table: RestaurantTable) => {
    if (isEditMode) return;
    setSelectedTable(table);
    if (table.status === "available") {
      setNewCovers(table.capacity);
      setNewWaiterName("");
      setIsNewOrderDialogOpen(true);
    } else if (table.status === "occupied") {
      const tableOrder = orders.find((o) => o.tableId === table.id && o.status !== "closed" && o.status !== "cancelled");
      if (tableOrder) {
        setCurrentOrder(tableOrder);
        const orderItems = (tableOrder as any).items || [];
        setOrderView(orderItems.length > 0 ? "comanda" : "menu");
        setSelectedCategory(null);
        setIsOrderDialogOpen(true);
      }
    }
  };

  const handleConfirmItem = () => {
    if (currentOrder && pendingItem) {
      if (isEditableItem && (!customItemName.trim() || !customItemPrice)) {
        toast({ title: "Complete descripción y precio", variant: "destructive" });
        return;
      }
      addItemMutation.mutate({
        orderId: currentOrder.id,
        menuItemId: pendingItem.id,
        quantity: itemQuantity,
        notes: itemNotes || undefined,
        course: (() => {
          const cat = menuCategories.find(c => c.id === pendingItem.categoryId);
          const bevCats = ["bebidas sin alcohol", "cervezas", "vinos", "espumantes", "vinos de ríos", "bebidas"];
          return cat && bevCats.some(bc => cat.name.toLowerCase().includes(bc)) ? null : itemCourse;
        })(),
        customPrice: isEditableItem ? customItemPrice : undefined,
        customName: isEditableItem ? customItemName : undefined,
      });
    }
    setMenuSearch("");
    setShowItemNotes(false);
    setItemNotes("");
  };

  const handleCancelItem = () => {
    setPendingItem(null);
    setItemNotes("");
    setItemQuantity(1);
    setIsEditableItem(false);
    setCustomItemName("");
    setCustomItemPrice("");
    setMenuSearch("");
    setShowItemNotes(false);
  };

  const getUpdatedOrder = () => {
    if (!currentOrder) return null;
    return orders.find(o => o.id === currentOrder.id) || currentOrder;
  };

  const getOrderItems = () => {
    const order = getUpdatedOrder();
    return order?.items || [];
  };

  const handleDragStart = (table: RestaurantTable) => {
    if (!isEditMode) return;
    setDraggedTable(table);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
  };

  const handleDrop = (x: number, y: number, areaId: string) => {
    if (!draggedTable || !isEditMode) return;
    const existingTable = tables.find(t => t.positionX === x && t.positionY === y && t.areaId === areaId && t.id !== draggedTable.id);
    if (existingTable) return;
    updateTableMutation.mutate({
      id: draggedTable.id,
      data: { positionX: x, positionY: y },
    });
    setDraggedTable(null);
  };

  const todayForFilter = new Date().toLocaleDateString("en-CA", { timeZone: "America/Argentina/Buenos_Aires" });
  const filteredReservations = reservations
    .filter(r => {
      if (!showPastReservations && r.reservationDate < todayForFilter) return false;
      if (reservationSearch) return r.guestName.toLowerCase().includes(reservationSearch.toLowerCase());
      return true;
    })
    .sort((a, b) => {
      const dateCompare = a.reservationDate.localeCompare(b.reservationDate);
      if (dateCompare !== 0) return dateCompare;
      if (reservationSortBy === "time") return a.reservationTime.localeCompare(b.reservationTime);
      return a.guestName.localeCompare(b.guestName);
    });

  const openMenuItemDialog = (item?: MenuItem) => {
    if (item) {
      setEditingMenuItem(item);
      menuItemForm.reset({
        name: item.name,
        categoryId: item.categoryId,
        description: item.description || "",
        price: parseFloat(item.price),
        preparationTime: item.preparationTime || 0,
        isAvailable: item.isAvailable || "true",
        isEditable: (item as any).isEditable || "false",
      });
    } else {
      setEditingMenuItem(null);
      menuItemForm.reset({
        name: "",
        categoryId: sortedCategories[0]?.id || "",
        description: "",
        price: 0,
        preparationTime: 0,
        isAvailable: "true",
        isEditable: "false",
      });
    }
    setIsMenuItemDialogOpen(true);
  };

  const openCategoryDialog = (cat?: MenuCategory) => {
    if (cat) {
      setEditingCategory(cat);
      categoryForm.reset({
        name: cat.name,
        description: cat.description || "",
        displayOrder: cat.displayOrder || 0,
      });
    } else {
      setEditingCategory(null);
      categoryForm.reset({ name: "", description: "", displayOrder: 0 });
    }
    setIsCategoryDialogOpen(true);
  };

  const openRecipeDialog = async (item: MenuItem) => {
    setSelectedRecipeItem(item);
    const existing = recipes.find(r => r.menuItemId === item.id);
    if (!existing) {
      await createRecipeMutation.mutateAsync(item.id);
    }
    setIsRecipeDialogOpen(true);
  };

  const currentRecipe = selectedRecipeItem ? recipes.find(r => r.menuItemId === selectedRecipeItem.id) : null;
  const recipeCost = currentRecipe?.ingredients.reduce((sum, ing) => {
    return sum + parseFloat(ing.quantity) * parseFloat(ing.unitCost || "0");
  }, 0) || 0;

  const printBillPreview = () => {
    const order = getUpdatedOrder();
    if (!order) return;
    const items = getOrderItems();
    const win = window.open("", "_blank");
    if (!win) return;
    const esc = (s: string) => { const d = win.document.createElement("div"); d.textContent = s; return d.innerHTML; };
    const rows = items.map(item => `
      <tr>
        <td style="padding:4px 8px">${esc(item.menuItem?.name || "Item")}</td>
        <td style="padding:4px 8px;text-align:center">${item.quantity}</td>
        <td style="padding:4px 8px;text-align:right">$${parseFloat(item.subtotal).toLocaleString("es-AR",{minimumFractionDigits:2})}</td>
      </tr>`).join("");
    win.document.write(`<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Cuenta</title>
    <style>body{font-family:Arial,sans-serif;max-width:500px;margin:30px auto;padding:16px}h2,h3{text-align:center;margin:4px 0}
    table{width:100%;border-collapse:collapse;margin:12px 0}th{background:#f0f0f0;padding:6px 8px;text-align:left;font-size:12px}
    td{font-size:12px;border-bottom:1px solid #eee}
    .total-row{font-weight:bold;font-size:13px;border-top:2px solid #333}
    .total-row td{padding:6px 8px}
    hr{border:none;border-top:1px dashed #ccc;margin:10px 0}
    @media print{body{margin:10px}}</style></head><body>
    <h2>MARAN SUITES &amp; TOWERS</h2>
    <h3>Restaurante</h3>
    <hr>
    <p style="font-size:12px;margin:4px 0"><b>Mesa/Pedido:</b> ${esc(order.orderLabel || String(order.orderNumber))}</p>
    <p style="font-size:12px;margin:4px 0"><b>Fecha:</b> ${esc(format(new Date(), "dd/MM/yyyy HH:mm"))}</p>
    <hr>
    <table><thead><tr><th>Ítem</th><th style="text-align:center">Cant.</th><th style="text-align:right">Total</th></tr></thead>
    <tbody>${rows}</tbody></table>
    <hr>
    <table><tbody>
      <tr class="total-row"><td>TOTAL:</td><td style="text-align:right;font-size:15px">$${parseFloat(order.total||"0").toLocaleString("es-AR",{minimumFractionDigits:2})}</td></tr>
    </tbody></table>
    <hr>
    <p style="text-align:center;font-size:11px;color:#666">Este no es el comprobante fiscal final.</p>
    <script>window.onload=function(){window.print()}<\/script>
    </body></html>`);
    win.document.close();
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
          <Link href="/mozo">
            <Button variant="outline" size="sm" className="gap-1.5" data-testid="button-goto-mozo">
              <Smartphone className="h-4 w-4" />
              Vista Mozo
            </Button>
          </Link>
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
          </TabsTrigger>
          <TabsTrigger value="recipes" data-testid="tab-recipes">
            <ChefHat className="h-4 w-4 mr-2" />
            Recetas y Costos
          </TabsTrigger>
        </TabsList>

        {/* ==================== FLOOR PLAN TAB ==================== */}
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
            <div className="ml-auto flex items-center gap-2">
              <Link href="/mozo">
                <Button variant="outline" size="sm" data-testid="button-vista-mozo-floor">
                  <UtensilsCrossed className="h-4 w-4 mr-2" />
                  Vista Mozo
                </Button>
              </Link>
              {canEditLayout && (
                <Button
                  variant={isEditMode ? "default" : "outline"}
                  size="sm"
                  onClick={() => setIsEditMode(!isEditMode)}
                  data-testid="button-edit-layout"
                >
                  {isEditMode ? <Check className="h-4 w-4 mr-2" /> : <Settings className="h-4 w-4 mr-2" />}
                  {isEditMode ? "Guardar Layout" : "Editar Layout"}
                </Button>
              )}
              {isEditMode && (
                <Button
                  size="sm"
                  onClick={() => {
                    if (areas.length > 0) {
                      setNewTableArea(areas[0].id);
                      setIsAddTableDialogOpen(true);
                    }
                  }}
                  data-testid="button-add-table"
                >
                  <Plus className="h-4 w-4 mr-2" />
                  Agregar Mesa
                </Button>
              )}
            </div>
          </div>

          {areas.length === 0 ? (
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-12 text-center">
                <MapPin className="h-12 w-12 text-muted-foreground mb-4" />
                <h3 className="text-lg font-semibold mb-2">Sin areas configuradas</h3>
                <p className="text-muted-foreground mb-4">Agrega areas y mesas para comenzar</p>
              </CardContent>
            </Card>
          ) : (
            <div className="grid gap-6">
              {(selectedArea === "all" ? areas : areas.filter((a) => a.id === selectedArea)).map((area) => {
                if (area.hasTables === "false") {
                  const areaOrders = activeOrders.filter((o) => o.areaId === area.id);
                  return (
                    <Card key={area.id}>
                      <CardHeader className="pb-3">
                        <div className="flex items-center justify-between">
                          <CardTitle className="text-base">{area.name}</CardTitle>
                          <Button
                            size="sm"
                            onClick={() => {
                              setDirectOrderAreaId(area.id);
                              setNewWaiterName("");
                              setNewOrderLabel("");
                              setNewCovers(1);
                              setIsDirectOrderDialogOpen(true);
                            }}
                            data-testid={`button-new-direct-order-${area.id}`}
                          >
                            <Plus className="h-4 w-4 mr-2" />
                            Nueva Orden
                          </Button>
                        </div>
                      </CardHeader>
                      <CardContent>
                        {areaOrders.length === 0 ? (
                          <p className="text-sm text-muted-foreground text-center py-4">Sin órdenes activas</p>
                        ) : (
                          <div className="space-y-2">
                            {areaOrders.map((order) => (
                              <button
                                key={order.id}
                                className="w-full flex items-center justify-between p-3 border rounded-md hover-elevate text-left"
                                onClick={() => {
                                  setCurrentOrder(order);
                                  const orderItems = (order as any).items || [];
                                  setOrderView(orderItems.length > 0 ? "comanda" : "menu");
                                  setSelectedCategory(null);
                                  setIsOrderDialogOpen(true);
                                }}
                                data-testid={`direct-order-${order.id}`}
                              >
                                <div className="flex-1">
                                  <div className="flex items-center gap-2">
                                    <span className="font-medium">{order.orderLabel || order.orderNumber}</span>
                                    <Badge variant="outline" className="text-xs">{order.orderNumber}</Badge>
                                  </div>
                                  <div className="text-xs text-muted-foreground mt-0.5">
                                    Mozo: {order.waiterName || "—"} | {new Date(order.openedAt).toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit" })}
                                    {order.items && order.items.length > 0 && ` | ${order.items.length} items`}
                                  </div>
                                </div>
                                <div className="text-right">
                                  <span className="font-semibold">${parseFloat(order.total).toLocaleString("es-AR", { minimumFractionDigits: 2 })}</span>
                                  <div className="text-xs">
                                    <Badge variant={order.status === "open" ? "default" : order.status === "in_progress" ? "secondary" : "outline"} className="text-xs">
                                      {order.status === "open" ? "Abierto" : order.status === "in_progress" ? "En curso" : order.status}
                                    </Badge>
                                  </div>
                                </div>
                              </button>
                            ))}
                          </div>
                        )}
                      </CardContent>
                    </Card>
                  );
                }

                const areaTables = filteredTables.filter((t) => t.areaId === area.id);
                const gridCols = 8;
                const gridRows = 6;

                return (
                  <Card key={area.id}>
                    <CardHeader className="pb-3">
                      <div className="flex items-center justify-between gap-4 flex-wrap">
                        <CardTitle className="text-lg flex items-center gap-2">
                          {isEditMode && editingAreaId === area.id ? (
                            <div className="flex items-center gap-2">
                              <Input
                                value={editingAreaName}
                                onChange={(e) => setEditingAreaName(e.target.value)}
                                className="h-8 text-base font-semibold w-40"
                                onKeyDown={(e) => {
                                  if (e.key === "Enter") handleSaveAreaName(area.id);
                                  if (e.key === "Escape") setEditingAreaId(null);
                                }}
                                autoFocus
                              />
                              <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => handleSaveAreaName(area.id)}>
                                <Check className="h-4 w-4 text-green-600" />
                              </Button>
                              <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => setEditingAreaId(null)}>
                                <X className="h-4 w-4" />
                              </Button>
                            </div>
                          ) : (
                            <div className="flex items-center gap-2">
                              {area.name}
                              {isEditMode && (
                                <Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => { setEditingAreaId(area.id); setEditingAreaName(area.name); }} data-testid={`button-edit-area-${area.id}`}>
                                  <Pencil className="h-3 w-3" />
                                </Button>
                              )}
                            </div>
                          )}
                        </CardTitle>
                        <span className="text-sm text-muted-foreground">
                          {areaTables.length} mesas | Capacidad: {area.capacity}
                        </span>
                      </div>
                    </CardHeader>
                    <CardContent>
                      <div
                        className="grid gap-1 p-4 bg-muted/30 rounded-lg relative"
                        style={{
                          gridTemplateColumns: `repeat(${gridCols}, minmax(70px, 1fr))`,
                          gridTemplateRows: `repeat(${gridRows}, 75px)`,
                        }}
                      >
                        {Array.from({ length: gridCols * gridRows }).map((_, idx) => {
                          const x = idx % gridCols;
                          const y = Math.floor(idx / gridCols);
                          const table = areaTables.find(t => t.positionX === x && t.positionY === y);

                          if (table) {
                            const today = new Date().toISOString().split("T")[0];
                            const hasReservationToday = reservations.some(
                              (r) => r.tableId === table.id && r.reservationDate === today && (r.status === "confirmed" || r.status === "pending")
                            );
                            const effectiveStatus = table.status === "available" && hasReservationToday ? "reserved" : table.status;
                            return (
                              <button
                                key={table.id}
                                draggable={isEditMode}
                                onDragStart={() => handleDragStart(table)}
                                onDragOver={handleDragOver}
                                onDrop={() => handleDrop(x, y, area.id)}
                                onClick={() => handleTableClick(table)}
                                className={`p-2 border-2 transition-all flex flex-col items-center justify-center gap-0.5 relative ${
                                  tableStatusColors[effectiveStatus]
                                } ${table.shape === "round" ? "rounded-full" : "rounded-md"} ${
                                  isEditMode ? "cursor-grab active:cursor-grabbing ring-2 ring-primary/30" : "hover-elevate"
                                } ${draggedTable?.id === table.id ? "opacity-50" : ""}`}
                                style={{
                                  gridColumn: x + 1,
                                  gridRow: y + 1,
                                }}
                                data-testid={`table-${table.tableNumber}`}
                              >
                                {table.hasWindow === "true" && (
                                  <div className="absolute -top-1 -right-1 w-4 h-4 bg-sky-500 rounded-full flex items-center justify-center" title="Ventana">
                                    <Eye className="h-2.5 w-2.5 text-white" />
                                  </div>
                                )}
                                <span className="font-bold text-sm">{table.tableNumber}</span>
                                <div className="flex items-center gap-0.5 text-[10px]">
                                  <Users className="h-2.5 w-2.5" />
                                  {table.capacity}
                                </div>
                                {table.status === "occupied" && (() => {
                                  const tableOrder = activeOrders.find(o => o.tableId === table.id);
                                  if (!tableOrder) return null;
                                  return (
                                    <>
                                      {tableOrder.waiterName && (
                                        <span className="text-[9px] truncate max-w-full opacity-80">{tableOrder.waiterName}</span>
                                      )}
                                      <TableElapsedBadge openedAt={tableOrder.openedAt} />
                                    </>
                                  );
                                })()}
                                {isEditMode && (
                                  <GripVertical className="h-3 w-3 opacity-50" />
                                )}
                              </button>
                            );
                          }

                          return (
                            <div
                              key={`empty-${x}-${y}`}
                              className={`rounded-md transition-all ${
                                isEditMode
                                  ? "border-2 border-dashed border-muted-foreground/20 hover:border-primary/40 hover:bg-primary/5"
                                  : "opacity-0"
                              }`}
                              onDragOver={handleDragOver}
                              onDrop={() => handleDrop(x, y, area.id)}
                              style={{
                                gridColumn: x + 1,
                                gridRow: y + 1,
                              }}
                            />
                          );
                        })}
                      </div>
                      {isEditMode && areaTables.length > 0 && (
                        <div className="mt-3 flex flex-wrap gap-2">
                          {areaTables.map(t => (
                            <div key={t.id} className="flex items-center gap-1 text-xs border rounded px-2 py-1">
                              <span>Mesa {t.tableNumber}</span>
                              {t.hasWindow === "true" && <Eye className="h-3 w-3 text-sky-500" />}
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-5 w-5"
                                onClick={() => {
                                  setEditingTable(t);
                                  setEditTableCapacity(t.capacity);
                                  setEditTableShape(t.shape || "square");
                                  setEditTableWindow(t.hasWindow === "true");
                                  setIsEditTableDialogOpen(true);
                                }}
                                data-testid={`button-edit-table-${t.tableNumber}`}
                              >
                                <Edit className="h-3 w-3" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-5 w-5"
                                onClick={() => deleteTableMutation.mutate(t.id)}
                                data-testid={`button-delete-table-${t.tableNumber}`}
                              >
                                <Trash2 className="h-3 w-3 text-destructive" />
                              </Button>
                            </div>
                          ))}
                        </div>
                      )}
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </TabsContent>

        {/* ==================== ORDERS TAB ==================== */}
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
                <p className="text-muted-foreground">Los pedidos apareceran aqui cuando las mesas esten ocupadas</p>
              </CardContent>
            </Card>
          ) : (
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {activeOrders.map((order) => (
                <Card key={order.id} data-testid={`order-card-${order.orderNumber}`}>
                  <CardHeader className="pb-2">
                    <div className="flex items-center justify-between gap-2">
                      <CardTitle className="text-base">{order.orderLabel || order.orderNumber}</CardTitle>
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
                    {!order.tableId && order.areaId && (
                      <div className="flex items-center gap-2 text-sm">
                        <MapPin className="h-4 w-4 text-muted-foreground" />
                        {areas.find(a => a.id === order.areaId)?.name}
                      </div>
                    )}
                    {order.waiterName && (
                      <div className="flex items-center gap-2 text-sm">
                        <Users className="h-4 w-4 text-muted-foreground" />
                        Mozo: {order.waiterName}
                      </div>
                    )}
                    <div className="flex items-center gap-2 text-sm">
                      <Users className="h-4 w-4 text-muted-foreground" />
                      {order.covers} comensales
                    </div>
                    <div className="flex items-center gap-2 text-sm">
                      <Clock className="h-4 w-4 text-muted-foreground" />
                      Abierto: {new Date(order.openedAt).toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit" })}
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
                          const orderItems = (order as any).items || [];
                          setOrderView(orderItems.length > 0 ? "comanda" : "menu");
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
                        onClick={() => {
                          setCurrentOrder(order);
                          setCloseReceiptType("ticket");
                          setClosePaymentMethod("efectivo");
                          setIsCloseDialogOpen(true);
                        }}
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

        {/* ==================== MENU TAB ==================== */}
        <TabsContent value="menu" className="space-y-4">
          <div className="flex items-center justify-between gap-4 flex-wrap">
            <h2 className="text-lg font-semibold">Carta del Restaurante</h2>
            <div className="flex items-center gap-2">
              <Button variant="outline" onClick={() => openCategoryDialog()} data-testid="button-add-category">
                <Plus className="h-4 w-4 mr-2" />
                Nueva Categoria
              </Button>
              <Button onClick={() => openMenuItemDialog()} data-testid="button-add-menu-item">
                <Plus className="h-4 w-4 mr-2" />
                Agregar Plato
              </Button>
            </div>
          </div>
          {sortedCategories.length === 0 ? (
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-12 text-center">
                <UtensilsCrossed className="h-12 w-12 text-muted-foreground mb-4" />
                <h3 className="text-lg font-semibold mb-2">Menu vacio</h3>
                <p className="text-muted-foreground mb-4">Agrega categorias y platos al menu</p>
              </CardContent>
            </Card>
          ) : (
            <div className="grid gap-6">
              {sortedCategories.map((category) => (
                <Card key={category.id}>
                  <CardHeader>
                    <div className="flex items-center justify-between gap-2">
                      <div>
                        <CardTitle className="flex items-center gap-2">
                          {category.name}
                          <Badge variant="outline" className="text-xs">Orden: {category.displayOrder ?? 0}</Badge>
                        </CardTitle>
                        {category.description && (
                          <p className="text-sm text-muted-foreground mt-1">{category.description}</p>
                        )}
                      </div>
                      <div className="flex items-center gap-1">
                        <Button variant="ghost" size="icon" onClick={() => openCategoryDialog(category)} data-testid={`button-edit-category-${category.id}`}>
                          <Edit className="h-4 w-4" />
                        </Button>
                        <Button variant="ghost" size="icon" onClick={() => deleteCategoryMutation.mutate(category.id)} data-testid={`button-delete-category-${category.id}`}>
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </div>
                    </div>
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
                            <div className="text-right flex flex-col items-end gap-1">
                              <div className="font-semibold">
                                ${parseFloat(item.price).toLocaleString("es-AR", { minimumFractionDigits: 2 })}
                              </div>
                              {item.isAvailable === "false" && (
                                <Badge variant="destructive" className="text-xs">No disponible</Badge>
                              )}
                              <div className="flex items-center gap-1">
                                <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => openRecipeDialog(item)} data-testid={`button-recipe-${item.id}`}>
                                  <ChefHat className="h-3 w-3" />
                                </Button>
                                <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => openMenuItemDialog(item)} data-testid={`button-edit-item-${item.id}`}>
                                  <Edit className="h-3 w-3" />
                                </Button>
                                <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => deleteMenuItemMutation.mutate(item.id)} data-testid={`button-delete-item-${item.id}`}>
                                  <Trash2 className="h-3 w-3 text-destructive" />
                                </Button>
                              </div>
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

        {/* ==================== RESERVATIONS TAB ==================== */}
        <TabsContent value="reservations" className="space-y-4">
          <div className="flex items-center justify-between gap-4 flex-wrap">
            <h2 className="text-lg font-semibold">Reservas de Mesa</h2>
            <div className="flex items-center gap-2 flex-wrap">
              <div className="relative">
                <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Buscar por nombre..."
                  value={reservationSearch}
                  onChange={(e) => setReservationSearch(e.target.value)}
                  className="pl-8 w-48"
                  data-testid="input-reservation-search"
                />
              </div>
              <Button
                variant={showPastReservations ? "default" : "outline"}
                size="sm"
                onClick={() => setShowPastReservations(!showPastReservations)}
                data-testid="button-toggle-past-reservations"
              >
                <CalendarDays className="h-4 w-4 mr-1" />
                {showPastReservations ? "Ocultar históricas" : "Ver históricas"}
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setReservationSortBy(reservationSortBy === "name" ? "time" : "name")}
                data-testid="button-sort-reservations"
              >
                <ArrowUpDown className="h-4 w-4 mr-1" />
                {reservationSortBy === "name" ? "A-Z" : "Hora"}
              </Button>
              <Button variant="outline" size="icon" onClick={() => setIsTimeSlotsDialogOpen(true)} data-testid="button-config-time-slots">
                <Settings className="h-4 w-4" />
              </Button>
              <Button onClick={() => setIsReservationDialogOpen(true)} data-testid="button-new-reservation">
                <Plus className="h-4 w-4 mr-2" />
                Nueva Reserva
              </Button>
            </div>
          </div>

          {filteredReservations.length === 0 ? (
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
              {filteredReservations.map((reservation) => {
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
                      <div className="flex items-center gap-2 text-sm font-medium">
                        <CalendarDays className="h-4 w-4 text-muted-foreground" />
                        <span>{(() => { const [y,m,d] = reservation.reservationDate.split("-").map(Number); return format(new Date(y,m-1,d), "EEEE d/MM/yyyy", { locale: es }); })()}</span>
                      </div>
                      <div className="flex items-center gap-2 text-sm">
                        <Clock className="h-4 w-4 text-muted-foreground" />
                        <span>{reservation.reservationTime}</span>
                      </div>
                      <div className="flex items-center gap-2 text-sm">
                        <MapPin className="h-4 w-4 text-muted-foreground" />
                        <span>Mesa {table?.tableNumber || "?"}</span>
                        {table?.hasWindow === "true" && (
                          <Badge variant="outline" className="text-xs gap-1">
                            <Eye className="h-3 w-3" /> Ventana
                          </Badge>
                        )}
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
                        {reservation.status !== "cancelled" && reservation.status !== "completed" && (
                          <>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => { setEditingReservation(reservation); setIsEditReservationOpen(true); }}
                              data-testid={`button-edit-reservation-${reservation.id}`}
                            >
                              <Pencil className="h-4 w-4 mr-1" />
                              Editar
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => updateReservationMutation.mutate({ id: reservation.id, data: { status: "cancelled" } })}
                              data-testid={`button-cancel-${reservation.id}`}
                            >
                              <XCircle className="h-4 w-4" />
                            </Button>
                          </>
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

        {/* ==================== RECIPES & COSTS TAB ==================== */}
        <TabsContent value="recipes" className="space-y-4">
          <div className="flex items-center justify-between gap-4 flex-wrap">
            <div>
              <h2 className="text-lg font-semibold">Recetas y Costos</h2>
              <p className="text-sm text-muted-foreground">Carga recetas por plato para calcular costos y margenes</p>
            </div>
          </div>

          {menuItems.length > 0 && (
            <div className="flex gap-3 flex-wrap">
              <div className="relative flex-1 min-w-52">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Buscar plato..."
                  value={recipeSearch}
                  onChange={(e) => setRecipeSearch(e.target.value)}
                  className="pl-9"
                  data-testid="input-recipe-search"
                />
              </div>
              <Select value={recipeCategoryFilter} onValueChange={setRecipeCategoryFilter}>
                <SelectTrigger className="w-48" data-testid="select-recipe-category">
                  <SelectValue placeholder="Todas las categorías" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todas las categorías</SelectItem>
                  {menuCategories.map((cat) => (
                    <SelectItem key={cat.id} value={cat.id}>{cat.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {(recipeSearch || recipeCategoryFilter !== "all") && (
                <Button variant="ghost" size="sm" onClick={() => { setRecipeSearch(""); setRecipeCategoryFilter("all"); }} data-testid="btn-clear-recipe-filters">
                  Limpiar filtros
                </Button>
              )}
            </div>
          )}

          {menuItems.length === 0 ? (
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-12 text-center">
                <ChefHat className="h-12 w-12 text-muted-foreground mb-4" />
                <h3 className="text-lg font-semibold mb-2">Sin platos configurados</h3>
                <p className="text-muted-foreground">Primero crea platos en la seccion Menu</p>
              </CardContent>
            </Card>
          ) : (
            <Card>
              <CardContent className="pt-6">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Plato</TableHead>
                      <TableHead>Categoria</TableHead>
                      <TableHead className="text-right">Precio Venta</TableHead>
                      <TableHead className="text-right">Costo</TableHead>
                      <TableHead className="text-right">Margen</TableHead>
                      <TableHead className="text-right">% Margen</TableHead>
                      <TableHead className="w-20"></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {menuItems
                      .filter((item) => {
                        const matchSearch = !recipeSearch || item.name.toLowerCase().includes(recipeSearch.toLowerCase());
                        const matchCat = recipeCategoryFilter === "all" || item.categoryId === recipeCategoryFilter;
                        return matchSearch && matchCat;
                      })
                      .map((item) => {
                      const recipe = recipes.find(r => r.menuItemId === item.id);
                      const cost = recipe?.ingredients.reduce((sum, ing) => sum + parseFloat(ing.quantity) * parseFloat(ing.unitCost || "0"), 0) || 0;
                      const price = parseFloat(item.price);
                      const margin = price - cost;
                      const marginPct = price > 0 ? (margin / price) * 100 : 0;
                      const cat = menuCategories.find(c => c.id === item.categoryId);

                      return (
                        <TableRow key={item.id} data-testid={`recipe-row-${item.id}`}>
                          <TableCell className="font-medium">{item.name}</TableCell>
                          <TableCell>{cat?.name || "-"}</TableCell>
                          <TableCell className="text-right">
                            ${price.toLocaleString("es-AR", { minimumFractionDigits: 2 })}
                          </TableCell>
                          <TableCell className="text-right">
                            {recipe ? `$${cost.toLocaleString("es-AR", { minimumFractionDigits: 2 })}` : "-"}
                          </TableCell>
                          <TableCell className="text-right">
                            {recipe ? (
                              <span className={margin >= 0 ? "text-green-600" : "text-red-600"}>
                                ${margin.toLocaleString("es-AR", { minimumFractionDigits: 2 })}
                              </span>
                            ) : "-"}
                          </TableCell>
                          <TableCell className="text-right">
                            {recipe ? (
                              <Badge variant={marginPct >= 50 ? "default" : marginPct >= 30 ? "secondary" : "destructive"}>
                                {marginPct.toFixed(1)}%
                              </Badge>
                            ) : "-"}
                          </TableCell>
                          <TableCell>
                            <Button variant="outline" size="sm" onClick={() => openRecipeDialog(item)} data-testid={`button-edit-recipe-${item.id}`}>
                              <BookOpen className="h-4 w-4 mr-1" />
                              Receta
                            </Button>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                    {menuItems.filter((item) => {
                      const matchSearch = !recipeSearch || item.name.toLowerCase().includes(recipeSearch.toLowerCase());
                      const matchCat = recipeCategoryFilter === "all" || item.categoryId === recipeCategoryFilter;
                      return matchSearch && matchCat;
                    }).length === 0 && (
                      <TableRow>
                        <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                          No se encontraron platos con ese criterio de búsqueda
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          )}
        </TabsContent>
      </Tabs>

      {/* ==================== DIALOGS ==================== */}

      {/* New Order Dialog (table-based) */}
      <Dialog open={isNewOrderDialogOpen} onOpenChange={(open) => { if (open) setIsNewOrderDialogOpen(true); }}>
        <DialogContent onPointerDownOutside={(e) => e.preventDefault()} onEscapeKeyDown={(e) => e.preventDefault()}>
          <DialogHeader>
            <DialogTitle>Nuevo Pedido — Mesa {selectedTable?.tableNumber}</DialogTitle>
            <DialogDescription>Al crear el pedido se abre la mesa y se habilita la carga de comandas.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="waiter-name">Mozo *</Label>
              <Input
                id="waiter-name"
                value={newWaiterName}
                onChange={(e) => setNewWaiterName(e.target.value)}
                placeholder="Nombre del mozo"
                data-testid="input-waiter-name"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="covers">Cantidad de comensales</Label>
              <Input
                id="covers"
                type="number"
                min={1}
                value={newCovers}
                onChange={(e) => setNewCovers(parseInt(e.target.value) || 1)}
                data-testid="input-covers"
              />
              <p className="text-xs text-muted-foreground">Capacidad de la mesa: {selectedTable?.capacity}</p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsNewOrderDialogOpen(false)}>
              Cancelar
            </Button>
            <Button
              onClick={() => {
                if (selectedTable && newWaiterName.trim()) {
                  createOrderMutation.mutate({ tableId: selectedTable.id, covers: newCovers, waiterName: newWaiterName.trim() });
                } else {
                  toast({ title: "Mozo requerido", description: "Ingrese el nombre del mozo", variant: "destructive" });
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

      {/* Direct Order Dialog (tableless areas) */}
      <Dialog open={isDirectOrderDialogOpen} onOpenChange={(open) => { if (open) setIsDirectOrderDialogOpen(true); }}>
        <DialogContent onPointerDownOutside={(e) => e.preventDefault()} onEscapeKeyDown={(e) => e.preventDefault()}>
          <DialogHeader>
            <DialogTitle>Nueva Orden — {areas.find(a => a.id === directOrderAreaId)?.name}</DialogTitle>
            <DialogDescription>Al crear la orden se habilita la carga de comandas.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="order-label">Etiqueta de orden *</Label>
              <Input
                id="order-label"
                value={newOrderLabel}
                onChange={(e) => setNewOrderLabel(e.target.value)}
                placeholder="Ej: Hab. 305, Mesa Solarium 2"
                data-testid="input-order-label"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="direct-waiter">Mozo *</Label>
              <Input
                id="direct-waiter"
                value={newWaiterName}
                onChange={(e) => setNewWaiterName(e.target.value)}
                placeholder="Nombre del mozo"
                data-testid="input-direct-waiter"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="direct-covers">Comensales (opcional)</Label>
              <Input
                id="direct-covers"
                type="number"
                min={1}
                value={newCovers}
                onChange={(e) => setNewCovers(parseInt(e.target.value) || 1)}
                data-testid="input-direct-covers"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsDirectOrderDialogOpen(false)}>
              Cancelar
            </Button>
            <Button
              onClick={() => {
                if (newOrderLabel.trim() && newWaiterName.trim()) {
                  createOrderMutation.mutate({
                    areaId: directOrderAreaId,
                    covers: newCovers,
                    waiterName: newWaiterName.trim(),
                    orderLabel: newOrderLabel.trim(),
                  });
                } else {
                  toast({ title: "Campos requeridos", description: "Ingrese etiqueta y mozo", variant: "destructive" });
                }
              }}
              disabled={createOrderMutation.isPending}
              data-testid="button-create-direct-order"
            >
              {createOrderMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Crear Orden
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Order Dialog (menu/folio/delete views) */}
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
              <div>
                <DialogTitle>
                  {getUpdatedOrder()?.orderLabel || getUpdatedOrder()?.orderNumber} - {getUpdatedOrder()?.tableId ? `Mesa ${getUpdatedOrder()?.table?.tableNumber || selectedTable?.tableNumber}` : (areas.find(a => a.id === getUpdatedOrder()?.areaId)?.name || "")}
                </DialogTitle>
                <p className="text-xs text-muted-foreground mt-1 flex items-center gap-1 flex-wrap">
                  <span>Mozo: {getUpdatedOrder()?.waiterName || "—"}</span>
                  <span>|</span>
                  <span>Abierto: {currentOrder ? new Date(currentOrder.openedAt).toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit" }) : ""}</span>
                  <span>|</span>
                  {editingCovers ? (
                    <span className="flex items-center gap-1">
                      <button className="h-5 w-5 rounded border text-xs flex items-center justify-center hover:bg-muted" onClick={() => setCoversInput(c => Math.max(1, c - 1))}>−</button>
                      <span className="min-w-[2ch] text-center font-medium text-foreground">{coversInput}</span>
                      <button className="h-5 w-5 rounded border text-xs flex items-center justify-center hover:bg-muted" onClick={() => setCoversInput(c => c + 1)}>+</button>
                      <button className="text-[10px] px-1.5 py-0.5 rounded bg-primary text-primary-foreground hover:bg-primary/90" onClick={() => { if (currentOrder) updateCoversMutation.mutate({ orderId: currentOrder.id, covers: coversInput }); }}>OK</button>
                      <button className="text-[10px] px-1 py-0.5 rounded hover:bg-muted" onClick={() => setEditingCovers(false)}>✕</button>
                    </span>
                  ) : (
                    <button
                      className="flex items-center gap-0.5 hover:text-foreground transition-colors group"
                      onClick={() => { setCoversInput(getUpdatedOrder()?.covers || 1); setEditingCovers(true); }}
                      data-testid="button-edit-covers"
                    >
                      <span>{getUpdatedOrder()?.covers} comensal{(getUpdatedOrder()?.covers || 1) !== 1 ? "es" : ""}</span>
                      <Pencil className="h-2.5 w-2.5 opacity-0 group-hover:opacity-60 ml-0.5" />
                    </button>
                  )}
                  {(getUpdatedOrder()?.activeCourse || 1) > 1 && <><span>|</span><span>Curso: {courseLabels[getUpdatedOrder()?.activeCourse || 1] || `Curso ${getUpdatedOrder()?.activeCourse}`}</span></>}
                </p>
              </div>
              <div className="flex items-center gap-1">
                {getUpdatedOrder() && (getUpdatedOrder()?.activeCourse || 1) < 3 && getOrderItems().some(i => i.course && i.course > (getUpdatedOrder()?.activeCourse || 1)) && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      if (currentOrder) advanceCourseMutation.mutate(currentOrder.id);
                    }}
                    disabled={advanceCourseMutation.isPending}
                    data-testid="button-advance-course"
                  >
                    {advanceCourseMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <ChefHat className="h-4 w-4 mr-1" />}
                    Sale — {courseShortLabels[(getUpdatedOrder()?.activeCourse || 1) + 1] || "Siguiente"}
                  </Button>
                )}
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setOrderView("comanda")}
                  className={orderView === "comanda" ? "bg-muted" : ""}
                  data-testid="button-view-comanda"
                >
                  <ClipboardList className="h-4 w-4 mr-1" />
                  Comanda
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setOrderView("folio")}
                  className={orderView === "folio" ? "bg-muted" : ""}
                  data-testid="button-view-folio"
                >
                  <CircleDollarSign className="h-4 w-4 mr-1" />
                  Folio
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-destructive hover:text-destructive hover:bg-destructive/10"
                  onClick={() => { setCancelOrderReason(""); setShowCancelOrderDialog(true); }}
                  data-testid="button-cancel-order"
                >
                  <XCircle className="h-4 w-4 mr-1" />
                  Cancelar
                </Button>
              </div>
            </div>
          </DialogHeader>

          {orderView === "folio" && (
            <div className="flex-1 overflow-y-auto space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="font-semibold text-lg">Resumen de Consumos</h3>
                {!isTransferMode && getOrderItems().length > 0 && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-7 text-xs gap-1"
                    onClick={() => { setIsTransferMode(true); setTransferSelectedIds(new Set()); setTransferTargetOrderId(""); setTransferNewWaiter(""); }}
                    data-testid="button-transfer-items"
                  >
                    <ArrowRightLeft className="h-3.5 w-3.5" />
                    Transferir ítems
                  </Button>
                )}
                {isTransferMode && (
                  <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => setIsTransferMode(false)}>
                    Cancelar
                  </Button>
                )}
              </div>

              {isTransferMode && (
                <div className="rounded-lg border border-orange-200 bg-orange-50 dark:bg-orange-950/20 dark:border-orange-800 p-3 text-sm text-orange-800 dark:text-orange-300">
                  Seleccioná los ítems a mover y elegí el destino
                </div>
              )}

              {getOrderItems().length === 0 ? (
                <p className="text-muted-foreground text-center py-8">No hay items en este pedido</p>
              ) : (
                <div className="space-y-2">
                  {[1, 2, 3].map(course => {
                    const courseItems = getOrderItems().filter(i => (i.course || 1) === course);
                    if (courseItems.length === 0) return null;
                    return (
                      <div key={course}>
                        <div className="flex items-center gap-2 mb-1">
                          <span className="text-xs font-semibold uppercase text-muted-foreground">{courseLabels[course]}</span>
                          {course === (getUpdatedOrder()?.activeCourse || 1) && (
                            <Badge variant="default" className="text-[10px] h-4">Activo</Badge>
                          )}
                        </div>
                        {courseItems.map((item) => (
                          <div
                            key={item.id}
                            className={`flex items-center justify-between p-3 border rounded-md mb-1 ${item.status === "waiting_course" ? "opacity-50 border-dashed" : ""} ${isTransferMode && transferSelectedIds.has(item.id) ? "border-orange-400 bg-orange-50 dark:bg-orange-950/20" : ""} ${isTransferMode ? "cursor-pointer" : ""}`}
                            onClick={isTransferMode ? () => {
                              setTransferSelectedIds(prev => {
                                const next = new Set(prev);
                                if (next.has(item.id)) next.delete(item.id); else next.add(item.id);
                                return next;
                              });
                            } : undefined}
                          >
                            <div className="flex items-center gap-2">
                              {isTransferMode && (
                                <div className={`h-4 w-4 rounded border-2 flex items-center justify-center shrink-0 ${transferSelectedIds.has(item.id) ? "bg-orange-500 border-orange-500" : "border-muted-foreground"}`}>
                                  {transferSelectedIds.has(item.id) && <Check className="h-2.5 w-2.5 text-white" />}
                                </div>
                              )}
                              <span className="font-medium">
                                {item.notes?.startsWith("[") ? item.notes.match(/^\[(.+?)\]/)?.[1] || item.menuItem?.name || "Item" : item.menuItem?.name || "Item"}
                              </span>
                              <span className="text-muted-foreground">x{item.quantity}</span>
                              {item.notes && !item.notes.startsWith("[") && <span className="text-xs text-muted-foreground italic">({item.notes})</span>}
                              {item.notes?.startsWith("[") && item.notes.replace(/^\[.+?\]\s*/, "") && (
                                <span className="text-xs text-muted-foreground italic">({item.notes.replace(/^\[.+?\]\s*/, "")})</span>
                              )}
                              {item.status === "waiting_course" && <Badge variant="outline" className="text-[10px]">Esperando</Badge>}
                            </div>
                            <div className="flex items-center gap-2">
                              <span className="font-semibold">
                                ${parseFloat(item.subtotal).toLocaleString("es-AR", { minimumFractionDigits: 2 })}
                              </span>
                              {!isTransferMode && (
                                <Button
                                  size="icon"
                                  variant="ghost"
                                  className="h-6 w-6 text-destructive hover:text-destructive"
                                  onClick={() => { if (currentOrder) deleteItemMutation.mutate({ orderId: currentOrder.id, itemId: item.id }); }}
                                  data-testid={`button-void-item-${item.id}`}
                                >
                                  <X className="h-3 w-3" />
                                </Button>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    );
                  })}
                  <div className="pt-4 border-t flex items-center justify-between text-lg font-bold">
                    <span>Total:</span>
                    <span>
                      ${parseFloat(getUpdatedOrder()?.total || "0").toLocaleString("es-AR", { minimumFractionDigits: 2 })}
                    </span>
                  </div>
                </div>
              )}

              {isTransferMode && (
                <div className="border rounded-lg p-3 space-y-3 bg-muted/30">
                  <p className="text-sm font-medium">Destino ({transferSelectedIds.size} ítem{transferSelectedIds.size !== 1 ? "s" : ""} seleccionado{transferSelectedIds.size !== 1 ? "s" : ""})</p>
                  <select
                    className="w-full h-9 text-sm border rounded-md px-2 bg-background"
                    value={transferTargetOrderId}
                    onChange={e => setTransferTargetOrderId(e.target.value)}
                    data-testid="select-transfer-target"
                  >
                    <option value="">— Elegí el destino —</option>
                    <option value="new">✦ Nuevo ticket (ticket separado)</option>
                    {orders.filter(o => o.id !== currentOrder?.id && o.status === "open").map(o => (
                      <option key={o.id} value={o.id}>
                        {o.tableId
                          ? `Mesa ${(o as any).table?.tableNumber || o.tableId}`
                          : o.orderLabel || o.orderNumber} — #{o.orderNumber}
                      </option>
                    ))}
                  </select>
                  {transferTargetOrderId === "new" && (
                    <div>
                      <label className="text-xs text-muted-foreground mb-1 block">Mozo del nuevo ticket *</label>
                      <Input
                        className="h-8 text-sm"
                        placeholder="Nombre del mozo"
                        value={transferNewWaiter}
                        onChange={e => setTransferNewWaiter(e.target.value)}
                        data-testid="input-transfer-new-waiter"
                      />
                    </div>
                  )}
                  <Button
                    className="w-full"
                    disabled={
                      transferSelectedIds.size === 0 ||
                      !transferTargetOrderId ||
                      (transferTargetOrderId === "new" && !transferNewWaiter.trim()) ||
                      transferItemsMutation.isPending
                    }
                    onClick={() => {
                      if (!currentOrder) return;
                      transferItemsMutation.mutate({
                        orderId: currentOrder.id,
                        itemIds: Array.from(transferSelectedIds),
                        targetOrderId: transferTargetOrderId,
                        newOrderData: transferTargetOrderId === "new" ? {
                          waiterName: transferNewWaiter.trim(),
                          areaId: currentOrder.areaId,
                          orderLabel: `Ticket separado`,
                          covers: 1,
                        } : undefined,
                      });
                    }}
                    data-testid="button-confirm-transfer"
                  >
                    {transferItemsMutation.isPending ? "Transfiriendo..." : "Confirmar transferencia"}
                  </Button>
                </div>
              )}

              {!isTransferMode && (
                <Button
                  variant="outline"
                  onClick={() => setOrderView("menu")}
                  className="w-full"
                  data-testid="button-back-to-menu"
                >
                  Volver al Menu
                </Button>
              )}
            </div>
          )}

          {orderView === "comanda" && (
            <div className="flex-1 overflow-y-auto space-y-4">
              <h3 className="font-semibold text-lg">Comanda</h3>
              {getOrderItems().length === 0 ? (
                <p className="text-muted-foreground text-center py-8">No hay items en este pedido</p>
              ) : (
                <div className="space-y-3">
                  {[1, 2, 3].map(course => {
                    const courseItems = getOrderItems().filter(i => (i.course || 1) === course);
                    if (courseItems.length === 0) return null;
                    return (
                      <div key={course}>
                        <div className="flex items-center gap-2 mb-2">
                          <Badge variant={course <= (getUpdatedOrder()?.activeCourse || 1) ? "default" : "secondary"} className="text-xs">
                            {courseLabels[course]}
                          </Badge>
                          {course === (getUpdatedOrder()?.activeCourse || 1) && (
                            <span className="text-xs text-green-600 font-medium">En cocina</span>
                          )}
                          {course < (getUpdatedOrder()?.activeCourse || 1) && (
                            <span className="text-xs text-muted-foreground">Servido</span>
                          )}
                          {course > (getUpdatedOrder()?.activeCourse || 1) && (
                            <span className="text-xs text-orange-500">Pendiente</span>
                          )}
                        </div>
                        {courseItems.map((item) => (
                          <div key={item.id} className={`flex items-center justify-between p-2 border rounded mb-1 ${item.status === "waiting_course" ? "opacity-50 border-dashed bg-muted/30" : "bg-background"}`}>
                            <div className="flex items-center gap-2">
                              <span className="font-medium text-sm">
                                {item.notes?.startsWith("[") ? item.notes.match(/^\[(.+?)\]/)?.[1] || item.menuItem?.name || "Item" : item.menuItem?.name || "Item"}
                              </span>
                              <Badge variant="outline" className="text-xs">x{item.quantity}</Badge>
                              {item.notes && !item.notes.startsWith("[") && <span className="text-xs text-muted-foreground italic">({item.notes})</span>}
                              {item.notes?.startsWith("[") && item.notes.replace(/^\[.+?\]\s*/, "") && (
                                <span className="text-xs text-muted-foreground italic">({item.notes.replace(/^\[.+?\]\s*/, "")})</span>
                              )}
                            </div>
                            <div className="flex items-center gap-2">
                              {item.status === "waiting_course" && currentOrder && (
                                <div className="flex items-center gap-0.5">
                                  {[1, 2, 3].filter(c => c !== item.course).map(c => (
                                    <Button
                                      key={c}
                                      size="sm"
                                      variant="outline"
                                      className="h-5 px-1 text-[10px]"
                                      onClick={() => updateItemCourseMutation.mutate({ orderId: currentOrder.id, itemId: item.id, course: c })}
                                      data-testid={`button-course-${item.id}-${c}`}
                                    >
                                      {c === 1 ? "1°" : c === 2 ? "2°" : "3°"}
                                    </Button>
                                  ))}
                                </div>
                              )}
                              <span className="text-sm font-semibold">${parseFloat(item.subtotal).toLocaleString("es-AR", { minimumFractionDigits: 2 })}</span>
                              <Button size="icon" variant="ghost" className="h-6 w-6 text-destructive" onClick={() => { if (currentOrder) deleteItemMutation.mutate({ orderId: currentOrder.id, itemId: item.id }); }} data-testid={`button-comanda-void-${item.id}`}>
                                <X className="h-3 w-3" />
                              </Button>
                            </div>
                          </div>
                        ))}
                      </div>
                    );
                  })}
                </div>
              )}
              <div className="flex items-center justify-between pt-3 border-t">
                <span className="font-semibold">Total:</span>
                <span className="font-bold text-lg">${parseFloat(getUpdatedOrder()?.total || "0").toLocaleString("es-AR", { minimumFractionDigits: 2 })}</span>
              </div>
            </div>
          )}

          {orderView === "review" && (
            <div className="flex-1 overflow-y-auto space-y-4">
              <div className="flex items-center gap-2">
                <ClipboardList className="h-5 w-5 text-primary" />
                <h3 className="font-semibold text-lg">Confirmar Comanda</h3>
              </div>
              {getOrderItems().length === 0 ? (
                <p className="text-muted-foreground text-center py-8">No hay items en este pedido</p>
              ) : (
                <div className="space-y-3">
                  {[1, 2, 3].map(course => {
                    const courseItems = getOrderItems().filter(i => (i.course || 1) === course);
                    if (courseItems.length === 0) return null;
                    const nullItems = course === 1 ? getOrderItems().filter(i => i.course === null) : [];
                    const allItems = course === 1 ? [...courseItems, ...nullItems] : courseItems;
                    if (allItems.length === 0) return null;
                    return (
                      <div key={course} className="rounded-lg border overflow-hidden">
                        <div className="bg-muted/60 px-3 py-1.5 flex items-center gap-2">
                          <Badge variant="outline" className="text-xs font-semibold">{courseLabels[course]}</Badge>
                        </div>
                        <div className="divide-y">
                          {allItems.map((item) => (
                            <div key={item.id} className="flex items-center justify-between px-3 py-2">
                              <div>
                                <span className="font-medium text-sm">
                                  {item.notes?.startsWith("[") ? item.notes.match(/^\[(.+?)\]/)?.[1] || item.menuItem?.name || "Item" : item.menuItem?.name || "Item"}
                                </span>
                                {item.notes && !item.notes.startsWith("[") && (
                                  <span className="text-xs text-muted-foreground ml-1 italic">({item.notes})</span>
                                )}
                                {item.notes?.startsWith("[") && item.notes.replace(/^\[.+?\]\s*/, "") && (
                                  <span className="text-xs text-muted-foreground ml-1 italic">({item.notes.replace(/^\[.+?\]\s*/, "")})</span>
                                )}
                              </div>
                              <div className="flex items-center gap-3">
                                <span className="text-sm text-muted-foreground">x{item.quantity}</span>
                                <span className="text-sm font-medium">${(parseFloat(item.price || "0") * item.quantity).toLocaleString("es-AR", { minimumFractionDigits: 2 })}</span>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    );
                  })}
                  <div className="flex items-center justify-between pt-2 border-t text-base font-bold">
                    <span>Total</span>
                    <span>${parseFloat(getUpdatedOrder()?.total || "0").toLocaleString("es-AR", { minimumFractionDigits: 2 })}</span>
                  </div>
                </div>
              )}
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
              {/* Buscador */}
              <div className="relative">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  ref={menuSearchRef}
                  value={menuSearch}
                  onChange={(e) => {
                    setMenuSearch(e.target.value);
                    if (e.target.value) setSelectedCategory(null);
                  }}
                  placeholder="Buscar plato o código..."
                  className="pl-9"
                  data-testid="input-menu-search"
                />
                {menuSearch && (
                  <button
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                    onClick={() => setMenuSearch("")}
                  >
                    <X className="h-4 w-4" />
                  </button>
                )}
              </div>

              <div className="flex flex-wrap gap-2">
                {sortedCategories.map((cat) => (
                  <Button
                    key={cat.id}
                    variant={selectedCategory === cat.id ? "default" : "outline"}
                    size="sm"
                    onClick={() => { setSelectedCategory(selectedCategory === cat.id ? null : cat.id); setMenuSearch(""); }}
                    data-testid={`button-category-${cat.id}`}
                  >
                    {cat.name}
                  </Button>
                ))}
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    const fueraItem = menuItems.find(i => i.id === "mi-fuera-menu");
                    if (fueraItem) {
                      setItemCourse(1);
                      setPendingItem(fueraItem);
                      setMenuSearch("");
                      setSelectedCategory(null);
                      setIsEditableItem(true);
                      setCustomItemName("");
                      setCustomItemPrice("");
                    }
                  }}
                  className="border-orange-500 text-orange-600 hover:bg-orange-50 dark:hover:bg-orange-950"
                  data-testid="button-fuera-menu"
                >
                  + Fuera de Menú
                </Button>
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

              {(() => {
                const selectItem = (item: MenuItem) => {
                  const cat = menuCategories.find(c => c.id === item.categoryId);
                  const inferred = inferCourseFromCategory(cat?.name || "");
                  setItemCourse(inferred ?? 1);
                  setPendingItem(item);
                  setMenuSearch("");
                  if ((item as any).isEditable === "true") {
                    setIsEditableItem(true);
                    setCustomItemName(item.name);
                    setCustomItemPrice("");
                  } else {
                    setIsEditableItem(false);
                    setCustomItemName("");
                    setCustomItemPrice("");
                  }
                };

                if (menuSearch.trim()) {
                  const visibleItems = menuItems.filter(item =>
                    item.isAvailable !== "false" && (
                      item.name.toLowerCase().includes(menuSearch.toLowerCase()) ||
                      (item.description || "").toLowerCase().includes(menuSearch.toLowerCase())
                    )
                  );
                  if (visibleItems.length === 0) {
                    return <p className="text-center text-muted-foreground py-4 text-sm">Sin resultados para "{menuSearch}"</p>;
                  }
                  return (
                    <div className="grid gap-2 sm:grid-cols-2">
                      {visibleItems.map(item => {
                        const cat = menuCategories.find(c => c.id === item.categoryId);
                        return (
                          <button key={item.id} className="p-3 border rounded-md text-left hover-elevate" onClick={() => selectItem(item)} data-testid={`select-item-${item.id}`}>
                            <div className="font-medium">{item.name}</div>
                            <div className="text-xs text-muted-foreground">{cat?.name}</div>
                            <div className="text-muted-foreground text-sm">${parseFloat(item.price).toLocaleString("es-AR", { minimumFractionDigits: 2 })}</div>
                          </button>
                        );
                      })}
                    </div>
                  );
                }

                if (selectedCategory) {
                  return (
                    <div className="grid gap-2 sm:grid-cols-2">
                      {menuItems
                        .filter((item) => item.categoryId === selectedCategory && item.isAvailable !== "false")
                        .map((item) => (
                          <button
                            key={item.id}
                            className="p-3 border rounded-md text-left hover-elevate flex items-center justify-between"
                            onClick={() => selectItem(item)}
                            data-testid={`select-item-${item.id}`}
                          >
                            <span className="font-medium">{item.name}</span>
                            <span className="text-muted-foreground">
                              ${parseFloat(item.price).toLocaleString("es-AR", { minimumFractionDigits: 2 })}
                            </span>
                          </button>
                        ))}
                    </div>
                  );
                }

                return (
                  <div className="text-center py-8 text-muted-foreground">
                    Selecciona una categoría o buscá un plato
                  </div>
                );
              })()}
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
                <Label>Cantidad</Label>
                <div className="flex items-center gap-2">
                  <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => setItemQuantity(Math.max(1, itemQuantity - 1))} data-testid="button-quantity-minus">
                    <Minus className="h-4 w-4" />
                  </Button>
                  <Input type="number" min={1} value={itemQuantity} onChange={(e) => setItemQuantity(Math.max(1, parseInt(e.target.value) || 1))} className="w-16 text-center h-8" data-testid="input-item-quantity" />
                  <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => setItemQuantity(itemQuantity + 1)} data-testid="button-quantity-plus">
                    <Plus className="h-4 w-4" />
                  </Button>
                  {itemQuantity > 1 && (
                    <span className="text-sm text-muted-foreground">= ${(parseFloat(pendingItem.price) * itemQuantity).toLocaleString("es-AR", { minimumFractionDigits: 2 })}</span>
                  )}
                </div>
              </div>
              {(() => {
                const cat = menuCategories.find(c => c.id === pendingItem.categoryId);
                const inferred = inferCourseFromCategory(cat?.name || "");
                if (inferred !== null) return null;
                const beverageCategories = ["bebidas sin alcohol", "cervezas", "vinos", "espumantes", "vinos de ríos", "bebidas"];
                const isBeverage = cat && beverageCategories.some(bc => cat.name.toLowerCase().includes(bc));
                if (isBeverage) return null;
                return (
                  <div className="space-y-2">
                    <Label>Curso</Label>
                    <div className="flex gap-2">
                      {[1, 2, 3].map(c => (
                        <Button
                          key={c}
                          variant={itemCourse === c ? "default" : "outline"}
                          size="sm"
                          onClick={() => setItemCourse(c)}
                          data-testid={`button-course-${c}`}
                        >
                          {courseLabels[c]}
                        </Button>
                      ))}
                    </div>
                  </div>
                );
              })()}
              {isEditableItem && (
                <div className="space-y-2 mt-2 p-3 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700 rounded-md">
                  <p className="text-xs text-amber-700 dark:text-amber-300 font-medium">Fuera de menú — completar descripción y precio</p>
                  <div>
                    <Label className="text-xs">Descripción *</Label>
                    <Input
                      value={customItemName}
                      onChange={(e) => setCustomItemName(e.target.value)}
                      placeholder="Ej: Milanesa napolitana especial"
                      data-testid="input-custom-item-name"
                    />
                  </div>
                  <div>
                    <Label className="text-xs">Precio <span className="font-normal text-muted-foreground">(con IVA incluido)</span></Label>
                    <Input
                      type="number"
                      step="0.01"
                      value={customItemPrice}
                      onChange={(e) => setCustomItemPrice(e.target.value)}
                      placeholder="0.00"
                      data-testid="input-custom-item-price"
                    />
                  </div>
                </div>
              )}
              <div>
                <button
                  type="button"
                  className="text-sm text-muted-foreground underline-offset-2 hover:underline"
                  onClick={() => setShowItemNotes(!showItemNotes)}
                >
                  {showItemNotes ? "Ocultar observaciones" : "+ Agregar observación"}
                </button>
                {showItemNotes && (
                  <Textarea
                    value={itemNotes}
                    onChange={(e) => setItemNotes(e.target.value)}
                    placeholder="Ej: sin sal, término medio, sin gluten..."
                    rows={2}
                    autoFocus
                    className="mt-2"
                    data-testid="input-item-notes"
                  />
                )}
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
            {/* Agregar más — solo en vista comanda */}
            {orderView === "comanda" && (
              <Button
                variant="outline"
                size="lg"
                className="w-full sm:w-auto"
                onClick={() => setOrderView("menu")}
                data-testid="button-comanda-add-more-footer"
              >
                <Plus className="h-4 w-4 mr-1" />
                Agregar más
              </Button>
            )}
            {/* Listo / Cerrar — cierra el dialog sin cerrar la mesa */}
            {orderView !== "delete" && !pendingItem && (
              <Button
                variant="outline"
                size="lg"
                className="w-full sm:w-auto"
                onClick={() => setIsOrderDialogOpen(false)}
                data-testid="button-done"
              >
                <CheckCircle2 className="h-4 w-4 mr-1" />
                Listo / Cerrar
              </Button>
            )}
            {/* Cerrar Mesa — siempre visible salvo cuando hay item pendiente o vista delete */}
            {orderView !== "delete" && !pendingItem && (
              <Button
                variant="destructive"
                size="lg"
                className="w-full sm:w-auto"
                onClick={() => {
                  setIsOrderDialogOpen(false);
                  setCloseReceiptType("ticket");
                  setClosePaymentMethod("efectivo");
                  setIsCloseDialogOpen(true);
                }}
                data-testid="button-close-table"
              >
                <CreditCard className="h-5 w-5 mr-2" />
                Cerrar Mesa
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Close Order Dialog with Receipt Type, Payment Method, and Split */}
      <Dialog open={isCloseDialogOpen} onOpenChange={(open) => { setIsCloseDialogOpen(open); if (!open) { setIsSplitMode(false); setRoomSearchFilter(""); } }}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Receipt className="h-5 w-5" />
              Cerrar - {getUpdatedOrder()?.orderLabel || currentOrder?.orderNumber}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <h3 className="font-semibold">Resumen de Consumos</h3>
            {getOrderItems().length === 0 ? (
              <p className="text-muted-foreground text-center py-4">No hay items en este pedido</p>
            ) : (
              <div className="space-y-2 max-h-40 overflow-y-auto">
                {getOrderItems().map((item) => (
                  <div key={item.id} className="flex items-center justify-between py-2 border-b">
                    <div>
                      <span>{item.menuItem?.name || "Item"}</span>
                      <span className="text-muted-foreground ml-2">x{item.quantity}</span>
                      {item.course && item.course > 1 && <Badge variant="outline" className="ml-1 text-[10px]">{courseLabels[item.course]}</Badge>}
                    </div>
                    <span>
                      ${parseFloat(item.subtotal).toLocaleString("es-AR", { minimumFractionDigits: 2 })}
                    </span>
                  </div>
                ))}
              </div>
            )}
            <div className="pt-2 border-t space-y-1">
              <div className="flex justify-between text-sm">
                <span>Subtotal:</span>
                <span>${parseFloat(getUpdatedOrder()?.subtotal || "0").toLocaleString("es-AR", { minimumFractionDigits: 2 })}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span>IVA (21%):</span>
                <span>${parseFloat(getUpdatedOrder()?.tax || "0").toLocaleString("es-AR", { minimumFractionDigits: 2 })}</span>
              </div>
              <div className="flex items-center gap-2 pt-1">
                <Label className="text-sm whitespace-nowrap">Descuento:</Label>
                <Input type="number" min={0} step="0.01" placeholder="0" value={closeDiscount} onChange={(e) => setCloseDiscount(e.target.value)} className="h-8 w-24" data-testid="input-close-discount" />
                <Select value={closeDiscountType} onValueChange={(v) => setCloseDiscountType(v as "amount" | "percent")}>
                  <SelectTrigger className="h-8 w-20" data-testid="select-discount-type"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="amount">$</SelectItem>
                    <SelectItem value="percent">%</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {(() => {
                const total = parseFloat(getUpdatedOrder()?.total || "0");
                const disc = parseFloat(closeDiscount || "0");
                const discAmount = closeDiscountType === "percent" ? total * disc / 100 : disc;
                const finalTotal = Math.max(0, total - discAmount);
                return (
                  <>
                    {disc > 0 && (
                      <div className="flex justify-between text-sm text-green-600">
                        <span>Descuento:</span>
                        <span>-${discAmount.toLocaleString("es-AR", { minimumFractionDigits: 2 })}</span>
                      </div>
                    )}
                    <div className="flex justify-between text-xl font-bold pt-2">
                      <span>Total:</span>
                      <span>${finalTotal.toLocaleString("es-AR", { minimumFractionDigits: 2 })}</span>
                    </div>
                  </>
                );
              })()}
            </div>

            <Button
              variant="outline"
              size="sm"
              className="w-full"
              onClick={printBillPreview}
              data-testid="button-print-bill-preview"
            >
              <Printer className="h-4 w-4 mr-2" />
              Ver / Imprimir cuenta
            </Button>

            {!isSplitMode ? (
              <>
                {(() => {
                  const updOrder = getUpdatedOrder();
                  const isTableless = updOrder && !updOrder.tableId;
                  const tablelessReceiptTypes: Record<string, string> = {
                    voucher: "Voucher (No Fiscal)",
                  };
                  const tablelessPaymentMethods: Record<string, string> = {
                    cuenta_habitacion: "Cuenta Habitacion",
                    efectivo: "Efectivo",
                    pedidos_ya: "Pedidos Ya",
                  };
                  const activeReceiptTypes = isTableless ? tablelessReceiptTypes : receiptTypeLabels;
                  const activePaymentMethods = isTableless ? tablelessPaymentMethods : paymentMethodLabels;
                  const effectiveReceiptType = isTableless && !activeReceiptTypes[closeReceiptType] ? "voucher" : closeReceiptType;
                  const effectivePaymentMethod = isTableless && !activePaymentMethods[closePaymentMethod] ? "cuenta_habitacion" : closePaymentMethod;
                  if (effectiveReceiptType !== closeReceiptType) setTimeout(() => setCloseReceiptType(effectiveReceiptType), 0);
                  if (effectivePaymentMethod !== closePaymentMethod) setTimeout(() => setClosePaymentMethod(effectivePaymentMethod), 0);
                  return (
                    <div className="grid grid-cols-2 gap-4 pt-4 border-t">
                      <div className="space-y-2">
                        <Label>Tipo de Comprobante</Label>
                        {effectivePaymentMethod === "cuenta_habitacion" ? (
                          <div className="text-sm text-center text-muted-foreground bg-muted/50 rounded-md p-3">
                            <Receipt className="h-4 w-4 mx-auto mb-1 text-blue-500" />
                            Cargo a habitación.<br />
                            <span className="text-xs">Se emitirá Voucher automáticamente.</span>
                          </div>
                        ) : (
                          <>
                            <Select value={effectiveReceiptType} onValueChange={(v) => {
                              setCloseReceiptType(v);
                              if (v === "factura_b") {
                                setCloseBillingName("CONSUMIDOR FINAL");
                                setCloseBillingCuit("");
                                setCloseBillingCompanyId("");
                              } else if (v !== "factura_a") {
                                setCloseBillingName("");
                                setCloseBillingCuit("");
                                setCloseBillingCompanyId("");
                              }
                            }}>
                              <SelectTrigger data-testid="select-receipt-type">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                {Object.entries(activeReceiptTypes).map(([value, label]) => (
                                  <SelectItem key={value} value={value}>{label}</SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                            {isTableless && (
                              <p className="text-xs text-muted-foreground">Área sin mesas: solo Voucher</p>
                            )}
                          </>
                        )}
                      </div>
                      <div className="space-y-2">
                        <Label>Forma de Pago</Label>
                        <Select value={effectivePaymentMethod} onValueChange={(v) => {
                          setClosePaymentMethod(v);
                          if (v === "cuenta_habitacion") {
                            setCloseReceiptType("voucher");
                          }
                        }}>
                          <SelectTrigger data-testid="select-payment-method">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {Object.entries(activePaymentMethods).map(([value, label]) => (
                              <SelectItem key={value} value={value}>{label}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                  );
                })()}

                {/* Selector de empresa/agencia para CC */}
                {closePaymentMethod === "cuenta_corriente" && (
                  <div className="space-y-3 p-3 border rounded-md bg-blue-50 dark:bg-blue-950/20 border-blue-200 dark:border-blue-800">
                    <p className="text-sm font-medium text-blue-800 dark:text-blue-200">Cuenta Corriente — ¿A quién se carga?</p>
                    <div className="flex gap-2">
                      <Select value={closeCcEntityType} onValueChange={(v) => { setCloseCcEntityType(v as "company" | "agency"); setCloseCcEntityId(""); }}>
                        <SelectTrigger className="w-32" data-testid="select-cc-entity-type">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="company">Empresa</SelectItem>
                          <SelectItem value="agency">Agencia</SelectItem>
                        </SelectContent>
                      </Select>
                      <Select value={closeCcEntityId} onValueChange={setCloseCcEntityId}>
                        <SelectTrigger className="flex-1" data-testid="select-cc-entity">
                          <SelectValue placeholder="Seleccionar..." />
                        </SelectTrigger>
                        <SelectContent>
                          {closeCcEntityType === "company"
                            ? companies.filter(c => c.id).map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)
                            : agencies.filter(a => a.id).map(a => <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>)
                          }
                        </SelectContent>
                      </Select>
                    </div>
                    {!closeCcEntityId && (
                      <p className="text-xs text-amber-600 dark:text-amber-400">Si no seleccionás una entidad, el cargo no se registrará en ninguna Cuenta Corriente.</p>
                    )}
                  </div>
                )}

                {(closeReceiptType === "factura_a" || closeReceiptType === "factura_b") && closePaymentMethod !== "cuenta_habitacion" && (
                  <div className="space-y-3 p-3 border rounded-md bg-muted/30">
                    <p className="text-sm font-medium">Datos de facturación</p>
                    {closeReceiptType === "factura_a" && (
                      <div>
                        <Label className="text-xs text-muted-foreground">Empresa existente (opcional)</Label>
                        <Select
                          value={closeBillingCompanyId || "manual"}
                          onValueChange={(v) => {
                            if (v === "manual") {
                              setCloseBillingCompanyId("");
                              setCloseBillingName("");
                              setCloseBillingCuit("");
                            } else {
                              setCloseBillingCompanyId(v);
                              const company = companies.find(c => c.id === v);
                              if (company) {
                                setCloseBillingName(company.razonSocial);
                                setCloseBillingCuit(company.cuilCuit);
                              }
                            }
                          }}
                        >
                          <SelectTrigger data-testid="select-billing-company">
                            <SelectValue placeholder="— Ingresar datos manualmente —" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="manual">— Ingresar datos manualmente —</SelectItem>
                            {companies.length === 0 && (
                              <div className="px-3 py-2 text-xs text-muted-foreground">Sin empresas cargadas</div>
                            )}
                            {companies.filter(c => c.id).map(c => (
                              <SelectItem key={c.id} value={c.id}>
                                {c.razonSocial}{c.nombreFantasia ? ` (${c.nombreFantasia})` : ""}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    )}
                    <div>
                      <Label className="text-xs">Razón social / Nombre</Label>
                      <Input
                        value={closeBillingName}
                        onChange={(e) => { setCloseBillingName(e.target.value); setCloseBillingCompanyId(""); }}
                        placeholder="Ej: Juan García / Empresa SA"
                        data-testid="input-billing-name"
                      />
                    </div>
                    <div>
                      <Label className="text-xs">CUIT / DNI</Label>
                      <Input
                        value={closeBillingCuit}
                        onChange={(e) => { setCloseBillingCuit(e.target.value); setCloseBillingCompanyId(""); }}
                        placeholder="20-12345678-9"
                        data-testid="input-billing-cuit"
                      />
                    </div>
                  </div>
                )}

                {closePaymentMethod === "cuenta_habitacion" && (
                  <div className="space-y-2">
                    <Label>Habitación</Label>
                    <Input
                      placeholder="Buscar por número o nombre..."
                      value={roomSearchFilter}
                      onChange={(e) => setRoomSearchFilter(e.target.value)}
                      className="mb-1"
                      data-testid="input-room-search"
                    />
                    <Select value={closeRoomId} onValueChange={setCloseRoomId}>
                      <SelectTrigger data-testid="select-room-charge"><SelectValue placeholder="Seleccionar habitación" /></SelectTrigger>
                      <SelectContent>
                        {inHouseRooms
                          .filter((r) =>
                            roomSearchFilter === "" ||
                            r.roomNumber.includes(roomSearchFilter) ||
                            r.guestName.toLowerCase().includes(roomSearchFilter.toLowerCase())
                          )
                          .filter(r => r.reservationId)
                          .map(r => (
                            <SelectItem key={r.roomId} value={r.reservationId}>{r.roomNumber} — {r.guestName}</SelectItem>
                          ))}
                      </SelectContent>
                    </Select>
                    {inHouseRooms.length === 0 && (
                      <p className="text-sm text-muted-foreground">No hay habitaciones ocupadas</p>
                    )}
                  </div>
                )}

                <div className="pt-2 border-t">
                  <Button
                    variant="outline"
                    size="sm"
                    className="w-full"
                    onClick={() => setIsSplitMode(true)}
                    data-testid="button-split-bill"
                  >
                    <Banknote className="h-4 w-4 mr-2" />
                    Dividir Cuenta
                  </Button>
                </div>
              </>
            ) : (
              <div className="pt-4 border-t space-y-4">
                <h4 className="font-semibold flex items-center gap-2">
                  <Banknote className="h-4 w-4" />
                  Dividir Cuenta
                </h4>
                {(() => {
                  const updatedOrder = orders?.find((o: RestaurantOrder) => o.id === currentOrder?.id);
                  const splits: OrderSplit[] = (updatedOrder as any)?.splits || [];
                  if (splits.length === 0) {
                    return (
                      <div className="space-y-3">
                        <div className="space-y-2">
                          <Label>Cantidad de partes</Label>
                          <div className="flex gap-2">
                            {[2, 3, 4].map(n => (
                              <Button
                                key={n}
                                variant={splitParts === n ? "default" : "outline"}
                                size="sm"
                                onClick={() => setSplitParts(n)}
                                data-testid={`button-split-${n}`}
                              >
                                {n} partes
                              </Button>
                            ))}
                            <Input
                              type="number"
                              min={2}
                              max={10}
                              value={splitParts}
                              onChange={(e) => setSplitParts(Math.max(2, parseInt(e.target.value) || 2))}
                              className="w-20"
                              data-testid="input-split-parts"
                            />
                          </div>
                        </div>
                        <div className="p-3 bg-muted rounded-md text-sm">
                          Cada parte: <strong>${(parseFloat(getUpdatedOrder()?.total || "0") / splitParts).toLocaleString("es-AR", { minimumFractionDigits: 2 })}</strong>
                        </div>
                        <div className="flex gap-2">
                          <Button
                            variant="outline"
                            onClick={() => setIsSplitMode(false)}
                            className="flex-1"
                          >
                            Cancelar
                          </Button>
                          <Button
                            onClick={() => {
                              if (currentOrder) createSplitMutation.mutate({ orderId: currentOrder.id, parts: splitParts });
                            }}
                            disabled={createSplitMutation.isPending}
                            className="flex-1"
                            data-testid="button-confirm-split"
                          >
                            {createSplitMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                            Dividir
                          </Button>
                        </div>
                      </div>
                    );
                  }
                  return (
                    <div className="space-y-3">
                      {splits.map((split) => (
                        <div key={split.id} className={`p-3 border rounded-md ${split.isPaid === "true" ? "bg-green-500/10 border-green-500/30" : ""}`}>
                          <div className="flex items-center justify-between mb-2">
                            <span className="font-medium">Parte {split.splitNumber}</span>
                            {split.isPaid === "true" ? (
                              <span className="font-bold">${parseFloat(split.amount).toLocaleString("es-AR", { minimumFractionDigits: 2 })}</span>
                            ) : (
                              <div className="flex items-center gap-1">
                                <span className="text-sm text-muted-foreground">$</span>
                                <Input
                                  type="number"
                                  min="0"
                                  step="0.01"
                                  className="h-7 w-28 text-right font-bold"
                                  value={splitEditAmounts[split.id] ?? split.amount}
                                  onChange={(e) => setSplitEditAmounts(prev => ({ ...prev, [split.id]: e.target.value }))}
                                  onBlur={() => {
                                    const newAmount = splitEditAmounts[split.id];
                                    if (newAmount !== undefined && newAmount !== split.amount && currentOrder) {
                                      updateSplitAmountMutation.mutate({ orderId: currentOrder.id, splitId: split.id, amount: newAmount });
                                    }
                                  }}
                                />
                              </div>
                            )}
                          </div>
                          {split.isPaid === "true" ? (
                            <Badge variant="default" className="bg-green-600">Pagado - {paymentMethodLabels[split.method || ""] || split.method}</Badge>
                          ) : (
                            <div className="space-y-2">
                              <div className="flex gap-2 items-center">
                                <div className="flex-1">
                                  <Select value={splitPayMethods[split.id] || "efectivo"} onValueChange={(v) => setSplitPayMethods(prev => ({ ...prev, [split.id]: v }))}>
                                    <SelectTrigger className="h-8" data-testid={`select-split-method-${split.splitNumber}`}>
                                      <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                      {Object.entries(paymentMethodLabels).map(([v, l]) => (
                                        <SelectItem key={v} value={v}>{l}</SelectItem>
                                      ))}
                                    </SelectContent>
                                  </Select>
                                </div>
                                <div className="flex-1">
                                  <Select value={splitReceiptTypes[split.id] || "ticket"} onValueChange={(v) => setSplitReceiptTypes(prev => ({ ...prev, [split.id]: v }))}>
                                    <SelectTrigger className="h-8" data-testid={`select-split-receipt-${split.splitNumber}`}>
                                      <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                      {Object.entries(receiptTypeLabels).map(([v, l]) => (
                                        <SelectItem key={v} value={v}>{l}</SelectItem>
                                      ))}
                                    </SelectContent>
                                  </Select>
                                </div>
                                <Button
                                  size="sm"
                                  onClick={() => {
                                    if (currentOrder) {
                                      const method = splitPayMethods[split.id] || "efectivo";
                                      if (method === "cuenta_habitacion" && !splitRoomIds[split.id]) {
                                        toast({ title: "Seleccioná una habitación", variant: "destructive" });
                                        return;
                                      }
                                      paySplitMutation.mutate({
                                        orderId: currentOrder.id,
                                        splitId: split.id,
                                        method,
                                        receiptType: splitReceiptTypes[split.id] || "ticket",
                                        roomReservationId: method === "cuenta_habitacion" ? splitRoomIds[split.id] : undefined,
                                      });
                                    }
                                  }}
                                  disabled={paySplitMutation.isPending}
                                  data-testid={`button-pay-split-${split.splitNumber}`}
                                >
                                  Cobrar
                                </Button>
                              </div>
                              {(splitPayMethods[split.id] || "efectivo") === "cuenta_habitacion" && (
                                <div className="space-y-1 p-2 bg-muted/50 rounded-md border">
                                  <Label className="text-xs text-muted-foreground">Habitación a cargar</Label>
                                  <Input
                                    placeholder="Buscar por número o huésped..."
                                    value={splitRoomSearchFilters[split.id] || ""}
                                    onChange={(e) => setSplitRoomSearchFilters(prev => ({ ...prev, [split.id]: e.target.value }))}
                                    className="h-7 text-sm"
                                    data-testid={`input-split-room-search-${split.splitNumber}`}
                                  />
                                  <Select value={splitRoomIds[split.id] || ""} onValueChange={(v) => setSplitRoomIds(prev => ({ ...prev, [split.id]: v }))}>
                                    <SelectTrigger className="h-8 text-sm" data-testid={`select-split-room-${split.splitNumber}`}>
                                      <SelectValue placeholder="Seleccionar habitación..." />
                                    </SelectTrigger>
                                    <SelectContent>
                                      {inHouseRooms
                                        .filter((r) => {
                                          const search = splitRoomSearchFilters[split.id] || "";
                                          return search === "" || r.roomNumber.includes(search) || r.guestName.toLowerCase().includes(search.toLowerCase());
                                        })
                                        .filter(r => r.reservationId)
                                        .map(r => (
                                          <SelectItem key={r.roomId} value={r.reservationId}>{r.roomNumber} — {r.guestName}</SelectItem>
                                        ))}
                                      {inHouseRooms.length === 0 && (
                                        <SelectItem value="__empty__" disabled>No hay habitaciones ocupadas</SelectItem>
                                      )}
                                    </SelectContent>
                                  </Select>
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      ))}
                      <div className="flex gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => {
                            if (currentOrder) cancelSplitMutation.mutate(currentOrder.id);
                          }}
                          disabled={cancelSplitMutation.isPending || splits.some(s => s.isPaid === "true")}
                          data-testid="button-cancel-split"
                        >
                          Cancelar División
                        </Button>
                      </div>
                    </div>
                  );
                })()}
              </div>
            )}
          </div>
          <DialogFooter className="flex-col sm:flex-row gap-2">
            <Button
              variant="outline"
              onClick={() => { setIsCloseDialogOpen(false); setIsSplitMode(false); }}
              className="w-full sm:w-auto"
            >
              Volver
            </Button>
            {!isSplitMode && (() => {
              const updatedOrder = orders?.find((o: RestaurantOrder) => o.id === currentOrder?.id);
              const hasSplits = ((updatedOrder as any)?.splits || []).length > 0;
              return !hasSplits ? (
                <Button
                  variant="destructive"
                  onClick={() => {
                    if (currentOrder) {
                      const disc = parseFloat(closeDiscount || "0");
                      closeOrderMutation.mutate({
                        orderId: currentOrder.id,
                        receiptType: closePaymentMethod === "cuenta_habitacion" ? "voucher" : closeReceiptType,
                        paymentMethod: closePaymentMethod,
                        discount: disc > 0 ? disc : undefined,
                        discountType: disc > 0 ? closeDiscountType : undefined,
                        roomReservationId: closePaymentMethod === "cuenta_habitacion" && closeRoomId ? closeRoomId : undefined,
                        billingName: closeBillingName || undefined,
                        billingCuit: closeBillingCuit || undefined,
                        ccEntityType: closePaymentMethod === "cuenta_corriente" && closeCcEntityId ? closeCcEntityType : undefined,
                        ccEntityId: closePaymentMethod === "cuenta_corriente" && closeCcEntityId ? closeCcEntityId : undefined,
                      });
                    }
                  }}
                  disabled={closeOrderMutation.isPending}
                  className="w-full sm:w-auto"
                  data-testid="button-confirm-close"
                >
                  {closeOrderMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                  Confirmar Cierre
                </Button>
              ) : (
                <Button
                  variant="outline"
                  onClick={() => setIsSplitMode(true)}
                  className="w-full sm:w-auto"
                  data-testid="button-view-splits"
                >
                  Ver División ({((updatedOrder as any)?.splits || []).filter((s: OrderSplit) => s.isPaid === "true").length}/{((updatedOrder as any)?.splits || []).length} pagadas)
                </Button>
              );
            })()}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Cancel Order Confirmation Dialog */}
      <Dialog open={showCancelOrderDialog} onOpenChange={(open) => { if (!open) { setShowCancelOrderDialog(false); setCancelOrderReason(""); } }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-destructive">
              <XCircle className="h-5 w-5" />
              Cancelar Ticket
            </DialogTitle>
            <DialogDescription>
              Se cancelará el ticket <strong>{getUpdatedOrder()?.orderLabel || getUpdatedOrder()?.orderNumber}</strong>. La mesa quedará disponible. Esta acción no se puede deshacer.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <label className="text-sm font-medium">Motivo de cancelación <span className="text-destructive">*</span></label>
            <Textarea
              placeholder="Ej: Cliente se fue, pedido erróneo, error de apertura..."
              value={cancelOrderReason}
              onChange={(e) => setCancelOrderReason(e.target.value)}
              rows={3}
              data-testid="input-cancel-order-reason"
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setShowCancelOrderDialog(false); setCancelOrderReason(""); }}>
              Volver
            </Button>
            <Button
              variant="destructive"
              disabled={!cancelOrderReason.trim() || cancelOrderMutation.isPending}
              onClick={() => { if (currentOrder) cancelOrderMutation.mutate({ orderId: currentOrder.id, reason: cancelOrderReason }); }}
              data-testid="button-confirm-cancel-order"
            >
              {cancelOrderMutation.isPending ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Cancelando...</> : "Confirmar Cancelación"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Reservation Dialog */}
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
                    <FormLabel>Nombre del huésped / cliente *</FormLabel>
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
                      {timeSlots.length > 0 ? (
                        <Select onValueChange={field.onChange} value={field.value}>
                          <FormControl>
                            <SelectTrigger data-testid="select-reservation-time">
                              <SelectValue placeholder="Seleccionar turno" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            {timeSlots.map((slot) => (
                              <SelectItem key={slot.id} value={slot.time}>
                                {slot.time} {slot.label ? `(${slot.label})` : ""}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      ) : (
                        <FormControl>
                          <Input {...field} type="time" data-testid="input-reservation-time" />
                        </FormControl>
                      )}
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
                              {table.hasWindow === "true" ? " - Ventana" : ""}
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

      {/* Edit Reservation Dialog */}
      <Dialog open={isEditReservationOpen} onOpenChange={setIsEditReservationOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Editar Reserva</DialogTitle>
          </DialogHeader>
          {editingReservation && (
            <div className="space-y-4">
              <div className="grid gap-2">
                <Label>Nombre</Label>
                <Input value={editingReservation.guestName} onChange={(e) => setEditingReservation({...editingReservation, guestName: e.target.value})} data-testid="input-edit-guest-name" />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="grid gap-2">
                  <Label>Fecha</Label>
                  <Input type="date" value={editingReservation.reservationDate} onChange={(e) => setEditingReservation({...editingReservation, reservationDate: e.target.value})} data-testid="input-edit-date" />
                </div>
                <div className="grid gap-2">
                  <Label>Hora</Label>
                  {timeSlots.length > 0 ? (
                    <Select value={editingReservation.reservationTime} onValueChange={(v) => setEditingReservation({...editingReservation, reservationTime: v})}>
                      <SelectTrigger data-testid="select-edit-time"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {timeSlots.map((slot) => (
                          <SelectItem key={slot.id} value={slot.time}>{slot.time} {slot.label ? `(${slot.label})` : ""}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  ) : (
                    <Input type="time" value={editingReservation.reservationTime} onChange={(e) => setEditingReservation({...editingReservation, reservationTime: e.target.value})} data-testid="input-edit-time" />
                  )}
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="grid gap-2">
                  <Label>Mesa</Label>
                  <Select value={editingReservation.tableId} onValueChange={(v) => setEditingReservation({...editingReservation, tableId: v})}>
                    <SelectTrigger data-testid="select-edit-table"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {tables.filter(t => t.isActive === "true").map((table) => (
                        <SelectItem key={table.id} value={table.id}>Mesa {table.tableNumber} ({table.capacity} pers.)</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid gap-2">
                  <Label>Personas</Label>
                  <Input type="number" min={1} value={editingReservation.partySize} onChange={(e) => setEditingReservation({...editingReservation, partySize: parseInt(e.target.value) || 1})} data-testid="input-edit-party-size" />
                </div>
              </div>
              <div className="grid gap-2">
                <Label>Notas</Label>
                <Textarea value={editingReservation.notes || ""} onChange={(e) => setEditingReservation({...editingReservation, notes: e.target.value})} data-testid="input-edit-notes" />
              </div>
              <div className="border-t pt-4 space-y-3">
                <Label className="text-sm font-medium">Anticipo / Seña</Label>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label className="text-xs">Monto</Label>
                    <Input
                      type="number"
                      step="0.01"
                      value={(editingReservation as any).advanceAmount || ""}
                      onChange={(e) => setEditingReservation({ ...editingReservation, advanceAmount: e.target.value } as any)}
                      placeholder="0.00"
                      data-testid="input-advance-amount"
                    />
                  </div>
                  <div>
                    <Label className="text-xs">Método</Label>
                    <Select
                      value={(editingReservation as any).advanceMethod || ""}
                      onValueChange={(v) => setEditingReservation({ ...editingReservation, advanceMethod: v } as any)}
                    >
                      <SelectTrigger data-testid="select-advance-method"><SelectValue placeholder="Forma de pago" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="efectivo">Efectivo</SelectItem>
                        <SelectItem value="transferencia">Transferencia</SelectItem>
                        <SelectItem value="tarjeta_debito">Tarjeta Débito</SelectItem>
                        <SelectItem value="tarjeta_credito">Tarjeta Crédito</SelectItem>
                        <SelectItem value="mercadopago">MercadoPago</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div>
                  <Label className="text-xs">Notas del anticipo</Label>
                  <Input
                    value={(editingReservation as any).advanceNotes || ""}
                    onChange={(e) => setEditingReservation({ ...editingReservation, advanceNotes: e.target.value } as any)}
                    placeholder="Referencia, comprobante, observación..."
                    data-testid="input-advance-notes"
                  />
                </div>
                {parseFloat((editingReservation as any).advanceAmount || "0") > 0 && (
                  <div className="text-xs text-muted-foreground bg-muted/50 rounded p-2">
                    Anticipo registrado: ${parseFloat((editingReservation as any).advanceAmount).toLocaleString("es-AR")}
                    {(editingReservation as any).advanceMethod && ` — ${(editingReservation as any).advanceMethod}`}
                  </div>
                )}
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setIsEditReservationOpen(false)}>Cancelar</Button>
                <Button onClick={() => {
                  updateReservationMutation.mutate({ id: editingReservation.id, data: {
                    guestName: editingReservation.guestName,
                    reservationDate: editingReservation.reservationDate,
                    reservationTime: editingReservation.reservationTime,
                    tableId: editingReservation.tableId,
                    partySize: editingReservation.partySize,
                    notes: editingReservation.notes,
                    advanceAmount: (editingReservation as any).advanceAmount || null,
                    advanceMethod: (editingReservation as any).advanceMethod || null,
                    advanceNotes: (editingReservation as any).advanceNotes || null,
                  }});
                  setIsEditReservationOpen(false);
                }} disabled={updateReservationMutation.isPending} data-testid="button-save-edit-reservation">
                  {updateReservationMutation.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
                  Guardar Cambios
                </Button>
              </DialogFooter>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Daily Reservations Dialog */}
      <Dialog open={isDailyReservationsOpen} onOpenChange={setIsDailyReservationsOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Reservas de Restaurant</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            {/* Mode selector + date filter */}
            <div className="flex gap-2 items-center flex-wrap">
              <Button size="sm" variant={reservationViewMode === "day" ? "default" : "outline"} onClick={() => setReservationViewMode("day")}>
                Por día
              </Button>
              <Button size="sm" variant={reservationViewMode === "all" ? "default" : "outline"} onClick={() => setReservationViewMode("all")}>
                Próximas
              </Button>
              <Button size="sm" variant={reservationViewMode === "past" ? "default" : "outline"} onClick={() => setReservationViewMode("past")}>
                Pasadas
              </Button>
              {reservationViewMode === "day" && (
                <Input
                  type="date"
                  value={reservationDateFilter}
                  onChange={(e) => setReservationDateFilter(e.target.value)}
                  className="h-8 w-40"
                />
              )}
            </div>
            <Input
              placeholder="Buscar por nombre, teléfono o email..."
              value={reservationSearchText}
              onChange={(e) => setReservationSearchText(e.target.value)}
            />
            {(() => {
              const todayStr = new Date().toLocaleDateString("en-CA", { timeZone: "America/Argentina/Buenos_Aires" });
              const filteredRes = reservations.filter(r => {
                if (r.status === "cancelled") return false;
                if (reservationViewMode === "day" && r.reservationDate !== reservationDateFilter) return false;
                if (reservationViewMode === "all" && r.reservationDate < todayStr) return false;
                if (reservationViewMode === "past" && r.reservationDate >= todayStr) return false;
                if (reservationSearchText) {
                  const q = reservationSearchText.toLowerCase();
                  return (
                    r.guestName.toLowerCase().includes(q) ||
                    (r.guestPhone || "").includes(q) ||
                    (r.guestEmail || "").toLowerCase().includes(q) ||
                    r.reservationDate.includes(q)
                  );
                }
                return true;
              }).sort((a, b) => {
                if (reservationViewMode === "all") return a.reservationDate.localeCompare(b.reservationDate) || a.reservationTime.localeCompare(b.reservationTime);
                if (reservationViewMode === "past") return b.reservationDate.localeCompare(a.reservationDate) || b.reservationTime.localeCompare(a.reservationTime);
                return a.reservationTime.localeCompare(b.reservationTime);
              });

              if (filteredRes.length === 0) {
                return (
                  <div className="text-center py-8 text-muted-foreground">
                    <CalendarDays className="h-12 w-12 mx-auto mb-4 opacity-50" />
                    <p>No hay reservas para este filtro</p>
                  </div>
                );
              }

              return (
                <div className="space-y-3 max-h-96 overflow-y-auto">
                  {filteredRes.map((reservation) => {
                    const table = tables.find(t => t.id === reservation.tableId);
                    return (
                      <div
                        key={reservation.id}
                        className="flex items-center justify-between p-3 border rounded-md gap-4"
                        data-testid={`daily-reservation-${reservation.id}`}
                      >
                        <div className="flex items-center gap-4">
                          <div className="text-center">
                            <div className="text-lg font-bold">{reservation.reservationTime}</div>
                            {reservationViewMode === "all" && (
                              <div className="text-xs text-muted-foreground">{new Date(reservation.reservationDate + "T12:00:00").toLocaleDateString("es-AR", { day: "2-digit", month: "2-digit" })}</div>
                            )}
                          </div>
                          <div>
                            <div className="font-medium flex items-center gap-2">
                              {reservation.guestName}
                              {parseFloat((reservation as any).advanceAmount || "0") > 0 && (
                                <Badge variant="outline" className="text-xs text-green-700 border-green-400">
                                  Seña ${parseFloat((reservation as any).advanceAmount).toLocaleString("es-AR")}
                                </Badge>
                              )}
                            </div>
                            <div className="text-sm text-muted-foreground">
                              Mesa {table?.tableNumber || "?"} — {reservation.partySize} personas
                              {table?.hasWindow === "true" && " (Ventana)"}
                            </div>
                          </div>
                        </div>
                        {(() => {
                          const todayStr2 = new Date().toLocaleDateString("en-CA", { timeZone: "America/Argentina/Buenos_Aires" });
                          const isPast = reservation.reservationDate < todayStr2;
                          const isFinished = isPast && (reservation.status === "confirmed" || reservation.status === "pending");
                          return (
                            <div className="flex items-center gap-2">
                              <Badge className={isFinished ? "bg-gray-400/20 text-gray-600 dark:text-gray-400" : reservationStatusColors[reservation.status]}>
                                {isFinished ? "Finalizada" : reservationStatusLabels[reservation.status]}
                              </Badge>
                              {reservation.status === "pending" && !isPast && (
                                <Button size="sm" onClick={() => updateReservationMutation.mutate({ id: reservation.id, data: { status: "confirmed" } })}>
                                  <Check className="h-4 w-4" />
                                </Button>
                              )}
                            </div>
                          );
                        })()}
                      </div>
                    );
                  })}
                </div>
              );
            })()}
          </div>
          <DialogFooter>
            <Button onClick={() => setIsDailyReservationsOpen(false)}>Cerrar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Add Table Dialog */}
      <Dialog open={isAddTableDialogOpen} onOpenChange={setIsAddTableDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Agregar Mesa</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Numero de Mesa *</Label>
                <Input
                  value={newTableNumber}
                  onChange={(e) => setNewTableNumber(e.target.value)}
                  placeholder="Ej: 1, 2, A1"
                  data-testid="input-new-table-number"
                />
              </div>
              <div className="space-y-2">
                <Label>Capacidad</Label>
                <Input
                  type="number"
                  min={1}
                  value={newTableCapacity}
                  onChange={(e) => setNewTableCapacity(parseInt(e.target.value) || 1)}
                  data-testid="input-new-table-capacity"
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Forma</Label>
                <Select value={newTableShape} onValueChange={setNewTableShape}>
                  <SelectTrigger data-testid="select-new-table-shape">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="square">Cuadrada</SelectItem>
                    <SelectItem value="round">Redonda</SelectItem>
                    <SelectItem value="rectangular">Rectangular</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Area</Label>
                <Select value={newTableArea} onValueChange={setNewTableArea}>
                  <SelectTrigger data-testid="select-new-table-area">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {areas.map((area) => (
                      <SelectItem key={area.id} value={area.id}>{area.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="flex items-center gap-3 p-3 border rounded-md">
              <Switch
                checked={newTableWindow}
                onCheckedChange={setNewTableWindow}
                data-testid="switch-new-table-window"
              />
              <div>
                <Label className="cursor-pointer">Mesa con ventana</Label>
                <p className="text-xs text-muted-foreground">Visible al hacer reservas</p>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsAddTableDialogOpen(false)}>Cancelar</Button>
            <Button
              onClick={() => {
                if (!newTableNumber || !newTableArea) return;
                const areaTbls = tables.filter(t => t.areaId === newTableArea);
                let px = 0, py = 0;
                if (areaTbls.length > 0) {
                  const maxX = Math.max(...areaTbls.map(t => t.positionX));
                  px = maxX + 1;
                  if (px >= 8) {
                    px = 0;
                    py = Math.max(...areaTbls.map(t => t.positionY)) + 1;
                  }
                }
                createTableMutation.mutate({
                  tableNumber: newTableNumber,
                  areaId: newTableArea,
                  capacity: newTableCapacity,
                  shape: newTableShape,
                  hasWindow: newTableWindow ? "true" : "false",
                  positionX: px,
                  positionY: py,
                });
              }}
              disabled={createTableMutation.isPending}
              data-testid="button-save-table"
            >
              {createTableMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Crear Mesa
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Table Dialog */}
      <Dialog open={isEditTableDialogOpen} onOpenChange={setIsEditTableDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Editar Mesa {editingTable?.tableNumber}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Capacidad</Label>
                <Input
                  type="number"
                  min={1}
                  value={editTableCapacity}
                  onChange={(e) => setEditTableCapacity(parseInt(e.target.value) || 1)}
                  data-testid="input-edit-table-capacity"
                />
              </div>
              <div className="space-y-2">
                <Label>Forma</Label>
                <Select value={editTableShape} onValueChange={setEditTableShape}>
                  <SelectTrigger data-testid="select-edit-table-shape">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="square">Cuadrada</SelectItem>
                    <SelectItem value="round">Redonda</SelectItem>
                    <SelectItem value="rectangular">Rectangular</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="flex items-center gap-3 p-3 border rounded-md">
              <Switch
                checked={editTableWindow}
                onCheckedChange={setEditTableWindow}
                data-testid="switch-edit-table-window"
              />
              <div>
                <Label className="cursor-pointer">Mesa con ventana</Label>
                <p className="text-xs text-muted-foreground">Visible al hacer reservas</p>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsEditTableDialogOpen(false)}>Cancelar</Button>
            <Button
              onClick={() => {
                if (!editingTable) return;
                updateTableMutation.mutate({
                  id: editingTable.id,
                  data: {
                    capacity: editTableCapacity,
                    shape: editTableShape,
                    hasWindow: editTableWindow ? "true" : "false",
                  },
                });
                setIsEditTableDialogOpen(false);
                toast({ title: "Mesa actualizada" });
              }}
              disabled={updateTableMutation.isPending}
              data-testid="button-save-edit-table"
            >
              Guardar Cambios
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Menu Item Dialog (Create/Edit) */}
      <Dialog open={isMenuItemDialogOpen} onOpenChange={setIsMenuItemDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingMenuItem ? "Editar Plato" : "Nuevo Plato"}</DialogTitle>
          </DialogHeader>
          <Form {...menuItemForm}>
            <form
              onSubmit={menuItemForm.handleSubmit((data) => {
                if (editingMenuItem) {
                  updateMenuItemMutation.mutate({ id: editingMenuItem.id, data });
                } else {
                  createMenuItemMutation.mutate(data);
                }
              })}
              className="space-y-4"
            >
              <FormField
                control={menuItemForm.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Nombre *</FormLabel>
                    <FormControl>
                      <Input {...field} placeholder="Nombre del plato" data-testid="input-menu-item-name" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={menuItemForm.control}
                name="categoryId"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Categoria *</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger data-testid="select-menu-item-category">
                          <SelectValue placeholder="Seleccionar categoria" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {sortedCategories.map((cat) => (
                          <SelectItem key={cat.id} value={cat.id}>{cat.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={menuItemForm.control}
                name="description"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Descripcion</FormLabel>
                    <FormControl>
                      <Textarea {...field} placeholder="Descripcion del plato" data-testid="input-menu-item-description" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <div className="grid grid-cols-2 gap-4">
                <FormField
                  control={menuItemForm.control}
                  name="price"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Precio <span className="text-xs font-normal text-muted-foreground">(con IVA incluido)</span></FormLabel>
                      <FormControl>
                        <Input {...field} type="number" step="0.01" min={0} data-testid="input-menu-item-price" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={menuItemForm.control}
                  name="preparationTime"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Tiempo prep. (min)</FormLabel>
                      <FormControl>
                        <Input {...field} type="number" min={0} data-testid="input-menu-item-prep-time" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
              <div className="flex gap-4">
                <FormField
                  control={menuItemForm.control}
                  name="isAvailable"
                  render={({ field }) => (
                    <FormItem className="flex items-center gap-3 p-3 border rounded-md flex-1">
                      <FormControl>
                        <Switch
                          checked={field.value === "true"}
                          onCheckedChange={(checked) => field.onChange(checked ? "true" : "false")}
                          data-testid="switch-menu-item-available"
                        />
                      </FormControl>
                      <FormLabel className="cursor-pointer !mt-0">Disponible</FormLabel>
                    </FormItem>
                  )}
                />
                <FormField
                  control={menuItemForm.control}
                  name="isEditable"
                  render={({ field }) => (
                    <FormItem className="flex items-center gap-3 p-3 border rounded-md flex-1">
                      <FormControl>
                        <Switch
                          checked={field.value === "true"}
                          onCheckedChange={(checked) => field.onChange(checked ? "true" : "false")}
                          data-testid="switch-menu-item-editable"
                        />
                      </FormControl>
                      <FormLabel className="cursor-pointer !mt-0">Fuera de menú</FormLabel>
                    </FormItem>
                  )}
                />
              </div>
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setIsMenuItemDialogOpen(false)}>Cancelar</Button>
                <Button
                  type="submit"
                  disabled={createMenuItemMutation.isPending || updateMenuItemMutation.isPending}
                  data-testid="button-save-menu-item"
                >
                  {(createMenuItemMutation.isPending || updateMenuItemMutation.isPending) && (
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  )}
                  {editingMenuItem ? "Actualizar" : "Crear Plato"}
                </Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>

      {/* Category Dialog (Create/Edit) */}
      <Dialog open={isCategoryDialogOpen} onOpenChange={setIsCategoryDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingCategory ? "Editar Categoria" : "Nueva Categoria"}</DialogTitle>
          </DialogHeader>
          <Form {...categoryForm}>
            <form
              onSubmit={categoryForm.handleSubmit((data) => {
                if (editingCategory) {
                  updateCategoryMutation.mutate({ id: editingCategory.id, data });
                } else {
                  createCategoryMutation.mutate(data);
                }
              })}
              className="space-y-4"
            >
              <FormField
                control={categoryForm.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Nombre *</FormLabel>
                    <FormControl>
                      <Input {...field} placeholder="Ej: Bebidas con alcohol, Entradas, etc." data-testid="input-category-name" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={categoryForm.control}
                name="description"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Descripcion</FormLabel>
                    <FormControl>
                      <Textarea {...field} placeholder="Descripcion de la categoria" data-testid="input-category-description" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={categoryForm.control}
                name="displayOrder"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Orden de Visualizacion</FormLabel>
                    <FormControl>
                      <Input {...field} type="number" min={0} data-testid="input-category-order" />
                    </FormControl>
                    <FormMessage />
                    <p className="text-xs text-muted-foreground">Orden sugerido: 1) Bebidas 2) Entradas 3) Principales 4) Postres</p>
                  </FormItem>
                )}
              />
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setIsCategoryDialogOpen(false)}>Cancelar</Button>
                <Button
                  type="submit"
                  disabled={createCategoryMutation.isPending || updateCategoryMutation.isPending}
                  data-testid="button-save-category"
                >
                  {(createCategoryMutation.isPending || updateCategoryMutation.isPending) && (
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  )}
                  {editingCategory ? "Actualizar" : "Crear Categoria"}
                </Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>

      {/* Time Slots Configuration Dialog */}
      <Dialog open={isTimeSlotsDialogOpen} onOpenChange={setIsTimeSlotsDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Clock className="h-5 w-5" />
              Configurar Turnos de Reserva
            </DialogTitle>
            <DialogDescription>
              Define los horarios disponibles para reservas
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="flex items-center gap-2">
              <Input
                type="time"
                value={newTimeSlot}
                onChange={(e) => setNewTimeSlot(e.target.value)}
                className="w-32"
                data-testid="input-new-time-slot"
              />
              <Button
                size="sm"
                onClick={() => {
                  if (newTimeSlot) createTimeSlotMutation.mutate(newTimeSlot);
                }}
                disabled={!newTimeSlot || createTimeSlotMutation.isPending}
                data-testid="button-add-time-slot"
              >
                <Plus className="h-4 w-4 mr-1" />
                Agregar
              </Button>
            </div>
            {timeSlots.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-4">
                Sin turnos configurados. Las reservas usaran horario libre.
              </p>
            ) : (
              <div className="flex flex-wrap gap-2">
                {timeSlots.map((slot) => (
                  <Badge key={slot.id} variant="secondary" className="gap-1 text-sm py-1.5 px-3">
                    {slot.time}
                    <button
                      onClick={() => deleteTimeSlotMutation.mutate(slot.id)}
                      className="ml-1 hover:text-destructive"
                      data-testid={`button-delete-slot-${slot.id}`}
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </Badge>
                ))}
              </div>
            )}
          </div>
          <DialogFooter>
            <Button onClick={() => setIsTimeSlotsDialogOpen(false)}>Cerrar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Recipe Dialog */}
      <Dialog open={isRecipeDialogOpen} onOpenChange={setIsRecipeDialogOpen}>
        <DialogContent className="max-w-2xl flex flex-col max-h-[90vh]">
          <DialogHeader className="shrink-0">
            <DialogTitle className="flex items-center gap-2">
              <ChefHat className="h-5 w-5" />
              Receta - {selectedRecipeItem?.name}
            </DialogTitle>
            <DialogDescription>
              {selectedRecipeItem && (
                <span>Precio de venta: ${parseFloat(selectedRecipeItem.price).toLocaleString("es-AR", { minimumFractionDigits: 2 })}</span>
              )}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 overflow-y-auto flex-1 pr-1">
            {currentRecipe && currentRecipe.ingredients.length > 0 && (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Ingrediente</TableHead>
                    <TableHead className="text-right">Cantidad</TableHead>
                    <TableHead>Unidad</TableHead>
                    <TableHead className="text-right">Costo Unit.</TableHead>
                    <TableHead className="text-right">Subtotal</TableHead>
                    <TableHead>Stock</TableHead>
                    <TableHead className="w-10"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {currentRecipe.ingredients.map((ing) => (
                    <TableRow key={ing.id}>
                      <TableCell className="font-medium">{ing.ingredientName}</TableCell>
                      <TableCell className="text-right">{ing.quantity}</TableCell>
                      <TableCell>{ing.unit}</TableCell>
                      <TableCell className="text-right">${parseFloat(ing.unitCost).toLocaleString("es-AR", { minimumFractionDigits: 2 })}</TableCell>
                      <TableCell className="text-right">
                        ${(parseFloat(ing.quantity) * parseFloat(ing.unitCost)).toLocaleString("es-AR", { minimumFractionDigits: 2 })}
                      </TableCell>
                      <TableCell>
                        {ing.inventoryItemId ? (
                          <span className="text-xs text-green-600 font-medium">✓ Vinculado</span>
                        ) : (
                          <span className="text-xs text-muted-foreground">Solo costeo</span>
                        )}
                      </TableCell>
                      <TableCell>
                        <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => deleteIngredientMutation.mutate(ing.id)}>
                          <Trash2 className="h-3 w-3 text-destructive" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                  <TableRow className="font-bold">
                    <TableCell colSpan={4} className="text-right">Costo Total:</TableCell>
                    <TableCell className="text-right">
                      ${recipeCost.toLocaleString("es-AR", { minimumFractionDigits: 2 })}
                    </TableCell>
                    <TableCell></TableCell>
                  </TableRow>
                </TableBody>
              </Table>
            )}

            {currentRecipe && selectedRecipeItem && (
              <div className="flex items-center gap-4 p-3 bg-muted rounded-md text-sm">
                <div>Costo: <strong>${recipeCost.toLocaleString("es-AR", { minimumFractionDigits: 2 })}</strong></div>
                <div>Precio: <strong>${parseFloat(selectedRecipeItem.price).toLocaleString("es-AR", { minimumFractionDigits: 2 })}</strong></div>
                <div>
                  Margen:{" "}
                  <strong className={parseFloat(selectedRecipeItem.price) - recipeCost >= 0 ? "text-green-600" : "text-red-600"}>
                    ${(parseFloat(selectedRecipeItem.price) - recipeCost).toLocaleString("es-AR", { minimumFractionDigits: 2 })}
                    {" "}({parseFloat(selectedRecipeItem.price) > 0 ? (((parseFloat(selectedRecipeItem.price) - recipeCost) / parseFloat(selectedRecipeItem.price)) * 100).toFixed(1) : 0}%)
                  </strong>
                </div>
              </div>
            )}

            <div className="border-t pt-4 space-y-3">
              <Label className="block font-medium">Agregar Ingrediente</Label>

              {/* Buscador de artículo del inventario — dropdown inline (evita conflicto focus-trap del Dialog) */}
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">Buscar artículo del inventario</Label>
                <div className="relative">
                  {!ingredientComboOpen ? (
                    <Button
                      type="button"
                      variant="outline"
                      className="w-full justify-between font-normal"
                      data-testid="btn-ingredient-combo"
                      onClick={() => { setIngredientComboOpen(true); setIngredientSearch(""); }}
                    >
                      <span className={newIngredientName ? "" : "text-muted-foreground"}>
                        {newIngredientName || "Buscar artículo..."}
                      </span>
                      <svg className="h-4 w-4 opacity-50 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 9l4-4 4 4m0 6l-4 4-4-4" /></svg>
                    </Button>
                  ) : (
                    <div className="border rounded-md bg-background shadow-md">
                      <div className="flex items-center border-b px-3 py-2 gap-2">
                        <svg className="h-4 w-4 shrink-0 opacity-50" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-4.35-4.35M17 11A6 6 0 1 1 5 11a6 6 0 0 1 12 0z" /></svg>
                        <input
                          autoFocus
                          className="flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
                          placeholder="Escribí el nombre del artículo..."
                          value={ingredientSearch}
                          onChange={(e) => setIngredientSearch(e.target.value)}
                          onKeyDown={(e) => { if (e.key === "Escape") { setIngredientComboOpen(false); setIngredientSearch(""); } }}
                          data-testid="input-ingredient-search"
                        />
                        <button type="button" className="text-muted-foreground hover:text-foreground" onClick={() => { setIngredientComboOpen(false); setIngredientSearch(""); }}>✕</button>
                      </div>
                      <div className="max-h-52 overflow-y-auto">
                        {(() => {
                          const filtered = (restaurantInventoryItems as any[]).filter((i: any) =>
                            !ingredientSearch || i.name.toLowerCase().includes(ingredientSearch.toLowerCase()) ||
                            (i.sku && i.sku.toLowerCase().includes(ingredientSearch.toLowerCase()))
                          );
                          if (filtered.length === 0) return <p className="text-sm text-muted-foreground text-center py-4">No se encontraron artículos</p>;
                          return filtered.map((item: any) => (
                            <button
                              key={item.id}
                              type="button"
                              className="w-full text-left px-3 py-2 hover:bg-accent flex flex-col gap-0.5"
                              data-testid={`combo-item-${item.id}`}
                              onMouseDown={(e) => {
                                e.preventDefault();
                                setNewIngredientInventoryId(item.id);
                                setNewIngredientName(item.name);
                                setNewIngredientUnit(item.unit);
                                setNewIngredientCost(item.costPrice || "0");
                                setIngredientSearch("");
                                setIngredientComboOpen(false);
                              }}
                            >
                              <span className="text-sm font-medium">{item.name}{item.sku ? <span className="text-muted-foreground font-normal"> [{item.sku}]</span> : ""}</span>
                              <span className="text-xs text-muted-foreground">
                                Stock: {parseFloat(item.currentStock || "0").toLocaleString("es-AR")} {item.unit}
                                {parseFloat(item.costPrice || "0") > 0
                                  ? ` — Costo: $${parseFloat(item.costPrice).toLocaleString("es-AR", { minimumFractionDigits: 2 })}/${item.unit}`
                                  : " — Sin precio cargado"}
                              </span>
                            </button>
                          ));
                        })()}
                      </div>
                    </div>
                  )}
                </div>
                {newIngredientInventoryId
                  ? <p className="text-xs text-green-600">✓ Vinculado — el stock se descontará al cerrar la orden</p>
                  : <p className="text-xs text-muted-foreground">Seleccioná un artículo para vincular el stock automáticamente</p>
                }
              </div>

              {/* Cantidad + Unidad (auto) + Precio unit. (auto) */}
              {newIngredientName && (
                <div className="flex items-end gap-2">
                  <div className="flex-1 space-y-1">
                    <Label className="text-xs">Cantidad *</Label>
                    <Input
                      type="number"
                      placeholder="Ej: 2"
                      step="0.001"
                      value={newIngredientQty}
                      onChange={(e) => setNewIngredientQty(e.target.value)}
                      data-testid="input-ingredient-qty"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Unidad</Label>
                    <div className="h-9 px-3 flex items-center border rounded-md bg-muted/40 text-sm font-medium min-w-14 justify-center">
                      {newIngredientUnit}
                    </div>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Costo unit.</Label>
                    <div className="h-9 px-3 flex items-center border rounded-md bg-muted/40 text-sm min-w-28">
                      {parseFloat(newIngredientCost || "0") > 0
                        ? `$${parseFloat(newIngredientCost).toLocaleString("es-AR", { minimumFractionDigits: 2 })}`
                        : <span className="text-muted-foreground text-xs italic">sin precio</span>
                      }
                    </div>
                  </div>
                </div>
              )}
              <Button
                size="sm"
                onClick={() => {
                  if (!currentRecipe || !newIngredientName || !newIngredientQty) return;
                  addIngredientMutation.mutate({
                    recipeId: currentRecipe.id,
                    ingredientName: newIngredientName,
                    quantity: newIngredientQty,
                    unit: newIngredientUnit,
                    unitCost: newIngredientCost || "0",
                    inventoryItemId: newIngredientInventoryId || null,
                  });
                }}
                disabled={addIngredientMutation.isPending || !newIngredientName || !newIngredientQty}
                data-testid="button-add-ingredient"
              >
                {addIngredientMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                <Plus className="h-4 w-4 mr-1" />
                Agregar Ingrediente
              </Button>
            </div>
          </div>
          <DialogFooter className="shrink-0 pt-2 border-t">
            <Button onClick={() => setIsRecipeDialogOpen(false)}>Cerrar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
