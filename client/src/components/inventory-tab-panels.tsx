import { Children, isValidElement, type ReactNode } from "react";
import { ArrowDownToLine, BarChart3, History } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

const movementPanels = ["movements", "consumos", "internos"];

function isMovementPanel(panel: ReactNode) {
  return isValidElement<{ value?: string }>(panel)
    && movementPanels.includes(panel.props.value ?? "");
}

/**
 * Groups the existing history panels without copying their reports or forms.
 * Each TabsContent receives the context of its own (main or nested) Tabs root.
 */
export function InventoryTabPanels({
  children,
  movementTab,
  onMovementTabChange,
}: {
  children: ReactNode;
  movementTab: string;
  onMovementTabChange: (value: string) => void;
}) {
  const panels = Children.toArray(children);

  return (
    <>
      {panels.filter(panel => !isMovementPanel(panel))}
      <TabsContent value="movements" className="space-y-4">
        <Tabs value={movementTab} onValueChange={onMovementTabChange}>
          <TabsList aria-label="Vistas de movimientos" className="h-auto flex-wrap justify-start gap-1">
            <TabsTrigger value="movements" data-testid="tab-movements-general">
              <History className="h-4 w-4 mr-2" />
              Movimientos generales
            </TabsTrigger>
            <TabsTrigger value="consumos" data-testid="tab-consumos">
              <BarChart3 className="h-4 w-4 mr-2" />
              Consumos
            </TabsTrigger>
            <TabsTrigger value="internos" data-testid="tab-internos">
              <ArrowDownToLine className="h-4 w-4 mr-2" />
              Movimientos internos
            </TabsTrigger>
          </TabsList>
          {panels.filter(isMovementPanel)}
        </Tabs>
      </TabsContent>
    </>
  );
}