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
 *
 * IMPORTANTE — dónde NO llamar a `getAppEnv()`/`isPilotEnv()`/`isProductionDataEnv()`:
 * ninguno de los tres debe invocarse en el nivel superior de un módulo (es
 * decir, durante la evaluación de imports ESM — código que corre al importar
 * el archivo, fuera del cuerpo de una función). El orden en que Node evalúa
 * los imports no está garantizado respecto de cuándo `server/index.ts` llama
 * a `initAppEnv()` en el arranque, así que una llamada a nivel de módulo
 * puede ejecutarse ANTES de `initAppEnv()` y lanzar
 * "getAppEnv() llamado antes de initAppEnv()" de forma intermitente, según
 * el orden de imports de turno — un bug muy difícil de reproducir. Estas
 * funciones deben llamarse siempre dentro del cuerpo de una función (un
 * handler de ruta, el inicio de una función async, etc.), en el momento en
 * que efectivamente se necesita el valor, nunca como inicializador de una
 * constante de módulo.
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
 * 3. APP_ENV=pilot o APP_ENV=production exigen NODE_ENV=production — ambos
 *    son "modos productivos" (el piloto debe correr con las mismas
 *    protecciones de producción: cookies seguras, endpoints de
 *    diagnóstico/setup deshabilitados, etc.) y no deben ejecutarse nunca
 *    con las protecciones relajadas del modo desarrollo de Node/Express.
 * 4. APP_ENV=development o APP_ENV=test, a la inversa, no pueden declararse
 *    en un proceso publicado (NODE_ENV=production) — sería una
 *    configuración contradictoria (un proceso que ya corre con las
 *    protecciones de producción pero se autodeclara "desarrollo" o "test").
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

  const receivedNodeEnvLabel = nodeEnv ? `"${nodeEnv}"` : "no configurado";
  const isProductiveAppEnv = normalized === "pilot" || normalized === "production";

  if (isProductiveAppEnv && !isPublishedProcess) {
    throw new InvalidAppEnvError(
      `APP_ENV=${normalized} requiere NODE_ENV=production ` +
        `(NODE_ENV recibido: ${receivedNodeEnvLabel}). ` +
        `El ambiente ${normalized === "pilot" ? "piloto" : "de producción"} debe ejecutarse ` +
        "con las protecciones de producción (cookies seguras, endpoints de diagnóstico/setup deshabilitados).",
    );
  }

  if (!isProductiveAppEnv && isPublishedProcess) {
    throw new InvalidAppEnvError(
      `APP_ENV=${normalized} no puede usarse con NODE_ENV=production ` +
        "(configuración contradictoria: un proceso publicado no puede autodeclararse " +
        `"${normalized}"). Usar APP_ENV=production o APP_ENV=pilot en procesos publicados.`,
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

/**
 * No llamar desde el nivel superior de un módulo (evaluación de imports
 * ESM) — solo dentro del cuerpo de una función, después de que `initAppEnv()`
 * ya se haya ejecutado en el arranque. Ver la nota "IMPORTANTE" al inicio
 * de este archivo.
 */
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
