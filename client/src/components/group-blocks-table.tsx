import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { apiRequest, parseApiError } from "@/lib/queryClient";
import { formatDateAR, fmtMoney } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";
import {
  hasGroupPassenger,
  compatibleGroupBlocks,
  summarizeGroupBlocks,
} from "@shared/groupBlockAssignments";
import type {
  GroupWithDetails,
  GroupRoomBlockWithDetails,
} from "@shared/schema";
import { ChevronRight, DoorOpen, Trash2 } from "lucide-react";

function passengerNames(groupId: string, reservation: GroupWithDetails["reservations"][number]) {
  const guest = reservation.guest;
  if (guest?.codigo === `GROUP-${groupId}`) return { short: "Sin pasajero", full: "Sin pasajero" };
  return {
    short: guest?.lastName?.trim() || guest?.firstName?.trim() || "Sin pasajero",
    full: [guest?.lastName, guest?.firstName].filter(Boolean).join(" ") || "Sin pasajero",
  };
}

export function GroupBlocksTable({
  group,
  onAssign,
  onDelete,
  onSaved,
}: {
  group: GroupWithDetails;
  onAssign: (b: GroupRoomBlockWithDetails) => void;
  onDelete: (id: string) => void;
  onSaved: () => void;
}) {
  const summary = summarizeGroupBlocks(group);
  const [choices, setChoices] = useState<Record<string, string>>({});
  const { toast } = useToast();
  const associate = useMutation({
    mutationFn: async ({
      reservationId,
      blockId,
    }: {
      reservationId: string;
      blockId: string;
    }) =>
      apiRequest(
        "POST",
        `/api/groups/${group.id}/reservations/${reservationId}/block`,
        { blockId },
      ),
    onSuccess: () => {
      onSaved();
      toast({
        title: "Bloque identificado",
        description: "Se conservaron habitación, fechas, tarifa y cuenta.",
      });
    },
    onError: (error) =>
      toast({
        title: "No se pudo identificar el bloque",
        description: parseApiError(error),
        variant: "destructive",
      }),
  });
  return (
    <div className="space-y-4">
      {summary.unresolved.length > 0 && (
        <Collapsible asChild>
          <section
            aria-label="Asignaciones por revisar"
            className="rounded-xl border border-amber-200 bg-amber-50/60 p-3 dark:border-amber-800 dark:bg-amber-950/20"
          >
            <CollapsibleTrigger asChild>
              <button
                type="button"
                className="group flex min-h-9 w-full items-center gap-2 rounded-md text-left text-sm font-medium text-amber-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring dark:text-amber-200"
              >
                <ChevronRight aria-hidden="true" className="h-4 w-4 shrink-0 transition-transform group-data-[state=open]:rotate-90" />
                {summary.unresolved.length} {summary.unresolved.length === 1 ? "asignación" : "asignaciones"} por ubicar en su bloque
              </button>
            </CollapsibleTrigger>
            <CollapsibleContent className="pt-2">
              <p className="mb-3 text-sm text-muted-foreground">
                Elegí el bloque correcto según la categoría y las fechas. Esto
                identifica la asignación y conserva la reserva y su cuenta.
              </p>
              {summary.unresolved.map(({ reservation }) => {
                const full = group.reservations.find(
                  (r) => r.id === reservation.id,
                )!;
                const candidates = compatibleGroupBlocks(group, reservation, false);
                return (
                  <div
                    key={reservation.id}
                    className="mt-2 flex flex-wrap items-center gap-2 rounded-lg border bg-background/80 p-3"
                    data-testid={`block-review-${reservation.id}`}
                  >
                    <div className="min-w-0 flex-1 text-sm">
                      <p className="truncate text-xs font-medium" title={passengerNames(group.id, full).full}>
                        Hab. {full.room?.roomNumber || "Sin asignar"} ·{" "}
                        {passengerNames(group.id, full).short}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {formatDateAR(reservation.checkInDate)} →{" "}
                        {formatDateAR(reservation.checkOutDate)}
                      </p>
                    </div>
                    <select
                      aria-label={`Bloque de la reserva ${reservation.id}`}
                      className="h-9 max-w-full rounded-md border bg-background px-2 text-sm"
                      value={choices[reservation.id] || ""}
                      onChange={(e) =>
                        setChoices((old) => ({
                          ...old,
                          [reservation.id]: e.target.value,
                        }))
                      }
                    >
                      <option value="">Seleccionar bloque…</option>
                      {candidates.map((b) => {
                        const item = summary.byBlock[b.id];
                        return (
                          <option key={b.id} value={b.id}>
                            Bloque{" "}
                            {group.blocks.findIndex((block) => block.id === b.id) +
                              1}{" "}
                            · {formatDateAR(item.checkInDate)} →{" "}
                            {formatDateAR(item.checkOutDate)} ·{" "}
                            {item.reservations.length}/{b.quantity}
                          </option>
                        );
                      })}
                    </select>
                    <Button
                      size="sm"
                      disabled={!choices[reservation.id] || associate.isPending}
                      onClick={() =>
                        associate.mutate({
                          reservationId: reservation.id,
                          blockId: choices[reservation.id],
                        })
                      }
                    >
                      Ubicar en bloque
                    </Button>
                    {!candidates.length && (
                      <p className="w-full text-xs text-amber-800">
                        No hay un bloque compatible. Revisá las fechas y la
                        categoría del contrato.
                      </p>
                    )}
                  </div>
                );
              })}
            </CollapsibleContent>
          </section>
        </Collapsible>
      )}
      <div className="overflow-x-auto rounded-xl border">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/40">
              <TableHead>Bloque / categoría</TableHead>
              <TableHead>Fechas</TableHead>
              <TableHead>Asignación</TableHead>
              <TableHead>Habitaciones y pasajeros</TableHead>
              <TableHead>Plan / tarifa</TableHead>
              <TableHead>Acciones</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {group.blocks.map((block, index) => {
              const item = summary.byBlock[block.id];
              const review =
                item.reviewReservationIds.length > 0 ||
                item.reservations.length > block.quantity;
              return (
                <TableRow
                  key={block.id}
                  data-testid={`row-block-${block.id}`}
                  className={
                    "[&>td]:align-top " +
                    (review || item.pendingRooms > 0
                      ? "bg-amber-50/30 dark:bg-amber-950/10"
                      : "")
                  }
                >
                  <TableCell>
                    <p className="font-medium">
                      Bloque {index + 1} · {block.roomType?.name} (
                      {block.roomType?.code})
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {block.quantity} habitación(es)
                    </p>
                  </TableCell>
                  <TableCell className="whitespace-nowrap text-sm">
                    {formatDateAR(item.checkInDate)}
                    <br />
                    <span className="text-muted-foreground">
                      → {formatDateAR(item.checkOutDate)}
                    </span>
                  </TableCell>
                  <TableCell data-testid={`block-progress-${block.id}`}>
                    <p className="font-semibold">
                      {item.reservations.length} / {block.quantity}
                    </p>
                    {review ? (
                      <Badge
                        variant="outline"
                        className="border-amber-400 text-amber-800 dark:text-amber-300"
                      >
                        Revisar asignación
                      </Badge>
                    ) : item.pendingRooms > 0 ? (
                      <Badge
                        variant="outline"
                        className="border-amber-400 text-amber-800 dark:text-amber-300"
                      >
                        Falta asignar {item.pendingRooms}
                      </Badge>
                    ) : (
                      <Badge
                        variant="outline"
                        className="border-emerald-300 text-emerald-700 dark:text-emerald-300"
                      >
                        Completo
                      </Badge>
                    )}
                    {item.pendingGuests > 0 && (
                      <p className="mt-1 text-xs text-muted-foreground">
                        {item.pendingGuests} sin pasajero
                      </p>
                    )}
                    {item.departed > 0 && (
                      <p className="mt-1 text-xs text-muted-foreground">
                        {item.departed} con salida realizada
                      </p>
                    )}
                  </TableCell>
                  <TableCell>
                    {item.reservations.length > 0 ? (
                      <Collapsible className="w-44 max-w-full">
                        <CollapsibleTrigger asChild>
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            className="group h-8 gap-1 px-0 text-xs font-normal text-primary hover:bg-transparent hover:underline"
                            aria-label={`Habitaciones y pasajeros del bloque ${index + 1}`}
                          >
                            <ChevronRight aria-hidden="true" className="h-3.5 w-3.5 shrink-0 transition-transform group-data-[state=open]:rotate-90" />
                            {item.reservations.length} {item.reservations.length === 1 ? "habitación" : "habitaciones"}
                          </Button>
                        </CollapsibleTrigger>
                        <CollapsibleContent className="space-y-0.5 pt-1">
                          {item.reservations.map((r) => {
                            const full = group.reservations.find(
                              (res) => res.id === r.id,
                            )!;
                            const name = passengerNames(group.id, full);
                            const fullLabel = `Hab. ${full.room?.roomNumber || "Sin asignar"} · ${name.full}${r.status === "checked_out" ? " · Salida" : ""}`;
                            return (
                              <a
                                className="block truncate text-xs leading-5 text-primary hover:underline"
                                key={r.id}
                                href={`/reservations?view=${r.id}`}
                                target="_blank"
                                rel="noreferrer"
                                title={fullLabel}
                                aria-label={fullLabel}
                              >
                                Hab. {full.room?.roomNumber || "Sin asignar"} ·{" "}
                                {name.short}
                                {r.status === "checked_out" ? " · Salida" : ""}
                              </a>
                            );
                          })}
                        </CollapsibleContent>
                      </Collapsible>
                    ) : (
                      <span className="text-xs text-muted-foreground">
                        {review
                          ? "Asignación por identificar"
                          : "Sin habitaciones asignadas"}
                      </span>
                    )}
                  </TableCell>
                  <TableCell>
                    <p className="text-sm">
                      {block.ratePlan?.name || "Sin plan"}
                    </p>
                    <p className="text-sm font-medium">
                      {block.agreedRate != null
                        ? `$${fmtMoney(block.agreedRate)}`
                        : "Sin tarifa"}
                    </p>
                  </TableCell>
                  <TableCell>
                    <div className="flex gap-1">
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={
                          review ||
                          (item.reservations.length >= block.quantity &&
                            !item.reservations.some(
                              (reservation) =>
                                reservation.status !== "checked_out" &&
                                !hasGroupPassenger(group.id, reservation),
                            ))
                        }
                        onClick={() => onAssign(block)}
                        data-testid={`button-assign-${block.id}`}
                      >
                        <DoorOpen className="mr-1 h-3 w-3" />
                        Asignar
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        onClick={() => onDelete(block.id)}
                        data-testid={`button-delete-block-${block.id}`}
                        aria-label={`Eliminar bloque ${index + 1}`}
                      >
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
