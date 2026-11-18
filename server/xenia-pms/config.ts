export type XeniaPmsConfig = {
  databaseUrl: string;
  sessionSecret: string;
  origin: string;
  controlOrigin: string;
  propertyId: string;
  clientId: string;
  clientSecret: string;
  template: "aurora" | "brisa";
  propertyName: string;
  production: boolean;
};

const uuid =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export function isUuid(value: string): boolean {
  return uuid.test(value);
}

export function exactXeniaOrigin(value: string, production: boolean): string {
  const url = new URL(value);
  if (
    url.username ||
    url.password ||
    url.pathname !== "/" ||
    url.search ||
    url.hash ||
    (url.protocol !== "https:" &&
      !(
        url.protocol === "http:" &&
        !production &&
        ["127.0.0.1", "localhost", "[::1]"].includes(url.hostname)
      ))
  )
    throw new Error("Origen inválido.");
  return url.origin;
}

export function readXeniaPmsConfig(
  env: NodeJS.ProcessEnv = process.env,
): XeniaPmsConfig | undefined {
  if (env.XENIA_PMS_MODE === undefined) return undefined;
  if (env.XENIA_PMS_MODE !== "qa")
    throw new Error("XENIA_PMS_MODE: esta entrega sólo admite qa.");
  const invalid: string[] = [];
  const databaseUrl = env.DATABASE_URL ?? "";
  try {
    const parsed = new URL(databaseUrl);
    if (
      !["postgres:", "postgresql:"].includes(parsed.protocol) ||
      !parsed.pathname.slice(1) ||
      databaseUrl.includes("${{")
    )
      throw new Error();
  } catch {
    invalid.push(
      "DATABASE_URL: requiere una conexión PostgreSQL resuelta de la instalación de pruebas.",
    );
  }
  const sessionSecret = env.SESSION_SECRET ?? "";
  const clientSecret = env.XENIA_PMS_CLIENT_SECRET ?? "";
  if (sessionSecret.trim().length < 32 || sessionSecret.includes("${{"))
    invalid.push(
      "SESSION_SECRET: requiere un secreto resuelto de 32 caracteres o más.",
    );
  if (!/^[a-zA-Z0-9_-]{43,128}$/.test(clientSecret))
    invalid.push(
      "XENIA_PMS_CLIENT_SECRET: copiá el secreto de la ficha del panel.",
    );
  if (sessionSecret && sessionSecret === clientSecret)
    invalid.push(
      "SESSION_SECRET y XENIA_PMS_CLIENT_SECRET deben ser distintos.",
    );
  const propertyId = env.XENIA_PMS_PROPERTY_ID ?? "";
  const clientId = env.XENIA_PMS_CLIENT_ID ?? "";
  if (!uuid.test(propertyId))
    invalid.push(
      "XENIA_PMS_PROPERTY_ID: requiere el identificador del establecimiento.",
    );
  if (!uuid.test(clientId))
    invalid.push(
      "XENIA_PMS_CLIENT_ID: requiere el identificador de instalación.",
    );
  const template = env.XENIA_PMS_TEMPLATE;
  if (template !== "aurora" && template !== "brisa")
    invalid.push("XENIA_PMS_TEMPLATE: elegí aurora o brisa.");
  const production = env.NODE_ENV === "production";
  let origin = "",
    controlOrigin = "";
  for (const key of ["XENIA_PMS_ORIGIN", "XENIA_CONTROL_ORIGIN"] as const) {
    try {
      const parsed = exactXeniaOrigin(env[key] ?? "", production);
      if (key === "XENIA_PMS_ORIGIN") origin = parsed;
      else controlOrigin = parsed;
    } catch {
      invalid.push(key + ": requiere su origen HTTPS exacto.");
    }
  }
  if (origin && origin === controlOrigin)
    invalid.push("El panel y el PMS deben tener orígenes distintos.");
  for (const key of [
    "AFIP_ACCESS_TOKEN",
    "AFIP_CERT",
    "AFIP_KEY",
    "ARCA_CERT",
    "ARCA_KEY",
    "CHANNEX_API_KEY",
    "RESEND_API_KEY",
    "OPENAI_API_KEY",
    "AI_INTEGRATIONS_OPENAI_API_KEY",
    "SENTRY_DSN",
    "STRIPE_SECRET_KEY",
    "MARA_BASE_URL",
    "CHATBOT_WEBHOOK_SECRET",
  ])
    if (env[key]?.trim())
      invalid.push(
        key + ": debe quedar sin configurar en esta instalación de pruebas.",
      );
  if (invalid.length)
    throw new Error(
      "Configuración del PMS de pruebas incompleta. " + invalid.join(" "),
    );
  return {
    databaseUrl,
    sessionSecret,
    origin,
    controlOrigin,
    propertyId: propertyId.toLowerCase(),
    clientId: clientId.toLowerCase(),
    clientSecret,
    template: template as "aurora" | "brisa",
    propertyName: template === "aurora" ? "Hotel Aurora" : "Apart Brisa",
    production,
  };
}
