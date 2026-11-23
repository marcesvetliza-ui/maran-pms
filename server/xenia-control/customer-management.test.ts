import { before, after, test } from "node:test";
import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
// @ts-expect-error Owned Unix-socket cluster, never an operational URL.
import { createDisposableXeniaPostgres } from "../../script/xenia-control-postgres.mjs";
import { readControlConfig } from "./config";
import { setupControl } from "./setup";
import { createControlApp } from "./app";
import { pkceChallenge } from "./pms";
import type { Principal } from "./store";

let fixture: ReturnType<typeof createDisposableXeniaPostgres>, control: Awaited<ReturnType<typeof createControlApp>>, server: Server, origin: string;
let platform: Client, adminA: Client, adminB: Client, orgA: string, orgB: string, hotelA: string, hotelB: string;
let actorPlatform: Principal, actorA: Principal, actorB: Principal;
let adminBCreation: ReturnType<typeof credentials>;
const password = "Clave ficticia de 2026";
class Client {
  cookie = ""; csrf = "";
  async request(path: string, method = "GET", body?: unknown, headers: Record<string, string> = {}) {
    const response = await fetch(origin + path, { method, headers: { "Content-Type": "application/json", Origin: origin,
      Cookie: this.cookie, "X-CSRF-Token": this.csrf, ...headers }, body: body === undefined ? undefined : JSON.stringify(body) });
    for (const value of response.headers.getSetCookie()) if (value.startsWith("xenia-control=")) this.cookie = value.split(";")[0];
    const data = await response.json(); if (data.csrfToken) this.csrf = data.csrfToken;
    return { status: response.status, data };
  }
  async login(username: string) { assert.equal((await this.request("/api/login", "POST", { username, password })).status, 200); return this; }
}
const credentials = (username: string) => ({ requestId: randomUUID(), username, name: username, password });
const userRoute = (org: string, id?: string) => `/api/organizations/${org}/users${id ? "/" + id : ""}`;
async function lease(actor: Principal, propertyId: string, port: number) {
  const installation = await control.pms.configure(actorPlatform, propertyId, `http://127.0.0.1:${port}`, "aurora");
  const verifier = randomBytes(32).toString("base64url");
  const grant = await control.pms.grant(actor, installation.clientId, pkceChallenge(verifier));
  return { installation, access: await control.pms.exchange(installation.clientId, grant.code, verifier) };
}

before(async () => {
  fixture = createDisposableXeniaPostgres(); const config = readControlConfig(fixture.env);
  await setupControl(config); control = await createControlApp(config);
  server = control.app.listen(0, "127.0.0.1"); await new Promise<void>(r => server.once("listening", r));
  origin = config.origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  platform = new Client(); assert.equal((await platform.request("/api/demo-login", "POST", { persona: "owner" })).status, 200);
  actorPlatform = (await control.store.credentials("admin.demo"))!;
  const properties = await control.store.properties(actorPlatform); hotelA = properties.find(p => p.slug === "aurora-demo")!.id;
  orgA = properties.find(p => p.id === hotelA)!.organizationId;
  orgB = (await control.store.createOrganization(actorPlatform, "Otro cliente independiente")).id;
  hotelB = (await control.store.createProperty(actorPlatform, { organizationId: orgB, name: "Hotel Nuevo", slug: "nuevo-cliente", modules: ["lodging"] })).id;
  for (const [org, username] of [[orgA, "admin.cliente.a"], [orgB, "admin.cliente.b"]]) {
    const body = credentials(username); if (org === orgB) adminBCreation = body;
    const result = await platform.request(`/api/admin/organizations/${org}/administrators`, "POST", body); assert.equal(result.status, 201);
  }
  adminA = await new Client().login("admin.cliente.a"); adminB = await new Client().login("admin.cliente.b");
  actorA = (await control.store.credentials("admin.cliente.a"))!; actorB = (await control.store.credentials("admin.cliente.b"))!;
}, { timeout: 60000 });
after(async () => { if (server) await new Promise<void>(r => { server.close(() => r()); server.closeAllConnections(); }); if (control) await control.close(); if (fixture) fixture.close(); });

