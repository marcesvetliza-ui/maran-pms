import {registerHousekeepingAvailability} from "../housekeepingAvailability";
import {registerHousekeepingPlanning} from "../housekeepingPlanning";
import {registerHousekeepingTaskRoutes} from "../housekeepingTasks";
import { lostFoundShippingSchema, lostFoundStatusUpdateSchema } from "@shared/lostFoundDelivery";
import type { Express } from "express";
import {registerHousekeepingDailyReport} from '../housekeepingDailyReport';
import { storage } from "../db-storage";
import { db,withDatabaseTransaction } from "../db";
import { lostFoundItems, reservations, safeBoxOpenings, type LostFoundCategory, type LostFoundStatus } from "@shared/schema";
import { requireAuth, requirePermission } from "../auth";
import {hasPermission} from "../permissions";
import {hideInventoryCosts} from "../inventoryAccess";
import { eq, desc, like, and, or, ilike, sql, type SQL } from "drizzle-orm";

export function registerHousekeepingRoutes(app: Express) {
  registerHousekeepingDailyReport(app);
  app.get("/api/housekeeping/inventory", requireAuth, requirePermission('sidebar:/housekeeping'), async (req,res) => {
    try {
      const items=(await storage.getInventoryItems()).filter(item=>item.category?.area==='housekeeping');
      res.json(hasPermission(req.user!.role,'api:inventory:cost')?items:hideInventoryCosts(items));
    } catch { res.status(500).json({error:'No se pudo consultar el inventario de Housekeeping'}); }
  });
  app.get('/api/housekeeping/preparations',requireAuth,requirePermission('sidebar:/housekeeping'),async(req,res)=>{
    try{
      const today=new Intl.DateTimeFormat('en-CA',{timeZone:'America/Argentina/Cordoba'}).format(new Date());
      const result=await db.execute(sql`SELECT r.id,r.room_id,r.reservation_code,r.check_in_date,r.check_out_date,r.status,r.housekeeping_preparation,concat(g.last_name,' ',g.first_name) AS guest_name FROM reservations r LEFT JOIN guests g ON g.id=r.guest_id WHERE r.status NOT IN ('cancelled','checked_out','no_show') AND r.check_out_date>=${today} ORDER BY r.check_in_date,r.id`);
      res.json(result.rows);
    }catch{res.status(500).json({error:'No se pudieron consultar las preparaciones'});}
  });
  app.put('/api/housekeeping/room/:roomId/preparation',requireAuth,requirePermission('sidebar:/housekeeping'),async(req,res)=>{
    const {reservationId,action,note}=req.body;
    if(typeof reservationId!=='string'||!['mark','clear'].includes(action)||note!==undefined&&(typeof note!=='string'||note.length>500))return res.status(400).json({error:'Elegí la reserva y una nota de hasta 500 caracteres'});
    try{
      const result=await withDatabaseTransaction(async()=>{
        const row=(await db.execute(sql`SELECT room_id,status,housekeeping_preparation FROM reservations WHERE id=${reservationId} FOR UPDATE`)).rows[0] as any;
        if(!row||row.room_id!==req.params.roomId||['cancelled','checked_out','no_show'].includes(row.status))throw Object.assign(new Error('La reserva ya no corresponde a esta habitación; actualizá la pantalla'),{statusCode:409});
        const actor=req.user?.username||'Sistema';
        const preparation=action==='clear'?null:{roomId:req.params.roomId,state:'prepared',note:(note||'').trim(),markedAt:new Date().toISOString(),markedBy:actor};
        await db.execute(sql`UPDATE reservations SET housekeeping_preparation=${preparation?JSON.stringify(preparation):null}::jsonb WHERE id=${reservationId}`);
        if(action==='mark'){
          const occupied=(await db.execute(sql`SELECT id FROM reservations WHERE room_id=${req.params.roomId} AND status='checked_in' LIMIT 1`)).rows.length>0;
          await storage.updateRoom(req.params.roomId,{status:occupied?'limpia_ocupada':'available'});
        }
        await db.execute(sql`INSERT INTO reservation_changelog(reservation_id,operador,tipo,descripcion)VALUES(${reservationId},${actor},'housekeeping',${action==='clear'?'Aviso de preparación especial retirado':`Limpia — No mover. ${preparation!.note}`})`);
        return {preparation};
      });res.json(result);
    }catch(error:any){res.status(error.statusCode||500).json({error:error.message});}
  });
  registerHousekeepingAvailability(app);
  registerHousekeepingPlanning(app);
  registerHousekeepingTaskRoutes(app);

  // ==================== LOST & FOUND MODULE ====================

  async function generateLostFoundCode(): Promise<string> {
    const year = new Date().getFullYear();
    const prefix = `LF-${year}-`;
    const lastItem = await db.select()
      .from(lostFoundItems)
      .where(like(lostFoundItems.codigo, `${prefix}%`))
      .orderBy(desc(lostFoundItems.createdAt))
      .limit(1);
    const lastNum = lastItem[0] ? parseInt(lastItem[0].codigo.replace(prefix, "")) : 0;
    return `${prefix}${String(lastNum + 1).padStart(4, "0")}`;
  }

  app.get("/api/lost-found", requireAuth, async (req, res) => {
    try {
      const { status, category, search } = req.query;
      const conditions: SQL[] = [];
      if (status) conditions.push(eq(lostFoundItems.status, status as LostFoundStatus));
      if (category) conditions.push(eq(lostFoundItems.category, category as LostFoundCategory));
      if (search) {
        const q = `%${search}%`;
        const searchCondition = or(
          ilike(lostFoundItems.description, q),
          ilike(lostFoundItems.location, q),
          ilike(lostFoundItems.codigo, q),
          ilike(lostFoundItems.foundBy, q),
        );
        if (searchCondition) conditions.push(searchCondition);
      }
      const items = conditions.length > 0
        ? await db.select().from(lostFoundItems).where(and(...conditions)).orderBy(desc(lostFoundItems.createdAt))
        : await db.select().from(lostFoundItems).orderBy(desc(lostFoundItems.createdAt));
      res.json(items);
    } catch (error) {
      res.status(500).json({ error: "Error fetching lost and found items" });
    }
  });

  app.post("/api/lost-found", requireAuth, async (req, res) => {
    try {
      const shipping = lostFoundShippingSchema.nullable().optional().safeParse(req.body.shippingDetails);
      if (!shipping.success) return res.status(400).json({ error: "Datos de envío inválidos" });
      const codigo = await generateLostFoundCode();
      const [item] = await db.insert(lostFoundItems).values({ ...req.body, shippingDetails: shipping.data, codigo }).returning();
      res.json(item);
    } catch (error) {
      res.status(500).json({ error: "Error creating lost and found item" });
    }
  });

  app.get("/api/lost-found/lookup-room/:roomNumber", requireAuth, async (req, res) => {
    try {
      const room = await storage.getRoomByNumber(req.params.roomNumber);
      if (!room) return res.status(404).json({ error: "Habitación no encontrada" });
      const [recentReservation] = await db.select()
        .from(reservations)
        .where(eq(reservations.roomId, room.id))
        .orderBy(desc(reservations.checkOutDate))
        .limit(1);
      if (!recentReservation) return res.json({ room, reservation: null, guest: null });
      const guest = recentReservation.guestId ? await storage.getGuest(recentReservation.guestId) : null;
      res.json({ room, reservation: recentReservation, guest });
    } catch (error) {
      res.status(500).json({ error: "Error looking up room" });
    }
  });

  app.get("/api/lost-found/:id", requireAuth, async (req, res) => {
    try {
      const [item] = await db.select().from(lostFoundItems).where(eq(lostFoundItems.id, req.params.id));
      if (!item) return res.status(404).json({ error: "Item not found" });
      res.json(item);
    } catch (error) {
      res.status(500).json({ error: "Error fetching item" });
    }
  });

  app.patch("/api/lost-found/:id", requireAuth, async (req, res) => {
    try {
      const shipping = lostFoundShippingSchema.nullable().optional().safeParse(req.body.shippingDetails);
      if (!shipping.success) return res.status(400).json({ error: "Datos de envío inválidos" });
      const { codigo, createdAt, ...data } = req.body;
      const [updated] = await db.update(lostFoundItems)
        .set({ ...data, shippingDetails: shipping.data, updatedAt: new Date() })
        .where(eq(lostFoundItems.id, req.params.id))
        .returning();
      if (!updated) return res.status(404).json({ error: "Item not found" });
      res.json(updated);
    } catch (error) {
      res.status(500).json({ error: "Error updating item" });
    }
  });

  app.patch("/api/lost-found/:id/status", requireAuth, async (req, res) => {
    try {
      const parsed = lostFoundStatusUpdateSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: "Datos de entrega inválidos", details: parsed.error.flatten() });
      }
      const { status, claimedBy, claimedDate, deliveryType, deliveredBy, notes, shippingDetails } = parsed.data;
      const updateData: any = { status, updatedAt: new Date() };
      if (claimedBy !== undefined) updateData.claimedBy = claimedBy;
      if (claimedDate !== undefined) updateData.claimedDate = claimedDate;
      if (deliveryType !== undefined) updateData.deliveryType = deliveryType;
      if (deliveryType === "retiro_hotel") updateData.shippingDetails = null;
      else if (shippingDetails !== undefined) updateData.shippingDetails = shippingDetails;
      if (deliveredBy !== undefined) updateData.deliveredBy = deliveredBy;
      if (notes !== undefined) updateData.notes = notes;
      const [updated] = await db.update(lostFoundItems)
        .set(updateData)
        .where(eq(lostFoundItems.id, req.params.id))
        .returning();
      if (!updated) return res.status(404).json({ error: "Item not found" });
      res.json(updated);
    } catch (error) {
      res.status(500).json({ error: "Error updating status" });
    }
  });

  // ==================== CAJA FUERTE (apertura/reseteo de código) ====================
  // Reemplaza la planilla en papel: fecha, habitación, quién abrió y quién solicitó.

  app.get("/api/safe-box-openings", requireAuth, async (req, res) => {
    try {
      const items = await db.select().from(safeBoxOpenings).orderBy(desc(safeBoxOpenings.date), desc(safeBoxOpenings.createdAt));
      res.json(items);
    } catch (error) {
      res.status(500).json({ error: "Error fetching safe box openings" });
    }
  });

  app.post("/api/safe-box-openings", requireAuth, async (req, res) => {
    try {
      const { roomId, date, openedBy, requestedBy } = req.body;
      if (!roomId || !date || !String(openedBy || "").trim() || !String(requestedBy || "").trim()) {
        return res.status(400).json({ error: "roomId, date, openedBy y requestedBy son requeridos" });
      }
      const [item] = await db.insert(safeBoxOpenings).values({
        roomId,
        date,
        openedBy: String(openedBy).trim(),
        requestedBy: String(requestedBy).trim(),
      }).returning();
      res.status(201).json(item);
    } catch (error) {
      res.status(500).json({ error: "Error creating safe box opening" });
    }
  });
}
