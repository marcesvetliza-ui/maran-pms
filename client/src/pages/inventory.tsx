import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
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
} from "lucide-react";

type ItemCategory = {
  id: string;
  name: string;
  description: string | null;
  parentId: string | null;
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
  const [isNewItemDialogOpen, setIsNewItemDialogOpen] = useState(false);
  const [isMovementDialogOpen, setIsMovementDialogOpen] = useState(false);
  const [selectedItem, setSelectedItem] = useState<InventoryItem | null>(null);
  const [movementType, setMovementType] = useState<"entrada" | "salida">("entrada");

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

  const filteredItems = items.filter((item) =>
    item.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    item.sku?.toLowerCase().includes(searchQuery.toLowerCase())
  );

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
        <Button onClick={() => setIsNewItemDialogOpen(true)} data-testid="button-add-item">
          <Plus className="h-4 w-4 mr-2" />
          Nuevo Articulo
        </Button>
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
        </TabsList>

        <TabsContent value="items" className="space-y-4">
          <div className="flex items-center gap-4">
            <div className="relative flex-1 max-w-sm">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Buscar articulos..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10"
                data-testid="input-search"
              />
            </div>
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
                        {item.category?.name || "-"}
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
      </Tabs>

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
  const [sku, setSku] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [supplierId, setSupplierId] = useState("");
  const [unit, setUnit] = useState<string>("unidad");
  const [costPrice, setCostPrice] = useState("0");
  const [minStock, setMinStock] = useState(0);
  const [currentStock, setCurrentStock] = useState(0);

  return (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label>Nombre</Label>
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Nombre del articulo"
            data-testid="input-item-name"
          />
        </div>
        <div className="space-y-2">
          <Label>SKU (opcional)</Label>
          <Input
            value={sku}
            onChange={(e) => setSku(e.target.value)}
            placeholder="Codigo SKU"
            data-testid="input-item-sku"
          />
        </div>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label>Categoria</Label>
          <Select value={categoryId} onValueChange={setCategoryId}>
            <SelectTrigger data-testid="select-category">
              <SelectValue placeholder="Seleccionar categoria" />
            </SelectTrigger>
            <SelectContent>
              {categories.map((cat) => (
                <SelectItem key={cat.id} value={cat.id}>
                  {cat.name}
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
              {suppliers.map((sup) => (
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
              {Object.entries(unitLabels).map(([key, label]) => (
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
              sku: sku || undefined,
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
