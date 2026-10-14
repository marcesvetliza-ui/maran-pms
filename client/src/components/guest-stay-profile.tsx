import { useEffect, useState, type ReactNode } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiRequest, parseApiError } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import type { Guest } from "@shared/schema";
import { emptyStayProfile, getGuestStayProfile, guestStayProfileSchema, type GuestStayProfile, type StaySelection, type StayDetailsView } from "@shared/guestStayProfile";

type Kind = keyof GuestStayProfile;
const labels: Record<Kind, string> = { vehicles: "Vehículos", family: "Grupo familiar", pets: "Mascotas" };
const fields: Record<Kind, Array<[string, string, string?]>> = {
  vehicles: [["plate", "Patente"], ["brand", "Marca"], ["model", "Modelo"], ["color", "Color"]],
  family: [["firstName", "Nombre"], ["lastName", "Apellido"], ["relationship", "Parentesco"], ["documentType", "Tipo de documento"], ["documentNumber", "Documento"], ["dateOfBirth", "Fecha de nacimiento", "date"], ["nationality", "Nacionalidad"]],
  pets: [["name", "Nombre"], ["species", "Especie"], ["notes", "Observaciones"]],
};
function newRow(kind: Kind): any {
  return { id: crypto.randomUUID(), ...Object.fromEntries(fields[kind].map(([key]) => [key, key === "documentType" ? "DNI" : ""])) };
}
function description(kind: Kind, row: any) {
  return kind === "family" ? `${row.firstName} ${row.lastName}${row.relationship ? ` · ${row.relationship}` : ""}${row.dateOfBirth ? ` · Nacimiento: ${row.dateOfBirth.split("-").reverse().join("/")}` : ""}` : kind === "vehicles" ? `${row.plate} · ${row.brand} ${row.model}${row.color ? ` · ${row.color}` : ""}` : `${row.name} · ${row.species}${row.notes ? ` · ${row.notes}` : ""}`;
}
export function StaySection({ title, summary, children }: { title: string; summary: string; children: ReactNode }) {
  return <details className="rounded-lg border bg-background">
    <summary className="cursor-pointer px-4 py-3 text-sm font-medium select-none"><span>{title}</span><span className="ml-3 font-normal text-muted-foreground">{summary}</span></summary>
    <div className="border-t p-3 space-y-3">{children}</div>
  </details>;
}
function RowFields({ kind, row, onChange }: { kind: Kind; row: any; onChange: (row: any) => void }) {
  return <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
    {fields[kind].map(([key, label, type]) => <label key={key} className="text-sm space-y-1 block">{label}<Input aria-label={label} type={type || "text"} maxLength={key === "notes" ? 500 : 150} max={type === "date" ? new Date().toISOString().slice(0,10) : undefined} value={row[key] || ""} onChange={event => onChange({ ...row, [key]: key === "plate" ? event.target.value.toUpperCase() : event.target.value })} /></label>)}
  </div>;
}
export function GuestStayProfileEditor({ value, onChange }: { value: GuestStayProfile; onChange: (profile: GuestStayProfile) => void }) {
  return <div className="space-y-3">{(["vehicles", "family", "pets"] as const).map(kind => <StaySection key={kind} title={labels[kind]} summary={`${value[kind].length} registrados`}>
    {value[kind].map((row: any) => <div key={row.id} className="border rounded-md p-3 space-y-2">
      <RowFields kind={kind} row={row} onChange={updated => onChange({ ...value, [kind]: value[kind].map(item => item.id === row.id ? updated : item) })} />
      <Button type="button" variant="ghost" size="sm" onClick={() => onChange({ ...value, [kind]: value[kind].filter(item => item.id !== row.id) })}>Quitar {kind === "family" ? "familiar" : kind === "pets" ? "mascota" : "vehículo"}</Button>
    </div>)}
    <Button type="button" variant="outline" size="sm" onClick={() => onChange({ ...value, [kind]: [...value[kind], newRow(kind)] })}>Agregar {kind === "family" ? "familiar" : kind === "pets" ? "mascota" : "vehículo"}</Button>
  </StaySection>)}</div>;
}

