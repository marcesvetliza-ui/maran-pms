import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { getArgentinaToday } from "@/lib/date-utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Factory, Link2, Unlink, Loader2, Save } from "lucide-react";

type FormulaLine = {
  recipeIngredientId: string;
  ingredientName: string;
  inventoryItemId: string | null;
  subRecipeId: string | null;
  unit: string;
  formulaQuantity: number;
  merma: number;
  grossQuantity: number;
  unitCost: number;
};

type Formula = {
  recipeId: string;
  name: string;
  productionUnit: string | null;
  productionYield: number;
  outputInventoryItemId: string;
  outputItemName: string;
  outputUnit: string;
  outputCurrentStock: number;
  outputCostPrice: number;
  lines: FormulaLine[];
};

type UnlinkedRecipe = { recipeId: string; name: string; productionUnit: string | null; productionYield: number };

type InventoryItemLite = { id: string; name: string; unit: string; isActive: string | null };

type HistoryRow = {
  id: string;
  date: string;
  recipeName: string;
  outputItemName: string;
  outputQuantity: number;
  outputUnit: string;
  outputUnitCost: number;
  totalCost: number;
  notes: string | null;
  registeredBy: string | null;
  createdAt: string;
};

const UNIT_LABELS: Record<string, string> = {
  unidad: "Unidades", kg: "Kilogramos", g: "Gramos", litro: "Litros",
  ml: "Mililitros", caja: "Cajas", paquete: "Paquetes", docena: "Docenas",
};

