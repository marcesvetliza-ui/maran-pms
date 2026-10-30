import type { Pool } from "pg";
import { addDays, AriConfigurationError, buildAriValues, inventoryPreview, STAGING_URL } from "./ari";
import { decryptChannexApiKey } from "./credentials";

export type ReadinessCheck = {
  id: string;
  area: "configuration" | "activation" | "certification";
  ok: boolean;
  message: string;
};

/** Local, consistent preflight of the real PMS configuration. No provider
 * requests, ACKs, test bookings or queue writes are made by this check. */
export async function getChannexReadiness(pool: Pool, connectionId: string) {
  const c = await pool.connect();
  try {
    await c.query("BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY");
    await c.query("SET LOCAL statement_timeout='15s'");
    const connection = (await c.query(`SELECT c.id,c.environment,c.base_url,c.is_active,c.channex_property_id,c.api_key_encrypted,
      a.connection_id AS scope_id,a.floor,a.currency,a.enabled AS ari_enabled,
      i.enabled AS inbound_enabled,i.token_hash IS NOT NULL AS has_webhook_token
      FROM channex_connections c LEFT JOIN channex_ari_settings a ON a.connection_id=c.id
      LEFT JOIN channex_inbound_settings i ON i.connection_id=c.id WHERE c.id=$1`, [connectionId])).rows[0];
    if (!connection) { await c.query("COMMIT"); return null; }
    const checks: ReadinessCheck[] = [];
    const add = (id: string, area: ReadinessCheck["area"], ok: boolean, message: string) => checks.push({ id, area, ok, message });
    add("staging", "configuration", connection.environment === "demo" && connection.base_url.replace(/\/$/, "") === STAGING_URL,
      "Usar una conexión de prueba a Channex staging.");
    add("active", "configuration", connection.is_active, "La conexión debe estar activa.");
    add("property", "configuration", Boolean(connection.channex_property_id?.trim()), "Identificar la propiedad de prueba.");
    let credentialUsable = false;
    try { credentialUsable = Boolean(connection.api_key_encrypted && decryptChannexApiKey(connection.api_key_encrypted).trim()); } catch { /* Return no credential or crypto details. */ }
    add("credential", "configuration", credentialUsable, "Guardar una credencial que este servidor pueda descifrar. Su validez remota aún debe comprobarse.");
    add("scope", "configuration", Boolean(connection.scope_id), "Guardar el piso y la moneda del piloto.");
    const rooms = connection.scope_id ? await inventoryPreview(c, connectionId, connection.floor) : [];
    const physicalRooms = new Set(rooms.map(room => room.id));
    add("inventory", "configuration", physicalRooms.size > 0 && rooms.every(room => room.channexRoomTypeId),
      "El piso necesita habitaciones físicas activas y sus categorías mapeadas.");
    // Exercise the same 500-day transformation the actual dispatcher uses;
    // checking just base rates would miss expired plans and invalid overrides.
    const today = (await c.query("SELECT (now() AT TIME ZONE 'America/Argentina/Buenos_Aires')::date::text AS today")).rows[0].today;
    let ariValid = false;
    let ariMessage = "Completar alcance, mapeos y tarifas vigentes para los 500 días.";
    if (connection.scope_id) {
      try {
        for (const kind of ["availability", "restrictions"] as const) {
          const values = await buildAriValues(c, connection, [{ id: "preflight", kind, date_from: today, date_to: addDays(today, 499), room_type_id: null, rate_plan_id: null, attempts: 0 }], today);
          if (!values.length) throw new AriConfigurationError("Faltan valores para publicar durante el horizonte de prueba");
        }
        ariValid = true;
      } catch (error) {
        if (!(error instanceof AriConfigurationError)) throw error;
        ariMessage = error.message;
      }
    }
    add("ari_values", "configuration", ariValid, ariMessage);
    add("reservation_currency", "configuration", connection.currency === "ARS",
      "La recepción automática admite ARS. Una reserva en USD requiere soporte de moneda en el folio; no se interpreta como pesos.");
    add("ari_capture", "activation", Boolean(connection.ari_enabled), "Habilitar la captura del alcance de prueba.");
    add("ari_server", "activation", process.env.CHANNEX_ARI_STAGING_ENABLED === "true", "Habilitar los envíos en el servidor aislado de pruebas.");
    add("inbound_connection", "activation", Boolean(connection.inbound_enabled), "Habilitar la recepción en esta conexión.");
    add("inbound_server", "activation", process.env.CHANNEX_INBOUND_STAGING_ENABLED === "true", "Habilitar la recepción en el servidor aislado de pruebas.");
    add("webhook_token", "activation", Boolean(connection.has_webhook_token), "Generar el acceso del webhook y configurarlo en Channex. Su instalación remota aún debe verificarse.");
    add("certification_currency", "certification", connection.currency === "USD", "El documento de certificación solicita una propiedad en USD. El receptor actual solo aplica reservas ARS: este punto sigue pendiente.");
    add("external_validation", "certification", false, "Contrastar contrato y buenas prácticas, ejecutar los escenarios desde el PMS en staging y conservar sus resultados y task IDs reales.");
    await c.query("COMMIT");
    const configurationReady = checks.filter(check => check.area === "configuration").every(check => check.ok);
    return {
      configurationReady,
      activationReady: configurationReady && checks.filter(check => check.area === "activation").every(check => check.ok),
      certificationReady: false,
      checkedAt: new Date().toISOString(),
      floor: connection.floor ?? null, currency: connection.currency ?? null, roomCount: physicalRooms.size,
      remoteVerified: false, checks,
    };
  } catch (error) { await c.query("ROLLBACK"); throw error; }
  finally { c.release(); }
}
