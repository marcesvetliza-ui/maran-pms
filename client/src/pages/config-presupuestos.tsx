import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import {
  ClipboardList, Plus, Pencil, Trash2, Save, ChevronDown, ChevronUp,
  Building2, Calendar, Flower2, UtensilsCrossed, Users, RotateCcw,
  Eye, EyeOff,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel,
  AlertDialogContent, AlertDialogDescription, AlertDialogFooter,
  AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { queryClient, apiRequest } from "@/lib/queryClient";
import type { QuoteCatalogItem } from "@shared/schema";

// ─── Types ────────────────────────────────────────────────────────────────────
type AreaOrigen = "grupos" | "recepcion" | "eventos" | "spa" | "restaurant";

const AREA_TABS: { value: AreaOrigen; label: string; icon: typeof Building2; hasCatalog: boolean }[] = [
  { value: "grupos",     label: "Grupos",           icon: Users,           hasCatalog: false },
  { value: "recepcion",  label: "Recepción",        icon: Building2,       hasCatalog: false },
  { value: "eventos",    label: "Eventos",          icon: Calendar,        hasCatalog: true  },
  { value: "spa",        label: "SPA",              icon: Flower2,         hasCatalog: true  },
  { value: "restaurant", label: "Restaurant Justo", icon: UtensilsCrossed, hasCatalog: true  },
];

const CATEGORY_OPTIONS: Record<AreaOrigen, { value: string; label: string }[]> = {
  grupos: [],
  recepcion: [],
  eventos: [
    { value: "salon",        label: "Salones" },
    { value: "coffee_break", label: "Coffee Breaks" },
    { value: "coctel",       label: "Cócteles" },
    { value: "equipamiento", label: "Equipamiento Técnico" },
    { value: "menu",         label: "Menú" },
    { value: "otro",         label: "Otros" },
  ],
  spa: [
    { value: "tratamiento",  label: "Tratamientos" },
    { value: "masaje",       label: "Masajes" },
    { value: "paquete",      label: "Paquetes" },
    { value: "otro",         label: "Otros" },
  ],
  restaurant: [
    { value: "entrada",    label: "Entradas" },
    { value: "principal",  label: "Platos Principales" },
    { value: "postre",     label: "Postres" },
    { value: "menu",       label: "Menú Completo" },
    { value: "paquete",    label: "Paquetes" },
    { value: "otro",       label: "Otros" },
  ],
};

const UNIT_OPTIONS = [
  "por persona", "por día", "servicio", "por hora", "por mesa", "por unidad",
];

const fmt = (v: any) => {
  const n = parseFloat(String(v ?? 0));
  if (n === 0) return "—";
  return n.toLocaleString("es-AR", { minimumFractionDigits: 0, maximumFractionDigits: 0 });
};

// ─── Conditions Editor ────────────────────────────────────────────────────────
function ConditionsEditor({ area }: { area: AreaOrigen }) {
  const { toast } = useToast();
  const [localContent, setLocalContent] = useState<string | null>(null);

  const { data, isLoading } = useQuery<{ area: string; content: string }>({
    queryKey: ["/api/quote-conditions", area],
    queryFn: async () => {
      const res = await fetch(`/api/quote-conditions/${area}`, { credentials: "include" });
      return res.json();
    },
  });

  const content = localContent !== null ? localContent : (data?.content || "");

  const saveMutation = useMutation({
    mutationFn: () => apiRequest("PATCH", `/api/quote-conditions/${area}`, { content }).then(r => r.json()),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/quote-conditions", area] });
      setLocalContent(null);
      toast({ title: "Condiciones guardadas" });
    },
    onError: () => toast({ title: "Error al guardar", variant: "destructive" }),
  });

  if (isLoading) return <Skeleton className="h-40 w-full" />;

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-medium">Condiciones y términos por defecto</p>
          <p className="text-xs text-muted-foreground mt-0.5">
            Estas condiciones se pre-cargan al crear un nuevo presupuesto de esta área. Se pueden editar por presupuesto.
          </p>
        </div>
        {localContent !== null && (
          <Badge variant="outline" className="text-orange-600 border-orange-300">Sin guardar</Badge>
        )}
      </div>
      <Textarea
        value={content}
        onChange={e => setLocalContent(e.target.value)}
        rows={12}
        className="text-sm font-mono"
        placeholder="Escribí las condiciones de contratación para esta área..."
        data-testid={`textarea-conditions-${area}`}
      />
      <div className="flex items-center gap-2">
        <Button
          onClick={() => saveMutation.mutate()}
          disabled={saveMutation.isPending || localContent === null}
          data-testid={`button-save-conditions-${area}`}
        >
          <Save className="h-4 w-4 mr-1" />
          {saveMutation.isPending ? "Guardando..." : "Guardar condiciones"}
        </Button>
        {localContent !== null && (
          <Button variant="ghost" size="sm" onClick={() => setLocalContent(null)}>
            <RotateCcw className="h-3.5 w-3.5 mr-1" /> Descartar
          </Button>
        )}
      </div>
    </div>
  );
}

