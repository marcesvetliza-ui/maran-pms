import { useState, useEffect } from "react";
import { fmtMoney } from "@/lib/utils";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";
import { Plus, Search, Building2, Pencil, Loader2, Trash2, Receipt, Eye, Users, Calendar, ChevronDown, ChevronUp, Hotel, FileText } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { insertCompanySchema, type Company, type AccountMovement, type Guest, type ReservationWithDetails, type ReservationStatus } from "@shared/schema";
import { ProvinciaCiudadSelect } from "@/components/provincia-ciudad-select";
import { CCPaymentDialog } from "@/components/cc-payment-dialog";

const companyFormSchema = insertCompanySchema.extend({
  razonSocial: z.string().min(1, "Razón social requerida"),
  cuilCuit: z.string().min(1, "CUIT requerido"),
});

type CompanyFormData = z.infer<typeof companyFormSchema>;

const statusLabels: Record<ReservationStatus, { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
  tentative:   { label: "Tentativa",    variant: "outline" },
  pending:     { label: "Pendiente",    variant: "secondary" },
  confirmed:   { label: "Confirmada",   variant: "default" },
  web_checkin: { label: "Pre Check-In", variant: "default" },
  checked_in: { label: "Check-in", variant: "default" },
  checked_out: { label: "Finalizada", variant: "outline" },
  cancelled: { label: "Cancelada", variant: "destructive" },
};

function ReservationStatusBadge({ status }: { status: string }) {
  const cfg = statusLabels[status as ReservationStatus] || { label: "Sin estado", variant: "outline" as const };
  return <Badge variant={cfg.variant} className="text-xs">{cfg.label}</Badge>;
}

const sourceLabel: Record<string, string> = {
  directo: "Directo", empresa: "Empresa", agencia: "Agencia", ota: "OTA", walkin: "Walk-in",
};
const payMethodLabel: Record<string, string> = {
  efectivo: "Efectivo", tarjeta_credito: "Tarj. Crédito", tarjeta_debito: "Tarj. Débito",
  transferencia: "Transferencia", cheque: "Cheque", cuenta_corriente: "Cta. Corriente",
};

