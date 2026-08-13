import { createRoot } from "react-dom/client";
import { Component, type ReactNode, type ErrorInfo } from "react";
import * as Sentry from "@sentry/react";
import App from "./App";
import "./index.css";

// Build ID — changes every deploy so CDN caches are busted automatically
declare const __BUILD_TIME__: string;
const _buildTime = __BUILD_TIME__;

const SENTRY_DSN = import.meta.env.VITE_SENTRY_DSN;

if (SENTRY_DSN) {
  Sentry.init({
    dsn: SENTRY_DSN,
    environment: import.meta.env.MODE,
    tracesSampleRate: 0.2,
    integrations: [Sentry.browserTracingIntegration()],
    beforeSend(event) {
      if (import.meta.env.DEV) return null;
      return event;
    },
  });
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

class ErrorBoundary extends Component<{ children: ReactNode }, ErrorBoundaryState> {
  constructor(props: { children: ReactNode }) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("React Error Boundary caught:", error, errorInfo);
    if (SENTRY_DSN) {
      Sentry.captureException(error, { extra: { componentStack: errorInfo.componentStack } });
    }
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{ padding: "2rem", fontFamily: "system-ui" }}>
          <h1 style={{ color: "#dc2626" }}>Error en la aplicación</h1>
          <p>Ocurrió un error inesperado. Intente recargar la página.</p>
          <p style={{ color: "#6b7280", fontSize: "0.875rem", marginTop: "0.5rem" }}>
            {this.state.error?.message}
          </p>
          <button
            onClick={() => { this.setState({ hasError: false, error: null }); window.location.href = "/"; }}
            style={{ marginTop: "1rem", padding: "0.5rem 1rem", background: "#2563eb", color: "white", border: "none", borderRadius: "0.375rem", cursor: "pointer" }}
          >
            Volver al inicio
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

createRoot(document.getElementById("root")!).render(
  <ErrorBoundary>
    <App />
  </ErrorBoundary>
);
