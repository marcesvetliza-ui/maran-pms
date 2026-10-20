import type { ReactNode } from "react";
import { CalendarDays, Pencil, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { formatDateAR } from "@/lib/utils";

/** Production counterpart of the approved WideFolio heading; no example data. */
export function ReservationFolioHeader({ reservation, status, onClose, onEditStay }: {
  reservation: any; status: ReactNode; onClose: () => void; onEditStay?: () => void;
}) {
  return <DialogHeader className="wf-detail-heading">
    <div className="wf-page-heading">
      <div className="wf-title-row">
        <span className="wf-mark" aria-hidden="true">M</span>
        <div>
          <p className="wf-eyebrow">RESERVA {reservation.reservationCode}<span>/</span>DETALLE DE ESTADÍA</p>
          <DialogTitle className="wf-guest-title">{reservation.guest?.firstName} {reservation.guest?.lastName}</DialogTitle>
        </div>
      </div>
      <Button variant="outline" className="wf-close-top" onClick={onClose} aria-label="Cerrar detalle de reserva"><X size={15}/><span>Cerrar</span></Button>
    </div>
    <section className="wf-reservation-head">
      <div className="wf-reservation-title">
        <div className="wf-room-icon"><CalendarDays size={20}/></div>
        <div>
          <div className="wf-code-line"><h2>Habitación {reservation.room?.roomNumber || "sin asignar"}</h2>{status}</div>
          <p>{reservation.room?.roomType?.name}{reservation.room?.roomType?.name && <span className="wf-dot-sep">·</span>}{reservation.reservationCode}</p>
          {(reservation.company || reservation.agency) && <p>{reservation.company?.razonSocial || reservation.company?.nombreFantasia || reservation.agency?.razonSocial || reservation.agency?.nombreFantasia}</p>}
        </div>
      </div>
      <div className="wf-stay-range">
        <div><span>INGRESO</span><strong>{formatDateAR(reservation.checkInDate)}</strong>{reservation.earlyCheckInTime && <small>{reservation.earlyCheckInTime} hs</small>}</div>
        <div className="wf-date-arrow" aria-hidden="true">→</div>
        <div><span>EGRESO</span><strong>{formatDateAR(reservation.checkOutDate)}</strong>{reservation.lateCheckOutTime && <small>{reservation.lateCheckOutTime} hs</small>}</div>
        <div className="wf-night-count"><strong>{reservation.nights}</strong><span>{Number(reservation.nights) === 1 ? "noche" : "noches"}</span></div>
      </div>
      {onEditStay && <Button variant="outline" className="wf-edit-stay" onClick={onEditStay}><Pencil size={14}/>Modificar estadía</Button>}
    </section>
    <DialogDescription className="sr-only">Detalle de la reserva {reservation.reservationCode}: datos del huésped, folio e historial.</DialogDescription>
  </DialogHeader>;
}
