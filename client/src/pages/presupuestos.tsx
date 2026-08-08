import { useState, useCallback, useEffect } from "react";
import { fmtMoney, getArgentinaToday } from "@/lib/utils";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useAuth } from "@/App";
import {
  ClipboardList, Plus, Trash2, FileDown, Pencil,
  CheckCircle, Clock, Send, XCircle, AlertCircle,
  RotateCcw, Building2, Calendar, Users, UtensilsCrossed, Flower2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
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
import { useToast } from "@/hooks/use-toast";
import { queryClient, apiRequest } from "@/lib/queryClient";
import type { Presupuesto, PresupuestoWithItems, PresupuestoEstado, RoomType } from "@shared/schema";

// ─── Types ────────────────────────────────────────────────────────────────────
type Sector = "alojamiento" | "restaurant" | "spa" | "evento" | "otro";
type AreaOrigen = "grupos" | "recepcion" | "eventos" | "spa" | "restaurant";

interface ItemRow {
  id?: string;
  sector: Sector;
  descripcion: string;
  detalle: string;
  cantidad: string;
  precioUnitario: string;
  descuento: string;
  subtotal: string;
}

// ─── Constants ────────────────────────────────────────────────────────────────
const SECTOR_LABELS: Record<Sector, string> = {
  alojamiento: "Alojamiento", restaurant: "Restaurant",
  spa: "SPA", evento: "Evento", otro: "Otro",
};

const AREA_CONFIG: Record<AreaOrigen, { label: string; icon: typeof Building2; color: string; useItems: boolean }> = {
  grupos:     { label: "Grupos",           icon: Users,          color: "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300",    useItems: true  },
  recepcion:  { label: "Recepción",        icon: Building2,      color: "bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300", useItems: true  },
  eventos:    { label: "Eventos",          icon: Calendar,       color: "bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300", useItems: true  },
  spa:        { label: "SPA",              icon: Flower2,        color: "bg-pink-100 text-pink-700 dark:bg-pink-900/40 dark:text-pink-300",     useItems: true  },
  restaurant: { label: "Restaurant Justo", icon: UtensilsCrossed, color: "bg-lime-100 text-lime-800 dark:bg-lime-900/40 dark:text-lime-300", useItems: true },
};

const ESTADO_CONFIG: Record<PresupuestoEstado, { label: string; icon: typeof CheckCircle; cls: string }> = {
  borrador:  { label: "Borrador",  icon: Clock,       cls: "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300" },
  enviado:   { label: "Enviado",   icon: Send,        cls: "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300" },
  aceptado:  { label: "Aceptado", icon: CheckCircle, cls: "bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300" },
  vencido:   { label: "Vencido",  icon: AlertCircle, cls: "bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-300" },
  cancelado: { label: "Cancelado", icon: XCircle,    cls: "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300" },
};

// ─── Helpers ──────────────────────────────────────────────────────────────────
const toNum = (v: string) => parseFloat(v.replace(",", ".")) || 0;
const fmt = (v: number) => v.toLocaleString("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmtDate = (d: string) => { try { const [y,m,day] = d.split("-"); return `${day}/${m}/${y}`; } catch { return d; } };
const today = getArgentinaToday();

function calcSubtotal(cant: string, precio: string, dto: string): string {
  const s = toNum(cant) * toNum(precio) * (1 - toNum(dto) / 100);
  return s.toFixed(2);
}
function emptyItem(): ItemRow {
  return { sector: "alojamiento", descripcion: "", detalle: "", cantidad: "1", precioUnitario: "0", descuento: "0", subtotal: "0" };
}

function defaultAreaForRole(role?: string): AreaOrigen {
  if (role === "events") return "eventos";
  if (role === "spa") return "spa";
  if (role === "restaurant") return "restaurant";
  return "grupos";
}

// ─── Item Row Component ───────────────────────────────────────────────────────
function ItemRowEdit({ item, idx, onChange, onRemove, roomTypes }: {
  item: ItemRow; idx: number;
  onChange: (idx: number, field: keyof ItemRow, value: string) => void;
  onRemove: (idx: number) => void;
  roomTypes: RoomType[];
}) {
  const update = (field: keyof ItemRow, value: string) => onChange(idx, field, value);
  const updateCalc = (field: "cantidad" | "precioUnitario" | "descuento", value: string) => {
    const sub = calcSubtotal(
      field === "cantidad" ? value : item.cantidad,
      field === "precioUnitario" ? value : item.precioUnitario,
      field === "descuento" ? value : item.descuento,
    );
    onChange(idx, field, value);
    onChange(idx, "subtotal", sub);
  };

  return (
    <TableRow className="group">
      <TableCell className="p-1 w-32">
        <Select value={item.sector} onValueChange={v => update("sector", v)}>
          <SelectTrigger className="h-8 text-xs" data-testid={`select-item-sector-${idx}`}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {(Object.keys(SECTOR_LABELS) as Sector[]).map(s => (
              <SelectItem key={s} value={s}>{SECTOR_LABELS[s]}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </TableCell>
      <TableCell className="p-1">
        <div className="space-y-1">
          {item.sector === "alojamiento" && roomTypes.length > 0 && (
            <Select value="" onValueChange={v => {
              const rt = roomTypes.find(r => r.id === v);
              if (rt) {
                update("descripcion", rt.name);
                onChange(idx, "descripcion", rt.name);
              }
            }}>
              <SelectTrigger className="h-7 text-xs text-muted-foreground" data-testid={`select-room-type-${idx}`}>
                <SelectValue placeholder="Autocompletar tipo hab..." />
              </SelectTrigger>
              <SelectContent>
                {roomTypes.filter(rt => rt.id).map(rt => (
                  <SelectItem key={rt.id} value={rt.id}>{rt.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
          <Input className="h-8 text-xs" value={item.descripcion} onChange={e => update("descripcion", e.target.value)} placeholder="Descripción" data-testid={`input-item-desc-${idx}`} />
          <Input className="h-7 text-xs text-muted-foreground" value={item.detalle} onChange={e => update("detalle", e.target.value)} placeholder="Detalle opcional (ej: doble, desayuno incluido...)" data-testid={`input-item-detail-${idx}`} />
        </div>
      </TableCell>
      <TableCell className="p-1 w-20">
        <Input className="h-8 text-xs text-right" value={item.cantidad} onChange={e => updateCalc("cantidad", e.target.value)} data-testid={`input-item-qty-${idx}`} />
      </TableCell>
      <TableCell className="p-1 w-28">
        <div className="relative">
          <span className="absolute left-2 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">$</span>
          <Input className="h-8 text-xs text-right pl-5" value={item.precioUnitario} onChange={e => updateCalc("precioUnitario", e.target.value)} data-testid={`input-item-price-${idx}`} />
        </div>
      </TableCell>
      <TableCell className="p-1 w-20">
        <div className="relative">
          <Input className="h-8 text-xs text-right pr-5" value={item.descuento} onChange={e => updateCalc("descuento", e.target.value)} data-testid={`input-item-dto-${idx}`} />
          <span className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">%</span>
        </div>
      </TableCell>
      <TableCell className="p-1 w-28 text-right font-semibold text-sm">$ {fmt(toNum(item.subtotal))}</TableCell>
      <TableCell className="p-1 w-8">
        <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive opacity-0 group-hover:opacity-100 transition-opacity" onClick={() => onRemove(idx)} data-testid={`button-remove-item-${idx}`}>
          <Trash2 className="h-3.5 w-3.5" />
        </Button>
      </TableCell>
    </TableRow>
  );
}

// ─── Main Form Dialog ─────────────────────────────────────────────────────────
function PresupuestoDialog({ open, onOpenChange, presupuesto, onSaved }: {
  open: boolean; onOpenChange: (v: boolean) => void;
  presupuesto: PresupuestoWithItems | null; onSaved: () => void;
}) {
  const { toast } = useToast();
  const { user } = useAuth();
  const isEdit = !!presupuesto;

  const [area, setArea] = useState<AreaOrigen>((presupuesto as any)?.areaOrigen || defaultAreaForRole(user?.role));
  const [para, setPara] = useState(presupuesto?.para || "");
  const [fechaEmision, setFechaEmision] = useState(presupuesto?.fechaEmision || today);
  const [fechaVencimiento, setFechaVencimiento] = useState(presupuesto?.fechaVencimiento || "");
  const [fechaEvento, setFechaEvento] = useState(presupuesto?.fechaEvento || "");
  const [fechaFin, setFechaFin] = useState((presupuesto as any)?.fechaFin || "");
  const [participantes, setParticipantes] = useState<string>((presupuesto as any)?.participantes?.toString() || "");
  const [estado, setEstado] = useState<PresupuestoEstado>(presupuesto?.estado || "borrador");
  const [notas, setNotas] = useState(presupuesto?.notas || "");
  const [condiciones, setCondiciones] = useState(presupuesto?.condiciones || "");
  const [descuentoGlobal, setDescuentoGlobal] = useState(presupuesto?.descuentoGlobal || "0");
  const [condLoaded, setCondLoaded] = useState(false);
  const [items, setItems] = useState<ItemRow[]>(
    presupuesto?.items?.length
      ? presupuesto.items.map(it => ({ id: it.id, sector: it.sector as Sector, descripcion: it.descripcion, detalle: it.detalle || "", cantidad: String(it.cantidad), precioUnitario: String(it.precioUnitario), descuento: String(it.descuento), subtotal: String(it.subtotal) }))
      : [emptyItem()]
  );

  const { data: roomTypes = [] } = useQuery<RoomType[]>({ queryKey: ["/api/room-types"] });
  const useItems = AREA_CONFIG[area]?.useItems ?? true;
  const useCatalogPicker = useItems && (area === "spa" || area === "restaurant");
  const useEventosAutoLoad = area === "eventos" && !isEdit;
  const { data: areaCatalog = [] } = useQuery<any[]>({
    queryKey: ["/api/quote-catalog", area],
    queryFn: () => fetch(`/api/quote-catalog?area=${area}`, { credentials: "include" }).then(r => r.json()),
    enabled: useCatalogPicker || useEventosAutoLoad,
  });

  // Auto-load all active eventos catalog items when creating a new eventos presupuesto
  // Items are sorted by category order (as configured) then by sortOrder within each category
  const EVENTOS_CATEGORY_ORDER = ["salon", "coffee_break", "coctel", "equipamiento", "menu", "otro"];
  const [eventosItemsLoaded, setEventosItemsLoaded] = useState(false);
  useEffect(() => {
    if (!useEventosAutoLoad || eventosItemsLoaded) return;
    if (areaCatalog.length === 0) return;
    const active = areaCatalog.filter((i: any) => i.isActive);
    if (active.length === 0) return;
    const sorted = [...active].sort((a: any, b: any) => {
      const catA = EVENTOS_CATEGORY_ORDER.indexOf(a.category);
      const catB = EVENTOS_CATEGORY_ORDER.indexOf(b.category);
      const catDiff = (catA === -1 ? 999 : catA) - (catB === -1 ? 999 : catB);
      if (catDiff !== 0) return catDiff;
      return (a.sortOrder ?? 0) - (b.sortOrder ?? 0);
    });
    setItems(sorted.map((item: any) => ({
      sector: "evento" as Sector,
      descripcion: item.name,
      detalle: item.description || "",
      cantidad: "1",
      precioUnitario: String(item.price),
      descuento: "0",
      subtotal: calcSubtotal("1", String(item.price), "0"),
    })));
    setEventosItemsLoaded(true);
  }, [useEventosAutoLoad, eventosItemsLoaded, areaCatalog]);
  const areaCatalogGrouped = areaCatalog.filter(i => i.isActive).reduce((acc: Record<string, any[]>, item: any) => {
    if (!acc[item.category]) acc[item.category] = [];
    acc[item.category].push(item);
    return acc;
  }, {});
  const CATALOG_CAT_LABELS: Record<string, string> = {
    tratamiento: "Tratamientos", masaje: "Masajes", paquete: "Paquetes",
    entrada: "Entradas", principal: "Platos principales", postre: "Postres",
    bebida: "Bebidas", menu: "Menús", otro: "Otros Servicios",
  };
  const handleAddFromCatalog = (item: any) => {
    const newItem: ItemRow = {
      sector: area === "restaurant" ? "restaurant" : "spa",
      descripcion: item.name,
      detalle: item.description || "",
      cantidad: "1",
      precioUnitario: String(item.price),
      descuento: "0",
      subtotal: String(item.price),
    };
    setItems(prev => [...prev.filter(it => it.descripcion.trim() !== ""), newItem]);
  };

  // Load default conditions from API when area changes (new presupuesto only)
  useEffect(() => {
    if (isEdit || condLoaded) return;
    if (condiciones) { setCondLoaded(true); return; }
    fetch(`/api/quote-conditions/${area}`, { credentials: "include" })
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (d?.content) { setCondiciones(d.content); setCondLoaded(true); } });
  }, [area, isEdit, condLoaded, condiciones]);

  const subtotalSuma = useItems ? items.reduce((acc, it) => acc + toNum(it.subtotal), 0) : 0;
  const descuentoMonto = subtotalSuma * toNum(descuentoGlobal) / 100;
  const totalFinal = subtotalSuma - descuentoMonto;

  const handleItemChange = useCallback((idx: number, field: keyof ItemRow, value: string) => {
    setItems(prev => prev.map((it, i) => i === idx ? { ...it, [field]: value } : it));
  }, []);
  const handleRemoveItem = useCallback((idx: number) => {
    setItems(prev => prev.filter((_, i) => i !== idx));
  }, []);
  const handleAddItem = () => setItems(prev => [...prev, emptyItem()]);

  const buildPayload = () => ({
    para: para.trim(),
    fechaEmision,
    fechaVencimiento: fechaVencimiento || null,
    fechaEvento: fechaEvento || null,
    fechaFin: fechaFin || null,
    participantes: participantes ? parseInt(participantes) : null,
    estado,
    notas: notas.trim() || null,
    condiciones: condiciones.trim() || null,
    descuentoGlobal: useItems ? (descuentoGlobal || "0") : "0",
    subtotal: useItems ? subtotalSuma.toFixed(2) : "0",
    total: useItems ? totalFinal.toFixed(2) : "0",
    areaOrigen: area,
    items: useItems ? items.map((it, ord) => ({
      ...(it.id ? { id: it.id } : {}),
      sector: it.sector,
      descripcion: it.descripcion.trim(),
      detalle: it.detalle.trim() || null,
      cantidad: it.cantidad,
      precioUnitario: it.precioUnitario,
      descuento: it.descuento,
      subtotal: it.subtotal,
      orden: ord,
    })) : [],
  });

  const saveMutation = useMutation({
    mutationFn: (payload: any) =>
      isEdit
        ? apiRequest("PATCH", `/api/presupuestos/${presupuesto!.id}`, payload).then(r => r.json())
        : apiRequest("POST", "/api/presupuestos", payload).then(r => r.json()),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/presupuestos"] });
      toast({ title: isEdit ? "Presupuesto actualizado" : "Presupuesto creado" });
      onSaved();
      onOpenChange(false);
    },
    onError: () => toast({ title: "Error al guardar", variant: "destructive" }),
  });

  const valid = para.trim().length > 0 && (!useItems || (items.length > 0 && items.every(it => it.descripcion.trim().length > 0)));

  const areaConf = AREA_CONFIG[area];
  const AreaIcon = areaConf?.icon ?? Building2;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl max-h-[95vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ClipboardList className="h-5 w-5 text-primary" />
            {isEdit ? `Editar ${presupuesto!.numero}` : "Nuevo Presupuesto"}
          </DialogTitle>
          <DialogDescription>
            {isEdit ? `Presupuesto ${presupuesto?.numero}` : "Complete los datos del presupuesto"}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5 py-2">
          {/* ── Área + Header ──────────────────────────────── */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 p-4 bg-muted/30 rounded-lg border">

            {/* Área origen */}
            <div className="col-span-2 md:col-span-1">
              <Label>Área *</Label>
              <Select value={area} onValueChange={v => { setArea(v as AreaOrigen); setCondLoaded(false); setCondiciones(""); }}>
                <SelectTrigger className="mt-1" data-testid="select-area-origen">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(Object.keys(AREA_CONFIG) as AreaOrigen[]).map(a => {
                    const cfg = AREA_CONFIG[a];
                    const Icon = cfg.icon;
                    return (
                      <SelectItem key={a} value={a}>
                        <span className="flex items-center gap-2">
                          <Icon className="h-3.5 w-3.5" />
                          {cfg.label}
                        </span>
                      </SelectItem>
                    );
                  })}
                </SelectContent>
              </Select>
              <div className={`mt-1.5 rounded px-2 py-0.5 text-xs inline-flex items-center gap-1 ${areaConf?.color}`}>
                <AreaIcon className="h-3 w-3" />
                {areaConf?.label}
              </div>
            </div>

            <div className="col-span-2 md:col-span-3">
              <Label>Para (dirigido a) *</Label>
              <Input value={para} onChange={e => setPara(e.target.value)} placeholder="Nombre del cliente, empresa o agencia..." className="mt-1" data-testid="input-para" />
            </div>

            <div>
              <Label>Fecha de emisión</Label>
              <Input type="date" value={fechaEmision} onChange={e => setFechaEmision(e.target.value)} className="mt-1" data-testid="input-fecha-emision" />
            </div>
            <div>
              <Label>Válido hasta</Label>
              <Input type="date" value={fechaVencimiento} onChange={e => setFechaVencimiento(e.target.value)} className="mt-1" data-testid="input-fecha-vencimiento" />
            </div>
            <div>
              <Label>Fecha ingreso</Label>
              <Input type="date" value={fechaEvento} onChange={e => setFechaEvento(e.target.value)} className="mt-1" data-testid="input-fecha-evento" />
            </div>
            <div>
              <Label>Fecha egreso</Label>
              <Input type="date" value={fechaFin} onChange={e => setFechaFin(e.target.value)} className="mt-1" data-testid="input-fecha-fin" />
            </div>
            {(area === "eventos" || area === "spa" || area === "restaurant") && (
              <div>
                <Label>Participantes</Label>
                <Input type="number" min="1" value={participantes} onChange={e => setParticipantes(e.target.value)} placeholder="Nº personas" className="mt-1" data-testid="input-participantes" />
              </div>
            )}
            <div className={area === "eventos" || area === "spa" || area === "restaurant" ? "" : "col-span-1"}>
              <Label>Estado</Label>
              <Select value={estado} onValueChange={v => setEstado(v as PresupuestoEstado)}>
                <SelectTrigger className="mt-1" data-testid="select-estado">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(Object.keys(ESTADO_CONFIG) as PresupuestoEstado[]).map(e => (
                    <SelectItem key={e} value={e}>{ESTADO_CONFIG[e].label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="col-span-2 md:col-span-2">
              <Label>Notas internas (no aparecen en el PDF)</Label>
              <Input value={notas} onChange={e => setNotas(e.target.value)} placeholder="Observaciones internas, contacto, teléfono..." className="mt-1" data-testid="input-notas" />
            </div>
          </div>

          {/* ── Catalog picker for SPA / Restaurant ────────── */}
          {useCatalogPicker && Object.keys(areaCatalogGrouped).length > 0 && (
            <div className={`rounded-lg border p-3 space-y-2 ${area === "restaurant" ? "bg-lime-50/40 dark:bg-lime-950/20" : "bg-pink-50/40 dark:bg-pink-950/20"}`}>
              <Label className={`text-sm font-semibold ${area === "restaurant" ? "text-lime-800 dark:text-lime-300" : "text-pink-800 dark:text-pink-300"}`}>
                {area === "restaurant"
                  ? <><UtensilsCrossed className="inline h-3.5 w-3.5 mr-1" />Menú Justo — hacé clic para agregar servicios</>
                  : <><Flower2 className="inline h-3.5 w-3.5 mr-1" />Catálogo SPA — hacé clic para agregar servicios</>}
              </Label>
              {Object.entries(areaCatalogGrouped).map(([cat, catItems]) => (
                <div key={cat}>
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1">
                    {CATALOG_CAT_LABELS[cat] || cat}
                  </p>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-1">
                    {(catItems as any[]).map((item: any) => (
                      <button
                        key={item.id}
                        type="button"
                        onClick={() => handleAddFromCatalog(item)}
                        className={`text-left text-xs rounded border p-2 transition-colors flex justify-between items-start gap-2 ${area === "restaurant" ? "border-lime-200 dark:border-lime-800 bg-white dark:bg-lime-950/40 hover:bg-lime-100 dark:hover:bg-lime-900/40" : "border-pink-200 dark:border-pink-800 bg-white dark:bg-pink-950/40 hover:bg-pink-100 dark:hover:bg-pink-900/40"}`}
                        data-testid={`button-catalog-item-${item.id}`}
                      >
                        <div className="min-w-0">
                          <span className="font-semibold block truncate">{item.name}</span>
                          {item.description && (
                            <span className="text-muted-foreground block truncate">{item.description}</span>
                          )}
                          <span className="text-muted-foreground">{item.unit}</span>
                        </div>
                        <span className={`whitespace-nowrap font-bold shrink-0 ${area === "restaurant" ? "text-lime-700 dark:text-lime-300" : "text-pink-700 dark:text-pink-300"}`}>
                          + $ {parseFloat(item.price).toLocaleString("es-AR", { minimumFractionDigits: 0 })}
                        </span>
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* ── Items ──────────────────────────────────────── */}
          {useItems ? (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label className="text-base font-semibold">Servicios seleccionados</Label>
                <Button size="sm" variant="outline" onClick={handleAddItem} data-testid="button-add-item">
                  <Plus className="h-3.5 w-3.5 mr-1" /> Agregar ítem manual
                </Button>
              </div>
              {area === "eventos" && !isEdit && eventosItemsLoaded && (
                <div className="flex items-center gap-2 rounded-md border border-purple-200 dark:border-purple-800 bg-purple-50 dark:bg-purple-950/20 px-3 py-2 text-xs text-purple-700 dark:text-purple-300">
                  <Calendar className="h-3.5 w-3.5 shrink-0" />
                  Ítems cargados desde el catálogo de eventos. Modificá precios, cantidades o eliminá los que no apliquen para este presupuesto.
                </div>
              )}
              <div className="border rounded-lg overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-muted/50">
                      <TableHead className="text-xs w-32">Sector</TableHead>
                      <TableHead className="text-xs">Descripción</TableHead>
                      <TableHead className="text-xs w-20 text-right">Cant.</TableHead>
                      <TableHead className="text-xs w-28 text-right">Precio unit.</TableHead>
                      <TableHead className="text-xs w-20 text-right">Dto%</TableHead>
                      <TableHead className="text-xs w-28 text-right">Subtotal</TableHead>
                      <TableHead className="w-8" />
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {items.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={7} className="text-center text-sm text-muted-foreground py-8">
                          No hay ítems. Haga clic en "Agregar ítem".
                        </TableCell>
                      </TableRow>
                    ) : items.map((item, idx) => (
                      <ItemRowEdit key={idx} item={item} idx={idx} onChange={handleItemChange} onRemove={handleRemoveItem} roomTypes={roomTypes} />
                    ))}
                  </TableBody>
                </Table>
              </div>
              <div className="flex justify-end">
                <div className="space-y-1 w-64">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">Subtotal</span>
                    <span className="font-medium">$ {fmt(subtotalSuma)}</span>
                  </div>
                  <div className="flex items-center gap-2 justify-between text-sm">
                    <span className="text-muted-foreground">Descuento global</span>
                    <div className="relative w-24">
                      <Input className="h-7 text-xs text-right pr-5" value={descuentoGlobal} onChange={e => setDescuentoGlobal(e.target.value)} data-testid="input-descuento-global" />
                      <span className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">%</span>
                    </div>
                  </div>
                  {toNum(descuentoGlobal) > 0 && (
                    <div className="flex items-center justify-between text-sm text-orange-600 dark:text-orange-400">
                      <span>— Descuento</span>
                      <span>- $ {fmt(descuentoMonto)}</span>
                    </div>
                  )}
                  <div className="flex items-center justify-between pt-2 border-t">
                    <span className="font-bold text-base">TOTAL</span>
                    <span className="font-bold text-base text-primary">$ {fmt(totalFinal)}</span>
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <div className="rounded-lg border border-dashed p-5 text-center text-muted-foreground bg-muted/20">
              <AreaIcon className="h-8 w-8 mx-auto mb-2 opacity-40" />
              <p className="text-sm font-medium">Presupuesto de {areaConf?.label}</p>
              <p className="text-xs mt-1">
                El PDF se genera con el catálogo completo del área.<br />
                Editá el catálogo y las condiciones desde <strong>Configuración → Presupuestos</strong>.
              </p>
            </div>
          )}

          {/* ── Condiciones ───────────────────────────────── */}
          <div className="space-y-1">
            <div className="flex items-center justify-between">
              <Label>Condiciones y observaciones (aparecen en el PDF)</Label>
              <Button size="sm" variant="ghost" className="text-xs h-7" onClick={() => { setCondLoaded(false); setCondiciones(""); }} data-testid="button-restaurar-condiciones">
                <RotateCcw className="h-3 w-3 mr-1" /> Restaurar del área
              </Button>
            </div>
            <Textarea value={condiciones} onChange={e => setCondiciones(e.target.value)} rows={6} className="text-sm font-mono" placeholder="Texto de condiciones..." data-testid="textarea-condiciones" />
          </div>
        </div>

        <DialogFooter className="gap-2 flex-wrap">
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={() => saveMutation.mutate(buildPayload())} disabled={!valid || saveMutation.isPending} data-testid="button-save-presupuesto">
            {saveMutation.isPending ? "Guardando..." : isEdit ? "Guardar cambios" : "Crear presupuesto"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────
export default function PresupuestosPage() {
  const { toast } = useToast();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [estadoFilter, setEstadoFilter] = useState<PresupuestoEstado | "todos">("todos");
  const [areaFilter, setAreaFilter] = useState<AreaOrigen | "todos">("todos");
  const [search, setSearch] = useState("");

  const { data: lista = [], isLoading } = useQuery<Presupuesto[]>({
    queryKey: ["/api/presupuestos"],
  });

  const { data: editingPres } = useQuery<PresupuestoWithItems>({
    queryKey: ["/api/presupuestos", editingId],
    enabled: !!editingId,
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => apiRequest("DELETE", `/api/presupuestos/${id}`),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/presupuestos"] }); toast({ title: "Presupuesto eliminado" }); setDeleteId(null); },
    onError: () => toast({ title: "Error al eliminar", variant: "destructive" }),
  });

  const updateEstadoMutation = useMutation({
    mutationFn: ({ id, estado }: { id: string; estado: PresupuestoEstado }) =>
      apiRequest("PATCH", `/api/presupuestos/${id}`, { estado }).then(r => r.json()),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/presupuestos"] }); },
    onError: () => toast({ title: "Error", variant: "destructive" }),
  });

  const filtered = lista.filter(p => {
    if (areaFilter !== "todos" && (p as any).areaOrigen !== areaFilter) return false;
    if (estadoFilter !== "todos" && p.estado !== estadoFilter) return false;
    if (search) { const q = search.toLowerCase(); return p.numero.toLowerCase().includes(q) || p.para.toLowerCase().includes(q); }
    return true;
  });

  const handleEdit = (id: string) => { setEditingId(id); setDialogOpen(true); };
  const handleNew = () => { setEditingId(null); setDialogOpen(true); };
  const handleSaved = () => setEditingId(null);
  const handleDownloadPdf = (id: string) => window.open(`/api/presupuestos/${id}/pdf`, "_blank");

  const areaCounts = (Object.keys(AREA_CONFIG) as AreaOrigen[]).reduce((acc, a) => {
    acc[a] = lista.filter(p => (p as any).areaOrigen === a).length;
    return acc;
  }, {} as Record<AreaOrigen, number>);

  return (
    <div className="p-6 space-y-5">
      {/* ── Title ─────────────────────────────────────────── */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-2">
          <ClipboardList className="h-6 w-6 text-muted-foreground" />
          <h1 className="text-2xl font-bold" data-testid="text-page-title">Presupuestos</h1>
          <Badge variant="secondary">{lista.length} total</Badge>
        </div>
        <Button onClick={handleNew} data-testid="button-nuevo-presupuesto">
          <Plus className="h-4 w-4 mr-1" /> Nuevo presupuesto
        </Button>
      </div>

      {/* ── Area filter tabs ───────────────────────────────── */}
      <div className="flex items-center gap-2 flex-wrap">
        <button
          onClick={() => setAreaFilter("todos")}
          className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-all border ${areaFilter === "todos" ? "bg-primary text-primary-foreground border-primary" : "bg-background hover:bg-muted border-border"}`}
          data-testid="tab-area-todos"
        >
          Todos <span className="ml-1 text-xs opacity-70">({lista.length})</span>
        </button>
        {(Object.keys(AREA_CONFIG) as AreaOrigen[]).map(a => {
          const cfg = AREA_CONFIG[a];
          const Icon = cfg.icon;
          const count = areaCounts[a] || 0;
          return (
            <button
              key={a}
              onClick={() => setAreaFilter(a)}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-all border flex items-center gap-1.5 ${areaFilter === a ? "bg-primary text-primary-foreground border-primary" : "bg-background hover:bg-muted border-border"}`}
              data-testid={`tab-area-${a}`}
            >
              <Icon className="h-3.5 w-3.5" />
              {cfg.label}
              {count > 0 && <span className="text-xs opacity-70">({count})</span>}
            </button>
          );
        })}
      </div>

      {/* ── Status filters + search ────────────────────────── */}
      <div className="flex items-center gap-3 flex-wrap">
        <Input placeholder="Buscar por número o destinatario..." value={search} onChange={e => setSearch(e.target.value)} className="max-w-sm" data-testid="input-search" />
        <div className="flex items-center gap-1.5 flex-wrap">
          {(Object.keys(ESTADO_CONFIG) as PresupuestoEstado[]).map(e => {
            const ec = ESTADO_CONFIG[e];
            return (
              <button
                key={e}
                onClick={() => setEstadoFilter(prev => prev === e ? "todos" : e)}
                className={`px-2.5 py-1 rounded text-xs font-medium transition-all ${estadoFilter === e ? "ring-2 ring-primary " : "opacity-60 hover:opacity-100 "} ${ec.cls}`}
                data-testid={`filter-estado-${e}`}
              >
                {ec.label}
              </button>
            );
          })}
          {estadoFilter !== "todos" && (
            <Button size="sm" variant="ghost" onClick={() => setEstadoFilter("todos")} className="text-xs h-7">
              <XCircle className="h-3.5 w-3.5 mr-1" /> Quitar
            </Button>
          )}
        </div>
      </div>

      {/* ── List ──────────────────────────────────────────── */}
      {isLoading ? (
        <div className="space-y-2">
          {[...Array(4)].map((_, i) => <Skeleton key={i} className="h-16 w-full rounded-lg" />)}
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-20 text-muted-foreground border rounded-lg border-dashed">
          <ClipboardList className="h-14 w-14 mx-auto mb-3 opacity-20" />
          <p className="font-medium">No hay presupuestos</p>
          <p className="text-sm mt-1">Haga clic en "Nuevo presupuesto" para comenzar</p>
        </div>
      ) : (
        <div className="border rounded-lg overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/50">
                <TableHead className="text-xs">Número</TableHead>
                <TableHead className="text-xs">Área</TableHead>
                <TableHead className="text-xs">Para</TableHead>
                <TableHead className="text-xs">Emisión</TableHead>
                <TableHead className="text-xs">Evento/Estadía</TableHead>
                <TableHead className="text-xs">Estado</TableHead>
                <TableHead className="text-xs text-right">Total</TableHead>
                <TableHead className="w-36" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map(p => {
                const ec = ESTADO_CONFIG[p.estado as PresupuestoEstado] || ESTADO_CONFIG.borrador;
                const EIcon = ec.icon;
                const pArea = (p as any).areaOrigen as AreaOrigen || "grupos";
                const areaCfg = AREA_CONFIG[pArea];
                const AreaIcon2 = areaCfg?.icon ?? Building2;
                return (
                  <TableRow key={p.id} className="hover:bg-muted/30" data-testid={`row-presupuesto-${p.id}`}>
                    <TableCell className="font-mono text-sm font-semibold text-primary">{p.numero}</TableCell>
                    <TableCell>
                      <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium ${areaCfg?.color}`}>
                        <AreaIcon2 className="h-3 w-3" />
                        {areaCfg?.label || pArea}
                      </span>
                    </TableCell>
                    <TableCell className="font-medium max-w-[180px] truncate">{p.para}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">{fmtDate(p.fechaEmision)}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {p.fechaEvento ? fmtDate(p.fechaEvento) : <span className="opacity-30">—</span>}
                    </TableCell>
                    <TableCell>
                      <Select value={p.estado} onValueChange={v => updateEstadoMutation.mutate({ id: p.id, estado: v as PresupuestoEstado })}>
                        <SelectTrigger className={`h-7 text-xs border-0 px-2 gap-1 ${ec.cls}`} data-testid={`select-estado-${p.id}`}>
                          <EIcon className="h-3 w-3" />
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {(Object.keys(ESTADO_CONFIG) as PresupuestoEstado[]).map(e => (
                            <SelectItem key={e} value={e}>{ESTADO_CONFIG[e].label}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </TableCell>
                    <TableCell className="text-right font-semibold">
                      {parseFloat(p.total) > 0 ? `$ ${fmt(parseFloat(p.total))}` : <span className="text-muted-foreground text-xs">Catálogo</span>}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center justify-end gap-1">
                        <Button size="icon" variant="ghost" className="h-7 w-7" title="Descargar PDF" onClick={() => handleDownloadPdf(p.id)} data-testid={`button-pdf-${p.id}`}>
                          <FileDown className="h-3.5 w-3.5" />
                        </Button>
                        <Button size="icon" variant="ghost" className="h-7 w-7" title="Editar" onClick={() => handleEdit(p.id)} data-testid={`button-edit-${p.id}`}>
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                        <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive hover:text-destructive" title="Eliminar" onClick={() => setDeleteId(p.id)} data-testid={`button-delete-${p.id}`}>
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}

      {/* ── Dialogs ──────────────────────────────────────── */}
      {dialogOpen && (
        <PresupuestoDialog
          key={editingId ?? "new"}
          open={dialogOpen}
          onOpenChange={setDialogOpen}
          presupuesto={editingId && editingPres ? editingPres : null}
          onSaved={handleSaved}
        />
      )}

      <AlertDialog open={!!deleteId} onOpenChange={open => !open && setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar presupuesto?</AlertDialogTitle>
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
