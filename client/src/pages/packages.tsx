import { useState, useEffect } from "react";
import { fmtMoney } from "@/lib/utils";
import { useQuery, useMutation } from "@tanstack/react-query";
import {
  Package,
  Plus,
  Edit,
  Trash2,
  Calendar,
  Moon,
  DollarSign,
  Gift,
  Tag,
  Copy,
  ToggleLeft,
  ToggleRight,
  Percent,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { queryClient, apiRequest, parseApiError } from "@/lib/queryClient";
import type { PackageWithDetails, RoomType, PackageStatus, PackageItemType } from "@shared/schema";

type RoomPriceRow = { roomTypeId: string; extraAmount: string };

function decimalForApi(value: string | number | null | undefined): string | null {
  if (value === null || value === undefined || value === "") return null;
  const numeric = typeof value === "number" ? value : Number(value);
  return Number.isFinite(numeric) ? numeric.toFixed(2) : null;
}

function PackageStatusBadge({ status }: { status: PackageStatus }) {
  const config: Record<PackageStatus, { label: string; variant: "default" | "secondary" | "destructive" }> = {
    active: { label: "Activo", variant: "default" },
    inactive: { label: "Inactivo", variant: "secondary" },
    expired: { label: "Expirado", variant: "destructive" },
  };
  const c = config[status];
  return <Badge variant={c.variant}>{c.label}</Badge>;
}

const itemTypeLabels: Record<PackageItemType, string> = {
  accommodation: "Alojamiento",
  breakfast: "Desayuno",
  dinner: "Cena",
  spa: "SPA",
  restaurant: "Restaurante",
  event: "Evento",
  transfer: "Traslado",
  other: "Otro",
};

function PackageFormDialog({
  pkg,
  open,
  onOpenChange,
  onSuccess,
}: {
  pkg?: PackageWithDetails;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
}) {
  const { toast } = useToast();
  const isEditing = !!pkg;

  const [name, setName] = useState(pkg?.name || "");
  const [description, setDescription] = useState(pkg?.description || "");
  const [nights, setNights] = useState(pkg?.nights || 1);
  const [basePrice, setBasePrice] = useState(pkg?.basePrice || "");
  const [discountPercent, setDiscountPercent] = useState(pkg?.discountPercent || "");
  const [validFrom, setValidFrom] = useState(pkg?.validFrom || "");
  const [validUntil, setValidUntil] = useState(pkg?.validUntil || "");
  const [status, setStatus] = useState<PackageStatus>(pkg?.status || "active");
  const [terms, setTerms] = useState(pkg?.terms || "");
  const [items, setItems] = useState<{ itemType: PackageItemType; description: string; quantity: number }[]>(
    pkg?.items?.map(i => ({ itemType: i.itemType, description: i.description, quantity: i.quantity })) || []
  );
  const [roomPrices, setRoomPrices] = useState<RoomPriceRow[]>(
    pkg?.roomPrices?.map(rp => ({ roomTypeId: rp.roomTypeId, extraAmount: rp.extraAmount ?? "0" })) || []
  );

  useEffect(() => {
    if (open) {
      setName(pkg?.name || "");
      setDescription(pkg?.description || "");
      setNights(pkg?.nights || 1);
      setBasePrice(pkg?.basePrice || "");
      setDiscountPercent(pkg?.discountPercent || "");
      setValidFrom(pkg?.validFrom || "");
      setValidUntil(pkg?.validUntil || "");
      setStatus(pkg?.status || "active");
      setTerms(pkg?.terms || "");
      setItems(pkg?.items?.map(i => ({ itemType: i.itemType, description: i.description, quantity: i.quantity })) || []);
      setRoomPrices(pkg?.roomPrices?.map(rp => ({ roomTypeId: rp.roomTypeId, extraAmount: rp.extraAmount ?? "0" })) || []);
    }
  }, [open, pkg?.id]);

  const { data: roomTypes } = useQuery<RoomType[]>({ queryKey: ["/api/room-types"] });

  const createMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/packages", {
        name,
        description,
        roomTypeId: null,
        nights,
         basePrice: decimalForApi(basePrice) ?? "0.00",
         discountPercent: decimalForApi(discountPercent),
        validFrom: validFrom || null,
        validUntil: validUntil || null,
        status,
        terms,
      });
      const newPkg = await res.json();
      for (const item of items) {
        await apiRequest("POST", `/api/packages/${newPkg.id}/items`, item);
      }
      for (const rp of roomPrices.filter(r => r.roomTypeId)) {
        const extra = parseFloat(rp.extraAmount || "0") || 0;
        const total = (parseFloat(basePrice) || 0) + extra;
        await apiRequest("POST", `/api/packages/${newPkg.id}/room-prices`, {
          roomTypeId: rp.roomTypeId,
          price: fmtMoney(total),
          extraAmount: fmtMoney(extra),
        });
      }
      return newPkg;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/packages"] });
      toast({ title: "Paquete creado exitosamente" });
      onSuccess();
      onOpenChange(false);
    },
   onError: (error) => {
      toast({ title: "Error al crear paquete", description: parseApiError(error), variant: "destructive" });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async () => {
      await apiRequest("PATCH", `/api/packages/${pkg!.id}`, {
        name,
        description,
        roomTypeId: null,
        nights,
         basePrice: decimalForApi(basePrice) ?? "0.00",
         discountPercent: decimalForApi(discountPercent),
        validFrom: validFrom || null,
        validUntil: validUntil || null,
        status,
        terms,
      });
      for (const existingItem of pkg!.items) {
        await apiRequest("DELETE", `/api/package-items/${existingItem.id}`);
      }
      for (const item of items) {
        await apiRequest("POST", `/api/packages/${pkg!.id}/items`, item);
      }
      for (const existingRp of pkg!.roomPrices) {
        await apiRequest("DELETE", `/api/package-room-prices/${existingRp.id}`);
      }
      for (const rp of roomPrices.filter(r => r.roomTypeId)) {
        const extra = parseFloat(rp.extraAmount || "0") || 0;
        const total = (parseFloat(basePrice) || 0) + extra;
        await apiRequest("POST", `/api/packages/${pkg!.id}/room-prices`, {
          roomTypeId: rp.roomTypeId,
          price: fmtMoney(total),
          extraAmount: fmtMoney(extra),
        });
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/packages"] });
      toast({ title: "Paquete actualizado exitosamente" });
      onSuccess();
      onOpenChange(false);
    },
   onError: (error) => {
      toast({ title: "Error al actualizar paquete", description: parseApiError(error), variant: "destructive" });
    },
  });

  const handleSubmit = () => {
    if (!name || !basePrice) {
      toast({ title: "Nombre y precio base son requeridos", variant: "destructive" });
      return;
    }
    const invalidRoomPrice = roomPrices.some(rp => !rp.roomTypeId);
    if (invalidRoomPrice) {
      toast({ title: "Seleccioná el tipo de habitación en cada fila", variant: "destructive" });
      return;
    }
    if (isEditing) {
      updateMutation.mutate();
    } else {
      createMutation.mutate();
    }
  };

  const addRoomPrice = () => setRoomPrices([...roomPrices, { roomTypeId: "", extraAmount: "" }]);
  const updateRoomPrice = (idx: number, field: keyof RoomPriceRow, value: string) => {
    const updated = [...roomPrices];
    updated[idx][field] = value;
    setRoomPrices(updated);
  };
  const removeRoomPrice = (idx: number) => setRoomPrices(roomPrices.filter((_, i) => i !== idx));

  const addItem = () => {
    setItems([...items, { itemType: "breakfast", description: "", quantity: 1 }]);
  };

  const updateItem = (idx: number, field: string, value: any) => {
    const newItems = [...items];
    (newItems[idx] as any)[field] = value;
    setItems(newItems);
  };

  const removeItem = (idx: number) => {
    setItems(items.filter((_, i) => i !== idx));
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isEditing ? "Editar Paquete" : "Nuevo Paquete"}</DialogTitle>
          <DialogDescription>
            {isEditing ? "Modifique los datos del paquete" : "Configure un nuevo paquete turístico"}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="col-span-2">
              <Label>Nombre del Paquete *</Label>
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Ej: Escapada Relax 2 Noches"
                data-testid="input-package-name"
              />
            </div>

            <div className="col-span-2">
              <Label>Descripción</Label>
              <Textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Descripción del paquete..."
                rows={2}
                data-testid="input-package-description"
              />
            </div>

            <div>
              <Label>Noches</Label>
              <Input
                type="number"
                min={1}
                value={nights}
                onChange={(e) => setNights(parseInt(e.target.value) || 1)}
                data-testid="input-package-nights"
              />
            </div>

            <div>
              <Label>Precio Base * <span className="text-xs font-normal text-muted-foreground">(con IVA incluido)</span></Label>
              <Input
                type="number"
                step="0.01"
                value={basePrice}
                onChange={(e) => setBasePrice(e.target.value)}
                placeholder="0.00"
                data-testid="input-package-price"
              />
            </div>

            <div>
              <Label>Descuento %</Label>
              <Input
                type="number"
                step="0.01"
                value={discountPercent}
                onChange={(e) => setDiscountPercent(e.target.value)}
                placeholder="0.00"
                data-testid="input-package-discount"
              />
            </div>

            <div>
              <Label>Válido Desde</Label>
              <Input
                type="date"
                value={validFrom}
                onChange={(e) => setValidFrom(e.target.value)}
                data-testid="input-package-valid-from"
              />
            </div>

            <div>
              <Label>Válido Hasta</Label>
              <Input
                type="date"
                value={validUntil}
                onChange={(e) => setValidUntil(e.target.value)}
                data-testid="input-package-valid-until"
              />
            </div>

            <div>
              <Label>Estado</Label>
              <Select value={status} onValueChange={(v) => setStatus(v as PackageStatus)}>
                <SelectTrigger data-testid="select-package-status">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="active">Activo</SelectItem>
                  <SelectItem value="inactive">Inactivo</SelectItem>
                  <SelectItem value="expired">Expirado</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="border-t pt-4">
            <div className="flex items-center justify-between mb-3">
              <Label className="text-base font-medium">Servicios Incluidos</Label>
              <Button type="button" variant="outline" size="sm" onClick={addItem} data-testid="button-add-package-item">
                <Plus className="mr-2 h-4 w-4" />
                Agregar
              </Button>
            </div>
            
            {items.length > 0 ? (
              <div className="space-y-2">
                {items.map((item, idx) => (
                  <div key={idx} className="flex gap-2 items-center">
                    <Select value={item.itemType} onValueChange={(v) => updateItem(idx, "itemType", v)}>
                      <SelectTrigger className="w-[140px]" data-testid={`select-item-type-${idx}`}>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {Object.entries(itemTypeLabels).map(([value, label]) => (
                          <SelectItem key={value} value={value}>{label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Input
                      value={item.description}
                      onChange={(e) => updateItem(idx, "description", e.target.value)}
                      placeholder="Descripción del servicio"
                      className="flex-1"
                      data-testid={`input-item-description-${idx}`}
                    />
                    <Input
                      type="number"
                      value={item.quantity}
                      onChange={(e) => updateItem(idx, "quantity", parseInt(e.target.value) || 1)}
                      className="w-16"
                      min={1}
                      data-testid={`input-item-quantity-${idx}`}
                    />
                    <Button type="button" variant="ghost" size="icon" onClick={() => removeItem(idx)}>
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground text-center py-4">
                No hay servicios incluidos. Agregue servicios al paquete.
              </p>
            )}
          </div>

          <div className="border-t pt-4">
            <div className="flex items-center justify-between mb-3">
              <div>
                <Label className="text-base font-medium">Tarifas por Tipo de Habitación</Label>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Si no agregás ninguna, se usa el Precio Base para todas las categorías.
                </p>
              </div>
              <Button type="button" variant="outline" size="sm" onClick={addRoomPrice} data-testid="button-add-room-price">
                <Plus className="mr-2 h-4 w-4" />
                Agregar habitación
              </Button>
            </div>

            {roomPrices.length > 0 ? (
              <div className="space-y-3">
                <div className="grid grid-cols-[1fr_140px_120px_auto] gap-2 text-xs font-medium text-muted-foreground px-1">
                  <span>Tipo de Habitación</span>
                  <span>Monto extra</span>
                  <span>Precio final</span>
                  <span></span>
                </div>
                {roomPrices.map((rp, idx) => {
                  const extra = parseFloat(rp.extraAmount || "0") || 0;
                  const base = parseFloat(basePrice as string) || 0;
                  const total = base + extra;
                  return (
                    <div key={idx} className="grid grid-cols-[1fr_140px_120px_auto] gap-2 items-center">
                      <Select
                        value={rp.roomTypeId}
                        onValueChange={(v) => updateRoomPrice(idx, "roomTypeId", v)}
                      >
                        <SelectTrigger data-testid={`select-room-price-type-${idx}`}>
                          <SelectValue placeholder="Seleccionar tipo..." />
                        </SelectTrigger>
                        <SelectContent>
                          {roomTypes?.filter(rt => rt.id && !roomPrices.some((r, i) => i !== idx && r.roomTypeId === rt.id)).map((rt) => (
                            <SelectItem key={rt.id} value={rt.id}>
                              {rt.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <div className="relative">
                        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">+$</span>
                        <Input
                          type="number"
                          step="0.01"
                          min={0}
                          value={rp.extraAmount}
                          onChange={(e) => updateRoomPrice(idx, "extraAmount", e.target.value)}
                          placeholder="0.00"
                          className="pl-8"
                          data-testid={`input-room-extra-${idx}`}
                        />
                      </div>
                      <div className="flex items-center justify-center rounded-md bg-muted px-3 h-10 text-sm font-semibold tabular-nums">
                        ${fmtMoney(total)}
                      </div>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        onClick={() => removeRoomPrice(idx)}
                        data-testid={`button-remove-room-price-${idx}`}
                      >
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </div>
                  );
                })}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground text-center py-3 border border-dashed rounded-md">
                Sin extras — se aplica el Precio Base a todas las categorías.
              </p>
            )}
          </div>

          <div className="border-t pt-4">
            <Label>Términos y Condiciones</Label>
            <Textarea
              value={terms}
              onChange={(e) => setTerms(e.target.value)}
              placeholder="Términos, restricciones, notas..."
              rows={2}
              data-testid="input-package-terms"
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={createMutation.isPending || updateMutation.isPending}
            data-testid="button-save-package"
          >
            {(createMutation.isPending || updateMutation.isPending) ? "Guardando..." : (isEditing ? "Actualizar" : "Crear")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default function PackagesPage() {
  const { toast } = useToast();
  const [showFormDialog, setShowFormDialog] = useState(false);
  const [editingPackage, setEditingPackage] = useState<PackageWithDetails | undefined>();
  const [deletePackageId, setDeletePackageId] = useState<string | null>(null);

  const { data: packages, isLoading } = useQuery<PackageWithDetails[]>({
    queryKey: ["/api/packages"],
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => apiRequest("DELETE", `/api/packages/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/packages"] });
      toast({ title: "Paquete eliminado" });
      setDeletePackageId(null);
    },
    onError: () => {
      toast({ title: "Error al eliminar paquete", variant: "destructive" });
    },
  });

  const duplicateMutation = useMutation({
    mutationFn: (id: string) => apiRequest("POST", `/api/packages/${id}/duplicate`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/packages"] });
      toast({ title: "Paquete duplicado exitosamente" });
    },
    onError: () => {
      toast({ title: "Error al duplicar paquete", variant: "destructive" });
    },
  });

  const toggleStatusMutation = useMutation({
    mutationFn: (id: string) => apiRequest("PATCH", `/api/packages/${id}/toggle-status`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/packages"] });
      toast({ title: "Estado del paquete actualizado" });
    },
    onError: () => {
      toast({ title: "Error al cambiar estado", variant: "destructive" });
    },
  });

  const handleEdit = (pkg: PackageWithDetails) => {
    setEditingPackage(pkg);
    setShowFormDialog(true);
  };

  const handleNew = () => {
    setEditingPackage(undefined);
    setShowFormDialog(true);
  };

  if (isLoading) {
    return (
      <div className="p-6 space-y-6">
        <Skeleton className="h-10 w-64" />
        <div className="grid gap-4 md:grid-cols-3">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-48" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6 p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight" data-testid="text-page-title">
            Paquetes Turísticos
          </h1>
          <p className="text-muted-foreground">
            Gestione paquetes con noches y servicios incluidos
          </p>
        </div>
        <Button onClick={handleNew} data-testid="button-new-package">
          <Plus className="mr-2 h-4 w-4" />
          Nuevo Paquete
        </Button>
      </div>

      {packages && packages.length > 0 ? (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {packages.map((pkg) => (
            <Card key={pkg.id} className="hover-elevate" data-testid={`card-package-${pkg.id}`}>
              <CardHeader className="pb-2">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <CardTitle className="text-lg truncate">{pkg.name}</CardTitle>
                    <CardDescription className="font-mono text-xs">{pkg.code}</CardDescription>
                  </div>
                  <PackageStatusBadge status={pkg.status} />
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                {pkg.description && (
                  <p className="text-sm text-muted-foreground line-clamp-2">{pkg.description}</p>
                )}

                <div className="flex flex-wrap gap-3 text-sm">
                  <div className="flex items-center gap-1">
                    <Moon className="h-4 w-4 text-muted-foreground" />
                    <span>{pkg.nights} noches</span>
                  </div>
                  {(!pkg.roomPrices || pkg.roomPrices.length === 0) && (
                    <div className="flex items-center gap-1">
                      <DollarSign className="h-4 w-4 text-muted-foreground" />
                      <span className="font-semibold">${pkg.basePrice}</span>
                    </div>
                  )}
                  {pkg.discountPercent && parseFloat(pkg.discountPercent) > 0 && (
                    <div className="flex items-center gap-1">
                      <Percent className="h-4 w-4 text-muted-foreground" />
                      <Badge variant="secondary" data-testid={`badge-discount-${pkg.id}`}>-{pkg.discountPercent}%</Badge>
                    </div>
                  )}
                </div>

                {pkg.roomPrices && pkg.roomPrices.length > 0 && (
                  <div className="space-y-1" data-testid={`room-prices-${pkg.id}`}>
                    {pkg.roomPrices.map((rp) => {
                      const extra = parseFloat(rp.extraAmount ?? "0") || 0;
                      return (
                        <div key={rp.id} className="flex items-center justify-between text-sm">
                          <div className="flex items-center gap-1 text-muted-foreground">
                            <Tag className="h-3.5 w-3.5" />
                            <span>{rp.roomType?.name || rp.roomTypeId}</span>
                          </div>
                          <div className="text-right">
                            <span className="font-semibold">${rp.price}</span>
                            {extra > 0 && (
                              <span className="ml-1 text-xs text-muted-foreground">(+${fmtMoney(extra)})</span>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}

                {pkg.items && pkg.items.length > 0 && (
                  <div className="flex flex-wrap gap-1">
                    {pkg.items.slice(0, 3).map((item, idx) => (
                      <Badge key={idx} variant="outline" className="text-xs">
                        {itemTypeLabels[item.itemType]} x{item.quantity}
                      </Badge>
                    ))}
                    {pkg.items.length > 3 && (
                      <Badge variant="outline" className="text-xs">+{pkg.items.length - 3}</Badge>
                    )}
                  </div>
                )}

                <div className="flex items-center gap-1 text-xs text-muted-foreground">
                  <Calendar className="h-3 w-3" />
                  {pkg.validFrom || pkg.validUntil ? (
                    <span data-testid={`text-validity-${pkg.id}`}>
                      {pkg.validFrom ? new Date(pkg.validFrom + "T12:00:00").toLocaleDateString("es-AR") : "Sin inicio"} - {pkg.validUntil ? new Date(pkg.validUntil + "T12:00:00").toLocaleDateString("es-AR") : "Sin fin"}
                    </span>
                  ) : (
                    <span data-testid={`text-validity-${pkg.id}`}>Sin restricción de fechas</span>
                  )}
                </div>

                <div className="flex flex-wrap gap-2 pt-2 border-t">
                  <Button variant="outline" size="sm" onClick={() => handleEdit(pkg)} data-testid={`button-edit-package-${pkg.id}`}>
                    <Edit className="mr-2 h-4 w-4" />
                    Editar
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => duplicateMutation.mutate(pkg.id)}
                    disabled={duplicateMutation.isPending}
                    data-testid={`button-duplicate-package-${pkg.id}`}
                  >
                    <Copy className="mr-2 h-4 w-4" />
                    Duplicar
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => toggleStatusMutation.mutate(pkg.id)}
                    disabled={toggleStatusMutation.isPending}
                    data-testid={`button-toggle-status-${pkg.id}`}
                  >
                    {pkg.status === "active" ? (
                      <ToggleRight className="mr-2 h-4 w-4" />
                    ) : (
                      <ToggleLeft className="mr-2 h-4 w-4" />
                    )}
                    {pkg.status === "active" ? "Desactivar" : "Activar"}
                  </Button>
                  <Button variant="ghost" size="sm" onClick={() => setDeletePackageId(pkg.id)} data-testid={`button-delete-package-${pkg.id}`}>
                    <Trash2 className="h-4 w-4 text-destructive" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <Gift className="h-12 w-12 text-muted-foreground/50" />
            <h3 className="mt-4 text-lg font-medium">No hay paquetes</h3>
            <p className="text-muted-foreground text-center max-w-md mt-1">
              Cree paquetes turísticos con noches y servicios incluidos para ofrecer promociones a sus huéspedes.
            </p>
            <Button className="mt-4" onClick={handleNew}>
              <Plus className="mr-2 h-4 w-4" />
              Crear Primer Paquete
            </Button>
          </CardContent>
        </Card>
      )}

      <PackageFormDialog
        pkg={editingPackage}
        open={showFormDialog}
        onOpenChange={setShowFormDialog}
        onSuccess={() => {}}
      />

      <Dialog open={!!deletePackageId} onOpenChange={() => setDeletePackageId(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Confirmar Eliminación</DialogTitle>
            <DialogDescription>
              ¿Está seguro que desea eliminar este paquete? Esta acción no se puede deshacer.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeletePackageId(null)}>
              Cancelar
            </Button>
            <Button
              variant="destructive"
              onClick={() => deletePackageId && deleteMutation.mutate(deletePackageId)}
              disabled={deleteMutation.isPending}
            >
              {deleteMutation.isPending ? "Eliminando..." : "Eliminar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
