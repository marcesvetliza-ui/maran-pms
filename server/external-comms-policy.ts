/**
 * Política central de comunicaciones externas — punto único de verdad sobre
 * si una integración con un servicio externo real (email, ARCA/AFIP,
 * webhook MARA) puede ejecutarse en este proceso.
 *
 * Regla: solo APP_ENV=production preserva el comportamiento actual (llamadas
 * reales habilitadas, sujetas a su propia configuración existente). Los
 * ambientes pilot, development y test bloquean de forma fail-closed — el
 * bloqueo es la opción por defecto ante cualquier duda, nunca al revés.
 *
 * Ningún módulo debe comparar `getAppEnv()`/`process.env.APP_ENV` por su
 * cuenta para esta pregunta — deben usar `shouldBlockExternalComm()` o
 * `assertExternalCommAllowed()` de aquí, y siempre dentro del cuerpo de una
 * función (nunca al nivel superior de un módulo — ver la restricción
 * documentada en `server/app-env.ts`).
 *
 * El chequeo debe ejecutarse ANTES de construir el payload/mensaje/XML a
 * enviar y ANTES de cualquier llamada de red — nunca después. Cada
 * integración real (email-service.ts, backup.ts, wsaaClient.ts,
 * wsfevClient.ts, el webhook de MARA en routes.ts) llama a una de estas dos
 * funciones como primera instrucción de la ruta de código que efectivamente
 * toca la red o escribe datos a partir de un webhook entrante de un tercero.
 */

import { getAppEnv } from "./app-env";
import { logger } from "./logger";

export type ExternalIntegration = "email" | "email-backup" | "arca" | "mara-outbound" | "mara-inbound";

export interface ExternalCommsCheck {
  /** Integración afectada — una etiqueta fija, nunca un dato dinámico. */
  integration: ExternalIntegration;
  /** Acción concreta dentro de la integración — también una etiqueta fija (p. ej. "confirmation", "wsaa-login-homologacion"), nunca contenido de usuario/huésped. */
  action: string;
}

export class ExternalCommsBlockedError extends Error {
  readonly integration: ExternalIntegration;
  readonly action: string;

  constructor(check: ExternalCommsCheck) {
    super(
      `Comunicación externa bloqueada por ambiente (APP_ENV≠production): ${check.integration}/${check.action}.`,
    );
    this.name = "ExternalCommsBlockedError";
    this.integration = check.integration;
    this.action = check.action;
  }
}

/** true únicamente cuando el proceso corre con APP_ENV=production. */
export function isProductionCommsEnv(): boolean {
  return getAppEnv() === "production";
}

/**
 * Chequeo principal. Devuelve `true` si la operación debe bloquearse (y en
 * ese caso ya registró el bloqueo vía `logger.warn`, sin datos personales,
 * documentos, payloads, credenciales ni URLs — solo las etiquetas fijas de
 * `check` y el ambiente resuelto). Devuelve `false` sin loguear nada cuando
 * la operación está permitida.
 */
export function shouldBlockExternalComm(check: ExternalCommsCheck): boolean {
  if (isProductionCommsEnv()) return false;
  logger.warn("[external-comms-blocked]", {
    integration: check.integration,
    action: check.action,
    appEnv: getAppEnv(),
  });
  return true;
}

/**
 * Igual que `shouldBlockExternalComm`, pero lanza `ExternalCommsBlockedError`
 * en vez de devolver un booleano — para integraciones donde el control de
 * flujo natural ya es "lanzar y dejar que el llamador lo maneje" (ARCA:
 * mismo patrón que el error existente de "modo ficticio"; backup: mismo
 * patrón que el error existente de "SMTP no configurado").
 */
export function assertExternalCommAllowed(check: ExternalCommsCheck): void {
  if (shouldBlockExternalComm(check)) {
    throw new ExternalCommsBlockedError(check);
  }
}
