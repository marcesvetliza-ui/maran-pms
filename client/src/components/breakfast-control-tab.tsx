import { useEffect, useState } from "react";
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
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Plus, Trash2, Loader2, Printer, Save } from "lucide-react";

type ItemSourceType = "inventario" | "elaboracion";

type InventoryItemLite = { id: string; name: string; unit: string; costPrice: string; isActive: string | null };
type RecipeLite = { id: string; isBase?: boolean; name?: string | null; productionUnit?: string | null };

type CatalogItem = {
  id: string;
  itemSourceType: ItemSourceType;
  inventoryItemId: string | null;
  recipeId: string | null;
  name: string;
  unit: string;
  currentUnitCost: number;
  sortOrder: number;
  isActive: boolean;
};

type DayEntry = {
  id: string | null;
  catalogItemId: string | null;
  itemSourceType: ItemSourceType;
  inventoryItemId: string | null;
  recipeId: string | null;
  itemName: string;
  unit: string;
  unitCost: number;
  quantityOut: number;
  quantityRecovered: number;
};

type DayView = {
  date: string;
  pax: number;
  paxIsSuggested: boolean;
  notes: string | null;
  entries: DayEntry[];
};

type MonthDaySummary = { date: string; pax: number; totalCost: number; costPerPax: number };
type MonthArticleSummary = { itemName: string; unit: string; totalConsumedReal: number; totalCost: number };
type MonthSummary = { days: MonthDaySummary[]; articles: MonthArticleSummary[]; totalCost: number; totalPax: number };