export type StayDraft = { selection: GuestStayProfile; remember: GuestStayProfile };
export function SelectedFamilyCompanions({ value, onChange }: { value: StayDraft; onChange: (value: StayDraft) => void }) {
  if (!value.selection.family.length) return null;
  return <ul className="space-y-2">{value.selection.family.map(member => <li key={member.id} className="flex items-center justify-between gap-2 rounded border p-3 text-sm">
    <span>{member.firstName} {member.lastName}<span className="ml-2 text-muted-foreground">Grupo familiar</span></span>
    <Button type="button" variant="ghost" size="sm" onClick={() => onChange({ selection: { ...value.selection, family: value.selection.family.filter(row => row.id !== member.id) }, remember: { ...value.remember, family: value.remember.family.filter(row => row.id !== member.id) } })}>Quitar de esta reserva</Button>
  </li>)}</ul>;
}
export function useStayDraft(guestId?: string | null) {
  const [draft, setDraft] = useState<{ owner: string; value: StayDraft } | null>(null);
  if (draft && draft.owner !== guestId) setDraft(null);
  const value = draft && draft.owner === guestId ? draft.value : { selection: emptyStayProfile(), remember: emptyStayProfile() };
  return { value, onChange: (value: StayDraft) => setDraft({ owner: guestId || "", value }), reset: () => setDraft(null), request: { guestId: guestId || "", version: 0, ...value } };
}

export function StaySelectionEditor({ guestId, value, onChange }: { guestId: string; value: StayDraft; onChange: (value: StayDraft) => void }) {
  const { data: guest, isError, isLoading, refetch } = useQuery<Guest>({ queryKey: ["/api/guests", guestId], queryFn: async () => {
    const response = await fetch(`/api/guests/${guestId}`, { credentials: "include" });
    if (!response.ok) throw new Error("No se pudieron cargar los datos del huésped.");
    return response.json();
  }, enabled: !!guestId });
  const profile = getGuestStayProfile(guest);
  const [editing, setEditing] = useState<{ kind: Kind; row: any } | null>(null);
  const [remember, setRemember] = useState(false);
  const [entryError, setEntryError] = useState("");
  useEffect(() => { setEditing(null); setRemember(false); setEntryError(""); }, [guestId]);
  if (!guestId) return null;
  if (isLoading) return <p className="text-sm text-muted-foreground">Cargando datos habituales…</p>;
  if (isError) return <div role="alert" className="text-sm">No se pudieron cargar los datos habituales. <Button type="button" variant="outline" size="sm" onClick={() => refetch()}>Reintentar</Button></div>;
  if (guest?.tipoPersona === "juridica") return null;
  return <div className="space-y-3">
    <p className="text-xs text-muted-foreground">Marcá lo previsto para esta reserva. Tener datos guardados no confirma su presencia; verificá al ingreso.</p>
    {(["family", "vehicles", "pets"] as const).map(kind => {
      const selected = value.selection[kind];
      const available = [...selected, ...profile[kind].filter(row => !selected.some(item => item.id === row.id))];
      return <StaySection key={kind} title={labels[kind]} summary={`${selected.length} seleccionados · ${profile[kind].length} habituales`}>
        {kind === "family" && <p className="text-xs text-muted-foreground">Los seleccionados se incluyen en Acompañantes. Al guardar, la cantidad de huéspedes tendrá en cuenta al titular y a todos los acompañantes, sin modificar la tarifa.</p>}
        {!available.length && <p className="text-sm text-muted-foreground">Sin datos registrados</p>}
        {available.map(row => <label key={row.id} className={`flex items-start gap-3 border rounded p-3 text-sm ${selected.some(item => item.id === row.id) ? "bg-primary/5" : "text-muted-foreground"}`}>
          <input type="checkbox" className="mt-1" checked={selected.some(item => item.id === row.id)} onChange={event => onChange({ ...value, selection: { ...value.selection, [kind]: event.target.checked ? [...selected, row] : selected.filter(item => item.id !== row.id) }, remember: { ...value.remember, [kind]: event.target.checked ? value.remember[kind] : value.remember[kind].filter(item => item.id !== row.id) } })} />
          <span>{description(kind, row)}</span>
        </label>)}
        {editing?.kind === kind ? <div className="space-y-3 border p-3 rounded">
          <RowFields kind={kind} row={editing.row} onChange={row => { setEditing({ kind, row }); setEntryError(""); }} />
          {entryError && <p role="alert" className="text-sm text-destructive">{entryError}</p>}
          <label className="flex gap-2 text-sm"><input type="checkbox" checked={remember} onChange={event => setRemember(event.target.checked)} />Guardar también en la ficha del huésped para próximas visitas</label>
          <div className="flex gap-2"><Button type="button" size="sm" onClick={() => {
            if (!guestStayProfileSchema.safeParse({ ...emptyStayProfile(), [kind]: [editing.row] }).success) { setEntryError("Completá los datos obligatorios: patente, nombre y apellido del familiar, o nombre y especie de la mascota. Revisá la fecha de nacimiento."); return; }
            onChange({ selection: { ...value.selection, [kind]: [...selected, editing.row] }, remember: { ...value.remember, [kind]: remember ? [...value.remember[kind], editing.row] : value.remember[kind] } }); setEditing(null); setRemember(false);
          }}>Incluir en esta reserva</Button><Button type="button" size="sm" variant="ghost" onClick={() => setEditing(null)}>Cancelar</Button></div>
        </div> : <Button type="button" size="sm" variant="outline" onClick={() => { setEditing({ kind, row: newRow(kind) }); setRemember(false); }}>Agregar {kind === "family" ? "familiar" : kind === "pets" ? "mascota" : "vehículo"} ocasional</Button>}
      </StaySection>;
    })}
  </div>;
}

