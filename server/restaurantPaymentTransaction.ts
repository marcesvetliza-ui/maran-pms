import { AsyncLocalStorage } from "node:async_hooks";
import type { Request, Response, RequestHandler } from "express";
import { eq } from "drizzle-orm";
import { restaurantOrders } from "@shared/schema";
import { db, withDatabaseTransaction } from "./db";

type AfterCommit = () => Promise<Record<string, unknown>>;
const afterCommitContext = new AsyncLocalStorage<AfterCommit[]>();
class RejectedPayment extends Error {}

export function afterRestaurantPaymentCommit(action: AfterCommit): void {
  const actions = afterCommitContext.getStore();
  if (!actions) throw new Error("Restaurant payment transaction is required");
  actions.push(action);
}

/** Buffer the response until every local payment effect has committed. */
export function restaurantPaymentTransaction(
  handler: (req: Request, res: Response) => Promise<unknown>,
): RequestHandler {
  return async (req, res) => {
    let body: any;
    let status = 200;
    const actions: AfterCommit[] = [];
    const stagedResponse = new Proxy(res, {
      get(target, property) {
        if (property === "status") return (code: number) => { status = code; return stagedResponse; };
        if (property === "json") return (value: unknown) => { body = value; return stagedResponse; };
        const value = Reflect.get(target, property, target);
        return typeof value === "function" ? value.bind(target) : value;
      },
    });
    try {
      await withDatabaseTransaction(async () => {
        // Serialize close, installment and item payments for the same order.
        // Its paid/closed flags cannot become visible ahead of their effects.
        await db.select({ id: restaurantOrders.id }).from(restaurantOrders)
          .where(eq(restaurantOrders.id, req.params.id)).for("update");
        await afterCommitContext.run(actions, () => handler(req, stagedResponse));
        if (status >= 400) throw new RejectedPayment();
      });
    } catch (error) {
      if (!(error instanceof RejectedPayment)) {
        console.error("[Restaurant payment] Transaction rolled back:", error);
        status = 500;
        body = { error: "No se pudo completar el cobro. Podés reintentar." };
      }
      res.status(status).json(body);
      return;
    }
    // Fiscal calls execute without a database transaction or order/shift lock.
    // Their established error handling remains in the queued action.
    for (const action of actions) Object.assign(body, await action());
    res.status(status).json(body);
  };
}
