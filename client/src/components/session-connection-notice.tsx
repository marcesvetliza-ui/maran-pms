import { useEffect, useRef, useState } from "react";
import * as AlertDialog from "@radix-ui/react-alert-dialog";
import { Button } from "@/components/ui/button";

type Props = { blocked: boolean; busy: boolean; error?: string; retryAt: number; modal?: boolean; onRetry: () => void; onLogout: () => void };
export function SessionConnectionNotice({ blocked, busy, error, retryAt, modal = false, onRetry, onLogout }: Props) {
  const content = useRef<HTMLDivElement>(null);
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    setNow(Date.now());
    if (!blocked || retryAt <= Date.now()) return;
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [blocked, retryAt]);
  if (!blocked) return null;
  const remaining = Math.max(0, Math.ceil((retryAt - now) / 1000));
  const wait = remaining >= 60 ? `${Math.ceil(remaining / 60)} ${Math.ceil(remaining / 60) === 1 ? "minuto" : "minutos"}` : `${remaining} ${remaining === 1 ? "segundo" : "segundos"}`;
  const title = error ? "Reconectando con el sistema" : "Verificando sesión";
  const description = error || "Esperá un momento mientras verificamos tu sesión.";
  const controls = <div className="mt-4 flex flex-wrap justify-end gap-2">
    <Button variant="outline" onClick={onLogout}>Cerrar sesión</Button>
    <Button onClick={onRetry} disabled={busy || remaining > 0}>{busy ? "Verificando…" : "Reintentar conexión"}</Button>
  </div>;
  const details = <>
    {modal && <p className="mt-3 text-sm">Lo que estabas editando permanece abierto. Podrás volver a operar cuando verifiquemos tu sesión.</p>}
    {remaining > 0 && <p className="mt-2 text-sm" role="status">Volvé a intentar en {wait}.</p>}
    {controls}
  </>;
  if (!modal) return <main className="min-h-screen flex items-center justify-center bg-background p-6">
    <section className="max-w-md rounded-lg border bg-card p-6" aria-labelledby="session-connection-title" role="alert">
      <h1 id="session-connection-title" className="text-lg font-semibold">{title}</h1><p className="mt-2 text-sm text-muted-foreground">{description}</p>{details}
    </section>
  </main>;
  return <AlertDialog.Root open>
    <AlertDialog.Portal>
      <AlertDialog.Overlay className="fixed inset-0 z-[1000] bg-black/60" />
      <AlertDialog.Content ref={content} className="fixed left-1/2 top-1/2 z-[1001] w-[calc(100%_-_2rem)] max-w-md -translate-x-1/2 -translate-y-1/2 rounded-lg border bg-background p-6 shadow-lg"
        onEscapeKeyDown={event => event.preventDefault()} onOpenAutoFocus={event => { event.preventDefault(); content.current?.focus(); }}>
        <AlertDialog.Title className="text-lg font-semibold">{title}</AlertDialog.Title>
        <AlertDialog.Description className="mt-2 text-sm text-muted-foreground">{description}</AlertDialog.Description>
        {details}
      </AlertDialog.Content>
    </AlertDialog.Portal>
  </AlertDialog.Root>;
}