test("organization administrators see only their customer and receive no global administration", async () => {
  assert.equal(actorA.platformAdmin, false); assert.equal(actorB.platformAdmin, false);
  assert.deepEqual((await adminA.request("/api/organizations")).data.map((o: any) => o.id), [orgA]);
  assert.deepEqual((await adminB.request("/api/properties")).data.map((p: any) => [p.id, p.role]), [[hotelB, "customer_admin"]]);
  for (const path of ["/api/admin/users", "/api/admin/organizations", `/api/admin/organizations/${orgA}/administrators`])
    assert.equal((await adminA.request(path)).status, 403);
  for (const path of [userRoute(orgB), `/api/organizations/${orgB}/properties`]) assert.equal((await adminA.request(path)).status, 404);
  assert.equal((await adminB.request(`/api/properties/${hotelA}/reservations`)).status, 404);
});

test("staff creation is scoped, strict and idempotent under concurrent retries", async () => {
  const input = { ...credentials("equipo.cliente.b"), propertyIds: [hotelB], role: "reception" };
  const results = await Promise.all([adminB.request(userRoute(orgB), "POST", input), adminB.request(userRoute(orgB), "POST", input)]);
  assert.deepEqual(results.map(r => r.status).sort(), [200, 201]);
  assert.equal(results[0].data.id, results[1].data.id);
  assert.equal((await adminB.request(userRoute(orgB), "POST", { ...input, password: password + " otro" })).status, 409);
  assert.equal((await control.store.central.query("SELECT count(*) FROM xenia_control.principals WHERE username=$1", [input.username])).rows[0].count, "1");
  const audit = (await control.store.central.query("SELECT details FROM xenia_control.audit WHERE action='customer_staff_created' AND organization_id=$1", [orgB])).rows;
  assert.equal(audit.length, 1); assert.ok(!JSON.stringify(audit).includes(password));
  const people = (await adminB.request(userRoute(orgB))).data; assert.ok(people.some((u: any) => u.id === results[0].data.id));
  assert.ok(!(await adminA.request(userRoute(orgA))).data.some((u: any) => u.id === results[0].data.id));
  assert.equal((await adminB.request(userRoute(orgB), "POST", { ...credentials("fuera.de.cliente"), propertyIds: [hotelA], role: "manager" })).status, 400);
  assert.equal((await adminB.request(userRoute(orgB), "POST", { ...input, requestId: randomUUID(), platformAdmin: true })).status, 400);
  assert.equal((await adminB.request(userRoute(orgB), "POST", { ...credentials("rol.no.valido"), propertyIds: [hotelB], role: "customer_admin" })).status, 400);
  assert.equal((await adminB.request(`/api/admin/organizations/${orgB}/administrators`, "POST", credentials("admin.no.permitido"))).status, 403);
});

test("staff role changes invalidate old PMS leases permanently without reviving withdrawn access on regrant", async () => {
  const input = { ...credentials("recepcion.rotacion"), propertyIds: [hotelB], role: "reception" };
  const created = await adminB.request(userRoute(orgB), "POST", input); assert.equal(created.status, 201);
  const actor = (await control.store.credentials(input.username))!;
  const current = await lease(actor, hotelB, 5292);
  assert.equal((await control.pms.introspect(current.installation.clientId, current.access.leaseToken)).identity.role, "reception");
  const url = userRoute(orgB, actor.id) + `/properties/${hotelB}`;
  assert.equal((await adminB.request(url, "DELETE")).status, 200);
  await assert.rejects(() => control.pms.introspect(current.installation.clientId, current.access.leaseToken));
  assert.equal((await adminB.request(userRoute(orgB), "POST", input)).status, 200);
  assert.equal((await control.store.central.query("SELECT count(*) FROM xenia_control.memberships WHERE principal_id=$1 AND property_id=$2", [actor.id, hotelB])).rows[0].count, "0");
  assert.equal((await adminB.request(url, "PUT", { role: "reception" })).status, 200);
  await assert.rejects(() => control.pms.introspect(current.installation.clientId, current.access.leaseToken));
  assert.equal((await adminB.request(userRoute(orgB), "POST", input)).status, 200);
  assert.equal((await control.store.central.query("SELECT role FROM xenia_control.memberships WHERE principal_id=$1 AND property_id=$2", [actor.id, hotelB])).rows[0].role, "reception");
});

