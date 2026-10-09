import { createService } from "./service";

if (process.env.APP_ENV !== "pilot")
  throw new Error("El primer asistente solo puede arrancar con APP_ENV=pilot.");
if (!process.env.ASSISTANT_DATABASE_URL)
  throw new Error("Configurar una base propia en ASSISTANT_DATABASE_URL.");
const notification =
  process.env.SUPPORT_NOTIFY_ENABLED === "true"
    ? {
        apiKey: process.env.RESEND_API_KEY || "",
        from: process.env.SUPPORT_NOTIFY_FROM || "",
        to: process.env.SUPPORT_NOTIFY_EMAIL || "",
      }
    : undefined;
if (notification && Object.values(notification).some((v) => !v))
  throw new Error(
    "Completar configuración del correo o mantener SUPPORT_NOTIFY_ENABLED=false.",
  );
const service = await createService({
  databaseUrl: process.env.ASSISTANT_DATABASE_URL,
  secret: process.env.SUPPORT_SHARED_SECRET || "",
  version:
    process.env.RAILWAY_GIT_COMMIT_SHA ||
    process.env.ASSISTANT_SOURCE_VERSION ||
    "",
  sourceRoot: process.env.ASSISTANT_SOURCE_ROOT || process.cwd(),
  apiKey: process.env.OPENAI_API_KEY,
  model: process.env.OPENAI_MODEL || "gpt-4.1-mini",
  notification,
});
const server = service.app.listen(
  Number(process.env.PORT || 3000),
  "0.0.0.0",
  () =>
    console.log(
      "Asistente piloto iniciado: inspección de código, sin ejecución de cambios.",
    ),
);
for (const signal of ["SIGINT", "SIGTERM"] as const)
  process.on(signal, () => {
    server.close(() => void service.stop().then(() => process.exit(0)));
  });
