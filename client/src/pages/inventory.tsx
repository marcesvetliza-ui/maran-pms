import { useState } from "react";
import { Link } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useForm } from "react-hook-form";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { useToast } from "@/hooks/use-toast";
import { 
  Plus, 
  Package, 
  AlertTriangle, 
  Building2,
  Loader2,
  Search,
  TrendingDown,
  TrendingUp,
  History,
  BarChart3,
  Printer,
  Tag,
  Pencil,
  Trash2,
  FileText,
  Warehouse,
  ArrowLeftRight,
  DollarSign,
  ChevronDown,
  ChevronUp,
  RefreshCw,
  ClipboardList,
  ChevronLeft,
  CheckCircle2,
  XCircle,
  Save,
  ArrowDownToLine,
  BookOpen,
  Utensils,
  X,
} from "lucide-react";

type ItemCategory = {
  id: string;
  name: string;
  description: string | null;
  parentId: string | null;
  area: string;
  isActive: string | null;
};

type Supplier = {
  id: string;
  name: string;
  contactName: string | null;
  phone: string | null;
  email: string | null;
  address: string | null;
  cuit: string | null;
  paymentTermDays: number | null;
  notes: string | null;
  isActive: string | null;
};

type InventoryItem = {
  id: string;
  sku: string | null;
  name: string;
  description: string | null;
  categoryId: string | null;
  supplierId: string | null;
  unit: "unidad" | "kg" | "g" | "litro" | "ml" | "caja" | "paquete" | "docena";
  costPrice: string;
  minStock: number;
  maxStock: number | null;
  currentStock: number;
  location: string | null;
  isActive: string | null;
  itemKind?: "materia_prima" | "venta_directa" | "plato" | null;
  category?: ItemCategory;
  supplier?: Supplier;
};

type StockMovement = {
  id: string;
  itemId: string;
  movementType: "entrada" | "salida" | "ajuste" | "transferencia" | "consumo";
  quantity: number;
  previousStock: number;
  newStock: number;
  unitCost: string | null;
  reference: string | null;
  notes: string | null;
  createdAt: string;
  createdBy: string | null;
  item?: InventoryItem;
};

type InventoryWarehouse = {
  id: string;
  name: string;
  description: string | null;
  area: string;
  is_active: string | null;
  created_at: string;
};

type WarehouseStockRow = {
  id: string;
  warehouse_id: string;
  item_id: string;
  current_stock: string;
  updated_at: string;
  item_name: string;
  sku: string | null;
  unit: string;
  cost_price: string;
  min_stock: string;
  category_name: string | null;
};

type WarehouseSummary = {
  warehouse_id: string;
  warehouse_name: string;
  area: string;
  item_count: string;
  total_value: string;
  low_stock_count: string;
  zero_stock_count: string;
};

type PriceHistory = {
  id: string;
  item_id: string;
  price: string;
  recorded_at: string;
  source: string;
  notes: string | null;
};

type InternalMovementItem = {
  id: string;
  movement_id: string;
  item_id: string;
  item_name: string;
  unit: string;
  quantity: string;
  cost_price: string;
  notes: string | null;
};

type InternalMovement = {
  id: string;
  date: string;
  motivo: string;
  descripcion: string | null;
  notes: string | null;
  created_by: string | null;
  created_at: string;
  item_count?: number;
  total_cost?: string;
  items?: InternalMovementItem[];
};

type RecipeForIM = {
  id: string;
  name: string | null;
  menuItemId: string | null;
  isBase: boolean | null;
  menuItem?: { name: string } | null;
};

const motivoLabels: Record<string, string> = {
  desayuno: "Desayuno",
  evento: "Evento",
  desperdicio: "Desperdicio",
  otro: "Otro",
};

const motivoColors: Record<string, string> = {
  desayuno: "bg-amber-100 text-amber-800",
  evento: "bg-blue-100 text-blue-800",
  desperdicio: "bg-red-100 text-red-800",
  otro: "bg-gray-100 text-gray-700",
};

const unitLabels: Record<string, string> = {
  unidad: "Unidades",
  kg: "Kilogramos",
  g: "Gramos",
  litro: "Litros",
  ml: "Mililitros",
  caja: "Cajas",
  paquete: "Paquetes",
  docena: "Docenas",
};

const movementTypeLabels: Record<string, string> = {
  entrada: "Entrada",
  salida: "Salida",
  ajuste: "Ajuste",
  transferencia: "Transferencia",
  consumo: "Consumo",
};

