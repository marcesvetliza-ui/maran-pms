export type ControlConfig = {
  controlUrl: string;
  propertyUrls: Record<string, string>;
  sessionSecret: string;
  origin: string;
  port: number;
  demo: boolean;
  production: boolean;
};

export function databaseIdentity(value: string): string {
  const url = new URL(value);
  if (
    !["postgres:", "postgresql:"].includes(url.protocol) ||
    !url.pathname.slice(1)
  ) {
    throw new Error(
      "Las conexiones de Xenia deben identificar una base PostgreSQL.",
    );
  }
  return `${url.searchParams.get("host") ?? url.hostname.toLowerCase()}:${url.searchParams.get("port") ?? (url.port || "5432")}${url.pathname}`;
}

export function readControlConfig(
  env: NodeJS.ProcessEnv = process.env,
): ControlConfig {
  // Deliberately never use the operational PMS DATABASE_URL or SESSION_SECRET.
  const controlUrl = env.XENIA_CONTROL_DATABASE_URL;
  const sessionSecret = env.XENIA_CONTROL_SESSION_SECRET;
  if (
    !controlUrl ||
    !controlUrl.trim() ||
    !sessionSecret ||
    !sessionSecret.trim() ||
    sessionSecret.length < 32
  ) {
    const missing: string[] = [];
    if (!controlUrl || !controlUrl.trim())
      missing.push("XENIA_CONTROL_DATABASE_URL: falta o está vacía.");
    if (!sessionSecret || !sessionSecret.trim())
      missing.push("XENIA_CONTROL_SESSION_SECRET: falta o está vacía.");
    else if (sessionSecret.length < 32)
      missing.push(
        "XENIA_CONTROL_SESSION_SECRET: debe tener 32 caracteres o más.",
      );
    // Include only the failing variable names, never connection strings or secret values.
    throw new Error("Configuración de Xenia incompleta. " + missing.join(" "));
  }
  let propertyUrls: Record<string, string>;
  try {
    propertyUrls = JSON.parse(env.XENIA_PROPERTY_DATABASES ?? "{}");
    if (
      !propertyUrls ||
      Array.isArray(propertyUrls) ||
      typeof propertyUrls !== "object" ||
      !Object.keys(propertyUrls).length
    )
      throw new Error();
    const identities = new Set([databaseIdentity(controlUrl)]);
    for (const [key, url] of Object.entries(propertyUrls)) {
      if (!/^[a-z][a-z0-9_-]{0,39}$/.test(key) || typeof url !== "string")
        throw new Error();
      const identity = databaseIdentity(url);
      if (identities.has(identity)) throw new Error();
      identities.add(identity);
    }
  } catch {
    throw new Error(
      "XENIA_PROPERTY_DATABASES debe contener conexiones PostgreSQL distintas entre sí y de la base central.",
    );
  }
  const demo = env.XENIA_CONTROL_DEMO === "true";
  const production = env.NODE_ENV === "production";
  const origin = new URL(env.XENIA_CONTROL_ORIGIN ?? "http://127.0.0.1:4186");
  if (
    origin.pathname !== "/" ||
    origin.search ||
    origin.hash ||
    origin.username ||
    origin.password
  )
    throw new Error(
      "El origen de Xenia debe ser una URL sin ruta ni credenciales.",
    );
  if (
    demo &&
    (production ||
      !["127.0.0.1", "localhost", "[::1]"].includes(origin.hostname))
  )
    throw new Error(
      "La demostración sólo puede ejecutarse localmente, fuera de producción.",
    );
  if (production && origin.protocol !== "https:")
    throw new Error("La instalación publicada requiere HTTPS.");
  if (!["http:", "https:"].includes(origin.protocol))
    throw new Error("Origen de Xenia inválido.");
  const port = Number(env.XENIA_CONTROL_PORT ?? env.PORT ?? 4186);
  if (!Number.isInteger(port) || port < 1 || port > 65535)
    throw new Error("Puerto de Xenia inválido.");
  return {
    controlUrl,
    propertyUrls,
    sessionSecret,
    origin: origin.origin,
    port,
    demo,
    production,
  };
}
