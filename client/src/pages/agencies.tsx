import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { useToast } from "@/hooks/use-toast";
import { Plus, Search, Plane, Pencil, Loader2, Trash2, BarChart3, DollarSign, CalendarDays, TrendingUp, Receipt, Eye, Users, Calendar, ChevronDown, ChevronUp, Hotel, FileText } from "lucide-react";
import { insertAgencySchema, type Agency, type AccountMovement, type ReservationWithDetails, type ReservationStatus } from "@shared/schema";
import { ProvinciaCiudadSelect } from "@/components/provincia-ciudad-select";

const agencyFormSchema = insertAgencySchema.extend({
  razonSocial: z.string().min(1, "Razón social requerida"),
  cuilCuit: z.string().min(1, "CUIT requerido"),
});

type AgencyFormData = z.infer<typeof agencyFormSchema>;

interface AgencyReportItem {
  agency: Agency;
  totalReservations: number;
  totalRevenue: number;
  commissionRate: number;
  totalCommission: number;
  totalNights: number;
}

interface AgencyStats {
  totalReservations: number;
  totalRevenue: number;
  commissionRate: number;
  totalCommission: number;
  totalNights: number;
  activeReservations: number;
}

const agStatusLabels: Record<ReservationStatus, { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
  tentative: { label: "Tentativa", variant: "outline" },
  pending: { label: "Pendiente", variant: "secondary" },
  confirmed: { label: "Confirmada", variant: "default" },
  checked_in: { label: "Check-in", variant: "default" },
  checked_out: { label: "Finalizada", variant: "outline" },
  cancelled: { label: "Cancelada", variant: "destructive" },
};

function AgReservationStatusBadge({ status }: { status: string }) {
  const cfg = agStatusLabels[status as ReservationStatus] || { label: "Sin estado", variant: "outline" as const };
  return <Badge variant={cfg.variant} className="text-xs">{cfg.label}</Badge>;
}

const agSourceLabel: Record<string, string> = {
  directo: "Directo", empresa: "Empresa", agencia: "Agencia", ota: "OTA", walkin: "Walk-in",
};
const agPayMethodLabel: Record<string, string> = {
  efectivo: "Efectivo", tarjeta_credito: "Tarj. Crédito", tarjeta_debito: "Tarj. Débito",
  transferencia: "Transferencia", cheque: "Cheque", cuenta_corriente: "Cta. Corriente",
};

