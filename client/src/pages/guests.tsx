import { useState, useEffect, useRef } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useAuth } from "@/App";
import {
  Users,
  Plus,
  Search,
  MoreHorizontal,
  Pencil,
  Trash2,
  Eye,
  Mail,
  Phone,
  MapPin,
  FileText,
  Car,
  AlertTriangle,
  Wrench,
  Heart,
  Calendar,
  ChevronDown,
  ChevronUp,
  CreditCard,
  DollarSign,
  Hotel,
  ToggleLeft,
  ToggleRight,
  X,
  UtensilsCrossed,
  Sparkles,
  DoorOpen,
  Star,
  Gift,
  Briefcase,
  Check,
  ChevronsUpDown,
  Loader2,
  User,
  Building2,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
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
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
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
import { useToast } from "@/hooks/use-toast";
import { queryClient, apiRequest } from "@/lib/queryClient";
import type { Guest, InsertGuest, ReservationWithDetails, ReservationStatus, GuestPreference, Company, Country } from "@shared/schema";
import { Badge } from "@/components/ui/badge";
import { ProvinciaCiudadSelect } from "@/components/provincia-ciudad-select";

// ─── Constantes normalizadas para AFIP ──────────────────────────────────────

export const DOCUMENT_TYPE_LABELS: Record<string, string> = {
  dni: "DNI",
  cuit: "CUIT",
  cuil: "CUIL",
  passport: "Pasaporte",
  cedula: "Cédula (CI)",
  lc: "Libreta Cívica",
  le: "Libreta de Enrolamiento",
  other: "Otro",
};

export const VAT_CONDITION_LABELS: Record<string, string> = {
  consumidor_final: "Consumidor Final",
  responsable_inscripto: "Responsable Inscripto",
  monotributista: "Monotributista",
  exento: "Exento",
  no_responsable: "No Responsable",
  no_categorizado: "No Categorizado (Extranjero)",
};

export const COUNTRIES_AFIP = [
  "Argentina","Uruguay","Brasil","Chile","Paraguay","Bolivia","Perú","Colombia","Venezuela","Ecuador",
  "Estados Unidos","España","Italia","Francia","Alemania","Portugal","México","Cuba","Costa Rica",
  "Panamá","Honduras","Nicaragua","Guatemala","El Salvador","República Dominicana","Haití","Jamaica",
  "Trinidad y Tobago","Barbados","Bahamas","Belice","Guyana","Surinam","Guyana Francesa",
  "Reino Unido","Irlanda","Bélgica","Países Bajos","Luxemburgo","Suiza","Austria","Suecia","Noruega",
  "Dinamarca","Finlandia","Polonia","República Checa","Hungría","Rumania","Bulgaria","Grecia","Turquía",
  "Rusia","Ucrania","Bielorrusia","Croacia","Serbia","Eslovenia","Eslovaquia","Estonia","Letonia","Lituania",
  "China","Japón","Corea del Sur","India","Israel","Líbano","Siria","Irán","Irak","Arabia Saudita",
  "Emiratos Árabes","Egipto","Marruecos","Argelia","Túnez","Sudáfrica","Nigeria","Kenia","Ghana",
  "Australia","Nueva Zelanda","Canadá","Otros",
];

/** Normaliza CUIT/CUIL: elimina guiones y espacios, deja solo dígitos */
export function normalizeCuit(value: string): string {
  return value.replace(/[-\s]/g, "");
}

/** Formatea CUIT para mostrar: XX-XXXXXXXX-X */
export function formatCuit(value: string): string {
  const digits = normalizeCuit(value);
  if (digits.length === 11) {
    return `${digits.slice(0, 2)}-${digits.slice(2, 10)}-${digits[10]}`;
  }
  return digits;
}

function NationalityCombobox({
  value, afipCode, onChange,
}: { value: string; afipCode?: string; onChange: (name: string, code: string) => void }) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const { data: countriesList = [] } = useQuery<Country[]>({ queryKey: ["/api/countries"] });
  const filtered = countriesList.filter(c => c.name.toLowerCase().includes(search.toLowerCase())).slice(0, 40);
  return (
    <div className="grid gap-2">
      <Label>Nacionalidad / País <span className="text-xs text-muted-foreground">(Nomenclador AFIP)</span></Label>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button variant="outline" role="combobox" aria-expanded={open} className="w-full justify-between font-normal" data-testid="select-nationality">
            <span>{value || "Seleccionar país..."}</span>
            <div className="flex items-center gap-2">
              {afipCode && <span className="text-xs text-muted-foreground font-mono">AFIP:{afipCode}</span>}
              <ChevronsUpDown className="h-4 w-4 shrink-0 opacity-50" />
            </div>
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-full p-0" align="start">
          <Command>
            <CommandInput placeholder="Buscar país..." value={search} onValueChange={setSearch} />
            <CommandList>
              <CommandEmpty>Sin resultados. Podés agregar países en Configuración.</CommandEmpty>
              <CommandGroup>
                {filtered.map(c => (
                  <CommandItem key={c.id} value={c.name} onSelect={() => { onChange(c.name, String(c.afipCode)); setOpen(false); setSearch(""); }}>
                    <Check className={`mr-2 h-4 w-4 ${value === c.name ? "opacity-100" : "opacity-0"}`} />
                    <span className="flex-1">{c.name}</span>
                    <span className="text-xs text-muted-foreground font-mono ml-2">{c.afipCode}</span>
                  </CommandItem>
                ))}
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
    </div>
  );
}

