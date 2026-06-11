import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import {
  ChefHat, Search, BookOpen, Plus, Trash2, Loader2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
import { Label } from "@/components/ui/label";

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

export default function RecetasCostosPage() {
  const { toast } = useToast();

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
    queryKey: ["/api/inventory/items"],
    enabled: isRecipeDialogOpen,
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

  const openRecipeDialog = async (item: MenuItem) => {
    setSelectedRecipeItem(item);
    const existing = recipes.find(r => r.menuItemId === item.id);
    if (!existing) {
      await createRecipeMutation.mutateAsync(item.id);
    }
    setIsRecipeDialogOpen(true);
  };

  const currentRecipe = selectedRecipeItem
    ? recipes.find(r => r.menuItemId === selectedRecipeItem.id)
    : null;

  const recipeCost = currentRecipe?.ingredients.reduce((sum, ing) => {
    return sum + parseFloat(ing.quantity) * parseFloat(ing.unitCost || "0");
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
            Cargá recetas por plato para calcular costos y márgenes
          </p>
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
                  <TableHead className="w-20"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredItems.map((item) => {
                  const recipe = recipes.find(r => r.menuItemId === item.id);
                  const cost = recipe?.ingredients.reduce(
                    (sum, ing) => sum + parseFloat(ing.quantity) * parseFloat(ing.unitCost || "0"),
                    0
                  ) || 0;
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
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => openRecipeDialog(item)}
                          data-testid={`button-edit-recipe-${item.id}`}
                        >
                          <BookOpen className="h-4 w-4 mr-1" />
                          Receta
                        </Button>
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
                <span>
                  Precio de venta: ${parseFloat(selectedRecipeItem.price).toLocaleString("es-AR", { minimumFractionDigits: 2 })}
                </span>
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
                      <TableCell className="text-right">
                        ${parseFloat(ing.unitCost).toLocaleString("es-AR", { minimumFractionDigits: 2 })}
                      </TableCell>
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
                  ))}
                  <TableRow className="font-bold">
                    <TableCell colSpan={4} className="text-right">Costo Total:</TableCell>
                    <TableCell className="text-right">
                      ${recipeCost.toLocaleString("es-AR", { minimumFractionDigits: 2 })}
                    </TableCell>
                    <TableCell></TableCell>
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
                    {" "}({parseFloat(selectedRecipeItem.price) > 0
                      ? (((parseFloat(selectedRecipeItem.price) - recipeCost) / parseFloat(selectedRecipeItem.price)) * 100).toFixed(1)
                      : 0}%)
                  </strong>
                </div>
              </div>
            )}

            <div className="border-t pt-4 space-y-3">
              <Label className="block font-medium">Agregar Ingrediente</Label>

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