function fmtMoney(n: number) {
  return `$${n.toLocaleString("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function RegisterRunTab() {
  const { toast } = useToast();
  const [date, setDate] = useState(getArgentinaToday());
  const [recipeId, setRecipeId] = useState<string>("");
  const [outputQuantity, setOutputQuantity] = useState<string>("");
  const [actuals, setActuals] = useState<Record<string, string>>({});
  const [notes, setNotes] = useState("");

  const { data: formulas = [], isLoading } = useQuery<Formula[]>({ queryKey: ["/api/production/formulas"] });
  const formula = formulas.find(f => f.recipeId === recipeId) || null;

  const pickFormula = (id: string) => {
    setRecipeId(id);
    const f = formulas.find(x => x.recipeId === id);
    if (!f) return;
    setOutputQuantity(f.productionYield > 0 ? String(f.productionYield) : "");
    const nextActuals: Record<string, string> = {};
    for (const line of f.lines) nextActuals[line.recipeIngredientId] = String(line.grossQuantity);
    setActuals(nextActuals);
  };

  const totalCost = formula
    ? formula.lines.reduce((sum, line) => sum + (parseFloat(actuals[line.recipeIngredientId] || "0") || 0) * line.unitCost, 0)
    : 0;
  const outQty = parseFloat(outputQuantity || "0") || 0;
  const unitCostResult = outQty > 0 ? totalCost / outQty : 0;

  const registerMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/production/runs", {
        date,
        recipeId,
        outputQuantity: outQty,
        notes: notes || null,
        lines: Object.entries(actuals).map(([recipeIngredientId, qty]) => ({
          recipeIngredientId,
          actualQuantity: parseFloat(qty || "0") || 0,
        })),
      });
      return res.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/production/formulas"] });
      queryClient.invalidateQueries({ queryKey: ["/api/production/runs"] });
      queryClient.invalidateQueries({ queryKey: ["/api/inventory/items"] });
      if (data.warnings?.length) {
        toast({
          title: "Producción registrada — con avisos de stock",
          description: data.warnings.map((w: any) => `${w.itemName}: faltaron ${(w.required - w.available).toFixed(2)}`).join(" · "),
        });
      } else {
        toast({ title: "Producción registrada" });
      }
      setRecipeId("");
      setOutputQuantity("");
      setActuals({});
      setNotes("");
    },
    onError: (error: any) => {
      toast({ title: "Error al registrar la producción", description: error.message, variant: "destructive" });
    },
  });

  if (isLoading) return <Loader2 className="h-6 w-6 animate-spin mx-auto my-8" />;

  if (formulas.length === 0) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center justify-center py-10 text-center">
          <Factory className="h-10 w-10 text-muted-foreground mb-3 opacity-40" />
          <h3 className="text-base font-semibold mb-1">Sin fórmulas de producción</h3>
          <p className="text-sm text-muted-foreground">
            Marcá una Elaboración Base como producible en la pestaña "Fórmulas" para empezar a registrar corridas.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-4">
        <div className="space-y-1">
          <Label>Fecha</Label>
          <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} data-testid="input-production-date" />
          <p className="text-xs text-muted-foreground">Se puede elegir cualquier día pasado para cargar con atraso.</p>
        </div>
        <div className="space-y-1 min-w-64">
          <Label>Fórmula</Label>
          <Select value={recipeId} onValueChange={pickFormula}>
            <SelectTrigger data-testid="select-production-formula"><SelectValue placeholder="Elegí una elaboración producible" /></SelectTrigger>
            <SelectContent>
              {formulas.map(f => (
                <SelectItem key={f.recipeId} value={f.recipeId}>
                  {f.name} → {f.outputItemName}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {formula && (
        <>
          <Card>
            <CardContent className="pt-4">
              <p className="text-sm text-muted-foreground mb-3">
                Cantidades prellenadas con la fórmula teórica — ajustalas a lo que realmente se usó hoy (la merma real casi nunca es igual a la teórica).
              </p>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Insumo</TableHead>
                    <TableHead className="text-right">Teórico (1x)</TableHead>
                    <TableHead className="text-right">Cantidad real usada</TableHead>
                    <TableHead>Unidad</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {formula.lines.map(line => (
                    <TableRow key={line.recipeIngredientId}>
                      <TableCell>{line.ingredientName}</TableCell>
                      <TableCell className="text-right text-muted-foreground">{line.grossQuantity.toFixed(3)}</TableCell>
                      <TableCell className="text-right">
                        <Input
                          type="number"
                          min="0"
                          step="0.001"
                          className="w-28 ml-auto text-right"
                          value={actuals[line.recipeIngredientId] ?? ""}
                          onChange={(e) => setActuals({ ...actuals, [line.recipeIngredientId]: e.target.value })}
                          data-testid={`input-production-actual-${line.recipeIngredientId}`}
                        />
                      </TableCell>
                      <TableCell>{line.unit}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          <div className="flex flex-wrap items-end gap-4">
            <div className="space-y-1">
              <Label>Cantidad real producida ({formula.outputUnit})</Label>
              <Input
                type="number"
                min="0"
                step="0.001"
                className="w-40"
                value={outputQuantity}
                onChange={(e) => setOutputQuantity(e.target.value)}
                data-testid="input-production-output-quantity"
              />
            </div>
            <div className="flex-1 min-w-48 space-y-1">
              <Label>Notas (opcional)</Label>
              <Textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={1}
                className="min-h-0 h-9 resize-none"
                data-testid="input-production-notes"
              />
            </div>
          </div>

          <Card className="bg-muted/30">
            <CardContent className="pt-4 flex flex-wrap gap-x-8 gap-y-1 text-sm">
              <div>Costo total consumido: <strong>{fmtMoney(totalCost)}</strong></div>
              <div>Costo unitario resultante: <strong>{fmtMoney(unitCostResult)}</strong> / {formula.outputUnit}</div>
              <div>Stock actual de {formula.outputItemName}: <strong>{formula.outputCurrentStock.toLocaleString("es-AR")} {formula.outputUnit}</strong></div>
            </CardContent>
          </Card>

          <Button
            onClick={() => registerMutation.mutate()}
            disabled={registerMutation.isPending || outQty <= 0}
            data-testid="button-register-production"
          >
            {registerMutation.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Save className="h-4 w-4 mr-2" />}
            Registrar producción
          </Button>
        </>
      )}
    </div>
  );
}

function FormulasTab() {
  const { toast } = useToast();
  const [linkRecipeId, setLinkRecipeId] = useState<string>("");
  const [linkMode, setLinkMode] = useState<"existing" | "new">("new");
  const [existingItemId, setExistingItemId] = useState<string>("");
  const [newItemName, setNewItemName] = useState("");
  const [newItemUnit, setNewItemUnit] = useState("unidad");

  const { data: formulas = [] } = useQuery<Formula[]>({ queryKey: ["/api/production/formulas"] });
  const { data: unlinked = [] } = useQuery<UnlinkedRecipe[]>({ queryKey: ["/api/production/formulas/unlinked"] });
  const { data: inventoryItems = [] } = useQuery<InventoryItemLite[]>({ queryKey: ["/api/inventory/items"] });

  const resetLinkForm = () => {
    setLinkRecipeId(""); setLinkMode("new"); setExistingItemId(""); setNewItemName(""); setNewItemUnit("unidad");
  };

  const linkExistingMutation = useMutation({
    mutationFn: async () => {
      await apiRequest("POST", `/api/production/formulas/${linkRecipeId}/link`, { outputInventoryItemId: existingItemId });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/production/formulas"] });
      queryClient.invalidateQueries({ queryKey: ["/api/production/formulas/unlinked"] });
      toast({ title: "Elaboración marcada como producible" });
      resetLinkForm();
    },
    onError: (error: any) => toast({ title: "Error", description: error.message, variant: "destructive" }),
  });

  const linkNewMutation = useMutation({
    mutationFn: async () => {
      await apiRequest("POST", `/api/production/formulas/${linkRecipeId}/link-new`, { name: newItemName, unit: newItemUnit });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/production/formulas"] });
      queryClient.invalidateQueries({ queryKey: ["/api/production/formulas/unlinked"] });
      queryClient.invalidateQueries({ queryKey: ["/api/inventory/items"] });
      toast({ title: "Artículo creado y elaboración marcada como producible" });
      resetLinkForm();
    },
    onError: (error: any) => toast({ title: "Error", description: error.message, variant: "destructive" }),
  });

  const unlinkMutation = useMutation({
    mutationFn: async (recipeId: string) => {
      await apiRequest("DELETE", `/api/production/formulas/${recipeId}/link`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/production/formulas"] });
      queryClient.invalidateQueries({ queryKey: ["/api/production/formulas/unlinked"] });
      toast({ title: "Elaboración desvinculada de Producción" });
    },
    onError: (error: any) => toast({ title: "Error", description: error.message, variant: "destructive" }),
  });

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader><CardTitle className="text-base">Marcar una Elaboración Base como producible</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          {unlinked.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No hay Elaboraciones Base sin vincular. Creá una nueva en la pestaña "Elaboraciones Base" primero.
            </p>
          ) : (
            <>
              <div className="space-y-1 max-w-sm">
                <Label className="text-xs">Elaboración Base</Label>
                <Select value={linkRecipeId} onValueChange={setLinkRecipeId}>
                  <SelectTrigger data-testid="select-link-recipe"><SelectValue placeholder="Elegí una elaboración" /></SelectTrigger>
                  <SelectContent>
                    {unlinked.map(r => (
                      <SelectItem key={r.recipeId} value={r.recipeId}>{r.name} (rinde {r.productionYield} {r.productionUnit})</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {linkRecipeId && (
                <>
                  <div className="flex rounded-md border p-1 w-fit">
                    <button type="button"
                      className={`px-3 py-1.5 rounded text-sm font-medium transition-colors ${linkMode === "new" ? "bg-background shadow" : "text-muted-foreground hover:text-foreground"}`}
                      onClick={() => setLinkMode("new")} data-testid="button-link-mode-new">
                      Crear artículo nuevo
                    </button>
                    <button type="button"
                      className={`px-3 py-1.5 rounded text-sm font-medium transition-colors ${linkMode === "existing" ? "bg-background shadow" : "text-muted-foreground hover:text-foreground"}`}
                      onClick={() => setLinkMode("existing")} data-testid="button-link-mode-existing">
                      Vincular artículo existente
                    </button>
                  </div>

                  {linkMode === "new" ? (
                    <div className="flex flex-wrap items-end gap-3">
                      <div className="space-y-1">
                        <Label className="text-xs">Nombre del artículo producido</Label>
                        <Input value={newItemName} onChange={(e) => setNewItemName(e.target.value)} placeholder="Ej: Bife de chorizo porcionado" data-testid="input-new-output-item-name" />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs">Unidad</Label>
                        <Select value={newItemUnit} onValueChange={setNewItemUnit}>
                          <SelectTrigger className="w-40" data-testid="select-new-output-item-unit"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            {Object.entries(UNIT_LABELS).map(([key, label]) => <SelectItem key={key} value={key}>{label}</SelectItem>)}
                          </SelectContent>
                        </Select>
                      </div>
                      <Button
                        onClick={() => linkNewMutation.mutate()}
                        disabled={linkNewMutation.isPending || !newItemName.trim()}
                        data-testid="button-confirm-link-new"
                      >
                        {linkNewMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                        <Link2 className="h-4 w-4 mr-1" /> Crear y vincular
                      </Button>
                    </div>
                  ) : (
                    <div className="flex flex-wrap items-end gap-3">
                      <div className="space-y-1 min-w-64">
                        <Label className="text-xs">Artículo de Inventario</Label>
                        <Select value={existingItemId} onValueChange={setExistingItemId}>
                          <SelectTrigger data-testid="select-existing-output-item"><SelectValue placeholder="Elegí un artículo" /></SelectTrigger>
                          <SelectContent>
                            {inventoryItems.filter(i => i.isActive !== "false").map(i => (
                              <SelectItem key={i.id} value={i.id}>{i.name} ({i.unit})</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <Button
                        onClick={() => linkExistingMutation.mutate()}
                        disabled={linkExistingMutation.isPending || !existingItemId}
                        data-testid="button-confirm-link-existing"
                      >
                        {linkExistingMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                        <Link2 className="h-4 w-4 mr-1" /> Vincular
                      </Button>
                    </div>
                  )}
                </>
              )}
            </>
          )}
        </CardContent>
      </Card>

      {formulas.length > 0 && (
        <div className="space-y-2">
          {formulas.map(f => (
            <Card key={f.recipeId}>
              <CardContent className="pt-4 pb-4 flex items-center justify-between flex-wrap gap-2">
                <div>
                  <div className="font-medium flex items-center gap-2">
                    <Factory className="h-4 w-4 text-amber-500" />
                    {f.name} → {f.outputItemName}
                  </div>
                  <div className="text-sm text-muted-foreground">
                    Stock actual: <strong>{f.outputCurrentStock.toLocaleString("es-AR")} {f.outputUnit}</strong>
                    {" · "}Costo actual: <strong>{fmtMoney(f.outputCostPrice)}</strong> / {f.outputUnit}
                  </div>
                </div>
                <Button
                  variant="ghost" size="sm"
                  onClick={() => unlinkMutation.mutate(f.recipeId)}
                  disabled={unlinkMutation.isPending}
                  data-testid={`button-unlink-${f.recipeId}`}
                >
                  <Unlink className="h-4 w-4 mr-1 text-destructive" /> Desvincular
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

function HistoryTab() {
  const { data: history = [], isLoading } = useQuery<HistoryRow[]>({ queryKey: ["/api/production/runs"] });

  if (isLoading) return <Loader2 className="h-6 w-6 animate-spin mx-auto my-8" />;
  if (history.length === 0) {
    return <p className="text-center text-muted-foreground py-8">Todavía no se registraron corridas de producción.</p>;
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Fecha</TableHead>
          <TableHead>Fórmula</TableHead>
          <TableHead>Producido</TableHead>
          <TableHead className="text-right">Cantidad</TableHead>
          <TableHead className="text-right">Costo/u</TableHead>
          <TableHead className="text-right">Costo total</TableHead>
          <TableHead>Registrado por</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {history.map(run => (
          <TableRow key={run.id} data-testid={`production-run-row-${run.id}`}>
            <TableCell>{run.date}</TableCell>
            <TableCell>{run.recipeName}</TableCell>
            <TableCell>{run.outputItemName}</TableCell>
            <TableCell className="text-right">{run.outputQuantity.toLocaleString("es-AR")} {run.outputUnit}</TableCell>
            <TableCell className="text-right">{fmtMoney(run.outputUnitCost)}</TableCell>
            <TableCell className="text-right">{fmtMoney(run.totalCost)}</TableCell>
            <TableCell>{run.registeredBy || "-"}</TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

export function ProductionTab() {
  return (
    <Tabs defaultValue="registrar">
      <TabsList>
        <TabsTrigger value="registrar" data-testid="tab-production-registrar">Registrar</TabsTrigger>
        <TabsTrigger value="formulas" data-testid="tab-production-formulas">Fórmulas</TabsTrigger>
        <TabsTrigger value="historial" data-testid="tab-production-historial">Historial</TabsTrigger>
      </TabsList>
      <TabsContent value="registrar" className="mt-4"><RegisterRunTab /></TabsContent>
      <TabsContent value="formulas" className="mt-4"><FormulasTab /></TabsContent>
      <TabsContent value="historial" className="mt-4"><HistoryTab /></TabsContent>
    </Tabs>
  );
}