function GuestFormDialog({
  guest,
  open,
  onOpenChange,
  onSuccess,
}: {
  guest?: Guest;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
}) {
  const { toast } = useToast();
  const isEditing = !!guest;

  const { data: companies } = useQuery<Company[]>({ queryKey: ["/api/companies"] });

  const buildFormData = (g?: Guest): Partial<InsertGuest> => ({
    tipoPersona: (g as any)?.tipoPersona || "fisica",
    firstName: g?.firstName || "",
    lastName: g?.lastName || "",
    email: g?.email || "",
    phone: g?.phone || "",
    documentType: (() => {
      const raw = g?.documentType?.trim().toLowerCase() || "";
      if (raw === "dni") return "dni";
      if (raw === "cuit") return "cuit";
      if (raw === "cuil") return "cuil";
      if (raw === "passport" || raw === "pasaporte") return "passport";
      if (raw === "cedula" || raw === "cédula" || raw === "ci") return "cedula";
      if (raw === "lc") return "lc";
      if (raw === "le") return "le";
      if (raw === "other" || raw === "otro") return "other";
      return "dni";
    })(),
    documentNumber: g?.documentNumber || "",
    nationality: g?.nationality || "",
    nationalityCode: g?.nationalityCode || "",
    vatCondition: g?.vatCondition || "",
    estadoCivil: g?.estadoCivil || "",
    procedencia: g?.procedencia || "",
    fechaIngresoArgentina: g?.fechaIngresoArgentina || "",
    fechaSalidaArgentina: g?.fechaSalidaArgentina || "",
    esEmpresaGrande: g?.esEmpresaGrande || false,
    montoBaseFce: g?.montoBaseFce || "",
    direccion: g?.direccion || "",
    provincia: g?.provincia || "",
    localidad: g?.localidad || "",
    codigoPostal: g?.codigoPostal || "",
    fechaNacimiento: g?.fechaNacimiento || "",
    sexo: g?.sexo || "no_especifica",
    segment: g?.segment || "LEISURE",
    cuilCuit: g?.cuilCuit ? normalizeCuit(g.cuilCuit) : "",
    companyId: g?.companyId || null,
    agencyId: g?.agencyId || null,
    vehiculoPatente: g?.vehiculoPatente || "",
    vehiculoMarca: g?.vehiculoMarca || "",
    vehiculoModelo: g?.vehiculoModelo || "",
    vehiculoColor: g?.vehiculoColor || "",
  });

  const [formData, setFormData] = useState<Partial<InsertGuest>>(() => buildFormData(guest));
  const [companyOpen, setCompanyOpen] = useState(false);
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});

  const tipoPersona = (formData as any).tipoPersona || "fisica";
  const isJuridica = tipoPersona === "juridica";

  useEffect(() => {
    if (open) {
      setFormData(buildFormData(guest));
      setFormErrors({});
    }
  }, [open, guest?.id]);

  const mutation = useMutation({
    mutationFn: async (data: Partial<InsertGuest>) => {
      const payload = Object.fromEntries(
        Object.entries(data).filter(([_, v]) => v !== "" && v !== undefined)
      );
      if (isEditing) {
        return apiRequest("PATCH", `/api/guests/${guest.id}`, payload);
      }
      return apiRequest("POST", "/api/guests", payload);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/guests"] });
      queryClient.invalidateQueries({ queryKey: ["/api/dashboard/stats"] });
      toast({
        title: isEditing ? "Huésped actualizado" : "Huésped registrado",
        description: `${formData.lastName} ${formData.firstName} ha sido ${isEditing ? "actualizado" : "registrado"} exitosamente.`,
      });
      onSuccess();
      onOpenChange(false);
    },
    onError: async (error: any) => {
      // 409 = duplicate document number — show which existing guest was found
      try {
        const body = await error?.response?.json?.();
        if (body?.error === "duplicate" && body?.existing) {
          const ex = body.existing;
          toast({
            title: "Huésped ya registrado",
            description: `${ex.lastName} ${ex.firstName} ya existe con ese documento. Buscalo en la lista y editalo si necesitás actualizar sus datos.`,
            variant: "destructive",
          });
          return;
        }
      } catch (_) { /* ignore parse errors */ }
      toast({
        title: "Error",
        description: "No se pudo guardar el huésped. Intente nuevamente.",
        variant: "destructive",
      });
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const errors: Record<string, string> = {};
    if (!formData.firstName?.trim()) {
      errors.firstName = isJuridica ? "La razón social es obligatoria" : "El nombre es obligatorio";
    }
    if (!isJuridica && !formData.lastName?.trim()) {
      errors.lastName = "El apellido es obligatorio";
    }
    if (isJuridica && !formData.cuilCuit?.trim()) {
      errors.cuilCuit = "El CUIT es obligatorio para personas jurídicas";
    }
    if (Object.keys(errors).length > 0) {
      setFormErrors(errors);
      return;
    }
    setFormErrors({});
    const payload = {
      ...formData,
      // Para jurídica: si no hay apellido, guardamos "-"
      lastName: isJuridica && !formData.lastName?.trim() ? "-" : formData.lastName,
      cuilCuit: formData.cuilCuit ? normalizeCuit(formData.cuilCuit) : formData.cuilCuit,
    };
    mutation.mutate(payload);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[520px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isEditing ? "Editar Huésped" : "Nuevo Huésped"}</DialogTitle>
          <DialogDescription>
            {isEditing ? "Modifica los datos del huésped." : "Ingresa los datos para registrar un nuevo huésped."}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit}>
          <div className="grid gap-4 py-4">

            {/* ── Toggle Tipo de Persona ── */}
            <div className="flex rounded-lg border overflow-hidden">
              <button
                type="button"
                onClick={() => setFormData(f => ({ ...f, tipoPersona: "fisica" } as any))}
                className={`flex-1 py-2 px-3 text-sm font-medium flex items-center justify-center gap-2 transition-colors ${
                  !isJuridica
                    ? "bg-primary text-primary-foreground"
                    : "bg-background text-muted-foreground hover:bg-muted"
                }`}
                data-testid="button-tipo-fisica"
              >
                <User className="h-4 w-4" />
                Persona Física
              </button>
              <button
                type="button"
                onClick={() => setFormData(f => ({ ...f, tipoPersona: "juridica" } as any))}
                className={`flex-1 py-2 px-3 text-sm font-medium flex items-center justify-center gap-2 transition-colors border-l ${
                  isJuridica
                    ? "bg-primary text-primary-foreground"
                    : "bg-background text-muted-foreground hover:bg-muted"
                }`}
                data-testid="button-tipo-juridica"
              >
                <Building2 className="h-4 w-4" />
                Persona Jurídica
              </button>
            </div>

            {/* ── PERSONA JURÍDICA ── */}
            {isJuridica && (<>
              <div className="grid gap-2">
                <Label htmlFor="firstName">Razón Social <span className="text-red-500">*</span></Label>
                <Input
                  id="firstName"
                  value={formData.firstName || ""}
                  onChange={(e) => {
                    setFormData({ ...formData, firstName: e.target.value });
                    if (e.target.value.trim()) setFormErrors(p => { const n = {...p}; delete n.firstName; return n; });
                  }}
                  placeholder="Ej: ACME S.A."
                  className={formErrors.firstName ? "border-red-500 focus-visible:ring-red-500" : ""}
                  data-testid="input-razon-social"
                />
                {formErrors.firstName && <p className="text-xs text-red-500">{formErrors.firstName}</p>}
              </div>

              <div className="grid gap-2">
                <Label htmlFor="lastName">Nombre Fantasía <span className="text-xs text-muted-foreground">(opcional)</span></Label>
                <Input
                  id="lastName"
                  value={formData.lastName === "-" ? "" : (formData.lastName || "")}
                  onChange={(e) => setFormData({ ...formData, lastName: e.target.value })}
                  placeholder="Ej: Acme Corp"
                  data-testid="input-nombre-fantasia"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="grid gap-2">
                  <Label htmlFor="cuilCuit">CUIT <span className="text-red-500">*</span></Label>
                  <Input
                    id="cuilCuit"
                    value={formData.cuilCuit || ""}
                    onChange={(e) => {
                      setFormData({ ...formData, cuilCuit: normalizeCuit(e.target.value) });
                      if (e.target.value.trim()) setFormErrors(p => { const n = {...p}; delete n.cuilCuit; return n; });
                    }}
                    placeholder="30-12345678-9"
                    maxLength={13}
                    className={formErrors.cuilCuit ? "border-red-500 focus-visible:ring-red-500" : ""}
                    data-testid="input-cuil-cuit"
                  />
                  {formData.cuilCuit && normalizeCuit(formData.cuilCuit).length === 11 && (
                    <p className="text-xs text-muted-foreground">{formatCuit(formData.cuilCuit)}</p>
                  )}
                  {formErrors.cuilCuit && <p className="text-xs text-red-500">{formErrors.cuilCuit}</p>}
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="vatCondition">Condición ante IVA</Label>
                  <Select
                    value={(formData as any).vatCondition || "responsable_inscripto"}
                    onValueChange={(value) => setFormData({ ...formData, vatCondition: value } as any)}
                  >
                    <SelectTrigger data-testid="select-vat-condition">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {Object.entries(VAT_CONDITION_LABELS).map(([val, label]) => (
                        <SelectItem key={val} value={val}>{label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="grid gap-2">
                  <Label htmlFor="email">Email</Label>
                  <Input id="email" type="email" value={formData.email || ""} onChange={(e) => setFormData({ ...formData, email: e.target.value })} placeholder="contacto@empresa.com" data-testid="input-email" />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="phone">Teléfono</Label>
                  <Input id="phone" value={formData.phone || ""} onChange={(e) => setFormData({ ...formData, phone: e.target.value })} placeholder="+54 11 1234-5678" data-testid="input-phone" />
                </div>
              </div>

              {/* Domicilio fiscal */}
              <div className="pt-1 border-t">
                <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Domicilio Fiscal</Label>
              </div>
              <div className="grid gap-2">
                <Label htmlFor="direccion">Dirección</Label>
                <Input id="direccion" value={formData.direccion || ""} onChange={(e) => setFormData({ ...formData, direccion: e.target.value })} placeholder="Av. Corrientes 1234" data-testid="input-direccion" />
              </div>
              <ProvinciaCiudadSelect
                provincia={formData.provincia || ""}
                localidad={formData.localidad || ""}
                onProvinciaChange={(v) => setFormData({ ...formData, provincia: v, localidad: "" })}
                onLocalidadChange={(v) => setFormData({ ...formData, localidad: v })}
                testIdProvincia="select-guest-provincia"
                testIdLocalidad="select-guest-localidad"
              />
              <div className="grid grid-cols-2 gap-4">
                <div className="grid gap-2">
                  <Label htmlFor="codigoPostal">Código Postal</Label>
                  <Input id="codigoPostal" value={formData.codigoPostal || ""} onChange={(e) => setFormData({ ...formData, codigoPostal: e.target.value })} placeholder="1043" data-testid="input-codigo-postal" />
                </div>
              </div>

              {/* FCE MiPyME */}
              <div className="pt-1 border-t">
                <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Factura de Crédito Electrónica (FCE / MiPyME)</Label>
              </div>
              <div className="flex items-center gap-3">
                <input
                  type="checkbox"
                  id="esEmpresaGrande"
                  checked={(formData as any).esEmpresaGrande || false}
                  onChange={(e) => setFormData({ ...formData, esEmpresaGrande: e.target.checked } as any)}
                  className="h-4 w-4 rounded border-input"
                  data-testid="check-es-empresa-grande"
                />
                <label htmlFor="esEmpresaGrande" className="text-sm">Es empresa grande (requiere FCE obligatoria)</label>
              </div>
              {(formData as any).esEmpresaGrande && (
                <div className="grid gap-2">
                  <Label htmlFor="montoBaseFce">Monto Base FCE ($)</Label>
                  <Input id="montoBaseFce" value={(formData as any).montoBaseFce || ""} onChange={(e) => setFormData({ ...formData, montoBaseFce: e.target.value } as any)} placeholder="Ej: 400000" data-testid="input-monto-base-fce" />
                </div>
              )}

              {/* Empresa asociada */}
              <div className="grid gap-2">
                <Label>Empresa asociada en el sistema</Label>
                <Popover open={companyOpen} onOpenChange={setCompanyOpen}>
                  <PopoverTrigger asChild>
                    <Button variant="outline" role="combobox" aria-expanded={companyOpen} className="w-full justify-between font-normal" data-testid="select-company">
                      {formData.companyId ? (companies?.find(c => c.id === formData.companyId)?.nombreFantasia || companies?.find(c => c.id === formData.companyId)?.razonSocial || "Empresa") : "Sin empresa"}
                      <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-full p-0" align="start">
                    <Command>
                      <CommandInput placeholder="Buscar empresa..." />
                      <CommandList>
                        <CommandEmpty>Sin resultados.</CommandEmpty>
                        <CommandGroup>
                          <CommandItem value="__none__" onSelect={() => { setFormData({ ...formData, companyId: null }); setCompanyOpen(false); }}>
                            <Check className={`mr-2 h-4 w-4 ${!formData.companyId ? "opacity-100" : "opacity-0"}`} />Sin empresa
                          </CommandItem>
                          {companies?.map(c => (
                            <CommandItem key={c.id} value={`${c.razonSocial} ${c.nombreFantasia || ""}`} onSelect={() => { setFormData({ ...formData, companyId: c.id }); setCompanyOpen(false); }}>
                              <Check className={`mr-2 h-4 w-4 ${formData.companyId === c.id ? "opacity-100" : "opacity-0"}`} />
                              {c.nombreFantasia || c.razonSocial}
                              {c.nombreFantasia && <span className="ml-1 text-xs text-muted-foreground">({c.razonSocial})</span>}
                            </CommandItem>
                          ))}
                        </CommandGroup>
                      </CommandList>
                    </Command>
                  </PopoverContent>
                </Popover>
              </div>
            </>)}

            {/* ── PERSONA FÍSICA ── */}
            {!isJuridica && (<>
              <div className="grid grid-cols-2 gap-4">
                <div className="grid gap-2">
                  <Label htmlFor="firstName">Nombre <span className="text-red-500">*</span></Label>
                  <Input
                    id="firstName"
                    value={formData.firstName || ""}
                    onChange={(e) => {
                      setFormData({ ...formData, firstName: e.target.value });
                      if (e.target.value.trim()) setFormErrors(p => { const n = {...p}; delete n.firstName; return n; });
                    }}
                    placeholder="Juan"
                    className={formErrors.firstName ? "border-red-500 focus-visible:ring-red-500" : ""}
                    data-testid="input-first-name"
                  />
                  {formErrors.firstName && <p className="text-xs text-red-500">{formErrors.firstName}</p>}
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="lastName">Apellido <span className="text-red-500">*</span></Label>
                  <Input
                    id="lastName"
                    value={formData.lastName || ""}
                    onChange={(e) => {
                      setFormData({ ...formData, lastName: e.target.value });
                      if (e.target.value.trim()) setFormErrors(p => { const n = {...p}; delete n.lastName; return n; });
                    }}
                    placeholder="Pérez"
                    className={formErrors.lastName ? "border-red-500 focus-visible:ring-red-500" : ""}
                    data-testid="input-last-name"
                  />
                  {formErrors.lastName && <p className="text-xs text-red-500">{formErrors.lastName}</p>}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="grid gap-2">
                  <Label htmlFor="email">Email</Label>
                  <Input id="email" type="email" value={formData.email || ""} onChange={(e) => setFormData({ ...formData, email: e.target.value })} placeholder="juan@email.com" data-testid="input-email" />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="phone">Teléfono</Label>
                  <Input id="phone" value={formData.phone || ""} onChange={(e) => setFormData({ ...formData, phone: e.target.value })} placeholder="+54 11 1234-5678" data-testid="input-phone" />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="grid gap-2">
                  <Label htmlFor="documentType">Tipo de Documento</Label>
                  <Select value={formData.documentType || "dni"} onValueChange={(value) => setFormData({ ...formData, documentType: value })}>
                    <SelectTrigger data-testid="select-document-type"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {Object.entries(DOCUMENT_TYPE_LABELS).map(([val, label]) => (
                        <SelectItem key={val} value={val}>{label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="documentNumber">Número de Documento</Label>
                  <Input id="documentNumber" value={formData.documentNumber || ""} onChange={(e) => setFormData({ ...formData, documentNumber: e.target.value })} placeholder="12345678" data-testid="input-document-number" />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="grid gap-2">
                  <Label htmlFor="cuilCuit">CUIT / CUIL</Label>
                  <Input
                    id="cuilCuit"
                    value={formData.cuilCuit || ""}
                    onChange={(e) => setFormData({ ...formData, cuilCuit: normalizeCuit(e.target.value) })}
                    placeholder="20123456789"
                    maxLength={13}
                    data-testid="input-cuil-cuit"
                  />
                  {formData.cuilCuit && normalizeCuit(formData.cuilCuit).length === 11 && (
                    <p className="text-xs text-muted-foreground">{formatCuit(formData.cuilCuit)}</p>
                  )}
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="vatCondition">Condición ante IVA</Label>
                  <Select value={(formData as any).vatCondition || "consumidor_final"} onValueChange={(value) => setFormData({ ...formData, vatCondition: value } as any)}>
                    <SelectTrigger data-testid="select-vat-condition"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {Object.entries(VAT_CONDITION_LABELS).map(([val, label]) => (
                        <SelectItem key={val} value={val}>{label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {/* Estado Civil */}
              <div className="grid gap-2">
                <Label>Estado Civil</Label>
                <Select value={(formData as any).estadoCivil || ""} onValueChange={(v) => setFormData({ ...formData, estadoCivil: v } as any)}>
                  <SelectTrigger data-testid="select-estado-civil"><SelectValue placeholder="Seleccionar..." /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="soltero">Soltero/a</SelectItem>
                    <SelectItem value="casado">Casado/a</SelectItem>
                    <SelectItem value="divorciado">Divorciado/a</SelectItem>
                    <SelectItem value="viudo">Viudo/a</SelectItem>
                    <SelectItem value="union_convivencial">Unión Convivencial</SelectItem>
                    <SelectItem value="otro">Otro</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Nacionalidad con código AFIP */}
              <NationalityCombobox
                value={formData.nationality || ""}
                afipCode={(formData as any).nationalityCode || ""}
                onChange={(name, code) => setFormData({ ...formData, nationality: name, nationalityCode: code } as any)}
              />

              {/* Datos migratorios — solo para extranjeros (Ley 25.871) */}
              {formData.nationality && formData.nationality !== "Argentina" && (
                <div className="rounded-md border border-amber-200 bg-amber-50 dark:bg-amber-950/20 dark:border-amber-800 p-3 space-y-3">
                  <p className="text-xs font-medium text-amber-800 dark:text-amber-300">
                    ⚠️ Datos migratorios requeridos por Ley 25.871 (Migraciones)
                  </p>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="grid gap-2">
                      <Label htmlFor="fechaIngresoArg" className="text-xs">Fecha Ingreso a Argentina</Label>
                      <Input id="fechaIngresoArg" type="date" value={(formData as any).fechaIngresoArgentina || ""} onChange={(e) => setFormData({ ...formData, fechaIngresoArgentina: e.target.value } as any)} data-testid="input-fecha-ingreso-argentina" />
                    </div>
                    <div className="grid gap-2">
                      <Label htmlFor="fechaSalidaArg" className="text-xs">Fecha Salida de Argentina</Label>
                      <Input id="fechaSalidaArg" type="date" value={(formData as any).fechaSalidaArgentina || ""} onChange={(e) => setFormData({ ...formData, fechaSalidaArgentina: e.target.value } as any)} data-testid="input-fecha-salida-argentina" />
                    </div>
                  </div>
                </div>
              )}

              {/* Procedencia */}
              <div className="grid gap-2">
                <Label htmlFor="procedencia">
                  Procedencia <span className="text-xs text-muted-foreground">(ciudad desde donde viaja)</span>
                </Label>
                <Input id="procedencia" value={(formData as any).procedencia || ""} onChange={(e) => setFormData({ ...formData, procedencia: e.target.value } as any)} placeholder="Ej: Rosario (aunque viva en Córdoba)" data-testid="input-procedencia" />
              </div>

              {/* Domicilio permanente */}
              <div className="pt-1 border-t">
                <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Domicilio Permanente</Label>
              </div>
              <div className="grid gap-2">
                <Label htmlFor="direccion">Dirección</Label>
                <Input id="direccion" value={formData.direccion || ""} onChange={(e) => setFormData({ ...formData, direccion: e.target.value })} placeholder="Av. Siempreviva 742" data-testid="input-direccion" />
              </div>
              <ProvinciaCiudadSelect
                provincia={formData.provincia || ""}
                localidad={formData.localidad || ""}
                onProvinciaChange={(v) => setFormData({ ...formData, provincia: v, localidad: "" })}
                onLocalidadChange={(v) => setFormData({ ...formData, localidad: v })}
                testIdProvincia="select-guest-provincia"
                testIdLocalidad="select-guest-localidad"
              />
              <div className="grid grid-cols-2 gap-4">
                <div className="grid gap-2">
                  <Label htmlFor="codigoPostal">Código Postal</Label>
                  <Input id="codigoPostal" value={formData.codigoPostal || ""} onChange={(e) => setFormData({ ...formData, codigoPostal: e.target.value })} placeholder="3100" data-testid="input-codigo-postal" />
                </div>
              </div>

              {/* FCE MiPyME */}
              <div className="pt-1 border-t">
                <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Factura de Crédito Electrónica (FCE / MiPyME)</Label>
              </div>
              <div className="flex items-center gap-3">
                <input type="checkbox" id="esEmpresaGrande" checked={(formData as any).esEmpresaGrande || false} onChange={(e) => setFormData({ ...formData, esEmpresaGrande: e.target.checked } as any)} className="h-4 w-4 rounded border-input" data-testid="check-es-empresa-grande" />
                <label htmlFor="esEmpresaGrande" className="text-sm text-muted-foreground">Sí, es empresa grande</label>
              </div>
              {(formData as any).esEmpresaGrande && (
                <div className="grid gap-2">
                  <Label htmlFor="montoBaseFce">Monto Base FCE ($)</Label>
                  <Input id="montoBaseFce" value={(formData as any).montoBaseFce || ""} onChange={(e) => setFormData({ ...formData, montoBaseFce: e.target.value } as any)} placeholder="Ej: 400000" data-testid="input-monto-base-fce" />
                </div>
              )}

              {/* Empresa asociada */}
              <div className="grid gap-2">
                <Label>Empresa asociada</Label>
                <Popover open={companyOpen} onOpenChange={setCompanyOpen}>
                  <PopoverTrigger asChild>
                    <Button variant="outline" role="combobox" aria-expanded={companyOpen} className="w-full justify-between font-normal" data-testid="select-company">
                      {formData.companyId ? (companies?.find(c => c.id === formData.companyId)?.nombreFantasia || companies?.find(c => c.id === formData.companyId)?.razonSocial || "Empresa") : "Sin empresa"}
                      <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-full p-0" align="start">
                    <Command>
                      <CommandInput placeholder="Buscar empresa..." />
                      <CommandList>
                        <CommandEmpty>Sin resultados.</CommandEmpty>
                        <CommandGroup>
                          <CommandItem value="__none__" onSelect={() => { setFormData({ ...formData, companyId: null }); setCompanyOpen(false); }}>
                            <Check className={`mr-2 h-4 w-4 ${!formData.companyId ? "opacity-100" : "opacity-0"}`} />Sin empresa
                          </CommandItem>
                          {companies?.map(c => (
                            <CommandItem key={c.id} value={`${c.razonSocial} ${c.nombreFantasia || ""}`} onSelect={() => { setFormData({ ...formData, companyId: c.id }); setCompanyOpen(false); }}>
                              <Check className={`mr-2 h-4 w-4 ${formData.companyId === c.id ? "opacity-100" : "opacity-0"}`} />
                              {c.nombreFantasia || c.razonSocial}
                              {c.nombreFantasia && <span className="ml-1 text-xs text-muted-foreground">({c.razonSocial})</span>}
                            </CommandItem>
                          ))}
                        </CommandGroup>
                      </CommandList>
                    </Command>
                  </PopoverContent>
                </Popover>
              </div>

              {/* Vehículo */}
              <div className="pt-2 border-t">
                <Label className="text-sm font-medium text-muted-foreground">Datos del Vehículo (opcional)</Label>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="grid gap-2">
                  <Label htmlFor="vehiculoPatente">Patente</Label>
                  <Input id="vehiculoPatente" value={formData.vehiculoPatente || ""} onChange={(e) => setFormData({ ...formData, vehiculoPatente: e.target.value.toUpperCase() })} placeholder="ABC 123" data-testid="input-vehiculo-patente" />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="vehiculoMarca">Marca</Label>
                  <Input id="vehiculoMarca" value={formData.vehiculoMarca || ""} onChange={(e) => setFormData({ ...formData, vehiculoMarca: e.target.value })} placeholder="Toyota" data-testid="input-vehiculo-marca" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="grid gap-2">
                  <Label htmlFor="vehiculoModelo">Modelo</Label>
                  <Input id="vehiculoModelo" value={formData.vehiculoModelo || ""} onChange={(e) => setFormData({ ...formData, vehiculoModelo: e.target.value })} placeholder="Corolla" data-testid="input-vehiculo-modelo" />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="vehiculoColor">Color</Label>
                  <Input id="vehiculoColor" value={formData.vehiculoColor || ""} onChange={(e) => setFormData({ ...formData, vehiculoColor: e.target.value })} placeholder="Blanco" data-testid="input-vehiculo-color" />
                </div>
              </div>
            </>)}

          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button type="submit" disabled={mutation.isPending} data-testid="button-submit-guest">
              {mutation.isPending ? (
                <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Guardando...</>
              ) : isEditing ? "Guardar Cambios" : "Registrar Huésped"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function ReservationStatusBadge({ status }: { status: ReservationStatus }) {
  const statusConfig: Record<ReservationStatus, { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
    pending: { label: "Pendiente", variant: "secondary" },
    tentative: { label: "Tentativa", variant: "secondary" },
    confirmed: { label: "Confirmada", variant: "default" },
    checked_in: { label: "Hospedado", variant: "outline" },
    checked_out: { label: "Finalizada", variant: "secondary" },
    cancelled: { label: "Cancelada", variant: "destructive" },
  };
  const config = statusConfig[status];
  return <Badge variant={config.variant}>{config.label}</Badge>;
}

function ReservationExpandedDetail({ r }: { r: ReservationWithDetails }) {
  const sourceLabel: Record<string, string> = {
    directo: "Directo", empresa: "Empresa", agencia: "Agencia",
    ota: "OTA", walkin: "Walk-in",
  };
  const paymentMethodLabel: Record<string, string> = {
    efectivo: "Efectivo", tarjeta_credito: "Tarj. Crédito", tarjeta_debito: "Tarj. Débito",
    transferencia: "Transferencia", cheque: "Cheque", cuenta_corriente: "Cta. Corriente",
  };
  const activeCharges = r.charges?.filter(c => c.status === "active") || [];
  const activePayments = r.payments?.filter(p => p.status === "active") || [];
  const totalCharges = activeCharges.reduce((s, c) => s + parseFloat(c.amount || "0"), 0);
  const totalPayments = activePayments.reduce((s, p) => s + parseFloat(p.amount || "0"), 0);
  const balance = parseFloat(r.totalRoomAmount || "0") + totalCharges - totalPayments;

  return (
    <div className="bg-muted/30 border-t px-4 py-3 space-y-3 text-sm">
      <div className="grid grid-cols-2 gap-3">
        <div>
          <p className="text-xs text-muted-foreground">Código</p>
          <p className="font-mono font-medium text-xs">{r.reservationCode}</p>
        </div>
        <div>
          <p className="text-xs text-muted-foreground">Tipo de Habitación</p>
          <p className="font-medium">{(r.room as any)?.roomType?.name || "-"}</p>
        </div>
        <div>
          <p className="text-xs text-muted-foreground">Tarifa por noche</p>
          <p className="font-medium">${parseFloat(r.finalRatePerNight || "0").toLocaleString("es-AR")}</p>
        </div>
        <div>
          <p className="text-xs text-muted-foreground">Total habitación</p>
          <p className="font-medium">${parseFloat(r.totalRoomAmount || "0").toLocaleString("es-AR")}</p>
        </div>
        {r.discountType && r.discountType !== "none" && (
          <div>
            <p className="text-xs text-muted-foreground">Descuento</p>
            <p className="font-medium text-green-600">
              {r.discountType === "percent" ? `${r.discountValue}%` : `$${r.discountValue}`}
            </p>
          </div>
        )}
        <div>
          <p className="text-xs text-muted-foreground">Fuente</p>
          <p className="font-medium">{sourceLabel[r.source || ""] || r.source || "-"}</p>
        </div>
        {r.company && (
          <div className="col-span-2">
            <p className="text-xs text-muted-foreground">Empresa</p>
            <p className="font-medium">{r.company.nombreFantasia || r.company.razonSocial}</p>
          </div>
        )}
        {r.agency && (
          <div className="col-span-2">
            <p className="text-xs text-muted-foreground">Agencia</p>
            <p className="font-medium">{r.agency.nombreFantasia || r.agency.razonSocial}</p>
          </div>
        )}
      </div>

      {r.notes && (
        <div className="border-t pt-2">
          <p className="text-xs text-muted-foreground">Notas</p>
          <p className="text-xs mt-0.5">{r.notes}</p>
        </div>
      )}

      {activeCharges.length > 0 && (
        <div className="border-t pt-2">
          <p className="text-xs font-semibold text-muted-foreground mb-1">Cargos ({activeCharges.length})</p>
          <div className="space-y-1">
            {activeCharges.map(c => (
              <div key={c.id} className="flex justify-between text-xs">
                <span>{c.description}</span>
                <span className="font-medium">${parseFloat(c.amount).toLocaleString("es-AR")}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {activePayments.length > 0 && (
        <div className="border-t pt-2">
          <p className="text-xs font-semibold text-muted-foreground mb-1">Pagos ({activePayments.length})</p>
          <div className="space-y-1">
            {activePayments.map(p => (
              <div key={p.id} className="flex justify-between text-xs">
                <span>{paymentMethodLabel[p.method || ""] || p.method} · {p.date}</span>
                <span className="font-medium text-green-700 dark:text-green-400">${parseFloat(p.amount).toLocaleString("es-AR")}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="border-t pt-2 flex justify-between text-xs font-semibold">
        <span>Saldo pendiente</span>
        <span className={balance > 0 ? "text-red-600 dark:text-red-400" : "text-green-600 dark:text-green-400"}>
          ${balance.toLocaleString("es-AR", { minimumFractionDigits: 2 })}
        </span>
      </div>
    </div>
  );
}

// ========== PREFERENCES SECTION ==========
const PREF_CATEGORIES = [
  { value: "habitacion",    label: "Habitación",     icon: DoorOpen },
  { value: "alimentacion",  label: "Alimentación",   icon: UtensilsCrossed },
  { value: "amenities",     label: "Amenities",      icon: Star },
  { value: "servicio",      label: "Servicio",       icon: Sparkles },
  { value: "fecha_especial",label: "Fecha Especial", icon: Gift },
  { value: "motivo_viaje",  label: "Motivo de Viaje",icon: Briefcase },
  { value: "nota_interna",  label: "Nota Interna",   icon: FileText },
  { value: "otro",          label: "Otro",           icon: Heart },
];

const PREF_PRIORITIES = [
  { value: "low",      label: "Baja",    cls: "bg-gray-100 text-gray-700" },
  { value: "normal",   label: "Normal",  cls: "bg-blue-100 text-blue-700" },
  { value: "high",     label: "Alta",    cls: "bg-orange-100 text-orange-700" },
  { value: "critical", label: "Crítica", cls: "bg-red-100 text-red-700" },
];

function getCatIcon(cat: string) {
  const found = PREF_CATEGORIES.find(c => c.value === cat);
  if (!found) return <Heart className="h-4 w-4 text-muted-foreground" />;
  const Icon = found.icon;
  return <Icon className="h-4 w-4 text-muted-foreground" />;
}

function getPrefPriorityBadge(priority: string) {
  const p = PREF_PRIORITIES.find(x => x.value === priority);
  return <Badge className={`text-xs ${p?.cls || ""}`}>{p?.label || priority}</Badge>;
}

function GuestPreferencesSection({ guestId }: { guestId: string }) {
  const { toast } = useToast();
  const [showForm, setShowForm] = useState(false);
  const [editPref, setEditPref] = useState<GuestPreference | null>(null);
  const [category, setCategory] = useState("habitacion");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [priority, setPriority] = useState("normal");
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);

  const { data: preferences = [], isLoading } = useQuery<GuestPreference[]>({
    queryKey: ["/api/guests", guestId, "preferences"],
  });

  const resetForm = () => {
    setCategory("habitacion");
    setTitle("");
    setDescription("");
    setPriority("normal");
    setEditPref(null);
    setShowForm(false);
  };

  const openEdit = (pref: GuestPreference) => {
    setEditPref(pref);
    setCategory(pref.category);
    setTitle(pref.title);
    setDescription(pref.description || "");
    setPriority(pref.priority);
    setShowForm(true);
  };

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!title.trim()) throw new Error("El título es requerido");
      const body = { category, title: title.trim(), description: description.trim() || null, priority, visibleTo: ["all"], recordedBy: "Recepción" };
      if (editPref) {
        return apiRequest("PATCH", `/api/guests/${guestId}/preferences/${editPref.id}`, body);
      } else {
        return apiRequest("POST", `/api/guests/${guestId}/preferences`, body);
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/guests", guestId, "preferences"] });
      queryClient.invalidateQueries({ queryKey: ["/api/hospitality/dashboard"] });
      toast({ title: editPref ? "Preferencia actualizada" : "Preferencia guardada" });
      resetForm();
    },
    onError: (e: any) => toast({ title: e.message || "Error al guardar", variant: "destructive" }),
  });

  const toggleMutation = useMutation({
    mutationFn: (prefId: string) => apiRequest("PATCH", `/api/guests/${guestId}/preferences/${prefId}/toggle`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/guests", guestId, "preferences"] }),
  });

  const deleteMutation = useMutation({
    mutationFn: (prefId: string) => apiRequest("DELETE", `/api/guests/${guestId}/preferences/${prefId}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/guests", guestId, "preferences"] });
      queryClient.invalidateQueries({ queryKey: ["/api/hospitality/dashboard"] });
      toast({ title: "Preferencia eliminada" });
    },
  });

  return (
    <div className="border rounded-lg overflow-hidden" data-testid="guest-preferences-section">
      <div className="p-3 border-b bg-muted/50 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Heart className="h-4 w-4 text-primary" />
          <h4 className="font-semibold text-sm">Preferencias de Hospitalidad</h4>
          <Badge variant="outline" className="text-xs">{preferences.length}</Badge>
        </div>
        {!showForm && (
          <Button size="sm" variant="outline" onClick={() => { resetForm(); setShowForm(true); }} data-testid="btn-add-pref">
            <Plus className="h-3 w-3 mr-1" />
            Agregar
          </Button>
        )}
      </div>

      {showForm && (
        <div className="p-3 border-b bg-blue-50 dark:bg-blue-950/20 space-y-3">
          <div className="flex items-center justify-between mb-1">
            <p className="text-sm font-medium">{editPref ? "Editar preferencia" : "Nueva preferencia"}</p>
            <Button size="icon" variant="ghost" className="h-6 w-6" onClick={resetForm}><X className="h-3 w-3" /></Button>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label className="text-xs">Categoría</Label>
              <Select value={category} onValueChange={setCategory}>
                <SelectTrigger className="h-8 text-xs" data-testid="select-pref-category">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PREF_CATEGORIES.map(c => (
                    <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Prioridad</Label>
              <Select value={priority} onValueChange={setPriority}>
                <SelectTrigger className="h-8 text-xs" data-testid="select-pref-priority">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PREF_PRIORITIES.map(p => (
                    <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div>
            <Label className="text-xs">Título *</Label>
            <Input
              value={title}
              onChange={e => setTitle(e.target.value)}
              placeholder="Ej: Alergia al maní, Almohada extra, Habitación silenciosa..."
              className="h-8 text-xs"
              data-testid="input-pref-title"
            />
          </div>
          <div>
            <Label className="text-xs">Descripción (opcional)</Label>
            <Textarea
              value={description}
              onChange={e => setDescription(e.target.value)}
              placeholder="Detalles adicionales..."
              rows={2}
              className="text-xs resize-none"
              data-testid="input-pref-description"
            />
          </div>
          <div className="flex justify-end gap-2">
            <Button size="sm" variant="outline" onClick={resetForm}>Cancelar</Button>
            <Button size="sm" onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending} data-testid="btn-save-pref">
              {saveMutation.isPending ? "Guardando..." : editPref ? "Actualizar" : "Guardar"}
            </Button>
          </div>
        </div>
      )}

      <div className="divide-y max-h-[260px] overflow-y-auto">
        {isLoading ? (
          <div className="p-4 text-center text-sm text-muted-foreground">Cargando...</div>
        ) : preferences.length === 0 ? (
          <div className="p-4 text-center text-sm text-muted-foreground">
            Sin preferencias registradas. Usá el botón Agregar para cargar gustos y necesidades del huésped.
          </div>
        ) : (
          preferences.map(pref => (
            <div
              key={pref.id}
              className={`flex items-start justify-between p-3 gap-2 ${!pref.isActive ? "opacity-50" : ""}`}
              data-testid={`pref-item-${pref.id}`}
            >
              <div className="flex items-start gap-2 min-w-0">
                {getCatIcon(pref.category)}
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <p className="text-sm font-medium">{pref.title}</p>
                    {getPrefPriorityBadge(pref.priority)}
                    {!pref.isActive && <Badge variant="outline" className="text-xs">Inactiva</Badge>}
                  </div>
                  {pref.description && <p className="text-xs text-muted-foreground mt-0.5">{pref.description}</p>}
                </div>
              </div>
              <div className="flex items-center gap-1 flex-shrink-0">
                <Button
                  size="icon" variant="ghost" className="h-6 w-6"
                  onClick={() => toggleMutation.mutate(pref.id)}
                  title={pref.isActive ? "Desactivar" : "Activar"}
                  data-testid={`btn-toggle-pref-${pref.id}`}
                >
                  {pref.isActive
                    ? <ToggleRight className="h-4 w-4 text-green-500" />
                    : <ToggleLeft className="h-4 w-4 text-muted-foreground" />}
                </Button>
                <Button
                  size="icon" variant="ghost" className="h-6 w-6"
                  onClick={() => openEdit(pref)}
                  data-testid={`btn-edit-pref-${pref.id}`}
                >
                  <Pencil className="h-3 w-3" />
                </Button>
                <Button
                  size="icon" variant="ghost" className="h-6 w-6 text-destructive"
                  onClick={() => setDeleteConfirmId(pref.id)}
                  data-testid={`btn-delete-pref-${pref.id}`}
                >
                  <Trash2 className="h-3 w-3" />
                </Button>
              </div>
            </div>
          ))
        )}
      </div>

      <AlertDialog open={!!deleteConfirmId} onOpenChange={(o) => { if (!o) setDeleteConfirmId(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar preferencia?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta acción no se puede deshacer. La preferencia será eliminada permanentemente del perfil del huésped.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="btn-cancel-delete-pref">Cancelar</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => { if (deleteConfirmId) { deleteMutation.mutate(deleteConfirmId); setDeleteConfirmId(null); } }}
              data-testid="btn-confirm-delete-pref"
            >
              Eliminar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function GuestDetailDialog({
  guest,
  open,
  onOpenChange,
}: {
  guest: Guest;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [expandedReservationId, setExpandedReservationId] = useState<string | null>(null);

  const { data: allReservations } = useQuery<ReservationWithDetails[]>({
    queryKey: ["/api/reservations"],
  });

  const guestReservations = allReservations?.filter(r => r.guestId === guest.id) || [];
  const totalStays = guestReservations.filter(r => r.status === "checked_out").length;
  const totalNights = guestReservations.reduce((sum, r) => sum + (r.nights || 0), 0);
  const totalSpent = guestReservations.reduce((sum, r) => sum + parseFloat(r.totalRoomAmount || "0"), 0);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[640px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Detalle del Huésped</DialogTitle>
          <DialogDescription>Información completa y historial de reservaciones.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 py-4">
          <div className="flex items-center gap-4 p-4 bg-muted rounded-lg">
            <div className="flex h-14 w-14 items-center justify-center rounded-full bg-primary/10 text-primary font-bold text-xl">
              {guest.lastName?.[0]}{guest.firstName?.[0]}
            </div>
            <div className="flex-1">
              <div className="flex items-center gap-2 flex-wrap">
                <p className="font-semibold text-xl">
                  {guest.lastName} {guest.firstName}
                </p>
                {guest.segment && guest.segment !== "OTHER" && (() => {
                  const segColors: Record<string, string> = {
                    LEISURE: "bg-blue-100 text-blue-700",
                    CORP: "bg-purple-100 text-purple-700",
                    SPORT: "bg-green-100 text-green-700",
                    CONGRESS: "bg-amber-100 text-amber-700",
                  };
                  const segLabels: Record<string, string> = {
                    LEISURE: "Turismo", CORP: "Corporativo", SPORT: "Deportivo", CONGRESS: "Congreso",
                  };
                  return (
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${segColors[guest.segment] || "bg-gray-100 text-gray-600"}`}>
                      {segLabels[guest.segment] || guest.segment}
                    </span>
                  );
                })()}
              </div>
              <p className="text-sm text-muted-foreground">{guest.nationality || "Sin nacionalidad registrada"}</p>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-3 text-center">
            <div className="p-3 border rounded-lg">
              <p className="text-2xl font-bold text-primary">{totalStays}</p>
              <p className="text-sm text-muted-foreground">Estancias</p>
            </div>
            <div className="p-3 border rounded-lg">
              <p className="text-2xl font-bold text-primary">{totalNights}</p>
              <p className="text-sm text-muted-foreground">Noches</p>
            </div>
            <div className="p-3 border rounded-lg">
              <p className="text-2xl font-bold text-primary">${totalSpent.toFixed(0)}</p>
              <p className="text-sm text-muted-foreground">Gastado</p>
            </div>
          </div>

          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              {guest.email && (
                <div className="flex items-center gap-3 p-3 border rounded-lg">
                  <Mail className="h-4 w-4 text-muted-foreground" />
                  <div className="overflow-hidden">
                    <p className="text-xs text-muted-foreground">Email</p>
                    <p className="font-medium text-sm truncate">{guest.email}</p>
                  </div>
                </div>
              )}
              {guest.phone && (
                <div className="flex items-center gap-3 p-3 border rounded-lg">
                  <Phone className="h-4 w-4 text-muted-foreground" />
                  <div>
                    <p className="text-xs text-muted-foreground">Teléfono</p>
                    <p className="font-medium text-sm">{guest.phone}</p>
                  </div>
                </div>
              )}
            </div>
            <div className="grid grid-cols-2 gap-3">
              {guest.documentNumber && (
                <div className="flex items-center gap-3 p-3 border rounded-lg">
                  <FileText className="h-4 w-4 text-muted-foreground" />
                  <div>
                    <p className="text-xs text-muted-foreground">
                      {DOCUMENT_TYPE_LABELS[guest.documentType?.toLowerCase() || ""] || guest.documentType?.toUpperCase() || "Documento"}
                    </p>
                    <p className="font-medium text-sm">{guest.documentNumber}</p>
                  </div>
                </div>
              )}
              {guest.cuilCuit && (
                <div className="flex items-center gap-3 p-3 border rounded-lg">
                  <CreditCard className="h-4 w-4 text-muted-foreground" />
                  <div>
                    <p className="text-xs text-muted-foreground">CUIT / CUIL</p>
                    <p className="font-medium text-sm font-mono">{formatCuit(guest.cuilCuit)}</p>
                  </div>
                </div>
              )}
            </div>
            <div className="grid grid-cols-2 gap-3">
              {(guest as any).vatCondition && (
                <div className="flex items-center gap-3 p-3 border rounded-lg">
                  <FileText className="h-4 w-4 text-muted-foreground" />
                  <div>
                    <p className="text-xs text-muted-foreground">Condición IVA</p>
                    <p className="font-medium text-sm">{VAT_CONDITION_LABELS[(guest as any).vatCondition] || (guest as any).vatCondition}</p>
                  </div>
                </div>
              )}
              {guest.localidad && (
                <div className="flex items-center gap-3 p-3 border rounded-lg">
                  <MapPin className="h-4 w-4 text-muted-foreground" />
                  <div className="overflow-hidden">
                    <p className="text-xs text-muted-foreground">Ciudad</p>
                    <p className="font-medium text-sm truncate">{guest.localidad}</p>
                  </div>
                </div>
              )}
            </div>
          </div>

          {guest.vehiculoPatente && (
            <div className="border rounded-lg p-3">
              <div className="flex items-center gap-2 mb-2">
                <Car className="h-4 w-4 text-muted-foreground" />
                <span className="font-medium text-sm">Vehículo</span>
              </div>
              <div className="grid grid-cols-2 gap-2 text-sm">
                <div>
                  <p className="text-xs text-muted-foreground">Patente</p>
                  <p className="font-medium">{guest.vehiculoPatente}</p>
                </div>
                {guest.vehiculoMarca && (
                  <div>
                    <p className="text-xs text-muted-foreground">Marca</p>
                    <p className="font-medium">{guest.vehiculoMarca}</p>
                  </div>
                )}
                {guest.vehiculoModelo && (
                  <div>
                    <p className="text-xs text-muted-foreground">Modelo</p>
                    <p className="font-medium">{guest.vehiculoModelo}</p>
                  </div>
                )}
                {guest.vehiculoColor && (
                  <div>
                    <p className="text-xs text-muted-foreground">Color</p>
                    <p className="font-medium">{guest.vehiculoColor}</p>
                  </div>
                )}
              </div>
            </div>
          )}

          <GuestPreferencesSection guestId={guest.id} />

          <div className="border rounded-lg">
            <div className="p-3 border-b bg-muted/50 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Hotel className="h-4 w-4 text-muted-foreground" />
                <h4 className="font-semibold">Historial de Reservaciones</h4>
                {guestReservations.length > 0 && (
                  <Badge variant="outline" className="text-xs">{guestReservations.length}</Badge>
                )}
              </div>
            </div>
            <div className="divide-y max-h-[320px] overflow-y-auto">
              {guestReservations.length > 0 ? (
                guestReservations.map((reservation) => {
                  const isExpanded = expandedReservationId === reservation.id;
                  return (
                    <div key={reservation.id} data-testid={`guest-reservation-${reservation.id}`}>
                      <button
                        className="w-full flex items-center justify-between p-3 text-sm hover:bg-muted/40 transition-colors text-left"
                        onClick={() => setExpandedReservationId(isExpanded ? null : reservation.id)}
                        data-testid={`btn-expand-reservation-${reservation.id}`}
                      >
                        <div className="flex items-center gap-2">
                          <Calendar className="h-4 w-4 text-muted-foreground shrink-0" />
                          <div>
                            <p className="font-medium">
                              Hab. {reservation.room?.roomNumber}
                              {(reservation.room as any)?.roomType?.name && (
                                <span className="text-muted-foreground font-normal"> · {(reservation.room as any).roomType.name}</span>
                              )}
                            </p>
                            <p className="text-muted-foreground text-xs font-mono">{reservation.reservationCode}</p>
                            <p className="text-muted-foreground text-xs">
                              {reservation.checkInDate} → {reservation.checkOutDate} ({reservation.nights} noche{reservation.nights !== 1 ? "s" : ""})
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <span className="font-medium">${parseFloat(reservation.totalRoomAmount || "0").toLocaleString("es-AR")}</span>
                          <ReservationStatusBadge status={reservation.status} />
                          {isExpanded ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
                        </div>
                      </button>
                      {isExpanded && <ReservationExpandedDetail r={reservation} />}
                    </div>
                  );
                })
              ) : (
                <div className="p-4 text-center text-muted-foreground text-sm">
                  No hay reservaciones registradas
                </div>
              )}
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cerrar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default function GuestsPage() {
  const { toast } = useToast();
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";
  const [searchQuery, setSearchQuery] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [detailDialogOpen, setDetailDialogOpen] = useState(false);
  const [selectedGuest, setSelectedGuest] = useState<Guest | undefined>();
  const [showPhantomResult, setShowPhantomResult] = useState(false);

  const { data: guests, isLoading } = useQuery<Guest[]>({
    queryKey: ["/api/guests"],
  });

  const { data: phantomData, refetch: refetchPhantoms } = useQuery<{ phantoms: any[]; count: number }>({
    queryKey: ["/api/admin/guests/phantom"],
    enabled: isAdmin,
  });

  const cleanupPhantomMutation = useMutation({
    mutationFn: () => apiRequest("POST", "/api/admin/guests/cleanup-phantom"),
    onSuccess: async (res) => {
      const data = await res.json();
      toast({ title: data.message || "Limpieza completada" });
      refetchPhantoms();
      queryClient.invalidateQueries({ queryKey: ["/api/guests"] });
      setShowPhantomResult(false);
    },
    onError: () => toast({ title: "Error al limpiar huéspedes", variant: "destructive" }),
  });

  const deactivateMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await apiRequest("PATCH", `/api/guests/${id}/deactivate`, {});
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Error al desactivar");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/guests"] });
      toast({ title: "Huésped desactivado", description: "El huésped fue desactivado y no aparecerá en búsquedas." });
    },
    onError: (error: any) => {
      toast({ title: "No se pudo desactivar", description: error?.message || "Error al desactivar el huésped", variant: "destructive" });
    },
  });

  const filteredGuests = guests?.filter((guest) => {
    const fullName = `${guest.lastName} ${guest.firstName}`.toLowerCase();
    const matchesSearch =
      fullName.includes(searchQuery.toLowerCase()) ||
      guest.email?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      guest.documentNumber?.includes(searchQuery);
    return matchesSearch;
  });

  const handleEditGuest = (guest: Guest) => {
    setSelectedGuest(guest);
    setDialogOpen(true);
  };

  const handleViewGuest = (guest: Guest) => {
    setSelectedGuest(guest);
    setDetailDialogOpen(true);
  };

  const handleNewGuest = () => {
    setSelectedGuest(undefined);
    setDialogOpen(true);
  };

  return (
    <div className="flex flex-col gap-6 p-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight" data-testid="text-guests-title">
            Huéspedes
          </h1>
          <p className="text-muted-foreground">Gestiona el registro de huéspedes del hotel</p>
        </div>
        <Button onClick={handleNewGuest} data-testid="button-new-guest">
          <Plus className="mr-2 h-4 w-4" />
          Nuevo Huésped
        </Button>
      </div>

      {/* Admin: Phantom Guest Cleanup */}
      {isAdmin && phantomData && phantomData.count > 0 && (
        <Card className="border-amber-300 bg-amber-50/50 dark:border-amber-700 dark:bg-amber-950/20">
          <CardContent className="p-4">
            <div className="flex items-start gap-3">
              <AlertTriangle className="h-5 w-5 text-amber-600 mt-0.5 shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="font-medium text-amber-900 dark:text-amber-300">
                  {phantomData.count} huésped(es) con nombre duplicado detectados
                </p>
                <p className="text-sm text-amber-700 dark:text-amber-400 mt-0.5">
                  Estos fueron creados por el sistema al asignar habitaciones a grupos sin especificar los pasajeros. Se marcarán como "Por Confirmar".
                </p>
              </div>
              <Button
                size="sm"
                variant="outline"
                className="shrink-0 border-amber-400 text-amber-800 hover:bg-amber-100 dark:border-amber-600 dark:text-amber-300"
                onClick={() => cleanupPhantomMutation.mutate()}
                disabled={cleanupPhantomMutation.isPending}
                data-testid="button-cleanup-phantom-guests"
              >
                <Wrench className="mr-2 h-3 w-3" />
                {cleanupPhantomMutation.isPending ? "Limpiando..." : "Limpiar"}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Search */}
      <Card>
        <CardContent className="p-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Buscar por nombre, email o documento..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10"
              data-testid="input-search-guests"
            />
          </div>
        </CardContent>
      </Card>

      {/* Guests Table */}
      {isLoading ? (
        <Card>
          <CardContent className="p-6">
            <div className="space-y-4">
              {[...Array(5)].map((_, i) => (
                <Skeleton key={i} className="h-16" />
              ))}
            </div>
          </CardContent>
        </Card>
      ) : filteredGuests && filteredGuests.length > 0 ? (
        <Card>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nombre</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>Teléfono</TableHead>
                <TableHead>Documento</TableHead>
                <TableHead>Nacionalidad</TableHead>
                <TableHead className="w-[50px]"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredGuests.map((guest) => (
                <TableRow key={guest.id} data-testid={`guest-row-${guest.id}`}>
                  <TableCell>
                    <div className="flex items-center gap-3">
                      <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/10 text-primary font-medium text-sm">
                        {guest.lastName?.[0]}{guest.firstName?.[0]}
                      </div>
                      <span className="font-medium">
                        {guest.lastName} {guest.firstName}
                      </span>
                    </div>
                  </TableCell>
                  <TableCell>{guest.email || "-"}</TableCell>
                  <TableCell>{guest.phone || "-"}</TableCell>
                  <TableCell>
                    {guest.documentType && guest.documentNumber
                      ? `${DOCUMENT_TYPE_LABELS[guest.documentType.toLowerCase()] || guest.documentType.toUpperCase()}: ${guest.documentNumber}`
                      : "-"}
                  </TableCell>
                  <TableCell>{guest.nationality || "-"}</TableCell>
                  <TableCell>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon" data-testid={`btn-guest-menu-${guest.id}`}>
                          <MoreHorizontal className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => handleViewGuest(guest)} data-testid={`btn-view-guest-${guest.id}`}>
                          <Eye className="mr-2 h-4 w-4" />
                          Ver Detalle
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => handleEditGuest(guest)}>
                          <Pencil className="mr-2 h-4 w-4" />
                          Editar
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem
                          className="text-orange-600"
                          onClick={() => {
                            if (confirm(`¿Desactivar a ${guest.firstName} ${guest.lastName}? Solo es posible si no tiene reservas activas.`)) {
                              deactivateMutation.mutate(guest.id);
                            }
                          }}
                        >
                          <Trash2 className="mr-2 h-4 w-4" />
                          Desactivar
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      ) : (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12 text-center">
            <Users className="h-16 w-16 text-muted-foreground/50 mb-4" />
            <h3 className="text-lg font-semibold mb-2">No hay huéspedes</h3>
            <p className="text-muted-foreground mb-4">
              {searchQuery
                ? "No se encontraron huéspedes con los criterios de búsqueda."
                : "Comienza registrando el primer huésped del hotel."}
            </p>
            {!searchQuery && (
              <Button onClick={handleNewGuest}>
                <Plus className="mr-2 h-4 w-4" />
                Registrar Primer Huésped
              </Button>
            )}
          </CardContent>
        </Card>
      )}

      {/* Guest Form Dialog */}
      <GuestFormDialog
        guest={selectedGuest}
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        onSuccess={() => setSelectedGuest(undefined)}
      />

      {/* Guest Detail Dialog */}
      {selectedGuest && (
        <GuestDetailDialog
          guest={selectedGuest}
          open={detailDialogOpen}
          onOpenChange={setDetailDialogOpen}
        />
      )}
    </div>
  );
}
