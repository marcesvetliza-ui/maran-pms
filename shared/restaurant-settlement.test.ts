import { describe, it, expect } from "vitest";
import { restaurantCashPosting, restaurantNonFiscalMethods } from "./restaurant-settlement";
import { nonFiscalCollectionError } from "./cash-document-classification";
describe("restaurant settlement choices and non-fiscal protections", () => {
  it("enables the room selector for Room Service and deferred app tender only for its voucher", () => {
    expect(restaurantNonFiscalMethods("voucher_room_service")).toHaveProperty("cuenta_habitacion");
    expect(restaurantNonFiscalMethods("voucher_pedidos_ya")).toHaveProperty("pedidos_ya", "Pedidos Ya");
    expect(restaurantNonFiscalMethods("ticket")).not.toHaveProperty("pedidos_ya");
    expect(nonFiscalCollectionError("voucher_room_service", ["cuenta_habitacion"])).toBeNull();
    expect(nonFiscalCollectionError("voucher_pedidos_ya", ["pedidos_ya"], { restaurant: true })).toBeNull();
    expect(nonFiscalCollectionError("ticket", ["consumo_interno"], { restaurant: true })).toBeNull();
    expect(nonFiscalCollectionError("ticket", ["pedidos_ya"], { restaurant: true })).toBeTruthy();
    expect(nonFiscalCollectionError("ticket", ["consumo_interno"])).toBeTruthy();
    expect(nonFiscalCollectionError("cierre_spa", ["consumo_interno"])).toBeTruthy();
  });
  it.each(["ticket", "voucher_room_service", "voucher_pedidos_ya", "voucher_consumo_interno"])("keeps card collection blocked for %s", type => {
    expect(nonFiscalCollectionError(type, ["efectivo", "tarjeta_credito"])).toBeTruthy();
  });
  it("keeps physical collections distinct from voucher and room imputations", () => {
    expect(restaurantCashPosting("efectivo")).toEqual({paymentMethod:"efectivo",movementType:"income"});
    expect(restaurantCashPosting("consumo_interno")).toEqual({paymentMethod:"voucher",movementType:"informational"});
    expect(restaurantCashPosting("pedidos_ya")).toEqual({paymentMethod:"voucher",movementType:"informational"});
    expect(restaurantCashPosting("cuenta_habitacion")).toEqual({paymentMethod:"room_charge",movementType:"informational"});
  });
});
