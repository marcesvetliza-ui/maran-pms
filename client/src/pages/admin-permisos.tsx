import { Fragment, useMemo, useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { ShieldCheck } from "lucide-react";

type PermissionsCatalogResponse = {
  roles: string[];
  catalog: Array<{ resourceKey: string; label: string; section: string }>;
  grants: Array<{ role: string; resourceKey: string }>;
};

const ROLE_LABELS: Record<string, string> = {
  admin: "Admin",
  manager: "Gerente",
  ama_de_llaves: "Ama de Llaves",
  reception: "Recepción",
  housekeeping: "Housekeeping",
  maintenance: "Mantenimiento",
  restaurant: "Restaurant",
  spa: "Spa",
  events: "Eventos",
  resp_deposito: "Resp. Depósito",
  resp_administracion: "Resp. Administración",
  responsable_area: "Responsable de Área",
  jefe_recepcion: "Jefe de Recepción",
  comercial: "Comercial",
};

const QUERY_KEY = ["/api/admin/role-permissions"];

export default function AdminPermisosPage() {
  const { toast } = useToast();
  const [filter, setFilter] = useState("");
  const [pendingKey, setPendingKey] = useState<string | null>(null);

  const { data, isLoading } = useQuery<PermissionsCatalogResponse>({ queryKey: QUERY_KEY });

  const grantSet = useMemo(() => {
    const s = new Set<string>();
    for (const g of data?.grants ?? []) s.add(`${g.role}:${g.resourceKey}`);
    return s;
  }, [data]);

  const sections = useMemo(() => {
    const bySection = new Map<string, Array<{ resourceKey: string; label: string }>>();
    for (const item of data?.catalog ?? []) {
      if (!bySection.has(item.section)) bySection.set(item.section, []);
      bySection.get(item.section)!.push(item);
    }
    return [...bySection.entries()];
  }, [data]);

  const filteredSections = useMemo(() => {
    const q = filter.trim().toLowerCase();
    if (!q) return sections;
    return sections
      .map(([section, items]) => [
        section,
        items.filter((i) => i.label.toLowerCase().includes(q) || section.toLowerCase().includes(q)),
      ] as [string, typeof items])
      .filter(([, items]) => items.length > 0);
  }, [sections, filter]);

  const toggleMutation = useMutation({
    mutationFn: ({ role, resourceKey, grant }: { role: string; resourceKey: string; grant: boolean }) =>
      apiRequest("POST", `/api/admin/role-permissions/${grant ? "grant" : "revoke"}`, { role, resourceKey }),
    onMutate: ({ role, resourceKey }) => setPendingKey(`${role}:${resourceKey}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: QUERY_KEY }),
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
    onSettled: () => setPendingKey(null),
  });

  const roles = data?.roles ?? [];

  return (
    <div className="p-6 max-w-full mx-auto space-y-6">
      <div className="flex items-center gap-3">
        <ShieldCheck className="h-7 w-7 text-primary" />
        <div>
          <h1 className="text-2xl font-bold">Permisos por Rol</h1>
          <p className="text-sm text-muted-foreground">
            Qué puede ver cada rol en el menú del sistema. Los cambios se aplican al instante.
          </p>
        </div>
      </div>

      <Input
        placeholder="Buscar sección o ítem…"
        value={filter}
        onChange={(e) => setFilter(e.target.value)}
        className="max-w-sm"
        data-testid="input-filtro-permisos"
      />

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Matriz de permisos</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <p className="text-sm text-muted-foreground">Cargando…</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm border-collapse">
                <thead>
                  <tr className="border-b text-muted-foreground text-xs uppercase">
                    <th className="text-left py-2 px-3 font-medium sticky left-0 bg-background z-10">Ítem</th>
                    {roles.map((role) => (
                      <th key={role} className="text-center py-2 px-2 font-medium whitespace-nowrap">
                        {ROLE_LABELS[role] ?? role}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filteredSections.map(([section, items]) => (
                    <Fragment key={section}>
                      <tr className="bg-muted/40">
                        <td colSpan={roles.length + 1} className="py-1.5 px-3 font-semibold text-xs sticky left-0 bg-muted/40">
                          {section}
                        </td>
                      </tr>
                      {items.map((item) => (
                        <tr key={item.resourceKey} className="border-b hover:bg-muted/20 transition-colors" data-testid={`row-permiso-${item.resourceKey}`}>
                          <td className="py-2 px-3 sticky left-0 bg-background">{item.label}</td>
                          {roles.map((role) => {
                            const key = `${role}:${item.resourceKey}`;
                            const checked = grantSet.has(key);
                            const isPending = pendingKey === key && toggleMutation.isPending;
                            return (
                              <td key={role} className="text-center py-2 px-2">
                                <Checkbox
                                  checked={checked}
                                  disabled={isPending}
                                  onCheckedChange={(value) =>
                                    toggleMutation.mutate({ role, resourceKey: item.resourceKey, grant: !!value })
                                  }
                                  data-testid={`checkbox-permiso-${role}-${item.resourceKey}`}
                                />
                              </td>
                            );
                          })}
                        </tr>
                      ))}
                    </Fragment>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
