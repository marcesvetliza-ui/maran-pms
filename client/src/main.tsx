import { createRoot } from "react-dom/client";
import { Component, type ReactNode, type ErrorInfo } from "react";
import App from "./App";
import "./index.css";

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
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{ padding: "2rem", fontFamily: "system-ui" }}>
          <h1 style={{ color: "#dc2626" }}>Error en la aplicación</h1>
          <p>Ocurrió un error inesperado. Intente recargar la página.</p>
          <pre style={{ background: "#f3f4f6", padding: "1rem", borderRadius: "0.5rem", overflow: "auto", fontSize: "0.875rem", marginTop: "1rem" }}>
            {this.state.error?.message}
            {"\n"}
            {this.state.error?.stack}
          </pre>
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
