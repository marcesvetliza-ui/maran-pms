/**
 * Cliente HTTP mínimo para la API de Channex (channel manager).
 *
 * Verificado contra el entorno de staging real (ver validación manual):
 * auth por header `user-api-key`, respuestas JSON:API (`{ data: [...] }`
 * para listas), montos como strings decimales, ids relacionados dentro de
 * `relationships`, no en `attributes`.
 *
 * `POST /booking_revisions/:id/ack` (acknowledgeBookingRevision) y
 * `GET /booking_revisions/feed` (fetchPendingBookingRevisions) están
 * confirmados contra la documentación oficial, pero ninguno de los dos se
 * ejecutó todavía contra la API real (este entorno no tiene salida de red a
 * channex.io; la revisión que sí tiene salida tampoco llegó a ejecutar un
 * ack real). Si el ack falla, el sync no se cae (ver server/channex/sync.ts)
 * — la reserva queda guardada igual, marcada con error, hasta confirmarlo
 * con una corrida real.
 */

export type ChannexConnectionCredentials = {
  apiKey: string;
  baseUrl: string;
};

export class ChannexApiError extends Error {
  status: number;
  body: unknown;

  constructor(message: string, status: number, body: unknown) {
    super(message);
    this.name = "ChannexApiError";
    this.status = status;
    this.body = body;
  }
}

const REQUEST_TIMEOUT_MS = 15_000;

async function channexRequest(
  connection: ChannexConnectionCredentials,
  path: string,
  init: { method?: string } = {},
): Promise<any> {
  const url = `${connection.baseUrl.replace(/\/$/, "")}${path}`;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const response = await fetch(url, {
      method: init.method ?? "GET",
      headers: {
        "user-api-key": connection.apiKey,
        "Content-Type": "application/json",
      },
      signal: controller.signal,
    });
    const text = await response.text();
    const body = text ? JSON.parse(text) : null;
    if (!response.ok) {
      throw new ChannexApiError(`Channex respondió ${response.status} en ${path}`, response.status, body);
    }
    return body;
  } catch (err) {
    if (err instanceof ChannexApiError) throw err;
    if ((err as any)?.name === "AbortError") {
      throw new ChannexApiError(`Tiempo de espera agotado llamando a Channex (${path})`, 0, null);
    }
    throw new ChannexApiError(`No se pudo conectar con Channex (${path}): ${(err as Error).message}`, 0, null);
  } finally {
    clearTimeout(timeout);
  }
}

export async function fetchChannexProperties(connection: ChannexConnectionCredentials): Promise<any[]> {
  const body = await channexRequest(connection, "/properties");
  return body?.data ?? [];
}

export async function fetchChannexRoomTypes(connection: ChannexConnectionCredentials, propertyId: string): Promise<any[]> {
  const body = await channexRequest(connection, `/room_types?filter[property_id]=${encodeURIComponent(propertyId)}`);
  return body?.data ?? [];
}

export async function fetchChannexRatePlans(connection: ChannexConnectionCredentials, propertyId: string): Promise<any[]> {
  const body = await channexRequest(connection, `/rate_plans?filter[property_id]=${encodeURIComponent(propertyId)}`);
  return body?.data ?? [];
}

/**
 * `/booking_revisions/feed` (no `/booking_revisions?filter[acknowledge_status]=pending`)
 * es el endpoint que la documentación de Channex recomienda para integraciones
 * de PMS — devuelve únicamente revisiones sin ack, ordenables por `inserted_at`,
 * y queda vacío cuando ya se confirmó todo.
 */
export async function fetchPendingBookingRevisions(connection: ChannexConnectionCredentials, propertyId: string): Promise<any[]> {
  const body = await channexRequest(
    connection,
    `/booking_revisions/feed?filter[property_id]=${encodeURIComponent(propertyId)}&order[inserted_at]=asc`,
  );
  return body?.data ?? [];
}

export async function fetchChannexBooking(connection: ChannexConnectionCredentials, bookingId: string): Promise<any | null> {
  const body = await channexRequest(connection, `/bookings/${encodeURIComponent(bookingId)}`);
  return body?.data ?? null;
}

/** Ver advertencia de verificación pendiente en el comentario del archivo. */
export async function acknowledgeBookingRevision(
  connection: ChannexConnectionCredentials,
  revisionId: string,
): Promise<void> {
  await channexRequest(connection, `/booking_revisions/${encodeURIComponent(revisionId)}/ack`, { method: "POST" });
}
