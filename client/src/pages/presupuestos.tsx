import { useState, useCallback } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import {
  ClipboardList, Plus, Trash2, FileDown, Pencil,
  CheckCircle, Clock, Send, XCircle, AlertCircle,
  RotateCcw,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
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

const ESTADO_CONFIG: Record<PresupuestoEstado, { label: string; icon: typeof CheckCircle; cls: string }> = {
  borrador:  { label: "Borrador",  icon: Clock,         cls: "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300" },
  enviado:   { label: "Enviado",   icon: Send,          cls: "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300" },
  aceptado:  { label: "Aceptado", icon: CheckCircle,   cls: "bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300" },
  vencido:   { label: "Vencido",  icon: AlertCircle,   cls: "bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-300" },
  cancelado: { label: "Cancelado",icon: XCircle,       cls: "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300" },
};

const DEFAULT_CONDICIONES = `• Las tarifas incluyen IVA y todos los impuestos vigentes.
• Este presupuesto tiene validez hasta la fecha de vencimiento indicada. Pasada dicha fecha las tarifas pueden variar.
• Para confirmar la reserva se requiere un depósito del 50% del total.
• La cancelación dentro de las 48 hs previas al evento/check-in no da derecho a devolución.
• Las tarifas de alojamiento no incluyen consumos extras (minibar, lavandería, etc.) salvo indicación contraria.
• Precios en pesos argentinos (ARS).`;

// ─── Helpers ──────────────────────────────────────────────────────────────────
const toNum = (v: string) => parseFloat(v.replace(",", ".")) || 0;
const fmt = (v: number) => v.toLocaleString("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmtDate = (d: string) => { try { const [y,m,day] = d.split("-"); return `${day}/${m}/${y}`; } catch { return d; } };
const today = new Date().toLocaleDateString("en-CA", { timeZone: "America/Argentina/Buenos_Aires" });

function calcSubtotal(cant: string, precio: string, dto: string): string {
  const s = toNum(cant) * toNum(precio) * (1 - toNum(dto) / 100);
  return s.toFixed(2);
}

function emptyItem(): ItemRow {
  return { sector: "alojamiento", descripcion: "", detalle: "", cantidad: "1", precioUnitario: "0", descuento: "0", subtotal: "0" };
}

// ─── Item Row Component ───────────────────────────────────────────────────────
function ItemRowEdit({
  item, idx, onChange, onRemove, roomTypes,
}: {
  item: ItemRow; idx: number;
  onChange: (idx: number, field: keyof ItemRow, value: string) => void;
  onRemove: (idx: number) => void;
  roomTypes: RoomType[];
}) {
  const update = (field: keyof ItemRow, value: string) => {
    onChange(idx, field, value);
  };
  const updateCalc = (field: "cantidad" | "precioUnitario" | "descuento", value: string) => {
    const next = { ...item, [field]: value };
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
      {/* Sector */}
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

      {/* Descripción + presets */}
      <TableCell className="p-1">
        <div className="space-y-1">
          {item.sector === "alojamiento" && roomTypes.length > 0 && (
            <Select
              value=""
              onValueChange={v => {
                const rt = roomTypes.find(r => r.id === v);
                if (rt) {
                  update("descripcion", rt.name);
                  onChange(idx, "descripcion", rt.name);
                }
              }}
            >
              <SelectTrigger className="h-7 text-xs text-muted-foreground" data-testid={`select-room-type-${idx}`}>
                <SelectValue placeholder="Autocompletar tipo hab..." />
              </SelectTrigger>
              <SelectContent>
                {roomTypes.map(rt => (
                  <SelectItem key={rt.id} value={rt.id}>{rt.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
          <Input
            className="h-8 text-xs"
            value={item.descripcion}
            onChange={e => update("descripcion", e.target.value)}
            placeholder="Descripción del ítem"
            data-testid={`input-item-desc-${idx}`}
          />
          <Input
            className="h-7 text-xs text-muted-foreground"
            value={item.detalle}
            onChange={e => update("detalle", e.target.value)}
            placeholder="Detalle opcional (ej: doble, desayuno incluido...)"
            data-testid={`input-item-detail-${idx}`}
          />
        </div>
      </TableCell>

      {/* Cantidad */}
      <TableCell className="p-1 w-20">
        <Input
          className="h-8 text-xs text-right"
          value={item.cantidad}
          onChange={e => updateCalc("cantidad", e.target.value)}
          data-testid={`input-item-qty-${idx}`}
        />
      </TableCell>

      {/* Precio unitario */}
      <TableCell className="p-1 w-28">
        <div className="relative">
          <span className="absolute left-2 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">$</span>
          <Input
            className="h-8 text-xs text-right pl-5"
            value={item.precioUnitario}
            onChange={e => updateCalc("precioUnitario", e.target.value)}
            data-testid={`input-item-price-${idx}`}
          />
        </div>
      </TableCell>

      {/* Descuento */}
      <TableCell className="p-1 w-20">
        <div className="relative">
          <Input
            className="h-8 text-xs text-right pr-5"
            value={item.descuento}
            onChange={e => updateCalc("descuento", e.target.value)}
            data-testid={`input-item-dto-${idx}`}
          />
          <span className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">%</span>
        </div>
      </TableCell>

      {/* Subtotal */}
      <TableCell className="p-1 w-28 text-right font-semibold text-sm">
        $ {fmt(toNum(item.subtotal))}
      </TableCell>

      {/* Eliminar */}
      <TableCell className="p-1 w-8">
        <Button
          size="icon" variant="ghost"
          className="h-7 w-7 text-destructive opacity-0 group-hover:opacity-100 transition-opacity"
          onClick={() => onRemove(idx)}
          data-testid={`button-remove-item-${idx}`}
        >
          <Trash2 className="h-3.5 w-3.5" />
        </Button>
      </TableCell>
    </TableRow>
  );
}

// ─── Main Form Dialog ─────────────────────────────────────────────────────────
function PresupuestoDialog({
  open, onOpenChange, presupuesto, onSaved,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  presupuesto: PresupuestoWithItems | null;
  onSaved: () => void;
}) {
  const { toast } = useToast();
  const isEdit = !!presupuesto;

  const [para, setPara] = useState(presupuesto?.para || "");
  const [fechaEmision, setFechaEmision] = useState(presupuesto?.fechaEmision || today);
  const [fechaVencimiento, setFechaVencimiento] = useState(presupuesto?.fechaVencimiento || "");
  const [estado, setEstado] = useState<PresupuestoEstado>(presupuesto?.estado || "borrador");
  const [notas, setNotas] = useState(presupuesto?.notas || "");
  const [condiciones, setCondiciones] = useState(presupuesto?.condiciones || DEFAULT_CONDICIONES);
  const [descuentoGlobal, setDescuentoGlobal] = useState(presupuesto?.descuentoGlobal || "0");
  const [items, setItems] = useState<ItemRow[]>(
    presupuesto?.items?.length
      ? presupuesto.items.map(it => ({
          id: it.id,
          sector: it.sector as Sector,
          descripcion: it.descripcion,
          detalle: it.detalle || "",
          cantidad: String(it.cantidad),
          precioUnitario: String(it.precioUnitario),
          descuento: String(it.descuento),
          subtotal: String(it.subtotal),
        }))
      : [emptyItem()]
  );

  const { data: roomTypes = [] } = useQuery<RoomType[]>({ queryKey: ["/api/room-types"] });

  const subtotalSuma = items.reduce((acc, it) => acc + toNum(it.subtotal), 0);
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
    estado,
    notas: notas.trim() || null,
    condiciones: condiciones.trim() || null,
    descuentoGlobal: descuentoGlobal || "0",
    subtotal: subtotalSuma.toFixed(2),
    total: totalFinal.toFixed(2),
    items: items.map((it, ord) => ({
      ...(it.id ? { id: it.id } : {}),
      sector: it.sector,
      descripcion: it.descripcion.trim(),
      detalle: it.detalle.trim() || null,
      cantidad: it.cantidad,
      precioUnitario: it.precioUnitario,
      descuento: it.descuento,
      subtotal: it.subtotal,
      orden: ord,
    })),
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

  const valid = para.trim().length > 0 && items.length > 0 && items.every(it => it.descripcion.trim().length > 0);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl max-h-[95vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ClipboardList className="h-5 w-5 text-primary" />
            {isEdit ? `Editar ${presupuesto!.numero}` : "Nuevo Presupuesto"}
          </DialogTitle>
          <DialogDescription>
            {isEdit ? `Última edición: ${presupuesto?.numero}` : "Complete los datos y agregue los ítems del presupuesto"}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5 py-2">
          {/* ── Header fields ─────────────────────────────── */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 p-4 bg-muted/30 rounded-lg border">
            <div className="col-span-2 md:col-span-2">
              <Label>Para (dirigido a) *</Label>
              <Input
                value={para}
                onChange={e => setPara(e.target.value)}
                placeholder="Nombre del cliente, empresa o agencia..."
                className="mt-1"
                data-testid="input-para"
              />
            </div>
            <div>
              <Label>Fecha de emisión</Label>
              <Input type="date" value={fechaEmision} onChange={e => setFechaEmision(e.target.value)} className="mt-1" data-testid="input-fecha-emision" />
            </div>
            <div>
              <Label>Válido hasta</Label>
              <Input type="date" value={fechaVencimiento} onChange={e => setFechaVencimiento(e.target.value)} className="mt-1" data-testid="input-fecha-vencimiento" />
            </div>
            <div className="col-span-2">
              <Label>Notas internas (no aparecen en el PDF)</Label>
              <Input
                value={notas}
                onChange={e => setNotas(e.target.value)}
                placeholder="Observaciones internas, contacto, teléfono..."
                className="mt-1"
                data-testid="input-notas"
              />
            </div>
            <div>
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
          </div>

          {/* ── Items ─────────────────────────────────────── */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label className="text-base font-semibold">Ítems del presupuesto</Label>
              <Button size="sm" variant="outline" onClick={handleAddItem} data-testid="button-add-item">
                <Plus className="h-3.5 w-3.5 mr-1" /> Agregar ítem
              </Button>
            </div>

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
                  ) : (
                    items.map((item, idx) => (
                      <ItemRowEdit
                        key={idx}
                        item={item}
                        idx={idx}
                        onChange={handleItemChange}
                        onRemove={handleRemoveItem}
                        roomTypes={roomTypes}
                      />
                    ))
                  )}
                </TableBody>
              </Table>
            </div>

            {/* Totals */}
            <div className="flex justify-end">
              <div className="space-y-1 w-64">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">Subtotal</span>
                  <span className="font-medium">$ {fmt(subtotalSuma)}</span>
                </div>
                <div className="flex items-center gap-2 justify-between text-sm">
                  <span className="text-muted-foreground">Descuento global</span>
                  <div className="relative w-24">
                    <Input
                      className="h-7 text-xs text-right pr-5"
                      value={descuentoGlobal}
                      onChange={e => setDescuentoGlobal(e.target.value)}
                      data-testid="input-descuento-global"
                    />
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

          {/* ── Condiciones ───────────────────────────────── */}
          <div className="space-y-1">
            <div className="flex items-center justify-between">
              <Label>Condiciones y observaciones (aparecen en el PDF)</Label>
              <Button
                size="sm" variant="ghost" className="text-xs h-7"
                onClick={() => setCondiciones(DEFAULT_CONDICIONES)}
              >
                <RotateCcw className="h-3 w-3 mr-1" /> Restaurar texto
              </Button>
            </div>
            <Textarea
              value={condiciones}
              onChange={e => setCondiciones(e.target.value)}
              rows={6}
              className="text-sm font-mono"
              placeholder="Texto de condiciones que aparecerá al pie del presupuesto PDF..."
              data-testid="textarea-condiciones"
            />
          </div>
        </div>

        <DialogFooter className="gap-2 flex-wrap">
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button
            onClick={() => saveMutation.mutate(buildPayload())}
            disabled={!valid || saveMutation.isPending}
            data-testid="button-save-presupuesto"
          >
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
  const [search, setSearch] = useState("");

  const { data: lista = [], isLoading } = useQuery<Presupuesto[]>({ queryKey: ["/api/presupuestos"] });

  const { data: editingPres } = useQuery<PresupuestoWithItems>({
    queryKey: ["/api/presupuestos", editingId],
    enabled: !!editingId,
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => apiRequest("DELETE", `/api/presupuestos/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/presupuestos"] });
      toast({ title: "Presupuesto eliminado" });
      setDeleteId(null);
    },
    onError: () => toast({ title: "Error al eliminar", variant: "destructive" }),
  });

  const updateEstadoMutation = useMutation({
    mutationFn: ({ id, estado }: { id: string; estado: PresupuestoEstado }) =>
      apiRequest("PATCH", `/api/presupuestos/${id}`, { estado }).then(r => r.json()),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/presupuestos"] });
      toast({ title: "Estado actualizado" });
    },
    onError: () => toast({ title: "Error", variant: "destructive" }),
  });

  const filtered = lista.filter(p => {
    if (estadoFilter !== "todos" && p.estado !== estadoFilter) return false;
    if (search) {
      const q = search.toLowerCase();
      return p.numero.toLowerCase().includes(q) || p.para.toLowerCase().includes(q);
    }
    return true;
  });

  // Stats
  const stats = {
    total: lista.length,
    borrador: lista.filter(p => p.estado === "borrador").length,
    enviado: lista.filter(p => p.estado === "enviado").length,
    aceptado: lista.filter(p => p.estado === "aceptado").length,
    vencido: lista.filter(p => p.estado === "vencido").length,
  };

  const handleEdit = (id: string) => {
    setEditingId(id);
    setDialogOpen(true);
  };
  const handleNew = () => {
    setEditingId(null);
    setDialogOpen(true);
  };
  const handleSaved = () => {
    setEditingId(null);
  };
  const handleDownloadPdf = (id: string) => {
    window.open(`/api/presupuestos/${id}/pdf`, "_blank");
  };

  return (
    <div className="p-6 space-y-5">
      {/* ── Title ─────────────────────────────────────────── */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-2">
          <ClipboardList className="h-6 w-6 text-muted-foreground" />
          <h1 className="text-2xl font-bold" data-testid="text-page-title">Presupuestos</h1>
        </div>
        <Button onClick={handleNew} data-testid="button-nuevo-presupuesto">
          <Plus className="h-4 w-4 mr-1" /> Nuevo presupuesto
        </Button>
      </div>

      {/* ── Stats ─────────────────────────────────────────── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {([
          { label: "Borradores", count: stats.borrador, estado: "borrador" as PresupuestoEstado, color: "text-gray-600 dark:text-gray-400", bg: "bg-gray-100 dark:bg-gray-800/50" },
          { label: "Enviados",   count: stats.enviado,  estado: "enviado"  as PresupuestoEstado, color: "text-blue-600 dark:text-blue-400",  bg: "bg-blue-50 dark:bg-blue-900/20" },
          { label: "Aceptados",  count: stats.aceptado, estado: "aceptado" as PresupuestoEstado, color: "text-green-600 dark:text-green-400", bg: "bg-green-50 dark:bg-green-900/20" },
          { label: "Vencidos",   count: stats.vencido,  estado: "vencido"  as PresupuestoEstado, color: "text-orange-600 dark:text-orange-400", bg: "bg-orange-50 dark:bg-orange-900/20" },
        ]).map(s => (
          <button
            key={s.estado}
            onClick={() => setEstadoFilter(prev => prev === s.estado ? "todos" : s.estado)}
            className={`rounded-lg border p-4 text-left transition-all hover:shadow-sm ${s.bg} ${estadoFilter === s.estado ? "ring-2 ring-primary" : ""}`}
            data-testid={`stat-card-${s.estado}`}
          >
            <p className={`text-2xl font-bold ${s.color}`}>{s.count}</p>
            <p className="text-xs text-muted-foreground mt-0.5">{s.label}</p>
          </button>
        ))}
      </div>

      {/* ── Filters ───────────────────────────────────────── */}
      <div className="flex items-center gap-3 flex-wrap">
        <Input
          placeholder="Buscar por número o destinatario..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="max-w-sm"
          data-testid="input-search"
        />
        {estadoFilter !== "todos" && (
          <Button size="sm" variant="ghost" onClick={() => setEstadoFilter("todos")} className="text-xs">
            <XCircle className="h-3.5 w-3.5 mr-1" /> Quitar filtro
          </Button>
        )}
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
                <TableHead className="text-xs">Para</TableHead>
                <TableHead className="text-xs">Emisión</TableHead>
                <TableHead className="text-xs">Vence</TableHead>
                <TableHead className="text-xs">Estado</TableHead>
                <TableHead className="text-xs text-right">Total</TableHead>
                <TableHead className="w-36" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map(p => {
                const ec = ESTADO_CONFIG[p.estado as PresupuestoEstado] || ESTADO_CONFIG.borrador;
                const EIcon = ec.icon;
                return (
                  <TableRow key={p.id} className="hover:bg-muted/30" data-testid={`row-presupuesto-${p.id}`}>
                    <TableCell className="font-mono text-sm font-semibold text-primary">{p.numero}</TableCell>
                    <TableCell className="font-medium max-w-[200px] truncate">{p.para}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">{fmtDate(p.fechaEmision)}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {p.fechaVencimiento ? fmtDate(p.fechaVencimiento) : <span className="opacity-30">—</span>}
                    </TableCell>
                    <TableCell>
                      <Select
                        value={p.estado}
                        onValueChange={v => updateEstadoMutation.mutate({ id: p.id, estado: v as PresupuestoEstado })}
                      >
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
                      $ {fmt(parseFloat(p.total))}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center justify-end gap-1">
                        <Button
                          size="icon" variant="ghost" className="h-7 w-7"
                          title="Descargar PDF"
                          onClick={() => handleDownloadPdf(p.id)}
                          data-testid={`button-pdf-${p.id}`}
                        >
                          <FileDown className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          size="icon" variant="ghost" className="h-7 w-7"
                          title="Editar"
                          onClick={() => handleEdit(p.id)}
                          data-testid={`button-edit-${p.id}`}
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          size="icon" variant="ghost" className="h-7 w-7 text-destructive hover:text-destructive"
                          title="Eliminar"
                          onClick={() => setDeleteId(p.id)}
                          data-testid={`button-delete-${p.id}`}
                        >
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

      {/* ── Create/Edit Dialog ────────────────────────────── */}
      {dialogOpen && (
        <PresupuestoDialog
          key={editingId ?? "new"}
          open={dialogOpen}
          onOpenChange={setDialogOpen}
          presupuesto={editingId && editingPres ? editingPres : null}
          onSaved={handleSaved}
        />
      )}

      {/* ── Delete Confirm ────────────────────────────────── */}
      <AlertDialog open={!!deleteId} onOpenChange={open => !open && setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar presupuesto?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta acción no se puede deshacer. El presupuesto y todos sus ítems serán eliminados.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => deleteId && deleteMutation.mutate(deleteId)}
            >
              Eliminar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
