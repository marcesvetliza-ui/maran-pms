import { formatDisplayDate } from "@shared/date-display";
import {ProductionStock} from "./production-stock";
import {ProductionPreparationEditor} from "./production-preparation-editor";
import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { getArgentinaToday } from "@/lib/date-utils";
import { InventoryButton as Button, useInventoryPermission } from "./inventory-access";
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

function fmtMoney(n: number | null) {
  if(n == null) return "—";
  return `$${n.toLocaleString("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function RegisterRunTab() {
  const canCost = useInventoryPermission("cost");
  const { toast } = useToast();
  const [date, setDate] = useState(getArgentinaToday());
  const [recipeId, setRecipeId] = useState<string>("");
  const [outputQuantity, setOutputQuantity] = useState<string>("");
  const [plannedBatches,setPlannedBatches]=useState("1");
  const [actuals, setActuals] = useState<Record<string, string>>({});
  const [notes, setNotes] = useState("");
  const [requestId,setRequestId]=useState(()=>crypto.randomUUID());
  const [outputWarehouseId,setOutputWarehouseId]=useState("");
  const [inputWarehouses,setInputWarehouses]=useState<Record<string,string>>({});
  const {data: warehouses=[]}=useQuery<Array<{id:string;name:string;isActive:string}>>({queryKey:["/api/inventory/warehouses"]});

  const { data: formulas = [], isLoading } = useQuery<Formula[]>({ queryKey: ["/api/production/formulas"] });
  const formula = formulas.find(f => f.recipeId === recipeId) || null;

  const pickFormula = (id: string) => {
    setRecipeId(id);
    setPlannedBatches("1");
    setRequestId(crypto.randomUUID());
    const f = formulas.find(x => x.recipeId === id);
    if (!f) return;
    setOutputQuantity(f.productionYield > 0 && f.productionUnit===f.outputUnit ? String(f.productionYield) : "");
    setInputWarehouses({});
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
        outputWarehouseId,
        requestId,
        notes: notes || null,
        lines: Object.entries(actuals).map(([recipeIngredientId, qty]) => ({
          recipeIngredientId,
          warehouseId:inputWarehouses[recipeIngredientId],
          actualQuantity: parseFloat(qty || "0") || 0,
        })),
      });
      return res.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/production/formulas"] });
      queryClient.invalidateQueries({ queryKey: ["/api/production/runs"] });
      queryClient.invalidateQueries({queryKey:["/api/production/pending"]});
      queryClient.invalidateQueries({queryKey:["/api/inventory/locations"]});
      queryClient.invalidateQueries({queryKey:["/api/inventory/warehouses-summary"]});
      queryClient.invalidateQueries({ queryKey: ["/api/inventory/items"] });
      if(data.status==='pending'){
        toast({title:"Producción guardada pendiente de stock",description:data.error});
      } else if (data.warnings?.length) {
        toast({
          title: "Producción registrada — con avisos de stock",
          description: data.warnings.map((w: any) => `${w.itemName}: faltaron ${(w.required - w.available).toFixed(2)}`).join(" · "),
        });
      } else {
        toast({ title: "Producción registrada" });
      }
      setRequestId(crypto.randomUUID());
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
            Creá una preparación con sus ingredientes en la pestaña "Preparaciones" para empezar.
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
          <Label>Preparación</Label>
          <Select value={recipeId} onValueChange={pickFormula}>
            <SelectTrigger data-testid="select-production-formula"><SelectValue placeholder="Elegí una preparación" /></SelectTrigger>
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
          <div className="max-w-xs space-y-2"><Label>Recetas planificadas</Label><Input aria-label="Recetas planificadas" type="number" min="0.001" step="0.001" value={plannedBatches} onChange={e=>{setPlannedBatches(e.target.value);const batches=Number(e.target.value);if(batches>0){setActuals(Object.fromEntries(formula.lines.map(l=>[l.recipeIngredientId,String(Math.round(l.grossQuantity*batches*1000)/1000)])));if(formula.productionUnit===formula.outputUnit)setOutputQuantity(String(Math.round(formula.productionYield*batches*1000)/1000));}}}/><p className="text-xs text-muted-foreground">Escala los insumos sugeridos. Después ajustá lo usado y lo obtenido realmente.</p></div>
          <Card>
            <CardContent className="pt-4">
              <p className="text-sm text-muted-foreground mb-3">
                Cantidades prellenadas con la fórmula teórica — ajustalas a lo que realmente se usó hoy (la merma real casi nunca es igual a la teórica).
              </p>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Insumo</TableHead>
                    <TableHead className="text-right">Teórico por receta</TableHead>
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

          <div className="space-y-2 border rounded p-3">
            <Label>Depósito de destino de lo producido *</Label>
            <Select value={outputWarehouseId || "__choose__"} onValueChange={v=>setOutputWarehouseId(v==="__choose__"?"":v)}><SelectTrigger><SelectValue/></SelectTrigger><SelectContent><SelectItem value="__choose__">Elegir depósito</SelectItem>{warehouses.filter(w=>w.isActive==="true").map(w=><SelectItem key={w.id} value={w.id}>{w.name}</SelectItem>)}</SelectContent></Select>
            {formula.lines.map(line=><div key={line.recipeIngredientId}><Label>Origen de {line.ingredientName} *</Label><Select value={inputWarehouses[line.recipeIngredientId] || "__choose__"} onValueChange={v=>setInputWarehouses({...inputWarehouses,[line.recipeIngredientId]:v==="__choose__"?"":v})}><SelectTrigger><SelectValue/></SelectTrigger><SelectContent><SelectItem value="__choose__">Elegir depósito</SelectItem>{warehouses.filter(w=>w.isActive==="true").map(w=><SelectItem key={w.id} value={w.id}>{w.name}</SelectItem>)}</SelectContent></Select></div>)}
          </div>
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

          <p className="text-xs text-muted-foreground">Al guardar se calculará el costo con las cantidades convertidas y los costos vigentes del stock consumido.</p>
          <Card className="bg-muted/30">
            <CardContent className="pt-4 flex flex-wrap gap-x-8 gap-y-1 text-sm">
              <div>Costo total estimado: <strong>{fmtMoney(canCost ? totalCost : null)}</strong></div>
              <div>Costo unitario estimado: <strong>{fmtMoney(canCost ? unitCostResult : null)}</strong> / {formula.outputUnit}</div>
              <div>Stock actual de {formula.outputItemName}: <strong>{formula.outputCurrentStock.toLocaleString("es-AR")} {formula.outputUnit}</strong></div>
            </CardContent>
          </Card>

          <Button permission="operate"
            onClick={() => registerMutation.mutate()}
            disabled={registerMutation.isPending || outQty <= 0 || !outputWarehouseId || formula.lines.some(line=>!inputWarehouses[line.recipeIngredientId])}
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
            <TableCell>{formatDisplayDate(run.date)}</TableCell>
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
 const [tab,setTab]=useState('stock');
 const {data:formulas=[],isLoading,isError}=useQuery<Formula[]>({queryKey:['/api/production/formulas']});
 return <Tabs value={tab} onValueChange={setTab}><TabsList className="flex h-auto flex-wrap justify-start"><TabsTrigger value="stock">Stock de preparaciones</TabsTrigger><TabsTrigger value="formulas" data-testid="tab-production-formulas">Preparaciones</TabsTrigger><TabsTrigger value="registrar" data-testid="tab-production-registrar">Registrar producción</TabsTrigger><TabsTrigger value="historial" data-testid="tab-production-historial">Historial</TabsTrigger></TabsList>
 <TabsContent value="stock" className="mt-4">{isError?<p role="alert">No se pudieron consultar las preparaciones.</p>:isLoading?<p>Cargando preparaciones…</p>:<ProductionStock formulas={formulas} onProduce={()=>setTab('registrar')}/>}</TabsContent>
 <TabsContent value="formulas" className="mt-4 space-y-4"><div className="flex flex-wrap items-center justify-between gap-3"><div><h3 className="font-semibold">Preparaciones con stock</h3><p className="text-sm text-muted-foreground">Creá la fórmula y registrá después cada producción real.</p></div><ProductionPreparationEditor formulas={formulas}/></div>{formulas.map(f=><Card key={f.recipeId}><CardContent className="flex flex-wrap items-center justify-between gap-3 p-4"><div><h4 className="font-medium">{f.name}</h4><p className="text-sm text-muted-foreground">Rendimiento: {f.productionYield} {f.productionUnit} · {f.lines.length} ingredientes</p></div><ProductionPreparationEditor formula={f} formulas={formulas}/></CardContent></Card>)}</TabsContent>
 <TabsContent value="registrar" className="mt-4"><RegisterRunTab/></TabsContent><TabsContent value="historial" className="mt-4"><HistoryTab/></TabsContent></Tabs>;
}
