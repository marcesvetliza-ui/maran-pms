import { randomBytes, randomUUID } from "node:crypto";
import { pathToFileURL } from "node:url";
import bcrypt from "bcryptjs";
import { readControlConfig, type ControlConfig } from "./config";
import { ControlStore } from "./store";

export async function setupControl(
  config: ControlConfig,
  initial?: { username: string; name: string; password: string },
) {
  const store = new ControlStore(config);
  try {
    await store.initializeCentral();
    if (
      Number(
        (
          await store.central.query(
            "SELECT count(*) FROM xenia_control.principals",
          )
        ).rows[0].count,
      ) > 0
    )
      return { alreadyInitialized: true };
    if (
      !config.demo &&
      (!initial ||
        initial.password.length < 12 ||
        Buffer.byteLength(initial.password, "utf8") > 72 ||
        !/^[a-z0-9][a-z0-9._-]{2,59}$/.test(initial.username.toLowerCase()) ||
        initial.name.trim().length < 2 ||
        initial.name.length > 100)
    )
      throw new Error(
        "La primera administración requiere nombre, usuario válido y una contraseña de al menos 12 caracteres y hasta 72 bytes UTF-8.",
      );
    const id = randomUUID();
    const passwordHash = await bcrypt.hash(
      config.demo ? randomBytes(32).toString("hex") : initial!.password,
      12,
    );
    const bootstrap = await store.central.connect();
    try {
      await bootstrap.query("BEGIN");
      await bootstrap.query("SELECT pg_advisory_xact_lock(87934212)");
      if (
        Number(
          (
            await bootstrap.query(
              "SELECT count(*) FROM xenia_control.principals",
            )
          ).rows[0].count,
        ) > 0
      ) {
        await bootstrap.query("COMMIT");
        return { alreadyInitialized: true };
      }
      await bootstrap.query(
        "INSERT INTO xenia_control.principals(id,username,name,password_hash,platform_admin) VALUES($1,$2,$3,$4,true)",
        [
          id,
          config.demo ? "admin.demo" : initial!.username.toLowerCase(),
          config.demo ? "Administración de prueba" : initial!.name,
          passwordHash,
        ],
      );
      await bootstrap.query("COMMIT");
    } catch (error) {
      await bootstrap.query("ROLLBACK");
      throw error;
    } finally {
      bootstrap.release();
    }
    const admin = (await store.principal(id))!;
    if (!config.demo) return { alreadyInitialized: false };
    const organization = await store.createOrganization(
      admin,
      "Grupo de demostración",
    );
    const aurora = await store.createProperty(admin, {
      organizationId: organization.id,
      name: "Hotel Aurora",
      slug: "aurora-demo",
      modules: ["lodging", "restaurant", "groups"],
    });
    const brisa = await store.createProperty(admin, {
      organizationId: organization.id,
      name: "Apart Brisa",
      slug: "brisa-demo",
      modules: ["lodging", "spa", "events"],
    });
    if (aurora.status !== "active" || brisa.status !== "active")
      throw new Error(
        "No se pudieron preparar las dos instalaciones de demostración.",
      );
    await store.createUser(admin, {
      username: "recepcion.aurora",
      name: "Recepción Aurora",
      password: randomBytes(24).toString("hex"),
      propertyIds: [aurora.id],
      role: "reception",
    });
    await store.createUser(admin, {
      username: "responsable.demo",
      name: "Responsable del grupo",
      password: randomBytes(24).toString("hex"),
      propertyIds: [aurora.id, brisa.id],
      role: "manager",
    });
    await store.createUser(admin, {
      username: "consulta.brisa",
      name: "Consulta Brisa",
      password: randomBytes(24).toString("hex"),
      propertyIds: [brisa.id],
      role: "viewer",
    });
    // Deliberately similar records exercise context boundaries; all data is fictitious.
    await store.createReservation(admin, aurora.id, {
      guestName: "Huésped de ejemplo Aurora",
      room: "101",
      checkIn: "2026-12-01",
      checkOut: "2026-12-03",
    });
    await store.createReservation(admin, brisa.id, {
      guestName: "Huésped de ejemplo Brisa",
      room: "101",
      checkIn: "2026-12-01",
      checkOut: "2026-12-03",
    });
    return { alreadyInitialized: false, properties: [aurora.id, brisa.id] };
  } finally {
    await store.close();
  }
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  const result = await setupControl(
    readControlConfig(),
    process.env.XENIA_INITIAL_ADMIN_USERNAME &&
      process.env.XENIA_INITIAL_ADMIN_PASSWORD
      ? {
          username: process.env.XENIA_INITIAL_ADMIN_USERNAME,
          name:
            process.env.XENIA_INITIAL_ADMIN_NAME ?? "Administración de Xenia",
          password: process.env.XENIA_INITIAL_ADMIN_PASSWORD,
        }
      : undefined,
  );
  console.log(
    result.alreadyInitialized
      ? "Xenia ya estaba inicializado; se conservaron sus cuentas y datos."
      : "Xenia preparado. Las credenciales no se imprimen ni se guardan en archivos.",
  );
}
