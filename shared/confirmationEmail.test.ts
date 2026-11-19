import { describe, it, expect } from "vitest";
import {
  confirmationBodyTemplate,
  withoutAssignedRoom,
  DEFAULT_CONFIRMATION_BODY,
} from "./confirmationEmail";
describe("Guest confirmation describes the booking without promising an assigned room", () => {
  it("removes the physical-room phrases from the existing saved default and adds the PDF notice", () => {
    const old =
      "Hola {nombre_huesped},\n\nTu reserva ha sido confirmada. Te esperamos el {fecha_checkin} en la habitación {numero_habitacion}.\n\nCheck-in: {fecha_checkin}\nHabitaciones: {numero_habitacion}\n\nTexto personalizado del hotel.\n{link_webcheckin}";
    const body = confirmationBodyTemplate(old);
    expect(body).not.toContain("{numero_habitacion}");
    expect(body).not.toContain("Habitaciones:");
    expect(body).toContain("Te esperamos el {fecha_checkin}.");
    expect(body).toContain("Texto personalizado del hotel.");
    expect(body).toContain("{link_webcheckin}");
    expect(body).toContain("{codigo_reserva}");
    expect(body).toContain("Adjuntamos la confirmación de tu reserva en PDF");
  });
  it("uses the reserved category if custom prose still contains the old room variable", () => {
    expect(
      withoutAssignedRoom(
        "Reserva {codigo_reserva} · Hab. {numero_habitacion}",
      ),
    ).toBe("Reserva {codigo_reserva} · Hab. {tipo_habitacion}");
  });
  it("does not repeatedly append notices or erase custom terms", () => {
    const original =
      "Hola {nombre_huesped}\nCondiciones especiales: desayuno incluido.\nTu confirmación va adjunta.\nReserva {codigo_reserva}";
    expect(confirmationBodyTemplate(original)).toBe(original);
    expect(
      confirmationBodyTemplate(
        confirmationBodyTemplate(DEFAULT_CONFIRMATION_BODY),
      ),
    ).toBe(DEFAULT_CONFIRMATION_BODY);
  });
  it("new configurations keep booking dates, code and attachment without the assigned-room variable", () => {
    expect(DEFAULT_CONFIRMATION_BODY).toContain("{fecha_checkin}");
    expect(DEFAULT_CONFIRMATION_BODY).toContain("{fecha_checkout}");
    expect(DEFAULT_CONFIRMATION_BODY).toContain("{codigo_reserva}");
    expect(DEFAULT_CONFIRMATION_BODY).not.toContain("{numero_habitacion}");
  });
});
