import { getBillingConfig } from "./billing/billingConfig";
import { resolveBillingPoint } from "@shared/billing-point-of-sale";
import { addCalendarDays } from "@shared/nightAuditDate";
import { createHash, randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import { db, withDatabaseTransaction } from "./db";
import { storage, getArgentinaToday } from "./db-storage";
import { emitirFactura } from "./billing/invoiceService";
import {
  cents,
  money,
  type RestaurantEventInput,
  type EventBookingInput,
  type EventAdvanceInput,
  type EventAssignmentInput,
} from "@shared/restaurant-events";
type Row = Record<string, any>;
const rows = async (query: any) => (await db.execute(query)).rows as Row[];
function fail(message: string, statusCode = 409): never {
  throw Object.assign(new Error(message), { statusCode });
}
const hash = (value: unknown) =>
  createHash("sha256").update(JSON.stringify(value)).digest("hex");
async function audit(
  actor: string,
  action: string,
  id: string,
  details: unknown,
) {
  await storage.createAuditLog({
    userId: actor,
    action: "update",
    module: "restaurant",
    entityType: "restaurant_event",
    entityId: id,
    description: "Evento restaurant · " + action,
    details: JSON.stringify(details),
    timestamp: new Date(),
  });
}
async function mutate<T>(
  operationId: string,
  kind: string,
  input: unknown,
  actor: string,
  action: () => Promise<T>,
  inventory = false,
): Promise<T> {
  return withDatabaseTransaction(async () => {
    await db.execute(
      sql`SELECT pg_advisory_xact_lock(hashtext(${inventory ? "restaurant-event-inventory" : "restaurant-event-operation:" + operationId}))`,
    );
    const old = (
      await rows(
        sql`SELECT * FROM restaurant_event_operations WHERE id=${operationId}::uuid`,
      )
    )[0];
    const requestHash = hash({ actor, kind, input });
    if (old) {
      if (old.kind !== kind || old.request_hash !== requestHash)
        fail("El intento ya se usó con otros datos.");
      return old.result as T;
    }
    const result = await action();
    await db.execute(
      sql`INSERT INTO restaurant_event_operations(id,kind,request_hash,result) VALUES(${operationId}::uuid,${kind},${requestHash},${JSON.stringify(result)}::jsonb)`,
    );
    await audit(actor, kind, operationId, input);
    return result;
  });
}
export async function listRestaurantEvents() {
  return rows(sql`SELECT e.id,e.name,e.start_date::text AS date,e.start_time AS time,e.end_time AS "endTime",e.end_date::text AS "endDate",e.status,re.*,ra.name AS "areaName",
 (SELECT count(*)::int FROM restaurant_event_bookings b JOIN table_reservations r ON r.id=b.reservation_id WHERE b.event_id=e.id AND r.status NOT IN ('cancelled','no_show')) AS "bookingCount",
 COALESCE((SELECT sum(b.adults+b.children)::int FROM restaurant_event_bookings b JOIN table_reservations r ON r.id=b.reservation_id WHERE b.event_id=e.id AND r.status NOT IN ('cancelled','no_show')),0) AS persons
 FROM restaurant_events re JOIN events e ON e.id=re.event_id JOIN restaurant_areas ra ON ra.id=re.area_id ORDER BY e.start_date,e.start_time,e.name`);
}
export async function restaurantEventDetail(id: string) {
  const event = (await listRestaurantEvents()).find((e) => e.id === id);
  if (!event) fail("No se encontró el evento.", 404);
  const bookings =
    await rows(sql`SELECT b.*,r.guest_name AS "guestName",r.guest_phone AS phone,r.guest_email AS email,r.notes,r.status,s.order_id AS "orderId",ro.status AS "orderStatus",s.gross_total AS "serviceTotal",s.advance_applied AS "advanceApplied",ro.total AS "orderTotal",fd.document_status AS "finalDocumentStatus",fd.invoice_id AS "finalInvoiceId",
 COALESCE((SELECT jsonb_agg(jsonb_build_object('id',t.id,'number',t.table_number,'capacity',t.capacity) ORDER BY t.table_number) FROM restaurant_event_assignments a JOIN restaurant_tables t ON t.id=a.table_id WHERE a.reservation_id=b.reservation_id),'[]'::jsonb) AS tables,
 COALESCE((SELECT sum(amount) FROM restaurant_reservation_advances a WHERE a.reservation_id=b.reservation_id),0)::text AS advances,
 COALESCE((SELECT jsonb_agg(jsonb_build_object('id',a.id,'amount',a.amount,'method',a.payment_method,'date',a.created_at,'invoiceId',c.invoice_id,'documentStatus',c.document_status,'receipt',a.voucher_number) ORDER BY a.created_at) FROM restaurant_reservation_advances a LEFT JOIN restaurant_event_collections c ON c.advance_id=a.id WHERE a.reservation_id=b.reservation_id),'[]'::jsonb) AS payments
 FROM restaurant_event_bookings b JOIN table_reservations r ON r.id=b.reservation_id LEFT JOIN restaurant_event_services s ON s.reservation_id=b.reservation_id LEFT JOIN restaurant_orders ro ON ro.id=s.order_id LEFT JOIN restaurant_event_final_documents fd ON fd.order_id=s.order_id WHERE b.event_id=${id} ORDER BY r.created_at,b.reservation_id`);
  return {
    event,
    bookings,
    tables: await rows(
      sql`SELECT id,table_number AS number,capacity,status FROM restaurant_tables WHERE area_id=${event.area_id} AND is_active='true' ORDER BY table_number`,
    ),
  };
}
export async function createRestaurantEvent(
  input: RestaurantEventInput,
  actor: string,
) {
  return mutate(
    input.operationId,
    "create-event",
    input,
    actor,
    async () => {
      if (input.date < getArgentinaToday())
        fail("Elegí hoy o una fecha futura.");
      const area = await storage.getRestaurantArea(input.areaId);
      if (!area || area.isActive !== "true") fail("Elegí un salón activo.");
      if (input.capacity > area.capacity)
        fail("El cupo supera la capacidad configurada del salón.");
      for (const line of input.menu) {
        const item = await storage.getMenuItem(line.menuItemId);
        if (!item || item.isActive === "false" || item.isAvailable === "false")
          fail("Hay productos del menú que ya no están disponibles.");
      }
      const roomId = "restaurant-event-area-" + area.id;
      await db.execute(
        sql`INSERT INTO event_rooms(id,name,capacity,status,is_active) VALUES(${roomId},${area.name},${area.capacity},'available','true') ON CONFLICT(id) DO NOTHING`,
      );
      const event = await storage.createEvent({
        eventCode: "ER-" + input.operationId.slice(0, 8).toUpperCase(),
        name: input.name,
        eventRoomId: roomId,
        eventType: "table_event",
        contactName: "Restaurant",
        startDate: input.date,
        endDate:
          input.endTime < input.time
            ? addCalendarDays(input.date, 1)
            : input.date,
        startTime: input.time,
        endTime: input.endTime,
        attendees: input.capacity,
        status: "confirmed",
        notes: input.description,
        createdAt: new Date(),
      });
      await db.execute(
        sql`INSERT INTO restaurant_events(event_id,area_id,adult_price,child_price,includes,menu,capacity) VALUES(${event.id},${area.id},${input.adultPrice},${input.childPrice},${input.description},${JSON.stringify(input.menu)}::jsonb,${input.capacity})`,
      );
      return { id: event.id };
    },
    true,
  );
}
export async function updateRestaurantEvent(
  id: string,
  input: RestaurantEventInput,
  actor: string,
) {
  return mutate(
    input.operationId,
    "update-event",
    { id, ...input },
    actor,
    async () => {
      const event = (await listRestaurantEvents()).find((e) => e.id === id);
      if (!event) fail("No se encontró el evento.", 404);
      const existing = await rows(
        sql`SELECT 1 FROM restaurant_event_bookings WHERE event_id=${id} LIMIT 1`,
      );
      if (
        existing.length &&
        (input.date !== event.date ||
          input.time !== event.time ||
          input.endTime !== event.endTime ||
          input.areaId !== event.area_id)
      )
        fail(
          "El evento ya tiene reservas. Conservamos su fecha, horario y salón.",
        );
      const area = await storage.getRestaurantArea(input.areaId);
      if (
        !area ||
        area.isActive !== "true" ||
        input.capacity > area.capacity ||
        input.capacity < event.persons
      )
        fail("Revisá el cupo y la capacidad del salón.");
      for (const line of input.menu) {
        const item = await storage.getMenuItem(line.menuItemId);
        if (!item || item.isActive === "false" || item.isAvailable === "false")
          fail("Hay productos del menú que no están disponibles.");
      }
      const roomId = "restaurant-event-area-" + area.id;
      await db.execute(
        sql`INSERT INTO event_rooms(id,name,capacity,status,is_active) VALUES(${roomId},${area.name},${area.capacity},'available','true') ON CONFLICT(id) DO NOTHING`,
      );
      await storage.updateEvent(id, {
        name: input.name,
        eventRoomId: roomId,
        startDate: input.date,
        endDate:
          input.endTime < input.time
            ? addCalendarDays(input.date, 1)
            : input.date,
        startTime: input.time,
        endTime: input.endTime,
        attendees: input.capacity,
        notes: input.description,
      });
      await db.execute(
        sql`UPDATE restaurant_events SET area_id=${area.id},adult_price=${input.adultPrice},child_price=${input.childPrice},includes=${input.description},menu=${JSON.stringify(input.menu)}::jsonb,capacity=${input.capacity} WHERE event_id=${id}`,
      );
      return { id };
    },
    true,
  );
}
async function booking(id: string, lock = false) {
  if (lock)
    await db.execute(
      sql`SELECT reservation_id FROM restaurant_event_bookings WHERE reservation_id=${id} FOR UPDATE`,
    );
  const b = (
    await rows(
      sql`SELECT b.*,r.guest_name,r.guest_phone,r.notes,r.status,e.start_date::text AS date,e.start_time,e.end_time,e.end_date::text AS "endDate",e.name,e.status AS event_status,re.area_id,re.capacity FROM restaurant_event_bookings b JOIN table_reservations r ON r.id=b.reservation_id JOIN events e ON e.id=b.event_id JOIN restaurant_events re ON re.event_id=e.id WHERE b.reservation_id=${id}`,
    )
  )[0];
  if (!b) fail("No se encontró la reserva del evento.", 404);
  return b;
}
export async function createRestaurantEventBooking(
  eventId: string,
  input: EventBookingInput,
  actor: string,
) {
  return mutate(
    input.operationId,
    "create-booking",
    { eventId, ...input },
    actor,
    async () => {
      const event = (await listRestaurantEvents()).find(
        (e) => e.id === eventId,
      );
      if (!event) fail("No se encontró el evento.", 404);
      if (event.date < getArgentinaToday() || event.status !== "confirmed")
        fail("El evento está cerrado a nuevas reservas.");
      if (event.persons + input.adults + input.children > event.capacity)
        fail("La reserva supera los lugares disponibles del evento.");
      for (const audience of ["adult", "child"])
        if (
          (audience === "adult" ? input.adults : input.children) > 0 &&
          !event.menu.some(
            (l: Row) => l.audience === "all" || l.audience === audience,
          )
        )
          fail("Falta configurar el menú para esos comensales.");
      const r = await storage.createTableReservation({
        guestName: input.guestName,
        guestPhone: input.guestPhone,
        guestEmail: input.guestEmail || null,
        tableId: null,
        areaId: event.area_id,
        partySize: input.adults + input.children,
        reservationDate: event.date,
        reservationTime: event.time,
        status: "confirmed",
        notes: input.notes,
        createdAt: new Date(),
      });
      const total =
        cents(event.adult_price) * input.adults +
        cents(event.child_price) * input.children;
      if (total > 9999999999)
        fail(
          "El total supera el importe admitido para una cuenta de Restaurant.",
        );
      await db.execute(
        sql`INSERT INTO restaurant_event_bookings(reservation_id,event_id,adults,children,adult_price,child_price,contracted_total,menu,includes) VALUES(${r.id},${eventId},${input.adults},${input.children},${event.adult_price},${event.child_price},${money(total)},${JSON.stringify(event.menu)}::jsonb,${event.includes})`,
      );
      return { id: r.id };
    },
    true,
  );
}
async function assertTables(b: Row, tableIds: string[], starting = false) {
  let capacity = 0;
  for (const id of [...tableIds].sort()) {
    const t = (
      await rows(sql`SELECT * FROM restaurant_tables WHERE id=${id} FOR UPDATE`)
    )[0];
    if (!t || t.is_active !== "true" || t.area_id !== b.area_id)
      fail("Elegí mesas activas del salón del evento.");
    capacity += t.capacity;
    const conflicts =
      await rows(sql`SELECT 1 FROM restaurant_event_assignments a JOIN restaurant_event_bookings ob ON ob.reservation_id=a.reservation_id JOIN table_reservations r ON r.id=a.reservation_id JOIN events e ON e.id=ob.event_id WHERE a.table_id=${id} AND a.reservation_id<>${b.reservation_id} AND r.status NOT IN ('cancelled','no_show','completed','historical') AND e.status<>'cancelled' AND (e.start_date+e.start_time::time)<(${b.endDate}::date+${b.end_time}::time) AND (e.end_date+e.end_time::time)>(${b.date}::date+${b.start_time}::time)
   UNION ALL SELECT 1 FROM table_reservations r WHERE r.table_id=${id} AND r.id<>${b.reservation_id} AND r.reservation_date=${b.date}::date AND r.status NOT IN ('cancelled','no_show','completed','historical') AND NOT EXISTS(SELECT 1 FROM restaurant_event_bookings eb WHERE eb.reservation_id=r.id)`);
    if (conflicts.length)
      fail("Una de las mesas ya está asignada a otra reserva en esa fecha.");
    if (starting) {
      const active = await rows(
        sql`SELECT id FROM restaurant_orders WHERE table_id=${id} AND status NOT IN ('closed','cancelled')`,
      );
      const linked = await rows(
        sql`SELECT s.order_id FROM restaurant_event_services s JOIN restaurant_event_assignments a ON a.reservation_id=s.reservation_id JOIN restaurant_orders o ON o.id=s.order_id WHERE a.table_id=${id} AND o.status NOT IN ('closed','cancelled')`,
      );
      if (active.length || linked.length || t.status === "occupied")
        fail("Una de las mesas está atendiendo otra cuenta.");
    }
  }
  if (tableIds.length && capacity < b.adults + b.children)
    fail("La capacidad de las mesas no alcanza para los comensales.");
}
export async function assignRestaurantEventTables(
  id: string,
  input: EventAssignmentInput,
  actor: string,
) {
  return mutate(
    input.operationId,
    "assign-tables",
    { id, ...input },
    actor,
    async () => {
      const b = await booking(id, true);
      if (b.status !== "confirmed" || b.event_status === "cancelled")
        fail("La asignación se modifica antes de iniciar el servicio.");
      await assertTables(b, input.tableIds);
      await db.execute(
        sql`DELETE FROM restaurant_event_assignments WHERE reservation_id=${id}`,
      );
      for (const tableId of input.tableIds)
        await db.execute(
          sql`INSERT INTO restaurant_event_assignments(reservation_id,table_id) VALUES(${id},${tableId})`,
        );
      return { id, tableIds: input.tableIds };
    },
    true,
  );
}
export async function collectRestaurantEventAdvance(
  id: string,
  input: EventAdvanceInput,
  actor: string,
) {
  return mutate(
    input.operationId,
    "collect-advance",
    { id, ...input },
    actor,
    async () => {
      const b = await booking(id, true);
      if (b.status !== "confirmed" || b.event_status === "cancelled")
        fail("Los anticipos se registran antes de iniciar el servicio.");
      const paid = (
        await rows(
          sql`SELECT COALESCE(sum(amount),0)::text AS total FROM restaurant_reservation_advances WHERE reservation_id=${id}`,
        )
      )[0];
      if (cents(paid.total) + cents(input.amount) > cents(b.contracted_total))
        fail("El anticipo supera el saldo pendiente de la reserva.");
      const config = await getBillingConfig();
      const points = await rows(
        sql`SELECT id,numero,nombre,area,tipo,activo FROM pos_configs WHERE activo=true ORDER BY id`,
      );
      const preferred = points.find(
        (p) =>
          p.area === "restaurant" &&
          (input.receiptType === "ticket" || p.tipo !== "manual"),
      )?.numero;
      const resolved = resolveBillingPoint(config, points as any, preferred);
      if (input.receiptType === "FB" && resolved.error) fail(resolved.error);
      const pos = {
        numero:
          input.receiptType === "FB"
            ? resolved.point
            : preferred || resolved.point,
      };
      if (!pos.numero)
        fail("Configurá un punto de venta activo de Restaurant.");
      const adv = await storage.createReservationAdvance({
        reservationId: id,
        amount: input.amount,
        paymentMethod: input.method,
        voucherNumber: "ER-" + input.operationId.slice(0, 8).toUpperCase(),
        notes: input.notes,
        appliedToOrderId: null,
        invoiceId: null,
      });
      const cash = await storage.registerCashMovement(
        "restaurant",
        "restaurant_event_advance",
        adv.id,
        `Anticipo · ${b.name} · ${b.guest_name}`,
        input.method,
        input.amount,
        "income",
        actor,
        input.receiptType === "FB" ? "factura_b" : "ticket",
        adv.id,
      );
      const gross = cents(input.amount) / 100,
        net = Number((gross / 1.21).toFixed(4));
      const request = {
        expectedFiscalIdentity: {
          environment: config.arcaAmbiente ?? "ficticio",
          issuer: String(config.arcaCuit ?? config.cuit).replace(/\D/g, ""),
          pointOfSale: Number(pos.numero),
        },
        operationId: input.operationId,
        tipoComprobante: input.receiptType,
        cliente: {
          razonSocial: b.guest_name,
          dni: input.dni || undefined,
          condicionIva: "consumidor_final",
        },
        items: [
          {
            descripcion: `Anticipo ${b.name} · ${b.guest_name} · ${adv.voucherNumber}`,
            cantidad: 1,
            precioUnitario: net,
            alicuotaIva: "21",
            subtotalNeto: net,
            subtotal: gross,
          },
        ],
        operador: actor,
        puntoVentaOverride: pos.numero,
        cashFormaPago: input.method,
      };
      await db.execute(
        sql`INSERT INTO restaurant_event_collections(advance_id,cash_movement_id,operation_id,invoice_request) VALUES(${adv.id},${cash.id},${input.operationId}::uuid,${JSON.stringify(request)}::jsonb)`,
      );
      return { id: adv.id, amount: input.amount };
    },
  );
}
/** Fiscal emissions use their durable journal outside cash locks; local tickets commit with their link. */
export async function completeEventAdvanceDocument(advanceId: string) {
  const read = async () =>
    (
      await rows(
        sql`SELECT c.* FROM restaurant_event_collections c WHERE c.advance_id=${advanceId}`,
      )
    )[0];
  const row = await read();
  if (!row) fail("No se encontró el anticipo.", 404);
  if (row.document_status === "completed")
    return { documentStatus: "completed", invoiceId: row.invoice_id };
  const emit = async () =>
    emitirFactura({
      ...row.invoice_request,
      requestSnapshot: row.invoice_request,
    });
  const finalize = async (invoiceId: number) => {
    const proof =
      await rows(sql`SELECT si.id FROM sales_invoices si JOIN restaurant_reservation_advances a ON a.id=${advanceId} JOIN restaurant_event_collections c ON c.advance_id=a.id JOIN cash_movements cm ON cm.id=c.cash_movement_id
   WHERE si.id=${invoiceId} AND si.estado='emitida' AND (si.tipo_comprobante='ticket' OR si.modo_ficticio=true OR si.cae ~ '^[0-9]{14}$')
   AND si.monto_total=a.amount AND cm.amount=a.amount AND cm.source_id=a.id AND cm.source_type='restaurant_event_advance' AND cm.area='restaurant' AND cm.anulado=false AND cm.payment_method=a.payment_method`);
    if (!proof.length)
      fail(
        "El comprobante y el cobro requieren revisión. Conservamos la operación original.",
      );
    await db.execute(
      sql`UPDATE restaurant_event_collections SET invoice_id=${invoiceId},document_status='completed' WHERE advance_id=${advanceId}`,
    );
    await db.execute(
      sql`UPDATE restaurant_reservation_advances SET invoice_id=${invoiceId} WHERE id=${advanceId}`,
    );
    await db.execute(
      sql`UPDATE sales_invoices SET reconciliation_status='conciliada',reconciliation_error=NULL,reconciliation_updated_at=now() WHERE id=${invoiceId}`,
    );
    return { documentStatus: "completed", invoiceId };
  };
  try {
    const config = await getBillingConfig();
    if (
      row.invoice_request.tipoComprobante === "ticket" ||
      config.arcaAmbiente === "ficticio"
    )
      return await withDatabaseTransaction(async () => {
        await db.execute(sql`SELECT id FROM billing_config FOR SHARE`);
        if (
          row.invoice_request.tipoComprobante !== "ticket" &&
          (await getBillingConfig()).arcaAmbiente !== "ficticio"
        )
          fail(
            "La configuración fiscal cambió. Reintentá el mismo comprobante.",
          );
        await db.execute(
          sql`SELECT advance_id FROM restaurant_event_collections WHERE advance_id=${advanceId} FOR UPDATE`,
        );
        const current = await read();
        if (current.document_status === "completed")
          return { documentStatus: "completed", invoiceId: current.invoice_id };
        return finalize((await emit()).id);
      });
    const invoice = await emit();
    return await withDatabaseTransaction(async () => {
      await db.execute(
        sql`SELECT advance_id FROM restaurant_event_collections WHERE advance_id=${advanceId} FOR UPDATE`,
      );
      const journal = await rows(
        sql`SELECT 1 FROM billing_operations WHERE operation_id=${String(row.operation_id)} AND invoice_id=${invoice.id} AND stage='authorized'`,
      );
      if (!journal.length) fail("Falta confirmar el comprobante original.");
      return finalize(invoice.id);
    });
  } catch {
    return {
      documentStatus: "pending",
      message:
        "El anticipo quedó cobrado. Falta completar su comprobante; reintentá desde esta reserva.",
    };
  }
}
export async function startRestaurantEventService(
  id: string,
  operationId: string,
  actor: string,
) {
  return mutate(
    operationId,
    "start-service",
    { id },
    actor,
    async () => {
      const b = await booking(id, true),
        prior = (
          await rows(
            sql`SELECT order_id FROM restaurant_event_services WHERE reservation_id=${id}`,
          )
        )[0];
      if (prior) return { orderId: prior.order_id };
      if (
        b.status !== "confirmed" ||
        b.event_status === "cancelled" ||
        getArgentinaToday() < b.date ||
        getArgentinaToday() > b.endDate
      )
        fail(
          "El servicio se inicia el día del evento con una reserva confirmada.",
        );
      const assigned = await rows(
        sql`SELECT a.table_id,t.table_number FROM restaurant_event_assignments a JOIN restaurant_tables t ON t.id=a.table_id WHERE a.reservation_id=${id} ORDER BY t.table_number`,
      );
      if (!assigned.length) fail("Asigná al menos una mesa antes de iniciar.");
      await assertTables(
        b,
        assigned.map((t) => t.table_id),
        true,
      );
      const pending = await rows(
        sql`SELECT 1 FROM restaurant_event_collections c JOIN restaurant_reservation_advances a ON a.id=c.advance_id WHERE a.reservation_id=${id} AND c.document_status<>'completed'`,
      );
      if (pending.length)
        fail(
          "Completá los comprobantes pendientes de esta reserva antes de aplicar sus anticipos.",
        );
      const physical: Array<{
        menuItemId: string;
        quantity: number;
        total: number;
        audience: string;
      }> = [];
      for (const group of [
        { audience: "adult", count: b.adults, price: b.adult_price },
        { audience: "child", count: b.children, price: b.child_price },
      ]) {
        if (!group.count) continue;
        let first = true;
        for (const line of b.menu.filter(
          (l: Row) => l.audience === "all" || l.audience === group.audience,
        )) {
          const item = await storage.getMenuItem(line.menuItemId);
          if (
            !item ||
            item.isActive === "false" ||
            item.isAvailable === "false"
          )
            fail(
              "Un producto del menú ya no está disponible. Revisá el menú antes de iniciar.",
            );
          physical.push({
            menuItemId: item.id,
            quantity: first ? group.count : group.count * line.quantity,
            total: first ? cents(group.price) * group.count : 0,
            audience: group.audience,
          });
          if (first && line.quantity > 1)
            physical.push({
              menuItemId: item.id,
              quantity: group.count * (line.quantity - 1),
              total: 0,
              audience: group.audience,
            });
          first = false;
        }
      }
      if (!physical.length)
        fail("El menú no tiene productos para estos comensales.");
      const o = await storage.createRestaurantOrder({
        orderNumber: storage.generateOrderNumber(),
        tableId: assigned[0].table_id,
        areaId: b.area_id,
        covers: b.adults + b.children,
        waiterName: "",
        orderLabel: `${b.name} · ${b.guest_name} · Mesas ${assigned.map((t) => t.table_number).join(" + ")}`,
        status: "open",
        total: b.contracted_total,
        subtotal: money(Math.round(cents(b.contracted_total) / 1.21)),
        tax: money(
          cents(b.contracted_total) -
            Math.round(cents(b.contracted_total) / 1.21),
        ),
        notes: [b.includes, b.notes && "Reserva: " + b.notes]
          .filter(Boolean)
          .join("\n"),
        openedAt: new Date(),
      });
      await db.execute(
        sql`INSERT INTO restaurant_event_services(order_id,reservation_id) VALUES(${o.id},${id})`,
      );
      const includedIds: string[] = [];
      for (const line of physical) {
        const total = line.total,
          unit = Math.floor(total / line.quantity),
          remainder = total - unit * line.quantity;
        for (const part of [
          { quantity: line.quantity - remainder, price: unit },
          { quantity: remainder, price: unit + 1 },
        ])
          if (part.quantity) {
            const item = await storage.createOrderItem({
              orderId: o.id,
              menuItemId: line.menuItemId,
              quantity: part.quantity,
              unitPrice: money(part.price),
              subtotal: money(part.quantity * part.price),
              status: "pending",
              notes:
                (line.total > 0
                  ? `[Menú ${line.audience === "adult" ? "adultos" : "niños"} · ${b.name}] ${b.guest_name}`
                  : "Incluido en menú · " + b.name) +
                (b.notes ? " · " + b.notes : ""),
            });
            includedIds.push(item.id);
          }
      }
      await db.execute(
        sql`UPDATE restaurant_event_services SET included_item_ids=${JSON.stringify(includedIds)}::jsonb WHERE order_id=${o.id}`,
      );
      for (const table of assigned)
        await storage.updateRestaurantTable(table.table_id, {
          status: "occupied",
        });
      await storage.updateTableReservation(id, { status: "check_in" });
      return { orderId: o.id };
    },
    true,
  );
}
export async function restaurantEventOrderContext(
  orderId: string,
): Promise<(Row & { availableCredit: string; payments: Row[] }) | null> {
  const s = (
    await rows(
      sql`SELECT s.*,ro.status AS "orderStatus",r.guest_name AS "guestName",e.name AS "eventName",b.includes FROM restaurant_event_services s JOIN restaurant_orders ro ON ro.id=s.order_id JOIN restaurant_event_bookings b ON b.reservation_id=s.reservation_id JOIN table_reservations r ON r.id=b.reservation_id JOIN events e ON e.id=b.event_id WHERE s.order_id=${orderId}`,
    )
  )[0];
  if (!s) return null;
  const payments = await rows(
    sql`SELECT a.id,a.amount,COALESCE((SELECT sum(ap.amount) FROM restaurant_event_advance_applications ap WHERE ap.advance_id=a.id),0)::text AS applied FROM restaurant_reservation_advances a WHERE a.reservation_id=${s.reservation_id} ORDER BY a.created_at,a.id`,
  );
  return {
    ...s,
    availableCredit: money(
      payments.reduce((sum, a) => sum + cents(a.amount) - cents(a.applied), 0),
    ),
    payments,
  };
}
export async function applyRestaurantEventCredit(
  orderId: string,
  credit: string,
  gross: string,
  actor: string,
) {
  const context = await restaurantEventOrderContext(orderId);
  if (!context) return false;
  await booking(context.reservation_id, true);
  const current = await restaurantEventOrderContext(orderId);
  if (!current || cents(credit) > cents(current.availableCredit))
    fail("El saldo de anticipos cambió. Actualizá la cuenta.");
  let remaining = cents(credit);
  for (const a of current.payments) {
    const applied = Math.min(remaining, cents(a.amount) - cents(a.applied));
    if (applied <= 0) continue;
    await db.execute(
      sql`INSERT INTO restaurant_event_advance_applications(advance_id,order_id,amount) VALUES(${a.id},${orderId},${money(applied)})`,
    );
    remaining -= applied;
  }
  await db.execute(
    sql`UPDATE restaurant_event_services SET gross_total=${gross},advance_applied=${credit} WHERE order_id=${orderId}`,
  );
  if (cents(credit) > 0)
    await storage.addFolioPayment(
      "restaurant_order",
      orderId,
      cents(credit) / 100,
      "Anticipos aplicados · " + current.eventName,
      "advance",
      "restaurant_event_advance_application",
      orderId,
      undefined,
      actor,
    );
  await storage.updateTableReservation(context.reservation_id, {
    status: "completed",
  });
  const assigned = await rows(
    sql`SELECT table_id FROM restaurant_event_assignments WHERE reservation_id=${context.reservation_id}`,
  );
  for (const t of assigned)
    await storage.updateRestaurantTable(t.table_id, { status: "available" });
  await audit(actor, "apply-advance", orderId, {
    credit,
    gross,
    reservationId: context.reservation_id,
  });
  return true;
}
export async function cancelRestaurantEventBooking(
  id: string,
  operationId: string,
  reason: string,
  actor: string,
) {
  return mutate(
    operationId,
    "cancel-booking",
    { id, reason },
    actor,
    async () => {
      const b = await booking(id, true);
      if (b.status !== "confirmed")
        fail("Sólo se puede cancelar antes de iniciar el servicio.");
      await storage.updateTableReservation(id, {
        status: "cancelled",
        notes: [b.notes, "Cancelación: " + reason].filter(Boolean).join("\n"),
      });
      return {
        id,
        message:
          "Reserva cancelada. Los anticipos se conservan para revisión de Administración.",
      };
    },
    true,
  );
}

/** Persist the final fiscal request in the same transaction as the collection. */
export async function prepareRestaurantEventFinalDocument(
  orderId: string,
  input: Parameters<typeof emitirFactura>[0],
) {
  const context = await restaurantEventOrderContext(orderId);
  if (!context) return false;
  const config = await getBillingConfig();
  const request = {
    ...input,
    operationId: randomUUID(),
    expectedFiscalIdentity: {
      environment: config.arcaAmbiente ?? "ficticio",
      issuer: String(config.arcaCuit ?? config.cuit).replace(/\D/g, ""),
      pointOfSale: Number(
        input.puntoVentaOverride ??
          (config.arcaAmbiente === "homologacion"
            ? config.puntoVentaHomolog
            : config.puntoVenta),
      ),
    },
  };
  await db.execute(
    sql`INSERT INTO restaurant_event_final_documents(order_id,operation_id,invoice_request) VALUES(${orderId},${request.operationId}::uuid,${JSON.stringify(request)}::jsonb) ON CONFLICT(order_id) DO NOTHING`,
  );
  return true;
}
export async function completeRestaurantEventFinalDocument(orderId: string) {
  const read = async () =>
    (
      await rows(
        sql`SELECT * FROM restaurant_event_final_documents WHERE order_id=${orderId}`,
      )
    )[0];
  const row = await read();
  if (!row) fail("No hay un comprobante pendiente para esta cuenta.", 404);
  if (row.document_status === "completed")
    return { documentStatus: "completed", invoiceId: row.invoice_id };
  const emit = () =>
    emitirFactura({
      ...row.invoice_request,
      requestSnapshot: row.invoice_request,
    });
  const finalize = async (invoiceId: number) => {
    const proof =
      await rows(sql`SELECT si.id FROM sales_invoices si JOIN restaurant_orders ro ON ro.id=${orderId} JOIN restaurant_event_services s ON s.order_id=ro.id WHERE si.id=${invoiceId}
   AND si.restaurant_order_id=ro.id AND si.estado='emitida' AND (si.modo_ficticio=true OR si.cae ~ '^[0-9]{14}$')
   AND ro.status='closed' AND si.monto_total=ro.total AND s.gross_total=ro.total::numeric+s.advance_applied
   AND s.advance_applied=COALESCE((SELECT sum(a.amount) FROM restaurant_event_advance_applications a WHERE a.order_id=ro.id),0)
   AND ro.total::numeric=COALESCE((SELECT sum(cm.amount) FROM cash_movements cm WHERE cm.source_type='restaurant_order' AND cm.source_id=ro.id AND cm.anulado=false),0)`);
    if (!proof.length)
      fail(
        "El comprobante y la cuenta requieren revisión. Conservamos sus datos originales.",
      );
    await db.execute(
      sql`UPDATE restaurant_event_final_documents SET invoice_id=${invoiceId},document_status='completed' WHERE order_id=${orderId}`,
    );
    await db.execute(
      sql`UPDATE sales_invoices SET reconciliation_status='conciliada',reconciliation_error=NULL,reconciliation_updated_at=now() WHERE id=${invoiceId}`,
    );
    return { documentStatus: "completed", invoiceId };
  };
  try {
    const config = await getBillingConfig();
    if (config.arcaAmbiente === "ficticio")
      return await withDatabaseTransaction(async () => {
        await db.execute(sql`SELECT id FROM billing_config FOR SHARE`);
        if ((await getBillingConfig()).arcaAmbiente !== "ficticio")
          fail("La configuración fiscal cambió.");
        await db.execute(
          sql`SELECT order_id FROM restaurant_event_final_documents WHERE order_id=${orderId} FOR UPDATE`,
        );
        const current = await read();
        if (current.document_status === "completed")
          return { documentStatus: "completed", invoiceId: current.invoice_id };
        return finalize((await emit()).id);
      });
    const invoice = await emit();
    return await withDatabaseTransaction(async () => {
      await db.execute(
        sql`SELECT order_id FROM restaurant_event_final_documents WHERE order_id=${orderId} FOR UPDATE`,
      );
      const journal = await rows(
        sql`SELECT 1 FROM billing_operations WHERE operation_id=${String(row.operation_id)} AND invoice_id=${invoice.id} AND stage='authorized'`,
      );
      if (!journal.length) fail("Falta confirmar el comprobante original.");
      return finalize(invoice.id);
    });
  } catch {
    return {
      documentStatus: "pending",
      message:
        "La cuenta quedó cerrada y el cobro registrado. Podés completar el comprobante desde el evento sin volver a cobrar.",
    };
  }
}
