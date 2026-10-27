import type { Express, Request } from "express";
import { randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import { z } from "zod";
import { db, withDatabaseTransaction } from "./db";
import { requireAuth, requirePermission } from "./auth";
import { hasPermission } from "./permissions";
import { getArgentinaToday } from "./db-storage";
import {
  birthdayEmailReadiness,
  sendBirthdayEmail,
  type BirthdayEmailResult,
} from "./email-service";
import {
  birthdayEmail,
  birthdayWhatsappNumber,
  defaultBirthdayTemplate,
  renderBirthdayMessage,
  unknownBirthdayVariables,
  type BirthdayTemplate,
  type BirthdayGuest,
  type BirthdayContact,
  type BirthdayPreview,
} from "@shared/hospitalitySpecialDates";
const resource = "api:hospitality:campaigns";
function fail(message: string, statusCode = 409): never {
  throw Object.assign(new Error(message), { statusCode });
}
const actor = (req: Request) => ({
  id: req.user!.id,
  name: req.user!.fullName || req.user!.username,
});
const lock = () =>
  db.execute(
    sql`SELECT pg_advisory_xact_lock(hashtext('hospitality-special-dates'))`,
  );
const yearNow = () => Number(getArgentinaToday().slice(0, 4));
const period = z.object({
  month: z.coerce.number().int().min(1).max(12),
  year: z.coerce
    .number()
    .int()
    .refine(
      (value) => value >= yearNow() - 1 && value <= yearNow() + 1,
      "Año inválido",
    ),
});
const templateSchema = z
  .object({
    subject: z
      .string()
      .trim()
      .min(1)
      .max(200)
      .refine((value) => !/[\r\n]/.test(value)),
    body: z.string().trim().min(1).max(6000),
    benefit: z.string().max(1000),
    terms: z.string().max(1500),
    signature: z.string().max(500),
  })
  .strict()
  .refine(
    (value) => !unknownBirthdayVariables(value).length,
    "Usá sólo las variables disponibles.",
  );
async function event(
  id: string,
  status: string,
  name: string,
  details: unknown = {},
) {
  await db.execute(
    sql`INSERT INTO hospitality_birthday_contact_events(id,contact_id,status,actor_name,details)VALUES(${randomUUID()},${id},${status},${name},${JSON.stringify(details)}::jsonb)`,
  );
}
async function audit(req: Request, action: string, details: unknown) {
  await db.execute(
    sql`INSERT INTO audit_logs(user_id,user_name,action,module,entity_type,description,details,timestamp)VALUES(${req.user!.id},${actor(req).name},${action},'hospitality','birthday_campaign','Fechas especiales',${JSON.stringify(details)},NOW())`,
  );
}
export async function birthdaySettings() {
  const row = (
    await db.execute(
      sql`SELECT template,version FROM hospitality_birthday_settings WHERE id=1`,
    )
  ).rows[0] as any;
  return row
    ? { template: row.template as BirthdayTemplate, version: row.version }
    : { template: defaultBirthdayTemplate, version: 0 };
}
export async function birthdayGuests(
  month: number,
  year: number,
  onlyGuestId?: string,
): Promise<BirthdayGuest[]> {
  const guestScope = onlyGuestId ? sql`AND g.id=${onlyGuestId}` : sql``;
  const rows = (
    await db.execute(sql`SELECT g.id,g.first_name,g.last_name,g.fecha_nacimiento,g.phone,g.email,
 COALESCE(e.blocked,false) AS own_exclusion,COALESCE(e.blocked,false) OR EXISTS(SELECT 1 FROM guests x JOIN hospitality_marketing_exclusions ex ON ex.guest_id=x.id AND ex.blocked=true WHERE NULLIF(lower(trim(x.email)),'')=NULLIF(lower(trim(g.email)),'')) AS excluded,COALESCE(e.reason,'') AS exclusion_reason
 FROM guests g LEFT JOIN hospitality_marketing_exclusions e ON e.guest_id=g.id
 WHERE EXTRACT(MONTH FROM g.fecha_nacimiento)=${month} AND COALESCE(g.tipo_persona,'fisica')<>'juridica' ${guestScope}
 ORDER BY EXTRACT(DAY FROM g.fecha_nacimiento),g.last_name,g.first_name,g.id`)
  ).rows as any[];
  if (!rows.length) return [];
  const ids = JSON.stringify(rows.map((row) => row.id));
  const emails = JSON.stringify([
    ...new Set(rows.map((row) => birthdayEmail(row.email)).filter(Boolean)),
  ]);
  const contacts = (
    await db.execute(sql`SELECT * FROM hospitality_birthday_contacts WHERE campaign_year=${year}
    AND (guest_id IN(SELECT jsonb_array_elements_text(${ids}::jsonb)) OR email_key IN(SELECT jsonb_array_elements_text(${emails}::jsonb)))
    ORDER BY created_at DESC`)
  ).rows as any[];
  const byGuest = new Map<string, any[]>(),
    emailOwner = new Map<string, string>();
  for (const contact of contacts) {
    const values = byGuest.get(contact.guest_id) || [];
    values.push(contact);
    byGuest.set(contact.guest_id, values);
    if (contact.email_key) emailOwner.set(contact.email_key, contact.guest_id);
  }
  const map = (row: any): BirthdayContact => ({
    id: row.id,
    guestId: row.guest_id,
    year: row.campaign_year,
    month: row.month,
    channel: row.channel,
    recipient: row.recipient,
    status: row.status,
    actorName: row.actor_name,
    createdAt: new Date(row.created_at).toISOString(),
    finishedAt: row.finished_at
      ? new Date(row.finished_at).toISOString()
      : null,
    error: row.error,
    subject: row.subject,
    body: row.body,
    attempts: row.attempts,
  });
  return rows.map((row) => {
    const email = birthdayEmail(row.email),
      mine = byGuest.get(row.id) || [];
    const blocked =
      mine.some((c) =>
        ["queued", "sending", "sent", "unknown", "contacted"].includes(
          c.status,
        ),
      ) ||
      (!!email && emailOwner.has(email) && emailOwner.get(email) !== row.id);
    return {
      id: row.id,
      firstName: row.first_name,
      lastName: row.last_name,
      birthday: row.fecha_nacimiento,
      phone: row.phone,
      email: row.email,
      validEmail: email,
      excluded: row.excluded,
      exclusionReason:
        row.excluded && !row.own_exclusion
          ? "Otro registro con este mismo correo no recibe promociones."
          : row.exclusion_reason,
      exclusionInherited: row.excluded && !row.own_exclusion,
      contacts: mine.map(map),
      emailAvailable: !!email && !row.excluded && !blocked,
    };
  });
}
function eligible(guest: BirthdayGuest | undefined) {
  if (!guest) return "El huésped ya no pertenece al mes seleccionado.";
  if (guest.excluded) return "No recibe promociones.";
  if (!guest.validEmail) return "Sin correo válido.";
  if (!guest.emailAvailable)
    return "Ya contactado, en proceso, pendiente de revisión o correo compartido con otro contacto.";
  return null;
}
export function registerHospitalitySpecialDates(app: Express) {
  const access = [
    requireAuth,
    requirePermission("sidebar:/hospitality"),
    requirePermission(resource),
  ];
  const route =
    (handler: (req: any, res: any) => Promise<any>) =>
    async (req: any, res: any) => {
      try {
        await handler(req, res);
      } catch (e: any) {
        res.status(e instanceof z.ZodError ? 400 : e.statusCode || 500).json({
          error:
            e instanceof z.ZodError
              ? "Revisá los datos y las variables del mensaje."
              : e.statusCode
                ? e.message
                : "No se pudo completar la operación de fechas especiales.",
        });
      }
    };
  app.get(
    "/api/hospitality/special-dates/settings",
    ...access,
    route(async (_req, res) => res.json(await birthdaySettings())),
  );
  app.put(
    "/api/hospitality/special-dates/settings",
    ...access,
    route(async (req, res) => {
      const body = z
        .object({
          template: templateSchema,
          version: z.number().int().nonnegative(),
        })
        .strict()
        .parse(req.body);
      await withDatabaseTransaction(async () => {
        await lock();
        const current = await birthdaySettings();
        if (current.version !== body.version)
          fail(
            "El mensaje fue modificado por otra persona. Recargá antes de guardar.",
          );
        await db.execute(
          sql`INSERT INTO hospitality_birthday_settings(id,template,version,updated_by)VALUES(1,${JSON.stringify(body.template)}::jsonb,1,${actor(req).name}) ON CONFLICT(id) DO UPDATE SET template=EXCLUDED.template,version=hospitality_birthday_settings.version+1,updated_by=EXCLUDED.updated_by,updated_at=NOW()`,
        );
        await audit(req, "birthday_template", {});
      });
      res.json(await birthdaySettings());
    }),
  );
  app.get(
    "/api/hospitality/special-dates",
    ...access,
    route(async (req, res) => {
      const p = period.parse(req.query);
      res.json({
        ...p,
        guests: await birthdayGuests(p.month, p.year),
        emailReady: await birthdayEmailReadiness(),
      });
    }),
  );
  app.put(
    "/api/hospitality/special-dates/guests/:id/exclusion",
    ...access,
    route(async (req, res) => {
      const body = z
        .object({
          blocked: z.boolean(),
          reason: z.string().trim().min(1).max(500),
        })
        .strict()
        .parse(req.body);
      await withDatabaseTransaction(async () => {
        await lock();
        if (
          !(
            await db.execute(
              sql`SELECT id FROM guests WHERE id=${req.params.id}`,
            )
          ).rows.length
        )
          fail("Huésped no encontrado.", 404);
        await db.execute(
          sql`INSERT INTO hospitality_marketing_exclusions(guest_id,blocked,reason,updated_by)VALUES(${req.params.id},${body.blocked},${body.reason},${actor(req).name}) ON CONFLICT(guest_id) DO UPDATE SET blocked=EXCLUDED.blocked,reason=EXCLUDED.reason,updated_by=EXCLUDED.updated_by,updated_at=NOW()`,
        );
        await audit(req, "birthday_exclusion", {
          guestId: req.params.id,
          ...body,
        });
      });
      res.json({ ok: true });
    }),
  );
  app.post(
    "/api/hospitality/special-dates/preview",
    ...access,
    route(async (req, res) => {
      const body = period
        .extend({ guestIds: z.array(z.string().min(1)).min(1).max(250) })
        .strict()
        .parse(req.body);
      const guests = await birthdayGuests(body.month, body.year),
        settings = await birthdaySettings();
      const messages: BirthdayPreview["messages"] = [],
        skipped: BirthdayPreview["skipped"] = [],
        emails = new Set<string>();
      for (const guestId of new Set(body.guestIds)) {
        const guest = guests.find((g) => g.id === guestId),
          reason = eligible(guest);
        if (reason || emails.has(guest!.validEmail!)) {
          skipped.push({
            guestId,
            name: guest ? `${guest.lastName} ${guest.firstName}` : guestId,
            reason: reason || "Correo repetido dentro de la selección.",
          });
          continue;
        }
        const message = renderBirthdayMessage(settings.template, guest!);
        if (message.subject.length > 200 || message.body.length > 10000) {
          skipped.push({
            guestId,
            name: `${guest!.lastName} ${guest!.firstName}`,
            reason:
              "El mensaje personalizado es demasiado largo. Acortá el asunto o el texto.",
          });
          continue;
        }
        emails.add(guest!.validEmail!);
        messages.push({
          guestId,
          name: `${guest!.lastName} ${guest!.firstName}`,
          birthday: guest!.birthday,
          recipient: guest!.validEmail!,
          ...message,
        });
      }
      const id = randomUUID();
      await db.execute(
        sql`INSERT INTO hospitality_birthday_drafts(id,campaign_year,month,created_by,messages)VALUES(${id},${body.year},${body.month},${actor(req).id},${JSON.stringify(messages)}::jsonb)`,
      );
      res.json({ id, year: body.year, month: body.month, messages, skipped });
    }),
  );
  app.post(
    "/api/hospitality/special-dates/drafts/:id/confirm",
    ...access,
    route(async (req, res) => {
      const readiness = await birthdayEmailReadiness();
      if (!readiness.ok) fail(readiness.reason || "Correo no disponible.", 400);
      const result = await withDatabaseTransaction(async () => {
        await lock();
        const draft = (
          await db.execute(
            sql`SELECT * FROM hospitality_birthday_drafts WHERE id=${req.params.id} FOR UPDATE`,
          )
        ).rows[0] as any;
        if (!draft || draft.created_by !== actor(req).id)
          fail("Vista previa no encontrada.", 404);
        if (draft.status === "confirmed")
          return { alreadyConfirmed: true, queued: 0, skipped: [] };
        if (new Date(draft.expires_at).getTime() < Date.now())
          fail("La vista previa venció. Prepará el envío nuevamente.");
        const current = await birthdayGuests(draft.month, draft.campaign_year),
          skipped: { guestId: string; reason: string }[] = [];
        let queued = 0;
        for (const message of draft.messages as BirthdayPreview["messages"]) {
          const guest = current.find((g) => g.id === message.guestId),
            reason = eligible(guest);
          if (
            reason ||
            guest!.validEmail !== message.recipient ||
            guest!.birthday !== message.birthday
          ) {
            skipped.push({
              guestId: message.guestId,
              reason:
                reason ||
                "Los datos del huésped cambiaron. Prepará otra vista previa.",
            });
            continue;
          }
          const previous = guest!.contacts.find((c) => c.channel === "email"),
            id = previous?.id || randomUUID();
          if (previous)
            await db.execute(
              sql`UPDATE hospitality_birthday_contacts SET status='queued',month=${draft.month},recipient=${message.recipient},email_key=${message.recipient},subject=${message.subject},body=${message.body},actor_id=${actor(req).id},actor_name=${actor(req).name},draft_id=${draft.id},error=NULL,finished_at=NULL WHERE id=${id}`,
            );
          else
            await db.execute(
              sql`INSERT INTO hospitality_birthday_contacts(id,guest_id,campaign_year,month,channel,recipient,email_key,status,subject,body,actor_id,actor_name,draft_id)VALUES(${id},${message.guestId},${draft.campaign_year},${draft.month},'email',${message.recipient},${message.recipient},'queued',${message.subject},${message.body},${actor(req).id},${actor(req).name},${draft.id})`,
            );
          await event(id, "queued", actor(req).name, {
            recipient: message.recipient,
            subject: message.subject,
            body: message.body,
          });
          queued++;
        }
        await db.execute(
          sql`UPDATE hospitality_birthday_drafts SET status='confirmed',confirmed_at=NOW() WHERE id=${draft.id}`,
        );
        await audit(req, "birthday_batch_confirmed", {
          draftId: draft.id,
          queued,
          skipped,
        });
        return { queued, skipped, alreadyConfirmed: false };
      });
      res.json(result);
    }),
  );
  app.post(
    "/api/hospitality/special-dates/whatsapp-contact",
    ...access,
    route(async (req, res) => {
      const body = period
        .extend({
          guestId: z.string().min(1),
          recipient: z.string().refine((v) => !!birthdayWhatsappNumber(v)),
          body: z.string().trim().min(1).max(10000),
        })
        .strict()
        .parse(req.body);
      await withDatabaseTransaction(async () => {
        await lock();
        const guest = (await birthdayGuests(body.month, body.year)).find(
          (g) => g.id === body.guestId,
        );
        if (!guest || guest.excluded)
          fail("El huésped no está disponible para esta comunicación.");
        if (
          guest.contacts.some((c) =>
            ["queued", "sending", "sent", "unknown", "contacted"].includes(
              c.status,
            ),
          )
        )
          fail(
            "Ya existe un contacto o un envío en proceso para este año. Revisá el historial.",
          );
        const id =
          guest.contacts.find((c) => c.channel === "whatsapp")?.id ||
          randomUUID();
        await db.execute(
          sql`INSERT INTO hospitality_birthday_contacts(id,guest_id,campaign_year,month,channel,recipient,status,body,actor_id,actor_name,finished_at)VALUES(${id},${guest.id},${body.year},${body.month},'whatsapp',${birthdayWhatsappNumber(body.recipient)},'contacted',${body.body},${actor(req).id},${actor(req).name},NOW()) ON CONFLICT(guest_id,campaign_year,channel) DO NOTHING`,
        );
        await event(id, "contacted", actor(req).name, {
          manualConfirmation: true,
          recipient: birthdayWhatsappNumber(body.recipient),
          body: body.body,
        });
      });
      res.json({ ok: true });
    }),
  );
  app.get(
    "/api/hospitality/special-dates/guests/:id/history",
    ...access,
    route(async (req, res) => {
      const rows = await db.execute(
        sql`SELECT c.campaign_year,c.channel,c.recipient,e.status,e.actor_name,e.details,e.created_at FROM hospitality_birthday_contacts c JOIN hospitality_birthday_contact_events e ON e.contact_id=c.id WHERE c.guest_id=${req.params.id} ORDER BY e.created_at DESC LIMIT 100`,
      );
      res.json(rows.rows);
    }),
  );
}

export async function processBirthdayEmailQueue(
  sender = sendBirthdayEmail,
): Promise<boolean> {
  const contact = await withDatabaseTransaction(async () => {
    await lock();
    const stale = (
      await db.execute(
        sql`UPDATE hospitality_birthday_contacts SET status='unknown',error='El proceso se interrumpió durante el envío. Revisá antes de reenviar.',finished_at=NOW() WHERE status='sending' AND sending_since<NOW()-INTERVAL '10 minutes' RETURNING id`,
      )
    ).rows as any[];
    for (const row of stale)
      await event(row.id, "unknown", "Sistema", { reason: "interrupted" });
    if (
      (
        await db.execute(
          sql`SELECT id FROM hospitality_birthday_contacts WHERE sending_since>NOW()-INTERVAL '1 second' LIMIT 1`,
        )
      ).rows.length
    )
      return null;
    const row = (
      await db.execute(
        sql`SELECT * FROM hospitality_birthday_contacts WHERE status='queued' ORDER BY created_at,id LIMIT 1 FOR UPDATE SKIP LOCKED`,
      )
    ).rows[0] as any;
    if (!row) return null;
    const guests = await birthdayGuests(
        row.month,
        row.campaign_year,
        row.guest_id,
      ),
      guest = guests.find((g) => g.id === row.guest_id);
    const user = (
      await db.execute(
        sql`SELECT role,is_active FROM system_users WHERE id=${row.actor_id}`,
      )
    ).rows[0] as any;
    const validActor =
      user?.is_active === "true" &&
      hasPermission(user.role, resource) &&
      hasPermission(user.role, "sidebar:/hospitality");
    const blocked =
      !guest ||
      guest.excluded ||
      guest.validEmail !== row.recipient ||
      guest.contacts.some(
        (c) =>
          c.id !== row.id &&
          ["contacted", "sent", "unknown", "sending"].includes(c.status),
      ) ||
      !validActor;
    if (blocked) {
      await db.execute(
        sql`UPDATE hospitality_birthday_contacts SET status='cancelled',error='Datos, preferencias o permisos cambiaron antes de enviar.',finished_at=NOW() WHERE id=${row.id}`,
      );
      await event(row.id, "cancelled", "Sistema");
      return null;
    }
    await db.execute(
      sql`UPDATE hospitality_birthday_contacts SET status='sending',attempts=attempts+1,sending_since=NOW() WHERE id=${row.id}`,
    );
    await event(row.id, "sending", "Sistema");
    return { ...row, attempts: row.attempts + 1 };
  });
  if (!contact) return false;
  let result: BirthdayEmailResult;
  try {
    result = await sender({
      to: contact.recipient,
      subject: contact.subject,
      body: contact.body,
      idempotencyKey: `birthday-${contact.id}-${contact.attempts}`,
    });
  } catch {
    result = {
      status: "unknown",
      error: "No se pudo confirmar el envío. Revisá antes de reenviar.",
    };
  }
  await withDatabaseTransaction(async () => {
    const changed = await db.execute(
      sql`UPDATE hospitality_birthday_contacts SET status=${result.status},error=${result.error || null},provider_id=${result.providerId || null},finished_at=NOW() WHERE id=${contact.id} AND status='sending' AND attempts=${contact.attempts} RETURNING id`,
    );
    if (changed.rows.length)
      await event(contact.id, result.status, "Sistema", {
        error: result.error || null,
        providerId: result.providerId || null,
      });
  });
  return true;
}
export function setupBirthdayEmailQueue() {
  let running = false;
  const tick = async () => {
    if (running) return;
    running = true;
    try {
      await processBirthdayEmailQueue();
    } catch {
      console.error("[hospitality] No se pudo procesar la cola de cumpleaños.");
    } finally {
      running = false;
    }
  };
  const timer = setInterval(() => void tick(), 1100);
  timer.unref();
  void tick();
  return () => clearInterval(timer);
}