export default function InventoryPage() {
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState("items");
  const [searchQuery, setSearchQuery] = useState("");
  const today = new Date().toISOString().split("T")[0];
  const [consumoFrom, setConsumoFrom] = useState(today);
  const [consumoTo, setConsumoTo] = useState(today);
  const [isNewItemDialogOpen, setIsNewItemDialogOpen] = useState(false);
  const [areaFilter, setAreaFilter] = useState("all");

  // Toma de Inventario state
  const [selectedCountId, setSelectedCountId] = useState<string | null>(null);
  const [isNewCountDialogOpen, setIsNewCountDialogOpen] = useState(false);
  const [newCountDate, setNewCountDate] = useState(today);
  const [newCountArea, setNewCountArea] = useState("");
  const [newCountNotes, setNewCountNotes] = useState("");
  const [countItemEdits, setCountItemEdits] = useState<Record<string, string>>({});
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [kindFilter, setKindFilter] = useState("all");
  const [isCategoryDialogOpen, setIsCategoryDialogOpen] = useState(false);
  const [editingCategory, setEditingCategory] = useState<ItemCategory | null>(null);
  const [catName, setCatName] = useState("");
  const [catArea, setCatArea] = useState("general");
  const [catDescription, setCatDescription] = useState("");

  // Warehouses state
  const [selectedWarehouseId, setSelectedWarehouseId] = useState<string | null>(null);
  const [isTransferDialogOpen, setIsTransferDialogOpen] = useState(false);
  const [selectedWarehouseItem, setSelectedWarehouseItem] = useState<WarehouseStockRow | null>(null);
  const [isPriceHistoryOpen, setIsPriceHistoryOpen] = useState(false);
  const [priceHistoryItemId, setPriceHistoryItemId] = useState<string | null>(null);
  const [priceHistoryItemName, setPriceHistoryItemName] = useState<string>("");
  const [isWarehouseFormOpen, setIsWarehouseFormOpen] = useState(false);
  const [editingWarehouse, setEditingWarehouse] = useState<InventoryWarehouse | null>(null);
  const [whName, setWhName] = useState("");
  const [whDescription, setWhDescription] = useState("");
  const [whArea, setWhArea] = useState("general");

  // Movimiento Interno state
  const [isInternalMovOpen, setIsInternalMovOpen] = useState(false);
  const [imDate, setImDate] = useState(today);
  const [imMotivo, setImMotivo] = useState("desayuno");
  const [imDescripcion, setImDescripcion] = useState("");
  const [imNotes, setImNotes] = useState("");
  const [imItems, setImItems] = useState<Array<{ itemId: string; quantity: string; notes: string }>>([]);
  const [showRecipeLoader, setShowRecipeLoader] = useState(false);
  const [imRecipeId, setImRecipeId] = useState("");
  const [imPorciones, setImPorciones] = useState("1");
  const [imRecipeLoading, setImRecipeLoading] = useState(false);
  const [internosFrom, setInternosFrom] = useState(today);
  const [internosTo, setInternosTo] = useState(today);
  const [expandedMovId, setExpandedMovId] = useState<string | null>(null);

  // Filters for movements tab
  const [movFrom, setMovFrom] = useState("");
  const [movTo, setMovTo] = useState("");
  const [movTypeFilter, setMovTypeFilter] = useState("all");
  const [movItemSearch, setMovItemSearch] = useState("");

  const { data: categories = [] } = useQuery<ItemCategory[]>({
    queryKey: ["/api/inventory/categories"],
  });

  const { data: suppliers = [] } = useQuery<Supplier[]>({
    queryKey: ["/api/inventory/suppliers"],
  });

  const { data: items = [], isLoading: itemsLoading } = useQuery<InventoryItem[]>({
    queryKey: ["/api/inventory/items"],
  });

  const { data: lowStockItems = [] } = useQuery<InventoryItem[]>({
    queryKey: ["/api/inventory/items/low-stock"],
  });

  const { data: movements = [] } = useQuery<StockMovement[]>({
    queryKey: ["/api/inventory/movements"],
  });

  const { data: consumoReport, isLoading: consumoLoading } = useQuery<{
    from: string; to: string;
    items: Array<{ id: string; item_name: string; unit: string; cost_price: string; total_consumed: string; total_cost: string; orders_count: string }>;
    totalCosto: number;
  }>({
    queryKey: ["/api/inventory/consumo-report", consumoFrom, consumoTo],
    queryFn: () => fetch(`/api/inventory/consumo-report?from=${consumoFrom}&to=${consumoTo}`, { credentials: "include" }).then(r => r.json()),
    enabled: activeTab === "consumos",
  });

  const { data: warehouses = [], refetch: refetchWarehouses } = useQuery<InventoryWarehouse[]>({
    queryKey: ["/api/inventory/warehouses"],
  });

  const { data: warehousesSummary = [] } = useQuery<WarehouseSummary[]>({
    queryKey: ["/api/inventory/warehouses-summary"],
    enabled: activeTab === "depositos",
  });

  const { data: warehouseStock = [], isLoading: warehouseStockLoading } = useQuery<WarehouseStockRow[]>({
    queryKey: ["/api/inventory/warehouses", selectedWarehouseId, "stock"],
    queryFn: () => fetch(`/api/inventory/warehouses/${selectedWarehouseId}/stock`, { credentials: "include" }).then(r => r.json()),
    enabled: !!selectedWarehouseId,
  });

  const { data: priceHistory = [] } = useQuery<PriceHistory[]>({
    queryKey: ["/api/inventory/items", priceHistoryItemId, "price-history"],
    queryFn: () => fetch(`/api/inventory/items/${priceHistoryItemId}/price-history`, { credentials: "include" }).then(r => r.json()),
    enabled: !!priceHistoryItemId && isPriceHistoryOpen,
  });

  // Recipes (para carga desde receta en Movimiento Interno)
  const { data: allRecipes = [] } = useQuery<RecipeForIM[]>({
    queryKey: ["/api/restaurant/recipes"],
    enabled: isInternalMovOpen,
  });

  // Movimientos Internos
  const { data: internalMovements = [], isLoading: internosLoading } = useQuery<InternalMovement[]>({
    queryKey: ["/api/inventory/internal-movements", internosFrom, internosTo],
    queryFn: () => fetch(`/api/inventory/internal-movements?from=${internosFrom}&to=${internosTo}`, { credentials: "include" }).then(r => r.json()),
    enabled: activeTab === "internos",
  });

  const { data: internosReport, isLoading: internosReportLoading } = useQuery<{
    from: string; to: string;
    items: Array<{ item_id: string; item_name: string; unit: string; cost_price: string; total_quantity: string; total_cost: string; movement_count: string }>;
    totalCost: number;
  }>({
    queryKey: ["/api/inventory/internal-movements/report", internosFrom, internosTo],
    queryFn: () => fetch(`/api/inventory/internal-movements/report?from=${internosFrom}&to=${internosTo}`, { credentials: "include" }).then(r => r.json()),
    enabled: activeTab === "internos",
  });

  // Toma de Inventario queries
  const { data: inventoryCounts = [], refetch: refetchCounts } = useQuery<any[]>({
    queryKey: ["/api/inventory/counts"],
    enabled: activeTab === "tomas",
  });

  const { data: selectedCount, refetch: refetchSelectedCount } = useQuery<any>({
    queryKey: ["/api/inventory/counts", selectedCountId],
    queryFn: () => fetch(`/api/inventory/counts/${selectedCountId}`, { credentials: "include" }).then(r => r.json()),
    enabled: !!selectedCountId,
  });

  const createCountMutation = useMutation({
    mutationFn: async (data: { date: string; area?: string; notes?: string }) => {
      const res = await apiRequest("POST", "/api/inventory/counts", data);
      return res.json();
    },
    onSuccess: (count) => {
      queryClient.invalidateQueries({ queryKey: ["/api/inventory/counts"] });
      setIsNewCountDialogOpen(false);
      setNewCountArea(""); setNewCountNotes("");
      setSelectedCountId(count.id);
      setCountItemEdits({});
    },
    onError: (e: any) => toast({ title: "Error al crear la toma", description: e?.message, variant: "destructive" }),
  });

  const saveCountItemsMutation = useMutation({
    mutationFn: async (edits: Record<string, string>) => {
      const entries = Object.entries(edits);
      for (const [itemId, val] of entries) {
        await apiRequest("PATCH", `/api/inventory/counts/${selectedCountId}/items/${itemId}`, {
          actualStock: val === "" ? null : parseFloat(val),
        });
      }
    },
    onSuccess: () => {
      refetchSelectedCount();
      setCountItemEdits({});
      toast({ title: "Conteos guardados" });
    },
    onError: (e: any) => toast({ title: "Error al guardar", description: e?.message, variant: "destructive" }),
  });

  const closeCountMutation = useMutation({
    mutationFn: async () => {
      // Save any pending edits first
      const entries = Object.entries(countItemEdits);
      for (const [itemId, val] of entries) {
        await apiRequest("PATCH", `/api/inventory/counts/${selectedCountId}/items/${itemId}`, {
          actualStock: val === "" ? null : parseFloat(val),
        });
      }
      const res = await apiRequest("POST", `/api/inventory/counts/${selectedCountId}/close`, {});
      return res.json();
    },
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ["/api/inventory/items"] });
      queryClient.invalidateQueries({ queryKey: ["/api/inventory/counts"] });
      queryClient.invalidateQueries({ queryKey: ["/api/inventory/counts", selectedCountId] });
      setCountItemEdits({});
      toast({
        title: "Toma cerrada",
        description: `Se aplicaron ${result.adjustments} ajuste${result.adjustments !== 1 ? "s" : ""} de stock.`,
      });
    },
    onError: (e: any) => toast({ title: "Error al cerrar", description: e?.message, variant: "destructive" }),
  });

  const createItemMutation = useMutation({
    mutationFn: async (data: Partial<InventoryItem> & { warehouseId?: string }) => {
      const res = await apiRequest("POST", "/api/inventory/items", data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/inventory/items"] });
      setIsNewItemDialogOpen(false);
      toast({ title: "Articulo creado" });
    },
    onError: (error: any) => {
      toast({ title: "Error", description: error?.message || "No se pudo crear el artículo", variant: "destructive" });
    },
  });

  const saveWarehouseMutation = useMutation({
    mutationFn: async (data: { name: string; description: string; area: string }) => {
      const res = editingWarehouse
        ? await apiRequest("PATCH", `/api/inventory/warehouses/${editingWarehouse.id}`, data)
        : await apiRequest("POST", "/api/inventory/warehouses", data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/inventory/warehouses"] });
      queryClient.invalidateQueries({ queryKey: ["/api/inventory/warehouses-summary"] });
      setIsWarehouseFormOpen(false);
      setEditingWarehouse(null);
      toast({ title: editingWarehouse ? "Depósito actualizado" : "Depósito creado" });
    },
    onError: () => toast({ title: "Error al guardar depósito", variant: "destructive" }),
  });

  const deleteWarehouseMutation = useMutation({
    mutationFn: async (id: string) => {
      await apiRequest("DELETE", `/api/inventory/warehouses/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/inventory/warehouses"] });
      queryClient.invalidateQueries({ queryKey: ["/api/inventory/warehouses-summary"] });
      if (selectedWarehouseId) setSelectedWarehouseId(null);
      toast({ title: "Depósito eliminado" });
    },
    onError: () => toast({ title: "No se pudo eliminar el depósito", variant: "destructive" }),
  });

  const transferMutation = useMutation({
    mutationFn: async (data: { itemId: string; fromWarehouseId: string; toWarehouseId: string; quantity: number; notes?: string }) => {
      const res = await apiRequest("POST", "/api/inventory/transfer", data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/inventory/warehouses"] });
      queryClient.invalidateQueries({ queryKey: ["/api/inventory/warehouses-summary"] });
      if (selectedWarehouseId) {
        queryClient.invalidateQueries({ queryKey: ["/api/inventory/warehouses", selectedWarehouseId, "stock"] });
      }
      queryClient.invalidateQueries({ queryKey: ["/api/inventory/items"] });
      setIsTransferDialogOpen(false);
      toast({ title: "Transferencia registrada correctamente" });
    },
    onError: (e: any) => toast({ title: "Error en transferencia", description: e?.message, variant: "destructive" }),
  });

  // ---- Movimiento Interno helpers ----
  const resetInternalMov = () => {
    setImDate(today);
    setImMotivo("desayuno");
    setImDescripcion("");
    setImNotes("");
    setImItems([]);
    setShowRecipeLoader(false);
    setImRecipeId("");
    setImPorciones("1");
  };

  const addImItem = () => setImItems(prev => [...prev, { itemId: "", quantity: "1", notes: "" }]);
  const removeImItem = (idx: number) => setImItems(prev => prev.filter((_, i) => i !== idx));
  const updateImItem = (idx: number, field: "itemId" | "quantity" | "notes", value: string) =>
    setImItems(prev => prev.map((it, i) => i === idx ? { ...it, [field]: value } : it));

  const loadFromRecipe = async () => {
    if (!imRecipeId) return;
    setImRecipeLoading(true);
    try {
      const ingredients = await fetch(`/api/restaurant/recipes/${imRecipeId}/ingredients`, { credentials: "include" }).then(r => r.json());
      const porciones = parseFloat(imPorciones) || 1;
      const newRows: Array<{ itemId: string; quantity: string; notes: string }> = [];
      for (const ing of ingredients) {
        if (!ing.inventoryItemId) continue;
        const merma = parseFloat(ing.merma || "0");
        const baseQty = parseFloat(ing.quantity || "0");
        const grossQty = merma > 0 ? baseQty / (1 - merma / 100) : baseQty;
        const totalQty = (grossQty * porciones).toFixed(3);
        // merge with existing row if same item
        const existing = newRows.find(r => r.itemId === ing.inventoryItemId);
        if (existing) {
          existing.quantity = (parseFloat(existing.quantity) + parseFloat(totalQty)).toFixed(3);
        } else {
          newRows.push({ itemId: ing.inventoryItemId, quantity: totalQty, notes: "" });
        }
      }
      // merge into imItems (append, dedup)
      setImItems(prev => {
        const merged = [...prev];
        for (const row of newRows) {
          const ex = merged.find(r => r.itemId === row.itemId);
          if (ex) {
            ex.quantity = (parseFloat(ex.quantity) + parseFloat(row.quantity)).toFixed(3);
          } else {
            merged.push(row);
          }
        }
        return merged;
      });
      setShowRecipeLoader(false);
      setImRecipeId("");
      setImPorciones("1");
      toast({ title: `${newRows.length} ingrediente(s) cargados desde la receta` });
    } catch {
      toast({ title: "Error al cargar receta", variant: "destructive" });
    } finally {
      setImRecipeLoading(false);
    }
  };

  const printInternalVoucher = (movement: InternalMovement & { items: InternalMovementItem[] }) => {
    const motLabel = motivoLabels[movement.motivo] || movement.motivo;
    const totalCost = (movement.items || []).reduce((s, i) =>
      s + parseFloat(i.quantity) * parseFloat(i.cost_price), 0);
    const html = `<!DOCTYPE html><html><head><title>Movimiento Interno — ${motLabel}</title>
<style>
  body{font-family:Arial,sans-serif;padding:24px;max-width:700px;margin:0 auto;font-size:13px}
  h1{font-size:18px;margin:0 0 4px}
  .meta{color:#555;margin-bottom:16px;font-size:12px}
  table{width:100%;border-collapse:collapse;margin:12px 0}
  th,td{border:1px solid #ccc;padding:7px 10px;text-align:left}
  th{background:#f0f0f0;font-weight:600}
  td.num{text-align:right}
  .total{font-weight:bold;background:#e8e8e8}
  .footer{margin-top:24px;font-size:11px;color:#888;border-top:1px solid #ccc;padding-top:10px}
</style>
</head><body>
<h1>Comprobante de Movimiento Interno</h1>
<div class="meta">
  Fecha: ${new Date(movement.date + "T12:00:00").toLocaleDateString("es-AR")} &nbsp;|&nbsp;
  Motivo: <strong>${motLabel}</strong> &nbsp;|&nbsp;
  ${movement.descripcion ? `Descripción: <strong>${movement.descripcion}</strong>` : ""}
  ${movement.notes ? `<br>Observaciones: ${movement.notes}` : ""}
</div>
<table>
  <thead><tr><th>Artículo</th><th>Unidad</th><th class="num">Cantidad</th><th class="num">Costo Unit.</th><th class="num">Costo Total</th></tr></thead>
  <tbody>
${(movement.items || []).map(i => `    <tr>
      <td>${i.item_name}</td>
      <td>${i.unit}</td>
      <td class="num">${parseFloat(i.quantity).toLocaleString("es-AR", { minimumFractionDigits: 3 })}</td>
      <td class="num">$${parseFloat(i.cost_price).toLocaleString("es-AR", { minimumFractionDigits: 2 })}</td>
      <td class="num">$${(parseFloat(i.quantity) * parseFloat(i.cost_price)).toLocaleString("es-AR", { minimumFractionDigits: 2 })}</td>
    </tr>`).join("\n")}
    <tr class="total">
      <td colspan="4" style="text-align:right">COSTO TOTAL</td>
      <td class="num">$${totalCost.toLocaleString("es-AR", { minimumFractionDigits: 2 })}</td>
    </tr>
  </tbody>
</table>
<div class="footer">Generado: ${new Date().toLocaleString("es-AR")} &nbsp;|&nbsp; ${movement.created_by || "sistema"} &nbsp;|&nbsp; ID: ${movement.id}</div>
<script>window.onload=function(){window.print()}<\/script>
</body></html>`;
    const w = window.open("", "_blank");
    if (w) { w.document.write(html); w.document.close(); }
  };

  const createInternalMovMutation = useMutation({
    mutationFn: async (data: { date: string; motivo: string; descripcion?: string; notes?: string; items: Array<{ itemId: string; quantity: number; notes?: string }> }) => {
      const res = await apiRequest("POST", "/api/inventory/internal-movements", data);
      return res.json();
    },
    onSuccess: (movement) => {
      queryClient.invalidateQueries({ queryKey: ["/api/inventory/items"] });
      queryClient.invalidateQueries({ queryKey: ["/api/inventory/movements"] });
      queryClient.invalidateQueries({ queryKey: ["/api/inventory/internal-movements"] });
      setIsInternalMovOpen(false);
      resetInternalMov();
      printInternalVoucher(movement);
      toast({ title: "Movimiento registrado", description: `${movement.items?.length || 0} artículo(s) descontados del stock.` });
    },
    onError: (e: any) => toast({ title: "Error al registrar", description: e?.message, variant: "destructive" }),
  });

  const openInternalMov = () => {
    resetInternalMov();
    setIsInternalMovOpen(true);
  };

  const confirmInternalMov = () => {
    const validItems = imItems.filter(it => it.itemId && parseFloat(it.quantity) > 0);
    if (validItems.length === 0) {
      toast({ title: "Agregá al menos un artículo con cantidad", variant: "destructive" });
      return;
    }
    createInternalMovMutation.mutate({
      date: imDate,
      motivo: imMotivo,
      descripcion: imDescripcion || undefined,
      notes: imNotes || undefined,
      items: validItems.map(it => ({ itemId: it.itemId, quantity: parseFloat(it.quantity), notes: it.notes || undefined })),
    });
  };

  const openCategoryDialog = (cat?: ItemCategory) => {
    setEditingCategory(cat || null);
    setCatName(cat?.name || "");
    setCatArea(cat?.area || "general");
    setCatDescription(cat?.description || "");
    setIsCategoryDialogOpen(true);
  };

  const openWarehouseForm = (wh?: InventoryWarehouse) => {
    setEditingWarehouse(wh || null);
    setWhName(wh?.name || "");
    setWhDescription(wh?.description || "");
    setWhArea(wh?.area || "general");
    setIsWarehouseFormOpen(true);
  };

  const saveCategoryMutation = useMutation({
    mutationFn: async (data: { name: string; area: string; description: string }) => {
      const res = editingCategory
        ? await apiRequest("PATCH", `/api/inventory/categories/${editingCategory.id}`, data)
        : await apiRequest("POST", "/api/inventory/categories", data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/inventory/categories"] });
      setIsCategoryDialogOpen(false);
      toast({ title: editingCategory ? "Categoría actualizada" : "Categoría creada" });
    },
    onError: () => toast({ title: "Error al guardar categoría", variant: "destructive" }),
  });

  const deleteCategoryMutation = useMutation({
    mutationFn: async (id: string) => {
      await apiRequest("DELETE", `/api/inventory/categories/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/inventory/categories"] });
      toast({ title: "Categoría eliminada" });
    },
    onError: () => toast({ title: "No se puede eliminar — tiene artículos asociados", variant: "destructive" }),
  });

  const filteredItems = items
    .filter((item) => {
      const matchesSearch = item.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        item.sku?.toLowerCase().includes(searchQuery.toLowerCase());
      const matchesArea = areaFilter === "all" || (item.category as any)?.area === areaFilter;
      const matchesCategory = categoryFilter === "all" || String((item.category as any)?.id || item.categoryId || "") === categoryFilter;
      const matchesKind = kindFilter === "all" || (item as any).itemKind === kindFilter;
      return matchesSearch && matchesArea && matchesCategory && matchesKind;
    })
    .sort((a, b) => a.name.localeCompare(b.name, "es"));

  const totalValue = items.reduce(
    (sum, item) => sum + (item.currentStock * parseFloat(item.costPrice || "0")),
    0
  );

  if (itemsLoading) {
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
          <h1 className="text-2xl font-bold" data-testid="text-page-title">Inventario</h1>
          <p className="text-muted-foreground">Gestiona stock, proveedores y movimientos</p>
        </div>
        <div className="flex gap-2">
          <Link href="/purchase-invoices">
            <Button variant="outline" data-testid="button-goto-purchase-invoices">
              <FileText className="h-4 w-4 mr-2" />
              Factura de Compra
            </Button>
          </Link>
          <Button variant="outline" onClick={openInternalMov} data-testid="button-internal-movement">
            <ArrowDownToLine className="h-4 w-4 mr-2" />
            Movimiento Interno
          </Button>
          <Button onClick={() => setIsNewItemDialogOpen(true)} data-testid="button-add-item">
            <Plus className="h-4 w-4 mr-2" />
            Nuevo Artículo
          </Button>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-4 pb-2">
            <CardTitle className="text-sm font-medium">Total Articulos</CardTitle>
            <Package className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{items.length}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-4 pb-2">
            <CardTitle className="text-sm font-medium">Stock Bajo</CardTitle>
            <AlertTriangle className="h-4 w-4 text-yellow-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-yellow-600">{lowStockItems.length}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-4 pb-2">
            <CardTitle className="text-sm font-medium">Proveedores</CardTitle>
            <Building2 className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{suppliers.length}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-4 pb-2">
            <CardTitle className="text-sm font-medium">Valor Total</CardTitle>
            <Package className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              ${totalValue.toLocaleString("es-AR", { minimumFractionDigits: 2 })}
            </div>
          </CardContent>
        </Card>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="items" data-testid="tab-items">
            <Package className="h-4 w-4 mr-2" />
            Articulos
          </TabsTrigger>
          <TabsTrigger value="low-stock" data-testid="tab-low-stock">
            <AlertTriangle className="h-4 w-4 mr-2" />
            Stock Bajo
          </TabsTrigger>
          <TabsTrigger value="movements" data-testid="tab-movements">
            <History className="h-4 w-4 mr-2" />
            Movimientos
          </TabsTrigger>
          <TabsTrigger value="suppliers" data-testid="tab-suppliers">
            <Building2 className="h-4 w-4 mr-2" />
            Proveedores
          </TabsTrigger>
          <TabsTrigger value="categorias" data-testid="tab-categorias">
            <Tag className="h-4 w-4 mr-2" />
            Categorías
          </TabsTrigger>
          <TabsTrigger value="consumos" data-testid="tab-consumos">
            <BarChart3 className="h-4 w-4 mr-2" />
            Consumos
          </TabsTrigger>
          <TabsTrigger value="depositos" data-testid="tab-depositos">
            <Warehouse className="h-4 w-4 mr-2" />
            Depósitos
          </TabsTrigger>
          <TabsTrigger value="tomas" data-testid="tab-tomas">
            <ClipboardList className="h-4 w-4 mr-2" />
            Toma de Inventario
          </TabsTrigger>
          <TabsTrigger value="internos" data-testid="tab-internos">
            <ArrowDownToLine className="h-4 w-4 mr-2" />
            Mov. Internos
          </TabsTrigger>
        </TabsList>

        <TabsContent value="items" className="space-y-4">
          <div className="flex items-center gap-3 flex-wrap">
            <div className="relative flex-1 min-w-[200px] max-w-sm">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Buscar artículos..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10"
                data-testid="input-search"
              />
            </div>
            <Select value={categoryFilter} onValueChange={setCategoryFilter}>
              <SelectTrigger className="w-[200px]" data-testid="select-category-filter">
                <SelectValue placeholder="Todas las categorías" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas las categorías</SelectItem>
                {[...categories]
                  .filter(cat => cat.id)
                  .sort((a, b) => a.name.localeCompare(b.name, "es"))
                  .map((cat) => (
                    <SelectItem key={cat.id} value={String(cat.id)}>
                      {cat.name}
                    </SelectItem>
                  ))}
              </SelectContent>
            </Select>
            <Select value={areaFilter} onValueChange={setAreaFilter}>
              <SelectTrigger className="w-[160px]" data-testid="select-area-filter">
                <SelectValue placeholder="Todas las áreas" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas las áreas</SelectItem>
                <SelectItem value="general">General</SelectItem>
                <SelectItem value="spa">SPA</SelectItem>
                <SelectItem value="restaurant">Restaurante</SelectItem>
                <SelectItem value="housekeeping">Housekeeping</SelectItem>
                <SelectItem value="maintenance">Mantenimiento</SelectItem>
                <SelectItem value="admin">Administración</SelectItem>
                <SelectItem value="marketing">Marketing</SelectItem>
              </SelectContent>
            </Select>
            <Select value={kindFilter} onValueChange={setKindFilter}>
              <SelectTrigger className="w-[160px]" data-testid="select-kind-filter">
                <SelectValue placeholder="Todos los tipos" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos los tipos</SelectItem>
                <SelectItem value="materia_prima">Materia Prima</SelectItem>
                <SelectItem value="venta_directa">Venta Directa</SelectItem>
                <SelectItem value="plato">Plato</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {filteredItems.length === 0 ? (
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-12 text-center">
                <Package className="h-12 w-12 text-muted-foreground mb-4" />
                <h3 className="text-lg font-semibold mb-2">Sin articulos</h3>
                <p className="text-muted-foreground mb-4">Agrega articulos al inventario</p>
                <Button onClick={() => setIsNewItemDialogOpen(true)}>
                  <Plus className="h-4 w-4 mr-2" />
                  Agregar Articulo
                </Button>
              </CardContent>
            </Card>
          ) : (
            <div className="border rounded-md overflow-hidden">
              <table className="w-full">
                <thead className="bg-muted/50">
                  <tr className="text-left">
                    <th className="p-3 font-medium">Articulo</th>
                    <th className="p-3 font-medium">Categoria</th>
                    <th className="p-3 font-medium text-right">Stock</th>
                    <th className="p-3 font-medium text-right">Min</th>
                    <th className="p-3 font-medium text-right">Costo</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredItems.map((item) => (
                    <tr key={item.id} className="border-t" data-testid={`row-item-${item.id}`}>
                      <td className="p-3">
                        <div className="font-medium">{item.name}</div>
                        {item.sku && (
                          <div className="text-xs text-muted-foreground">SKU: {item.sku}</div>
                        )}
                      </td>
                      <td className="p-3">
                        <div>{item.category?.name || "-"}</div>
                        <div className="flex flex-wrap gap-1 mt-0.5">
                          {item.category?.area && item.category.area !== "general" && (
                            <Badge variant="secondary" className="text-[10px]">{(item.category as any).area.toUpperCase()}</Badge>
                          )}
                          {(item as any).itemKind && (
                            <Badge
                              variant="outline"
                              className="text-[10px]"
                              data-testid={`badge-kind-${item.id}`}
                            >
                              {(item as any).itemKind === "materia_prima" ? "Materia Prima" : (item as any).itemKind === "plato" ? "Plato" : "Venta Directa"}
                            </Badge>
                          )}
                          {(item as any).isActive === "false" && (
                            <Badge variant="destructive" className="text-[10px]">Inactivo</Badge>
                          )}
                        </div>
                      </td>
                      <td className="p-3 text-right">
                        <span className={item.currentStock < item.minStock ? "text-red-600 font-semibold" : ""}>
                          {item.currentStock}
                        </span>
                        <span className="text-muted-foreground text-xs ml-1">{item.unit}</span>
                      </td>
                      <td className="p-3 text-right text-muted-foreground">
                        {item.minStock}
                      </td>
                      <td className="p-3 text-right">
                        ${parseFloat(item.costPrice).toLocaleString("es-AR", { minimumFractionDigits: 2 })}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </TabsContent>

        <TabsContent value="low-stock" className="space-y-4">
          {lowStockItems.length === 0 ? (
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-12 text-center">
                <TrendingUp className="h-12 w-12 text-green-500 mb-4" />
                <h3 className="text-lg font-semibold mb-2">Stock OK</h3>
                <p className="text-muted-foreground">Todos los articulos tienen stock suficiente</p>
              </CardContent>
            </Card>
          ) : (
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {lowStockItems.map((item) => (
                <Card key={item.id} className="border-yellow-500/50" data-testid={`low-stock-${item.id}`}>
                  <CardHeader className="pb-2">
                    <div className="flex items-start justify-between gap-2">
                      <CardTitle className="text-base">{item.name}</CardTitle>
                      <Badge variant="destructive">
                        <TrendingDown className="h-3 w-3 mr-1" />
                        Bajo
                      </Badge>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Stock actual:</span>
                      <span className="font-semibold text-red-600">{item.currentStock} {item.unit}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Stock minimo:</span>
                      <span>{item.minStock} {item.unit}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Faltante:</span>
                      <span className="font-semibold">{item.minStock - item.currentStock} {item.unit}</span>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="movements" className="space-y-4">
          {/* Filters */}
          <Card>
            <CardContent className="pt-4 pb-3">
              <div className="flex flex-wrap items-end gap-3">
                <div className="flex items-center gap-1">
                  <Label className="text-sm whitespace-nowrap">Desde:</Label>
                  <Input type="date" value={movFrom} onChange={e => setMovFrom(e.target.value)} className="w-36 h-8 text-sm" />
                </div>
                <div className="flex items-center gap-1">
                  <Label className="text-sm whitespace-nowrap">Hasta:</Label>
                  <Input type="date" value={movTo} onChange={e => setMovTo(e.target.value)} className="w-36 h-8 text-sm" />
                </div>
                <div className="flex items-center gap-1">
                  <Label className="text-sm whitespace-nowrap">Tipo:</Label>
                  <Select value={movTypeFilter} onValueChange={setMovTypeFilter}>
                    <SelectTrigger className="w-36 h-8 text-sm"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Todos</SelectItem>
                      <SelectItem value="entrada">Entrada</SelectItem>
                      <SelectItem value="salida">Salida</SelectItem>
                      <SelectItem value="consumo">Consumo</SelectItem>
                      <SelectItem value="ajuste">Ajuste</SelectItem>
                      <SelectItem value="transferencia">Transferencia</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex items-center gap-1 flex-1 min-w-40">
                  <Label className="text-sm whitespace-nowrap">Artículo:</Label>
                  <Input
                    value={movItemSearch}
                    onChange={e => setMovItemSearch(e.target.value)}
                    placeholder="Buscar artículo..."
                    className="h-8 text-sm"
                  />
                </div>
                {(movFrom || movTo || movTypeFilter !== "all" || movItemSearch) && (
                  <Button variant="ghost" size="sm" className="h-8 text-xs" onClick={() => { setMovFrom(""); setMovTo(""); setMovTypeFilter("all"); setMovItemSearch(""); }}>
                    <X className="h-3 w-3 mr-1" />Limpiar
                  </Button>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Table */}
          {(() => {
            const filtered = movements.filter(m => {
              if (movTypeFilter !== "all" && m.movementType !== movTypeFilter) return false;
              if (movItemSearch && !(m.item?.name || "").toLowerCase().includes(movItemSearch.toLowerCase())) return false;
              if (movFrom) {
                const d = new Date(m.createdAt);
                const from = new Date(movFrom + "T00:00:00");
                if (d < from) return false;
              }
              if (movTo) {
                const d = new Date(m.createdAt);
                const to = new Date(movTo + "T23:59:59");
                if (d > to) return false;
              }
              return true;
            });

            if (filtered.length === 0) {
              return (
                <Card>
                  <CardContent className="flex flex-col items-center justify-center py-12 text-center">
                    <History className="h-12 w-12 text-muted-foreground mb-4" />
                    <h3 className="text-lg font-semibold mb-2">{movements.length === 0 ? "Sin movimientos" : "Sin resultados"}</h3>
                    <p className="text-muted-foreground">{movements.length === 0 ? "Los movimientos de stock aparecerán aquí" : "Probá cambiando los filtros"}</p>
                  </CardContent>
                </Card>
              );
            }

            return (
              <div className="border rounded-md overflow-hidden">
                <div className="flex items-center justify-between px-3 py-2 bg-muted/30 text-xs text-muted-foreground border-b">
                  <span>{filtered.length} movimiento{filtered.length !== 1 ? "s" : ""}{filtered.length < movements.length ? ` de ${movements.length}` : ""}</span>
                </div>
                <table className="w-full">
                  <thead className="bg-muted/50">
                    <tr className="text-left">
                      <th className="p-3 font-medium">Fecha</th>
                      <th className="p-3 font-medium">Artículo</th>
                      <th className="p-3 font-medium">Tipo</th>
                      <th className="p-3 font-medium text-right">Cantidad</th>
                      <th className="p-3 font-medium text-right">Stock Ant.</th>
                      <th className="p-3 font-medium text-right">Stock Nuevo</th>
                      <th className="p-3 font-medium">Notas</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.slice(0, 200).map((movement) => (
                      <tr key={movement.id} className="border-t" data-testid={`movement-${movement.id}`}>
                        <td className="p-3 text-sm">
                          {new Date(movement.createdAt).toLocaleString("es-AR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}
                        </td>
                        <td className="p-3 font-medium text-sm">{movement.item?.name || "N/A"}</td>
                        <td className="p-3">
                          <Badge variant={movement.movementType === "entrada" ? "default" : "secondary"}>
                            {movementTypeLabels[movement.movementType]}
                          </Badge>
                        </td>
                        <td className="p-3 text-right font-mono text-sm">
                          <span className={movement.movementType === "entrada" ? "text-green-600" : "text-orange-600"}>
                            {movement.movementType === "entrada" ? "+" : "-"}{movement.quantity}
                          </span>
                        </td>
                        <td className="p-3 text-right font-mono text-sm text-muted-foreground">{movement.previousStock}</td>
                        <td className="p-3 text-right font-mono text-sm">{movement.newStock}</td>
                        <td className="p-3 text-sm text-muted-foreground truncate max-w-48">{movement.notes || "-"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {filtered.length > 200 && (
                  <div className="px-3 py-2 text-center text-xs text-muted-foreground border-t">
                    Mostrando 200 de {filtered.length}. Usá los filtros para acotar.
                  </div>
                )}
              </div>
            );
          })()}
        </TabsContent>

        <TabsContent value="suppliers" className="space-y-4">
          <div className="flex items-center justify-end">
            <Button data-testid="button-add-supplier">
              <Plus className="h-4 w-4 mr-2" />
              Nuevo Proveedor
            </Button>
          </div>
          {suppliers.length === 0 ? (
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-12 text-center">
                <Building2 className="h-12 w-12 text-muted-foreground mb-4" />
                <h3 className="text-lg font-semibold mb-2">Sin proveedores</h3>
                <p className="text-muted-foreground mb-4">Agrega proveedores para gestionar compras</p>
              </CardContent>
            </Card>
          ) : (
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {suppliers.map((supplier) => (
                <Card key={supplier.id} data-testid={`supplier-${supplier.id}`}>
                  <CardHeader>
                    <CardTitle className="text-base">{supplier.name}</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-2 text-sm">
                    {supplier.contactName && (
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Contacto:</span>
                        <span>{supplier.contactName}</span>
                      </div>
                    )}
                    {supplier.phone && (
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Telefono:</span>
                        <span>{supplier.phone}</span>
                      </div>
                    )}
                    {supplier.email && (
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Email:</span>
                        <span className="truncate ml-2">{supplier.email}</span>
                      </div>
                    )}
                    {supplier.cuit && (
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">CUIT:</span>
                        <span>{supplier.cuit}</span>
                      </div>
                    )}
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="categorias" className="space-y-4">
          <div className="flex items-center justify-between">
            <p className="text-sm text-muted-foreground">
              Las categorías determinan el prefijo del SKU automático y el área de cada artículo.
            </p>
            <Button onClick={() => openCategoryDialog()} data-testid="btn-new-category">
              <Plus className="h-4 w-4 mr-2" />
              Nueva Categoría
            </Button>
          </div>

          {categories.length === 0 ? (
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-12 text-center">
                <Tag className="h-12 w-12 text-muted-foreground mb-4" />
                <h3 className="text-lg font-semibold mb-2">Sin categorías</h3>
                <p className="text-muted-foreground">Creá categorías para organizar tu inventario</p>
              </CardContent>
            </Card>
          ) : (
            <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
              {categories.map((cat) => {
                const areaLabels: Record<string, string> = {
                  general: "General", spa: "SPA", restaurant: "Restaurante",
                  housekeeping: "Housekeeping", maintenance: "Mantenimiento", admin: "Administración",
                  marketing: "Marketing",
                };
                const areaColors: Record<string, string> = {
                  general: "secondary", spa: "default", restaurant: "destructive",
                  housekeeping: "outline", maintenance: "outline", admin: "outline",
                  marketing: "outline",
                };
                const itemCount = items.filter(i => i.categoryId === cat.id).length;
                return (
                  <Card key={cat.id} data-testid={`cat-card-${cat.id}`} className="flex flex-col">
                    <CardHeader className="pb-2">
                      <div className="flex items-start justify-between gap-2">
                        <CardTitle className="text-base">{cat.name}</CardTitle>
                        <div className="flex gap-1 shrink-0">
                          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openCategoryDialog(cat)} data-testid={`btn-edit-cat-${cat.id}`}>
                            <Pencil className="h-3 w-3" />
                          </Button>
                          <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive hover:text-destructive" onClick={() => deleteCategoryMutation.mutate(cat.id)} disabled={itemCount > 0} data-testid={`btn-delete-cat-${cat.id}`}>
                            <Trash2 className="h-3 w-3" />
                          </Button>
                        </div>
                      </div>
                    </CardHeader>
                    <CardContent className="text-sm space-y-1 flex-1">
                      <div className="flex items-center gap-2">
                        <Badge variant={areaColors[cat.area] as any}>{areaLabels[cat.area] ?? cat.area}</Badge>
                        <span className="text-muted-foreground text-xs">SKU: {cat.area === "spa" ? "SPA" : cat.area === "restaurant" ? "RST" : cat.area === "housekeeping" ? "HSK" : cat.area === "maintenance" ? "MNT" : cat.area === "admin" ? "ADM" : "GEN"}-####</span>
                      </div>
                      {cat.description && <p className="text-muted-foreground text-xs">{cat.description}</p>}
                      <p className="text-xs text-muted-foreground">{itemCount} artículo{itemCount !== 1 ? "s" : ""}</p>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </TabsContent>

        <TabsContent value="consumos" className="space-y-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base flex items-center gap-2">
                <BarChart3 className="h-4 w-4" />
                Reporte de Consumos — Restaurante
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center gap-4 mb-4">
                <div className="flex items-center gap-2">
                  <Label className="text-sm">Desde:</Label>
                  <Input type="date" value={consumoFrom} onChange={e => setConsumoFrom(e.target.value)} className="w-40" data-testid="input-consumo-from" />
                </div>
                <div className="flex items-center gap-2">
                  <Label className="text-sm">Hasta:</Label>
                  <Input type="date" value={consumoTo} onChange={e => setConsumoTo(e.target.value)} className="w-40" data-testid="input-consumo-to" />
                </div>
                {consumoReport && (
                  <Button variant="outline" size="sm" onClick={() => {
                    const html = `<!DOCTYPE html><html><head><title>Consumos ${consumoFrom} a ${consumoTo}</title>
<style>body{font-family:Arial,sans-serif;padding:20px;max-width:700px;margin:0 auto}table{width:100%;border-collapse:collapse;margin:16px 0}th,td{border:1px solid #ccc;padding:8px;text-align:left}th{background:#f5f5f5}.total{font-weight:bold;background:#eee}</style>
</head><body><h1>Reporte de Consumos</h1><p>Período: ${consumoFrom} al ${consumoTo}</p>
<table><thead><tr><th>Artículo</th><th>Unidad</th><th>Cant. Consumida</th><th>Órdenes</th><th>Costo Unit.</th><th>Costo Total</th></tr></thead><tbody>
${(consumoReport.items || []).map(r => `<tr><td>${r.item_name}</td><td>${r.unit}</td><td>${parseFloat(r.total_consumed).toLocaleString("es-AR",{minimumFractionDigits:3})}</td><td>${r.orders_count}</td><td>$${parseFloat(r.cost_price||"0").toLocaleString("es-AR",{minimumFractionDigits:2})}</td><td>$${parseFloat(r.total_cost||"0").toLocaleString("es-AR",{minimumFractionDigits:2})}</td></tr>`).join("")}
<tr class="total"><td colspan="5">COSTO TOTAL DEL PERÍODO</td><td>$${consumoReport.totalCosto.toLocaleString("es-AR",{minimumFractionDigits:2})}</td></tr>
</tbody></table><script>window.onload=function(){window.print();}<\/script></body></html>`;
                    const w = window.open("", "_blank"); if (w) { w.document.write(html); w.document.close(); }
                  }} data-testid="btn-print-consumo">
                    <Printer className="h-4 w-4 mr-2" />Imprimir
                  </Button>
                )}
              </div>

              {consumoLoading ? (
                <div className="space-y-2">{[...Array(5)].map((_,i) => <Skeleton key={i} className="h-10" />)}</div>
              ) : consumoReport && consumoReport.items.length > 0 ? (
                <>
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-sm text-muted-foreground">{consumoReport.items.length} artículos consumidos</p>
                    <p className="font-semibold">Costo total: ${consumoReport.totalCosto.toLocaleString("es-AR", { minimumFractionDigits: 2 })}</p>
                  </div>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Artículo</TableHead>
                        <TableHead>Unidad</TableHead>
                        <TableHead className="text-right">Cant. Consumida</TableHead>
                        <TableHead className="text-center">Órdenes</TableHead>
                        <TableHead className="text-right">Costo Unit.</TableHead>
                        <TableHead className="text-right">Costo Total</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {consumoReport.items.map((row, i) => (
                        <TableRow key={i} data-testid={`row-consumo-${i}`}>
                          <TableCell className="font-medium">{row.item_name}</TableCell>
                          <TableCell>{row.unit}</TableCell>
                          <TableCell className="text-right">{parseFloat(row.total_consumed).toLocaleString("es-AR", { minimumFractionDigits: 3 })}</TableCell>
                          <TableCell className="text-center">{row.orders_count}</TableCell>
                          <TableCell className="text-right">${parseFloat(row.cost_price || "0").toLocaleString("es-AR", { minimumFractionDigits: 2 })}</TableCell>
                          <TableCell className="text-right font-semibold">${parseFloat(row.total_cost || "0").toLocaleString("es-AR", { minimumFractionDigits: 2 })}</TableCell>
                        </TableRow>
                      ))}
                      <TableRow className="font-bold border-t-2">
                        <TableCell colSpan={5} className="text-right">COSTO TOTAL DEL PERÍODO</TableCell>
                        <TableCell className="text-right">${consumoReport.totalCosto.toLocaleString("es-AR", { minimumFractionDigits: 2 })}</TableCell>
                      </TableRow>
                    </TableBody>
                  </Table>
                </>
              ) : (
                <p className="text-center text-muted-foreground py-8" data-testid="text-consumo-empty">
                  No hay consumos registrados para el período seleccionado.
                </p>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ==================== DEPÓSITOS TAB ==================== */}
        <TabsContent value="depositos" className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-base font-semibold flex items-center gap-2">
              <Warehouse className="h-4 w-4" />
              Gestión de Depósitos
            </h3>
            <div className="flex gap-2">
              <Button size="sm" variant="outline" onClick={() => setIsTransferDialogOpen(true)} data-testid="btn-transfer">
                <ArrowLeftRight className="h-4 w-4 mr-2" />
                Transferir
              </Button>
              <Button size="sm" onClick={() => openWarehouseForm()} data-testid="btn-new-warehouse">
                <Plus className="h-4 w-4 mr-2" />
                Nuevo Depósito
              </Button>
            </div>
          </div>

          {/* Summary cards per warehouse */}
          <div className="grid gap-4 md:grid-cols-3">
            {warehousesSummary.map((ws) => {
              const areaColors: Record<string, string> = { general: "bg-blue-50 border-blue-200 dark:bg-blue-950/30", restaurant: "bg-orange-50 border-orange-200 dark:bg-orange-950/30", spa: "bg-purple-50 border-purple-200 dark:bg-purple-950/30" };
              const isSelected = selectedWarehouseId === ws.warehouse_id;
              return (
                <Card
                  key={ws.warehouse_id}
                  data-testid={`card-warehouse-${ws.warehouse_id}`}
                  className={`cursor-pointer border-2 transition-all ${isSelected ? "border-primary ring-2 ring-primary/20" : (areaColors[ws.area] || "border-border")} hover:shadow-md`}
                  onClick={() => setSelectedWarehouseId(isSelected ? null : ws.warehouse_id)}
                >
                  <CardHeader className="pb-2">
                    <div className="flex items-start justify-between">
                      <CardTitle className="text-base">{ws.warehouse_name}</CardTitle>
                      <div className="flex gap-1">
                        <Button variant="ghost" size="icon" className="h-6 w-6" onClick={(e) => { e.stopPropagation(); const wh = warehouses.find(w => w.id === ws.warehouse_id); if (wh) openWarehouseForm(wh); }} data-testid={`btn-edit-wh-${ws.warehouse_id}`}>
                          <Pencil className="h-3 w-3" />
                        </Button>
                        <Button variant="ghost" size="icon" className="h-6 w-6 text-destructive" onClick={(e) => { e.stopPropagation(); if (confirm(`¿Desactivar el depósito "${ws.warehouse_name}"?`)) deleteWarehouseMutation.mutate(ws.warehouse_id); }} data-testid={`btn-del-wh-${ws.warehouse_id}`}>
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      </div>
                    </div>
                    <Badge variant="outline" className="w-fit text-xs">{ws.area === "restaurant" ? "Restaurante" : ws.area === "spa" ? "SPA" : "General"}</Badge>
                  </CardHeader>
                  <CardContent className="space-y-2">
                    <div className="grid grid-cols-3 gap-2 text-center">
                      <div>
                        <div className="text-xl font-bold">{ws.item_count}</div>
                        <div className="text-xs text-muted-foreground">Artículos</div>
                      </div>
                      <div>
                        <div className="text-xl font-bold text-yellow-600">{ws.low_stock_count}</div>
                        <div className="text-xs text-muted-foreground">Stock bajo</div>
                      </div>
                      <div>
                        <div className="text-xl font-bold text-red-600">{ws.zero_stock_count}</div>
                        <div className="text-xs text-muted-foreground">Sin stock</div>
                      </div>
                    </div>
                    <div className="text-sm text-center text-muted-foreground border-t pt-2">
                      Valor: <span className="font-semibold text-foreground">${parseFloat(ws.total_value || "0").toLocaleString("es-AR", { minimumFractionDigits: 2 })}</span>
                    </div>
                    <div className="text-xs text-center text-primary font-medium">
                      {isSelected ? "▲ Ver menos" : "▼ Ver stock de este depósito"}
                    </div>
                  </CardContent>
                </Card>
              );
            })}
            {warehouses.length === 0 && (
              <div className="col-span-3 text-center py-12 text-muted-foreground">
                <Warehouse className="h-10 w-10 mx-auto mb-3 opacity-40" />
                <p>No hay depósitos creados todavía.</p>
              </div>
            )}
          </div>

          {/* Stock detail of selected warehouse */}
          {selectedWarehouseId && (
            <Card data-testid="card-warehouse-stock">
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-base flex items-center gap-2">
                    <Package className="h-4 w-4" />
                    Stock — {warehouses.find(w => w.id === selectedWarehouseId)?.name}
                  </CardTitle>
  
                </div>
              </CardHeader>
              <CardContent>
                {warehouseStockLoading ? (
                  <div className="space-y-2">{[...Array(4)].map((_,i) => <Skeleton key={i} className="h-10" />)}</div>
                ) : warehouseStock.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground">
                    <Package className="h-8 w-8 mx-auto mb-2 opacity-40" />
                    <p>No hay artículos en este depósito todavía.</p>
                    <p className="text-xs mt-1">Registrá una entrada o transferí desde otro depósito.</p>
                  </div>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Artículo</TableHead>
                        <TableHead>Categoría</TableHead>
                        <TableHead>SKU</TableHead>
                        <TableHead className="text-right">Stock</TableHead>
                        <TableHead>Unidad</TableHead>
                        <TableHead className="text-right">Costo Unit.</TableHead>
                        <TableHead className="text-right">Valor</TableHead>
                        <TableHead></TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {warehouseStock.map((row) => {
                        const stock = parseFloat(row.current_stock);
                        const minStock = parseFloat(row.min_stock || "0");
                        const cost = parseFloat(row.cost_price || "0");
                        const isLow = stock <= minStock && stock > 0;
                        const isZero = stock === 0;
                        return (
                          <TableRow key={row.id} data-testid={`wh-stock-row-${row.item_id}`} className={isZero ? "bg-red-50 dark:bg-red-950/20" : isLow ? "bg-yellow-50 dark:bg-yellow-950/20" : ""}>
                            <TableCell className="font-medium">
                              {row.item_name}
                              {isLow && <AlertTriangle className="h-3 w-3 inline ml-1 text-yellow-500" />}
                              {isZero && <AlertTriangle className="h-3 w-3 inline ml-1 text-red-500" />}
                            </TableCell>
                            <TableCell className="text-sm text-muted-foreground">{row.category_name || "—"}</TableCell>
                            <TableCell className="font-mono text-xs">{row.sku || "—"}</TableCell>
                            <TableCell className={`text-right font-bold ${isZero ? "text-red-600" : isLow ? "text-yellow-600" : ""}`}>
                              {stock.toLocaleString("es-AR", { minimumFractionDigits: 3 })}
                            </TableCell>
                            <TableCell className="text-sm">{row.unit}</TableCell>
                            <TableCell className="text-right">${cost.toLocaleString("es-AR", { minimumFractionDigits: 2 })}</TableCell>
                            <TableCell className="text-right font-semibold">${(stock * cost).toLocaleString("es-AR", { minimumFractionDigits: 2 })}</TableCell>
                            <TableCell>
                              <div className="flex gap-1">
                                <Button variant="ghost" size="icon" className="h-7 w-7" title="Historial de precios" onClick={() => { setPriceHistoryItemId(row.item_id); setPriceHistoryItemName(row.item_name); setIsPriceHistoryOpen(true); }} data-testid={`btn-price-history-${row.item_id}`}>
                                  <DollarSign className="h-3 w-3" />
                                </Button>
                                <Button variant="ghost" size="icon" className="h-7 w-7" title="Transferir" onClick={() => { setSelectedWarehouseItem(row); setIsTransferDialogOpen(true); }} data-testid={`btn-transfer-item-${row.item_id}`}>
                                  <ArrowLeftRight className="h-3 w-3" />
                                </Button>
                              </div>
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* ==================== TOMA DE INVENTARIO TAB ==================== */}
        <TabsContent value="tomas" className="space-y-4">
          {!selectedCountId ? (
            <>
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">
                    Registrá el stock real contado para detectar diferencias con el sistema.
                  </p>
                </div>
                <Button onClick={() => { setNewCountDate(today); setIsNewCountDialogOpen(true); }} data-testid="btn-new-count">
                  <Plus className="h-4 w-4 mr-2" />
                  Nueva Toma
                </Button>
              </div>

              {inventoryCounts.length === 0 ? (
                <Card>
                  <CardContent className="flex flex-col items-center justify-center py-12 text-center">
                    <ClipboardList className="h-12 w-12 text-muted-foreground mb-4" />
                    <h3 className="text-lg font-semibold mb-2">Sin tomas registradas</h3>
                    <p className="text-muted-foreground mb-4">Creá la primera toma de inventario para controlar el stock real</p>
                    <Button onClick={() => { setNewCountDate(today); setIsNewCountDialogOpen(true); }}>
                      <Plus className="h-4 w-4 mr-2" />
                      Nueva Toma
                    </Button>
                  </CardContent>
                </Card>
              ) : (
                <div className="border rounded-md overflow-hidden">
                  <table className="w-full">
                    <thead className="bg-muted/50">
                      <tr className="text-left">
                        <th className="p-3 font-medium">Fecha</th>
                        <th className="p-3 font-medium">Área</th>
                        <th className="p-3 font-medium text-center">Artículos</th>
                        <th className="p-3 font-medium text-center">Contados</th>
                        <th className="p-3 font-medium text-center">Con diferencias</th>
                        <th className="p-3 font-medium text-center">Estado</th>
                        <th className="p-3 font-medium"></th>
                      </tr>
                    </thead>
                    <tbody>
                      {inventoryCounts.map((c: any) => (
                        <tr key={c.id} className="border-t hover:bg-muted/20" data-testid={`row-count-${c.id}`}>
                          <td className="p-3 font-medium">{new Date(c.date + "T12:00:00").toLocaleDateString("es-AR")}</td>
                          <td className="p-3 text-sm text-muted-foreground">{c.area || "Todos"}</td>
                          <td className="p-3 text-center">{c.total_items}</td>
                          <td className="p-3 text-center">{c.counted_items} / {c.total_items}</td>
                          <td className="p-3 text-center">
                            {c.items_with_diff > 0
                              ? <span className="text-orange-600 font-semibold">{c.items_with_diff}</span>
                              : <span className="text-green-600">—</span>}
                          </td>
                          <td className="p-3 text-center">
                            <Badge variant={c.status === "cerrado" ? "secondary" : "default"}>
                              {c.status === "cerrado" ? "Cerrado" : "Borrador"}
                            </Badge>
                          </td>
                          <td className="p-3 text-right">
                            <Button size="sm" variant="outline" onClick={() => { setSelectedCountId(c.id); setCountItemEdits({}); }}>
                              {c.status === "cerrado" ? "Ver" : "Continuar"}
                            </Button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </>
          ) : (
            /* ── Detail view ── */
            <div className="space-y-4">
              <div className="flex items-center justify-between gap-4">
                <Button variant="ghost" size="sm" onClick={() => { setSelectedCountId(null); setCountItemEdits({}); refetchCounts(); }}>
                  <ChevronLeft className="h-4 w-4 mr-1" />
                  Volver
                </Button>
                {selectedCount && (
                  <div className="flex items-center gap-2 flex-1">
                    <h2 className="font-semibold">
                      Toma del {new Date((selectedCount.date || "") + "T12:00:00").toLocaleDateString("es-AR")}
                      {selectedCount.area ? ` — ${selectedCount.area}` : " — Todos los artículos"}
                    </h2>
                    <Badge variant={selectedCount.status === "cerrado" ? "secondary" : "default"}>
                      {selectedCount.status === "cerrado" ? "Cerrado" : "Borrador"}
                    </Badge>
                  </div>
                )}
                {selectedCount?.status === "borrador" && (
                  <div className="flex gap-2">
                    <Button
                      size="sm" variant="outline"
                      onClick={() => saveCountItemsMutation.mutate(countItemEdits)}
                      disabled={saveCountItemsMutation.isPending || Object.keys(countItemEdits).length === 0}
                      data-testid="btn-save-count"
                    >
                      {saveCountItemsMutation.isPending ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Save className="h-4 w-4 mr-1" />}
                      Guardar
                    </Button>
                    <Button
                      size="sm"
                      onClick={() => closeCountMutation.mutate()}
                      disabled={closeCountMutation.isPending}
                      data-testid="btn-close-count"
                    >
                      {closeCountMutation.isPending ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <CheckCircle2 className="h-4 w-4 mr-1" />}
                      Cerrar y aplicar ajustes
                    </Button>
                  </div>
                )}
              </div>

              {selectedCount?.notes && (
                <p className="text-sm text-muted-foreground border rounded-md p-2 bg-muted/20">{selectedCount.notes}</p>
              )}

              {!selectedCount ? (
                <div className="flex justify-center py-12"><Loader2 className="h-8 w-8 animate-spin text-muted-foreground" /></div>
              ) : (
                <div className="border rounded-md overflow-hidden">
                  <table className="w-full">
                    <thead className="bg-muted/50">
                      <tr className="text-left">
                        <th className="p-3 font-medium">Artículo</th>
                        <th className="p-3 font-medium text-center">Unidad</th>
                        <th className="p-3 font-medium text-right">Stock Sistema</th>
                        <th className="p-3 font-medium text-right">Stock Contado</th>
                        <th className="p-3 font-medium text-right">Diferencia</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(selectedCount.items || []).map((item: any) => {
                        const editVal = countItemEdits[item.item_id];
                        const displayVal = editVal !== undefined ? editVal : (item.actual_stock ?? "");
                        const expected = parseFloat(item.expected_stock);
                        const actual = displayVal !== "" ? parseFloat(String(displayVal)) : (item.actual_stock != null ? parseFloat(item.actual_stock) : null);
                        const diff = actual != null ? actual - expected : null;
                        const isDirty = editVal !== undefined;
                        return (
                          <tr key={item.item_id} className={`border-t ${isDirty ? "bg-blue-50 dark:bg-blue-950/20" : ""}`} data-testid={`row-count-item-${item.item_id}`}>
                            <td className="p-3">
                              <div className="font-medium">{item.item_name}</div>
                              {item.sku && <div className="text-xs text-muted-foreground">{item.sku}</div>}
                            </td>
                            <td className="p-3 text-center text-sm text-muted-foreground">{item.unit}</td>
                            <td className="p-3 text-right text-sm">{parseFloat(item.expected_stock).toLocaleString("es-AR", { minimumFractionDigits: 3 })}</td>
                            <td className="p-3 text-right">
                              {selectedCount.status === "cerrado" ? (
                                <span className="text-sm">{item.actual_stock != null ? parseFloat(item.actual_stock).toLocaleString("es-AR", { minimumFractionDigits: 3 }) : <span className="text-muted-foreground">—</span>}</span>
                              ) : (
                                <input
                                  type="number"
                                  step="0.001"
                                  min="0"
                                  value={displayVal}
                                  placeholder={parseFloat(item.expected_stock).toFixed(3)}
                                  onChange={e => setCountItemEdits(prev => ({ ...prev, [item.item_id]: e.target.value }))}
                                  className="w-28 text-right border rounded px-2 py-1 text-sm bg-background focus:outline-none focus:ring-1 focus:ring-primary"
                                  data-testid={`input-count-${item.item_id}`}
                                />
                              )}
                            </td>
                            <td className="p-3 text-right text-sm font-medium">
                              {diff === null ? <span className="text-muted-foreground">—</span>
                                : diff === 0 ? <span className="text-green-600 flex items-center justify-end gap-1"><CheckCircle2 className="h-3 w-3" />0</span>
                                : diff > 0
                                  ? <span className="text-blue-600">+{diff.toLocaleString("es-AR", { minimumFractionDigits: 3 })}</span>
                                  : <span className="text-red-600">{diff.toLocaleString("es-AR", { minimumFractionDigits: 3 })}</span>}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}
        </TabsContent>

        {/* ==================== MOVIMIENTOS INTERNOS TAB ==================== */}
        <TabsContent value="internos" className="space-y-4">
          {/* Header: filtro de fechas + botones */}
          <Card>
            <CardHeader className="pb-3">
              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <ArrowDownToLine className="h-4 w-4" />
                  Movimientos Internos — Descargas de Mercadería
                </CardTitle>
                <div className="flex items-center gap-2 flex-wrap">
                  <div className="flex items-center gap-1">
                    <Label className="text-sm whitespace-nowrap">Desde:</Label>
                    <Input type="date" value={internosFrom} onChange={e => setInternosFrom(e.target.value)} className="w-36 h-8 text-sm" />
                  </div>
                  <div className="flex items-center gap-1">
                    <Label className="text-sm whitespace-nowrap">Hasta:</Label>
                    <Input type="date" value={internosTo} onChange={e => setInternosTo(e.target.value)} className="w-36 h-8 text-sm" />
                  </div>
                  <Button size="sm" onClick={openInternalMov} data-testid="btn-new-internal-mov">
                    <Plus className="h-4 w-4 mr-1" />
                    Nuevo Movimiento
                  </Button>
                </div>
              </div>
            </CardHeader>
          </Card>

          {/* Reporte por ítem */}
          {(internosReportLoading) ? (
            <div className="space-y-2">{[...Array(4)].map((_, i) => <Skeleton key={i} className="h-10" />)}</div>
          ) : internosReport && internosReport.items.length > 0 ? (
            <Card>
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-sm font-medium">Resumen por Artículo</CardTitle>
                  <span className="font-semibold text-sm">Costo total: ${internosReport.totalCost.toLocaleString("es-AR", { minimumFractionDigits: 2 })}</span>
                </div>
              </CardHeader>
              <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Artículo</TableHead>
                      <TableHead className="text-right">Cant. Descargada</TableHead>
                      <TableHead>Unidad</TableHead>
                      <TableHead className="text-right">Costo Unit.</TableHead>
                      <TableHead className="text-right">Costo Total</TableHead>
                      <TableHead className="text-center">Comprobantes</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {internosReport.items.map((row, i) => (
                      <TableRow key={i}>
                        <TableCell className="font-medium">{row.item_name}</TableCell>
                        <TableCell className="text-right">{parseFloat(row.total_quantity).toLocaleString("es-AR", { minimumFractionDigits: 3 })}</TableCell>
                        <TableCell>{row.unit}</TableCell>
                        <TableCell className="text-right">${parseFloat(row.cost_price || "0").toLocaleString("es-AR", { minimumFractionDigits: 2 })}</TableCell>
                        <TableCell className="text-right font-semibold">${parseFloat(row.total_cost || "0").toLocaleString("es-AR", { minimumFractionDigits: 2 })}</TableCell>
                        <TableCell className="text-center text-muted-foreground">{row.movement_count}</TableCell>
                      </TableRow>
                    ))}
                    <TableRow className="font-bold border-t-2">
                      <TableCell colSpan={4} className="text-right">COSTO TOTAL DEL PERÍODO</TableCell>
                      <TableCell className="text-right">${internosReport.totalCost.toLocaleString("es-AR", { minimumFractionDigits: 2 })}</TableCell>
                      <TableCell />
                    </TableRow>
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          ) : null}

          {/* Lista de comprobantes */}
          {internosLoading ? (
            <div className="space-y-2">{[...Array(3)].map((_, i) => <Skeleton key={i} className="h-16" />)}</div>
          ) : internalMovements.length === 0 ? (
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-12 text-center">
                <ArrowDownToLine className="h-12 w-12 text-muted-foreground mb-4" />
                <h3 className="text-lg font-semibold mb-2">Sin movimientos internos</h3>
                <p className="text-muted-foreground mb-4">Registrá descargas de mercadería para desayunos, eventos o desperdicios</p>
                <Button onClick={openInternalMov}><Plus className="h-4 w-4 mr-2" />Nuevo Movimiento</Button>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-2">
              {internalMovements.map(mov => (
                <Card key={mov.id} className="overflow-hidden">
                  <div
                    className="flex items-center justify-between p-4 cursor-pointer hover:bg-muted/30"
                    onClick={() => setExpandedMovId(expandedMovId === mov.id ? null : mov.id)}
                  >
                    <div className="flex items-center gap-3">
                      <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${motivoColors[mov.motivo] || "bg-gray-100 text-gray-700"}`}>
                        {motivoLabels[mov.motivo] || mov.motivo}
                      </span>
                      <div>
                        <p className="font-medium text-sm">{mov.descripcion || "Sin descripción"}</p>
                        <p className="text-xs text-muted-foreground">
                          {new Date(mov.date + "T12:00:00").toLocaleDateString("es-AR")} &nbsp;·&nbsp; {mov.item_count || 0} artículo(s) &nbsp;·&nbsp; ${parseFloat(mov.total_cost || "0").toLocaleString("es-AR", { minimumFractionDigits: 2 })}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Button
                        variant="ghost" size="icon" className="h-7 w-7"
                        onClick={async (e) => {
                          e.stopPropagation();
                          const detail = await fetch(`/api/inventory/internal-movements/${mov.id}`, { credentials: "include" }).then(r => r.json());
                          printInternalVoucher(detail);
                        }}
                        title="Imprimir voucher"
                      >
                        <Printer className="h-4 w-4" />
                      </Button>
                      {expandedMovId === mov.id ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
                    </div>
                  </div>
                  {expandedMovId === mov.id && (
                    <MovimientoInternoDetail movId={mov.id} />
                  )}
                </Card>
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>

      {/* ==================== WAREHOUSE DIALOGS ==================== */}

      {/* New/Edit Warehouse Dialog */}
      <Dialog open={isWarehouseFormOpen} onOpenChange={setIsWarehouseFormOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>{editingWarehouse ? "Editar Depósito" : "Nuevo Depósito"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1">
              <Label>Nombre *</Label>
              <Input value={whName} onChange={e => setWhName(e.target.value)} placeholder="Ej: Depósito General" data-testid="input-wh-name" />
            </div>
            <div className="space-y-1">
              <Label>Área</Label>
              <Select value={whArea} onValueChange={setWhArea}>
                <SelectTrigger data-testid="select-wh-area"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="general">General</SelectItem>
                  <SelectItem value="restaurant">Restaurante</SelectItem>
                  <SelectItem value="spa">SPA</SelectItem>
                  <SelectItem value="housekeeping">Housekeeping</SelectItem>
                  <SelectItem value="maintenance">Mantenimiento</SelectItem>
                  <SelectItem value="admin">Administración</SelectItem>
                  <SelectItem value="marketing">Marketing</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>Descripción (opcional)</Label>
              <Input value={whDescription} onChange={e => setWhDescription(e.target.value)} placeholder="Descripción breve..." data-testid="input-wh-description" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsWarehouseFormOpen(false)}>Cancelar</Button>
            <Button onClick={() => saveWarehouseMutation.mutate({ name: whName.trim(), description: whDescription.trim(), area: whArea })} disabled={saveWarehouseMutation.isPending || !whName.trim()} data-testid="btn-save-warehouse">
              {saveWarehouseMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Guardar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Transfer Dialog */}
      <Dialog open={isTransferDialogOpen} onOpenChange={(open) => { setIsTransferDialogOpen(open); if (!open) setSelectedWarehouseItem(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ArrowLeftRight className="h-5 w-5" />
              Transferir Stock entre Depósitos
            </DialogTitle>
          </DialogHeader>
          <TransferForm
            warehouses={warehouses}
            items={items}
            preselectedItem={selectedWarehouseItem}
            preselectedFromWarehouse={selectedWarehouseId}
            onSubmit={(data) => transferMutation.mutate(data)}
            isPending={transferMutation.isPending}
            onCancel={() => { setIsTransferDialogOpen(false); setSelectedWarehouseItem(null); }}
          />
        </DialogContent>
      </Dialog>

      {/* Nueva Toma de Inventario Dialog */}
      <Dialog open={isNewCountDialogOpen} onOpenChange={setIsNewCountDialogOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ClipboardList className="h-5 w-5" />
              Nueva Toma de Inventario
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1">
              <Label>Fecha *</Label>
              <Input type="date" value={newCountDate} onChange={e => setNewCountDate(e.target.value)} data-testid="input-count-date" />
            </div>
            <div className="space-y-1">
              <Label>Área <span className="text-muted-foreground font-normal">(opcional — filtra artículos)</span></Label>
              <Select value={newCountArea || "__all__"} onValueChange={v => setNewCountArea(v === "__all__" ? "" : v)}>
                <SelectTrigger data-testid="select-count-area"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__all__">Todos los artículos</SelectItem>
                  <SelectItem value="restaurant">Restaurante</SelectItem>
                  <SelectItem value="spa">SPA</SelectItem>
                  <SelectItem value="housekeeping">Housekeeping</SelectItem>
                  <SelectItem value="general">General</SelectItem>
                  <SelectItem value="admin">Administración</SelectItem>
                  <SelectItem value="maintenance">Mantenimiento</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>Observaciones <span className="text-muted-foreground font-normal">(opcional)</span></Label>
              <Input value={newCountNotes} onChange={e => setNewCountNotes(e.target.value)} placeholder="Ej: Toma mensual de cocina" data-testid="input-count-notes" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsNewCountDialogOpen(false)}>Cancelar</Button>
            <Button
              disabled={!newCountDate || createCountMutation.isPending}
              onClick={() => createCountMutation.mutate({ date: newCountDate, area: newCountArea || undefined, notes: newCountNotes || undefined })}
              data-testid="btn-confirm-new-count"
            >
              {createCountMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Crear Toma
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ==================== MOVIMIENTO INTERNO DIALOG ==================== */}
      <Dialog open={isInternalMovOpen} onOpenChange={(open) => { setIsInternalMovOpen(open); if (!open) resetInternalMov(); }}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ArrowDownToLine className="h-5 w-5" />
              Nuevo Movimiento Interno
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4 py-2">
            {/* Cabecera */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1">
                <Label>Fecha *</Label>
                <Input type="date" value={imDate} onChange={e => setImDate(e.target.value)} data-testid="input-im-date" />
              </div>
              <div className="space-y-1">
                <Label>Motivo *</Label>
                <Select value={imMotivo} onValueChange={setImMotivo}>
                  <SelectTrigger data-testid="select-im-motivo"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="desayuno">🍳 Desayuno</SelectItem>
                    <SelectItem value="evento">🎉 Evento</SelectItem>
                    <SelectItem value="desperdicio">🗑️ Desperdicio</SelectItem>
                    <SelectItem value="otro">📋 Otro</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-1">
              <Label>Descripción <span className="text-muted-foreground font-normal">(opcional — ej: "Evento casamiento 50 pax")</span></Label>
              <Input value={imDescripcion} onChange={e => setImDescripcion(e.target.value)} placeholder="Descripción del movimiento..." data-testid="input-im-desc" />
            </div>

            {/* Carga desde receta */}
            <div className="border rounded-lg p-3 bg-muted/30">
              <div className="flex items-center justify-between mb-2">
                <p className="text-sm font-medium flex items-center gap-2">
                  <BookOpen className="h-4 w-4" />
                  Cargar desde receta
                </p>
                <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => setShowRecipeLoader(v => !v)}>
                  {showRecipeLoader ? "Ocultar" : "Expandir"}
                </Button>
              </div>
              {showRecipeLoader && (
                <div className="flex items-end gap-3 flex-wrap">
                  <div className="flex-1 min-w-48 space-y-1">
                    <Label className="text-xs">Receta / Plato</Label>
                    <Select value={imRecipeId || "__none__"} onValueChange={v => setImRecipeId(v === "__none__" ? "" : v)}>
                      <SelectTrigger data-testid="select-im-recipe"><SelectValue placeholder="Seleccionar receta..." /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__none__">— Elegir receta —</SelectItem>
                        {allRecipes.filter(r => r.id).sort((a, b) => (a.name || a.menuItem?.name || "").localeCompare(b.name || b.menuItem?.name || "", "es")).map(r => (
                          <SelectItem key={r.id} value={r.id}>
                            {r.name || r.menuItem?.name || `Receta ${r.id.slice(0, 6)}`}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="w-28 space-y-1">
                    <Label className="text-xs">Porciones</Label>
                    <Input type="number" min={0.1} step="0.5" value={imPorciones} onChange={e => setImPorciones(e.target.value)} data-testid="input-im-porciones" />
                  </div>
                  <Button size="sm" onClick={loadFromRecipe} disabled={!imRecipeId || imRecipeLoading} data-testid="btn-load-recipe">
                    {imRecipeLoading ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Utensils className="h-4 w-4 mr-1" />}
                    Cargar ingredientes
                  </Button>
                </div>
              )}
            </div>

            {/* Tabla de ítems */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label>Artículos a descargar</Label>
                <Button variant="outline" size="sm" className="h-7 text-xs" onClick={addImItem} data-testid="btn-add-im-item">
                  <Plus className="h-3 w-3 mr-1" />Agregar ítem
                </Button>
              </div>

              {imItems.length === 0 ? (
                <div className="border rounded-lg p-6 text-center text-muted-foreground text-sm">
                  <Package className="h-8 w-8 mx-auto mb-2 opacity-40" />
                  Usá "Cargar desde receta" o "Agregar ítem" para agregar artículos
                </div>
              ) : (
                <div className="border rounded-lg overflow-hidden">
                  <table className="w-full text-sm">
                    <thead className="bg-muted/50">
                      <tr>
                        <th className="p-2 text-left font-medium">Artículo</th>
                        <th className="p-2 text-right font-medium w-28">Cantidad</th>
                        <th className="p-2 text-left font-medium">Nota (opcional)</th>
                        <th className="p-2 w-8" />
                      </tr>
                    </thead>
                    <tbody>
                      {imItems.map((row, idx) => {
                        const item = items.find(i => i.id === row.itemId);
                        return (
                          <tr key={idx} className="border-t">
                            <td className="p-1.5">
                              <Select value={row.itemId || "__none__"} onValueChange={v => updateImItem(idx, "itemId", v === "__none__" ? "" : v)}>
                                <SelectTrigger className="h-8 text-xs" data-testid={`select-im-item-${idx}`}>
                                  <SelectValue placeholder="Artículo..." />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="__none__">— Seleccionar —</SelectItem>
                                  {items.filter(i => i.id && i.isActive !== "false").map(i => (
                                    <SelectItem key={i.id} value={i.id}>{i.name} ({i.unit})</SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            </td>
                            <td className="p-1.5">
                              <div className="flex items-center gap-1">
                                <Input
                                  type="number" min={0.001} step="0.001"
                                  value={row.quantity}
                                  onChange={e => updateImItem(idx, "quantity", e.target.value)}
                                  className="h-8 text-xs text-right w-20"
                                  data-testid={`input-im-qty-${idx}`}
                                />
                                <span className="text-xs text-muted-foreground whitespace-nowrap">{item?.unit || ""}</span>
                              </div>
                            </td>
                            <td className="p-1.5">
                              <Input
                                value={row.notes}
                                onChange={e => updateImItem(idx, "notes", e.target.value)}
                                placeholder="Nota..."
                                className="h-8 text-xs"
                                data-testid={`input-im-note-${idx}`}
                              />
                            </td>
                            <td className="p-1.5">
                              <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => removeImItem(idx)}>
                                <X className="h-3 w-3" />
                              </Button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}

              {/* Costo estimado */}
              {imItems.length > 0 && (() => {
                const total = imItems.reduce((s, row) => {
                  const item = items.find(i => i.id === row.itemId);
                  if (!item) return s;
                  return s + parseFloat(row.quantity || "0") * parseFloat(item.costPrice || "0");
                }, 0);
                return (
                  <div className="flex justify-end">
                    <p className="text-sm text-muted-foreground">
                      Costo estimado: <span className="font-semibold text-foreground">${total.toLocaleString("es-AR", { minimumFractionDigits: 2 })}</span>
                    </p>
                  </div>
                );
              })()}
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => { setIsInternalMovOpen(false); resetInternalMov(); }}>Cancelar</Button>
            <Button
              onClick={confirmInternalMov}
              disabled={createInternalMovMutation.isPending || imItems.filter(it => it.itemId).length === 0}
              data-testid="btn-confirm-internal-mov"
            >
              {createInternalMovMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              <ArrowDownToLine className="h-4 w-4 mr-2" />
              Confirmar y descargar stock
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Price History Dialog */}
      <Dialog open={isPriceHistoryOpen} onOpenChange={setIsPriceHistoryOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <DollarSign className="h-4 w-4" />
              Historial de Precios — {priceHistoryItemName}
            </DialogTitle>
          </DialogHeader>
          {priceHistory.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <TrendingUp className="h-8 w-8 mx-auto mb-2 opacity-40" />
              <p>Sin historial de variaciones de precio.</p>
              <p className="text-xs mt-1">Los precios se registran automáticamente al recibir mercadería.</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Fecha</TableHead>
                  <TableHead className="text-right">Precio</TableHead>
                  <TableHead>Variación</TableHead>
                  <TableHead>Origen</TableHead>
                  <TableHead>Notas</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {priceHistory.map((ph, i) => {
                  const price = parseFloat(ph.price);
                  const prevPrice = i < priceHistory.length - 1 ? parseFloat(priceHistory[i + 1].price) : price;
                  const diff = price - prevPrice;
                  const pct = prevPrice !== 0 ? ((diff / prevPrice) * 100) : 0;
                  return (
                    <TableRow key={ph.id} data-testid={`price-history-${ph.id}`}>
                      <TableCell className="text-sm">{new Date(ph.recorded_at).toLocaleDateString("es-AR")}</TableCell>
                      <TableCell className="text-right font-semibold">${price.toLocaleString("es-AR", { minimumFractionDigits: 2 })}</TableCell>
                      <TableCell>
                        {i < priceHistory.length - 1 ? (
                          <span className={`flex items-center gap-1 text-sm font-medium ${diff > 0 ? "text-red-600" : diff < 0 ? "text-green-600" : "text-muted-foreground"}`}>
                            {diff > 0 ? <TrendingUp className="h-3 w-3" /> : diff < 0 ? <TrendingDown className="h-3 w-3" /> : null}
                            {diff !== 0 ? `${diff > 0 ? "+" : ""}${pct.toFixed(1)}%` : "—"}
                          </span>
                        ) : <span className="text-xs text-muted-foreground">Inicial</span>}
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">{ph.source === "entrada" ? "Entrada" : ph.source === "purchase_invoice" ? "Factura" : "Manual"}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">{ph.notes || "—"}</TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsPriceHistoryOpen(false)}>Cerrar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={isNewItemDialogOpen} onOpenChange={setIsNewItemDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Nuevo Articulo</DialogTitle>
          </DialogHeader>
          <NewItemForm
            categories={categories}
            suppliers={suppliers}
            existingItems={items}
            onSubmit={(data) => createItemMutation.mutate(data)}
            isPending={createItemMutation.isPending}
            onCancel={() => setIsNewItemDialogOpen(false)}
          />
        </DialogContent>
      </Dialog>

      <Dialog open={isCategoryDialogOpen} onOpenChange={setIsCategoryDialogOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>{editingCategory ? "Editar Categoría" : "Nueva Categoría"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1">
              <Label>Nombre *</Label>
              <Input
                value={catName}
                onChange={(e) => setCatName(e.target.value)}
                placeholder="Ej: Aceites de Masajes"
                data-testid="input-cat-name"
              />
            </div>
            <div className="space-y-1">
              <Label>Área</Label>
              <Select value={catArea} onValueChange={setCatArea}>
                <SelectTrigger data-testid="select-cat-area">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="general">General (GEN)</SelectItem>
                  <SelectItem value="spa">SPA (SPA)</SelectItem>
                  <SelectItem value="restaurant">Restaurante (RST)</SelectItem>
                  <SelectItem value="housekeeping">Housekeeping (HSK)</SelectItem>
                  <SelectItem value="maintenance">Mantenimiento (MNT)</SelectItem>
                  <SelectItem value="admin">Administración (ADM)</SelectItem>
                  <SelectItem value="marketing">Marketing (MKT)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>Descripción (opcional)</Label>
              <Input
                value={catDescription}
                onChange={(e) => setCatDescription(e.target.value)}
                placeholder="Descripción breve..."
                data-testid="input-cat-description"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsCategoryDialogOpen(false)}>Cancelar</Button>
            <Button
              onClick={() => saveCategoryMutation.mutate({ name: catName.trim(), area: catArea, description: catDescription.trim() })}
              disabled={saveCategoryMutation.isPending || !catName.trim()}
              data-testid="btn-save-category"
            >
              {saveCategoryMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Guardar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function NewItemForm({
  categories,
  suppliers,
  existingItems,
  onSubmit,
  isPending,
  onCancel,
}: {
  categories: ItemCategory[];
  suppliers: Supplier[];
  existingItems: InventoryItem[];
  onSubmit: (data: Partial<InventoryItem>) => void;
  isPending: boolean;
  onCancel: () => void;
}) {
  const [name, setName] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [supplierId, setSupplierId] = useState("");
  const [unit, setUnit] = useState<string>("unidad");
  const [costPrice, setCostPrice] = useState("0");
  const [minStock, setMinStock] = useState(0);
  const [itemKind, setItemKind] = useState<string>("venta_directa");

  const duplicateMatches = name.trim().length > 1
    ? existingItems.filter(
        (i) => i.isActive !== "false" && i.name.trim().toLowerCase() === name.trim().toLowerCase()
      )
    : [];

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <Label>Nombre</Label>
        <Input
          autoFocus
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Nombre del artículo"
          data-testid="input-item-name"
        />
        <p className="text-xs text-muted-foreground">El SKU se asignará automáticamente según el área de la categoría (ej: SPA-0001, RST-0042).</p>
        {duplicateMatches.length > 0 && (
          <div className="flex items-start gap-2 rounded-md border border-amber-300 bg-amber-50 dark:bg-amber-950/30 dark:border-amber-800 p-2 text-xs text-amber-800 dark:text-amber-400" data-testid="warning-duplicate-item-name">
            <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
            <span>
              Ya existe {duplicateMatches.length === 1 ? "un artículo" : `${duplicateMatches.length} artículos`} con este nombre: {duplicateMatches.map((i) => `${i.name} [${i.sku}]`).join(", ")}.
              {" "}Revisá si conviene usar ese artículo en vez de crear uno nuevo.
            </span>
          </div>
        )}
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label>Categoria</Label>
          <Select value={categoryId} onValueChange={setCategoryId}>
            <SelectTrigger data-testid="select-category">
              <SelectValue placeholder="Seleccionar categoria" />
            </SelectTrigger>
            <SelectContent>
              {categories.filter(cat => cat.id).map((cat) => (
                <SelectItem key={cat.id} value={cat.id}>
                  {cat.name} {cat.area !== "general" ? `(${cat.area.toUpperCase()})` : ""}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label>Proveedor</Label>
          <Select value={supplierId} onValueChange={setSupplierId}>
            <SelectTrigger data-testid="select-supplier">
              <SelectValue placeholder="Seleccionar proveedor" />
            </SelectTrigger>
            <SelectContent>
              {suppliers.filter(sup => sup.id).map((sup) => (
                <SelectItem key={sup.id} value={sup.id}>
                  {sup.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>
      <div className="space-y-2">
        <Label>Tipo de artículo</Label>
        <Select value={itemKind} onValueChange={setItemKind}>
          <SelectTrigger data-testid="select-item-kind">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="materia_prima">Materia Prima (insumo para recetas)</SelectItem>
            <SelectItem value="venta_directa">Venta Directa (se vende tal cual)</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div className="grid gap-4 sm:grid-cols-3">
        <div className="space-y-2">
          <Label>Unidad</Label>
          <Select value={unit} onValueChange={setUnit}>
            <SelectTrigger data-testid="select-unit">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {Object.entries(unitLabels).filter(([key]) => key).map(([key, label]) => (
                <SelectItem key={key} value={key}>
                  {label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label>Costo Unitario</Label>
          <Input
            type="number"
            min={0}
            step="0.01"
            value={costPrice}
            onChange={(e) => setCostPrice(e.target.value)}
            data-testid="input-cost"
          />
        </div>
        <div className="space-y-2">
          <Label>Stock Minimo</Label>
          <Input
            type="number"
            min={0}
            value={minStock}
            onChange={(e) => setMinStock(parseInt(e.target.value) || 0)}
            data-testid="input-min-stock"
          />
        </div>
      </div>
      <DialogFooter>
        <Button variant="outline" onClick={onCancel}>
          Cancelar
        </Button>
        <Button
          onClick={() => {
            onSubmit({
              name,
              categoryId: categoryId || undefined,
              supplierId: supplierId || undefined,
              unit: unit as any,
              costPrice,
              minStock,
              itemKind: itemKind as any,
            } as any);
          }}
          disabled={isPending || !name}
          data-testid="button-save-item"
        >
          {isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
          Guardar
        </Button>
      </DialogFooter>
    </div>
  );
}

function TransferForm({
  warehouses,
  items,
  preselectedItem,
  preselectedFromWarehouse,
  onSubmit,
  isPending,
  onCancel,
}: {
  warehouses: InventoryWarehouse[];
  items: InventoryItem[];
  preselectedItem: WarehouseStockRow | null;
  preselectedFromWarehouse: string | null;
  onSubmit: (data: { itemId: string; fromWarehouseId: string; toWarehouseId: string; quantity: number; notes?: string }) => void;
  isPending: boolean;
  onCancel: () => void;
}) {
  const [itemId, setItemId] = useState(preselectedItem?.item_id || "");
  const [fromWarehouseId, setFromWarehouseId] = useState(preselectedFromWarehouse || "");
  const [toWarehouseId, setToWarehouseId] = useState("");
  const [quantity, setQuantity] = useState<number>(1);
  const [notes, setNotes] = useState("");

  return (
    <div className="space-y-4">
      <div className="space-y-1">
        <Label>Artículo *</Label>
        <Select value={itemId} onValueChange={setItemId}>
          <SelectTrigger data-testid="select-transfer-item"><SelectValue placeholder="Seleccionar artículo..." /></SelectTrigger>
          <SelectContent>
            {items.filter(i => i.id && i.isActive !== "false").map(i => (
              <SelectItem key={i.id} value={i.id}>{i.name} {i.sku ? `(${i.sku})` : ""}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-1">
          <Label>Desde *</Label>
          <Select value={fromWarehouseId} onValueChange={setFromWarehouseId}>
            <SelectTrigger data-testid="select-from-warehouse"><SelectValue placeholder="Depósito origen..." /></SelectTrigger>
            <SelectContent>
              {warehouses.filter(w => w.id).map(w => (
                <SelectItem key={w.id} value={w.id} disabled={w.id === toWarehouseId}>{w.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <Label>Hacia *</Label>
          <Select value={toWarehouseId} onValueChange={setToWarehouseId}>
            <SelectTrigger data-testid="select-to-warehouse"><SelectValue placeholder="Depósito destino..." /></SelectTrigger>
            <SelectContent>
              {warehouses.filter(w => w.id).map(w => (
                <SelectItem key={w.id} value={w.id} disabled={w.id === fromWarehouseId}>{w.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>
      <div className="space-y-1">
        <Label>Cantidad *</Label>
        <Input type="number" min={0.001} step="0.001" value={quantity} onChange={e => setQuantity(parseFloat(e.target.value) || 0)} data-testid="input-transfer-qty" />
      </div>
      <div className="space-y-1">
        <Label>Notas (opcional)</Label>
        <Input value={notes} onChange={e => setNotes(e.target.value)} placeholder="Motivo de la transferencia..." data-testid="input-transfer-notes" />
      </div>
      <DialogFooter>
        <Button variant="outline" onClick={onCancel}>Cancelar</Button>
        <Button
          onClick={() => onSubmit({ itemId, fromWarehouseId, toWarehouseId, quantity, notes: notes || undefined })}
          disabled={isPending || !itemId || !fromWarehouseId || !toWarehouseId || quantity <= 0}
          data-testid="btn-confirm-transfer"
        >
          {isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
          <ArrowLeftRight className="h-4 w-4 mr-2" />
          Confirmar Transferencia
        </Button>
      </DialogFooter>
    </div>
  );
}

// ==================== Movimiento Interno Detail (expandable) ====================
function MovimientoInternoDetail({ movId }: { movId: string }) {
  const { data, isLoading } = useQuery<InternalMovement & { items: InternalMovementItem[] }>({
    queryKey: ["/api/inventory/internal-movements", movId, "detail"],
    queryFn: () => fetch(`/api/inventory/internal-movements/${movId}`, { credentials: "include" }).then(r => r.json()),
  });

  if (isLoading) {
    return <div className="px-4 pb-4 space-y-2">{[...Array(3)].map((_, i) => <Skeleton key={i} className="h-8" />)}</div>;
  }
  if (!data?.items?.length) {
    return <div className="px-4 pb-4 text-sm text-muted-foreground">Sin artículos registrados.</div>;
  }

  const totalCost = data.items.reduce((s, i) => s + parseFloat(i.quantity) * parseFloat(i.cost_price), 0);

  return (
    <div className="px-4 pb-4 border-t">
      <table className="w-full text-sm mt-3">
        <thead>
          <tr className="text-muted-foreground text-xs">
            <th className="text-left pb-1 font-medium">Artículo</th>
            <th className="text-right pb-1 font-medium">Cantidad</th>
            <th className="text-left pb-1 font-medium pl-2">Unidad</th>
            <th className="text-right pb-1 font-medium">Costo Unit.</th>
            <th className="text-right pb-1 font-medium">Subtotal</th>
          </tr>
        </thead>
        <tbody>
          {data.items.map((item, i) => (
            <tr key={i} className="border-t border-muted/40">
              <td className="py-1.5 font-medium">{item.item_name}</td>
              <td className="py-1.5 text-right">{parseFloat(item.quantity).toLocaleString("es-AR", { minimumFractionDigits: 3 })}</td>
              <td className="py-1.5 pl-2 text-muted-foreground">{item.unit}</td>
              <td className="py-1.5 text-right">${parseFloat(item.cost_price).toLocaleString("es-AR", { minimumFractionDigits: 2 })}</td>
              <td className="py-1.5 text-right font-semibold">${(parseFloat(item.quantity) * parseFloat(item.cost_price)).toLocaleString("es-AR", { minimumFractionDigits: 2 })}</td>
            </tr>
          ))}
          <tr className="border-t font-bold text-xs">
            <td colSpan={4} className="py-1.5 text-right">TOTAL</td>
            <td className="py-1.5 text-right">${totalCost.toLocaleString("es-AR", { minimumFractionDigits: 2 })}</td>
          </tr>
        </tbody>
      </table>
      {data.notes && <p className="text-xs text-muted-foreground mt-2">Obs: {data.notes}</p>}
    </div>
  );
}

