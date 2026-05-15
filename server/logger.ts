const isProduction = process.env.NODE_ENV === "production";

type LogLevel = "info" | "warn" | "error";

function formatLog(level: LogLevel, message: string, context?: Record<string, unknown>): string {
  const ts = new Date().toISOString();
  if (isProduction) {
    return JSON.stringify({ ts, level, message, ...context });
  }
  const time = new Date().toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
  });
  const ctx = context ? " " + JSON.stringify(context) : "";
  const prefix = level === "error" ? "🔴" : level === "warn" ? "🟡" : "🔵";
  return `${prefix} ${time} [${level.toUpperCase()}] ${message}${ctx}`;
}

export const logger = {
  info(message: string, context?: Record<string, unknown>) {
    console.log(formatLog("info", message, context));
  },
  warn(message: string, context?: Record<string, unknown>) {
    console.warn(formatLog("warn", message, context));
  },
  error(message: string, error?: unknown, context?: Record<string, unknown>) {
    const errDetail = error instanceof Error
      ? { errorMessage: error.message, stack: error.stack }
      : error
        ? { errorRaw: String(error) }
        : {};
    console.error(formatLog("error", message, { ...errDetail, ...context }));
  },
};

// Global unhandled rejection / uncaught exception handlers
process.on("unhandledRejection", (reason) => {
  logger.error("Unhandled promise rejection", reason);
});

process.on("uncaughtException", (err) => {
  logger.error("Uncaught exception — shutting down", err);
  process.exit(1);
});