// ─── Catalog Item Dialog ──────────────────────────────────────────────────────
function CatalogItemDialog({ open, onOpenChange, item, area, onSaved }: {
  open: boolean; onOpenChange: (v: boolean) => void;
  item: QuoteCatalogItem | null; area: AreaOrigen; onSaved: () => void;
}) {
  const { toast } = useToast();
  const isEdit = !!item;
  const [name, setName] = useState(item?.name || "");
  const [description, setDescription] = useState(item?.description || "");
  const [category, setCategory] = useState(item?.category || (CATEGORY_OPTIONS[area][0]?.value || "otro"));
  const [price, setPrice] = useState(item?.price || "0");
  const [priceSpecial, setPriceSpecial] = useState(item?.priceSpecial || "");
  const [unit, setUnit] = useState(item?.unit || "por persona");
  const [isActive, setIsActive] = useState(item?.isActive ?? true);
  const [sortOrder, setSortOrder] = useState(String(item?.sortOrder ?? 0));

  const saveMutation = useMutation({
    mutationFn: (payload: any) =>
      isEdit
        ? apiRequest("PATCH", `/api/quote-catalog/${item!.id}`, payload).then(r => r.json())
        : apiRequest("POST", "/api/quote-catalog", payload).then(r => r.json()),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/quote-catalog", area] });
      toast({ title: isEdit ? "Ítem actualizado" : "Ítem creado" });
      onSaved();
      onOpenChange(false);
    },
    onError: () => toast({ title: "Error al guardar", variant: "destructive" }),
  });

  const payload = {
    area,
    category,
    name: name.trim(),
    description: description.trim() || null,
    price: price || "0",
    priceSpecial: priceSpecial ? priceSpecial : null,
    unit,
    isActive,
    sortOrder: parseInt(sortOrder) || 0,
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Editar ítem" : "Nuevo ítem del catálogo"}</DialogTitle>
          <DialogDescription>
            Catálogo de {AREA_TABS.find(a => a.value === area)?.label}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2">
              <Label>Nombre *</Label>
              <Input value={name} onChange={e => setName(e.target.value)} placeholder="Ej: Opción 1, Salón Mitre..." className="mt-1" data-testid="input-catalog-name" />
            </div>
            <div>
              <Label>Categoría</Label>
              <Select value={category} onValueChange={setCategory}>
                <SelectTrigger className="mt-1" data-testid="select-catalog-category">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CATEGORY_OPTIONS[area].map(c => (
                    <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>
                  ))}
                  <SelectItem value="otro">Otros</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Unidad</Label>
              <Select value={unit} onValueChange={setUnit}>
                <SelectTrigger className="mt-1" data-testid="select-catalog-unit">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {UNIT_OPTIONS.map(u => (
                    <SelectItem key={u} value={u}>{u}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Precio base</Label>
              <div className="relative mt-1">
                <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">$</span>
                <Input value={price} onChange={e => setPrice(e.target.value)} className="pl-6" placeholder="0" data-testid="input-catalog-price" />
              </div>
            </div>
            <div>
              <Label>Precio especial <span className="text-xs text-muted-foreground">(opcional)</span></Label>
              <div className="relative mt-1">
                <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">$</span>
                <Input value={priceSpecial} onChange={e => setPriceSpecial(e.target.value)} className="pl-6" placeholder="—" data-testid="input-catalog-price-special" />
              </div>
            </div>
            <div className="col-span-2">
              <Label>Descripción / Detalle</Label>
              <Textarea value={description} onChange={e => setDescription(e.target.value)} rows={3} placeholder="Describa los ítems incluidos, capacidad, condiciones..." className="mt-1 text-sm" data-testid="textarea-catalog-desc" />
            </div>
            <div>
              <Label>Orden <span className="text-xs text-muted-foreground">(menor = primero)</span></Label>
              <Input type="number" value={sortOrder} onChange={e => setSortOrder(e.target.value)} className="mt-1" data-testid="input-catalog-order" />
            </div>
            <div className="flex items-end gap-2">
              <Button
                type="button"
                variant={isActive ? "default" : "outline"}
                onClick={() => setIsActive(!isActive)}
                className="mt-1 flex-1"
                data-testid="button-catalog-active"
              >
                {isActive ? <Eye className="h-4 w-4 mr-1" /> : <EyeOff className="h-4 w-4 mr-1" />}
                {isActive ? "Activo" : "Inactivo"}
              </Button>
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={() => saveMutation.mutate(payload)} disabled={!name.trim() || saveMutation.isPending} data-testid="button-save-catalog-item">
            {saveMutation.isPending ? "Guardando..." : isEdit ? "Guardar cambios" : "Crear ítem"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Catalog Editor ───────────────────────────────────────────────────────────
function CatalogEditor({ area }: { area: AreaOrigen }) {
  const { toast } = useToast();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<QuoteCatalogItem | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(new Set());

  const { data: items = [], isLoading } = useQuery<QuoteCatalogItem[]>({
    queryKey: ["/api/quote-catalog", area],
    queryFn: async () => {
      const res = await fetch(`/api/quote-catalog?area=${area}`, { credentials: "include" });
      return res.json();
    },
  });

  const toggleActiveMutation = useMutation({
    mutationFn: ({ id, isActive }: { id: string; isActive: boolean }) =>
      apiRequest("PATCH", `/api/quote-catalog/${id}`, { isActive }).then(r => r.json()),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/quote-catalog", area] }),
    onError: () => toast({ title: "Error", variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => apiRequest("DELETE", `/api/quote-catalog/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/quote-catalog", area] });
      toast({ title: "Ítem eliminado" });
      setDeleteId(null);
    },
    onError: () => toast({ title: "Error al eliminar", variant: "destructive" }),
  });

  const handleNew = () => { setEditingItem(null); setDialogOpen(true); };
  const handleEdit = (item: QuoteCatalogItem) => { setEditingItem(item); setDialogOpen(true); };
  const handleSaved = () => setEditingItem(null);

  // Group items by category
  const categories = CATEGORY_OPTIONS[area].map(c => c.value);
  const allCategories = [...new Set([...categories, ...items.map(i => i.category)])];
  const grouped = allCategories
    .map(cat => ({
      cat,
      label: CATEGORY_OPTIONS[area].find(c => c.value === cat)?.label || cat,
      items: items.filter(i => i.category === cat).sort((a, b) => a.sortOrder - b.sortOrder),
    }))
    .filter(g => g.items.length > 0 || categories.includes(g.cat));

  const toggleCategory = (cat: string) => {
    setExpandedCategories(prev => {
      const next = new Set(prev);
      if (next.has(cat)) next.delete(cat);
      else next.add(cat);
      return next;
    });
  };

  if (isLoading) return <Skeleton className="h-40 w-full" />;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-medium">Ítems del catálogo</p>
          <p className="text-xs text-muted-foreground mt-0.5">
            Estos ítems se muestran en el PDF del presupuesto de esta área. Los inactivos no aparecen en el PDF.
          </p>
        </div>
        <Button onClick={handleNew} size="sm" data-testid={`button-new-catalog-item-${area}`}>
          <Plus className="h-4 w-4 mr-1" /> Nuevo ítem
        </Button>
      </div>

      {items.length === 0 ? (
        <div className="border rounded-lg border-dashed p-10 text-center text-muted-foreground">
          <Plus className="h-10 w-10 mx-auto mb-2 opacity-20" />
          <p className="text-sm">Sin ítems en el catálogo</p>
          <p className="text-xs mt-1">Agregue ítems para que aparezcan en el PDF</p>
        </div>
      ) : (
        <div className="space-y-2">
          {grouped.map(({ cat, label, items: catItems }) => (
            <div key={cat} className="border rounded-lg overflow-hidden">
              <button
                className="w-full flex items-center justify-between px-4 py-3 bg-muted/30 hover:bg-muted/50 transition-colors text-left"
                onClick={() => toggleCategory(cat)}
              >
                <span className="font-medium text-sm">{label}</span>
                <div className="flex items-center gap-2">
                  <Badge variant="secondary" className="text-xs">{catItems.length} ítems</Badge>
                  {expandedCategories.has(cat) ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                </div>
              </button>
              {expandedCategories.has(cat) && (
                <Table>
                  <TableHeader>
                    <TableRow className="bg-muted/20">
                      <TableHead className="text-xs">Nombre</TableHead>
                      <TableHead className="text-xs">Precio base</TableHead>
                      <TableHead className="text-xs">Precio especial</TableHead>
                      <TableHead className="text-xs">Unidad</TableHead>
                      <TableHead className="text-xs">Estado</TableHead>
                      <TableHead className="w-24" />
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {catItems.map(item => (
                      <TableRow key={item.id} className={!item.isActive ? "opacity-50" : ""} data-testid={`row-catalog-${item.id}`}>
                        <TableCell>
                          <div>
                            <p className="text-sm font-medium">{item.name}</p>
                            {item.description && <p className="text-xs text-muted-foreground truncate max-w-[280px]">{item.description}</p>}
                          </div>
                        </TableCell>
                        <TableCell className="text-sm font-mono">$ {fmt(item.price)}</TableCell>
                        <TableCell className="text-sm font-mono text-green-700 dark:text-green-400">
                          {item.priceSpecial ? `$ ${fmt(item.priceSpecial)}` : <span className="text-muted-foreground">—</span>}
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground">{item.unit}</TableCell>
                        <TableCell>
                          <button
                            onClick={() => toggleActiveMutation.mutate({ id: item.id, isActive: !item.isActive })}
                            className={`px-2 py-0.5 rounded text-xs font-medium transition-colors ${item.isActive ? "bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300 hover:bg-green-200" : "bg-gray-100 text-gray-500 dark:bg-gray-800 hover:bg-gray-200"}`}
                          >
                            {item.isActive ? "Activo" : "Inactivo"}
                          </button>
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-1 justify-end">
                            <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => handleEdit(item)} data-testid={`button-edit-catalog-${item.id}`}>
                              <Pencil className="h-3.5 w-3.5" />
                            </Button>
                            <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive hover:text-destructive" onClick={() => setDeleteId(item.id)} data-testid={`button-delete-catalog-${item.id}`}>
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </div>
          ))}
        </div>
      )}

      {dialogOpen && (
        <CatalogItemDialog
          key={editingItem?.id ?? "new"}
          open={dialogOpen}
          onOpenChange={setDialogOpen}
          item={editingItem}
          area={area}
          onSaved={handleSaved}
        />
      )}

      <AlertDialog open={!!deleteId} onOpenChange={open => !open && setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar ítem del catálogo?</AlertDialogTitle>
            <AlertDialogDescription>Esta acción no se puede deshacer.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction className="bg-destructive text-destructive-foreground hover:bg-destructive/90" onClick={() => deleteId && deleteMutation.mutate(deleteId)}>
              Eliminar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────
export default function ConfigPresupuestosPage() {
  return (
    <div className="p-6 space-y-5">
      <div className="flex items-center gap-2">
        <ClipboardList className="h-6 w-6 text-muted-foreground" />
        <div>
          <h1 className="text-2xl font-bold">Configuración de Presupuestos</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Administrá las condiciones y catálogos de cada área para la generación de PDFs.
          </p>
        </div>
      </div>

      <Tabs defaultValue="grupos">
        <TabsList className="flex-wrap h-auto gap-1">
          {AREA_TABS.map(({ value, label, icon: Icon }) => (
            <TabsTrigger key={value} value={value} className="flex items-center gap-1.5" data-testid={`tab-config-${value}`}>
              <Icon className="h-3.5 w-3.5" />
              {label}
            </TabsTrigger>
          ))}
        </TabsList>

        {AREA_TABS.map(({ value, label, hasCatalog }) => (
          <TabsContent key={value} value={value} className="space-y-6 mt-6">
            <div className="grid gap-6">
              {/* Conditions */}
              <div className="rounded-xl border p-5 space-y-4">
                <div className="flex items-center gap-2 border-b pb-3">
                  <ClipboardList className="h-4 w-4 text-muted-foreground" />
                  <h2 className="font-semibold text-base">Condiciones por defecto — {label}</h2>
                </div>
                <ConditionsEditor area={value} />
              </div>

              {/* Catalog (only for eventos, spa, restaurant) */}
              {hasCatalog && (
                <div className="rounded-xl border p-5 space-y-4">
                  <div className="flex items-center gap-2 border-b pb-3">
                    <ClipboardList className="h-4 w-4 text-muted-foreground" />
                    <h2 className="font-semibold text-base">Catálogo de servicios — {label}</h2>
                  </div>
                  <CatalogEditor area={value} />
                </div>
              )}
            </div>
          </TabsContent>
        ))}
      </Tabs>
    </div>
  );
}
