/**
 * Política central de APP_ENV — punto único de verdad sobre qué ambiente
 * de aplicación está corriendo el proceso (development | test | pilot | production).
 *
 * APP_ENV es independiente de NODE_ENV: NODE_ENV solo controla el modo de
 * Node/Express (dev vs. producción — assets, minificación, etc.), mientras
 * que APP_ENV distingue el propósito del ambiente (piloto vs. producción
 * real de datos), incluso cuando ambos corren con NODE_ENV=production.
 *
 * Todo el código que necesite saber "¿esto es piloto?" o "¿esto es
 * producción real?" debe importar `getAppEnv()`/`isPilotEnv()` de este
 * módulo — no comparar `process.env.APP_ENV` (ni `process.env.NODE_ENV`
 * para esta pregunta) directamente en otros archivos.
 */

export const APP_ENVS = ["development", "test", "pilot", "production"] as const;

export type AppEnv = (typeof APP_ENVS)[number];

export class InvalidAppEnvError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvalidAppEnvError";
  }
}

export interface AppEnvInput {
  APP_ENV?: string;
  NODE_ENV?: string;
}

export interface AppEnvResolution {
  appEnv: AppEnv;
  /** true si el valor vino explícito de APP_ENV; false si se derivó de NODE_ENV por compatibilidad transitoria. */
  explicit: boolean;
  /** Mensaje a loguear con console.warn si no es null. Nunca implica una falla de arranque. */
  warning: string | null;
}

function isValidAppEnv(value: string): value is AppEnv {
  return (APP_ENVS as readonly string[]).includes(value);
}

/**
 * Resuelve APP_ENV a partir de las variables de entorno crudas. Función pura
 * y testeable: no lee `process.env` por sí misma (eso lo hace `initAppEnv`).
 *
 * Reglas:
 * 1. APP_ENV presente pero con un valor fuera de {development,test,pilot,production}
 *    → siempre falla (independientemente de NODE_ENV). No hay valor por
 *    defecto silencioso ante un error de tipeo.
 * 2. APP_ENV ausente:
 *    - NODE_ENV=production → falla (obligatoria en procesos publicados).
 *    - cualquier otro caso → modo de compatibilidad transitorio: se deriva
 *      "development" y se devuelve una advertencia. Este modo existe solo
 *      mientras se termina de adoptar APP_ENV en todos los ambientes y no
 *      debe usarse como comportamiento definitivo.
 * 3. APP_ENV=pilot exige NODE_ENV=production — el piloto debe correr con
 *    las mismas protecciones de producción (cookies seguras, endpoints de
 *    diagnóstico/setup deshabilitados, etc.), nunca con las de desarrollo.
 */
export function resolveAppEnv(env: AppEnvInput): AppEnvResolution {
  const rawAppEnv = env.APP_ENV?.trim();
  const nodeEnv = env.NODE_ENV?.trim();
  const isPublishedProcess = nodeEnv === "production";

  if (!rawAppEnv) {
    if (isPublishedProcess) {
      throw new InvalidAppEnvError(
        "APP_ENV es obligatoria cuando NODE_ENV=production. " +
          `Configurar APP_ENV con uno de estos valores: ${APP_ENVS.join(", ")}.`,
      );
    }
    return {
      appEnv: "development",
      explicit: false,
      warning:
        'APP_ENV no está configurada. Usando "development" derivado de NODE_ENV ' +
        "(modo de compatibilidad transitorio). Configurar APP_ENV explícitamente: " +
        "esta compatibilidad se retirará en una fase posterior.",
    };
  }

  const normalized = rawAppEnv.toLowerCase();
  if (!isValidAppEnv(normalized)) {
    throw new InvalidAppEnvError(
      `Valor de APP_ENV inválido: "${rawAppEnv}". Valores aceptados: ${APP_ENVS.join(", ")}.`,
    );
  }

  if (normalized === "pilot" && !isPublishedProcess) {
    throw new InvalidAppEnvError(
      "APP_ENV=pilot requiere NODE_ENV=production " +
        `(NODE_ENV recibido: ${nodeEnv ? `"${nodeEnv}"` : "no configurado"}). ` +
        "El ambiente piloto debe ejecutarse con las mismas protecciones de producción.",
    );
  }

  return { appEnv: normalized, explicit: true, warning: null };
}

let currentResolution: AppEnvResolution | null = null;

/**
 * Inicializa la política de ambiente para este proceso. Debe llamarse una
 * única vez, al arranque, antes de cualquier otro código que dependa de
 * `getAppEnv()`. Lanza `InvalidAppEnvError` si la configuración no es válida
 * — quien la invoque decide cómo loguear y salir del proceso.
 */
export function initAppEnv(env: AppEnvInput = process.env as AppEnvInput): AppEnvResolution {
  currentResolution = resolveAppEnv(env);
  return currentResolution;
}

/** Solo para tests: permite resetear el estado del módulo entre casos. */
export function resetAppEnvForTests(): void {
  currentResolution = null;
}

export function getAppEnv(): AppEnv {
  if (!currentResolution) {
    throw new Error(
      "getAppEnv() llamado antes de initAppEnv(). Llamar a initAppEnv() al arranque del proceso.",
    );
  }
  return currentResolution.appEnv;
}

export function isPilotEnv(): boolean {
  return getAppEnv() === "pilot";
}

export function isProductionDataEnv(): boolean {
  return getAppEnv() === "production";
}
