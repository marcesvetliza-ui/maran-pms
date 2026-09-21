import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db } from "../db";
import { storage } from "../db-storage";
import { guests } from "@shared/schema";
import { inArray } from "drizzle-orm";

// searchGuests() used to ILIKE the whole query string against each field
// independently, so "Ojeda" (found in lastName alone) worked but "Ojeda R"
// (lastName + the first letter of firstName — how reception naturally types
// to tell apart several same-surname guests) matched nothing, since no single
// field contains "Ojeda R".
const suffix = randomUUID();
const lastName = `Ojeda${suffix}`;
const milagrosId = `test-guest-milagros-${suffix}`;
const facundoId = `test-guest-facundo-${suffix}`;
const ramiroId = `test-guest-ramiro-${suffix}`;

describe("searchGuests — búsqueda por apellido + inicial del nombre", () => {
  beforeAll(async () => {
    await db.insert(guests).values([
      { id: milagrosId, firstName: "Milagros", lastName, segment: "LEISURE", sexo: "no_especifica" },
      { id: facundoId, firstName: "Juan Facundo", lastName, segment: "LEISURE", sexo: "no_especifica" },
      { id: ramiroId, firstName: "Ramiro", lastName, segment: "LEISURE", sexo: "no_especifica" },
    ] as any);
  });

  afterAll(async () => {
    await db.delete(guests).where(inArray(guests.id, [milagrosId, facundoId, ramiroId]));
  });

  it("un solo término sigue trayendo a los tres (sin regresión)", async () => {
    const results = await storage.searchGuests(lastName);
    const ids = results.map(g => g.id);
    expect(ids).toEqual(expect.arrayContaining([milagrosId, facundoId, ramiroId]));
  });

  it("apellido + inicia del nombre encuentra al huésped correcto", async () => {
    const results = await storage.searchGuests(`${lastName} Ram`);
    const ids = results.map(g => g.id);
    expect(ids).toContain(ramiroId);
    expect(ids).not.toContain(milagrosId);
    expect(ids).not.toContain(facundoId);
  });

  it("el orden de las palabras no importa", async () => {
    const results = await storage.searchGuests(`Facundo ${lastName}`);
    const ids = results.map(g => g.id);
    expect(ids).toContain(facundoId);
    expect(ids).not.toContain(ramiroId);
  });
});
