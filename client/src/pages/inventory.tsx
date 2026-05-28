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
  ArrowDownCircle, 
  ArrowUpCircle,
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
  const [isMovementDialogOpen, setIsMovementDialogOpen] = useState(false);
  const [selectedItem, setSelectedItem] = useState<InventoryItem | null>(null);
  const [movementType, setMovementType] = useState<"entrada" | "salida">("entrada");
  const [areaFilter, setAreaFilter] = useState("all");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [isCategoryDialogOpen, setIsCategoryDialogOpen] = useState(false);
  const [editingCategory, setEditingCategory] = useState<ItemCategory | null>(null);
  const [catName, setCatName] = useState("");
  const [catArea, setCatArea] = useState("general");
  const [catDescription, setCatDescription] = useState("");

  // Warehouses state
  const [selectedWarehouseId, setSelectedWarehouseId] = useState<string | null>(null);
  const [isTransferDialogOpen, setIsTransferDialogOpen] = useState(false);
  const [isWarehouseMovementDialogOpen, setIsWarehouseMovementDialogOpen] = useState(false);
  const [warehouseMovementType, setWarehouseMovementType] = useState<"entrada" | "salida">("entrada");
  const [selectedWarehouseItem, setSelectedWarehouseItem] = useState<WarehouseStockRow | null>(null);
  const [isPriceHistoryOpen, setIsPriceHistoryOpen] = useState(false);
  const [priceHistoryItemId, setPriceHistoryItemId] = useState<string | null>(null);
  const [priceHistoryItemName, setPriceHistoryItemName] = useState<string>("");
  const [isWarehouseFormOpen, setIsWarehouseFormOpen] = useState(false);
  const [editingWarehouse, setEditingWarehouse] = useState<InventoryWarehouse | null>(null);
  const [whName, setWhName] = useState("");
  const [whDescription, setWhDescription] = useState("");
  const [whArea, setWhArea] = useState("general");

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

  const createItemMutation = useMutation({
    mutationFn: async (data: Partial<InventoryItem>) => {
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

  const createMovementMutation = useMutation({
    mutationFn: async (data: { itemId: string; movementType: string; quantity: number; notes?: string }) => {
      const res = await apiRequest("POST", "/api/inventory/movements", data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/inventory/items"] });
      queryClient.invalidateQueries({ queryKey: ["/api/inventory/movements"] });
      queryClient.invalidateQueries({ queryKey: ["/api/inventory/items/low-stock"] });
      setIsMovementDialogOpen(false);
      setSelectedItem(null);
      toast({ title: "Movimiento registrado" });
    },
    onError: (error: any) => {
      toast({ 
        title: "Error", 
        description: error.message || "No se pudo registrar el movimiento",
        variant: "destructive",
      });
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

  const warehouseMovementMutation = useMutation({
    mutationFn: async (data: { itemId: string; movementType: string; quantity: number; notes?: string; unitCost?: number }) => {
      const res = await apiRequest("POST", `/api/inventory/warehouses/${selectedWarehouseId}/movements`, data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/inventory/warehouses", selectedWarehouseId, "stock"] });
      queryClient.invalidateQueries({ queryKey: ["/api/inventory/warehouses-summary"] });
      queryClient.invalidateQueries({ queryKey: ["/api/inventory/items"] });
      setIsWarehouseMovementDialogOpen(false);
      setSelectedWarehouseItem(null);
      toast({ title: "Movimiento registrado" });
    },
    onError: (e: any) => toast({ title: "Error", description: e?.message, variant: "destructive" }),
  });

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
      return matchesSearch && matchesArea && matchesCategory;
    })
    .sort((a, b) => a.name.localeCompare(b.name, "es"));

  const totalValue = items.reduce(
    (sum, item) => sum + (item.currentStock * parseFloat(item.costPrice || "0")),
    0
  );

  const handleMovement = (item: InventoryItem, type: "entrada" | "salida") => {
    setSelectedItem(item);
    setMovementType(type);
    setIsMovementDialogOpen(true);
  };

  const MovementForm = () => {
    const [quantity, setQuantity] = useState(1);
    const [notes, setNotes] = useState("");

    return (
      <div className="space-y-4">
        <div className="p-3 bg-muted rounded-md">
          <div className="font-medium">{selectedItem?.name}</div>
          <div className="text-sm text-muted-foreground">
            Stock actual: {selectedItem?.currentStock} {selectedItem?.unit}
          </div>
        </div>
        <div className="space-y-2">
          <Label>Cantidad</Label>
          <Input
            type="number"
            min={1}
            value={quantity}
            onChange={(e) => setQuantity(parseInt(e.target.value) || 1)}
            data-testid="input-movement-quantity"
          />
        </div>
        <div className="space-y-2">
          <Label>Notas (opcional)</Label>
          <Textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Ej: Proveedor XYZ, Factura #123"
            data-testid="input-movement-notes"
          />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setIsMovementDialogOpen(false)}>
            Cancelar
          </Button>
          <Button
            onClick={() => {
              if (selectedItem) {
                createMovementMutation.mutate({
                  itemId: selectedItem.id,
                  movementType,
                  quantity,
                  notes: notes || undefined,
                });
              }
            }}
            disabled={createMovementMutation.isPending}
            data-testid="button-confirm-movement"
          >
            {createMovementMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            Confirmar {movementType === "entrada" ? "Entrada" : "Salida"}
          </Button>
        </DialogFooter>
      </div>
    );
  };

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
                    <th className="p-3 font-medium text-center">Acciones</th>
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
                        {item.category?.area && item.category.area !== "general" && (
                          <Badge variant="secondary" className="text-[10px] mt-0.5">{(item.category as any).area.toUpperCase()}</Badge>
                        )}
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
                      <td className="p-3">
                        <div className="flex items-center justify-center gap-1">
                          <Button
                            size="icon"
                            variant="ghost"
                            onClick={() => handleMovement(item, "entrada")}
                            title="Registrar entrada"
                            data-testid={`button-entry-${item.id}`}
                          >
                            <ArrowDownCircle className="h-4 w-4 text-green-600" />
                          </Button>
                          <Button
                            size="icon"
                            variant="ghost"
                            onClick={() => handleMovement(item, "salida")}
                            title="Registrar salida"
                            data-testid={`button-exit-${item.id}`}
                          >
                            <ArrowUpCircle className="h-4 w-4 text-red-600" />
                          </Button>
                        </div>
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
                    <Button
                      size="sm"
                      className="w-full"
                      onClick={() => handleMovement(item, "entrada")}
                      data-testid={`button-restock-${item.id}`}
                    >
                      <ArrowDownCircle className="h-4 w-4 mr-2" />
                      Registrar Entrada
                    </Button>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="movements" className="space-y-4">
          {movements.length === 0 ? (
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-12 text-center">
                <History className="h-12 w-12 text-muted-foreground mb-4" />
                <h3 className="text-lg font-semibold mb-2">Sin movimientos</h3>
                <p className="text-muted-foreground">Los movimientos de stock aparecerán aquí</p>
              </CardContent>
            </Card>
          ) : (
            <div className="border rounded-md overflow-hidden">
              <table className="w-full">
                <thead className="bg-muted/50">
                  <tr className="text-left">
                    <th className="p-3 font-medium">Fecha</th>
                    <th className="p-3 font-medium">Articulo</th>
                    <th className="p-3 font-medium">Tipo</th>
                    <th className="p-3 font-medium text-right">Cantidad</th>
                    <th className="p-3 font-medium text-right">Stock Anterior</th>
                    <th className="p-3 font-medium text-right">Stock Nuevo</th>
                    <th className="p-3 font-medium">Notas</th>
                  </tr>
                </thead>
                <tbody>
                  {movements.slice(0, 50).map((movement) => (
                    <tr key={movement.id} className="border-t" data-testid={`movement-${movement.id}`}>
                      <td className="p-3 text-sm">
                        {new Date(movement.createdAt).toLocaleString("es-AR", {
                          day: "2-digit",
                          month: "2-digit",
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </td>
                      <td className="p-3">
                        {movement.item?.name || "N/A"}
                      </td>
                      <td className="p-3">
                        <Badge
                          variant={movement.movementType === "entrada" ? "default" : "secondary"}
                        >
                          {movementTypeLabels[movement.movementType]}
                        </Badge>
                      </td>
                      <td className="p-3 text-right font-mono">
                        <span className={movement.movementType === "entrada" ? "text-green-600" : "text-red-600"}>
                          {movement.movementType === "entrada" ? "+" : "-"}{movement.quantity}
                        </span>
                      </td>
                      <td className="p-3 text-right font-mono text-muted-foreground">
                        {movement.previousStock}
                      </td>
                      <td className="p-3 text-right font-mono">
                        {movement.newStock}
                      </td>
                      <td className="p-3 text-sm text-muted-foreground truncate max-w-48">
                        {movement.notes || "-"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
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
                };
                const areaColors: Record<string, string> = {
                  general: "secondary", spa: "default", restaurant: "destructive",
                  housekeeping: "outline", maintenance: "outline", admin: "outline",
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
                  <div className="flex gap-2">
                    <Button size="sm" variant="outline" onClick={() => {
                      setWarehouseMovementType("salida");
                      setSelectedWarehouseItem(null);
                      setIsWarehouseMovementDialogOpen(true);
                    }} data-testid="btn-wh-salida">
                      <ArrowUpCircle className="h-4 w-4 mr-1 text-red-500" />
                      Salida
                    </Button>
                    <Button size="sm" onClick={() => {
                      setWarehouseMovementType("entrada");
                      setSelectedWarehouseItem(null);
                      setIsWarehouseMovementDialogOpen(true);
                    }} data-testid="btn-wh-entrada">
                      <ArrowDownCircle className="h-4 w-4 mr-1 text-green-500" />
                      Entrada
                    </Button>
                  </div>
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

      {/* Warehouse Movement Dialog (Entrada/Salida) */}
      <Dialog open={isWarehouseMovementDialogOpen} onOpenChange={(open) => { setIsWarehouseMovementDialogOpen(open); if (!open) setSelectedWarehouseItem(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              Registrar {warehouseMovementType === "entrada" ? "Entrada" : "Salida"} — {warehouses.find(w => w.id === selectedWarehouseId)?.name}
            </DialogTitle>
          </DialogHeader>
          <WarehouseMovementForm
            items={items}
            movementType={warehouseMovementType}
            preselectedItem={selectedWarehouseItem}
            onSubmit={(data) => warehouseMovementMutation.mutate(data)}
            isPending={warehouseMovementMutation.isPending}
            onCancel={() => { setIsWarehouseMovementDialogOpen(false); setSelectedWarehouseItem(null); }}
          />
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
            onSubmit={(data) => createItemMutation.mutate(data)}
            isPending={createItemMutation.isPending}
            onCancel={() => setIsNewItemDialogOpen(false)}
          />
        </DialogContent>
      </Dialog>

      <Dialog open={isMovementDialogOpen} onOpenChange={setIsMovementDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              Registrar {movementType === "entrada" ? "Entrada" : "Salida"} de Stock
            </DialogTitle>
          </DialogHeader>
          <MovementForm />
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
  onSubmit,
  isPending,
  onCancel,
}: {
  categories: ItemCategory[];
  suppliers: Supplier[];
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
  const [currentStock, setCurrentStock] = useState(0);

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <Label>Nombre</Label>
        <Input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Nombre del artículo"
          data-testid="input-item-name"
        />
        <p className="text-xs text-muted-foreground">El SKU se asignará automáticamente según el área de la categoría (ej: SPA-0001, RST-0042).</p>
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
      <div className="space-y-2">
        <Label>Stock Inicial</Label>
        <Input
          type="number"
          min={0}
          value={currentStock}
          onChange={(e) => setCurrentStock(parseInt(e.target.value) || 0)}
          data-testid="input-current-stock"
        />
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
              currentStock,
            });
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

function WarehouseMovementForm({
  items,
  movementType,
  preselectedItem,
  onSubmit,
  isPending,
  onCancel,
}: {
  items: InventoryItem[];
  movementType: "entrada" | "salida";
  preselectedItem: WarehouseStockRow | null;
  onSubmit: (data: { itemId: string; movementType: string; quantity: number; notes?: string; unitCost?: number }) => void;
  isPending: boolean;
  onCancel: () => void;
}) {
  const [itemId, setItemId] = useState(preselectedItem?.item_id || "");
  const [quantity, setQuantity] = useState<number>(1);
  const [unitCost, setUnitCost] = useState<number>(0);
  const [notes, setNotes] = useState("");

  const selectedItem = items.find(i => i.id === itemId);

  return (
    <div className="space-y-4">
      <div className="space-y-1">
        <Label>Artículo *</Label>
        <Select value={itemId} onValueChange={(v) => { setItemId(v); const it = items.find(i => i.id === v); if (it) setUnitCost(parseFloat(it.costPrice || "0")); }}>
          <SelectTrigger data-testid="select-wh-mov-item"><SelectValue placeholder="Seleccionar artículo..." /></SelectTrigger>
          <SelectContent>
            {items.filter(i => i.id && i.isActive !== "false").map(i => (
              <SelectItem key={i.id} value={i.id}>{i.name} {i.sku ? `(${i.sku})` : ""}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      {selectedItem && (
        <div className="p-2 bg-muted rounded text-sm text-muted-foreground">
          Stock global actual: <span className="font-semibold text-foreground">{selectedItem.currentStock} {selectedItem.unit}</span>
        </div>
      )}
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-1">
          <Label>Cantidad *</Label>
          <Input type="number" min={0.001} step="0.001" value={quantity} onChange={e => setQuantity(parseFloat(e.target.value) || 0)} data-testid="input-wh-mov-qty" />
        </div>
        {movementType === "entrada" && (
          <div className="space-y-1">
            <Label>Costo Unitario</Label>
            <Input type="number" min={0} step="0.01" value={unitCost} onChange={e => setUnitCost(parseFloat(e.target.value) || 0)} data-testid="input-wh-mov-cost" />
            <p className="text-xs text-muted-foreground">Si cambió, se actualiza el precio del artículo.</p>
          </div>
        )}
      </div>
      <div className="space-y-1">
        <Label>Notas (opcional)</Label>
        <Input value={notes} onChange={e => setNotes(e.target.value)} placeholder="Observaciones..." data-testid="input-wh-mov-notes" />
      </div>
      <DialogFooter>
        <Button variant="outline" onClick={onCancel}>Cancelar</Button>
        <Button
          onClick={() => onSubmit({ itemId, movementType, quantity, notes: notes || undefined, unitCost: movementType === "entrada" ? unitCost : undefined })}
          disabled={isPending || !itemId || quantity <= 0}
          data-testid="btn-confirm-wh-movement"
        >
          {isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
          {movementType === "entrada" ? <ArrowDownCircle className="h-4 w-4 mr-2 text-green-500" /> : <ArrowUpCircle className="h-4 w-4 mr-2 text-red-500" />}
          Registrar {movementType === "entrada" ? "Entrada" : "Salida"}
        </Button>
      </DialogFooter>
    </div>
  );
}
