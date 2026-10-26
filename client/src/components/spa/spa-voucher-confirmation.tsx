import { useEffect, useRef, useState, type ReactNode } from "react";
import {
  spaPrefacturaInputSchema,
  type SpaPrefacturaSettings,
} from "@shared/spaPrefactura";
import {
  fundingApi,
  FundingApiError,
  requestSchema,
  type FundingRequest,
} from "@/lib/paymentFunding";
import { Button } from "@/components/ui/button";
const key = (userId: string, id: string) =>
  `spa-voucher:${encodeURIComponent(userId)}:${encodeURIComponent(id)}`;
type Command = {
  requestId: string;
  expectedVersion: string;
  settings: SpaPrefacturaSettings;
  newCollections: FundingRequest["newCollections"];
};
export function readSpaVoucherJournal(
  userId: string,
  id: string,
): Command | "damaged" | null {
  try {
    const raw = sessionStorage.getItem(key(userId, id));
    if (!raw) return null;
    const value = JSON.parse(raw);
    const { requestId, expectedVersion, settings } =
      spaPrefacturaInputSchema.parse({
        requestId: value.requestId,
        expectedVersion: value.expectedVersion,
        settings: value.settings,
      });
    if (settings.receiptType !== "cierre_spa") return "damaged";
    return {
      requestId,
      expectedVersion,
      settings,
      newCollections: requestSchema.shape.newCollections.parse(
        value.newCollections,
      ),
    };
  } catch {
    return "damaged";
  }
}
export function SpaVoucherConfirmation(p: {
  accountId: string;
  userId: string;
  canWrite: boolean;
  valid: boolean;
  selectionKey: string;
  settings: SpaPrefacturaSettings;
  expectedVersion?: string;
  collections: FundingRequest["newCollections"];
  form: ReactNode;
  review: ReactNode;
  onPending: (pending: boolean) => void;
  onBusy: (busy: boolean) => void;
  onCompleted: () => void;
}) {
  const [pending, setPending] = useState(() =>
      readSpaVoucherJournal(p.userId, p.accountId),
    ),
    [reviewed, setReviewed] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const flight = useRef(false);
  useEffect(() => setReviewed(false), [p.selectionKey]);
  async function confirm(retry = false) {
    if (
      flight.current ||
      !p.canWrite ||
      pending === "damaged" ||
      (!retry && !p.valid)
    )
      return;
    flight.current = true;
    setBusy(true);
    p.onBusy(true);
    setError("");
    try {
      const command = retry
        ? pending
        : {
            requestId: crypto.randomUUID(),
            expectedVersion: p.expectedVersion!,
            settings: p.settings,
            newCollections: p.collections,
          };
      if (!command) throw new Error("No se pudo leer el intento pendiente.");
      spaPrefacturaInputSchema.parse({
        requestId: command.requestId,
        expectedVersion: command.expectedVersion,
        settings: command.settings,
      });
      sessionStorage.setItem(
        key(p.userId, p.accountId),
        JSON.stringify(command),
      );
      setPending(command);
      p.onPending(true);
      await fundingApi.issueVoucher(p.accountId, command);
      sessionStorage.removeItem(key(p.userId, p.accountId));
      setPending(null);
      p.onPending(false);
      setReviewed(false);
      p.onCompleted();
    } catch (e) {
      if (e instanceof FundingApiError && e.status >= 400 && e.status < 500) {
        sessionStorage.removeItem(key(p.userId, p.accountId));
        setPending(null);
        p.onPending(false);
      }
      setError(
        e instanceof Error ? e.message : "No se pudo completar el voucher.",
      );
    } finally {
      flight.current = false;
      setBusy(false);
      p.onBusy(false);
    }
  }
  return (
    <section className="space-y-4">
      {p.form}
      {error && (
        <p role="alert" className="text-destructive">
          {error}
        </p>
      )}
      {pending === "damaged" ? (
        <p role="alert">
          No se pudo leer el intento pendiente. Solicitá revisión antes de
          cobrar o emitir otro comprobante.
        </p>
      ) : pending ? (
        <div className="space-y-2 rounded-lg border p-4">
          <p>
            Hay un voucher pendiente de confirmar. No vuelvas a cobrar ni a
            emitir.
          </p>
          <Button
            disabled={busy || !p.canWrite}
            onClick={() => void confirm(true)}
          >
            Consultar el mismo voucher
          </Button>
        </div>
      ) : (
        <>
          <Button disabled={busy} onClick={() => setReviewed(true)}>
            Revisar comprobante
          </Button>
          {reviewed && (
            <>
              {p.review}
              <Button
                disabled={busy || !p.canWrite || !p.valid}
                onClick={() => void confirm()}
              >
                Confirmar cobro y emitir voucher
              </Button>
            </>
          )}
        </>
      )}
    </section>
  );
}
