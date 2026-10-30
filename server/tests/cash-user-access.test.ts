import { describe, it, expect } from "vitest";
import { canViewCash, canOperateCash, hasGlobalCashAccess } from "../../shared/cash-user-access";

describe("hotel approved cash roster", () => {
  const areas = ["reception", "restaurant", "spa"];
  it.each(["admin", "analia.martinez", "berta.goldbarg", "diego.beber", "gerencia", "gonzalo.villanueva", "jesica.bonilla", "jessica.schusler", "ailin.celestre", "luciana.lisman"])("allows all three for %s", username => {
    expect(hasGlobalCashAccess(username)).toBe(true);
    for (const area of areas) expect(canOperateCash(username, area)).toBe(true);
    expect(canOperateCash(username, "events")).toBe(false);
  });
  it.each([
    ["reception", ["emanuel.castro", "leonardo.de.castro", "lucia.espinosa", "recepcion1", "matias.cardozo", "matias.hernandez", "yamil.latuf"]],
    ["restaurant", ["florencia.ruiz.diaz", "gabriel.sobrino", "martin.gamarra", "martin.gimenez", "matias.sobrino", "miguel.sartori", "rosina.rodriguez"]],
    ["spa", ["spa1", "nerina.almada", "solana.marzolini"]],
  ] as const)("restricts operators to %s", (ownArea, users) => {
    for (const username of users) {
      expect(canViewCash(username)).toBe(true);
      for (const area of areas) expect(canOperateCash(username, area)).toBe(area === ownArea);
    }
  });
  it.each(["aixa.duarte", "housekeeping1", "paula.deharbe", "Jose Pablo Hskn", "diego.godoy", "emiliano.duarte", "ezequiel.ramirez", "Jose Pablo Mant", "julian.rendler", "Jose Pablo Deposito", "helga.solis", "Jose Pablo Even"])("denies viewing and operation for %s", username => {
    expect(canViewCash(username)).toBe(false);
    for (const area of areas) expect(canOperateCash(username, area)).toBe(false);
  });
  it("defaults new accounts to viewing without opening; rejects name impersonation", () => {
    expect(canViewCash("new-admin")).toBe(true);
    for (const user of [undefined, "new-admin", "Administrador Sistema", "ADMIN", " admin"]) {
      for (const area of areas) expect(canOperateCash(user, area)).toBe(false);
    }
    expect(canViewCash(undefined)).toBe(false);
  });
  it("handles stored area aliases and rejects unknown areas", () => {
    expect(canOperateCash("recepcion1", "recepcion")).toBe(true);
    expect(canOperateCash("martin.gimenez", "restaurante")).toBe(true);
    for (const area of ["events", "eventos", "", "constructor", "__proto__"]) expect(canOperateCash("admin", area)).toBe(false);
  });
});
