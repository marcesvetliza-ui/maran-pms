import { AlertCircle, RefreshCw, CheckCircle2, Wrench, TriangleAlert, ShieldCheck, Ban } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { featureIconMap, getBedConfigLabel, ROOM_STATUS_OPTIONS } from "@/lib/planning-utils";
import type { RoomWithType } from "@shared/schema";

interface RoomPopoverProps {
  room: RoomWithType;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onEditBedConfig: (data: { roomId: string; roomNumber: string; current: string }) => void;
  onUpdateStatus: (data: { roomId: string; status: string }) => void;
  isPendingStatusUpdate: boolean;
  maintenanceAlertRoomIds: Set<string>;
  maintenanceConflictRoomIds?: Set<string>;
}

export function RoomPopover({
  room,
  open,
  onOpenChange,
  onEditBedConfig,
  onUpdateStatus,
  isPendingStatusUpdate,
  maintenanceAlertRoomIds,
  maintenanceConflictRoomIds,
}: RoomPopoverProps) {
  return (
    <Popover open={open} onOpenChange={onOpenChange}>
      <PopoverTrigger asChild>
        <div
          className="flex items-center gap-1 cursor-pointer rounded px-1 py-0.5 hover:bg-muted/60 select-none"
          data-testid={`room-header-${room.id}`}
        >
          <span className="font-medium text-sm leading-none">{room.roomNumber}</span>
          {room.status === "dirty" && (
            <span title="Sucia"><AlertCircle className="h-3 w-3 text-orange-500 shrink-0" /></span>
          )}
          {room.status === "cleaning" && (
            <span title="En limpieza"><RefreshCw className="h-3 w-3 text-yellow-500 shrink-0" /></span>
          )}
          {room.status === "inspected" && (
            <span title="Inspeccionada"><CheckCircle2 className="h-3 w-3 text-blue-500 shrink-0" /></span>
          )}
          {room.status === "maintenance" && (
            <span title="Mantenimiento"><Wrench className="h-3 w-3 text-red-500 shrink-0" /></span>
          )}
          {room.status === "limpia_ocupada" && (
            <span title="Limpia ocupada"><ShieldCheck className="h-3 w-3 text-emerald-500 shrink-0" /></span>
          )}
          {room.status === "no_molestar" && (
            <span title="No molestar"><Ban className="h-3 w-3 text-purple-500 shrink-0" /></span>
          )}
          {room.status !== "maintenance" && maintenanceAlertRoomIds.has(room.id) && (
            <span title="Orden de mantenimiento pendiente"><Wrench className="h-3 w-3 text-orange-400 shrink-0" /></span>
          )}
          {maintenanceConflictRoomIds?.has(room.id) && (
            <span title="⚠️ Tiene reservas activas durante el bloqueo de mantenimiento">
              <TriangleAlert className="h-3 w-3 text-red-500 shrink-0 animate-pulse" />
            </span>
          )}
          {room.features && room.features.slice(0, 2).map((feature) => {
            const mapped = featureIconMap[feature];
            if (!mapped) return null;
            const IconComp = mapped.icon;
            return <span key={feature} title={mapped.label}><IconComp className="h-3 w-3 text-muted-foreground shrink-0" /></span>;
          })}
        </div>
      </PopoverTrigger>
      <PopoverContent side="right" align="start" className="w-60 p-0 shadow-lg" data-testid={`popover-room-${room.id}`}>
        <div className="px-3 py-2 border-b bg-muted/40">
          <p className="font-semibold text-sm">{room.roomNumber} — {room.roomType?.name ?? ""}</p>
          <p className="text-xs text-muted-foreground">Piso {room.floor}{room.maxOccupancy ? ` · máx. ${room.maxOccupancy} pers.` : ""}</p>
          <div className="flex items-center gap-1 mt-1">
            <span className="text-xs text-muted-foreground">
              {room.bedConfig ? getBedConfigLabel(room.bedConfig) : "Sin camaje asignado"}
            </span>
            <button
              className="text-[10px] text-primary underline decoration-dotted hover:no-underline ml-1"
              onClick={(e) => {
                e.stopPropagation();
                onOpenChange(false);
                onEditBedConfig({ roomId: room.id, roomNumber: room.roomNumber, current: room.bedConfig || "" });
              }}
              data-testid={`button-edit-bedconfig-${room.id}`}
            >
              Cambiar
            </button>
          </div>
          {room.notes && (
            <p className="text-xs text-muted-foreground mt-1 italic">{room.notes}</p>
          )}
        </div>
        <div className="px-3 py-2">
          <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide mb-1.5">Estado de habitación</p>
          <div className="flex flex-col gap-1">
            {ROOM_STATUS_OPTIONS.map((opt) => {
              const isActive = room.status === opt.value;
              return (
                <button
                  key={opt.value}
                  className={`flex items-center gap-2 text-xs px-2 py-1 rounded transition-colors text-left ${isActive ? "bg-primary/10 font-semibold" : "hover:bg-muted/60"}`}
                  onClick={() => {
                    if (!isActive) {
                      onUpdateStatus({ roomId: room.id, status: opt.value });
                    } else {
                      onOpenChange(false);
                    }
                  }}
                  disabled={isPendingStatusUpdate}
                  data-testid={`button-status-${opt.value}-${room.id}`}
                >
                  <span className={`w-2 h-2 rounded-full shrink-0 ${opt.dot}`} />
                  {opt.label}
                  {isActive && <span className="ml-auto text-primary">✓</span>}
                </button>
              );
            })}
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}
