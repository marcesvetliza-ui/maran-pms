import { useState } from "react";
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
import { Plus, Search, Building2, Pencil, Loader2, Trash2, Receipt } from "lucide-react";
import { insertCompanySchema, type Company, type AccountMovement } from "@shared/schema";

const companyFormSchema = insertCompanySchema.extend({
  razonSocial: z.string().min(1, "Razón social requerida"),
  cuilCuit: z.string().min(1, "CUIT requerido"),
});

type CompanyFormData = z.infer<typeof companyFormSchema>;

export default function CompaniesPage() {
  const { toast } = useToast();
  const [showForm, setShowForm] = useState(false);
  const [editingCompany, setEditingCompany] = useState<Company | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [viewingAccountCompany, setViewingAccountCompany] = useState<Company | null>(null);
  const [registerPaymentOpen, setRegisterPaymentOpen] = useState(false);
  const [paymentAmount, setPaymentAmount] = useState("");
  const [paymentReference, setPaymentReference] = useState("");
  const [paymentDescription, setPaymentDescription] = useState("Pago recibido");
  const [paymentDate, setPaymentDate] = useState(new Date().toISOString().split("T")[0]);

  const { data: companies = [], isLoading } = useQuery<Company[]>({
    queryKey: ["/api/companies"],
  });

  const { data: accountData, refetch: refetchAccount } = useQuery<{
    movements: AccountMovement[];
    balance: number;
  }>({
    queryKey: ["/api/companies", viewingAccountCompany?.id, "account"],
    queryFn: async () => {
      const res = await fetch(`/api/companies/${viewingAccountCompany!.id}/account`);
      return res.json();
    },
    enabled: !!viewingAccountCompany,
  });

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

  const registerPaymentMutation = useMutation({
    mutationFn: async () => {
      return apiRequest("POST", `/api/companies/${viewingAccountCompany!.id}/account/payment`, {
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

  const handleDelete = (company: Company) => {
    if (window.confirm(`¿Estás seguro de eliminar "${company.razonSocial}"?`)) {
      deleteMutation.mutate(company.id);
    }
  };

  const filteredCompanies = companies.filter((c) =>
    c.razonSocial.toLowerCase().includes(searchTerm.toLowerCase()) ||
    c.nombreFantasia?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    c.cuilCuit?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    c.contactName?.toLowerCase().includes(searchTerm.toLowerCase())
  );

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
                  <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                    {searchTerm ? "No se encontraron empresas" : "No hay empresas registradas"}
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
                <FormField control={form.control} name="localidad" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Localidad</FormLabel>
                    <FormControl><Input {...field} data-testid="input-company-localidad" /></FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
                <FormField control={form.control} name="provincia" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Provincia</FormLabel>
                    <FormControl><Input {...field} data-testid="input-company-provincia" /></FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
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
                ${Math.abs(accountData?.balance || 0).toFixed(2)}
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
                        {parseFloat(mov.amount) > 0 ? "+" : ""}${Math.abs(parseFloat(mov.amount)).toFixed(2)}
                        <span className="block text-xs font-normal text-muted-foreground">
                          {parseFloat(mov.amount) > 0 ? "cargo" : "pago"}
                        </span>
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
                  {viewingAccountCompany?.nombreFantasia || viewingAccountCompany?.razonSocial} — Saldo actual: ${(accountData?.balance || 0).toFixed(2)}
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
    </div>
  );
}
