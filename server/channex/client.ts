/**
 * Cliente HTTP mínimo para la API de Channex (channel manager).
 *
 * Verificado contra el entorno de staging real (ver validación manual):
 * auth por header `user-api-key`, respuestas JSON:API (`{ data: [...] }`
 * para listas), montos como strings decimales, ids relacionados dentro de
 * `relationships`, no en `attributes`.
 *
 * El endpoint de acknowledge de `booking_revisions` (`acknowledgeBookingRevision`
 * abajo) NO se pudo verificar contra la API real porque este entorno no tiene
 * salida de red hacia channex.io — está armado según la documentación pública
 * (POST .../ack) pero conviene confirmarlo la primera vez que se corra el
 * sync contra staging de verdad; si Channex devuelve 404/405 ahí, el sync no
 * se cae (ver server/channex/sync.ts), pero esa reserva va a quedar marcada
 * con error hasta ajustar el endpoint.
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

export async function fetchPendingBookingRevisions(connection: ChannexConnectionCredentials, propertyId: string): Promise<any[]> {
  const body = await channexRequest(
    connection,
    `/booking_revisions?filter[property_id]=${encodeURIComponent(propertyId)}&filter[acknowledge_status]=pending`,
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
