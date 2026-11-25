import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  apiRequest,
  parseApiError,
  parseApiErrorPayload,
} from "@/lib/queryClient";
import { fmtMoney, formatDateAR } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";
import {
  compatibleGroupBlocks,
  summarizeGroupBlocks,
  hasGroupPassenger,
} from "@shared/groupBlockAssignments";
import type { GroupWithDetails } from "@shared/schema";
type Candidate = {
  id: string;
  code: string;
  guestName: string;
  roomNumber: string;
  roomTypeId: string;
  checkInDate: string;
  checkOutDate: string;
  status: string;
};
export function GroupExistingReservationDialog({
  group,
  open,
  onOpenChange,
  onSaved,
}: {
  group: GroupWithDetails;
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onSaved: () => void;
}) {
  const [q, setQ] = useState(""),
    [selected, setSelected] = useState<Candidate | null>(null),
    [choice, setChoice] = useState(""),
    [reason, setReason] = useState("");
  const [preview, setPreview] = useState<any>(null),
    [error, setError] = useState<string | null>(null),
    [pending, setPending] = useState<any>(null);
  const recoveryStarted = useRef(false),
    { toast } = useToast(),
    key = `group-existing-reservation:${group.id}`;
  const { data: candidates = [], isFetching } = useQuery<Candidate[]>({
    queryKey: ["group-reservation-candidates", group.id, q],
    enabled: open && q.trim().length >= 2,
    queryFn: async ({ signal }) => {
      const r = await fetch(
        `/api/groups/${group.id}/reservation-candidates?q=${encodeURIComponent(q.trim())}`,
        { credentials: "include", signal },
      );
      if (!r.ok) throw Error("No se pudieron buscar las reservas.");
      return r.json();
    },
  });
  const save = useMutation({
    mutationFn: async (body: any) =>
      (
        await apiRequest(
          "POST",
          `/api/groups/${group.id}/import-reservation`,
          body,
        )
      ).json(),
    onSuccess: () => {
      sessionStorage.removeItem(key);
      setPending(null);
      onSaved();
      onOpenChange(false);
      toast({
        title: "Reserva incorporada",
        description:
          "Se conservaron la reserva, sus condiciones y su cuenta original.",
      });
    },
    onError: (e) => {
      const result = parseApiErrorPayload(e) as any;
      if (result?.notApplied === true) {
        sessionStorage.removeItem(key);
        setPending(null);
        setPreview(null);
      }
      setError(parseApiError(e));
    },
  });
  useEffect(() => {
    if (!open) {
      recoveryStarted.current = false;
      return;
    }
    if (recoveryStarted.current) return;
    recoveryStarted.current = true;
    const raw = sessionStorage.getItem(key);
    if (raw) {
      try {
        const body = JSON.parse(raw);
        setPending(body);
        save.mutate(body);
      } catch {
        setError(
          "No se pudo leer la incorporación anterior. Se conservaron sus datos.",
        );
      }
    } else {
      setQ("");
      setSelected(null);
      setChoice("");
      setReason("");
      setPreview(null);
      setError(null);
      setPending(null);
    }
  }, [open, key]);
  const summary = summarizeGroupBlocks(group),
    blocks = selected ? compatibleGroupBlocks(group, selected, false) : [];
  const chosen =
    choice === "additional"
      ? { addBlock: true }
      : choice
        ? {
            blockId: choice.split("|")[0],
            ...(choice.split("|")[1]
              ? { replaceReservationId: choice.split("|")[1] }
              : {}),
          }
        : {};
  const review = useMutation({
    mutationFn: async () => {
      setError(null);
      return (
        await apiRequest(
          "POST",
          `/api/groups/${group.id}/import-reservation/preview`,
          { reservationId: selected?.id, ...chosen },
        )
      ).json();
    },
    onSuccess: setPreview,
    onError: (e) => setError(parseApiError(e)),
  });
  const confirm = () => {
    const body = {
      reservationId: selected!.id,
      ...chosen,
      operationId: crypto.randomUUID(),
      fingerprint: preview.fingerprint,
      reason: reason.trim(),
    };
    try {
      sessionStorage.setItem(key, JSON.stringify(body));
      setPending(body);
      save.mutate(body);
    } catch {
      setError(
        "No se pudo guardar el seguimiento. No se incorporó la reserva.",
      );
    }
  };
  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (!save.isPending) onOpenChange(v);
      }}
    >
      <DialogContent className="max-h-[90dvh] max-w-3xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Incorporar reserva existente</DialogTitle>
          <DialogDescription>
            Buscá una reserva creada desde Planning o Reservas. Se conservan
            fechas, tarifa, pagos y comprobantes.
          </DialogDescription>
        </DialogHeader>
        {pending ? (
          <p role="status">Verificando la incorporación original…</p>
        ) : (
          <div className="space-y-4">
            <Label htmlFor="group-import-search">
              Huésped, habitación o código
            </Label>
            <Input
              id="group-import-search"
              disabled={review.isPending}
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Escribí al menos 2 caracteres"
            />
            {isFetching && (
              <p className="text-sm text-muted-foreground">Buscando…</p>
            )}
            {candidates.length > 0 && (
              <div className="max-h-48 space-y-1 overflow-y-auto rounded-lg border p-2">
                {candidates.map((r) => (
                  <button
                    key={r.id}
                    type="button"
                    disabled={review.isPending}
                    onClick={() => {
                      setSelected(r);
                      setChoice("");
                      setPreview(null);
                      setError(null);
                    }}
                    className={`w-full rounded-md p-2 text-left text-sm ${selected?.id === r.id ? "bg-primary/10 ring-1 ring-primary" : "hover:bg-muted"}`}
                    data-testid={`import-candidate-${r.id}`}
                  >
                    <strong>
                      Hab. {r.roomNumber} · {r.guestName}
                    </strong>
                    <p className="text-muted-foreground">
                      {r.code} · {formatDateAR(r.checkInDate)} →{" "}
                      {formatDateAR(r.checkOutDate)}
                    </p>
                  </button>
                ))}
              </div>
            )}
            {selected && (
              <div className="space-y-3 rounded-xl border bg-muted/20 p-4">
                <p className="font-medium">
                  Hab. {selected.roomNumber} · {selected.guestName}
                </p>
                <Label htmlFor="group-import-slot">Cupo del grupo</Label>
                <select
                  id="group-import-slot"
                  disabled={review.isPending}
                  value={choice}
                  onChange={(e) => {
                    setChoice(e.target.value);
                    setPreview(null);
                  }}
                  className="h-10 w-full rounded-md border bg-background px-2 text-sm"
                >
                  <option value="">Seleccionar cupo…</option>
                  {blocks.flatMap((block) => {
                    const item = summary.byBlock[block.id];
                    if (item.reviewReservationIds.length) return [];
                    const label = `Bloque ${group.blocks.findIndex((b) => b.id === block.id) + 1} · ${formatDateAR(item.checkInDate)} → ${formatDateAR(item.checkOutDate)}`;
                    return [
                      ...(item.reservations.length < block.quantity
                        ? [
                            <option key={block.id} value={block.id}>
                              {label} · Cupo vacío
                            </option>,
                          ]
                        : []),
                      ...item.reservations
                        .filter(
                          (r) =>
                            !hasGroupPassenger(group.id, r) &&
                            ["tentative", "pending", "confirmed"].includes(
                              r.status,
                            ),
                        )
                        .map((r) => (
                          <option key={r.id} value={`${block.id}|${r.id}`}>
                            {label} · Reemplazar cupo sin pasajero (hab.{" "}
                            {r.room?.roomNumber || "sin asignar"})
                          </option>
                        )),
                    ];
                  })}
                  <option value="additional">
                    Ampliar el grupo con esta habitación
                  </option>
                </select>
                <Button
                  variant="outline"
                  disabled={!choice || review.isPending}
                  onClick={() => review.mutate()}
                >
                  Revisar incorporación
                </Button>
              </div>
            )}
            {preview && (
              <div
                className="space-y-2 rounded-xl border border-primary/20 bg-primary/5 p-4"
                data-testid="group-import-preview"
              >
                <p className="font-medium">Antes de incorporar</p>
                <p className="text-sm">
                  Alojamiento original: $
                  {fmtMoney(preview.reservation.totalRoomAmount || 0)} · Pagos
                  registrados: ${fmtMoney(preview.historicalPayments)} ·
                  Comprobantes: {preview.invoiceCount}
                </p>
                {preview.replacement && (
                  <p className="text-sm">
                    Se reemplazará el cupo sin pasajero de la hab.{" "}
                    {preview.replacement.roomNumber}. La reserva que incorporás
                    conserva su habitación.
                  </p>
                )}
                {choice === "additional" && (
                  <p className="text-sm">
                    Se agregará un bloque de una habitación con las fechas de
                    esta reserva.
                  </p>
                )}
                {preview.blockers.map((text: string) => (
                  <p
                    role="alert"
                    key={text}
                    className="text-sm text-destructive"
                  >
                    {text}
                  </p>
                ))}
                {preview.canImport && (
                  <>
                    <Label htmlFor="group-import-reason">Motivo</Label>
                    <Input
                      id="group-import-reason"
                      value={reason}
                      onChange={(e) => setReason(e.target.value)}
                      placeholder="Por qué se incorpora al grupo"
                      maxLength={500}
                    />
                  </>
                )}
              </div>
            )}
          </div>
        )}
        {error && (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}
        <DialogFooter>
          <Button
            variant="outline"
            disabled={save.isPending}
            onClick={() => onOpenChange(false)}
          >
            Cerrar
          </Button>
          <Button
            onClick={confirm}
            disabled={
              !!pending ||
              !preview?.canImport ||
              reason.trim().length < 5 ||
              review.isPending ||
              save.isPending
            }
          >
            Incorporar reserva
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
