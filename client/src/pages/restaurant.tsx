import { useState, useCallback, useRef } from "react";
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
} from "lucide-react";

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

const receiptTypeLabels: Record<string, string> = {
  ticket: "Ticket",
  factura_a: "Factura A",
  factura_b: "Factura B",
  factura_c: "Factura C",
  nota_credito: "Nota de Credito",
  voucher: "Voucher (No Fiscal)",
};

const paymentMethodLabels: Record<string, string> = {
  efectivo: "Efectivo",
  tarjeta_debito: "Tarjeta Debito",
  tarjeta_credito: "Tarjeta Credito",
  transferencia: "Transferencia",
  cuenta_habitacion: "Cuenta Habitacion",
  mercadopago: "MercadoPago",
};

const menuItemFormSchema = z.object({
  name: z.string().min(1, "El nombre es requerido"),
  categoryId: z.string().min(1, "La categoria es requerida"),
  description: z.string().optional(),
  price: z.coerce.number().min(0, "El precio debe ser positivo"),
  preparationTime: z.coerce.number().min(0).optional(),
  isAvailable: z.string().default("true"),
});

type MenuItemFormValues = z.infer<typeof menuItemFormSchema>;

const categoryFormSchema = z.object({
  name: z.string().min(1, "El nombre es requerido"),
  description: z.string().optional(),
  displayOrder: z.coerce.number().default(0),
});

type CategoryFormValues = z.infer<typeof categoryFormSchema>;

