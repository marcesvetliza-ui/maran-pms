import express from "express";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Server } from "node:http";
import { registerHousekeepingRoutes } from "../routes/housekeeping";

const state = vi.hoisted(() => ({ record: null as any, update: vi.fn() }));
vi.mock("../db-storage", () => ({ storage: {} }));
vi.mock("../db", () => ({
  db: {
    update: () => ({
      set: (data: any) => {
        state.update(data);
        return { where: () => ({ returning: async () => {
          if (!state.record) return [];
          state.record = { ...state.record, ...data };
          return [state.record];
        } }) };
      },
    }),
    select: () => {
      const query: any = {
        from: () => query,
        where: () => query,
        orderBy: () => query,
        limit: () => query,
        then: (resolve: any, reject: any) => Promise.resolve(state.record ? [state.record] : []).then(resolve, reject),
      };
      return query;
    },
  },
  pool: { query: vi.fn(), connect: vi.fn() },
}));

const shipping = {
  fullName: "Destinatario de prueba", address: "Domicilio de prueba 123",
  province: "Región de prueba", postalCode: "00123", city: "Ciudad de prueba",
  country: "Uruguay", paymentStatus: "no_pagado",
};
const delivery = {
  status: "entregado", deliveryType: "envio",
  claimedBy: shipping.fullName, claimedDate: "2026-10-03",
  deliveredBy: "Operador de prueba", shippingDetails: shipping,
};
let server: Server;
let base: string;
let authenticated = true;

beforeEach(async () => {
  authenticated = true;
  state.record = { id: "test-object", codigo: "LF-TEST", status: "en_custodia", shippingDetails: null };
  state.update.mockClear();
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    req.isAuthenticated = (() => authenticated) as any;
    if (authenticated) req.user = { id: "test-user", role: "reception" } as any;
    next();
  });
  registerHousekeepingRoutes(app);
  server = app.listen(0, "127.0.0.1");
  await new Promise<void>(resolve => server.once("listening", resolve));
  base = `http://127.0.0.1:${(server.address() as any).port}/api/lost-found/test-object`;
});
afterEach(async () => {
  await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
});
const patch = (data: any, suffix = "/status") => fetch(base + suffix, {
  method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data),
});

describe("Objetos perdidos: datos de envío", () => {
  it.each(["no_pagado", "pagado"])("guarda y permite consultar dirección y pago %s", async paymentStatus => {
    const res = await patch({ ...delivery, shippingDetails: { ...shipping, paymentStatus, fullName: ` ${shipping.fullName} ` } });
    expect(res.status).toBe(200);
    const item = await (await fetch(base)).json();
    expect(item.shippingDetails).toEqual({ ...shipping, paymentStatus });
    expect(item.shippingDetails.postalCode).toBe("00123");
  });
  it("permite marcar pagado un envío ya entregado", async () => {
    await patch(delivery);
    const res = await patch({ ...delivery, shippingDetails: { ...shipping, paymentStatus: "pagado" } });
    expect(res.status).toBe(200);
    expect((await res.json()).shippingDetails.paymentStatus).toBe("pagado");
  });
  it.each([
    { ...delivery, shippingDetails: undefined },
    { ...delivery, shippingDetails: { ...shipping, address: " " } },
    { ...delivery, shippingDetails: { ...shipping, paymentStatus: "otro" } },
  ])("rechaza envíos incompletos sin modificar el objeto", async payload => {
    expect((await patch(payload)).status).toBe(400);
    expect(state.update).not.toHaveBeenCalled();
    expect(state.record.status).toBe("en_custodia");
  });
  it("retirar en hotel no requiere envío y borra direcciones ocultas", async () => {
    state.record.shippingDetails = shipping;
    const res = await patch({ status: "entregado", deliveryType: "retiro_hotel", claimedBy: "Prueba", claimedDate: "2026-10-03" });
    expect(res.status).toBe(200);
    expect((await res.json()).shippingDetails).toBeNull();
  });
  it("conserva los cambios de estado y registros anteriores sin envío", async () => {
    expect((await patch({ status: "contactado" })).status).toBe(200);
    expect(state.record.shippingDetails).toBeNull();
  });
  it("impide introducir JSON de envío inválido mediante edición general", async () => {
    expect((await patch({ shippingDetails: { fullName: "Incompleto" } }, "")).status).toBe(400);
    expect(state.update).not.toHaveBeenCalled();
  });
  it("mantiene la autenticación requerida", async () => {
    authenticated = false;
    expect((await patch(delivery)).status).toBe(401);
    expect(state.update).not.toHaveBeenCalled();
  });
  it("devuelve 404 si el objeto no existe", async () => {
    state.record = null;
    expect((await patch(delivery)).status).toBe(404);
  });
});