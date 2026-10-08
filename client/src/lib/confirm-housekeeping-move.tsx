import { createRoot } from "react-dom/client";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogCancel,
  AlertDialogAction,
} from "@/components/ui/alert-dialog";
export function confirmHousekeepingMove(message: string) {
  return new Promise<boolean>((resolve) => {
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);
    let settled = false;
    const finish = (value: boolean) => {
      if (settled) return;
      settled = true;
      resolve(value);
      queueMicrotask(() => {
        root.unmount();
        container.remove();
      });
    };
    root.render(
      <AlertDialog
        open
        onOpenChange={(open) => {
          if (!open) finish(false);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Housekeeping pidió no mover</AlertDialogTitle>
            <AlertDialogDescription>
              {message} Al moverla, Housekeeping deberá revisar la preparación
              en destino.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => finish(false)}>
              Cancelar
            </AlertDialogCancel>
            <AlertDialogAction onClick={() => finish(true)}>
              Mover igualmente
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>,
    );
  });
}
