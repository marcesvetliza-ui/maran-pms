import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

const key = ["/api/admin/accommodation-permissions"];
type Row = { id: string; username: string; fullName: string; role: string; override: boolean | null; inherited: boolean; canEdit: boolean };
export function AccommodationUserPermissions() {
  const { toast } = useToast();
  const [filter, setFilter] = useState("");
  const users = useQuery<Row[]>({ queryKey: key, staleTime: 0, refetchOnMount: "always" });
  const save = useMutation({
    mutationFn: ({ id, allowed }: { id: string; allowed: boolean | null }) =>
      apiRequest("PUT", `/api/admin/accommodation-permissions/${id}`, { allowed }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: key });
      void queryClient.invalidateQueries({ queryKey: ["/api/reservation-edit-permission"] });
      toast({ title: "Permiso actualizado", description: "No se modificó el rol del usuario." });
    },
    onError: (error: Error) => toast({ title: "No se pudo guardar el permiso", description: error.message, variant: "destructive" }),
  });
  return <Card>
    <CardHeader><CardTitle>Editar tarifas y noches de alojamiento · por usuario</CardTitle>
      <p className="text-sm text-muted-foreground">Este permiso no cambia el rol ni da acceso a Administración. Conserva los bloqueos fiscales y de disponibilidad. La revocación se comprueba al guardar, incluso con una sesión abierta.</p>
    </CardHeader>
    <CardContent className="space-y-4">
      <Input aria-label="Buscar usuario para permiso de alojamiento" placeholder="Buscar usuario o nombre…" value={filter} onChange={e => setFilter(e.target.value)} className="max-w-sm" />
      {users.isPending ? <p>Cargando usuarios…</p> : users.isError ? <p role="alert" className="text-destructive">No se pudieron cargar los permisos. <button onClick={() => void users.refetch()}>Reintentar</button></p> :
        <div className="overflow-x-auto"><table className="w-full text-sm"><thead><tr className="border-b text-left"><th className="p-2">Usuario / rol</th><th className="p-2">Permiso individual</th><th className="p-2">Resultado</th></tr></thead>
          <tbody>{users.data?.filter(u => `${u.username} ${u.fullName}`.toLowerCase().includes(filter.toLowerCase())).map(u =>
            <tr key={u.id} className="border-b"><td className="p-2"><strong>{u.username}</strong><p className="text-muted-foreground">{u.fullName} · {u.role}</p></td>
              <td className="p-2"><select className="rounded border bg-background p-2" aria-label={`Editar alojamiento: ${u.username}`} value={u.override === null ? "inherit" : u.override ? "allow" : "deny"} disabled={save.isPending}
                onChange={e => save.mutate({ id: u.id, allowed: e.target.value === "inherit" ? null : e.target.value === "allow" })}>
                <option value="inherit">Heredar rol ({u.inherited ? "habilitado" : "deshabilitado"})</option><option value="allow">Habilitado</option><option value="deny">Deshabilitado</option>
              </select></td><td className="p-2">{u.canEdit ? "Puede editar" : "Sólo lectura de alojamiento"}</td></tr>)}</tbody></table></div>}
    </CardContent>
  </Card>;
}
