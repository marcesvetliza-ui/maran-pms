import { useState, useEffect, useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Search, User, Building2, Plus, X, Check } from "lucide-react";
import type { Guest, Company } from "@shared/schema";

interface GuestSelectorProps {
  onSelect: (guest: Guest) => void;
  onCreateNew: (guest: Omit<Guest, "id">) => void;
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
    address: "",
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
      ...newGuest,
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
      address: "",
    });
    setMode("search");
  };

  if (selectedGuest) {
    return (
      <Card className="bg-accent/30">
        <CardContent className="pt-4 pb-4">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <User className="h-4 w-4 text-muted-foreground" />
              <span className="font-medium">
                {selectedGuest.firstName} {selectedGuest.lastName}
              </span>
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
                <Button variant="link" className="p-0 ml-1" onClick={() => setMode("create")}>
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
  onCreateNew: (company: Omit<Company, "id">) => void;
  selectedCompany?: Company | null;
  onClear?: () => void;
}

export function CompanySelector({ onSelect, onCreateNew, selectedCompany, onClear }: CompanySelectorProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [mode, setMode] = useState<"search" | "create">("search");
  const [debouncedQuery, setDebouncedQuery] = useState("");

  const [newCompany, setNewCompany] = useState({
    businessName: "",
    tradeName: "",
    taxId: "",
    taxType: "CUIT",
    email: "",
    phone: "",
    address: "",
    city: "",
    country: "Argentina",
    contactName: "",
    contactEmail: "",
    contactPhone: "",
    creditLimit: "0",
    paymentTermDays: 30,
    notes: "",
    isActive: "true" as const,
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
    if (!newCompany.businessName || !newCompany.taxId) return;
    onCreateNew({
      ...newCompany,
      tradeName: newCompany.tradeName || null,
      email: newCompany.email || null,
      phone: newCompany.phone || null,
      address: newCompany.address || null,
      city: newCompany.city || null,
      contactName: newCompany.contactName || null,
      contactEmail: newCompany.contactEmail || null,
      contactPhone: newCompany.contactPhone || null,
      notes: newCompany.notes || null,
    });
    setNewCompany({
      businessName: "",
      tradeName: "",
      taxId: "",
      taxType: "CUIT",
      email: "",
      phone: "",
      address: "",
      city: "",
      country: "Argentina",
      contactName: "",
      contactEmail: "",
      contactPhone: "",
      creditLimit: "0",
      paymentTermDays: 30,
      notes: "",
      isActive: "true",
    });
    setMode("search");
  };

  if (selectedCompany) {
    return (
      <Card className="bg-accent/30">
        <CardContent className="pt-4 pb-4">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <Building2 className="h-4 w-4 text-muted-foreground" />
              <span className="font-medium">
                {selectedCompany.tradeName || selectedCompany.businessName}
              </span>
              <Badge variant="outline" className="text-xs">
                {selectedCompany.taxType} {selectedCompany.taxId}
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
                          {company.tradeName || company.businessName}
                        </p>
                        <p className="text-sm text-muted-foreground">
                          {company.taxType} {company.taxId}
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
                <Button variant="link" className="p-0 ml-1" onClick={() => setMode("create")}>
                  Crear nueva
                </Button>
              </p>
            )}
          </TabsContent>

          <TabsContent value="create" className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="businessName">Razon Social *</Label>
                <Input
                  id="businessName"
                  value={newCompany.businessName}
                  onChange={(e) => setNewCompany({ ...newCompany, businessName: e.target.value })}
                  placeholder="Empresa S.A."
                  data-testid="input-company-businessname"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="tradeName">Nombre Comercial</Label>
                <Input
                  id="tradeName"
                  value={newCompany.tradeName}
                  onChange={(e) => setNewCompany({ ...newCompany, tradeName: e.target.value })}
                  placeholder="Nombre Fantasia"
                  data-testid="input-company-tradename"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="taxType">Tipo ID Fiscal</Label>
                <Select
                  value={newCompany.taxType}
                  onValueChange={(v) => setNewCompany({ ...newCompany, taxType: v })}
                >
                  <SelectTrigger data-testid="select-tax-type">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="CUIT">CUIT</SelectItem>
                    <SelectItem value="CUIL">CUIL</SelectItem>
                    <SelectItem value="RUT">RUT</SelectItem>
                    <SelectItem value="RFC">RFC</SelectItem>
                    <SelectItem value="OTHER">Otro</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="taxId">Numero ID Fiscal *</Label>
                <Input
                  id="taxId"
                  value={newCompany.taxId}
                  onChange={(e) => setNewCompany({ ...newCompany, taxId: e.target.value })}
                  placeholder="30-12345678-9"
                  data-testid="input-company-taxid"
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
                  value={newCompany.phone}
                  onChange={(e) => setNewCompany({ ...newCompany, phone: e.target.value })}
                  placeholder="+54 11 4000-1234"
                  data-testid="input-company-phone"
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
              disabled={!newCompany.businessName || !newCompany.taxId}
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
