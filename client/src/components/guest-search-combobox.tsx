import { useState, useEffect, useRef } from "react";
import { Search, UserPlus, Loader2, Check, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { useMutation } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

type GuestResult = {
  id: string;
  firstName: string;
  lastName: string;
  email?: string | null;
  phone?: string | null;
  documentNumber?: string | null;
};

type GuestSearchComboboxProps = {
  label?: string;
  selectedGuestId?: string | null;
  selectedGuestName?: string | null;
  onGuestSelect: (guest: GuestResult) => void;
  onClear?: () => void;
  onCreateNew?: (prefillName?: string) => void;
  placeholder?: string;
  "data-testid"?: string;
};

export function GuestSearchCombobox({
  label = "Buscar cliente",
  selectedGuestId,
  selectedGuestName,
  onGuestSelect,
  onClear,
  onCreateNew,
  placeholder = "Buscar por nombre, teléfono o email...",
  "data-testid": testId = "guest-search-combobox",
}: GuestSearchComboboxProps) {
  const { toast } = useToast();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<GuestResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [showDropdown, setShowDropdown] = useState(false);
  const [showNewDialog, setShowNewDialog] = useState(false);
  const [newFirstName, setNewFirstName] = useState("");
  const [newLastName, setNewLastName] = useState("");
  const [newPhone, setNewPhone] = useState("");
  const [newEmail, setNewEmail] = useState("");
  const containerRef = useRef<HTMLDivElement>(null);
  const searchTimeout = useRef<ReturnType<typeof setTimeout>>();

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setShowDropdown(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  useEffect(() => {
    clearTimeout(searchTimeout.current);
    if (query.length < 2) {
      setResults([]);
      setShowDropdown(false);
      return;
    }
    setIsSearching(true);
    searchTimeout.current = setTimeout(async () => {
      try {
        const res = await fetch(`/api/guests/search?q=${encodeURIComponent(query)}`, { credentials: "include" });
        const data = await res.json();
        setResults(data || []);
        setShowDropdown(true);
      } catch {
        setResults([]);
      } finally {
        setIsSearching(false);
      }
    }, 300);
    return () => clearTimeout(searchTimeout.current);
  }, [query]);

  const createGuestMutation = useMutation({
    mutationFn: async (data: { firstName: string; lastName: string; phone: string; email: string }) => {
      const res = await apiRequest("POST", "/api/guests", {
        firstName: data.firstName,
        lastName: data.lastName,
        phone: data.phone || undefined,
        email: data.email || undefined,
        active: true,
      });
      if (res.status === 409) {
        const json = await res.json();
        return json.existing as GuestResult;
      }
      return res.json();
    },
    onSuccess: (guest: GuestResult) => {
      onGuestSelect(guest);
      setShowNewDialog(false);
      setNewFirstName("");
      setNewLastName("");
      setNewPhone("");
      setNewEmail("");
      setQuery("");
      toast({ title: "Cliente guardado", description: `${guest.firstName} ${guest.lastName || ""} registrado.` });
    },
    onError: () => toast({ title: "Error al crear cliente", variant: "destructive" }),
  });

  const handleSelect = (guest: GuestResult) => {
    onGuestSelect(guest);
    setQuery("");
    setShowDropdown(false);
  };

  const handleClear = () => {
    setQuery("");
    setResults([]);
    setShowDropdown(false);
    onClear?.();
  };

  const handleCreateNew = () => {
    setShowDropdown(false);
    if (onCreateNew) {
      onCreateNew(query.trim() || undefined);
      return;
    }
    // Fallback: simple internal dialog
    const parts = query.trim().split(" ");
    setNewFirstName(parts[0] || "");
    setNewLastName(parts.slice(1).join(" ") || "");
    setNewPhone("");
    setNewEmail("");
    setShowNewDialog(true);
  };

  return (
    <>
      <div ref={containerRef} className="relative" data-testid={testId}>
        {label && <Label className="text-sm font-medium mb-1.5 block">{label}</Label>}

        {selectedGuestId && selectedGuestName ? (
          <div className="flex items-center gap-2 px-3 py-2 rounded-md border bg-muted/40">
            <Check className="h-4 w-4 text-green-600 shrink-0" />
            <span className="text-sm flex-1 font-medium">{selectedGuestName}</span>
            <button
              type="button"
              onClick={handleClear}
              className="text-muted-foreground hover:text-foreground"
              data-testid={`${testId}-clear`}
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        ) : (
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onFocus={() => query.length >= 2 && results.length > 0 && setShowDropdown(true)}
              placeholder={placeholder}
              className="pl-8 pr-8"
              data-testid={`${testId}-input`}
            />
            {isSearching && (
              <Loader2 className="absolute right-2.5 top-1/2 -translate-y-1/2 h-4 w-4 animate-spin text-muted-foreground" />
            )}
          </div>
        )}

        {showDropdown && !selectedGuestId && (
          <div className="absolute z-50 left-0 right-0 mt-1 bg-background border rounded-md shadow-lg max-h-60 overflow-y-auto">
            {results.length === 0 && !isSearching ? (
              <div className="px-3 py-2 text-sm text-muted-foreground">Sin resultados para &quot;{query}&quot;</div>
            ) : (
              results.map((g) => (
                <button
                  key={g.id}
                  type="button"
                  className="w-full text-left px-3 py-2 hover:bg-muted text-sm flex flex-col gap-0.5 border-b last:border-0"
                  onClick={() => handleSelect(g)}
                  data-testid={`${testId}-result-${g.id}`}
                >
                  <span className="font-medium">{g.firstName} {g.lastName || ""}</span>
                  {(g.phone || g.email) && (
                    <span className="text-xs text-muted-foreground">{[g.phone, g.email].filter(Boolean).join(" · ")}</span>
                  )}
                </button>
              ))
            )}
            <button
              type="button"
              className="w-full text-left px-3 py-2 text-sm text-primary hover:bg-muted flex items-center gap-2 border-t font-medium"
              onClick={handleCreateNew}
              data-testid={`${testId}-create-new`}
            >
              <UserPlus className="h-4 w-4" />
              Crear nuevo cliente{query.length >= 2 ? ` "${query}"` : ""}
            </button>
          </div>
        )}

        {!selectedGuestId && query.length < 2 && (
          <button
            type="button"
            className="mt-1 text-xs text-primary hover:underline flex items-center gap-1"
            onClick={() => {
              if (onCreateNew) { onCreateNew(); return; }
              setNewFirstName(""); setNewLastName(""); setNewPhone(""); setNewEmail("");
              setShowNewDialog(true);
            }}
            data-testid={`${testId}-new-btn`}
          >
            <UserPlus className="h-3 w-3" />
            Registrar nuevo cliente
          </button>
        )}
      </div>

      <Dialog open={showNewDialog} onOpenChange={setShowNewDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Nuevo cliente</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-sm">Nombre *</Label>
                <Input
                  value={newFirstName}
                  onChange={(e) => setNewFirstName(e.target.value)}
                  placeholder="Nombre"
                  data-testid="new-guest-firstname"
                />
              </div>
              <div>
                <Label className="text-sm">Apellido</Label>
                <Input
                  value={newLastName}
                  onChange={(e) => setNewLastName(e.target.value)}
                  placeholder="Apellido"
                  data-testid="new-guest-lastname"
                />
              </div>
            </div>
            <div>
              <Label className="text-sm">Teléfono</Label>
              <Input
                value={newPhone}
                onChange={(e) => setNewPhone(e.target.value)}
                placeholder="+54 11 xxxx-xxxx"
                data-testid="new-guest-phone"
              />
            </div>
            <div>
              <Label className="text-sm">Email</Label>
              <Input
                value={newEmail}
                onChange={(e) => setNewEmail(e.target.value)}
                type="email"
                placeholder="email@ejemplo.com"
                data-testid="new-guest-email"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowNewDialog(false)}>Cancelar</Button>
            <Button
              disabled={!newFirstName.trim() || createGuestMutation.isPending}
              onClick={() => createGuestMutation.mutate({ firstName: newFirstName.trim(), lastName: newLastName.trim(), phone: newPhone.trim(), email: newEmail.trim() })}
              data-testid="new-guest-save"
            >
              {createGuestMutation.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
              Guardar cliente
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
