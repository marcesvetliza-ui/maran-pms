import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Search, User, Building2, Plus, X, Check, Plane } from "lucide-react";
import type { Guest, Company, InsertGuest, InsertCompany, Agency, InsertAgency } from "@shared/schema";

interface GuestSelectorProps {
  onSelect: (guest: Guest) => void;
  onCreateNew: (guest: InsertGuest) => void;
  selectedGuest?: Guest | null;
  onClear?: () => void;
}

export function GuestSelector({ onSelect, onCreateNew, selectedGuest, onClear }: GuestSelectorProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [mode, setMode] = useState<"search" | "create">("search");
  const [debouncedQuery, setDebouncedQuery] = useState("");

  const [newGuest, setNewGuest] = useState({
    firstName: "",
    lastName: "",
    email: "",
    phone: "",
    documentType: "dni" as "dni" | "passport" | "cedula" | "other" | null,
    documentNumber: "",
    nationality: "Argentina",
    direccion: "",
    localidad: "",
    codigoPostal: "",
    fechaNacimiento: "",
    sexo: "no_especifica" as "masculino" | "femenino" | "otro" | "no_especifica",
    cuilCuit: "",
    vehiculoPatente: "",
    vehiculoMarca: "",
    vehiculoModelo: "",
    vehiculoColor: "",
  });

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedQuery(searchQuery), 300);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  const { data: searchResults = [], isLoading } = useQuery<Guest[]>({
    queryKey: ["/api/guests/search", debouncedQuery],
    queryFn: async () => {
      if (!debouncedQuery || debouncedQuery.length < 2) return [];
      const res = await fetch(`/api/guests/search?q=${encodeURIComponent(debouncedQuery)}`);
      return res.json();
    },
    enabled: debouncedQuery.length >= 2,
  });

  const handleCreateGuest = () => {
    if (!newGuest.firstName || !newGuest.lastName) return;
    onCreateNew({
      firstName: newGuest.firstName,
      lastName: newGuest.lastName,
      email: newGuest.email || null,
      phone: newGuest.phone || null,
      documentType: newGuest.documentType,
      documentNumber: newGuest.documentNumber || null,
      nationality: newGuest.nationality || null,
      direccion: newGuest.direccion || null,
      localidad: newGuest.localidad || null,
      codigoPostal: newGuest.codigoPostal || null,
      fechaNacimiento: newGuest.fechaNacimiento || null,
      sexo: newGuest.sexo,
      cuilCuit: newGuest.cuilCuit || null,
      vehiculoPatente: newGuest.vehiculoPatente || null,
      vehiculoMarca: newGuest.vehiculoMarca || null,
      vehiculoModelo: newGuest.vehiculoModelo || null,
      vehiculoColor: newGuest.vehiculoColor || null,
      companyId: null,
    });
    setNewGuest({
      firstName: "",
      lastName: "",
      email: "",
      phone: "",
      documentType: "dni",
      documentNumber: "",
      nationality: "Argentina",
      direccion: "",
      localidad: "",
      codigoPostal: "",
      fechaNacimiento: "",
      sexo: "no_especifica",
      cuilCuit: "",
      vehiculoPatente: "",
      vehiculoMarca: "",
      vehiculoModelo: "",
      vehiculoColor: "",
    });
    setMode("search");
  };

  if (selectedGuest) {
    return (
      <Card className="bg-accent/30">
        <CardContent className="pt-4 pb-4">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 flex-wrap">
              <User className="h-4 w-4 text-muted-foreground" />
              <span className="font-medium">
                {selectedGuest.firstName} {selectedGuest.lastName}
              </span>
              {selectedGuest.codigo && (
                <Badge variant="secondary" className="text-xs">
                  {selectedGuest.codigo}
                </Badge>
              )}
              <Badge variant="outline" className="text-xs">
                {selectedGuest.documentType?.toUpperCase()} {selectedGuest.documentNumber}
              </Badge>
            </div>
            {onClear && (
              <Button size="icon" variant="ghost" onClick={onClear} data-testid="button-clear-guest">
                <X className="h-4 w-4" />
              </Button>
            )}
          </div>
          {selectedGuest.email && (
            <p className="text-sm text-muted-foreground mt-1">{selectedGuest.email}</p>
          )}
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <User className="h-4 w-4" />
          Seleccionar Huesped
        </CardTitle>
      </CardHeader>
      <CardContent>
        <Tabs value={mode} onValueChange={(v) => setMode(v as "search" | "create")}>
          <TabsList className="grid w-full grid-cols-2 mb-4">
            <TabsTrigger value="search" data-testid="tab-search-guest">
              <Search className="h-4 w-4 mr-2" />
              Buscar Existente
            </TabsTrigger>
            <TabsTrigger value="create" data-testid="tab-create-guest">
              <Plus className="h-4 w-4 mr-2" />
              Crear Nuevo
            </TabsTrigger>
          </TabsList>

          <TabsContent value="search" className="space-y-4">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Buscar por nombre, email o documento..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10"
                data-testid="input-search-guest"
              />
            </div>

            {isLoading && (
              <p className="text-sm text-muted-foreground text-center py-4">Buscando...</p>
            )}

            {searchResults.length > 0 && (
              <div className="space-y-2 max-h-60 overflow-y-auto">
                {searchResults.map((guest) => (
                  <div
                    key={guest.id}
                    className="p-3 rounded-md border hover-elevate active-elevate-2 cursor-pointer"
                    onClick={() => onSelect(guest)}
                    data-testid={`guest-result-${guest.id}`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div>
                        <p className="font-medium">
                          {guest.firstName} {guest.lastName}
                          {guest.codigo && <span className="text-muted-foreground ml-2 text-sm">({guest.codigo})</span>}
                        </p>
                        <p className="text-sm text-muted-foreground">
                          {guest.documentType?.toUpperCase()} {guest.documentNumber}
                        </p>
                      </div>
                      <Check className="h-4 w-4 text-muted-foreground invisible group-hover:visible" />
                    </div>
                  </div>
                ))}
              </div>
            )}

            {debouncedQuery.length >= 2 && searchResults.length === 0 && !isLoading && (
              <p className="text-sm text-muted-foreground text-center py-4">
                No se encontraron huespedes. 
                <Button variant="ghost" className="p-0 ml-1 h-auto text-primary underline" onClick={() => setMode("create")}>
                  Crear nuevo
                </Button>
              </p>
            )}
          </TabsContent>

          <TabsContent value="create" className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="firstName">Nombre *</Label>
                <Input
                  id="firstName"
                  value={newGuest.firstName}
                  onChange={(e) => setNewGuest({ ...newGuest, firstName: e.target.value })}
                  placeholder="Nombre"
                  data-testid="input-guest-firstname"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="lastName">Apellido *</Label>
                <Input
                  id="lastName"
                  value={newGuest.lastName}
                  onChange={(e) => setNewGuest({ ...newGuest, lastName: e.target.value })}
                  placeholder="Apellido"
                  data-testid="input-guest-lastname"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="documentType">Tipo Doc.</Label>
                <Select
                  value={newGuest.documentType || "dni"}
                  onValueChange={(v) => setNewGuest({ ...newGuest, documentType: v as any })}
                >
                  <SelectTrigger data-testid="select-document-type">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="dni">DNI</SelectItem>
                    <SelectItem value="passport">Pasaporte</SelectItem>
                    <SelectItem value="cedula">Cedula</SelectItem>
                    <SelectItem value="other">Otro</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="documentNumber">Numero Doc.</Label>
                <Input
                  id="documentNumber"
                  value={newGuest.documentNumber}
                  onChange={(e) => setNewGuest({ ...newGuest, documentNumber: e.target.value })}
                  placeholder="12345678"
                  data-testid="input-document-number"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  value={newGuest.email}
                  onChange={(e) => setNewGuest({ ...newGuest, email: e.target.value })}
                  placeholder="correo@email.com"
                  data-testid="input-guest-email"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="phone">Telefono</Label>
                <Input
                  id="phone"
                  value={newGuest.phone}
                  onChange={(e) => setNewGuest({ ...newGuest, phone: e.target.value })}
                  placeholder="+54 11 1234-5678"
                  data-testid="input-guest-phone"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="nationality">Nacionalidad</Label>
                <Input
                  id="nationality"
                  value={newGuest.nationality}
                  onChange={(e) => setNewGuest({ ...newGuest, nationality: e.target.value })}
                  placeholder="Argentina"
                  data-testid="input-guest-nationality"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="sexo">Sexo</Label>
                <Select
                  value={newGuest.sexo}
                  onValueChange={(v) => setNewGuest({ ...newGuest, sexo: v as any })}
                >
                  <SelectTrigger data-testid="select-guest-sexo">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="masculino">Masculino</SelectItem>
                    <SelectItem value="femenino">Femenino</SelectItem>
                    <SelectItem value="otro">Otro</SelectItem>
                    <SelectItem value="no_especifica">No especifica</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="fechaNacimiento">Fecha Nacimiento</Label>
                <Input
                  id="fechaNacimiento"
                  type="date"
                  value={newGuest.fechaNacimiento}
                  onChange={(e) => setNewGuest({ ...newGuest, fechaNacimiento: e.target.value })}
                  data-testid="input-guest-fechanacimiento"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="cuilCuit">CUIL/CUIT</Label>
                <Input
                  id="cuilCuit"
                  value={newGuest.cuilCuit}
                  onChange={(e) => setNewGuest({ ...newGuest, cuilCuit: e.target.value })}
                  placeholder="20-12345678-9"
                  data-testid="input-guest-cuilcuit"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="direccion">Direccion</Label>
              <Input
                id="direccion"
                value={newGuest.direccion}
                onChange={(e) => setNewGuest({ ...newGuest, direccion: e.target.value })}
                placeholder="Av. Corrientes 1234"
                data-testid="input-guest-direccion"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="localidad">Localidad</Label>
                <Input
                  id="localidad"
                  value={newGuest.localidad}
                  onChange={(e) => setNewGuest({ ...newGuest, localidad: e.target.value })}
                  placeholder="CABA"
                  data-testid="input-guest-localidad"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="codigoPostal">Codigo Postal</Label>
                <Input
                  id="codigoPostal"
                  value={newGuest.codigoPostal}
                  onChange={(e) => setNewGuest({ ...newGuest, codigoPostal: e.target.value })}
                  placeholder="1000"
                  data-testid="input-guest-codigopostal"
                />
              </div>
            </div>

            <div className="border-t pt-3 mt-1">
              <Label className="text-xs text-muted-foreground uppercase tracking-wide">Datos del Vehículo (opcional)</Label>
              <div className="grid grid-cols-2 gap-4 mt-2">
                <div className="space-y-2">
                  <Label htmlFor="vehiculoPatente">Patente</Label>
                  <Input
                    id="vehiculoPatente"
                    value={newGuest.vehiculoPatente}
                    onChange={(e) => setNewGuest({ ...newGuest, vehiculoPatente: e.target.value })}
                    placeholder="ABC 123"
                    data-testid="input-guest-vehiculo-patente"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="vehiculoMarca">Marca</Label>
                  <Input
                    id="vehiculoMarca"
                    value={newGuest.vehiculoMarca}
                    onChange={(e) => setNewGuest({ ...newGuest, vehiculoMarca: e.target.value })}
                    placeholder="Toyota"
                    data-testid="input-guest-vehiculo-marca"
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4 mt-2">
                <div className="space-y-2">
                  <Label htmlFor="vehiculoModelo">Modelo</Label>
                  <Input
                    id="vehiculoModelo"
                    value={newGuest.vehiculoModelo}
                    onChange={(e) => setNewGuest({ ...newGuest, vehiculoModelo: e.target.value })}
                    placeholder="Corolla"
                    data-testid="input-guest-vehiculo-modelo"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="vehiculoColor">Color</Label>
                  <Input
                    id="vehiculoColor"
                    value={newGuest.vehiculoColor}
                    onChange={(e) => setNewGuest({ ...newGuest, vehiculoColor: e.target.value })}
                    placeholder="Blanco"
                    data-testid="input-guest-vehiculo-color"
                  />
                </div>
              </div>
            </div>

            <Button
              onClick={handleCreateGuest}
              disabled={!newGuest.firstName || !newGuest.lastName}
              className="w-full"
              data-testid="button-create-guest"
            >
              <Plus className="h-4 w-4 mr-2" />
              Crear Huesped
            </Button>
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
}

interface CompanySelectorProps {
  onSelect: (company: Company) => void;
  onCreateNew: (company: InsertCompany) => void;
  selectedCompany?: Company | null;
  onClear?: () => void;
}

export function CompanySelector({ onSelect, onCreateNew, selectedCompany, onClear }: CompanySelectorProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [mode, setMode] = useState<"search" | "create">("search");
  const [debouncedQuery, setDebouncedQuery] = useState("");

  const [newCompany, setNewCompany] = useState({
    razonSocial: "",
    nombreFantasia: "",
    cuilCuit: "",
    condicionIva: "responsable_inscripto" as "responsable_inscripto" | "monotributo" | "exento" | "consumidor_final" | "no_responsable",
    direccion: "",
    localidad: "",
    provincia: "",
    codigoPostal: "",
    pais: "Argentina",
    telefono: "",
    email: "",
    numeroFiscal: "",
    inscripcionNacional: "",
    inscripcionProvincial: "",
    contactName: "",
    contactEmail: "",
    contactPhone: "",
    creditLimit: "0",
    paymentTermDays: 30,
    notes: "",
  });

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedQuery(searchQuery), 300);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  const { data: searchResults = [], isLoading } = useQuery<Company[]>({
    queryKey: ["/api/companies/search", debouncedQuery],
    queryFn: async () => {
      if (!debouncedQuery || debouncedQuery.length < 2) return [];
      const res = await fetch(`/api/companies/search?q=${encodeURIComponent(debouncedQuery)}`);
      return res.json();
    },
    enabled: debouncedQuery.length >= 2,
  });

  const handleCreateCompany = () => {
    if (!newCompany.razonSocial || !newCompany.cuilCuit) return;
    onCreateNew({
      razonSocial: newCompany.razonSocial,
      cuilCuit: newCompany.cuilCuit,
      nombreFantasia: newCompany.nombreFantasia || null,
      condicionIva: newCompany.condicionIva,
      direccion: newCompany.direccion || null,
      localidad: newCompany.localidad || null,
      provincia: newCompany.provincia || null,
      codigoPostal: newCompany.codigoPostal || null,
      pais: newCompany.pais || "Argentina",
      telefono: newCompany.telefono || null,
      email: newCompany.email || null,
      numeroFiscal: newCompany.numeroFiscal || null,
      inscripcionNacional: newCompany.inscripcionNacional || null,
      inscripcionProvincial: newCompany.inscripcionProvincial || null,
      contactName: newCompany.contactName || null,
      contactEmail: newCompany.contactEmail || null,
      contactPhone: newCompany.contactPhone || null,
      creditLimit: newCompany.creditLimit || "0",
      paymentTermDays: newCompany.paymentTermDays || 30,
      notes: newCompany.notes || null,
      isActive: "true",
    });
    setNewCompany({
      razonSocial: "",
      nombreFantasia: "",
      cuilCuit: "",
      condicionIva: "responsable_inscripto",
      direccion: "",
      localidad: "",
      provincia: "",
      codigoPostal: "",
      pais: "Argentina",
      telefono: "",
      email: "",
      numeroFiscal: "",
      inscripcionNacional: "",
      inscripcionProvincial: "",
      contactName: "",
      contactEmail: "",
      contactPhone: "",
      creditLimit: "0",
      paymentTermDays: 30,
      notes: "",
    });
    setMode("search");
  };

  if (selectedCompany) {
    return (
      <Card className="bg-accent/30">
        <CardContent className="pt-4 pb-4">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 flex-wrap">
              <Building2 className="h-4 w-4 text-muted-foreground" />
              <span className="font-medium">
                {selectedCompany.nombreFantasia || selectedCompany.razonSocial}
              </span>
              <Badge variant="outline" className="text-xs">
                CUIT {selectedCompany.cuilCuit}
              </Badge>
            </div>
            {onClear && (
              <Button size="icon" variant="ghost" onClick={onClear} data-testid="button-clear-company">
                <X className="h-4 w-4" />
              </Button>
            )}
          </div>
          {selectedCompany.email && (
            <p className="text-sm text-muted-foreground mt-1">{selectedCompany.email}</p>
          )}
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <Building2 className="h-4 w-4" />
          Seleccionar Empresa (Opcional)
        </CardTitle>
      </CardHeader>
      <CardContent>
        <Tabs value={mode} onValueChange={(v) => setMode(v as "search" | "create")}>
          <TabsList className="grid w-full grid-cols-2 mb-4">
            <TabsTrigger value="search" data-testid="tab-search-company">
              <Search className="h-4 w-4 mr-2" />
              Buscar Existente
            </TabsTrigger>
            <TabsTrigger value="create" data-testid="tab-create-company">
              <Plus className="h-4 w-4 mr-2" />
              Crear Nueva
            </TabsTrigger>
          </TabsList>

          <TabsContent value="search" className="space-y-4">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Buscar por razon social, nombre comercial o CUIT..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10"
                data-testid="input-search-company"
              />
            </div>

            {isLoading && (
              <p className="text-sm text-muted-foreground text-center py-4">Buscando...</p>
            )}

            {searchResults.length > 0 && (
              <div className="space-y-2 max-h-60 overflow-y-auto">
                {searchResults.map((company) => (
                  <div
                    key={company.id}
                    className="p-3 rounded-md border hover-elevate active-elevate-2 cursor-pointer"
                    onClick={() => onSelect(company)}
                    data-testid={`company-result-${company.id}`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div>
                        <p className="font-medium">
                          {company.nombreFantasia || company.razonSocial}
                        </p>
                        <p className="text-sm text-muted-foreground">
                          CUIT {company.cuilCuit}
                        </p>
                      </div>
                      <Check className="h-4 w-4 text-muted-foreground invisible group-hover:visible" />
                    </div>
                  </div>
                ))}
              </div>
            )}

            {debouncedQuery.length >= 2 && searchResults.length === 0 && !isLoading && (
              <p className="text-sm text-muted-foreground text-center py-4">
                No se encontraron empresas. 
                <Button variant="ghost" className="p-0 ml-1 h-auto text-primary underline" onClick={() => setMode("create")}>
                  Crear nueva
                </Button>
              </p>
            )}
          </TabsContent>

          <TabsContent value="create" className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="razonSocial">Razon Social *</Label>
                <Input
                  id="razonSocial"
                  value={newCompany.razonSocial}
                  onChange={(e) => setNewCompany({ ...newCompany, razonSocial: e.target.value })}
                  placeholder="Empresa S.A."
                  data-testid="input-company-razonsocial"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="nombreFantasia">Nombre Fantasia</Label>
                <Input
                  id="nombreFantasia"
                  value={newCompany.nombreFantasia}
                  onChange={(e) => setNewCompany({ ...newCompany, nombreFantasia: e.target.value })}
                  placeholder="Nombre Comercial"
                  data-testid="input-company-nombrefantasia"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="cuilCuit">CUIT *</Label>
                <Input
                  id="cuilCuit"
                  value={newCompany.cuilCuit}
                  onChange={(e) => setNewCompany({ ...newCompany, cuilCuit: e.target.value })}
                  placeholder="30-12345678-9"
                  data-testid="input-company-cuilcuit"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="condicionIva">Condicion IVA</Label>
                <Select
                  value={newCompany.condicionIva}
                  onValueChange={(v) => setNewCompany({ ...newCompany, condicionIva: v as any })}
                >
                  <SelectTrigger data-testid="select-condicion-iva">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="responsable_inscripto">Responsable Inscripto</SelectItem>
                    <SelectItem value="monotributo">Monotributo</SelectItem>
                    <SelectItem value="exento">Exento</SelectItem>
                    <SelectItem value="consumidor_final">Consumidor Final</SelectItem>
                    <SelectItem value="no_responsable">No Responsable</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="direccion">Direccion</Label>
              <Input
                id="direccion"
                value={newCompany.direccion}
                onChange={(e) => setNewCompany({ ...newCompany, direccion: e.target.value })}
                placeholder="Av. del Libertador 1000"
                data-testid="input-company-direccion"
              />
            </div>

            <div className="grid grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label htmlFor="localidad">Localidad</Label>
                <Input
                  id="localidad"
                  value={newCompany.localidad}
                  onChange={(e) => setNewCompany({ ...newCompany, localidad: e.target.value })}
                  placeholder="CABA"
                  data-testid="input-company-localidad"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="provincia">Provincia</Label>
                <Input
                  id="provincia"
                  value={newCompany.provincia}
                  onChange={(e) => setNewCompany({ ...newCompany, provincia: e.target.value })}
                  placeholder="Buenos Aires"
                  data-testid="input-company-provincia"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="codigoPostal">CP</Label>
                <Input
                  id="codigoPostal"
                  value={newCompany.codigoPostal}
                  onChange={(e) => setNewCompany({ ...newCompany, codigoPostal: e.target.value })}
                  placeholder="1000"
                  data-testid="input-company-codigopostal"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="companyEmail">Email</Label>
                <Input
                  id="companyEmail"
                  type="email"
                  value={newCompany.email}
                  onChange={(e) => setNewCompany({ ...newCompany, email: e.target.value })}
                  placeholder="contacto@empresa.com"
                  data-testid="input-company-email"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="companyPhone">Telefono</Label>
                <Input
                  id="companyPhone"
                  value={newCompany.telefono}
                  onChange={(e) => setNewCompany({ ...newCompany, telefono: e.target.value })}
                  placeholder="+54 11 4000-1234"
                  data-testid="input-company-telefono"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="contactName">Nombre de Contacto</Label>
              <Input
                id="contactName"
                value={newCompany.contactName}
                onChange={(e) => setNewCompany({ ...newCompany, contactName: e.target.value })}
                placeholder="Juan Perez"
                data-testid="input-company-contact"
              />
            </div>

            <Button
              onClick={handleCreateCompany}
              disabled={!newCompany.razonSocial || !newCompany.cuilCuit}
              className="w-full"
              data-testid="button-create-company"
            >
              <Plus className="h-4 w-4 mr-2" />
              Crear Empresa
            </Button>
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
}

interface AgencySelectorProps {
  onSelect: (agency: Agency) => void;
  onCreateNew: (agency: InsertAgency) => void;
  selectedAgency?: Agency | null;
  onClear?: () => void;
}

export function AgencySelector({ onSelect, onCreateNew, selectedAgency, onClear }: AgencySelectorProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [mode, setMode] = useState<"search" | "create">("search");
  const [debouncedQuery, setDebouncedQuery] = useState("");

  const [newAgency, setNewAgency] = useState({
    razonSocial: "",
    nombreFantasia: "",
    cuilCuit: "",
    commissionRate: "10",
    contactName: "",
    contactEmail: "",
    contactPhone: "",
  });

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedQuery(searchQuery), 300);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  const { data: searchResults = [], isLoading } = useQuery<Agency[]>({
    queryKey: ["/api/agencies/search", debouncedQuery],
    queryFn: async () => {
      if (!debouncedQuery || debouncedQuery.length < 2) return [];
      const res = await fetch(`/api/agencies/search?q=${encodeURIComponent(debouncedQuery)}`);
      return res.json();
    },
    enabled: debouncedQuery.length >= 2,
  });

  const handleCreateAgency = () => {
    if (!newAgency.razonSocial || !newAgency.cuilCuit) return;
    onCreateNew({
      razonSocial: newAgency.razonSocial,
      cuilCuit: newAgency.cuilCuit,
      nombreFantasia: newAgency.nombreFantasia || null,
      commissionRate: newAgency.commissionRate || "0",
      contactName: newAgency.contactName || null,
      contactEmail: newAgency.contactEmail || null,
      contactPhone: newAgency.contactPhone || null,
      isActive: "true",
    });
    setNewAgency({
      razonSocial: "",
      nombreFantasia: "",
      cuilCuit: "",
      commissionRate: "10",
      contactName: "",
      contactEmail: "",
      contactPhone: "",
    });
    setMode("search");
  };

  if (selectedAgency) {
    return (
      <Card className="bg-accent/30">
        <CardContent className="pt-4 pb-4">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 flex-wrap">
              <Plane className="h-4 w-4 text-muted-foreground" />
              <span className="font-medium">
                {selectedAgency.nombreFantasia || selectedAgency.razonSocial}
              </span>
              <Badge variant="outline" className="text-xs">
                CUIT {selectedAgency.cuilCuit}
              </Badge>
              <Badge variant="secondary" className="text-xs">
                {selectedAgency.commissionRate}% com.
              </Badge>
            </div>
            {onClear && (
              <Button size="icon" variant="ghost" onClick={onClear} data-testid="button-clear-agency">
                <X className="h-4 w-4" />
              </Button>
            )}
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <Plane className="h-4 w-4" />
          Agencia de Viajes (Opcional)
        </CardTitle>
      </CardHeader>
      <CardContent>
        <Tabs value={mode} onValueChange={(v) => setMode(v as "search" | "create")}>
          <TabsList className="grid w-full grid-cols-2 mb-4">
            <TabsTrigger value="search" data-testid="tab-search-agency">
              <Search className="h-4 w-4 mr-2" />
              Buscar Existente
            </TabsTrigger>
            <TabsTrigger value="create" data-testid="tab-create-agency">
              <Plus className="h-4 w-4 mr-2" />
              Crear Nueva
            </TabsTrigger>
          </TabsList>

          <TabsContent value="search" className="space-y-4">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Buscar por nombre, CUIT..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10"
                data-testid="input-search-agency"
              />
            </div>

            {isLoading && (
              <p className="text-sm text-muted-foreground text-center py-4">Buscando...</p>
            )}

            {searchResults.length > 0 && (
              <div className="space-y-2 max-h-60 overflow-y-auto">
                {searchResults.map((agency) => (
                  <div
                    key={agency.id}
                    className="p-3 rounded-md border hover-elevate active-elevate-2 cursor-pointer"
                    onClick={() => onSelect(agency)}
                    data-testid={`agency-result-${agency.id}`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div>
                        <p className="font-medium">
                          {agency.nombreFantasia || agency.razonSocial}
                        </p>
                        <p className="text-sm text-muted-foreground">
                          CUIT {agency.cuilCuit}
                        </p>
                      </div>
                      <Badge variant="secondary" className="text-xs">
                        {agency.commissionRate}%
                      </Badge>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {debouncedQuery.length >= 2 && searchResults.length === 0 && !isLoading && (
              <p className="text-sm text-muted-foreground text-center py-4">
                No se encontraron agencias.
                <Button variant="ghost" className="p-0 ml-1 h-auto text-primary underline" onClick={() => setMode("create")}>
                  Crear nueva
                </Button>
              </p>
            )}
          </TabsContent>

          <TabsContent value="create" className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="agencyRazonSocial">Razón Social *</Label>
                <Input
                  id="agencyRazonSocial"
                  value={newAgency.razonSocial}
                  onChange={(e) => setNewAgency({ ...newAgency, razonSocial: e.target.value })}
                  placeholder="Agencia S.R.L."
                  data-testid="input-agency-razonsocial"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="agencyNombreFantasia">Nombre Fantasía</Label>
                <Input
                  id="agencyNombreFantasia"
                  value={newAgency.nombreFantasia}
                  onChange={(e) => setNewAgency({ ...newAgency, nombreFantasia: e.target.value })}
                  placeholder="Viajes Express"
                  data-testid="input-agency-nombrefantasia"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="agencyCuit">CUIT *</Label>
                <Input
                  id="agencyCuit"
                  value={newAgency.cuilCuit}
                  onChange={(e) => setNewAgency({ ...newAgency, cuilCuit: e.target.value })}
                  placeholder="XX-XXXXXXXX-X"
                  data-testid="input-agency-cuit"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="agencyCommission">Comisión %</Label>
                <Input
                  id="agencyCommission"
                  type="number"
                  value={newAgency.commissionRate}
                  onChange={(e) => setNewAgency({ ...newAgency, commissionRate: e.target.value })}
                  placeholder="10"
                  data-testid="input-agency-commission"
                />
              </div>
            </div>

            <div className="grid grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label htmlFor="agencyContactName">Contacto</Label>
                <Input
                  id="agencyContactName"
                  value={newAgency.contactName}
                  onChange={(e) => setNewAgency({ ...newAgency, contactName: e.target.value })}
                  data-testid="input-agency-contact-name"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="agencyContactEmail">Email</Label>
                <Input
                  id="agencyContactEmail"
                  value={newAgency.contactEmail}
                  onChange={(e) => setNewAgency({ ...newAgency, contactEmail: e.target.value })}
                  data-testid="input-agency-contact-email"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="agencyContactPhone">Teléfono</Label>
                <Input
                  id="agencyContactPhone"
                  value={newAgency.contactPhone}
                  onChange={(e) => setNewAgency({ ...newAgency, contactPhone: e.target.value })}
                  data-testid="input-agency-contact-phone"
                />
              </div>
            </div>

            <Button
              onClick={handleCreateAgency}
              disabled={!newAgency.razonSocial || !newAgency.cuilCuit}
              className="w-full"
              data-testid="button-create-agency"
            >
              <Plus className="h-4 w-4 mr-2" />
              Crear Agencia
            </Button>
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
}
