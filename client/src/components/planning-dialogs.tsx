import { Move, ArrowLeftRight, Calendar, User, Palette, X, AlertTriangle } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { BED_CONFIG_OPTIONS } from "@/lib/planning-utils";

// ─── MoveConfirmDialog ────────────────────────────────────────────────────────

export interface MoveConfirmData {
  reservationId: string;
  guestName: string;
  fromRoomNumber: string;
  fromRoomType: string;
  toRoomId: string;
  toRoomNumber: string;
  toRoomType: string;
  newCheckIn: string;
  newCheckOut: string;
  dateChanged: boolean;
}

interface MoveConfirmDialogProps {
  moveConfirm: MoveConfirmData | null;
  isPending: boolean;
  onConfirm: (data: MoveConfirmData) => void;
  onCancel: () => void;
}

export function PlanningMoveConfirmDialog({
  moveConfirm,
  isPending,
  onConfirm,
  onCancel,
}: MoveConfirmDialogProps) {
  return (
    <Dialog open={!!moveConfirm} onOpenChange={(open) => !open && onCancel()}>
      <DialogContent className="max-w-md" data-testid="dialog-move-reservation">
        <DialogHeader>
          <DialogTitle>
            <Move className="h-5 w-5 inline mr-2" />
            Mover Reserva
          </DialogTitle>
          <DialogDescription>
            ¿Confirmar el cambio de habitación para esta reserva?
          </DialogDescription>
        </DialogHeader>
        {moveConfirm && (
          <div className="space-y-3 py-2">
            <div className="flex items-center gap-2">
              <User className="h-4 w-4 text-muted-foreground" />
              <span className="font-medium">{moveConfirm.guestName}</span>
            </div>
            <div className="flex items-center gap-3">
              <Badge variant="outline" className="text-sm" data-testid="badge-from-room">
                Hab. {moveConfirm.fromRoomNumber}
              </Badge>
              <ArrowLeftRight className="h-4 w-4 text-muted-foreground" />
              <Badge className="text-sm bg-primary" data-testid="badge-to-room">
                Hab. {moveConfirm.toRoomNumber}
              </Badge>
            </div>
            {moveConfirm.dateChanged && (
              <div className="flex items-center gap-3 text-sm">
                <Calendar className="h-4 w-4 text-muted-foreground" />
                <span className="text-muted-foreground">Nuevas fechas:</span>
                <Badge variant="outline" className="text-orange-600 border-orange-300">
                  {moveConfirm.newCheckIn} → {moveConfirm.newCheckOut}
                </Badge>
              </div>
            )}
            {moveConfirm.fromRoomType !== moveConfirm.toRoomType ? (
              <div className="flex items-start gap-2 rounded-md border border-amber-300 bg-amber-50 dark:border-amber-700 dark:bg-amber-950/40 px-3 py-2 text-sm" data-testid="banner-category-change">
                <AlertTriangle className="h-4 w-4 text-amber-600 dark:text-amber-400 mt-0.5 shrink-0" />
                <div>
                  <p className="font-medium text-amber-800 dark:text-amber-300">Cambio de categoría</p>
                  <p className="text-amber-700 dark:text-amber-400">
                    <span className="line-through">{moveConfirm.fromRoomType}</span>
                    {" → "}
                    <strong>{moveConfirm.toRoomType}</strong>
                  </p>
                </div>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">Tipo: {moveConfirm.toRoomType}</p>
            )}
          </div>
        )}
        <DialogFooter className="flex flex-col sm:flex-row gap-2">
          <Button variant="outline" onClick={onCancel} data-testid="button-cancel-move">
            Cancelar
          </Button>
          <Button
            onClick={() => { if (moveConfirm) onConfirm(moveConfirm); }}
            disabled={isPending}
            data-testid="button-confirm-move"
          >
            {isPending ? "Moviendo..." : "Confirmar Movimiento"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── BedConfigDialog ──────────────────────────────────────────────────────────

interface BedConfigDialogProps {
  editingBedConfig: { roomId: string; roomNumber: string; current: string } | null;
  isPending: boolean;
  onChange: (value: string) => void;
  onConfirm: () => void;
  onCancel: () => void;
}

export function PlanningBedConfigDialog({
  editingBedConfig,
  isPending,
  onChange,
  onConfirm,
  onCancel,
}: BedConfigDialogProps) {
  return (
    <Dialog open={!!editingBedConfig} onOpenChange={(open) => !open && onCancel()}>
      <DialogContent className="max-w-xs">
        <DialogHeader>
          <DialogTitle>Cambiar Camaje — Hab. {editingBedConfig?.roomNumber}</DialogTitle>
        </DialogHeader>
        <div className="py-4">
          <Label className="text-sm mb-2 block">Configuración de camas</Label>
          <Select
            value={editingBedConfig?.current || ""}
            onValueChange={onChange}
          >
            <SelectTrigger data-testid="select-bedconfig">
              <SelectValue placeholder="Seleccionar" />
            </SelectTrigger>
            <SelectContent>
              {BED_CONFIG_OPTIONS.map(opt => (
                <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onCancel}>Cancelar</Button>
          <Button
            onClick={onConfirm}
            disabled={isPending}
            data-testid="button-confirm-bedconfig"
          >
            {isPending ? "Guardando..." : "Guardar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── ColorContextMenu ─────────────────────────────────────────────────────────

const COLOR_PALETTE = [
  "#ef4444", "#f97316", "#eab308", "#22c55e",
  "#06b6d4", "#3b82f6", "#8b5cf6", "#ec4899",
  "#6b7280", "#78716c", "#0ea5e9", "#14b8a6",
];

interface ColorContextMenuProps {
  colorContextMenu: { x: number; y: number; reservationId: string } | null;
  isPending: boolean;
  onSelectColor: (reservationId: string, color: string | null) => void;
  onClose: () => void;
}

export function PlanningColorContextMenu({
  colorContextMenu,
  isPending,
  onSelectColor,
  onClose,
}: ColorContextMenuProps) {
  if (!colorContextMenu) return null;

  return (
    <>
      <div
        className="fixed inset-0 z-[9998]"
        onClick={onClose}
        onContextMenu={(e) => { e.preventDefault(); onClose(); }}
      />
      <div
        className="fixed z-[9999] bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 rounded-lg shadow-xl p-3 min-w-[200px]"
        style={{
          left: Math.min(colorContextMenu.x, window.innerWidth - 220),
          top: Math.min(colorContextMenu.y, window.innerHeight - 160),
        }}
      >
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs font-semibold text-zinc-600 dark:text-zinc-400 flex items-center gap-1.5">
            <Palette className="h-3.5 w-3.5" />
            Color de etiqueta
          </span>
          <button onClick={onClose} className="text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300">
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
        <div className="grid grid-cols-6 gap-1.5 mb-2">
          {COLOR_PALETTE.map((color) => (
            <button
              key={color}
              onClick={() => onSelectColor(colorContextMenu.reservationId, color)}
              disabled={isPending}
              className="w-7 h-7 rounded-full border-2 border-transparent hover:border-zinc-400 hover:scale-110 transition-all"
              style={{ backgroundColor: color }}
              title={color}
            />
          ))}
        </div>
        <button
          onClick={() => onSelectColor(colorContextMenu.reservationId, null)}
          disabled={isPending}
          className="w-full text-xs text-zinc-500 dark:text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 flex items-center justify-center gap-1.5 py-1 rounded hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
        >
          <X className="h-3 w-3" />
          Sin color
        </button>
      </div>
    </>
  );
}