function ReservationDetailRow({ r }: { r: ReservationWithDetails }) {
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
        data-testid={`btn-expand-res-${r.id}`}
      >
        <div className="flex items-center gap-2 min-w-0">
          <Calendar className="h-4 w-4 text-muted-foreground shrink-0" />
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <p className="font-medium text-xs font-mono truncate">{r.reservationCode}</p>
              <ReservationStatusBadge status={r.status} />
            </div>
            <p className="text-muted-foreground text-xs">
              {r.guest?.lastName} {r.guest?.firstName} · Hab. {r.room?.roomNumber}
              {(r.room as any)?.roomType?.name && ` · ${(r.room as any).roomType.name}`}
            </p>
            <p className="text-muted-foreground text-xs">{r.checkInDate} → {r.checkOutDate} ({r.nights}n)</p>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0 ml-2">
          <span className="font-medium text-sm">${fmtMoney(r.totalRoomAmount || "0")}</span>
          {expanded ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
        </div>
      </button>
      {expanded && (
        <div className="bg-muted/30 px-4 py-3 space-y-2 text-sm">
          <div className="grid grid-cols-3 gap-2 text-xs">
            <div><p className="text-muted-foreground">Tarifa/noche</p><p className="font-medium">${fmtMoney(r.finalRatePerNight || "0")}</p></div>
            <div><p className="text-muted-foreground">Fuente</p><p className="font-medium">{sourceLabel[r.source || ""] || r.source || "-"}</p></div>
            {r.discountType && r.discountType !== "none" && (
              <div><p className="text-muted-foreground">Descuento</p><p className="font-medium text-green-600">{r.discountType === "percent" ? `${r.discountValue}%` : `$${r.discountValue}`}</p></div>
            )}
          </div>
          {r.notes && <p className="text-xs text-muted-foreground border-t pt-2">{r.notes}</p>}
          {activeCharges.length > 0 && (
            <div className="border-t pt-2">
              <p className="text-xs font-semibold text-muted-foreground mb-1">Cargos</p>
              {activeCharges.map(c => (
                <div key={c.id} className="flex justify-between text-xs"><span>{c.description}</span><span>${fmtMoney(c.amount)}</span></div>
              ))}
            </div>
          )}
          {activePayments.length > 0 && (
            <div className="border-t pt-2">
              <p className="text-xs font-semibold text-muted-foreground mb-1">Pagos</p>
              {activePayments.map(p => (
                <div key={p.id} className="flex justify-between text-xs">
                  <span>{payMethodLabel[p.method || ""] || p.method} · {p.date}</span>
                  <span className="text-green-700 dark:text-green-400">${fmtMoney(p.amount)}</span>
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

export default function CompaniesPage() {
  const { toast } = useToast();
  const [showForm, setShowForm] = useState(false);
  const [editingCompany, setEditingCompany] = useState<Company | null>(null);

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
  const [viewingAccountCompany, setViewingAccountCompany] = useState<Company | null>(null);
  const [viewingCompanyDetail, setViewingCompanyDetail] = useState<Company | null>(null);
  const [registerPaymentOpen, setRegisterPaymentOpen] = useState(false);

  const { data: companies = [], isLoading } = useQuery<Company[]>({
    queryKey: ["/api/companies"],
  });

  const { data: accountData, refetch: refetchAccount, isError: accountError, error: accountErrorObj } = useQuery<{
    movements: AccountMovement[];
    balance: number;
  }>({
    queryKey: ["/api/companies", viewingAccountCompany?.id, "account"],
    queryFn: async () => {
      const res = await fetch(`/api/companies/${viewingAccountCompany!.id}/account`);
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body?.error || `Error ${res.status} al obtener la cuenta corriente`);
      }
      return res.json();
    },
    enabled: !!viewingAccountCompany,
  });

  const { data: allGuests = [] } = useQuery<Guest[]>({
    queryKey: ["/api/guests"],
    enabled: !!viewingCompanyDetail,
  });

  const { data: allReservations = [] } = useQuery<ReservationWithDetails[]>({
    queryKey: ["/api/reservations", "all"],
    queryFn: async () => {
      const res = await fetch("/api/reservations?dateMode=all");
      return res.json();
    },
    enabled: !!viewingCompanyDetail,
  });

  const companyGuests = viewingCompanyDetail
    ? allGuests.filter(g => g.companyId === viewingCompanyDetail.id)
    : [];
  const companyReservations = viewingCompanyDetail
    ? allReservations.filter(r => r.companyId === viewingCompanyDetail.id)
    : [];

  const form = useForm<CompanyFormData>({
    resolver: zodResolver(companyFormSchema),
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
      creditLimit: "0",
      paymentTermDays: 30,
      condicionVentaPredeterminada: "contado",
      notes: "",
    },
  });

  const createMutation = useMutation({
    mutationFn: async (data: CompanyFormData) => {
      const res = await apiRequest("POST", "/api/companies", data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/companies"] });
      toast({ title: "Empresa creada correctamente" });
      setShowForm(false);
      form.reset();
    },
    onError: () => {
      toast({ title: "Error al crear empresa", variant: "destructive" });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: CompanyFormData }) => {
      const res = await apiRequest("PATCH", `/api/companies/${id}`, data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/companies"] });
      toast({ title: "Empresa actualizada correctamente" });
      setShowForm(false);
      setEditingCompany(null);
      form.reset();
    },
    onError: () => {
      toast({ title: "Error al actualizar empresa", variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      await apiRequest("DELETE", `/api/companies/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/companies"] });
      toast({ title: "Empresa eliminada correctamente" });
    },
    onError: () => {
      toast({ title: "Error al eliminar empresa", variant: "destructive" });
    },
  });

  const handleDelete = (company: Company) => {
    if (window.confirm(`¿Estás seguro de eliminar "${company.razonSocial}"?`)) {
      deleteMutation.mutate(company.id);
    }
  };

  const filteredCompanies = companies
    .filter((c) =>
      c.razonSocial.toLowerCase().includes(searchTerm.toLowerCase()) ||
      c.nombreFantasia?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      c.cuilCuit?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      c.contactName?.toLowerCase().includes(searchTerm.toLowerCase())
    )
    .sort((a, b) => a.razonSocial.localeCompare(b.razonSocial, "es"));

  const handleEdit = (company: Company) => {
    setEditingCompany(company);
    form.reset({
      razonSocial: company.razonSocial,
      nombreFantasia: company.nombreFantasia || "",
      cuilCuit: company.cuilCuit || "",
      condicionIva: company.condicionIva || "responsable_inscripto",
      direccion: company.direccion || "",
      localidad: company.localidad || "",
      provincia: company.provincia || "",
      codigoPostal: company.codigoPostal || "",
      telefono: company.telefono || "",
      email: company.email || "",
      contactName: company.contactName || "",
      contactEmail: company.contactEmail || "",
      contactPhone: company.contactPhone || "",
      creditLimit: company.creditLimit || "0",
      paymentTermDays: company.paymentTermDays || 30,
      condicionVentaPredeterminada: (company as any).condicionVentaPredeterminada || "contado",
      notes: company.notes || "",
    });
    setShowForm(true);
  };

  const handleSubmit = (data: CompanyFormData) => {
    if (editingCompany) {
      updateMutation.mutate({ id: editingCompany.id, data });
    } else {
      createMutation.mutate(data);
    }
  };

  const handleOpenNew = () => {
    setEditingCompany(null);
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
      creditLimit: "0",
      paymentTermDays: 30,
      condicionVentaPredeterminada: "contado",
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
    <div className="p-6 space-y-6" data-testid="page-companies">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold" data-testid="text-page-title">Empresas</h1>
          <p className="text-muted-foreground">Gestión de empresas y corporativos</p>
        </div>
        <Button onClick={handleOpenNew} data-testid="button-add-company">
          <Plus className="h-4 w-4 mr-2" />
          Nueva Empresa
        </Button>
      </div>

      <div className="flex items-center gap-4">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Buscar por nombre, CUIT o contacto..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-10"
            data-testid="input-search-company"
          />
        </div>
        <Badge variant="outline">{companies.length} empresas</Badge>
      </div>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Razón Social</TableHead>
                <TableHead>Nombre Fantasía</TableHead>
                <TableHead>CUIT</TableHead>
                <TableHead>Cond. IVA</TableHead>
                <TableHead>Contacto</TableHead>
                <TableHead>Teléfono</TableHead>
                <TableHead className="w-[140px]">Acciones</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredCompanies.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="py-16">
                    <div className="flex flex-col items-center gap-3 text-center">
                      <Building2 className="h-10 w-10 text-muted-foreground/40" />
                      <div>
                        <p className="font-medium text-muted-foreground">
                          {searchTerm ? "Sin resultados" : "No hay empresas registradas"}
                        </p>
                        <p className="text-sm text-muted-foreground/70 mt-0.5">
                          {searchTerm ? `No se encontraron empresas para "${searchTerm}"` : "Comenzá agregando la primera empresa"}
                        </p>
                      </div>
                      {!searchTerm && (
                        <Button size="sm" onClick={() => setShowForm(true)} data-testid="button-empty-new-company">
                          <Plus className="h-4 w-4 mr-2" />Nueva Empresa
                        </Button>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              ) : (
                filteredCompanies.map((company) => (
                  <TableRow key={company.id} data-testid={`row-company-${company.id}`}>
                    <TableCell className="font-medium">
                      <div className="flex items-center gap-2">
                        <Building2 className="h-4 w-4 text-muted-foreground" />
                        {company.razonSocial}
                      </div>
                    </TableCell>
                    <TableCell>{company.nombreFantasia || "-"}</TableCell>
                    <TableCell>{company.cuilCuit || "-"}</TableCell>
                    <TableCell>
                      <Badge variant="outline" className="text-xs">
                        {company.condicionIva === "responsable_inscripto" ? "Resp. Inscripto" :
                         company.condicionIva === "monotributista" ? "Monotributo" :
                         company.condicionIva === "exento" ? "Exento" :
                         company.condicionIva || "-"}
                      </Badge>
                    </TableCell>
                    <TableCell>{company.contactName || "-"}</TableCell>
                    <TableCell>{company.telefono || "-"}</TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => setViewingCompanyDetail(company)}
                          title="Ver huéspedes y reservas"
                          data-testid={`button-detail-company-${company.id}`}
                        >
                          <Eye className="h-4 w-4 text-green-600" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => setViewingAccountCompany(company)}
                          title="Ver cuenta corriente"
                          data-testid={`button-account-company-${company.id}`}
                        >
                          <Receipt className="h-4 w-4 text-blue-600" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => handleEdit(company)}
                          data-testid={`button-edit-company-${company.id}`}
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => handleDelete(company)}
                          data-testid={`button-delete-company-${company.id}`}
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

      <Dialog open={showForm} onOpenChange={(open) => { if (!open) { setShowForm(false); setEditingCompany(null); } }}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingCompany ? "Editar Empresa" : "Nueva Empresa"}</DialogTitle>
            <DialogDescription>
              {editingCompany ? "Modificá los datos de la empresa" : "Completá los datos para registrar una nueva empresa"}
            </DialogDescription>
          </DialogHeader>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <FormField control={form.control} name="razonSocial" render={({ field }) => (
                  <FormItem className="col-span-2">
                    <FormLabel>Razón Social *</FormLabel>
                    <FormControl><Input {...field} data-testid="input-company-razon-social" /></FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
                <FormField control={form.control} name="nombreFantasia" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Nombre Fantasía</FormLabel>
                    <FormControl><Input {...field} data-testid="input-company-nombre-fantasia" /></FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
                <FormField control={form.control} name="cuilCuit" render={({ field }) => (
                  <FormItem>
                    <FormLabel>CUIT *</FormLabel>
                    <FormControl><Input {...field} placeholder="XX-XXXXXXXX-X" data-testid="input-company-cuit" /></FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
                <FormField control={form.control} name="condicionIva" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Condición IVA</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger data-testid="select-company-iva">
                          <SelectValue />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="responsable_inscripto">Responsable Inscripto</SelectItem>
                        <SelectItem value="monotributista">Monotributista</SelectItem>
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
                    <FormControl><Input {...field} data-testid="input-company-direccion" /></FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
                <ProvinciaCiudadSelect
                  provincia={form.watch("provincia") || ""}
                  localidad={form.watch("localidad") || ""}
                  onProvinciaChange={(v) => { form.setValue("provincia", v); form.setValue("localidad", ""); }}
                  onLocalidadChange={(v) => form.setValue("localidad", v)}
                  testIdProvincia="select-company-provincia"
                  testIdLocalidad="select-company-localidad"
                />
                <FormField control={form.control} name="codigoPostal" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Código Postal</FormLabel>
                    <FormControl><Input {...field} data-testid="input-company-cp" /></FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
                <FormField control={form.control} name="telefono" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Teléfono</FormLabel>
                    <FormControl><Input {...field} data-testid="input-company-telefono" /></FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
                <FormField control={form.control} name="email" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Email</FormLabel>
                    <FormControl><Input {...field} type="email" data-testid="input-company-email" /></FormControl>
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
                      <FormControl><Input {...field} data-testid="input-company-contact-name" /></FormControl>
                      <FormMessage />
                    </FormItem>
                  )} />
                  <FormField control={form.control} name="contactEmail" render={({ field }) => (
                    <FormItem>
                      <FormLabel>Email</FormLabel>
                      <FormControl><Input {...field} data-testid="input-company-contact-email" /></FormControl>
                      <FormMessage />
                    </FormItem>
                  )} />
                  <FormField control={form.control} name="contactPhone" render={({ field }) => (
                    <FormItem>
                      <FormLabel>Teléfono</FormLabel>
                      <FormControl><Input {...field} data-testid="input-company-contact-phone" /></FormControl>
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
                      <FormControl><Input {...field} type="number" data-testid="input-company-credit-limit" /></FormControl>
                      <FormMessage />
                    </FormItem>
                  )} />
                  <FormField control={form.control} name="paymentTermDays" render={({ field }) => (
                    <FormItem>
                      <FormLabel>Plazo de Pago (días)</FormLabel>
                      <FormControl><Input {...field} type="number" data-testid="input-company-payment-term" /></FormControl>
                      <FormMessage />
                    </FormItem>
                  )} />
                </div>
                <FormField control={form.control} name="condicionVentaPredeterminada" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Condición de Venta Predeterminada</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value ?? "contado"}>
                      <FormControl>
                        <SelectTrigger data-testid="select-company-condicion-venta">
                          <SelectValue placeholder="Seleccionar condición..." />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="contado">Contado</SelectItem>
                        <SelectItem value="cuenta_corriente">Cuenta Corriente</SelectItem>
                        <SelectItem value="30_dias">30 días</SelectItem>
                        <SelectItem value="60_dias">60 días</SelectItem>
                        <SelectItem value="90_dias">90 días</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )} />
              </div>

              <FormField control={form.control} name="notes" render={({ field }) => (
                <FormItem>
                  <FormLabel>Notas</FormLabel>
                  <FormControl><Input {...field} data-testid="input-company-notes" /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />

              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => { setShowForm(false); setEditingCompany(null); }}>
                  Cancelar
                </Button>
                <Button type="submit" disabled={createMutation.isPending || updateMutation.isPending} data-testid="button-save-company">
                  {(createMutation.isPending || updateMutation.isPending) && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                  {editingCompany ? "Guardar Cambios" : "Crear Empresa"}
                </Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>

      <Sheet open={!!viewingAccountCompany} onOpenChange={(open) => { if (!open) setViewingAccountCompany(null); }}>
        <SheetContent className="w-full sm:max-w-2xl overflow-y-auto">
          <SheetHeader className="mb-4">
            <SheetTitle className="flex items-center gap-2 flex-wrap">
              <Building2 className="h-5 w-5" />
              {viewingAccountCompany?.nombreFantasia || viewingAccountCompany?.razonSocial}
            </SheetTitle>
            <SheetDescription>Cuenta corriente — movimientos y saldo</SheetDescription>
          </SheetHeader>

          {accountError && (
            <div className="rounded-md p-4 mb-4 bg-red-50 border border-red-200 dark:bg-red-950/30 dark:border-red-800 text-red-700 dark:text-red-400 text-sm" data-testid="text-account-error">
              No se pudo cargar la cuenta corriente: {accountErrorObj instanceof Error ? accountErrorObj.message : "Error desconocido"}
            </div>
          )}

          <div className={`rounded-md p-4 mb-4 flex items-center justify-between gap-4 ${
            (accountData?.balance || 0) > 0
              ? "bg-red-50 border border-red-200 dark:bg-red-950/30 dark:border-red-800"
              : "bg-green-50 border border-green-200 dark:bg-green-950/30 dark:border-green-800"
          }`}>
            <div>
              <p className="text-sm text-muted-foreground">Saldo actual</p>
              <p className={`text-3xl font-bold ${
                (accountData?.balance || 0) > 0 ? "text-red-600 dark:text-red-400" : "text-green-600 dark:text-green-400"
              }`} data-testid="text-account-balance">
                ${fmtMoney(Math.abs(accountData?.balance || 0))}
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                {(accountData?.balance || 0) > 0 ? "Saldo pendiente de cobro" : "Sin deuda pendiente"}
              </p>
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
                        {parseFloat(mov.amount) > 0 ? "+" : ""}${fmtMoney(Math.abs(parseFloat(mov.amount)))}
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

          <CCPaymentDialog
            open={registerPaymentOpen}
            onOpenChange={setRegisterPaymentOpen}
            entityType="company"
            entityId={viewingAccountCompany?.id}
            entityLabel={viewingAccountCompany?.nombreFantasia || viewingAccountCompany?.razonSocial || ""}
            balance={accountData?.balance || 0}
            onSuccess={() => {
              refetchAccount();
              toast({ title: "Pago registrado en cuenta corriente" });
            }}
          />
        </SheetContent>
      </Sheet>

      <Sheet open={!!viewingCompanyDetail} onOpenChange={(open) => { if (!open) setViewingCompanyDetail(null); }}>
        <SheetContent className="w-full sm:max-w-2xl overflow-y-auto">
          <SheetHeader className="mb-4">
            <SheetTitle className="flex items-center gap-2">
              <Building2 className="h-5 w-5" />
              {viewingCompanyDetail?.nombreFantasia || viewingCompanyDetail?.razonSocial}
            </SheetTitle>
            <SheetDescription>
              {viewingCompanyDetail?.cuilCuit && `CUIT: ${viewingCompanyDetail.cuilCuit}`}
              {viewingCompanyDetail?.condicionIva && ` · ${viewingCompanyDetail.condicionIva === "responsable_inscripto" ? "Resp. Inscripto" : viewingCompanyDetail.condicionIva}`}
            </SheetDescription>
          </SheetHeader>

          <Tabs defaultValue="reservations">
            <TabsList className="w-full mb-4">
              <TabsTrigger value="reservations" className="flex-1">
                <Hotel className="h-4 w-4 mr-1" />
                Reservas ({companyReservations.length})
              </TabsTrigger>
              <TabsTrigger value="guests" className="flex-1">
                <Users className="h-4 w-4 mr-1" />
                Huéspedes ({companyGuests.length})
              </TabsTrigger>
            </TabsList>

            <TabsContent value="reservations">
              {companyReservations.length === 0 ? (
                <div className="text-center py-12 text-muted-foreground">
                  <Hotel className="h-10 w-10 mx-auto mb-3 opacity-30" />
                  <p className="text-sm">Sin reservas registradas para esta empresa</p>
                </div>
              ) : (
                <div className="border rounded-lg divide-y">
                  {companyReservations
                    .sort((a, b) => b.checkInDate.localeCompare(a.checkInDate))
                    .map(r => <ReservationDetailRow key={r.id} r={r} />)}
                </div>
              )}
            </TabsContent>

            <TabsContent value="guests">
              {companyGuests.length === 0 ? (
                <div className="text-center py-12 text-muted-foreground">
                  <Users className="h-10 w-10 mx-auto mb-3 opacity-30" />
                  <p className="text-sm">Sin huéspedes asociados a esta empresa</p>
                </div>
              ) : (
                <div className="border rounded-lg divide-y">
                  {companyGuests.map(g => (
                    <div key={g.id} className="p-3 flex items-center gap-3" data-testid={`company-guest-${g.id}`}>
                      <div className="flex h-9 w-9 items-center justify-center rounded-full bg-primary/10 text-primary font-bold text-sm shrink-0">
                        {g.lastName?.[0]}{g.firstName?.[0]}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-sm">{g.lastName} {g.firstName}</p>
                        <p className="text-xs text-muted-foreground">{g.documentType?.toUpperCase()}: {g.documentNumber || "-"} · {g.email || g.phone || "Sin contacto"}</p>
                      </div>
                      <Badge variant="outline" className="text-xs shrink-0">{g.segment || "LEISURE"}</Badge>
                    </div>
                  ))}
                </div>
              )}
            </TabsContent>
          </Tabs>
        </SheetContent>
      </Sheet>
    </div>
  );
}