function fmtMoney(n: number) {
  return `$${n.toLocaleString("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function SourcePicker({
  onPick,
}: {
  onPick: (choice: { itemSourceType: ItemSourceType; inventoryItemId: string | null; recipeId: string | null; name: string; unit: string; cost: number }) => void;
}) {
  const [sourceType, setSourceType] = useState<ItemSourceType>("elaboracion");
  const [search, setSearch] = useState("");

  const { data: recipes = [] } = useQuery<RecipeLite[]>({ queryKey: ["/api/restaurant/recipes"] });
  const { data: inventoryItems = [] } = useQuery<InventoryItemLite[]>({ queryKey: ["/api/inventory/items"] });

  const baseRecipes = recipes.filter(r => r.isBase && (r.name || "").toLowerCase().includes(search.toLowerCase()));
  const items = inventoryItems.filter(i => i.isActive !== "false" && i.name.toLowerCase().includes(search.toLowerCase()));

  return (
    <div className="space-y-3">
      <div className="flex rounded-md border p-1 w-fit">
        <button
          type="button"
          className={`px-3 py-1.5 rounded text-sm font-medium transition-colors ${sourceType === "elaboracion" ? "bg-background shadow" : "text-muted-foreground hover:text-foreground"}`}
          onClick={() => setSourceType("elaboracion")}
          data-testid="button-source-elaboracion"
        >
          Elaboración Base
        </button>
        <button
          type="button"
          className={`px-3 py-1.5 rounded text-sm font-medium transition-colors ${sourceType === "inventario" ? "bg-background shadow" : "text-muted-foreground hover:text-foreground"}`}
          onClick={() => setSourceType("inventario")}
          data-testid="button-source-inventario"
        >
          Artículo de Inventario
        </button>
      </div>
      <Input
        placeholder="Buscar..."
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        data-testid="input-source-search"
      />
      <div className="max-h-64 overflow-y-auto rounded-md border divide-y">
        {sourceType === "elaboracion"
          ? baseRecipes.map(r => (
              <button
                key={r.id}
                type="button"
                className="w-full text-left px-3 py-2 text-sm hover:bg-muted"
                onClick={() => onPick({ itemSourceType: "elaboracion", inventoryItemId: null, recipeId: r.id, name: r.name || "Elaboración", unit: r.productionUnit || "kg", cost: 0 })}
                data-testid={`option-recipe-${r.id}`}
              >
                {r.name}
              </button>
            ))
          : items.map(i => (
              <button
                key={i.id}
                type="button"
                className="w-full text-left px-3 py-2 text-sm hover:bg-muted"
                onClick={() => onPick({ itemSourceType: "inventario", inventoryItemId: i.id, recipeId: null, name: i.name, unit: i.unit, cost: parseFloat(i.costPrice || "0") })}
                data-testid={`option-item-${i.id}`}
              >
                {i.name}
              </button>
            ))}
        {((sourceType === "elaboracion" && baseRecipes.length === 0) || (sourceType === "inventario" && items.length === 0)) && (
          <p className="px-3 py-4 text-sm text-muted-foreground text-center">Sin resultados</p>
        )}
      </div>
    </div>
  );
}

function CatalogTab() {
  const { toast } = useToast();
  const [isAddOpen, setIsAddOpen] = useState(false);

  const { data: catalog = [], isLoading } = useQuery<CatalogItem[]>({ queryKey: ["/api/breakfast/catalog"] });

  const addMutation = useMutation({
    mutationFn: async (data: { itemSourceType: ItemSourceType; inventoryItemId: string | null; recipeId: string | null }) => {
      const res = await apiRequest("POST", "/api/breakfast/catalog", data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/breakfast/catalog"] });
      setIsAddOpen(false);
      toast({ title: "Artículo agregado al catálogo" });
    },
    onError: (e: any) => toast({ title: e?.message || "Error al agregar el artículo", variant: "destructive" }),
  });

  const toggleActiveMutation = useMutation({
    mutationFn: async ({ id, isActive }: { id: string; isActive: boolean }) => {
      await apiRequest("PATCH", `/api/breakfast/catalog/${id}`, { isActive: isActive ? "true" : "false" });
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/breakfast/catalog"] }),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      await apiRequest("DELETE", `/api/breakfast/catalog/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/breakfast/catalog"] });
      toast({ title: "Artículo quitado del catálogo" });
    },
    onError: () => toast({ title: "No se puede quitar — ya tiene cargas registradas", variant: "destructive" }),
  });

  if (isLoading) return <Loader2 className="h-6 w-6 animate-spin mx-auto my-8" />;

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button onClick={() => setIsAddOpen(true)} data-testid="button-add-catalog-item">
          <Plus className="h-4 w-4 mr-2" />
          Agregar al catálogo
        </Button>
      </div>
      <Card>
        <CardContent className="pt-4">
          {catalog.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-8">
              Todavía no hay artículos en el catálogo de desayuno. Agregá los que salen habitualmente al buffet.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Artículo</TableHead>
                  <TableHead>Tipo</TableHead>
                  <TableHead className="text-right">Costo vigente</TableHead>
                  <TableHead className="text-right">Acciones</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {catalog.map(c => (
                  <TableRow key={c.id} data-testid={`row-catalog-${c.id}`}>
                    <TableCell className="font-medium">{c.name}</TableCell>
                    <TableCell>
                      <Badge variant="outline">{c.itemSourceType === "elaboracion" ? "Elaboración" : "Inventario"}</Badge>
                    </TableCell>
                    <TableCell className="text-right">{fmtMoney(c.currentUnitCost)} / {c.unit}</TableCell>
                    <TableCell className="text-right space-x-1">
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => toggleActiveMutation.mutate({ id: c.id, isActive: !c.isActive })}
                        data-testid={`button-toggle-catalog-${c.id}`}
                      >
                        {c.isActive ? "Desactivar" : "Activar"}
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => deleteMutation.mutate(c.id)}
                        data-testid={`button-delete-catalog-${c.id}`}
                      >
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Dialog open={isAddOpen} onOpenChange={setIsAddOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Agregar al catálogo de Desayuno</DialogTitle>
          </DialogHeader>
          <SourcePicker
            onPick={(choice) => addMutation.mutate({
              itemSourceType: choice.itemSourceType,
              inventoryItemId: choice.inventoryItemId,
              recipeId: choice.recipeId,
            })}
          />
        </DialogContent>
      </Dialog>
    </div>
  );
}

function DailyEntryTab() {
  const { toast } = useToast();
  const [date, setDate] = useState(getArgentinaToday());
  const [pax, setPax] = useState("0");
  const [notes, setNotes] = useState("");
  const [rows, setRows] = useState<DayEntry[]>([]);
  const [isAddNoveltyOpen, setIsAddNoveltyOpen] = useState(false);

  const { data: day, isLoading } = useQuery<DayView>({
    queryKey: ["/api/breakfast/days", date],
  });

  useEffect(() => {
    if (day) {
      setPax(String(day.pax));
      setNotes(day.notes || "");
      setRows(day.entries);
    }
  }, [day]);

  const saveMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("PUT", `/api/breakfast/days/${date}`, {
        pax: Number(pax) || 0,
        notes: notes || null,
        entries: rows.map(r => ({
          catalogItemId: r.catalogItemId,
          itemSourceType: r.itemSourceType,
          inventoryItemId: r.inventoryItemId,
          recipeId: r.recipeId,
          quantityOut: r.quantityOut,
          quantityRecovered: r.quantityRecovered,
        })),
      });
      return res.json();
    },
    onSuccess: (updated: DayView) => {
      setRows(updated.entries);
      queryClient.invalidateQueries({ queryKey: ["/api/breakfast/days", date] });
      queryClient.invalidateQueries({ queryKey: ["/api/breakfast/month"] });
      toast({ title: "Día guardado" });
    },
    onError: (e: any) => toast({ title: e?.message || "Error al guardar", variant: "destructive" }),
  });

  const deleteEntryMutation = useMutation({
    mutationFn: async (id: string) => {
      await apiRequest("DELETE", `/api/breakfast/entries/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/breakfast/days", date] });
      toast({ title: "Fila eliminada" });
    },
  });

  const updateRow = (index: number, patch: Partial<DayEntry>) => {
    setRows(prev => prev.map((r, i) => i === index ? { ...r, ...patch } : r));
  };

  const removeLocalRow = (index: number) => {
    const row = rows[index];
    if (row.id) {
      deleteEntryMutation.mutate(row.id);
    }
    setRows(prev => prev.filter((_, i) => i !== index));
  };

  const paxNum = Number(pax) || 0;
  const totals = rows.reduce((acc, r) => {
    const consumoReal = r.quantityOut - r.quantityRecovered;
    const costo = consumoReal * r.unitCost;
    return { consumoReal: acc.consumoReal, costo: acc.costo + costo };
  }, { consumoReal: 0, costo: 0 });

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-4">
        <div className="space-y-1">
          <Label>Fecha</Label>
          <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} data-testid="input-breakfast-date" />
          <p className="text-xs text-muted-foreground">Se puede elegir cualquier día pasado para cargar con atraso.</p>
        </div>
        <div className="space-y-1">
          <Label>N° Pax</Label>
          <Input
            type="number"
            min={0}
            value={pax}
            onChange={(e) => setPax(e.target.value)}
            className="w-28"
            data-testid="input-breakfast-pax"
          />
          {day?.paxIsSuggested && <p className="text-xs text-muted-foreground">Sugerido por ocupación — editable</p>}
        </div>
        <div className="flex-1 min-w-48 space-y-1">
          <Label>Notas (opcional)</Label>
          <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={1} data-testid="input-breakfast-notes" />
        </div>
      </div>

      {isLoading ? (
        <Loader2 className="h-6 w-6 animate-spin mx-auto my-8" />
      ) : (
        <>
          <div className="flex justify-end">
            <Button variant="outline" onClick={() => setIsAddNoveltyOpen(true)} data-testid="button-add-novelty">
              <Plus className="h-4 w-4 mr-2" />
              Agregar artículo novedad
            </Button>
          </div>
          <Card>
            <CardContent className="pt-4 overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Artículo</TableHead>
                    <TableHead className="text-right">Costo</TableHead>
                    <TableHead className="text-right">Salida</TableHead>
                    <TableHead className="text-right">Recupero</TableHead>
                    <TableHead className="text-right">Cons. Real</TableHead>
                    <TableHead className="text-right">Costo</TableHead>
                    <TableHead className="text-right">Cons./pax</TableHead>
                    <TableHead className="text-right">Costo/pax</TableHead>
                    <TableHead></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((r, i) => {
                    const consumoReal = r.quantityOut - r.quantityRecovered;
                    const costo = consumoReal * r.unitCost;
                    const consumoPorPax = paxNum > 0 ? consumoReal / paxNum : 0;
                    const costoPorPax = paxNum > 0 ? costo / paxNum : 0;
                    return (
                      <TableRow key={r.catalogItemId ?? r.id ?? i} data-testid={`row-breakfast-entry-${i}`}>
                        <TableCell className="font-medium">
                          {r.itemName}
                          {!r.catalogItemId && <Badge variant="secondary" className="ml-2 text-[10px]">novedad</Badge>}
                        </TableCell>
                        <TableCell className="text-right text-muted-foreground">{fmtMoney(r.unitCost)}</TableCell>
                        <TableCell className="text-right">
                          <Input
                            type="number" min={0} step="0.001"
                            value={r.quantityOut}
                            onChange={(e) => updateRow(i, { quantityOut: parseFloat(e.target.value) || 0 })}
                            className="w-24 text-right ml-auto"
                            data-testid={`input-quantity-out-${i}`}
                          />
                        </TableCell>
                        <TableCell className="text-right">
                          <Input
                            type="number" min={0} step="0.001"
                            value={r.quantityRecovered}
                            onChange={(e) => updateRow(i, { quantityRecovered: parseFloat(e.target.value) || 0 })}
                            className="w-24 text-right ml-auto"
                            data-testid={`input-quantity-recovered-${i}`}
                          />
                        </TableCell>
                        <TableCell className="text-right">{consumoReal.toFixed(3)}</TableCell>
                        <TableCell className="text-right font-medium">{fmtMoney(costo)}</TableCell>
                        <TableCell className="text-right text-muted-foreground">{consumoPorPax.toFixed(4)}</TableCell>
                        <TableCell className="text-right text-muted-foreground">{fmtMoney(costoPorPax)}</TableCell>
                        <TableCell>
                          {!r.catalogItemId && (
                            <Button size="icon" variant="ghost" onClick={() => removeLocalRow(i)} data-testid={`button-remove-row-${i}`}>
                              <Trash2 className="h-4 w-4 text-destructive" />
                            </Button>
                          )}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
              <div className="flex justify-end gap-8 mt-4 pt-4 border-t text-sm">
                <div><span className="text-muted-foreground">Costo Total: </span><span className="font-bold">{fmtMoney(totals.costo)}</span></div>
                <div><span className="text-muted-foreground">Costo Total/Pax: </span><span className="font-bold">{fmtMoney(paxNum > 0 ? totals.costo / paxNum : 0)}</span></div>
              </div>
            </CardContent>
          </Card>
          <div className="flex justify-end">
            <Button onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending} data-testid="button-save-breakfast-day">
              {saveMutation.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Save className="h-4 w-4 mr-2" />}
              Guardar día
            </Button>
          </div>
        </>
      )}

      <Dialog open={isAddNoveltyOpen} onOpenChange={setIsAddNoveltyOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Agregar artículo novedad (solo para este día)</DialogTitle>
          </DialogHeader>
          <SourcePicker
            onPick={(choice) => {
              setRows(prev => [...prev, {
                id: null,
                catalogItemId: null,
                itemSourceType: choice.itemSourceType,
                inventoryItemId: choice.inventoryItemId,
                recipeId: choice.recipeId,
                itemName: choice.name,
                unit: choice.unit,
                unitCost: choice.cost,
                quantityOut: 0,
                quantityRecovered: 0,
              }]);
              setIsAddNoveltyOpen(false);
            }}
          />
        </DialogContent>
      </Dialog>
    </div>
  );
}

function MonthlyTab() {
  const today = new Date();
  const [year, setYear] = useState(today.getFullYear());
  const [month, setMonth] = useState(today.getMonth() + 1);

  const { data: summary, isLoading } = useQuery<MonthSummary>({
    queryKey: ["/api/breakfast/month", year, month],
  });

  const monthNames = ["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3 print:hidden">
        <div className="flex items-end gap-3">
          <div className="space-y-1">
            <Label>Mes</Label>
            <Select value={String(month)} onValueChange={(v) => setMonth(Number(v))}>
              <SelectTrigger className="w-40" data-testid="select-breakfast-month"><SelectValue /></SelectTrigger>
              <SelectContent>
                {monthNames.map((m, idx) => <SelectItem key={idx} value={String(idx + 1)}>{m}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label>Año</Label>
            <Input type="number" value={year} onChange={(e) => setYear(Number(e.target.value))} className="w-24" data-testid="input-breakfast-year" />
          </div>
        </div>
        <Button variant="outline" onClick={() => window.print()} data-testid="button-print-breakfast-month">
          <Printer className="h-4 w-4 mr-2" />
          Imprimir
        </Button>
      </div>

      {isLoading ? (
        <Loader2 className="h-6 w-6 animate-spin mx-auto my-8" />
      ) : !summary ? null : (
        <>
          <div className="grid grid-cols-2 gap-3">
            <Card><CardContent className="p-4"><p className="text-xs text-muted-foreground">Costo total del mes</p><p className="text-xl font-bold">{fmtMoney(summary.totalCost)}</p></CardContent></Card>
            <Card><CardContent className="p-4"><p className="text-xs text-muted-foreground">Pax totales del mes</p><p className="text-xl font-bold">{summary.totalPax}</p></CardContent></Card>
          </div>

          <Card>
            <CardHeader><CardTitle className="text-base">Por día</CardTitle></CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Fecha</TableHead>
                    <TableHead className="text-right">Pax</TableHead>
                    <TableHead className="text-right">Costo Total</TableHead>
                    <TableHead className="text-right">Costo/Pax</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {summary.days.length === 0 ? (
                    <TableRow><TableCell colSpan={4} className="text-center text-muted-foreground py-6">Sin días cargados en este mes</TableCell></TableRow>
                  ) : summary.days.map(d => (
                    <TableRow key={d.date} data-testid={`row-month-day-${d.date}`}>
                      <TableCell>{d.date}</TableCell>
                      <TableCell className="text-right">{d.pax}</TableCell>
                      <TableCell className="text-right">{fmtMoney(d.totalCost)}</TableCell>
                      <TableCell className="text-right">{fmtMoney(d.costPerPax)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle className="text-base">Por artículo</CardTitle></CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Artículo</TableHead>
                    <TableHead className="text-right">Consumo Real</TableHead>
                    <TableHead className="text-right">Costo Total</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {summary.articles.length === 0 ? (
                    <TableRow><TableCell colSpan={3} className="text-center text-muted-foreground py-6">Sin consumos en este mes</TableCell></TableRow>
                  ) : summary.articles.map(a => (
                    <TableRow key={a.itemName} data-testid={`row-month-article-${a.itemName}`}>
                      <TableCell>{a.itemName}</TableCell>
                      <TableCell className="text-right">{a.totalConsumedReal.toFixed(3)} {a.unit}</TableCell>
                      <TableCell className="text-right">{fmtMoney(a.totalCost)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}

export function BreakfastControlTab() {
  const [subTab, setSubTab] = useState("carga");

  return (
    <Tabs value={subTab} onValueChange={setSubTab}>
      <TabsList>
        <TabsTrigger value="carga" data-testid="subtab-carga-diaria">Carga diaria</TabsTrigger>
        <TabsTrigger value="catalogo" data-testid="subtab-catalogo">Catálogo</TabsTrigger>
        <TabsTrigger value="mensual" data-testid="subtab-mensual">Resumen mensual</TabsTrigger>
      </TabsList>
      <TabsContent value="carga" className="mt-4"><DailyEntryTab /></TabsContent>
      <TabsContent value="catalogo" className="mt-4"><CatalogTab /></TabsContent>
      <TabsContent value="mensual" className="mt-4"><MonthlyTab /></TabsContent>
    </Tabs>
  );
}
