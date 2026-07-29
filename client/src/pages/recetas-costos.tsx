import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import {
  ChefHat, Search, BookOpen, Plus, Trash2, Loader2, Edit, UtensilsCrossed,
  Layers, FlaskConical, RefreshCw, ArrowRight,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter,
  DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  Form, FormControl, FormField, FormItem, FormLabel, FormMessage,
} from "@/components/ui/form";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

const menuItemFormSchema = z.object({
  name: z.string().min(1, "El nombre es requerido"),
  categoryId: z.string().min(1, "La categoria es requerida"),
  description: z.string().optional(),
  price: z.coerce.number().min(0, "El precio debe ser positivo"),
  preparationTime: z.coerce.number().min(0).optional(),
  isAvailable: z.string().default("true"),
  isEditable: z.string().default("false"),
  defaultCourse: z.coerce.number().int().min(0).max(3).optional(),
});

type MenuItemFormValues = z.infer<typeof menuItemFormSchema>;

const categoryFormSchema = z.object({
  name: z.string().min(1, "El nombre es requerido"),
  description: z.string().optional(),
  displayOrder: z.coerce.number().default(0),
  isBeverage: z.boolean().default(false),
});

type CategoryFormValues = z.infer<typeof categoryFormSchema>;

type MenuCategory = {
  id: string;
  name: string;
  description: string | null;
  displayOrder: number | null;
  isActive: string | null;
  isBeverage: boolean | null;
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

type RecipeIngredient = {
  id: string;
  recipeId: string;
  inventoryItemId: string | null;
  subRecipeId: string | null;   // set when ingredient is an elaboración base
  ingredientName: string;
  quantity: string;
  unit: string;
  unitCost: string;
  merma?: string | null;
};

type Recipe = {
  id: string;
  menuItemId: string | null;   // null for elaboraciones base
  notes: string | null;
  // Elaboración fields
  isBase?: boolean;
  name?: string | null;
  productionUnit?: string | null;
  productionYield?: string | null;
  menuItem?: MenuItem;
  ingredients: RecipeIngredient[];
};

export default function RecetasCostosPage() {
  const { toast } = useToast();

  const [isRecipeDialogOpen, setIsRecipeDialogOpen] = useState(false);
  const [selectedRecipeItem, setSelectedRecipeItem] = useState<MenuItem | null>(null);
  const [newIngredientName, setNewIngredientName] = useState("");
  const [newIngredientQty, setNewIngredientQty] = useState("");
  const [newIngredientUnit, setNewIngredientUnit] = useState("g");
  const [newIngredientCost, setNewIngredientCost] = useState("");
  const [newIngredientInventoryId, setNewIngredientInventoryId] = useState("");
  const [newIngredientMerma, setNewIngredientMerma] = useState("");
  const [ingredientComboOpen, setIngredientComboOpen] = useState(false);
  const [ingredientSearch, setIngredientSearch] = useState("");
  const [recipeSearch, setRecipeSearch] = useState("");
  const [recipeCategoryFilter, setRecipeCategoryFilter] = useState("all");

  // Ingredient source toggle (inventory item vs elaboración base)
  const [ingredientSourceType, setIngredientSourceType] = useState<"inventario" | "elaboracion">("inventario");
  const [newIngredientSubRecipeId, setNewIngredientSubRecipeId] = useState("");

  // Elaboraciones base dialog state
  const [isBaseRecipeDialogOpen, setIsBaseRecipeDialogOpen] = useState(false);
  const [selectedBaseRecipe, setSelectedBaseRecipe] = useState<Recipe | null>(null);
  const [editingBaseRecipe, setEditingBaseRecipe] = useState<Recipe | null>(null);
  const [baseRecipeName, setBaseRecipeName] = useState("");
  const [baseRecipeUnit, setBaseRecipeUnit] = useState("g");
  const [baseRecipeYield, setBaseRecipeYield] = useState("");
  const [baseRecipeNotes, setBaseRecipeNotes] = useState("");
  const [activeTab, setActiveTab] = useState("platos");

  const [isMenuItemDialogOpen, setIsMenuItemDialogOpen] = useState(false);
  const [editingMenuItem, setEditingMenuItem] = useState<MenuItem | null>(null);
  const [isNewItemWizard, setIsNewItemWizard] = useState(false);
  const [isCategoryManagerOpen, setIsCategoryManagerOpen] = useState(false);
  const [isCategoryDialogOpen, setIsCategoryDialogOpen] = useState(false);
  const [editingCategory, setEditingCategory] = useState<MenuCategory | null>(null);
  const [isEditingBasicData, setIsEditingBasicData] = useState(false);

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
      defaultCourse: undefined,
    },
  });

  const categoryForm = useForm<CategoryFormValues>({
    resolver: zodResolver(categoryFormSchema),
    defaultValues: { name: "", description: "", displayOrder: 0, isBeverage: false },
  });

  const { data: menuCategories = [] } = useQuery<MenuCategory[]>({
    queryKey: ["/api/restaurant/menu/categories"],
  });

  const { data: menuItems = [] } = useQuery<MenuItem[]>({
    queryKey: ["/api/restaurant/menu/items"],
  });

  const { data: recipes = [] } = useQuery<Recipe[]>({
    queryKey: ["/api/restaurant/recipes"],
  });

  const { data: inventoryItems = [] } = useQuery<any[]>({
    queryKey: ["/api/inventory/items?itemKind=materia_prima"],
    enabled: isRecipeDialogOpen || isBaseRecipeDialogOpen,
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
    mutationFn: async (data: {
      recipeId: string; ingredientName: string; quantity: string; unit: string; unitCost: string;
      inventoryItemId?: string | null; subRecipeId?: string | null; merma?: string | null
    }) => {
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
      setNewIngredientSubRecipeId("");
      setNewIngredientMerma("");
      setIngredientSearch("");
      setIngredientComboOpen(false);
      setIngredientSourceType("inventario");
      toast({ title: "Ingrediente agregado" });
    },
  });

  // ── Elaboraciones base mutations ─────────────────────────────────────────
  const createBaseRecipeMutation = useMutation({
    mutationFn: async (data: { name: string; productionUnit: string; productionYield: string; notes?: string }) => {
      const res = await apiRequest("POST", "/api/restaurant/recipes", {
        menuItemId: null,
        isBase: true,
        name: data.name,
        productionUnit: data.productionUnit,
        productionYield: data.productionYield,
        notes: data.notes || null,
      });
      return res.json();
    },
    onSuccess: (created: Recipe) => {
      queryClient.invalidateQueries({ queryKey: ["/api/restaurant/recipes"] });
      setSelectedBaseRecipe(created);
      setIsBaseRecipeDialogOpen(true);
      toast({ title: "Elaboración creada", description: "Ahora podés agregar sus ingredientes." });
    },
  });

  const deleteBaseRecipeMutation = useMutation({
    mutationFn: async (id: string) => {
      await apiRequest("DELETE", `/api/restaurant/recipes/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/restaurant/recipes"] });
      setSelectedBaseRecipe(null);
      setIsBaseRecipeDialogOpen(false);
      toast({ title: "Elaboración eliminada" });
    },
  });

  const updateBaseRecipeMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: { name?: string; productionUnit?: string; productionYield?: string; notes?: string } }) => {
      const res = await apiRequest("PATCH", `/api/restaurant/recipes/${id}`, data);
      return res.json();
    },
    onSuccess: (updated: Recipe) => {
      queryClient.invalidateQueries({ queryKey: ["/api/restaurant/recipes"] });
      setSelectedBaseRecipe(updated);
      setEditingBaseRecipe(null);
      toast({ title: "Elaboración actualizada" });
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

  const openRecipeDialog = async (item: MenuItem) => {
    setSelectedRecipeItem(item);
    setEditingMenuItem(item);
    menuItemForm.reset({
      name: item.name,
      categoryId: item.categoryId,
      description: item.description || "",
      price: parseFloat(item.price),
      preparationTime: item.preparationTime || 0,
      isAvailable: item.isAvailable || "true",
      isEditable: (item as any).isEditable || "false",
      defaultCourse: (item as any).defaultCourse ?? undefined,
    });
    const existing = recipes.find(r => r.menuItemId === item.id);
    if (!existing) {
      await createRecipeMutation.mutateAsync(item.id);
    }
    setIsRecipeDialogOpen(true);
  };

  const createMenuItemMutation = useMutation({
    mutationFn: async (data: MenuItemFormValues) => {
      const res = await apiRequest("POST", "/api/restaurant/menu/items", {
        ...data,
        price: data.price.toString(),
      });
      return res.json();
    },
    onSuccess: (_createdItem: MenuItem) => {
      queryClient.invalidateQueries({ queryKey: ["/api/restaurant/menu/items"] });
      toast({ title: "Plato creado" });
      // Only close the old step-1 dialog if it was open (legacy flow)
      if (isMenuItemDialogOpen) {
        setIsMenuItemDialogOpen(false);
        menuItemForm.reset();
      }
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
      toast({ title: "Plato actualizado" });
    },
  });

  const deleteMenuItemMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await apiRequest("DELETE", `/api/restaurant/menu/items/${id}`);
      if (res.status === 204) return { deactivated: false };
      return res.json();
    },
    onSuccess: (result: { deactivated?: boolean; message?: string }) => {
      queryClient.invalidateQueries({ queryKey: ["/api/restaurant/menu/items"] });
      queryClient.invalidateQueries({ queryKey: ["/api/inventory/items"] });
      if (result?.deactivated) {
        toast({ title: "No se pudo eliminar", description: result.message || "El plato tiene ventas registradas, se desactivó en su lugar." });
      } else {
        toast({ title: "Plato eliminado" });
      }
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

  const openMenuItemDialog = (item?: MenuItem) => {
    if (item) {
      setIsNewItemWizard(false);
      setEditingMenuItem(item);
      menuItemForm.reset({
        name: item.name,
        categoryId: item.categoryId,
        description: item.description || "",
        price: parseFloat(item.price),
        preparationTime: item.preparationTime || 0,
        isAvailable: item.isAvailable || "true",
        isEditable: (item as any).isEditable || "false",
        defaultCourse: (item as any).defaultCourse ?? undefined,
      });
    } else {
      setIsNewItemWizard(true);
      setEditingMenuItem(null);
      menuItemForm.reset({
        name: "",
        categoryId: menuCategories[0]?.id || "",
        description: "",
        price: 0,
        preparationTime: 0,
        isAvailable: "true",
        isEditable: "false",
        defaultCourse: undefined,
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
        isBeverage: cat.isBeverage ?? false,
      });
    } else {
      setEditingCategory(null);
      categoryForm.reset({ name: "", description: "", displayOrder: 0, isBeverage: false });
    }
    setIsCategoryDialogOpen(true);
  };

  const currentRecipe = selectedRecipeItem
    ? recipes.find(r => r.menuItemId === selectedRecipeItem.id)
    : null;

  // Elaboraciones base = recipes where isBase=true
  const baseRecipes = (recipes as Recipe[]).filter(r => r.isBase);

  // Current elaboración (when editing via base recipe dialog)
  const currentBaseRecipe = selectedBaseRecipe
    ? recipes.find(r => r.id === selectedBaseRecipe.id) || selectedBaseRecipe
    : null;

  // Helper: costo real de un ingrediente considerando merma
  // Para sub-recetas usa el unitCost almacenado (snapshot del costo por unidad al momento de agregar)
  const ingCostWithMerma = (ing: RecipeIngredient) => {
    const qty = parseFloat(ing.quantity);
    const cost = parseFloat(ing.unitCost || "0");
    const merma = parseFloat(ing.merma || "0");
    const grossQty = merma > 0 ? qty / (1 - merma / 100) : qty;
    return grossQty * cost;
  };

  // Costo total de una elaboración base y su costo por unidad producida
  const baseRecipeTotalCost = (rec: Recipe) =>
    rec.ingredients.reduce((sum, ing) => sum + ingCostWithMerma(ing), 0);

  const baseRecipeCostPerUnit = (rec: Recipe) => {
    const y = parseFloat(String(rec.productionYield || "0"));
    if (y <= 0) return 0;
    return baseRecipeTotalCost(rec) / y;
  };

  // Open dialog to edit an elaboración (or create its recipe shell first)
  const openBaseRecipeEditDialog = (rec: Recipe) => {
    setSelectedBaseRecipe(rec);
    setNewIngredientName("");
    setNewIngredientQty("");
    setNewIngredientUnit(rec.productionUnit || "g");
    setNewIngredientCost("");
    setNewIngredientInventoryId("");
    setNewIngredientSubRecipeId("");
    setNewIngredientMerma("");
    setIngredientSourceType("inventario");
    setIsBaseRecipeDialogOpen(true);
  };

  const recipeCost = currentRecipe?.ingredients.reduce((sum, ing) => {
    return sum + ingCostWithMerma(ing);
  }, 0) || 0;

  const filteredItems = menuItems.filter((item) => {
    const matchSearch = !recipeSearch || item.name.toLowerCase().includes(recipeSearch.toLowerCase());
    const matchCat = recipeCategoryFilter === "all" || item.categoryId === recipeCategoryFilter;
    return matchSearch && matchCat;
  });

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <ChefHat className="h-6 w-6" />
            Recetas y Costos
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Cargá platos, categorías y recetas para calcular costos y márgenes
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={() => setIsCategoryManagerOpen(true)} data-testid="button-manage-categories">
            <UtensilsCrossed className="h-4 w-4 mr-2" />
            Categorías
          </Button>
          <Button
            onClick={() => {
              setSelectedRecipeItem(null);
              setEditingMenuItem(null);
              setIsEditingBasicData(true);
              menuItemForm.reset({
                name: "",
                categoryId: menuCategories[0]?.id || "",
                description: "",
                price: 0,
                preparationTime: 0,
                isAvailable: "true",
                isEditable: "false",
                defaultCourse: undefined,
              });
              setIsRecipeDialogOpen(true);
            }}
            data-testid="button-add-menu-item"
          >
            <Plus className="h-4 w-4 mr-2" />
            Agregar Plato
          </Button>
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="platos" data-testid="tab-platos">
            <ChefHat className="h-4 w-4 mr-2" />
            Platos del Menú
          </TabsTrigger>
          <TabsTrigger value="elaboraciones" data-testid="tab-elaboraciones">
            <FlaskConical className="h-4 w-4 mr-2" />
            Elaboraciones Base
            {baseRecipes.length > 0 && (
              <Badge variant="secondary" className="ml-2 text-xs px-1.5">{baseRecipes.length}</Badge>
            )}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="platos" className="mt-4 space-y-4">
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
            <Button
              variant="ghost"
              size="sm"
              onClick={() => { setRecipeSearch(""); setRecipeCategoryFilter("all"); }}
              data-testid="btn-clear-recipe-filters"
            >
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
            <p className="text-muted-foreground">Primero crea platos en la sección Platos</p>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="pt-6">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Plato</TableHead>
                  <TableHead>Categoría</TableHead>
                  <TableHead className="text-right">Precio Venta</TableHead>
                  <TableHead className="text-right">Costo</TableHead>
                  <TableHead className="text-right">Margen</TableHead>
                  <TableHead className="text-right">% Margen</TableHead>
                  <TableHead className="w-36"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredItems.map((item) => {
                  const recipe = recipes.find(r => r.menuItemId === item.id);
                  const cost = recipe?.ingredients.reduce((sum, ing) => {
                    const merma = parseFloat(ing.merma || "0");
                    const grossQty = merma > 0 ? parseFloat(ing.quantity) / (1 - merma / 100) : parseFloat(ing.quantity);
                    return sum + grossQty * parseFloat(ing.unitCost || "0");
                  }, 0) || 0;
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
                        <div className="flex items-center justify-end gap-1">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => openRecipeDialog(item)}
                            data-testid={`button-edit-recipe-${item.id}`}
                          >
                            <BookOpen className="h-4 w-4 mr-1" />
                            Receta
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => deleteMenuItemMutation.mutate(item.id)}
                            data-testid={`button-delete-item-${item.id}`}
                          >
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
                {filteredItems.length === 0 && (
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

        {/* ── Elaboraciones Base Tab ─────────────────────────────────────── */}
        <TabsContent value="elaboraciones" className="mt-4 space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-muted-foreground">
                Preparaciones intermedias (salsas, fondos, masas) que se usan como ingredientes en platos.
                Al vender un plato, el stock de sus materias primas se descuenta automáticamente.
              </p>
            </div>
            <Button
              onClick={() => {
                setEditingBaseRecipe(null);
                setBaseRecipeName("");
                setBaseRecipeUnit("g");
                setBaseRecipeYield("");
                setBaseRecipeNotes("");
              }}
              data-testid="button-new-elaboracion-form"
            >
              <Plus className="h-4 w-4 mr-2" />
              Nueva Elaboración
            </Button>
          </div>

          {/* Inline create form */}
          <Card>
            <CardContent className="pt-5">
              <p className="text-sm font-medium mb-3 flex items-center gap-2">
                <FlaskConical className="h-4 w-4 text-violet-500" />
                {editingBaseRecipe ? "Editar Elaboración" : "Crear Elaboración Base"}
              </p>
              <div className="grid grid-cols-3 gap-3">
                <div className="col-span-3 sm:col-span-1 space-y-1">
                  <Label className="text-xs">Nombre *</Label>
                  <Input
                    placeholder="Ej: Salsa Bechamel, Fondo de Ternera..."
                    value={editingBaseRecipe ? (editingBaseRecipe.name || "") : baseRecipeName}
                    onChange={(e) => editingBaseRecipe
                      ? setEditingBaseRecipe({ ...editingBaseRecipe, name: e.target.value })
                      : setBaseRecipeName(e.target.value)
                    }
                    data-testid="input-base-recipe-name"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Rendimiento (produce) *</Label>
                  <Input
                    type="number"
                    placeholder="Ej: 1000"
                    step="0.001"
                    min="0"
                    value={editingBaseRecipe ? (editingBaseRecipe.productionYield || "") : baseRecipeYield}
                    onChange={(e) => editingBaseRecipe
                      ? setEditingBaseRecipe({ ...editingBaseRecipe, productionYield: e.target.value })
                      : setBaseRecipeYield(e.target.value)
                    }
                    data-testid="input-base-recipe-yield"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Unidad *</Label>
                  <Select
                    value={editingBaseRecipe ? (editingBaseRecipe.productionUnit || "g") : baseRecipeUnit}
                    onValueChange={(v) => editingBaseRecipe
                      ? setEditingBaseRecipe({ ...editingBaseRecipe, productionUnit: v })
                      : setBaseRecipeUnit(v)
                    }
                  >
                    <SelectTrigger data-testid="select-base-recipe-unit">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="g">g (gramos)</SelectItem>
                      <SelectItem value="kg">kg</SelectItem>
                      <SelectItem value="ml">ml</SelectItem>
                      <SelectItem value="L">L (litros)</SelectItem>
                      <SelectItem value="porciones">porciones</SelectItem>
                      <SelectItem value="unidades">unidades</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="flex items-center gap-2 mt-3">
                {editingBaseRecipe ? (
                  <>
                    <Button
                      size="sm"
                      onClick={() => {
                        if (!editingBaseRecipe.name || !editingBaseRecipe.productionYield) return;
                        updateBaseRecipeMutation.mutate({
                          id: editingBaseRecipe.id,
                          data: {
                            name: editingBaseRecipe.name || "",
                            productionUnit: editingBaseRecipe.productionUnit || "g",
                            productionYield: editingBaseRecipe.productionYield || "0",
                          }
                        });
                      }}
                      disabled={updateBaseRecipeMutation.isPending}
                      data-testid="button-save-base-recipe"
                    >
                      {updateBaseRecipeMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                      Guardar cambios
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => setEditingBaseRecipe(null)}>Cancelar</Button>
                  </>
                ) : (
                  <Button
                    size="sm"
                    onClick={() => {
                      if (!baseRecipeName || !baseRecipeYield) return;
                      createBaseRecipeMutation.mutate({
                        name: baseRecipeName,
                        productionUnit: baseRecipeUnit,
                        productionYield: baseRecipeYield,
                        notes: baseRecipeNotes || undefined,
                      });
                    }}
                    disabled={createBaseRecipeMutation.isPending || !baseRecipeName || !baseRecipeYield}
                    data-testid="button-create-base-recipe"
                  >
                    {createBaseRecipeMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                    <Plus className="h-4 w-4 mr-1" />
                    Crear Elaboración
                  </Button>
                )}
              </div>
            </CardContent>
          </Card>

          {/* List of existing base recipes */}
          {baseRecipes.length === 0 ? (
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-10 text-center">
                <FlaskConical className="h-10 w-10 text-muted-foreground mb-3 opacity-40" />
                <h3 className="text-base font-semibold mb-1">Sin elaboraciones creadas</h3>
                <p className="text-sm text-muted-foreground">
                  Creá la primera elaboración base arriba (ej: Bechamel 1L, Fondo de pollo 2L).
                </p>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-3">
              {baseRecipes.map((br) => {
                const totalCost = baseRecipeTotalCost(br);
                const cpUnit = baseRecipeCostPerUnit(br);
                const isOpen = currentBaseRecipe?.id === br.id && isBaseRecipeDialogOpen;
                return (
                  <Card key={br.id} className={isOpen ? "ring-2 ring-violet-400" : ""}>
                    <CardContent className="pt-4 pb-4">
                      <div className="flex items-start justify-between gap-2 flex-wrap">
                        <div>
                          <div className="font-semibold flex items-center gap-2">
                            <FlaskConical className="h-4 w-4 text-violet-500" />
                            {br.name}
                          </div>
                          <div className="text-sm text-muted-foreground mt-0.5">
                            Rinde: <strong>{br.productionYield} {br.productionUnit}</strong>
                            {" · "} Ingredientes: <strong>{br.ingredients.length}</strong>
                            {" · "} Costo total: <strong>${totalCost.toLocaleString("es-AR", { minimumFractionDigits: 2 })}</strong>
                            {cpUnit > 0 && <> · Costo/{br.productionUnit}: <strong>${cpUnit.toLocaleString("es-AR", { minimumFractionDigits: 4 })}</strong></>}
                          </div>
                          {br.ingredients.length > 0 && (
                            <div className="mt-2 flex flex-wrap gap-1">
                              {br.ingredients.map(ing => (
                                <Badge key={ing.id} variant="outline" className="text-xs">
                                  {ing.ingredientName} {ing.quantity}{ing.unit}
                                </Badge>
                              ))}
                            </div>
                          )}
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => openBaseRecipeEditDialog(br)}
                            data-testid={`button-edit-base-recipe-${br.id}`}
                          >
                            <BookOpen className="h-4 w-4 mr-1" />
                            Ingredientes
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => setEditingBaseRecipe(br)}
                            data-testid={`button-edit-basic-base-recipe-${br.id}`}
                          >
                            <Edit className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => deleteBaseRecipeMutation.mutate(br.id)}
                            data-testid={`button-delete-base-recipe-${br.id}`}
                          >
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </TabsContent>
      </Tabs>

      {/* Recipe Dialog — unified for new dish and edit */}
      <Dialog
        open={isRecipeDialogOpen}
        onOpenChange={(open) => {
          setIsRecipeDialogOpen(open);
          if (!open) {
            setIsEditingBasicData(false);
            setEditingMenuItem(null);
            setSelectedRecipeItem(null);
          }
        }}
      >
        <DialogContent className="max-w-2xl flex flex-col max-h-[90vh]">
          <DialogHeader className="shrink-0">
            <DialogTitle className="flex items-center gap-2">
              <ChefHat className="h-5 w-5" />
              {selectedRecipeItem ? `Receta — ${selectedRecipeItem.name}` : "Nuevo Plato"}
            </DialogTitle>
            <DialogDescription>
              {selectedRecipeItem
                ? `Precio de venta: $${parseFloat(selectedRecipeItem.price).toLocaleString("es-AR", { minimumFractionDigits: 2 })}`
                : "Completá los datos básicos y agregá los ingredientes de la receta en un solo paso."}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 overflow-y-auto flex-1 pr-1">
            {/* Basic data section — always expanded for new dish, collapsible for existing */}
            <div className="border rounded-md">
              {selectedRecipeItem ? (
                <button
                  type="button"
                  className="w-full flex items-center justify-between px-3 py-2 text-sm font-medium"
                  onClick={() => setIsEditingBasicData((v) => !v)}
                  data-testid="button-toggle-basic-data"
                >
                  <span>Datos del plato (nombre, categoría, precio...)</span>
                  <Edit className="h-4 w-4 text-muted-foreground" />
                </button>
              ) : (
                <div className="px-3 py-2 text-sm font-medium bg-muted/40 rounded-t-md border-b">
                  Datos básicos del plato
                </div>
              )}
              {(isEditingBasicData || !selectedRecipeItem) && (
                <div className={selectedRecipeItem ? "border-t p-3" : "p-3"}>
                  <Form {...menuItemForm}>
                    <form
                      onSubmit={menuItemForm.handleSubmit(async (data) => {
                        if (!selectedRecipeItem) {
                          // NEW DISH: create dish then recipe
                          createMenuItemMutation.mutate(data, {
                            onSuccess: async (createdItem: MenuItem) => {
                              setSelectedRecipeItem(createdItem);
                              menuItemForm.reset({
                                name: createdItem.name,
                                categoryId: createdItem.categoryId,
                                description: createdItem.description || "",
                                price: parseFloat(createdItem.price),
                                preparationTime: createdItem.preparationTime || 0,
                                isAvailable: createdItem.isAvailable || "true",
                                isEditable: (createdItem as any).isEditable || "false",
                                defaultCourse: (createdItem as any).defaultCourse ?? undefined,
                              });
                              setIsEditingBasicData(false);
                              const existing = recipes.find(r => r.menuItemId === createdItem.id);
                              if (!existing) await createRecipeMutation.mutateAsync(createdItem.id);
                            },
                          });
                        } else {
                          // EXISTING DISH: update
                          updateMenuItemMutation.mutate(
                            { id: selectedRecipeItem.id, data },
                            {
                              onSuccess: (updated: MenuItem) => {
                                setSelectedRecipeItem(updated);
                                setIsEditingBasicData(false);
                              },
                            }
                          );
                        }
                      })}
                      className="space-y-3"
                    >
                      <FormField
                        control={menuItemForm.control}
                        name="name"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Nombre *</FormLabel>
                            <FormControl>
                              <Input {...field} placeholder="Nombre del plato" data-testid="input-recipe-item-name" />
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
                                <SelectTrigger data-testid="select-recipe-item-category">
                                  <SelectValue placeholder="Seleccionar categoria" />
                                </SelectTrigger>
                              </FormControl>
                              <SelectContent>
                                {menuCategories.map((cat) => (
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
                            <FormLabel>Descripción</FormLabel>
                            <FormControl>
                              <Textarea {...field} placeholder="Descripción del plato" rows={2} data-testid="input-recipe-item-description" />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <div className="grid grid-cols-2 gap-3">
                        <FormField
                          control={menuItemForm.control}
                          name="price"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Precio <span className="text-xs font-normal text-muted-foreground">(con IVA incluido)</span></FormLabel>
                              <FormControl>
                                <Input {...field} type="number" step="0.01" min={0} data-testid="input-recipe-item-price" />
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
                                <Input {...field} type="number" min={0} data-testid="input-recipe-item-prep-time" />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                      </div>
                      <FormField
                        control={menuItemForm.control}
                        name="defaultCourse"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Curso predeterminado</FormLabel>
                            <div className="flex gap-2 flex-wrap">
                              {[{ value: 1, label: "1° Entradas" }, { value: 2, label: "2° Principal" }, { value: 3, label: "3° Postres" }].map(({ value, label }) => (
                                <Button key={value} type="button" variant={field.value === value ? "default" : "outline"} size="sm" onClick={() => field.onChange(value)}>
                                  {label}
                                </Button>
                              ))}
                              <Button type="button" variant={!field.value ? "secondary" : "outline"} size="sm" onClick={() => field.onChange(undefined)}>
                                Sin curso
                              </Button>
                            </div>
                          </FormItem>
                        )}
                      />
                      <div className="flex gap-3">
                        <FormField
                          control={menuItemForm.control}
                          name="isAvailable"
                          render={({ field }) => (
                            <FormItem className="flex items-center gap-3 p-3 border rounded-md flex-1">
                              <FormControl>
                                <Switch checked={field.value === "true"} onCheckedChange={(c) => field.onChange(c ? "true" : "false")} data-testid="switch-recipe-item-available" />
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
                                <Switch checked={field.value === "true"} onCheckedChange={(c) => field.onChange(c ? "true" : "false")} data-testid="switch-recipe-item-editable" />
                              </FormControl>
                              <FormLabel className="cursor-pointer !mt-0">Fuera de menú</FormLabel>
                            </FormItem>
                          )}
                        />
                      </div>
                      <div className="flex justify-end gap-2">
                        {selectedRecipeItem && (
                          <Button type="button" variant="outline" size="sm" onClick={() => setIsEditingBasicData(false)}>
                            Cancelar
                          </Button>
                        )}
                        <Button
                          type="submit"
                          size="sm"
                          disabled={createMenuItemMutation.isPending || updateMenuItemMutation.isPending}
                          data-testid="button-save-recipe-item-basic-data"
                        >
                          {(createMenuItemMutation.isPending || updateMenuItemMutation.isPending) && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                          {selectedRecipeItem ? "Guardar datos" : "Crear Plato y cargar receta →"}
                        </Button>
                      </div>
                    </form>
                  </Form>
                </div>
              )}
            </div>

            {!selectedRecipeItem && (
              <div className="border-2 border-dashed rounded-md p-6 text-center text-sm text-muted-foreground space-y-1">
                <ChefHat className="h-8 w-8 mx-auto opacity-30 mb-2" />
                <p className="font-medium">Ingredientes y costos</p>
                <p>Guardá los datos básicos del plato para habilitar esta sección.</p>
              </div>
            )}

            {selectedRecipeItem && currentRecipe && currentRecipe.ingredients.length > 0 && (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Ingrediente</TableHead>
                    <TableHead className="text-right">Cant. Neta</TableHead>
                    <TableHead>Unidad</TableHead>
                    <TableHead className="text-right">Merma %</TableHead>
                    <TableHead className="text-right">Cant. Bruta</TableHead>
                    <TableHead className="text-right">Costo Unit.</TableHead>
                    <TableHead className="text-right">Subtotal</TableHead>
                    <TableHead>Stock</TableHead>
                    <TableHead className="w-10"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {currentRecipe.ingredients.map((ing) => {
                    const merma = parseFloat(ing.merma || "0");
                    const qty = parseFloat(ing.quantity);
                    const grossQty = merma > 0 ? qty / (1 - merma / 100) : qty;
                    const subtotal = ingCostWithMerma(ing);
                    return (
                      <TableRow key={ing.id}>
                        <TableCell className="font-medium">{ing.ingredientName}</TableCell>
                        <TableCell className="text-right">{ing.quantity}</TableCell>
                        <TableCell>{ing.unit}</TableCell>
                        <TableCell className="text-right">
                          {merma > 0
                            ? <span className="text-amber-600 font-medium">{merma.toFixed(1)}%</span>
                            : <span className="text-muted-foreground">—</span>
                          }
                        </TableCell>
                        <TableCell className="text-right text-muted-foreground text-xs">
                          {merma > 0 ? `${grossQty.toFixed(3)} ${ing.unit}` : "—"}
                        </TableCell>
                        <TableCell className="text-right">
                          ${parseFloat(ing.unitCost).toLocaleString("es-AR", { minimumFractionDigits: 2 })}
                        </TableCell>
                        <TableCell className="text-right">
                          ${subtotal.toLocaleString("es-AR", { minimumFractionDigits: 2 })}
                          {merma > 0 && (
                            <div className="text-xs text-amber-600">+merma</div>
                          )}
                        </TableCell>
                        <TableCell>
                          {ing.subRecipeId ? (
                            <span className="text-xs text-violet-600 font-medium flex items-center gap-1">
                              <FlaskConical className="h-3 w-3" /> Elaboración
                            </span>
                          ) : ing.inventoryItemId ? (
                            <span className="text-xs text-green-600 font-medium">✓ Vinculado</span>
                          ) : (
                            <span className="text-xs text-muted-foreground">Solo costeo</span>
                          )}
                        </TableCell>
                        <TableCell>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-6 w-6"
                            onClick={() => deleteIngredientMutation.mutate(ing.id)}
                            data-testid={`button-delete-ingredient-${ing.id}`}
                          >
                            <Trash2 className="h-3 w-3 text-destructive" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                  <TableRow className="font-bold">
                    <TableCell colSpan={6} className="text-right">Costo Total:</TableCell>
                    <TableCell className="text-right">
                      ${recipeCost.toLocaleString("es-AR", { minimumFractionDigits: 2 })}
                    </TableCell>
                    <TableCell></TableCell>
                    <TableCell></TableCell>
                  </TableRow>
                </TableBody>
              </Table>
            )}

            {selectedRecipeItem && currentRecipe && (
              <div className="flex items-center gap-4 p-3 bg-muted rounded-md text-sm">
                <div>Costo: <strong>${recipeCost.toLocaleString("es-AR", { minimumFractionDigits: 2 })}</strong></div>
                <div>Precio: <strong>${parseFloat(selectedRecipeItem.price).toLocaleString("es-AR", { minimumFractionDigits: 2 })}</strong></div>
                <div>
                  Margen:{" "}
                  <strong className={parseFloat(selectedRecipeItem.price) - recipeCost >= 0 ? "text-green-600" : "text-red-600"}>
                    ${(parseFloat(selectedRecipeItem.price) - recipeCost).toLocaleString("es-AR", { minimumFractionDigits: 2 })}
                    {" "}({parseFloat(selectedRecipeItem.price) > 0
                      ? (((parseFloat(selectedRecipeItem.price) - recipeCost) / parseFloat(selectedRecipeItem.price)) * 100).toFixed(1)
                      : 0}%)
                  </strong>
                </div>
              </div>
            )}

            {selectedRecipeItem && <div className="border-t pt-4 space-y-3">
              <Label className="block font-medium">Agregar Ingrediente</Label>

              {/* Toggle: Materia Prima vs Elaboración */}
              <div className="flex gap-1 p-1 bg-muted rounded-md w-fit">
                <button
                  type="button"
                  className={`px-3 py-1.5 rounded text-sm font-medium transition-colors ${ingredientSourceType === "inventario" ? "bg-background shadow text-foreground" : "text-muted-foreground hover:text-foreground"}`}
                  onClick={() => {
                    setIngredientSourceType("inventario");
                    setNewIngredientName(""); setNewIngredientUnit("g"); setNewIngredientCost(""); setNewIngredientInventoryId(""); setNewIngredientSubRecipeId("");
                  }}
                >
                  Materia Prima
                </button>
                <button
                  type="button"
                  className={`px-3 py-1.5 rounded text-sm font-medium transition-colors ${ingredientSourceType === "elaboracion" ? "bg-background shadow text-foreground" : "text-muted-foreground hover:text-foreground"}`}
                  onClick={() => {
                    setIngredientSourceType("elaboracion");
                    setNewIngredientName(""); setNewIngredientUnit("g"); setNewIngredientCost(""); setNewIngredientInventoryId(""); setNewIngredientSubRecipeId("");
                  }}
                >
                  <FlaskConical className="h-3.5 w-3.5 mr-1 inline-block" />
                  Elaboración Base
                </button>
              </div>

              {ingredientSourceType === "inventario" ? (
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
                        <svg className="h-4 w-4 opacity-50 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 9l4-4 4 4m0 6l-4 4-4-4" />
                        </svg>
                      </Button>
                    ) : (
                      <div className="border rounded-md bg-background shadow-md">
                        <div className="flex items-center border-b px-3 py-2 gap-2">
                          <svg className="h-4 w-4 shrink-0 opacity-50" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-4.35-4.35M17 11A6 6 0 1 1 5 11a6 6 0 0 1 12 0z" />
                          </svg>
                          <input
                            autoFocus
                            className="flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
                            placeholder="Escribí el nombre del artículo..."
                            value={ingredientSearch}
                            onChange={(e) => setIngredientSearch(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === "Escape") { setIngredientComboOpen(false); setIngredientSearch(""); }
                            }}
                            data-testid="input-ingredient-search"
                          />
                          <button
                            type="button"
                            className="text-muted-foreground hover:text-foreground"
                            onClick={() => { setIngredientComboOpen(false); setIngredientSearch(""); }}
                          >✕</button>
                        </div>
                        <div className="max-h-52 overflow-y-auto">
                          {(() => {
                            const filtered = (inventoryItems as any[]).filter((i: any) =>
                              !ingredientSearch ||
                              i.name.toLowerCase().includes(ingredientSearch.toLowerCase()) ||
                              (i.sku && i.sku.toLowerCase().includes(ingredientSearch.toLowerCase()))
                            );
                            if (filtered.length === 0) return (
                              <p className="text-sm text-muted-foreground text-center py-4">No se encontraron artículos</p>
                            );
                            return filtered.map((item: any) => (
                              <button
                                key={item.id}
                                type="button"
                                className="w-full text-left px-3 py-2 hover:bg-accent flex flex-col gap-0.5"
                                data-testid={`combo-item-${item.id}`}
                                onMouseDown={(e) => {
                                  e.preventDefault();
                                  setNewIngredientInventoryId(item.id);
                                  setNewIngredientSubRecipeId("");
                                  setNewIngredientName(item.name);
                                  setNewIngredientUnit(item.unit);
                                  setNewIngredientCost(item.costPrice || "0");
                                  setIngredientSearch("");
                                  setIngredientComboOpen(false);
                                }}
                              >
                                <span className="text-sm font-medium">
                                  {item.name}
                                  {item.sku ? <span className="text-muted-foreground font-normal"> [{item.sku}]</span> : ""}
                                </span>
                                <span className="text-xs text-muted-foreground">
                                  {parseFloat(item.costPrice || "0") > 0
                                    ? `Costo: $${parseFloat(item.costPrice).toLocaleString("es-AR", { minimumFractionDigits: 2 })}/${item.unit}`
                                    : "Sin precio cargado"}
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
              ) : (
                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground">Seleccionar elaboración base</Label>
                  {baseRecipes.length === 0 ? (
                    <div className="border rounded-md p-4 text-sm text-muted-foreground text-center">
                      No hay elaboraciones creadas aún. Creá una en la pestaña "Elaboraciones".
                    </div>
                  ) : (
                    <div className="border rounded-md max-h-52 overflow-y-auto divide-y">
                      {baseRecipes.map((br) => {
                        const cpUnit = baseRecipeCostPerUnit(br);
                        const isSelected = newIngredientSubRecipeId === br.id;
                        return (
                          <button
                            key={br.id}
                            type="button"
                            className={`w-full text-left px-3 py-2 hover:bg-accent flex items-center justify-between gap-2 ${isSelected ? "bg-accent" : ""}`}
                            onMouseDown={(e) => {
                              e.preventDefault();
                              setNewIngredientSubRecipeId(br.id);
                              setNewIngredientInventoryId("");
                              setNewIngredientName(br.name || "Elaboración");
                              setNewIngredientUnit(br.productionUnit || "g");
                              setNewIngredientCost(cpUnit > 0 ? String(cpUnit.toFixed(4)) : "0");
                            }}
                          >
                            <div>
                              <span className="text-sm font-medium flex items-center gap-1">
                                <FlaskConical className="h-3.5 w-3.5 text-violet-500" />
                                {br.name}
                              </span>
                              <span className="text-xs text-muted-foreground">
                                Rinde: {br.productionYield} {br.productionUnit} — Costo/u: ${cpUnit.toLocaleString("es-AR", { minimumFractionDigits: 4 })}
                              </span>
                            </div>
                            {isSelected && <span className="text-xs text-violet-600 font-medium">✓ Seleccionado</span>}
                          </button>
                        );
                      })}
                    </div>
                  )}
                  {newIngredientSubRecipeId && (
                    <p className="text-xs text-violet-600">✓ El stock se descontará por ingredientes de la elaboración al cerrar la orden</p>
                  )}
                </div>
              )}

              {newIngredientName && (
                <div className="space-y-2">
                  <div className="flex items-end gap-2">
                    <div className="flex-1 space-y-1">
                      <Label className="text-xs">Cantidad neta *</Label>
                      <Input
                        type="number"
                        placeholder="Ej: 200"
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
                    <div className="w-24 space-y-1">
                      <Label className="text-xs">Merma %</Label>
                      <Input
                        type="number"
                        placeholder="Ej: 10"
                        step="0.1"
                        min="0"
                        max="99"
                        value={newIngredientMerma}
                        onChange={(e) => setNewIngredientMerma(e.target.value)}
                        data-testid="input-ingredient-merma"
                      />
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
                  {newIngredientMerma && parseFloat(newIngredientMerma) > 0 && newIngredientQty && (
                    <p className="text-xs text-amber-600">
                      Cantidad bruta a consumir del stock:{" "}
                      <strong>
                        {(parseFloat(newIngredientQty) / (1 - parseFloat(newIngredientMerma) / 100)).toFixed(3)} {newIngredientUnit}
                      </strong>
                      {" "}— costo real incluye merma
                    </p>
                  )}
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
                    inventoryItemId: ingredientSourceType === "inventario" ? (newIngredientInventoryId || null) : null,
                    subRecipeId: ingredientSourceType === "elaboracion" ? (newIngredientSubRecipeId || null) : null,
                    merma: newIngredientMerma || null,
                  });
                }}
                disabled={addIngredientMutation.isPending || !newIngredientName || !newIngredientQty}
                data-testid="button-add-ingredient"
              >
                {addIngredientMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                <Plus className="h-4 w-4 mr-1" />
                Agregar Ingrediente
              </Button>
            </div>}

          </div>

          <DialogFooter className="shrink-0 pt-2 border-t">
            <Button onClick={() => setIsRecipeDialogOpen(false)}>Cerrar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Menu Item Dialog (Create/Edit) - Step 1 of wizard when creating */}
      <Dialog open={isMenuItemDialogOpen} onOpenChange={(open) => { setIsMenuItemDialogOpen(open); if (!open) setIsNewItemWizard(false); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {editingMenuItem ? "Editar Plato" : isNewItemWizard ? "Nuevo Plato (Paso 1 de 2: Datos básicos)" : "Nuevo Plato"}
            </DialogTitle>
            {isNewItemWizard && (
              <DialogDescription>
                Al guardar, se abrirá el paso 2 para cargar la receta del plato.
              </DialogDescription>
            )}
          </DialogHeader>
          <Form {...menuItemForm}>
            <form
              onSubmit={menuItemForm.handleSubmit((data) => {
                if (editingMenuItem) {
                  updateMenuItemMutation.mutate(
                    { id: editingMenuItem.id, data },
                    {
                      onSuccess: () => {
                        setIsMenuItemDialogOpen(false);
                        setEditingMenuItem(null);
                        menuItemForm.reset();
                      },
                    }
                  );
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
                        {menuCategories.map((cat) => (
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
              <FormField
                control={menuItemForm.control}
                name="defaultCourse"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Curso predeterminado <span className="text-xs font-normal text-muted-foreground">(se asigna automáticamente al agregar el plato al pedido)</span></FormLabel>
                    <div className="flex gap-2">
                      {[
                        { value: 1, label: "1° Entradas" },
                        { value: 2, label: "2° Principal" },
                        { value: 3, label: "3° Postres" },
                      ].map(({ value, label }) => (
                        <Button
                          key={value}
                          type="button"
                          variant={field.value === value ? "default" : "outline"}
                          size="sm"
                          onClick={() => field.onChange(value)}
                          data-testid={`button-default-course-${value}`}
                        >
                          {label}
                        </Button>
                      ))}
                      <Button
                        type="button"
                        variant={!field.value ? "secondary" : "outline"}
                        size="sm"
                        onClick={() => field.onChange(undefined)}
                        data-testid="button-default-course-none"
                      >
                        Sin curso
                      </Button>
                    </div>
                    <p className="text-xs text-muted-foreground">Usar "Sin curso" para bebidas o ítems que no tienen curso fijo.</p>
                  </FormItem>
                )}
              />
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
                <Button type="button" variant="outline" onClick={() => { setIsMenuItemDialogOpen(false); setIsNewItemWizard(false); }}>Cancelar</Button>
                <Button
                  type="submit"
                  disabled={createMenuItemMutation.isPending || updateMenuItemMutation.isPending}
                  data-testid="button-save-menu-item"
                >
                  {(createMenuItemMutation.isPending || updateMenuItemMutation.isPending) && (
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  )}
                  {editingMenuItem ? "Actualizar" : isNewItemWizard ? "Guardar y continuar" : "Crear Plato"}
                </Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>

      {/* Category Manager Dialog */}
      <Dialog open={isCategoryManagerOpen} onOpenChange={setIsCategoryManagerOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Categorías del Menú</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <Button
              size="sm"
              onClick={() => openCategoryDialog()}
              data-testid="button-add-category"
            >
              <Plus className="h-4 w-4 mr-2" />
              Nueva Categoría
            </Button>
            <div className="space-y-2 max-h-80 overflow-y-auto">
              {menuCategories.length === 0 && (
                <p className="text-sm text-muted-foreground text-center py-6">No hay categorías creadas</p>
              )}
              {menuCategories.map((cat) => (
                <div key={cat.id} className="flex items-center justify-between gap-2 p-3 border rounded-md" data-testid={`category-row-${cat.id}`}>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-medium">{cat.name}</span>
                      {cat.isBeverage && <span className="text-xs px-1.5 py-0.5 rounded bg-blue-100 text-blue-700 font-medium">Bebidas</span>}
                    </div>
                    {cat.description && (
                      <p className="text-xs text-muted-foreground">{cat.description}</p>
                    )}
                  </div>
                  <div className="flex items-center gap-1">
                    <Button variant="ghost" size="icon" onClick={() => openCategoryDialog(cat)} data-testid={`button-edit-category-${cat.id}`}>
                      <Edit className="h-4 w-4" />
                    </Button>
                    <Button variant="ghost" size="icon" onClick={() => deleteCategoryMutation.mutate(cat.id)} data-testid={`button-delete-category-${cat.id}`}>
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </div>
          <DialogFooter>
            <Button onClick={() => setIsCategoryManagerOpen(false)}>Cerrar</Button>
          </DialogFooter>
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
              <FormField
                control={categoryForm.control}
                name="isBeverage"
                render={({ field }) => (
                  <FormItem className="flex items-center justify-between rounded-md border p-3 gap-4">
                    <div className="flex-1">
                      <FormLabel className="text-sm font-medium">Categoría de Bebidas</FormLabel>
                      <p className="text-xs text-muted-foreground mt-0.5">Activa para calcular Beverage Cost separado del Food Cost</p>
                    </div>
                    <FormControl>
                      <Switch checked={!!field.value} onCheckedChange={field.onChange} data-testid="switch-category-beverage" />
                    </FormControl>
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
      {/* ── Elaboraciones Base — Ingredient Dialog ──────────────────────── */}
      <Dialog
        open={isBaseRecipeDialogOpen}
        onOpenChange={(open) => {
          setIsBaseRecipeDialogOpen(open);
          if (!open) {
            setSelectedBaseRecipe(null);
            setNewIngredientName("");
            setNewIngredientQty("");
            setNewIngredientUnit("g");
            setNewIngredientCost("");
            setNewIngredientInventoryId("");
            setNewIngredientSubRecipeId("");
            setNewIngredientMerma("");
            setIngredientSourceType("inventario");
          }
        }}
      >
        <DialogContent className="max-w-2xl flex flex-col max-h-[90vh]">
          <DialogHeader className="shrink-0">
            <DialogTitle className="flex items-center gap-2">
              <FlaskConical className="h-5 w-5 text-violet-500" />
              {currentBaseRecipe?.name || "Elaboración Base"} — Ingredientes
            </DialogTitle>
            <DialogDescription>
              {currentBaseRecipe?.productionYield && currentBaseRecipe?.productionUnit
                ? `Rinde ${currentBaseRecipe.productionYield} ${currentBaseRecipe.productionUnit} por lote`
                : "Definí los ingredientes que componen esta elaboración"}
            </DialogDescription>
          </DialogHeader>

          <div className="flex-1 overflow-y-auto space-y-4 pr-1">
            {/* Ingredient table */}
            {currentBaseRecipe && currentBaseRecipe.ingredients.length > 0 && (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Ingrediente</TableHead>
                    <TableHead className="text-right">Cant. Neta</TableHead>
                    <TableHead>Unidad</TableHead>
                    <TableHead className="text-right">Merma %</TableHead>
                    <TableHead className="text-right">Costo Unit.</TableHead>
                    <TableHead className="text-right">Subtotal</TableHead>
                    <TableHead className="w-10"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {currentBaseRecipe.ingredients.map((ing) => {
                    const merma = parseFloat(ing.merma || "0");
                    const subtotal = ingCostWithMerma(ing);
                    return (
                      <TableRow key={ing.id}>
                        <TableCell className="font-medium">
                          {ing.subRecipeId && <FlaskConical className="h-3 w-3 text-violet-400 inline mr-1" />}
                          {ing.ingredientName}
                        </TableCell>
                        <TableCell className="text-right">{ing.quantity}</TableCell>
                        <TableCell>{ing.unit}</TableCell>
                        <TableCell className="text-right">
                          {merma > 0 ? <span className="text-amber-600">{merma.toFixed(1)}%</span> : "—"}
                        </TableCell>
                        <TableCell className="text-right">
                          ${parseFloat(ing.unitCost).toLocaleString("es-AR", { minimumFractionDigits: 2 })}
                        </TableCell>
                        <TableCell className="text-right">
                          ${subtotal.toLocaleString("es-AR", { minimumFractionDigits: 2 })}
                        </TableCell>
                        <TableCell>
                          <Button
                            variant="ghost" size="icon" className="h-6 w-6"
                            onClick={() => deleteIngredientMutation.mutate(ing.id)}
                          >
                            <Trash2 className="h-3 w-3 text-destructive" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                  <TableRow className="font-bold">
                    <TableCell colSpan={5} className="text-right">Costo Total del lote:</TableCell>
                    <TableCell className="text-right">
                      ${baseRecipeTotalCost(currentBaseRecipe).toLocaleString("es-AR", { minimumFractionDigits: 2 })}
                    </TableCell>
                    <TableCell />
                  </TableRow>
                  {currentBaseRecipe.productionYield && parseFloat(String(currentBaseRecipe.productionYield)) > 0 && (
                    <TableRow className="text-violet-700 dark:text-violet-400">
                      <TableCell colSpan={5} className="text-right text-sm">
                        Costo por {currentBaseRecipe.productionUnit}:
                      </TableCell>
                      <TableCell className="text-right text-sm font-semibold">
                        ${baseRecipeCostPerUnit(currentBaseRecipe).toLocaleString("es-AR", { minimumFractionDigits: 4 })}
                      </TableCell>
                      <TableCell />
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            )}

            {currentBaseRecipe && currentBaseRecipe.ingredients.length === 0 && (
              <div className="border-2 border-dashed rounded-md p-6 text-center text-sm text-muted-foreground">
                <FlaskConical className="h-8 w-8 mx-auto opacity-30 mb-2" />
                <p>Esta elaboración no tiene ingredientes aún. Agregá materias primas abajo.</p>
              </div>
            )}

            {/* Add ingredient form */}
            {currentBaseRecipe && (
              <div className="border-t pt-4 space-y-3">
                <Label className="block font-medium">Agregar Ingrediente a la Elaboración</Label>

                {/* Toggle */}
                <div className="flex gap-1 p-1 bg-muted rounded-md w-fit">
                  <button
                    type="button"
                    className={`px-3 py-1.5 rounded text-sm font-medium transition-colors ${ingredientSourceType === "inventario" ? "bg-background shadow" : "text-muted-foreground hover:text-foreground"}`}
                    onClick={() => { setIngredientSourceType("inventario"); setNewIngredientName(""); setNewIngredientUnit("g"); setNewIngredientCost(""); setNewIngredientInventoryId(""); setNewIngredientSubRecipeId(""); }}
                  >
                    Materia Prima
                  </button>
                  <button
                    type="button"
                    className={`px-3 py-1.5 rounded text-sm font-medium transition-colors ${ingredientSourceType === "elaboracion" ? "bg-background shadow" : "text-muted-foreground hover:text-foreground"}`}
                    onClick={() => { setIngredientSourceType("elaboracion"); setNewIngredientName(""); setNewIngredientUnit("g"); setNewIngredientCost(""); setNewIngredientInventoryId(""); setNewIngredientSubRecipeId(""); }}
                  >
                    <FlaskConical className="h-3.5 w-3.5 mr-1 inline-block" />
                    Elaboración Base
                  </button>
                </div>

                {ingredientSourceType === "inventario" ? (
                  <div className="space-y-1">
                    <Label className="text-xs text-muted-foreground">Buscar artículo del inventario</Label>
                    <div className="relative">
                      {!ingredientComboOpen ? (
                        <Button
                          type="button" variant="outline" className="w-full justify-between font-normal"
                          onClick={() => { setIngredientComboOpen(true); setIngredientSearch(""); }}
                        >
                          <span className={newIngredientName ? "" : "text-muted-foreground"}>
                            {newIngredientName || "Buscar artículo..."}
                          </span>
                          <svg className="h-4 w-4 opacity-50 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 9l4-4 4 4m0 6l-4 4-4-4" />
                          </svg>
                        </Button>
                      ) : (
                        <div className="border rounded-md bg-background shadow-md">
                          <div className="flex items-center border-b px-3 py-2 gap-2">
                            <svg className="h-4 w-4 shrink-0 opacity-50" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-4.35-4.35M17 11A6 6 0 1 1 5 11a6 6 0 0 1 12 0z" />
                            </svg>
                            <input
                              autoFocus
                              className="flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
                              placeholder="Escribí el nombre del artículo..."
                              value={ingredientSearch}
                              onChange={(e) => setIngredientSearch(e.target.value)}
                              onKeyDown={(e) => { if (e.key === "Escape") { setIngredientComboOpen(false); setIngredientSearch(""); } }}
                            />
                            <button type="button" className="text-muted-foreground hover:text-foreground"
                              onClick={() => { setIngredientComboOpen(false); setIngredientSearch(""); }}>✕</button>
                          </div>
                          <div className="max-h-48 overflow-y-auto">
                            {(() => {
                              const filtered = (inventoryItems as any[]).filter((i: any) =>
                                !ingredientSearch || i.name.toLowerCase().includes(ingredientSearch.toLowerCase())
                              );
                              if (filtered.length === 0) return <p className="text-sm text-muted-foreground text-center py-4">No se encontraron artículos</p>;
                              return filtered.map((item: any) => (
                                <button key={item.id} type="button"
                                  className="w-full text-left px-3 py-2 hover:bg-accent flex flex-col gap-0.5"
                                  onMouseDown={(e) => {
                                    e.preventDefault();
                                    setNewIngredientInventoryId(item.id);
                                    setNewIngredientSubRecipeId("");
                                    setNewIngredientName(item.name);
                                    setNewIngredientUnit(item.unit);
                                    setNewIngredientCost(item.costPrice || "0");
                                    setIngredientSearch(""); setIngredientComboOpen(false);
                                  }}
                                >
                                  <span className="text-sm font-medium">{item.name}</span>
                                  <span className="text-xs text-muted-foreground">
                                    {parseFloat(item.costPrice || "0") > 0 ? `Costo: $${parseFloat(item.costPrice).toLocaleString("es-AR", { minimumFractionDigits: 2 })}/${item.unit}` : "Sin precio"}
                                  </span>
                                </button>
                              ));
                            })()}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                ) : (
                  <div className="space-y-1">
                    <Label className="text-xs text-muted-foreground">Seleccionar otra elaboración</Label>
                    {baseRecipes.filter(br => br.id !== currentBaseRecipe.id).length === 0 ? (
                      <div className="border rounded-md p-3 text-sm text-muted-foreground text-center">
                        No hay otras elaboraciones disponibles.
                      </div>
                    ) : (
                      <div className="border rounded-md max-h-40 overflow-y-auto divide-y">
                        {baseRecipes.filter(br => br.id !== currentBaseRecipe.id).map((br) => {
                          const cpUnit = baseRecipeCostPerUnit(br);
                          return (
                            <button key={br.id} type="button"
                              className={`w-full text-left px-3 py-2 hover:bg-accent flex items-center justify-between ${newIngredientSubRecipeId === br.id ? "bg-accent" : ""}`}
                              onMouseDown={(e) => {
                                e.preventDefault();
                                setNewIngredientSubRecipeId(br.id);
                                setNewIngredientInventoryId("");
                                setNewIngredientName(br.name || "Elaboración");
                                setNewIngredientUnit(br.productionUnit || "g");
                                setNewIngredientCost(cpUnit > 0 ? String(cpUnit.toFixed(4)) : "0");
                              }}
                            >
                              <span className="text-sm font-medium flex items-center gap-1">
                                <FlaskConical className="h-3.5 w-3.5 text-violet-500" />
                                {br.name}
                              </span>
                              <span className="text-xs text-muted-foreground">Costo/u: ${cpUnit.toLocaleString("es-AR", { minimumFractionDigits: 4 })}</span>
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </div>
                )}

                {newIngredientName && (
                  <div className="space-y-2">
                    <div className="flex items-end gap-2">
                      <div className="flex-1 space-y-1">
                        <Label className="text-xs">Cantidad neta *</Label>
                        <Input type="number" placeholder="Ej: 200" step="0.001"
                          value={newIngredientQty} onChange={(e) => setNewIngredientQty(e.target.value)} />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs">Unidad</Label>
                        <div className="h-9 px-3 flex items-center border rounded-md bg-muted/40 text-sm font-medium min-w-14 justify-center">
                          {newIngredientUnit}
                        </div>
                      </div>
                      <div className="w-24 space-y-1">
                        <Label className="text-xs">Merma %</Label>
                        <Input type="number" placeholder="Ej: 10" step="0.1" min="0" max="99"
                          value={newIngredientMerma} onChange={(e) => setNewIngredientMerma(e.target.value)} />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs">Costo unit.</Label>
                        <div className="h-9 px-3 flex items-center border rounded-md bg-muted/40 text-sm min-w-28">
                          {parseFloat(newIngredientCost || "0") > 0
                            ? `$${parseFloat(newIngredientCost).toLocaleString("es-AR", { minimumFractionDigits: 2 })}`
                            : <span className="text-muted-foreground text-xs italic">sin precio</span>}
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                <Button
                  size="sm"
                  onClick={() => {
                    if (!currentBaseRecipe || !newIngredientName || !newIngredientQty) return;
                    addIngredientMutation.mutate({
                      recipeId: currentBaseRecipe.id,
                      ingredientName: newIngredientName,
                      quantity: newIngredientQty,
                      unit: newIngredientUnit,
                      unitCost: newIngredientCost || "0",
                      inventoryItemId: ingredientSourceType === "inventario" ? (newIngredientInventoryId || null) : null,
                      subRecipeId: ingredientSourceType === "elaboracion" ? (newIngredientSubRecipeId || null) : null,
                      merma: newIngredientMerma || null,
                    });
                  }}
                  disabled={addIngredientMutation.isPending || !newIngredientName || !newIngredientQty}
                >
                  {addIngredientMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                  <Plus className="h-4 w-4 mr-1" />
                  Agregar Ingrediente
                </Button>
              </div>
            )}
          </div>

          <DialogFooter className="shrink-0 pt-2 border-t">
            <Button onClick={() => setIsBaseRecipeDialogOpen(false)}>Cerrar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