test("customer suspension affects its memberships only and retains a person with zero assigned hotels", async () => {
  const input = { ...credentials("colaborador.compartido"), propertyIds: [hotelB], role: "reception" };
  const { data: person } = await adminB.request(userRoute(orgB), "POST", input);
  await control.store.assign(actorPlatform, hotelA, person.id, "viewer");
  const actor = (await control.store.credentials(input.username))!;
  const other = await lease(actor, hotelA, 5293); const own = await lease(actor, hotelB, 5294);
  assert.equal((await adminB.request(userRoute(orgB, person.id), "PATCH", { active: false })).status, 200);
  await assert.rejects(() => control.pms.introspect(own.installation.clientId, own.access.leaseToken));
  assert.equal((await control.pms.introspect(other.installation.clientId, other.access.leaseToken)).identity.role, "viewer");
  assert.equal((await control.store.principal(person.id))!.active, true);
  const entry = (await adminB.request(userRoute(orgB))).data.find((p: any) => p.id === person.id);
  assert.equal(entry.active, false); assert.deepEqual(entry.properties, []);
  const url = userRoute(orgB, person.id) + `/properties/${hotelB}`;
  assert.equal((await adminB.request(url, "PUT", { role: "reception" })).status, 409);
  assert.equal((await adminB.request(userRoute(orgB, person.id), "PATCH", { active: true })).status, 200);
  assert.equal((await adminB.request(url, "PUT", { role: "viewer" })).status, 200);
  assert.equal((await adminB.request(userRoute(orgB, person.id) + `/properties/${hotelA}`, "PUT", { role: "manager" })).status, 404);
});

test("arbitrary identities, forged principal fields and missing CSRF cannot cross the customer boundary", async () => {
  const unknown = randomUUID();
  assert.equal((await adminB.request(userRoute(orgB, actorA.id), "PATCH", { active: false })).status, 404);
  assert.equal((await adminB.request(userRoute(orgB, unknown), "PATCH", { active: false })).status, 404);
  assert.equal((await adminB.request(userRoute(orgB, actorB.id), "PATCH", { active: false })).status, 404);
  const input = { ...credentials("csrf.no.permitido"), propertyIds: [hotelB], role: "reception" };
  assert.equal((await adminB.request(userRoute(orgB), "POST", input, { "X-CSRF-Token": "" })).status, 403);
  assert.equal((await adminB.request(userRoute(orgB), "POST", { ...input, organizationId: orgA })).status, 400);
  assert.equal((await adminB.request(userRoute(orgB), "POST", { ...input, principalId: actorPlatform.id })).status, 400);
  assert.equal((await adminB.request(userRoute(orgB), "POST", { ...input, propertyIds: [hotelB, hotelB] })).status, 400);
});

test("central migration reruns preserve accounts, memberships and audit without seeding privileges again", async () => {
  const before = (await control.store.central.query("SELECT id,username,password_hash,platform_admin FROM xenia_control.principals ORDER BY id")).rows;
  const roles = (await control.store.central.query("SELECT * FROM xenia_control.memberships ORDER BY principal_id,property_id")).rows;
  await control.store.initializeCentral();
  assert.deepEqual((await control.store.central.query("SELECT id,username,password_hash,platform_admin FROM xenia_control.principals ORDER BY id")).rows, before);
  assert.deepEqual((await control.store.central.query("SELECT * FROM xenia_control.memberships ORDER BY principal_id,property_id")).rows, roles);
  assert.equal((await control.store.central.query("SELECT count(*) FROM xenia_control.customer_schema_migrations")).rows[0].count, "1");
});

test("revoking a customer administrator blocks open central sessions and PMS access; replay cannot reappoint it", async () => {
  const current = await lease(actorB, hotelB, 5295);
  assert.equal(current.access.identity.role, "customer_admin");
  assert.equal((await platform.request(`/api/admin/organizations/${orgB}/administrators/${actorB.id}`, "DELETE")).status, 200);
  assert.equal((await platform.request(`/api/admin/organizations/${orgB}/administrators`, "POST", adminBCreation)).status, 200);
  assert.deepEqual((await control.customers.administrators(actorPlatform, orgB)), []);
  assert.deepEqual((await adminB.request("/api/organizations")).data, []);
  assert.equal((await adminB.request(userRoute(orgB))).status, 404);
  await assert.rejects(() => control.pms.introspect(current.installation.clientId, current.access.leaseToken));
  const input = { ...credentials("despues.de.retiro"), propertyIds: [hotelB], role: "reception" };
  assert.equal((await adminB.request(userRoute(orgB), "POST", input)).status, 404);
});
