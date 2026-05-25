import * as Sentry from "@sentry/node";

export function initSentry() {
  const dsn = process.env.SENTRY_DSN;
  if (!dsn) {
    console.log("[sentry] SENTRY_DSN no configurado — monitoreo de errores deshabilitado");
    return;
  }

  Sentry.init({
    dsn,
    environment: process.env.NODE_ENV || "development",
    tracesSampleRate: 0.2,
    beforeSend(event) {
      if (process.env.NODE_ENV !== "production") return null;
      return event;
    },
  });

  console.log("[sentry] Monitoreo de errores activo");
}

export function captureException(err: unknown, context?: Record<string, unknown>) {
  if (!process.env.SENTRY_DSN) return;
  Sentry.withScope((scope) => {
    if (context) scope.setExtras(context);
    Sentry.captureException(err);
  });
}

export function setSentryUser(user: { id: string; username: string; role: string } | null) {
  if (!process.env.SENTRY_DSN) return;
  if (user) {
    Sentry.setUser({ id: user.id, username: user.username, role: user.role } as any);
  } else {
    Sentry.setUser(null);
  }
}

export { Sentry };
