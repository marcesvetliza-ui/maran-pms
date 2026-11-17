import { before, after, test } from "node:test";
import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import pg from "pg";
// This helper creates its own empty cluster and never accepts an operational database URL.
// @ts-expect-error Local JavaScript fixture has no external type declaration.
import { createDisposableXeniaPostgres } from "../../script/xenia-control-postgres.mjs";
import { readControlConfig } from "./config";
import { setupControl } from "./setup";
import { createControlApp } from "./app";
import { ControlStore } from "./store";

let fixture: ReturnType<typeof createDisposableXeniaPostgres>,
  config: ReturnType<typeof readControlConfig>,
  control: Awaited<ReturnType<typeof createControlApp>>,
  server: Server,
  base: string;
let owner: Client,
  reception: Client,
  viewer: Client,
  aurora: string,
  brisa: string;
class Client {
  cookie = "";
  csrf = "";
  async request(
    path: string,
    method = "GET",
    body?: unknown,
    extra: Record<string, string> = {},
  ) {
    const response = await fetch(base + path, {
      method,
      headers: {
        "Content-Type": "application/json",
        Cookie: this.cookie,
        Origin: config.origin,
        "X-CSRF-Token": this.csrf,
        ...extra,
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    for (const value of response.headers.getSetCookie())
      if (value.startsWith("xenia-control=")) this.cookie = value.split(";")[0];
    const data = await response.json();
    if (data.csrfToken) this.csrf = data.csrfToken;
    return { status: response.status, data, headers: response.headers };
  }
  async demo(persona: string) {
    await this.request("/api/session");
    assert.equal(
      (await this.request("/api/demo-login", "POST", { persona })).status,
      200,
    );
    return this;
  }
}
const stay = (name = "Nueva prueba") => ({
  guestName: name,
  room: "102",
  checkIn: "2026-12-02",
  checkOut: "2026-12-04",
});
before(
  async () => {
    fixture = createDisposableXeniaPostgres();
    config = readControlConfig(fixture.env);
    await setupControl(config);
    control = await createControlApp(config);
    server = control.app.listen(0, "127.0.0.1");
    await new Promise<void>((resolve) => server.once("listening", resolve));
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    owner = await new Client().demo("owner");
    reception = await new Client().demo("reception");
    viewer = await new Client().demo("viewer");
    const { data } = await owner.request("/api/properties");
    aurora = data.find((p: any) => p.slug === "aurora-demo").id;
    brisa = data.find((p: any) => p.slug === "brisa-demo").id;
  },
  { timeout: 60000 },
);
after(async () => {
  if (server)
    await new Promise<void>((resolve) => {
      server.close(() => resolve());
      server.closeAllConnections();
    });
  if (control) await control.close();
  if (fixture) fixture.close();
});

test("configuration never falls back to the operating hotel's DATABASE_URL", () => {
  assert.throws(
    () =>
      readControlConfig({
        DATABASE_URL: "postgresql://never-read.invalid/operational",
      }),
    /XENIA_CONTROL_DATABASE_URL/,
  );
  const original = JSON.parse(fixture.env.XENIA_PROPERTY_DATABASES);
  assert.throws(
    () =>
      readControlConfig({
        ...fixture.env,
        XENIA_PROPERTY_DATABASES: JSON.stringify({
          ...original,
          other: original.aurora.replace("@", "-different-user@"),
        }),
      }),
    /distintas/,
  );
  assert.throws(
    () => readControlConfig({ ...fixture.env, NODE_ENV: "production" }),
    /demostración/,
  );
});
test("anonymous visitors cannot list properties or read reservations", async () => {
  const visitor = new Client();
  assert.equal((await visitor.request("/api/properties")).status, 401);
  assert.equal(
    (await visitor.request(`/api/properties/${aurora}/reservations`)).status,
    401,
  );
});
test("anonymous session checks in parallel tabs do not issue competing cookies", async () => {
  const checks = await Promise.all([
    new Client().request("/api/session"),
    new Client().request("/api/session"),
  ]);
  for (const result of checks) {
    assert.equal(result.data.user, null);
    assert.equal(result.data.csrfToken, null);
    assert.equal(result.headers.getSetCookie().length, 0);
  }
});
test("reception sees only its assigned property and responses contain no database locator", async () => {
  const result = await reception.request("/api/properties");
  assert.equal(result.status, 200);
  assert.deepEqual(
    result.data.map((p: any) => p.id),
    [aurora],
  );
  assert.doesNotMatch(
    JSON.stringify(result.data),
    /databaseKey|postgresql|database_key/,
  );
});
test("a group manager can switch between assigned hotels without platform administration rights", async () => {
  const manager = await new Client().demo("manager");
  const properties = await manager.request("/api/properties");
  assert.deepEqual(
    new Set(properties.data.map((property: any) => property.id)),
    new Set([aurora, brisa]),
  );
  assert.ok(
    properties.data.every((property: any) => property.role === "manager"),
  );
  assert.equal(
    (await manager.request(`/api/properties/${aurora}/reservations`)).status,
    200,
  );
  assert.equal(
    (await manager.request(`/api/properties/${brisa}/reservations`)).status,
    200,
  );
  assert.equal((await manager.request("/api/admin/users")).status, 403);
  assert.equal((await manager.request("/api/admin/organizations")).status, 403);
});
test("changing the URL cannot read, write or administer another property", async () => {
  for (const [path, method, body] of [
    [`/api/properties/${brisa}/reservations`, "GET", undefined],
    [`/api/properties/${brisa}/reservations`, "POST", stay("Acceso indebido")],
    [`/api/properties/${brisa}/reservations/${randomUUID()}`, "GET", undefined],
  ] as const) {
    const result = await reception.request(path, method, body);
    assert.equal(result.status, 404);
    assert.doesNotMatch(JSON.stringify(result.data), /Brisa|Huésped/);
  }
  assert.equal(
    (await reception.request("/api/admin/organizations")).status,
    403,
  );
  assert.equal(
    (await reception.request(`/api/properties/${brisa}/memberships`)).status,
    403,
  );
});
test("property selection is explicit per request and simultaneous hotel reads stay separated", async () => {
  const results = await Promise.all(
    Array.from({ length: 12 }, (_, index) =>
      owner.request(
        `/api/properties/${index % 2 ? brisa : aurora}/reservations`,
      ),
    ),
  );
  results.forEach((result, index) => {
    assert.equal(result.status, 200);
    assert.equal(
      result.data[0].guestName,
      index % 2 ? "Huésped de ejemplo Brisa" : "Huésped de ejemplo Aurora",
    );
  });
});
test("identical reservation IDs in two independent databases never select the other hotel's record", async () => {
  const id = randomUUID();
  const urls = JSON.parse(fixture.env.XENIA_PROPERTY_DATABASES);
  for (const key of ["aurora", "brisa"]) {
    const pool = new pg.Pool({ connectionString: urls[key] });
    try {
      await pool.query(
        "INSERT INTO xenia_property.reservations(id,guest_name,room,check_in,check_out) VALUES($1,$2,'999','2026-12-05','2026-12-06')",
        [id, "Registro " + key],
      );
    } finally {
      await pool.end();
    }
  }
  assert.equal(
    (await owner.request(`/api/properties/${aurora}/reservations/${id}`)).data
      .guestName,
    "Registro aurora",
  );
  assert.equal(
    (await owner.request(`/api/properties/${brisa}/reservations/${id}`)).data
      .guestName,
    "Registro brisa",
  );
  assert.equal(
    (await reception.request(`/api/properties/${brisa}/reservations/${id}`))
      .status,
    404,
  );
});
test("read-only users cannot create or cancel records", async () => {
  const rows = await viewer.request(`/api/properties/${brisa}/reservations`);
  assert.equal(rows.status, 200);
  assert.equal(
    (
      await viewer.request(
        `/api/properties/${brisa}/reservations`,
        "POST",
        stay(),
      )
    ).status,
    403,
  );
  assert.equal(
    (
      await viewer.request(
        `/api/properties/${brisa}/reservations/${rows.data[0].id}/cancel`,
        "POST",
        {},
      )
    ).status,
    403,
  );
});
test("reception writes affect only the authorized hotel's database", async () => {
  const result = await reception.request(
    `/api/properties/${aurora}/reservations`,
    "POST",
    stay("Sólo Aurora"),
  );
  assert.equal(result.status, 201);
  assert.equal(
    (
      await owner.request(
        `/api/properties/${brisa}/reservations/${result.data.id}`,
      )
    ).status,
    404,
  );
  assert.equal(
    (
      await reception.request(
        `/api/properties/${aurora}/reservations/${result.data.id}/cancel`,
        "POST",
        {},
      )
    ).data.status,
    "cancelled",
  );
});
test("CSRF and Origin protections reject forged mutations", async () => {
  assert.equal(
    (
      await owner.request(
        `/api/properties/${aurora}/reservations`,
        "POST",
        stay(),
        { "X-CSRF-Token": "" },
      )
    ).status,
    403,
  );
  assert.equal(
    (
      await owner.request(
        `/api/properties/${aurora}/reservations`,
        "POST",
        stay(),
        { Origin: "https://untrusted.invalid" },
      )
    ).status,
    403,
  );
  assert.equal(
    (
      await owner.request(
        `/api/properties/${aurora}/reservations`,
        "POST",
        stay(),
        { "X-CSRF-Token": "z".repeat(64) },
      )
    ).status,
    403,
  );
  const anonymous = new Client();
  assert.equal(
    (
      await anonymous.request(
        "/api/login",
        "POST",
        { username: "admin.demo", password: "not-a-password" },
        { Origin: "https://untrusted.invalid" },
      )
    ).status,
    403,
  );
  assert.equal(
    (
      await anonymous.request(
        "/api/login",
        "POST",
        { username: "admin.demo", password: "not-a-password" },
        { "Content-Type": "text/plain" },
      )
    ).status,
    403,
  );
});
test("forged privilege fields and database selection are rejected", async () => {
  const result = await owner.request("/api/admin/users", "POST", {
    username: "forged.user",
    name: "Prueba",
    password: "Password-example-123",
    propertyIds: [aurora],
    role: "reception",
    platformAdmin: true,
  });
  assert.equal(result.status, 400);
  assert.equal(
    (
      await reception.request(
        `/api/properties/${aurora}/reservations`,
        "POST",
        { ...stay(), databaseKey: "brisa" },
      )
    ).status,
    400,
  );
  assert.equal(
    (
      await reception.request(
        `/api/properties/${aurora}/reservations`,
        "POST",
        { ...stay(), checkIn: "2026-02-30" },
      )
    ).status,
    400,
  );
});
test("passwords beyond bcrypt's byte limit are rejected instead of silently truncated", async () => {
  for (const password of ["a".repeat(73), "á".repeat(37)]) {
    assert.equal(
      (
        await owner.request("/api/admin/users", "POST", {
          username: "long.password",
          name: "Prueba de contraseña",
          password,
          propertyIds: [aurora],
          role: "reception",
        })
      ).status,
      400,
    );
    assert.equal(await control.store.credentials("long.password"), undefined);
  }
});
test("membership revocation applies to an existing logged-in session", async () => {
  const users = (await owner.request("/api/admin/users")).data;
  const staff = users.find((user: any) => user.username === "recepcion.aurora");
  assert.equal(
    (
      await owner.request(
        `/api/properties/${aurora}/memberships/${staff.id}`,
        "DELETE",
      )
    ).status,
    200,
  );
  assert.equal(
    (await reception.request(`/api/properties/${aurora}/reservations`)).status,
    404,
  );
  assert.deepEqual((await reception.request("/api/properties")).data, []);
  assert.equal(
    (
      await owner.request(
        `/api/properties/${aurora}/memberships/${staff.id}`,
        "PUT",
        { role: "reception" },
      )
    ).status,
    200,
  );
});
test("disabling an account immediately invalidates its already-open session", async () => {
  const id = (await control.store.credentials("consulta.brisa"))!.id;
  await control.store.central.query(
    "UPDATE xenia_control.principals SET active=false WHERE id=$1",
    [id],
  );
  assert.equal(
    (await viewer.request(`/api/properties/${brisa}/reservations`)).status,
    401,
  );
  await control.store.central.query(
    "UPDATE xenia_control.principals SET active=true WHERE id=$1",
    [id],
  );
});
test("login rotates the session, verifies passwords, and logout invalidates the session", async () => {
  const password = randomBytes(20).toString("hex");
  assert.equal(
    (
      await owner.request("/api/admin/users", "POST", {
        username: "new.account",
        name: "Nueva cuenta",
        password,
        propertyIds: [aurora],
        role: "manager",
      })
    ).status,
    201,
  );
  const client = new Client();
  await client.request("/api/session");
  const anonymousCookie = client.cookie;
  assert.equal(
    (
      await client.request("/api/login", "POST", {
        username: "new.account",
        password: "Incorrect-password",
      })
    ).status,
    401,
  );
  const logged = await client.request("/api/login", "POST", {
    username: "new.account",
    password,
  });
  assert.equal(logged.status, 200);
  assert.notEqual(client.cookie, anonymousCookie);
  assert.equal(logged.data.user.platformAdmin, false);
  assert.equal(logged.data.user.passwordHash, undefined);
  await client.request("/api/logout", "POST", {});
  assert.equal((await client.request("/api/properties")).status, 401);
});
test("a swapped database secret is rejected by the property's binding marker", async () => {
  const urls = JSON.parse(fixture.env.XENIA_PROPERTY_DATABASES);
  const swapped = new ControlStore({
    ...config,
    propertyUrls: { ...urls, aurora: urls.brisa, brisa: urls.aurora },
  });
  try {
    const principal = (await swapped.credentials("admin.demo"))!;
    await assert.rejects(
      () => swapped.reservations(principal, aurora),
      /validar la instalación/,
    );
  } finally {
    await swapped.close();
  }
});
test("onboarding reserves a slot once, refuses existing data, and safely resumes preparation", async () => {
  const urls = JSON.parse(fixture.env.XENIA_PROPERTY_DATABASES);
  const extra = new pg.Pool({ connectionString: urls.extra });
  await extra.query(
    "CREATE TABLE public.existing_data(id integer PRIMARY KEY); INSERT INTO public.existing_data VALUES(1)",
  );
  const organization = (await owner.request("/api/admin/organizations")).data[0]
    .id;
  const results = await Promise.all(
    ["centro", "costanera"].map((slug) =>
      owner.request("/api/admin/properties", "POST", {
        organizationId: organization,
        name: slug,
        slug,
        modules: ["restaurant"],
      }),
    ),
  );
  assert.deepEqual(results.map((result) => result.status).sort(), [201, 409]);
  const property = results.find((result) => result.status === 201)!.data;
  assert.equal(property.status, "failed");
  assert.equal(
    (await extra.query("SELECT count(*) FROM public.existing_data")).rows[0]
      .count,
    "1",
  );
  assert.equal(
    (
      await extra.query(
        "SELECT to_regclass('xenia_property.identity') AS identity",
      )
    ).rows[0].identity,
    null,
  );
  await extra.query("DROP TABLE public.existing_data");
  await extra.end();
  const activated = await owner.request(
    `/api/admin/properties/${property.id}/activate`,
    "POST",
    {},
  );
  assert.equal(activated.data.status, "active");
  assert.equal(
    (await owner.request(`/api/properties/${property.id}/reservations`)).status,
    403,
  );
});

test("the first administrator is created once under concurrent setup and is never overwritten", async () => {
  // The named database is created only inside this suite's own disposable cluster.
  await control.store.central.query("CREATE DATABASE xenia_bootstrap_test");
  const bootstrapUrl = new URL(config.controlUrl);
  bootstrapUrl.pathname = "/xenia_bootstrap_test";
  const bootstrapConfig = {
    ...config,
    controlUrl: bootstrapUrl.toString(),
    demo: false,
  };
  const results = await Promise.all(
    ["first.admin", "second.admin"].map((username) =>
      setupControl(bootstrapConfig, {
        username,
        name: "Primera administración",
        password: randomBytes(20).toString("hex"),
      }),
    ),
  );
  assert.equal(results.filter((value) => !value.alreadyInitialized).length, 1);
  const database = new pg.Pool({
    connectionString: bootstrapConfig.controlUrl,
  });
  try {
    assert.equal(
      (
        await database.query(
          "SELECT count(*) FROM xenia_control.principals WHERE platform_admin=true",
        )
      ).rows[0].count,
      "1",
    );
  } finally {
    await database.end();
  }
  assert.equal((await setupControl(bootstrapConfig)).alreadyInitialized, true);
});

test("the persona shortcut is absent when demo mode is disabled", async () => {
  const normal = await createControlApp({ ...config, demo: false });
  const local = normal.app.listen(0, "127.0.0.1");
  await new Promise<void>((resolve) => local.once("listening", resolve));
  const address = `http://127.0.0.1:${(local.address() as AddressInfo).port}`;
  try {
    const response = await fetch(address + "/api/session");
    const initial = await response.json();
    assert.equal(initial.demo, false);
    const shortcut = await fetch(address + "/api/demo-login", {
      method: "POST",
      headers: { Origin: config.origin, "Content-Type": "application/json" },
      body: JSON.stringify({ persona: "owner" }),
    });
    assert.equal(shortcut.status, 404);
  } finally {
    await new Promise<void>((resolve) => {
      local.close(() => resolve());
      local.closeAllConnections();
    });
    await normal.close();
  }
});
