import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { subDays } from "date-fns";
import { formatDateAR } from "@/lib/utils";
import {
  DollarSign,
  Plus,
  Search,
  MoreHorizontal,
  Pencil,
  Trash2,
  CheckCircle,
  XCircle,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
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
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import { queryClient, apiRequest } from "@/lib/queryClient";
import type { RatePlanWithRoomType, RoomType, InsertRatePlan } from "@shared/schema";

function RatePlanFormDialog({
  ratePlan,
  roomTypes,
  open,
  onOpenChange,
  onSuccess,
}: {
  ratePlan?: RatePlanWithRoomType;
  roomTypes: RoomType[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
}) {
  const { toast } = useToast();
  const isEditing = !!ratePlan;

  const [formData, setFormData] = useState<Partial<InsertRatePlan>>({
    name: ratePlan?.name || "",
    roomTypeId: ratePlan?.roomTypeId || "",
    baseRate: ratePlan?.baseRate || "",
    rate1pax: ratePlan?.rate1pax || "",
    rate2pax: ratePlan?.rate2pax || "",
    rate3pax: ratePlan?.rate3pax || "",
    rate4pax: ratePlan?.rate4pax || "",
    currency: ratePlan?.currency || "ARS",
    refundable: ratePlan?.refundable || "true",
    cancellationPolicy: ratePlan?.cancellationPolicy || "",
    validFrom: ratePlan?.validFrom || "",
    validTo: ratePlan?.validTo || "",
  });
  const [versionMode, setVersionMode] = useState<"direct" | "new_version">("direct");
  const [effectiveFrom, setEffectiveFrom] = useState<string>("");

  useEffect(() => {
    if (open) {
      setFormData({
        name: ratePlan?.name || "",
        roomTypeId: ratePlan?.roomTypeId || "",
        baseRate: ratePlan?.baseRate || "",
        rate1pax: ratePlan?.rate1pax || "",
        rate2pax: ratePlan?.rate2pax || "",
        rate3pax: ratePlan?.rate3pax || "",
        rate4pax: ratePlan?.rate4pax || "",
        currency: ratePlan?.currency || "ARS",
        refundable: ratePlan?.refundable || "true",
        cancellationPolicy: ratePlan?.cancellationPolicy || "",
        validFrom: ratePlan?.validFrom || "",
        validTo: ratePlan?.validTo || "",
      });
      setVersionMode("direct");
      setEffectiveFrom("");
    }
  }, [open, ratePlan?.id]);

  const selectedRoomType = roomTypes.find(rt => rt.id === formData.roomTypeId);
  const maxOcc = selectedRoomType?.maxOccupancy || 4;

  const mutation = useMutation({
    mutationFn: async (data: Partial<InsertRatePlan>) => {
      const payload = Object.fromEntries(
        Object.entries(data).filter(([_, v]) => v !== "" && v !== undefined)
      );
      if (isEditing) {
        return apiRequest("PATCH", `/api/rate-plans/${ratePlan.id}`, payload);
      }
      return apiRequest("POST", "/api/rate-plans", payload);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/rate-plans"] });
      toast({
        title: isEditing ? "Plan tarifario actualizado" : "Plan tarifario creado",
        description: `El plan "${formData.name}" ha sido ${isEditing ? "actualizado" : "creado"} exitosamente.`,
      });
      onSuccess();
      onOpenChange(false);
    },
    onError: () => {
      toast({
        title: "Error",
        description: "No se pudo guardar el plan tarifario. Intente nuevamente.",
        variant: "destructive",
      });
    },
  });

  const createVersionMutation = useMutation({
    mutationFn: async () => {
      if (!effectiveFrom) throw new Error("Fecha requerida");
      const closeDate = subDays(new Date(effectiveFrom + "T12:00:00"), 1).toISOString().split("T")[0];
      await apiRequest("PATCH", `/api/rate-plans/${ratePlan!.id}`, { validTo: closeDate });
      const payload = Object.fromEntries(
        Object.entries(formData).filter(([_, v]) => v !== "" && v !== undefined)
      );
      return apiRequest("POST", "/api/rate-plans", { ...payload, validFrom: effectiveFrom, validTo: null });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/rate-plans"] });
      toast({ title: "Nueva versión de tarifa creada", description: `El plan anterior fue cerrado y se creó la nueva versión desde ${effectiveFrom}.` });
      onSuccess();
      onOpenChange(false);
    },
    onError: () => {
      toast({ title: "Error", description: "No se pudo crear la nueva versión.", variant: "destructive" });
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (isEditing && versionMode === "new_version") {
      createVersionMutation.mutate();
    } else {
      mutation.mutate(formData);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isEditing ? "Editar Plan Tarifario" : "Nuevo Plan Tarifario"}</DialogTitle>
          <DialogDescription>
            {isEditing
              ? "Modifica los detalles del plan tarifario."
              : "Crea un nuevo plan de precios para un tipo de habitación."}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit}>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="name">Nombre del Plan</Label>
              <Input
                id="name"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                placeholder="Ej: BAR Standard, No Reembolsable"
                required
                data-testid="input-rate-plan-name"
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="roomType">Tipo de Habitación</Label>
              <Select
                value={formData.roomTypeId}
                onValueChange={(value) => setFormData({ ...formData, roomTypeId: value })}
              >
                <SelectTrigger data-testid="select-room-type">
                  <SelectValue placeholder="Seleccionar tipo de habitación" />
                </SelectTrigger>
                <SelectContent>
                  {roomTypes.filter(type => type.id).map((type) => (
                    <SelectItem key={type.id} value={type.id}>
                      {type.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label htmlFor="baseRate">Tarifa Base <span className="ml-1 text-xs font-normal text-muted-foreground">(con IVA incluido)</span></Label>
                <Input
                  id="baseRate"
                  type="number"
                  min={0}
                  step="0.01"
                  value={formData.baseRate}
                  onChange={(e) => setFormData({ ...formData, baseRate: e.target.value })}
                  placeholder="0.00"
                  required
                  data-testid="input-base-rate"
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="currency">Moneda</Label>
                <Select
                  value={formData.currency}
                  onValueChange={(value) => setFormData({ ...formData, currency: value })}
                >
                  <SelectTrigger data-testid="select-currency">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ARS">ARS (Peso Argentino)</SelectItem>
                    <SelectItem value="USD">USD (Dólar)</SelectItem>
                    <SelectItem value="EUR">EUR (Euro)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            {formData.roomTypeId && (
              <div className="grid gap-2">
                <Label>Tarifas por Pasajero — con IVA (PAX)</Label>
                <p className="text-xs text-muted-foreground">Dejá en blanco para usar la tarifa base. Ocupación máx: {maxOcc} PAX</p>
                <div className="grid grid-cols-2 gap-3">
                  <div className="grid gap-1">
                    <Label className="text-xs text-muted-foreground">1 PAX</Label>
                    <Input
                      type="number" min={0} step="0.01"
                      value={formData.rate1pax || ""}
                      onChange={(e) => setFormData({ ...formData, rate1pax: e.target.value || null })}
                      placeholder={formData.baseRate ? `Base: $${formData.baseRate}` : "0.00"}
                      data-testid="input-rate-1pax"
                    />
                  </div>
                  <div className="grid gap-1">
                    <Label className="text-xs text-muted-foreground">2 PAX</Label>
                    <Input
                      type="number" min={0} step="0.01"
                      value={formData.rate2pax || ""}
                      onChange={(e) => setFormData({ ...formData, rate2pax: e.target.value || null })}
                      placeholder={formData.baseRate ? `Base: $${formData.baseRate}` : "0.00"}
                      data-testid="input-rate-2pax"
                    />
                  </div>
                  {maxOcc >= 3 && (
                    <div className="grid gap-1">
                      <Label className="text-xs text-muted-foreground">3 PAX</Label>
                      <Input
                        type="number" min={0} step="0.01"
                        value={formData.rate3pax || ""}
                        onChange={(e) => setFormData({ ...formData, rate3pax: e.target.value || null })}
                        placeholder={formData.baseRate ? `Base: $${formData.baseRate}` : "0.00"}
                        data-testid="input-rate-3pax"
                      />
                    </div>
                  )}
                  {maxOcc >= 4 && (
                    <div className="grid gap-1">
                      <Label className="text-xs text-muted-foreground">4 PAX</Label>
                      <Input
                        type="number" min={0} step="0.01"
                        value={formData.rate4pax || ""}
                        onChange={(e) => setFormData({ ...formData, rate4pax: e.target.value || null })}
                        placeholder={formData.baseRate ? `Base: $${formData.baseRate}` : "0.00"}
                        data-testid="input-rate-4pax"
                      />
                    </div>
                  )}
                </div>
              </div>
            )}
            <div className="flex items-center gap-4">
              <Label htmlFor="refundable">Reembolsable</Label>
              <Switch
                id="refundable"
                checked={formData.refundable === "true"}
                onCheckedChange={(checked) => 
                  setFormData({ ...formData, refundable: checked ? "true" : "false" })
                }
                data-testid="switch-refundable"
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="cancellationPolicy">Política de Cancelación</Label>
              <Textarea
                id="cancellationPolicy"
                value={formData.cancellationPolicy || ""}
                onChange={(e) => setFormData({ ...formData, cancellationPolicy: e.target.value })}
                placeholder="Ej: Cancelación gratuita hasta 24hs antes..."
                rows={3}
                data-testid="input-cancellation-policy"
              />
            </div>

            <div className="grid grid-cols-2 gap-4 pt-2 border-t">
              <div className="grid gap-2">
                <Label>Válido desde <span className="text-xs text-muted-foreground">(opcional)</span></Label>
                <Input
                  type="date"
                  value={formData.validFrom || ""}
                  onChange={(e) => setFormData({ ...formData, validFrom: e.target.value || "" })}
                  data-testid="input-valid-from"
                />
              </div>
              <div className="grid gap-2">
                <Label>Válido hasta <span className="text-xs text-muted-foreground">(opcional)</span></Label>
                <Input
                  type="date"
                  value={formData.validTo || ""}
                  onChange={(e) => setFormData({ ...formData, validTo: e.target.value || "" })}
                  data-testid="input-valid-to"
                />
              </div>
            </div>

            {isEditing && (
              <div className="rounded-md border bg-muted/50 p-3 space-y-3">
                <Label className="text-sm font-medium">Modo de edición</Label>
                <div className="flex gap-2">
                  <Button
                    type="button"
                    size="sm"
                    variant={versionMode === "direct" ? "default" : "outline"}
                    onClick={() => setVersionMode("direct")}
                    data-testid="button-mode-direct"
                  >
                    Actualizar directo
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant={versionMode === "new_version" ? "default" : "outline"}
                    onClick={() => setVersionMode("new_version")}
                    data-testid="button-mode-new-version"
                  >
                    Crear nueva versión
                  </Button>
                </div>
                {versionMode === "direct" && (
                  <p className="text-xs text-muted-foreground">Corrección de datos sin cambio de precio. Sobreescribe el plan actual.</p>
                )}
                {versionMode === "new_version" && (
                  <div className="space-y-2">
                    <p className="text-xs text-muted-foreground">Cierra el plan actual y crea una nueva versión desde la fecha indicada.</p>
                    <div className="grid gap-1">
                      <Label className="text-xs">¿Desde cuándo aplica el nuevo precio?</Label>
                      <Input
                        type="date"
                        value={effectiveFrom}
                        onChange={(e) => setEffectiveFrom(e.target.value)}
                        data-testid="input-effective-from"
                        required
                      />
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button
              type="submit"
              disabled={mutation.isPending || createVersionMutation.isPending || (isEditing && versionMode === "new_version" && !effectiveFrom)}
              data-testid="button-submit-rate-plan"
            >
              {(mutation.isPending || createVersionMutation.isPending) ? "Guardando..." : isEditing && versionMode === "new_version" ? "Crear nueva versión" : isEditing ? "Guardar Cambios" : "Crear Plan"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export default function RatePlansPage() {
  const { toast } = useToast();
  const [searchQuery, setSearchQuery] = useState("");
  const [roomTypeFilter, setRoomTypeFilter] = useState<string>("all");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [selectedRatePlan, setSelectedRatePlan] = useState<RatePlanWithRoomType | undefined>();

  const { data: ratePlans, isLoading } = useQuery<RatePlanWithRoomType[]>({
    queryKey: ["/api/rate-plans"],
  });

  const { data: roomTypes } = useQuery<RoomType[]>({
    queryKey: ["/api/room-types"],
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      return apiRequest("DELETE", `/api/rate-plans/${id}`, undefined);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/rate-plans"] });
      toast({ 
        title: "Plan eliminado", 
        description: "El plan tarifario ha sido eliminado del sistema." 
      });
    },
    onError: (error: any) => {
      toast({ title: "Error", description: error?.message || "No se pudo eliminar el plan tarifario", variant: "destructive" });
    },
  });

  const filteredRatePlans = ratePlans?.filter((plan) => {
    const matchesSearch = plan.name.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesRoomType = roomTypeFilter === "all" || plan.roomTypeId === roomTypeFilter;
    return matchesSearch && matchesRoomType;
  });

  const handleEditRatePlan = (plan: RatePlanWithRoomType) => {
    setSelectedRatePlan(plan);
    setDialogOpen(true);
  };

  const handleNewRatePlan = () => {
    setSelectedRatePlan(undefined);
    setDialogOpen(true);
  };

  const formatCurrency = (amount: string, currency: string) => {
    const num = parseFloat(amount);
    return new Intl.NumberFormat("es-AR", {
      style: "currency",
      currency: currency,
    }).format(num);
  };

  const groupedByRoomType = roomTypes?.map((roomType) => ({
    roomType,
    plans: ratePlans?.filter((p) => p.roomTypeId === roomType.id) || [],
  }));

  return (
    <div className="flex flex-col gap-6 p-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight" data-testid="text-rate-plans-title">
            Planes Tarifarios
          </h1>
          <p className="text-muted-foreground">
            Gestiona los planes de precios para cada tipo de habitación
          </p>
        </div>
        <Button onClick={handleNewRatePlan} data-testid="button-new-rate-plan">
          <Plus className="mr-2 h-4 w-4" />
          Nuevo Plan
        </Button>
      </div>

      <Card>
        <CardContent className="p-4">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Buscar planes tarifarios..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10"
                data-testid="input-search-rate-plans"
              />
            </div>
            <Select value={roomTypeFilter} onValueChange={setRoomTypeFilter}>
              <SelectTrigger className="w-[200px]" data-testid="select-filter-room-type">
                <SelectValue placeholder="Tipo de habitación" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos los tipos</SelectItem>
                {roomTypes?.filter(type => type.id).map((type) => (
                  <SelectItem key={type.id} value={type.id}>
                    {type.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {isLoading ? (
        <div className="space-y-4">
          {[...Array(3)].map((_, i) => (
            <Skeleton key={i} className="h-48" />
          ))}
        </div>
      ) : roomTypeFilter === "all" && !searchQuery ? (
        <div className="space-y-6">
          {groupedByRoomType?.map(({ roomType, plans }) => (
            <Card key={roomType.id}>
              <CardHeader>
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <CardTitle className="flex items-center gap-2">
                      <DollarSign className="h-5 w-5 text-primary" />
                      {roomType.name}
                    </CardTitle>
                    <CardDescription>
                      Ocupación: {roomType.baseOccupancy}-{roomType.maxOccupancy} personas
                    </CardDescription>
                  </div>
                  <Badge variant="secondary">{plans.length} planes</Badge>
                </div>
              </CardHeader>
              <CardContent>
                {plans.length > 0 ? (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Nombre</TableHead>
                        <TableHead>Tarifa</TableHead>
                        <TableHead>Reembolsable</TableHead>
                        <TableHead>Política</TableHead>
                        <TableHead className="w-[50px]"></TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {plans.map((plan) => (
                        <TableRow key={plan.id} data-testid={`rate-plan-row-${plan.id}`}>
                          <TableCell className="font-medium">
                            {plan.name}
                            {(plan.validFrom || plan.validTo) && (
                              <div className="text-xs text-muted-foreground mt-0.5">
                                {plan.validFrom && plan.validTo
                                  ? `${formatDateAR(plan.validFrom)} → ${formatDateAR(plan.validTo)}`
                                  : plan.validFrom
                                  ? `Desde ${formatDateAR(plan.validFrom)}`
                                  : `Hasta ${formatDateAR(plan.validTo!)}`}
                              </div>
                            )}
                          </TableCell>
                          <TableCell>
                            <div>
                              <span className="font-semibold text-primary">
                                {formatCurrency(plan.baseRate, plan.currency)}
                              </span>
                              <span className="text-muted-foreground text-sm">/noche</span>
                            </div>
                            {(plan.rate1pax || plan.rate2pax || plan.rate3pax || plan.rate4pax) && (
                              <div className="flex gap-1.5 mt-1 flex-wrap">
                                {plan.rate1pax && <Badge variant="outline" className="text-xs">1P: ${plan.rate1pax}</Badge>}
                                {plan.rate2pax && <Badge variant="outline" className="text-xs">2P: ${plan.rate2pax}</Badge>}
                                {plan.rate3pax && <Badge variant="outline" className="text-xs">3P: ${plan.rate3pax}</Badge>}
                                {plan.rate4pax && <Badge variant="outline" className="text-xs">4P: ${plan.rate4pax}</Badge>}
                              </div>
                            )}
                          </TableCell>
                          <TableCell>
                            {plan.refundable === "true" ? (
                              <Badge className="bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400">
                                <CheckCircle className="mr-1 h-3 w-3" />
                                Sí
                              </Badge>
                            ) : (
                              <Badge className="bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400">
                                <XCircle className="mr-1 h-3 w-3" />
                                No
                              </Badge>
                            )}
                          </TableCell>
                          <TableCell className="max-w-[200px] truncate text-muted-foreground">
                            {plan.cancellationPolicy || "-"}
                          </TableCell>
                          <TableCell>
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button variant="ghost" size="icon">
                                  <MoreHorizontal className="h-4 w-4" />
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end">
                                <DropdownMenuItem onClick={() => handleEditRatePlan(plan)}>
                                  <Pencil className="mr-2 h-4 w-4" />
                                  Editar
                                </DropdownMenuItem>
                                <DropdownMenuSeparator />
                                <DropdownMenuItem
                                  className="text-destructive"
                                  onClick={() => deleteMutation.mutate(plan.id)}
                                >
                                  <Trash2 className="mr-2 h-4 w-4" />
                                  Eliminar
                                </DropdownMenuItem>
                              </DropdownMenuContent>
                            </DropdownMenu>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                ) : (
                  <div className="text-center py-6 text-muted-foreground">
                    No hay planes tarifarios para este tipo de habitación
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      ) : filteredRatePlans && filteredRatePlans.length > 0 ? (
        <Card>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nombre</TableHead>
                <TableHead>Tipo de Habitación</TableHead>
                <TableHead>Tarifa</TableHead>
                <TableHead>Reembolsable</TableHead>
                <TableHead>Política</TableHead>
                <TableHead className="w-[50px]"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredRatePlans.map((plan) => (
                <TableRow key={plan.id} data-testid={`rate-plan-row-${plan.id}`}>
                  <TableCell className="font-medium">{plan.name}</TableCell>
                  <TableCell>{plan.roomType?.name || "-"}</TableCell>
                  <TableCell>
                    <span className="font-semibold text-primary">
                      {formatCurrency(plan.baseRate, plan.currency)}
                    </span>
                    <span className="text-muted-foreground text-sm">/noche</span>
                  </TableCell>
                  <TableCell>
                    {plan.refundable === "true" ? (
                      <Badge className="bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400">
                        <CheckCircle className="mr-1 h-3 w-3" />
                        Sí
                      </Badge>
                    ) : (
                      <Badge className="bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400">
                        <XCircle className="mr-1 h-3 w-3" />
                        No
                      </Badge>
                    )}
                  </TableCell>
                  <TableCell className="max-w-[200px] truncate text-muted-foreground">
                    {plan.cancellationPolicy || "-"}
                  </TableCell>
                  <TableCell>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon">
                          <MoreHorizontal className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => handleEditRatePlan(plan)}>
                          <Pencil className="mr-2 h-4 w-4" />
                          Editar
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem
                          className="text-destructive"
                          onClick={() => deleteMutation.mutate(plan.id)}
                        >
                          <Trash2 className="mr-2 h-4 w-4" />
                          Eliminar
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          <p className="text-xs text-muted-foreground px-4 py-2">* Todas las tarifas incluyen IVA (21%). El desglose neto se realiza al emitir la factura.</p>
        </Card>
      ) : (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12 text-center">
            <DollarSign className="h-16 w-16 text-muted-foreground/50 mb-4" />
            <h3 className="text-lg font-semibold mb-2">No hay planes tarifarios</h3>
            <p className="text-muted-foreground mb-4">
              {searchQuery || roomTypeFilter !== "all"
                ? "No se encontraron planes con los filtros aplicados."
                : "Comienza creando el primer plan tarifario."}
            </p>
            {!searchQuery && roomTypeFilter === "all" && (
              <Button onClick={handleNewRatePlan}>
                <Plus className="mr-2 h-4 w-4" />
                Crear Primer Plan
              </Button>
            )}
          </CardContent>
        </Card>
      )}

      <RatePlanFormDialog
        ratePlan={selectedRatePlan}
        roomTypes={roomTypes || []}
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        onSuccess={() => setSelectedRatePlan(undefined)}
      />
    </div>
  );
}