export default function RestaurantPage() {
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState("floor");
  const [selectedArea, setSelectedArea] = useState<string>("all");
  const [selectedTable, setSelectedTable] = useState<RestaurantTable | null>(null);
  const [isNewOrderDialogOpen, setIsNewOrderDialogOpen] = useState(false);
  const [isOrderDialogOpen, setIsOrderDialogOpen] = useState(false);
  const [currentOrder, setCurrentOrder] = useState<RestaurantOrder | null>(null);
  const [newCovers, setNewCovers] = useState(2);
  const [orderView, setOrderView] = useState<"folio" | "menu" | "delete" | "comanda">("menu");
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
  const [reservationSortBy, setReservationSortBy] = useState<"name" | "time">("name");
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
  const [isTimeSlotsDialogOpen, setIsTimeSlotsDialogOpen] = useState(false);
  const [newTimeSlot, setNewTimeSlot] = useState("");
  const [isRecipeDialogOpen, setIsRecipeDialogOpen] = useState(false);
  const [selectedRecipeItem, setSelectedRecipeItem] = useState<MenuItem | null>(null);
  const [newIngredientName, setNewIngredientName] = useState("");
  const [newIngredientQty, setNewIngredientQty] = useState("");
  const [newIngredientUnit, setNewIngredientUnit] = useState("g");
  const [newIngredientCost, setNewIngredientCost] = useState("");
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
  const [isSplitMode, setIsSplitMode] = useState(false);
  const [splitParts, setSplitParts] = useState(2);
  const [splitReceiptType, setSplitReceiptType] = useState("ticket");
  const [splitPayMethod, setSplitPayMethod] = useState("efectivo");
  const [splitPayMethods, setSplitPayMethods] = useState<Record<string, string>>({});
  const [splitReceiptTypes, setSplitReceiptTypes] = useState<Record<string, string>>({});

  const courseLabels: Record<number, string> = { 1: "Entradas", 2: "Platos Principales", 3: "Postres" };

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

  const todayReservations = reservations.filter(r =>
    r.reservationDate === new Date().toISOString().split("T")[0] &&
    r.status !== "cancelled" && r.status !== "completed"
  );

  const sortedCategories = [...menuCategories].sort((a, b) => (a.displayOrder ?? 0) - (b.displayOrder ?? 0));

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
    mutationFn: async (data: { orderId: string; menuItemId: string; quantity: number; notes?: string; course?: number }) => {
      const res = await apiRequest("POST", `/api/restaurant/orders/${data.orderId}/items`, {
        menuItemId: data.menuItemId,
        quantity: data.quantity,
        notes: data.notes,
        course: data.course || 1,
      });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/restaurant/orders"] });
      setPendingItem(null);
      setItemNotes("");
      setItemQuantity(1);
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
    mutationFn: async (data: { orderId: string; splitId: string; method: string; receiptType: string }) => {
      const res = await apiRequest("PATCH", `/api/restaurant/orders/${data.orderId}/split/${data.splitId}`, {
        method: data.method,
        receiptType: data.receiptType,
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
    mutationFn: async (data: { orderId: string; receiptType: string; paymentMethod: string; discount?: number; discountType?: string; roomReservationId?: string }) => {
      const res = await apiRequest("POST", `/api/restaurant/orders/${data.orderId}/close`, {
        chargeToRoom: data.paymentMethod === "cuenta_habitacion",
        receiptType: data.receiptType,
        paymentMethod: data.paymentMethod,
        discount: data.discount,
        discountType: data.discountType,
        roomReservationId: data.roomReservationId,
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
    mutationFn: async (data: { recipeId: string; ingredientName: string; quantity: string; unit: string; unitCost: string }) => {
      const res = await apiRequest("POST", `/api/restaurant/recipes/${data.recipeId}/ingredients`, data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/restaurant/recipes"] });
      setNewIngredientName("");
      setNewIngredientQty("");
      setNewIngredientUnit("g");
      setNewIngredientCost("");
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
      addItemMutation.mutate({
        orderId: currentOrder.id,
        menuItemId: pendingItem.id,
        quantity: itemQuantity,
        notes: itemNotes || undefined,
        course: itemCourse,
      });
    }
  };

  const handleCancelItem = () => {
    setPendingItem(null);
    setItemNotes("");
    setItemQuantity(1);
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

  const filteredReservations = reservations
    .filter(r => r.reservationDate === reservationDate)
    .filter(r => {
      if (!reservationSearch) return true;
      return r.guestName.toLowerCase().includes(reservationSearch.toLowerCase());
    })
    .sort((a, b) => {
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
              <Button
                variant={isEditMode ? "default" : "outline"}
                size="sm"
                onClick={() => setIsEditMode(!isEditMode)}
                data-testid="button-edit-layout"
              >
                {isEditMode ? <Check className="h-4 w-4 mr-2" /> : <Settings className="h-4 w-4 mr-2" />}
                {isEditMode ? "Guardar Layout" : "Editar Layout"}
              </Button>
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
                          {area.name}
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
                            return (
                              <button
                                key={table.id}
                                draggable={isEditMode}
                                onDragStart={() => handleDragStart(table)}
                                onDragOver={handleDragOver}
                                onDrop={() => handleDrop(x, y, area.id)}
                                onClick={() => handleTableClick(table)}
                                className={`p-2 border-2 transition-all flex flex-col items-center justify-center gap-0.5 relative ${
                                  tableStatusColors[table.status]
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
                                  return tableOrder?.waiterName ? (
                                    <span className="text-[9px] truncate max-w-full opacity-80">{tableOrder.waiterName}</span>
                                  ) : null;
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
              <Input
                type="date"
                value={reservationDate}
                onChange={(e) => setReservationDate(e.target.value)}
                className="w-40"
                data-testid="input-reservation-date-filter"
              />
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
                    {menuItems.map((item) => {
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
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          )}
        </TabsContent>
      </Tabs>

      {/* ==================== DIALOGS ==================== */}

      {/* New Order Dialog (table-based) */}
      <Dialog open={isNewOrderDialogOpen} onOpenChange={setIsNewOrderDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Nuevo Pedido - Mesa {selectedTable?.tableNumber}</DialogTitle>
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
      <Dialog open={isDirectOrderDialogOpen} onOpenChange={setIsDirectOrderDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Nueva Orden - {areas.find(a => a.id === directOrderAreaId)?.name}</DialogTitle>
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
                <p className="text-xs text-muted-foreground mt-1">
                  Mozo: {getUpdatedOrder()?.waiterName || "—"} | Abierto: {currentOrder ? new Date(currentOrder.openedAt).toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit" }) : ""} | {getUpdatedOrder()?.covers} comensales
                  {(getUpdatedOrder()?.activeCourse || 1) > 1 && ` | Curso: ${courseLabels[getUpdatedOrder()?.activeCourse || 1] || `Curso ${getUpdatedOrder()?.activeCourse}`}`}
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
                    {advanceCourseMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowUpDown className="h-4 w-4 mr-1" />}
                    Sig. Curso
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
              </div>
            </div>
          </DialogHeader>

          {orderView === "folio" && (
            <div className="flex-1 overflow-y-auto space-y-4">
              <h3 className="font-semibold text-lg">Resumen de Consumos</h3>
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
                          <div key={item.id} className={`flex items-center justify-between p-3 border rounded-md mb-1 ${item.status === "waiting_course" ? "opacity-50 border-dashed" : ""}`}>
                            <div className="flex items-center gap-2">
                              <span className="font-medium">{item.menuItem?.name || "Item"}</span>
                              <span className="text-muted-foreground">x{item.quantity}</span>
                              {item.notes && <span className="text-xs text-muted-foreground italic">({item.notes})</span>}
                              {item.status === "waiting_course" && <Badge variant="outline" className="text-[10px]">Esperando</Badge>}
                            </div>
                            <div className="flex items-center gap-2">
                              <span className="font-semibold">
                                ${parseFloat(item.subtotal).toLocaleString("es-AR", { minimumFractionDigits: 2 })}
                              </span>
                              <Button
                                size="icon"
                                variant="ghost"
                                className="h-6 w-6 text-destructive hover:text-destructive"
                                onClick={() => { if (currentOrder) deleteItemMutation.mutate({ orderId: currentOrder.id, itemId: item.id }); }}
                                data-testid={`button-void-item-${item.id}`}
                              >
                                <X className="h-3 w-3" />
                              </Button>
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
                              <span className="font-medium text-sm">{item.menuItem?.name || "Item"}</span>
                              <Badge variant="outline" className="text-xs">x{item.quantity}</Badge>
                              {item.notes && <span className="text-xs text-muted-foreground italic">({item.notes})</span>}
                            </div>
                            <div className="flex items-center gap-2">
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
              <div className="flex gap-2">
                <Button variant="outline" onClick={() => setOrderView("menu")} className="flex-1" data-testid="button-comanda-add-more">
                  <Plus className="h-4 w-4 mr-1" /> Agregar Items
                </Button>
                <Button variant="destructive" onClick={() => { setIsCloseDialogOpen(true); setIsOrderDialogOpen(false); }} className="flex-1" data-testid="button-comanda-close">
                  <Receipt className="h-4 w-4 mr-1" /> Cerrar Cuenta
                </Button>
              </div>
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
                {sortedCategories.map((cat) => (
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
              <div className="space-y-2">
                <Label>Curso</Label>
                <div className="flex gap-2">
                  {(() => {
                    const cat = menuCategories.find(c => c.id === pendingItem.categoryId);
                    const beverageCategories = ["bebidas sin alcohol", "cervezas", "vinos", "espumantes", "vinos de ríos", "bebidas"];
                    const isBeverage = cat && beverageCategories.some(bc => cat.name.toLowerCase().includes(bc));
                    if (isBeverage) return <span className="text-sm text-muted-foreground">Bebida — sin curso</span>;
                    return [1, 2, 3].map(c => (
                      <Button
                        key={c}
                        variant={itemCourse === c ? "default" : "outline"}
                        size="sm"
                        onClick={() => setItemCourse(c)}
                        data-testid={`button-course-${c}`}
                      >
                        {courseLabels[c]}
                      </Button>
                    ));
                  })()}
                </div>
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
                setCloseReceiptType("ticket");
                setClosePaymentMethod("efectivo");
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

      {/* Close Order Dialog with Receipt Type, Payment Method, and Split */}
      <Dialog open={isCloseDialogOpen} onOpenChange={(open) => { setIsCloseDialogOpen(open); if (!open) setIsSplitMode(false); }}>
        <DialogContent className="max-w-lg">
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
                        <Select value={effectiveReceiptType} onValueChange={setCloseReceiptType}>
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
                      </div>
                      <div className="space-y-2">
                        <Label>Forma de Pago</Label>
                        <Select value={effectivePaymentMethod} onValueChange={setClosePaymentMethod}>
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

                {closePaymentMethod === "cuenta_habitacion" && (
                  <div className="space-y-2">
                    <Label>Habitación</Label>
                    <Select value={closeRoomId} onValueChange={setCloseRoomId}>
                      <SelectTrigger data-testid="select-room-charge"><SelectValue placeholder="Seleccionar habitación" /></SelectTrigger>
                      <SelectContent>
                        {inHouseRooms.map(r => (
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
                            <span className="font-bold">${parseFloat(split.amount).toLocaleString("es-AR", { minimumFractionDigits: 2 })}</span>
                          </div>
                          {split.isPaid === "true" ? (
                            <Badge variant="default" className="bg-green-600">Pagado - {paymentMethodLabels[split.method || ""] || split.method}</Badge>
                          ) : (
                            <div className="flex gap-2 items-end">
                              <div className="flex-1 space-y-1">
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
                              <div className="flex-1 space-y-1">
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
                                    paySplitMutation.mutate({
                                      orderId: currentOrder.id,
                                      splitId: split.id,
                                      method: splitPayMethods[split.id] || "efectivo",
                                      receiptType: splitReceiptTypes[split.id] || "ticket",
                                    });
                                  }
                                }}
                                disabled={paySplitMutation.isPending}
                                data-testid={`button-pay-split-${split.splitNumber}`}
                              >
                                Cobrar
                              </Button>
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
                        receiptType: closeReceiptType,
                        paymentMethod: closePaymentMethod,
                        discount: disc > 0 ? disc : undefined,
                        discountType: disc > 0 ? closeDiscountType : undefined,
                        roomReservationId: closePaymentMethod === "cuenta_habitacion" && closeRoomId ? closeRoomId : undefined,
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
                              {table?.hasWindow === "true" && " (Ventana)"}
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
                      <FormLabel>Precio *</FormLabel>
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
              <FormField
                control={menuItemForm.control}
                name="isAvailable"
                render={({ field }) => (
                  <FormItem className="flex items-center gap-3 p-3 border rounded-md">
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
        <DialogContent className="max-w-2xl">
          <DialogHeader>
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
          <div className="space-y-4">
            {currentRecipe && currentRecipe.ingredients.length > 0 && (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Ingrediente</TableHead>
                    <TableHead className="text-right">Cantidad</TableHead>
                    <TableHead>Unidad</TableHead>
                    <TableHead className="text-right">Costo Unit.</TableHead>
                    <TableHead className="text-right">Subtotal</TableHead>
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

            <div className="border-t pt-4">
              <Label className="mb-2 block">Agregar Ingrediente</Label>
              <div className="grid grid-cols-5 gap-2">
                <Input
                  placeholder="Nombre"
                  value={newIngredientName}
                  onChange={(e) => setNewIngredientName(e.target.value)}
                  className="col-span-2"
                  data-testid="input-ingredient-name"
                />
                <Input
                  type="number"
                  placeholder="Cant."
                  step="0.001"
                  value={newIngredientQty}
                  onChange={(e) => setNewIngredientQty(e.target.value)}
                  data-testid="input-ingredient-qty"
                />
                <Select value={newIngredientUnit} onValueChange={setNewIngredientUnit}>
                  <SelectTrigger data-testid="select-ingredient-unit">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="g">g</SelectItem>
                    <SelectItem value="kg">kg</SelectItem>
                    <SelectItem value="ml">ml</SelectItem>
                    <SelectItem value="l">l</SelectItem>
                    <SelectItem value="unidad">unidad</SelectItem>
                    <SelectItem value="porcion">porcion</SelectItem>
                  </SelectContent>
                </Select>
                <Input
                  type="number"
                  placeholder="$/u"
                  step="0.01"
                  value={newIngredientCost}
                  onChange={(e) => setNewIngredientCost(e.target.value)}
                  data-testid="input-ingredient-cost"
                />
              </div>
              <Button
                size="sm"
                className="mt-2"
                onClick={() => {
                  if (!currentRecipe || !newIngredientName || !newIngredientQty) return;
                  addIngredientMutation.mutate({
                    recipeId: currentRecipe.id,
                    ingredientName: newIngredientName,
                    quantity: newIngredientQty,
                    unit: newIngredientUnit,
                    unitCost: newIngredientCost || "0",
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
          <DialogFooter>
            <Button onClick={() => setIsRecipeDialogOpen(false)}>Cerrar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
