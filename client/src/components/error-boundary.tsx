import { Component, type ReactNode } from "react";
import { AlertTriangle, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";

interface Props {
  children: ReactNode;
  fallbackLabel?: string;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: { componentStack: string }) {
    console.error("[ErrorBoundary]", error, info.componentStack);
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null });
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex flex-col items-center justify-center h-full min-h-[300px] gap-4 p-8 text-center">
          <div className="rounded-full bg-destructive/10 p-4">
            <AlertTriangle className="h-8 w-8 text-destructive" />
          </div>
          <div className="space-y-1">
            <h2 className="text-lg font-semibold">Algo salió mal</h2>
            <p className="text-sm text-muted-foreground max-w-sm">
              {this.props.fallbackLabel ?? "Ocurrió un error inesperado en esta sección. Podés intentar recargar o contactar al soporte."}
            </p>
          </div>
          {this.state.error && (
            <details className="text-xs text-muted-foreground max-w-md text-left bg-muted/40 rounded p-2 border">
              <summary className="cursor-pointer font-medium mb-1">Detalle técnico</summary>
              <pre className="overflow-auto whitespace-pre-wrap">{this.state.error.message}</pre>
            </details>
          )}
          <Button variant="outline" size="sm" onClick={this.handleReset} data-testid="button-error-retry">
            <RefreshCw className="h-4 w-4 mr-2" />
            Reintentar
          </Button>
        </div>
      );
    }

    return this.props.children;
  }
}