export function useReservationStayDetailsQuery(reservationId: string, guestId: string) {
  return useQuery<StayDetailsView>({ queryKey: ["/api/reservations", reservationId, "stay-details", guestId], queryFn: async () => (await apiRequest("GET", `/api/reservations/${reservationId}/stay-details`)).json() });
}
export function ReservationGuestCount({ reservationId, guestId, fallback }: { reservationId: string; guestId: string; fallback: number }) {
  const query = useReservationStayDetailsQuery(reservationId, guestId);
  return <>{query.data?.numberOfGuests ?? fallback} persona(s)</>;
}
export function ReservationStayDetails({ reservationId, guestId }: { reservationId: string; guestId: string }) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const query = useReservationStayDetailsQuery(reservationId, guestId);
  const [draft, setDraft] = useState<StayDraft | null>(null);
  const [draftVersion, setDraftVersion] = useState<number | null>(null);
  useEffect(() => { setDraft(null); setDraftVersion(null); }, [reservationId, guestId]);
  const mutation = useMutation({ mutationFn: async () => (await apiRequest("PUT", `/api/reservations/${reservationId}/stay-details`, { guestId, version: draftVersion ?? query.data!.version, ...(draft || { selection: { family: query.data!.family, vehicles: query.data!.vehicles, pets: query.data!.pets }, remember: emptyStayProfile() }) })).json(), onSuccess: async (saved: StayDetailsView) => {
    queryClient.setQueryData(["/api/reservations", reservationId, "stay-details", guestId], saved);
    setDraft(null);
    setDraftVersion(null);
    await queryClient.invalidateQueries({ queryKey: ["/api/reservations", reservationId, "companions"] });
    await queryClient.invalidateQueries({ queryKey: ["/api/guests", guestId] });
    await queryClient.invalidateQueries({ queryKey: ["/api/guests"] });
    await queryClient.invalidateQueries({ queryKey: ["/api/reservations"] });
    await queryClient.invalidateQueries({ predicate: query => Array.isArray(query.queryKey) && query.queryKey[0] === "/api/planning" });
    toast({ title: "Datos de la estadía guardados" });
  }, onError: error => toast({ title: "No se pudieron guardar los datos", description: parseApiError(error), variant: "destructive" }) });
  if (query.isLoading) return <p className="text-sm">Cargando datos de la estadía…</p>;
  if (query.isError) return <div role="alert">No se pudieron cargar los datos de la estadía. <Button type="button" variant="outline" onClick={() => query.refetch()}>Reintentar</Button></div>;
  if (!query.data) return null;
  const value = draft || { selection: { family: query.data.family, vehicles: query.data.vehicles, pets: query.data.pets }, remember: emptyStayProfile() };
  return <div className="space-y-3">
    {query.data.numberOfGuests < query.data.companionCount + 1 && <div className="rounded-md border border-amber-300 p-3 text-sm space-y-2">
      <p>Hay {query.data.companionCount + 1} personas identificadas, pero la reserva indica {query.data.numberOfGuests}.</p>
      {!draft && <Button type="button" variant="outline" disabled={mutation.isPending} onClick={() => mutation.mutate()}>Actualizar cantidad a {query.data.companionCount + 1} huéspedes</Button>}
    </div>}
    <fieldset disabled={mutation.isPending} className="space-y-3"><StaySelectionEditor key={guestId} guestId={guestId} value={value} onChange={value => { if (!draft) setDraftVersion(query.data!.version); setDraft(value); }} /></fieldset>
    {draft && <div className="flex gap-2 flex-wrap"><Button type="button" disabled={mutation.isPending} onClick={() => mutation.mutate()}>Guardar datos de la estadía</Button><Button type="button" variant="outline" disabled={mutation.isPending} onClick={() => { setDraft(null); setDraftVersion(null); }}>Descartar cambios</Button></div>}
    <Button type="button" size="sm" variant="ghost" disabled={mutation.isPending} onClick={async () => { await query.refetch(); setDraft(null); setDraftVersion(null); }}>Actualizar datos guardados</Button>
  </div>;
}
