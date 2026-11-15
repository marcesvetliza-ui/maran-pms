import { useState } from "react";
import { UserPlus } from "lucide-react";
import { useMutation } from "@tanstack/react-query";
import { addShiftStaffSchema } from "@shared/housekeepingShift";
import { apiRequest, parseApiError, queryClient } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

type AddShiftStaffProps = {
  date: string;
  disabled?: boolean;
};

const inputClass =
  "mt-1 w-full rounded-md border border-input bg-background px-3 py-2.5 text-sm";

export function AddShiftStaff({ date, disabled = false }: AddShiftStaffProps) {
  const [open, setOpen] = useState(false);
  const [fullName, setFullName] = useState("");
  const [kind, setKind] = useState<"permanent" | "extra">("permanent");
  const [serviceDate,setServiceDate]=useState(date);
  const [message, setMessage] = useState("");
  const parsed = addShiftStaffSchema.safeParse({ fullName, kind, date:serviceDate });
  const createStaff = useMutation({
    mutationFn: async () => {
      const body = { fullName: fullName.trim(), kind, date:serviceDate };
      return apiRequest("POST", "/api/housekeeping/staff", body);
    },
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["/api/housekeeping/staff"] }),
        queryClient.invalidateQueries({
          queryKey: ["/api/housekeeping/availability"],
        }),
      ]);
      setFullName("");
      setKind("permanent");
      setMessage("");
      setOpen(false);
    },
    onError: (error) => setMessage(parseApiError(error)),
  });

  return (
    <>
      <Button
        className="shrink-0 gap-2"
        disabled={disabled}
        onClick={() => {
          setServiceDate(date);
          setMessage("");
          setOpen(true);
        }}
      >
        <UserPlus className="h-4 w-4" />
        Agregar personal
      </Button>
      <Dialog
        open={open}
        onOpenChange={(nextOpen) => {
          if (!createStaff.isPending) setOpen(nextOpen);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Agregar personal al turno</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              No necesita una cuenta de acceso. El nombre queda disponible para
              asignar habitaciones.
            </p>
            <fieldset className="space-y-2" disabled={createStaff.isPending}>
              <legend className="mb-2 text-sm font-medium">Tipo de personal</legend>
              <div className="grid grid-cols-2 gap-2">
                {([
                  ["permanent", "Personal fijo"],
                  ["extra", "Personal extra"],
                ] as const).map(([value, label]) => (
                  <button
                    key={value}
                    type="button"
                    aria-pressed={kind === value}
                    onClick={() => setKind(value)}
                    className={`min-h-11 rounded-md border px-3 text-sm font-medium transition-colors ${
                      kind === value
                        ? "border-primary bg-primary/10 text-primary"
                        : "border-border bg-card text-foreground hover:bg-muted"
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </fieldset>
            <label className="block text-sm font-medium" htmlFor="shift-staff-name">
              Nombre y apellido
              <input
                id="shift-staff-name"
                autoFocus
                className={inputClass}
                maxLength={120}
                value={fullName}
                onChange={(event) => setFullName(event.target.value)}
                disabled={createStaff.isPending}
                placeholder="Nombre del personal"
              />
            </label>
            {kind === "extra" && (
              <p className="rounded-md bg-muted px-3 py-2 text-xs text-muted-foreground">
                El personal extra corresponde al {serviceDate} y no estará disponible
                en una nueva jornada.
              </p>
            )}
            {message && (
              <p role="alert" className="text-sm text-destructive">
                {message}
              </p>
            )}
            <div className="flex justify-end gap-2 border-t pt-4">
              <Button
                variant="outline"
                disabled={createStaff.isPending}
                onClick={() => setOpen(false)}
              >
                Cancelar
              </Button>
              <Button
                disabled={createStaff.isPending || !parsed.success}
                onClick={() => createStaff.mutate()}
              >
                {createStaff.isPending ? "Guardando…" : "Agregar al turno"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