function AgencyReservationDetailRow({ r }: { r: ReservationWithDetails }) {
  const [expanded, setExpanded] = useState(false);
  const activeCharges = r.charges?.filter(c => c.status === "active") || [];
  const activePayments = r.payments?.filter(p => p.status === "active") || [];
  const totalCharges = activeCharges.reduce((s, c) => s + parseFloat(c.amount || "0"), 0);
  const totalPayments = activePayments.reduce((s, p) => s + parseFloat(p.amount || "0"), 0);
  const balance = parseFloat(r.totalRoomAmount || "0") + totalCharges - totalPayments;

  return (
    <div className="border-b last:border-b-0">
      <button
        className="w-full flex items-center justify-between p-3 text-sm hover:bg-muted/40 transition-colors text-left"
        onClick={() => setExpanded(!expanded)}
        data-testid={`btn-expand-agency-res-${r.id}`}
      >
        <div className="flex items-center gap-2 min-w-0">
          <Calendar className="h-4 w-4 text-muted-foreground shrink-0" />
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <p className="font-medium text-xs font-mono truncate">{r.reservationCode}</p>
              <AgReservationStatusBadge status={r.status} />
            </div>
            <p className="text-muted-foreground text-xs">
              {r.guest?.lastName} {r.guest?.firstName} · Hab. {r.room?.roomNumber}
              {(r.room as any)?.roomType?.name && ` · ${(r.room as any).roomType.name}`}
            </p>
            <p className="text-muted-foreground text-xs">{r.checkInDate} → {r.checkOutDate} ({r.nights}n)</p>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0 ml-2">
          <span className="font-medium text-sm">${parseFloat(r.totalRoomAmount || "0").toLocaleString("es-AR")}</span>
          {expanded ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
        </div>
      </button>
      {expanded && (
        <div className="bg-muted/30 px-4 py-3 space-y-2 text-sm">
          <div className="grid grid-cols-3 gap-2 text-xs">
            <div><p className="text-muted-foreground">Tarifa/noche</p><p className="font-medium">${parseFloat(r.finalRatePerNight || "0").toLocaleString("es-AR")}</p></div>
            <div><p className="text-muted-foreground">Fuente</p><p className="font-medium">{agSourceLabel[r.source || ""] || r.source || "-"}</p></div>
            {r.discountType && r.discountType !== "none" && (
              <div><p className="text-muted-foreground">Descuento</p><p className="font-medium text-green-600">{r.discountType === "percent" ? `${r.discountValue}%` : `$${r.discountValue}`}</p></div>
            )}
          </div>
          {r.notes && <p className="text-xs text-muted-foreground border-t pt-2">{r.notes}</p>}
          {activeCharges.length > 0 && (
            <div className="border-t pt-2">
              <p className="text-xs font-semibold text-muted-foreground mb-1">Cargos</p>
              {activeCharges.map(c => (
                <div key={c.id} className="flex justify-between text-xs"><span>{c.description}</span><span>${parseFloat(c.amount).toLocaleString("es-AR")}</span></div>
              ))}
            </div>
          )}
          {activePayments.length > 0 && (
            <div className="border-t pt-2">
              <p className="text-xs font-semibold text-muted-foreground mb-1">Pagos</p>
              {activePayments.map(p => (
                <div key={p.id} className="flex justify-between text-xs">
                  <span>{agPayMethodLabel[p.method || ""] || p.method} · {p.date}</span>
                  <span className="text-green-700 dark:text-green-400">${parseFloat(p.amount).toLocaleString("es-AR")}</span>
                </div>
              ))}
            </div>
          )}
          <div className="border-t pt-2 flex justify-between text-xs font-semibold">
            <span>Saldo pendiente</span>
            <span className={balance > 0 ? "text-red-600" : "text-green-600"}>${balance.toLocaleString("es-AR", { minimumFractionDigits: 2 })}</span>
          </div>
        </div>
      )}
    </div>
  );
}

export default function AgenciesPage() {
  const { toast } = useToast();
  const [showForm, setShowForm] = useState(false);
  const [editingAgency, setEditingAgency] = useState<Agency | null>(null);

  const [searchTerm, setSearchTerm] = useState(() => {
    const params = new URLSearchParams(window.location.search);
    return params.get("search") || "";
  });

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("new") === "1") {
      setShowForm(true);
      window.history.replaceState({}, "", window.location.pathname);
    }
    const searchParam = params.get("search");
    if (searchParam) {
      setSearchTerm(searchParam);
      window.history.replaceState({}, "", window.location.pathname);
    }
  }, []);
  const [selectedAgencyId, setSelectedAgencyId] = useState<string | null>(null);
  const [reportFrom, setReportFrom] = useState("");
  const [reportTo, setReportTo] = useState("");
  const [viewingAccountAgency, setViewingAccountAgency] = useState<Agency | null>(null);
  const [viewingAgencyDetail, setViewingAgencyDetail] = useState<Agency | null>(null);
  const [registerPaymentOpen, setRegisterPaymentOpen] = useState(false);
  const [paymentAmount, setPaymentAmount] = useState("");
  const [paymentReference, setPaymentReference] = useState("");
  const [paymentDescription, setPaymentDescription] = useState("Pago recibido");
  const [paymentDate, setPaymentDate] = useState(new Date().toISOString().split("T")[0]);

  const { data: agencies = [], isLoading } = useQuery<Agency[]>({
    queryKey: ["/api/agencies"],
  });

  const { data: agencyStats } = useQuery<AgencyStats>({
    queryKey: ["/api/agencies", selectedAgencyId, "stats"],
    queryFn: async () => {
      const res = await fetch(`/api/agencies/${selectedAgencyId}/stats`);
      return res.json();
    },
    enabled: !!selectedAgencyId,
  });

  const { data: reportData = [], isLoading: reportLoading } = useQuery<AgencyReportItem[]>({
    queryKey: ["/api/agencies/report", reportFrom, reportTo],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (reportFrom) params.set("from", reportFrom);
      if (reportTo) params.set("to", reportTo);
      const res = await fetch(`/api/agencies/report?${params}`);
      return res.json();
    },
  });

  const { data: accountData, refetch: refetchAccount } = useQuery<{
    movements: AccountMovement[];
    balance: number;
  }>({
    queryKey: ["/api/agencies", viewingAccountAgency?.id, "account"],
    queryFn: async () => {
      const res = await fetch(`/api/agencies/${viewingAccountAgency!.id}/account`);
      return res.json();
    },
    enabled: !!viewingAccountAgency,
  });

  const { data: allAgencyReservations = [] } = useQuery<ReservationWithDetails[]>({
    queryKey: ["/api/reservations", "all-agency"],
    queryFn: async () => {
      const res = await fetch("/api/reservations?dateMode=all");
      return res.json();
    },
    enabled: !!viewingAgencyDetail,
  });

  const agencyReservationsForDetail = viewingAgencyDetail
    ? allAgencyReservations.filter(r => r.agencyId === viewingAgencyDetail.id)
    : [];

  const registerPaymentMutation = useMutation({
    mutationFn: async () => {
      return apiRequest("POST", `/api/agencies/${viewingAccountAgency!.id}/account/payment`, {
        amount: paymentAmount,
        description: paymentDescription,
        reference: paymentReference || null,
        date: paymentDate,
      });
    },
    onSuccess: () => {
      refetchAccount();
      queryClient.invalidateQueries({ queryKey: ["/api/account-summary"] });
      setRegisterPaymentOpen(false);
      setPaymentAmount("");
      setPaymentReference("");
      toast({ title: "Pago registrado en cuenta corriente" });
    },
    onError: () => {
      toast({ title: "Error al registrar pago", variant: "destructive" });
    },
  });

  const form = useForm<AgencyFormData>({
    resolver: zodResolver(agencyFormSchema),
    defaultValues: {
      razonSocial: "",
      nombreFantasia: "",
      cuilCuit: "",
      condicionIva: "responsable_inscripto",
      direccion: "",
      localidad: "",
      provincia: "",
      codigoPostal: "",
      telefono: "",
      email: "",
      contactName: "",
      contactEmail: "",
      contactPhone: "",
      commissionRate: "10",
      creditLimit: "0",
      paymentTermDays: 30,
      notes: "",
    },
  });

  const createMutation = useMutation({
    mutationFn: async (data: AgencyFormData) => {
      const res = await apiRequest("POST", "/api/agencies", data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/agencies"] });
      toast({ title: "Agencia creada correctamente" });
      setShowForm(false);
      form.reset();
    },
    onError: () => {
      toast({ title: "Error al crear agencia", variant: "destructive" });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: AgencyFormData }) => {
      const res = await apiRequest("PATCH", `/api/agencies/${id}`, data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/agencies"] });
      toast({ title: "Agencia actualizada correctamente" });
      setShowForm(false);
      setEditingAgency(null);
      form.reset();
    },
    onError: () => {
      toast({ title: "Error al actualizar agencia", variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      await apiRequest("DELETE", `/api/agencies/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/agencies"] });
      toast({ title: "Agencia eliminada correctamente" });
    },
    onError: () => {
      toast({ title: "Error al eliminar agencia", variant: "destructive" });
    },
  });

  const handleDelete = (agency: Agency) => {
    if (window.confirm(`¿Estás seguro de eliminar "${agency.razonSocial}"?`)) {
      deleteMutation.mutate(agency.id);
    }
  };

  const filteredAgencies = agencies
    .filter((a) =>
      a.razonSocial.toLowerCase().includes(searchTerm.toLowerCase()) ||
      a.nombreFantasia?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      a.cuilCuit?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      a.contactName?.toLowerCase().includes(searchTerm.toLowerCase())
    )
    .sort((a, b) => a.razonSocial.localeCompare(b.razonSocial, "es"));

  const handleEdit = (agency: Agency) => {
    setEditingAgency(agency);
    form.reset({
      razonSocial: agency.razonSocial,
      nombreFantasia: agency.nombreFantasia || "",
      cuilCuit: agency.cuilCuit || "",
      condicionIva: agency.condicionIva || "responsable_inscripto",
      direccion: agency.direccion || "",
      localidad: agency.localidad || "",
      provincia: agency.provincia || "",
      codigoPostal: agency.codigoPostal || "",
      telefono: agency.telefono || "",
      email: agency.email || "",
      contactName: agency.contactName || "",
      contactEmail: agency.contactEmail || "",
      contactPhone: agency.contactPhone || "",
      commissionRate: agency.commissionRate || "0",
      creditLimit: agency.creditLimit || "0",
      paymentTermDays: agency.paymentTermDays || 30,
      notes: agency.notes || "",
    });
    setShowForm(true);
  };

  const handleSubmit = (data: AgencyFormData) => {
    if (editingAgency) {
      updateMutation.mutate({ id: editingAgency.id, data });
    } else {
      createMutation.mutate(data);
    }
  };

  const handleOpenNew = () => {
    setEditingAgency(null);
    form.reset({
      razonSocial: "",
      nombreFantasia: "",
      cuilCuit: "",
      condicionIva: "responsable_inscripto",
      direccion: "",
      localidad: "",
      provincia: "",
      codigoPostal: "",
      telefono: "",
      email: "",
      contactName: "",
      contactEmail: "",
      contactPhone: "",
      commissionRate: "10",
      creditLimit: "0",
      paymentTermDays: 30,
      notes: "",
    });
    setShowForm(true);
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6" data-testid="page-agencies">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold" data-testid="text-page-title">Agencias de Viajes</h1>
          <p className="text-muted-foreground">Gestión de agencias, comisiones y volumen</p>
        </div>
        <Button onClick={handleOpenNew} data-testid="button-add-agency">
          <Plus className="h-4 w-4 mr-2" />
          Nueva Agencia
        </Button>
      </div>

      <Tabs defaultValue="list">
        <TabsList>
          <TabsTrigger value="list" data-testid="tab-agencies-list">
            <Plane className="h-4 w-4 mr-2" />
            Agencias
          </TabsTrigger>
          <TabsTrigger value="report" data-testid="tab-agencies-report">
            <BarChart3 className="h-4 w-4 mr-2" />
            Reporte de Comisiones
          </TabsTrigger>
        </TabsList>

        <TabsContent value="list" className="space-y-4">
          <div className="flex items-center gap-4">
            <div className="relative flex-1 max-w-sm">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Buscar por nombre, CUIT o contacto..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10"
                data-testid="input-search-agency"
              />
            </div>
            <Badge variant="outline">{agencies.length} agencias</Badge>
          </div>

          <Card>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Razón Social</TableHead>
                    <TableHead>Nombre Fantasía</TableHead>
                    <TableHead>CUIT</TableHead>
                    <TableHead>Comisión %</TableHead>
                    <TableHead>Contacto</TableHead>
                    <TableHead>Estado</TableHead>
                    <TableHead className="w-[120px]">Acciones</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredAgencies.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={7} className="py-16">
                        <div className="flex flex-col items-center gap-3 text-center">
                          <Plane className="h-10 w-10 text-muted-foreground/40" />
                          <div>
                            <p className="font-medium text-muted-foreground">
                              {searchTerm ? "Sin resultados" : "No hay agencias registradas"}
                            </p>
                            <p className="text-sm text-muted-foreground/70 mt-0.5">
                              {searchTerm ? `No se encontraron agencias para "${searchTerm}"` : "Comenzá agregando la primera agencia de viajes"}
                            </p>
                          </div>
                          {!searchTerm && (
                            <Button size="sm" onClick={() => setIsCreating(true)} data-testid="button-empty-new-agency">
                              <Plus className="h-4 w-4 mr-2" />Nueva Agencia
                            </Button>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  ) : (
                    filteredAgencies.map((agency) => (
                      <TableRow key={agency.id} data-testid={`row-agency-${agency.id}`}>
                        <TableCell className="font-medium">
                          <div className="flex items-center gap-2">
                            <Plane className="h-4 w-4 text-muted-foreground" />
                            {agency.razonSocial}
                          </div>
                        </TableCell>
                        <TableCell>{agency.nombreFantasia || "-"}</TableCell>
                        <TableCell>{agency.cuilCuit || "-"}</TableCell>
                        <TableCell>
                          <Badge variant="secondary">{agency.commissionRate}%</Badge>
                        </TableCell>
                        <TableCell>
                          <div>
                            <p className="text-sm">{agency.contactName || "-"}</p>
                            {agency.contactEmail && (
                              <p className="text-xs text-muted-foreground">{agency.contactEmail}</p>
                            )}
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge variant={agency.isActive === "true" ? "default" : "outline"}>
                            {agency.isActive === "true" ? "Activa" : "Inactiva"}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-1">
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => setViewingAgencyDetail(agency)}
                              title="Ver reservas de la agencia"
                              data-testid={`button-detail-agency-${agency.id}`}
                            >
                              <Eye className="h-4 w-4 text-green-600" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => setViewingAccountAgency(agency)}
                              title="Ver cuenta corriente"
                              data-testid={`button-account-agency-${agency.id}`}
                            >
                              <Receipt className="h-4 w-4 text-indigo-600" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => setSelectedAgencyId(agency.id === selectedAgencyId ? null : agency.id)}
                              data-testid={`button-stats-agency-${agency.id}`}
                            >
                              <BarChart3 className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => handleEdit(agency)}
                              data-testid={`button-edit-agency-${agency.id}`}
                            >
                              <Pencil className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => handleDelete(agency)}
                              data-testid={`button-delete-agency-${agency.id}`}
                            >
                              <Trash2 className="h-4 w-4 text-destructive" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          {selectedAgencyId && agencyStats && (
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">
                  Estadísticas: {agencies.find(a => a.id === selectedAgencyId)?.nombreFantasia || agencies.find(a => a.id === selectedAgencyId)?.razonSocial}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div className="p-4 rounded-lg bg-accent/50">
                    <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1">
                      <CalendarDays className="h-4 w-4" />
                      Reservas Totales
                    </div>
                    <p className="text-2xl font-bold" data-testid="text-agency-total-reservations">{agencyStats.totalReservations}</p>
                  </div>
                  <div className="p-4 rounded-lg bg-accent/50">
                    <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1">
                      <DollarSign className="h-4 w-4" />
                      Facturación Total
                    </div>
                    <p className="text-2xl font-bold" data-testid="text-agency-total-revenue">
                      ${agencyStats.totalRevenue.toLocaleString("es-AR", { minimumFractionDigits: 2 })}
                    </p>
                  </div>
                  <div className="p-4 rounded-lg bg-accent/50">
                    <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1">
                      <TrendingUp className="h-4 w-4" />
                      Comisión Estimada
                    </div>
                    <p className="text-2xl font-bold" data-testid="text-agency-total-commission">
                      ${agencyStats.totalCommission.toLocaleString("es-AR", { minimumFractionDigits: 2 })}
                    </p>
                  </div>
                  <div className="p-4 rounded-lg bg-accent/50">
                    <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1">
                      <CalendarDays className="h-4 w-4" />
                      Noches Totales
                    </div>
                    <p className="text-2xl font-bold" data-testid="text-agency-total-nights">{agencyStats.totalNights}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="report" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <BarChart3 className="h-5 w-5" />
                Reporte Global de Comisiones
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center gap-4">
                <div className="space-y-1">
                  <label className="text-sm text-muted-foreground">Desde</label>
                  <Input
                    type="date"
                    value={reportFrom}
                    onChange={(e) => setReportFrom(e.target.value)}
                    data-testid="input-report-from"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-sm text-muted-foreground">Hasta</label>
                  <Input
                    type="date"
                    value={reportTo}
                    onChange={(e) => setReportTo(e.target.value)}
                    data-testid="input-report-to"
                  />
                </div>
              </div>

              {reportLoading ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="h-6 w-6 animate-spin" />
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Agencia</TableHead>
                      <TableHead className="text-right">Reservas</TableHead>
                      <TableHead className="text-right">Noches</TableHead>
                      <TableHead className="text-right">Facturación</TableHead>
                      <TableHead className="text-right">Comisión %</TableHead>
                      <TableHead className="text-right">Comisión $</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {reportData.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                          No hay datos para el período seleccionado
                        </TableCell>
                      </TableRow>
                    ) : (
                      <>
                        {reportData.map((item) => (
                          <TableRow key={item.agency.id} data-testid={`row-report-${item.agency.id}`}>
                            <TableCell className="font-medium">
                              {item.agency.nombreFantasia || item.agency.razonSocial}
                            </TableCell>
                            <TableCell className="text-right">{item.totalReservations}</TableCell>
                            <TableCell className="text-right">{item.totalNights}</TableCell>
                            <TableCell className="text-right">
                              ${item.totalRevenue.toLocaleString("es-AR", { minimumFractionDigits: 2 })}
                            </TableCell>
                            <TableCell className="text-right">
                              <Badge variant="secondary">{item.commissionRate}%</Badge>
                            </TableCell>
                            <TableCell className="text-right font-medium">
                              ${item.totalCommission.toLocaleString("es-AR", { minimumFractionDigits: 2 })}
                            </TableCell>
                          </TableRow>
                        ))}
                        <TableRow className="bg-accent/30 font-bold">
                          <TableCell>TOTAL</TableCell>
                          <TableCell className="text-right">
                            {reportData.reduce((s, i) => s + i.totalReservations, 0)}
                          </TableCell>
                          <TableCell className="text-right">
                            {reportData.reduce((s, i) => s + i.totalNights, 0)}
                          </TableCell>
                          <TableCell className="text-right">
                            ${reportData.reduce((s, i) => s + i.totalRevenue, 0).toLocaleString("es-AR", { minimumFractionDigits: 2 })}
                          </TableCell>
                          <TableCell className="text-right">-</TableCell>
                          <TableCell className="text-right">
                            ${reportData.reduce((s, i) => s + i.totalCommission, 0).toLocaleString("es-AR", { minimumFractionDigits: 2 })}
                          </TableCell>
                        </TableRow>
                      </>
                    )}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <Sheet open={!!viewingAccountAgency} onOpenChange={(open) => { if (!open) setViewingAccountAgency(null); }}>
        <SheetContent className="w-full sm:max-w-2xl overflow-y-auto">
          <SheetHeader className="mb-4">
            <SheetTitle className="flex items-center gap-2">
              <Plane className="h-5 w-5" />
              {viewingAccountAgency?.nombreFantasia || viewingAccountAgency?.razonSocial}
            </SheetTitle>
            <SheetDescription>Cuenta corriente — movimientos y saldo</SheetDescription>
          </SheetHeader>

          <div className={`rounded-md p-4 mb-4 flex items-center justify-between gap-4 ${
            (accountData?.balance || 0) > 0
              ? "bg-red-50 border border-red-200 dark:bg-red-950/30 dark:border-red-800"
              : "bg-green-50 border border-green-200 dark:bg-green-950/30 dark:border-green-800"
          }`}>
            <div>
              <p className="text-sm text-muted-foreground">Saldo actual</p>
              <p className={`text-3xl font-bold ${
                (accountData?.balance || 0) > 0 ? "text-red-600 dark:text-red-400" : "text-green-600 dark:text-green-400"
              }`} data-testid="text-agency-account-balance">
                ${Math.abs(accountData?.balance || 0).toFixed(2)}
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                {(accountData?.balance || 0) > 0 ? "Saldo pendiente de cobro" : "Sin deuda pendiente"}
              </p>
              {parseFloat(viewingAccountAgency?.commissionRate || "0") > 0 && (
                <p className="text-xs text-muted-foreground mt-1" data-testid="text-agency-commission-rate">
                  Comisión pactada: {viewingAccountAgency?.commissionRate}%
                </p>
              )}
            </div>
            <Button
              onClick={() => setRegisterPaymentOpen(true)}
              disabled={(accountData?.balance || 0) <= 0}
              data-testid="button-register-cc-payment"
            >
              <Plus className="h-4 w-4 mr-2" />
              Registrar pago
            </Button>
          </div>

          {accountData?.movements && accountData.movements.length > 0 ? (
            <div className="border rounded-md overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Fecha</TableHead>
                    <TableHead>Descripción</TableHead>
                    <TableHead>Ref.</TableHead>
                    <TableHead className="text-right">Monto</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {accountData.movements.map((mov) => (
                    <TableRow key={mov.id} data-testid={`movement-row-${mov.id}`}>
                      <TableCell className="text-sm">{mov.date}</TableCell>
                      <TableCell>
                        <div>
                          <p className="text-sm">{mov.description}</p>
                          {mov.guestName && (
                            <p className="text-xs text-muted-foreground">{mov.guestName}</p>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">{mov.reference || "—"}</TableCell>
                      <TableCell className={`text-right font-medium tabular-nums ${
                        parseFloat(mov.amount) > 0 ? "text-red-600" : "text-green-600"
                      }`}>
                        {parseFloat(mov.amount) > 0 ? "+" : ""}${Math.abs(parseFloat(mov.amount)).toFixed(2)}
                        <span className="block text-xs font-normal text-muted-foreground">
                          {parseFloat(mov.amount) > 0 ? "cargo" : "pago"}
                        </span>
                        {parseFloat(mov.amount) < 0 && (
                          <a
                            href={`/api/account-movements/${mov.id}/receipt-pdf`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 text-[10px] text-primary hover:underline mt-0.5 font-normal"
                            data-testid={`btn-receipt-${mov.id}`}
                          >
                            <FileText className="h-3 w-3" /> Recibo PDF
                          </a>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          ) : (
            <div className="text-center py-12 text-muted-foreground">
              <Receipt className="h-10 w-10 mx-auto mb-3 opacity-30" />
              <p className="text-sm">Sin movimientos en cuenta corriente</p>
            </div>
          )}

          <Dialog open={registerPaymentOpen} onOpenChange={setRegisterPaymentOpen}>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Registrar pago recibido</DialogTitle>
                <DialogDescription>
                  {viewingAccountAgency?.nombreFantasia || viewingAccountAgency?.razonSocial} — Saldo actual: ${(accountData?.balance || 0).toFixed(2)}
                </DialogDescription>
              </DialogHeader>
              <div className="grid gap-4 py-4">
                <div>
                  <Label>Monto recibido</Label>
                  <Input
                    type="number"
                    step="0.01"
                    min="0.01"
                    placeholder="0.00"
                    value={paymentAmount}
                    onChange={(e) => setPaymentAmount(e.target.value)}
                    data-testid="input-cc-payment-amount"
                  />
                </div>
                <div>
                  <Label>Fecha</Label>
                  <Input
                    type="date"
                    value={paymentDate}
                    onChange={(e) => setPaymentDate(e.target.value)}
                    data-testid="input-cc-payment-date"
                  />
                </div>
                <div>
                  <Label>Descripción</Label>
                  <Input
                    value={paymentDescription}
                    onChange={(e) => setPaymentDescription(e.target.value)}
                    placeholder="Ej: Pago por transferencia"
                    data-testid="input-cc-payment-description"
                  />
                </div>
                <div>
                  <Label>Referencia (opcional)</Label>
                  <Input
                    value={paymentReference}
                    onChange={(e) => setPaymentReference(e.target.value)}
                    placeholder="Nro. transferencia, cheque, etc."
                    data-testid="input-cc-payment-reference"
                  />
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setRegisterPaymentOpen(false)}>Cancelar</Button>
                <Button
                  onClick={() => registerPaymentMutation.mutate()}
                  disabled={!paymentAmount || parseFloat(paymentAmount) <= 0 || registerPaymentMutation.isPending}
                  data-testid="button-confirm-cc-payment"
                >
                  {registerPaymentMutation.isPending ? "Guardando..." : "Confirmar pago"}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </SheetContent>
      </Sheet>

      <Dialog open={showForm} onOpenChange={(open) => { if (!open) { setShowForm(false); setEditingAgency(null); } }}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingAgency ? "Editar Agencia" : "Nueva Agencia"}</DialogTitle>
            <DialogDescription>
              {editingAgency ? "Modificá los datos de la agencia" : "Completá los datos para registrar una nueva agencia"}
            </DialogDescription>
          </DialogHeader>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <FormField control={form.control} name="razonSocial" render={({ field }) => (
                  <FormItem className="col-span-2">
                    <FormLabel>Razón Social *</FormLabel>
                    <FormControl><Input {...field} data-testid="input-agency-razon-social" /></FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
                <FormField control={form.control} name="nombreFantasia" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Nombre Fantasía</FormLabel>
                    <FormControl><Input {...field} value={field.value ?? ""} data-testid="input-agency-nombre-fantasia" /></FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
                <FormField control={form.control} name="cuilCuit" render={({ field }) => (
                  <FormItem>
                    <FormLabel>CUIT *</FormLabel>
                    <FormControl><Input {...field} placeholder="XX-XXXXXXXX-X" data-testid="input-agency-cuit" /></FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
                <FormField control={form.control} name="commissionRate" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Comisión %</FormLabel>
                    <FormControl><Input {...field} value={field.value ?? "10"} type="number" step="0.01" data-testid="input-agency-commission" /></FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
                <FormField control={form.control} name="condicionIva" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Condición IVA</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value || "responsable_inscripto"}>
                      <FormControl>
                        <SelectTrigger data-testid="select-agency-iva">
                          <SelectValue />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="responsable_inscripto">Responsable Inscripto</SelectItem>
                        <SelectItem value="monotributo">Monotributista</SelectItem>
                        <SelectItem value="exento">Exento</SelectItem>
                        <SelectItem value="consumidor_final">Consumidor Final</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )} />
                <FormField control={form.control} name="direccion" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Dirección</FormLabel>
                    <FormControl><Input {...field} value={field.value ?? ""} data-testid="input-agency-direccion" /></FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
                <ProvinciaCiudadSelect
                  provincia={form.watch("provincia") || ""}
                  localidad={form.watch("localidad") || ""}
                  onProvinciaChange={(v) => { form.setValue("provincia", v); form.setValue("localidad", ""); }}
                  onLocalidadChange={(v) => form.setValue("localidad", v)}
                  testIdProvincia="select-agency-provincia"
                  testIdLocalidad="select-agency-localidad"
                />
                <FormField control={form.control} name="codigoPostal" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Código Postal</FormLabel>
                    <FormControl><Input {...field} value={field.value ?? ""} data-testid="input-agency-cp" /></FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
                <FormField control={form.control} name="telefono" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Teléfono</FormLabel>
                    <FormControl><Input {...field} value={field.value ?? ""} data-testid="input-agency-telefono" /></FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
                <FormField control={form.control} name="email" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Email</FormLabel>
                    <FormControl><Input {...field} value={field.value ?? ""} type="email" data-testid="input-agency-email" /></FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
              </div>

              <div className="border-t pt-4">
                <h3 className="text-sm font-medium mb-3">Persona de Contacto</h3>
                <div className="grid grid-cols-3 gap-4">
                  <FormField control={form.control} name="contactName" render={({ field }) => (
                    <FormItem>
                      <FormLabel>Nombre</FormLabel>
                      <FormControl><Input {...field} value={field.value ?? ""} data-testid="input-agency-contact-name" /></FormControl>
                      <FormMessage />
                    </FormItem>
                  )} />
                  <FormField control={form.control} name="contactEmail" render={({ field }) => (
                    <FormItem>
                      <FormLabel>Email</FormLabel>
                      <FormControl><Input {...field} value={field.value ?? ""} data-testid="input-agency-contact-email" /></FormControl>
                      <FormMessage />
                    </FormItem>
                  )} />
                  <FormField control={form.control} name="contactPhone" render={({ field }) => (
                    <FormItem>
                      <FormLabel>Teléfono</FormLabel>
                      <FormControl><Input {...field} value={field.value ?? ""} data-testid="input-agency-contact-phone" /></FormControl>
                      <FormMessage />
                    </FormItem>
                  )} />
                </div>
              </div>

              <div className="border-t pt-4">
                <h3 className="text-sm font-medium mb-3">Condiciones Comerciales</h3>
                <div className="grid grid-cols-2 gap-4">
                  <FormField control={form.control} name="creditLimit" render={({ field }) => (
                    <FormItem>
                      <FormLabel>Límite de Crédito</FormLabel>
                      <FormControl><Input {...field} value={field.value ?? "0"} type="number" data-testid="input-agency-credit-limit" /></FormControl>
                      <FormMessage />
                    </FormItem>
                  )} />
                  <FormField control={form.control} name="paymentTermDays" render={({ field }) => (
                    <FormItem>
                      <FormLabel>Plazo de Pago (días)</FormLabel>
                      <FormControl><Input {...field} value={field.value ?? 30} type="number" data-testid="input-agency-payment-term" /></FormControl>
                      <FormMessage />
                    </FormItem>
                  )} />
                </div>
              </div>

              <FormField control={form.control} name="notes" render={({ field }) => (
                <FormItem>
                  <FormLabel>Notas</FormLabel>
                  <FormControl><Input {...field} value={field.value ?? ""} data-testid="input-agency-notes" /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />

              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => { setShowForm(false); setEditingAgency(null); }}>
                  Cancelar
                </Button>
                <Button type="submit" disabled={createMutation.isPending || updateMutation.isPending} data-testid="button-save-agency">
                  {(createMutation.isPending || updateMutation.isPending) && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                  {editingAgency ? "Guardar Cambios" : "Crear Agencia"}
                </Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>

      <Sheet open={!!viewingAgencyDetail} onOpenChange={(open) => { if (!open) setViewingAgencyDetail(null); }}>
        <SheetContent className="w-full sm:max-w-2xl overflow-y-auto">
          <SheetHeader className="mb-4">
            <SheetTitle className="flex items-center gap-2">
              <Plane className="h-5 w-5" />
              {viewingAgencyDetail?.nombreFantasia || viewingAgencyDetail?.razonSocial}
            </SheetTitle>
            <SheetDescription>
              {viewingAgencyDetail?.cuilCuit && `CUIT: ${viewingAgencyDetail.cuilCuit}`}
              {viewingAgencyDetail?.commissionRate && ` · Comisión: ${viewingAgencyDetail.commissionRate}%`}
            </SheetDescription>
          </SheetHeader>

          <div className="flex items-center gap-2 mb-3">
            <Hotel className="h-4 w-4 text-muted-foreground" />
            <h3 className="font-semibold text-sm">Reservas de la agencia ({agencyReservationsForDetail.length})</h3>
          </div>

          {agencyReservationsForDetail.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <Hotel className="h-10 w-10 mx-auto mb-3 opacity-30" />
              <p className="text-sm">Sin reservas registradas para esta agencia</p>
            </div>
          ) : (
            <div className="border rounded-lg divide-y">
              {agencyReservationsForDetail
                .sort((a, b) => b.checkInDate.localeCompare(a.checkInDate))
                .map(r => <AgencyReservationDetailRow key={r.id} r={r} />)}
            </div>
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}
