import { randomUUID } from "crypto";

export function getArgentinaToday(): string {
  return new Date().toLocaleDateString("en-CA", { timeZone: "America/Argentina/Buenos_Aires" });
}
import { eq, and, or, desc, asc, sql, ilike, count, ne, lt, gt, lte, gte, inArray, not, isNull } from "drizzle-orm";
import { db } from "./db";
import { IStorage } from "./storage";
import {
  type User, type InsertUser,
  type Room, type InsertRoom,
  type RoomType, type InsertRoomType,
  type RatePlan, type InsertRatePlan, type RatePlanWithRoomType,
  type Company, type InsertCompany,
  type Agency, type InsertAgency,
  type Guest, type InsertGuest,
  type BedType, type InsertBedType,
  type Reservation, type InsertReservation,
  type Charge, type InsertCharge,
  type Payment, type InsertPayment,
  type CancelledReservationLog, type InsertCancelledReservationLog,
  type OTAChannel, type InsertOTAChannel, type OTAChannelWithStats,
  type OTAReservationLog, type InsertOTAReservationLog, type OTAReservationLogWithChannel,
  type RoomWithType, type ReservationWithDetails,
  type RoomStatus, type ReservationStatus, type ReservationSource,
  type PlanningData, type PlanningCellStatus,
  type Group, type InsertGroup,
  type GroupRoomBlock, type InsertGroupRoomBlock,
  type GroupReservationLink, type InsertGroupReservationLink,
  type GroupWithDetails, type GroupRoomBlockWithDetails,
  type GuestReview, type InsertGuestReview, type GuestReviewWithDetails, type SentimentType,
  type HousekeepingTask, type InsertHousekeepingTask, type HousekeepingTaskWithRoom,
  type RestaurantArea, type InsertRestaurantArea,
  type RestaurantTable, type InsertRestaurantTable, type RestaurantTableWithArea,
  type MenuCategory, type InsertMenuCategory,
  type MenuItem, type InsertMenuItem, type MenuItemWithCategory,
  type RestaurantOrder, type InsertRestaurantOrder, type RestaurantOrderWithDetails,
  type OrderItem, type InsertOrderItem,
  type TableReservation, type InsertTableReservation, type TableReservationWithTable,
  type RestaurantTimeSlot, type InsertRestaurantTimeSlot,
  type OrderSplit, type InsertOrderSplit,
  type Recipe, type InsertRecipe,
  type RecipeIngredient, type InsertRecipeIngredient, type RecipeWithIngredients,
  type ItemCategory, type InsertItemCategory,
  type Supplier, type InsertSupplier,
  type InventoryItem, type InsertInventoryItem, type InventoryItemWithDetails,
  type StockMovement, type InsertStockMovement, type StockMovementWithItem,
  type SpaCabin, type InsertSpaCabin,
  type SpaTreatmentCategory, type InsertSpaTreatmentCategory,
  type SpaTreatment, type InsertSpaTreatment,
  type SpaAppointment, type InsertSpaAppointment, type SpaAppointmentWithDetails, type SpaAppointmentStatus,
  type SpaAccount, type InsertSpaAccount, type SpaAccountStatus, type SpaAccountWithItems,
  type SpaAccountItem, type InsertSpaAccountItem,
  type SpaPayment, type InsertSpaPayment,
  type EventRoom, type InsertEventRoom, type EventRoomStatus,
  type Event as HotelEvent, type InsertEvent, type EventStatus, type EventType,
  type EventChargeType, type InsertEventChargeType,
  type EventCharge, type InsertEventCharge, type EventChargeWithType,
  type EventWithDetails,
  type EventPlanningData, type EventPlanningCellStatus,
  type EventPayment, type InsertEventPayment,
  type EventTable, type InsertEventTable, type EventTableWithDetails,
  type EventTableCharge, type InsertEventTableCharge,
  type EventTablePayment, type InsertEventTablePayment,
  type MaintenanceStaff, type InsertMaintenanceStaff,
  type WorkOrder, type InsertWorkOrder, type WorkOrderWithDetails, type WorkOrderStatus,
  type SystemUser, type InsertSystemUser,
  type SystemSetting, type InsertSystemSetting,
  type AuditLog, type InsertAuditLog,
  type Package, type InsertPackage, type PackageWithDetails, type PackageStatus,
  type PackageItem, type InsertPackageItem,
  type SystemNotification, type InsertSystemNotification, type NotificationArea,
  type WebCheckin, type InsertWebCheckin,
  type GuestPreference, type InsertGuestPreference,
  type StayNote, type InsertStayNote,
  type HospitalityAlert, type InsertHospitalityAlert,
  type CashRegisterConfig, type InsertCashRegisterConfig,
  type CashShift, type InsertCashShift,
  type CashMovement, type InsertCashMovement,
  type CashClosingSummary, type InsertCashClosingSummary,
  type OrderStatus,
  type SpaPaymentMethod,
  users, rooms, roomTypes, ratePlans, companies, agencies, guests, bedTypes,
  reservations, charges, payments, cancelledReservationLogs,
  otaChannels, otaReservationLogs,
  groups, groupRoomBlocks, groupReservationLinks,
  guestReviews, housekeepingTasks,
  restaurantAreas, restaurantTables, menuCategories, menuItems,
  restaurantOrders, orderItems, tableReservations, restaurantTimeSlots,
  orderSplits, recipes, recipeIngredients,
  itemCategories, suppliers, inventoryItems, stockMovements,
  spaCabins, spaTreatmentCategories, spaTreatments, spaAppointments,
  spaAccounts, spaAccountItems, spaPayments,
  eventRooms, events, eventChargeTypes, eventCharges, eventPayments,
  eventTables, eventTableCharges, eventTablePayments,
  maintenanceStaff, workOrders,
  systemUsers, systemSettings, auditLogs,
  packages, packageItems,
  systemNotifications, webCheckins,
  guestPreferences, stayNotes, hospitalityAlerts,
  cashRegisterConfigs, cashShifts, cashMovements, cashClosingSummaries,
} from "@shared/schema";

export class DatabaseStorage implements IStorage {

  async getUser(id: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.id, id));
    return user;
  }

  async getUserByUsername(username: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.username, username));
    return user;
  }

  async createUser(user: InsertUser): Promise<User> {
    const [created] = await db.insert(users).values(user as any).returning();
    return created;
  }

  async getRoomTypes(): Promise<RoomType[]> {
    return db.select().from(roomTypes);
  }

  async getRoomType(id: string): Promise<RoomType | undefined> {
    const [rt] = await db.select().from(roomTypes).where(eq(roomTypes.id, id));
    return rt;
  }

  async createRoomType(roomType: InsertRoomType): Promise<RoomType> {
    const [created] = await db.insert(roomTypes).values(roomType as any).returning();
    return created;
  }

  async updateRoomType(id: string, roomType: Partial<InsertRoomType>): Promise<RoomType | undefined> {
    const [updated] = await db.update(roomTypes).set(roomType as any).where(eq(roomTypes.id, id)).returning();
    return updated;
  }

  async deleteRoomType(id: string): Promise<boolean> {
    const result = await db.delete(roomTypes).where(eq(roomTypes.id, id));
    return (result.rowCount ?? 0) > 0;
  }

  async getRatePlans(): Promise<RatePlanWithRoomType[]> {
    const plans = await db.select().from(ratePlans);
    const types = await db.select().from(roomTypes);
    const typesMap = new Map(types.map(t => [t.id, t]));
    return plans.map(p => ({ ...p, roomType: typesMap.get(p.roomTypeId)! }));
  }

  async getRatePlan(id: string): Promise<RatePlanWithRoomType | undefined> {
    const [plan] = await db.select().from(ratePlans).where(eq(ratePlans.id, id));
    if (!plan) return undefined;
    const [rt] = await db.select().from(roomTypes).where(eq(roomTypes.id, plan.roomTypeId));
    return { ...plan, roomType: rt };
  }

  async getRatePlansByRoomType(roomTypeId: string): Promise<RatePlan[]> {
    return db.select().from(ratePlans).where(eq(ratePlans.roomTypeId, roomTypeId));
  }

  async createRatePlan(ratePlan: InsertRatePlan): Promise<RatePlan> {
    const [created] = await db.insert(ratePlans).values(ratePlan as any).returning();
    return created;
  }

  async updateRatePlan(id: string, ratePlan: Partial<InsertRatePlan>): Promise<RatePlan | undefined> {
    const [updated] = await db.update(ratePlans).set(ratePlan as any).where(eq(ratePlans.id, id)).returning();
    return updated;
  }

  async deleteRatePlan(id: string): Promise<boolean> {
    const result = await db.delete(ratePlans).where(eq(ratePlans.id, id));
    return (result.rowCount ?? 0) > 0;
  }

  async getRooms(): Promise<RoomWithType[]> {
    const allRooms = await db.select().from(rooms);
    const types = await db.select().from(roomTypes);
    const typesMap = new Map(types.map(t => [t.id, t]));
    return allRooms
      .filter(r => typesMap.has(r.roomTypeId))
      .map(r => ({ ...r, roomType: typesMap.get(r.roomTypeId)! }));
  }

  async getRoom(id: string): Promise<RoomWithType | undefined> {
    const [room] = await db.select().from(rooms).where(eq(rooms.id, id));
    if (!room) return undefined;
    const [rt] = await db.select().from(roomTypes).where(eq(roomTypes.id, room.roomTypeId));
    return { ...room, roomType: rt };
  }

  async createRoom(room: InsertRoom): Promise<Room> {
    const [created] = await db.insert(rooms).values(room as any).returning();
    return created;
  }

  async updateRoom(id: string, room: Partial<InsertRoom>): Promise<Room | undefined> {
    const [updated] = await db.update(rooms).set(room as any).where(eq(rooms.id, id)).returning();
    return updated;
  }

  async deleteRoom(id: string): Promise<boolean> {
    const result = await db.delete(rooms).where(eq(rooms.id, id));
    return (result.rowCount ?? 0) > 0;
  }

  async getCompanies(): Promise<Company[]> {
    return db.select().from(companies);
  }

  async getCompany(id: string): Promise<Company | undefined> {
    const [company] = await db.select().from(companies).where(eq(companies.id, id));
    return company;
  }

  async searchCompanies(query: string): Promise<Company[]> {
    return db.select().from(companies).where(
      or(
        ilike(companies.razonSocial, `%${query}%`),
        ilike(companies.nombreFantasia, `%${query}%`),
        ilike(companies.cuilCuit, `%${query}%`)
      )
    );
  }

  async createCompany(company: InsertCompany): Promise<Company> {
    const [created] = await db.insert(companies).values(company as any).returning();
    return created;
  }

  async updateCompany(id: string, company: Partial<InsertCompany>): Promise<Company | undefined> {
    const safeData: Record<string, any> = {};
    for (const [key, value] of Object.entries(company)) {
      if (["id", "createdAt"].includes(key) || value === undefined) continue;
      safeData[key] = value;
    }
    if (Object.keys(safeData).length === 0) return undefined;
    const [updated] = await db.update(companies).set(safeData).where(eq(companies.id, id)).returning();
    return updated;
  }

  async deleteCompany(id: string): Promise<boolean> {
    const result = await db.delete(companies).where(eq(companies.id, id));
    return (result.rowCount ?? 0) > 0;
  }

  async getAgencies(): Promise<Agency[]> {
    return db.select().from(agencies);
  }

  async getAgency(id: string): Promise<Agency | undefined> {
    const [agency] = await db.select().from(agencies).where(eq(agencies.id, id));
    return agency;
  }

  async searchAgencies(query: string): Promise<Agency[]> {
    return db.select().from(agencies).where(
      or(
        ilike(agencies.razonSocial, `%${query}%`),
        ilike(agencies.nombreFantasia, `%${query}%`),
        ilike(agencies.cuilCuit, `%${query}%`)
      )
    );
  }

  async createAgency(agency: InsertAgency): Promise<Agency> {
    const [created] = await db.insert(agencies).values(agency as any).returning();
    return created;
  }

  async updateAgency(id: string, agency: Partial<InsertAgency>): Promise<Agency | undefined> {
    const safeData: Record<string, any> = {};
    for (const [key, value] of Object.entries(agency)) {
      if (["id", "createdAt"].includes(key) || value === undefined) continue;
      safeData[key] = value;
    }
    if (Object.keys(safeData).length === 0) return undefined;
    const [updated] = await db.update(agencies).set(safeData).where(eq(agencies.id, id)).returning();
    return updated;
  }

  async deleteAgency(id: string): Promise<boolean> {
    const result = await db.delete(agencies).where(eq(agencies.id, id));
    return (result.rowCount ?? 0) > 0;
  }

  async getGuests(): Promise<Guest[]> {
    return db.select().from(guests);
  }

  async getGuest(id: string): Promise<Guest | undefined> {
    const [guest] = await db.select().from(guests).where(eq(guests.id, id));
    return guest;
  }

  async searchGuests(query: string): Promise<Guest[]> {
    return db.select().from(guests).where(
      or(
        ilike(guests.firstName, `%${query}%`),
        ilike(guests.lastName, `%${query}%`),
        ilike(guests.email, `%${query}%`),
        ilike(guests.documentNumber, `%${query}%`)
      )
    );
  }

  async createGuest(guest: InsertGuest): Promise<Guest> {
    const [created] = await db.insert(guests).values(guest as any).returning();
    return created;
  }

  async updateGuest(id: string, guest: Partial<InsertGuest>): Promise<Guest | undefined> {
    const [updated] = await db.update(guests).set(guest as any).where(eq(guests.id, id)).returning();
    return updated;
  }

  async deleteGuest(id: string): Promise<boolean> {
    const result = await db.delete(guests).where(eq(guests.id, id));
    return (result.rowCount ?? 0) > 0;
  }

  async getBedTypes(): Promise<BedType[]> {
    return db.select().from(bedTypes);
  }

  async getBedType(id: string): Promise<BedType | undefined> {
    const [bt] = await db.select().from(bedTypes).where(eq(bedTypes.id, id));
    return bt;
  }

  async createBedType(bedType: InsertBedType): Promise<BedType> {
    const [created] = await db.insert(bedTypes).values(bedType as any).returning();
    return created;
  }

  async updateBedType(id: string, bedType: Partial<InsertBedType>): Promise<BedType | undefined> {
    const [updated] = await db.update(bedTypes).set(bedType as any).where(eq(bedTypes.id, id)).returning();
    return updated;
  }

  async deleteBedType(id: string): Promise<boolean> {
    const [existing] = await db.select().from(bedTypes).where(eq(bedTypes.id, id));
    if (!existing) return false;
    await db.update(bedTypes).set({ isActive: false }).where(eq(bedTypes.id, id));
    return true;
  }

  private async enrichReservation(reservation: Reservation): Promise<ReservationWithDetails> {
    const [guest] = await db.select().from(guests).where(eq(guests.id, reservation.guestId));
    const [room] = await db.select().from(rooms).where(eq(rooms.id, reservation.roomId));
    const roomType = room ? (await db.select().from(roomTypes).where(eq(roomTypes.id, room.roomTypeId)))[0] : undefined;
    const ratePlan = reservation.ratePlanId ? (await db.select().from(ratePlans).where(eq(ratePlans.id, reservation.ratePlanId)))[0] : undefined;
    const chargesList = await db.select().from(charges).where(eq(charges.reservationId, reservation.id));
    const paymentsList = await db.select().from(payments).where(eq(payments.reservationId, reservation.id));
    const company = reservation.companyId ? (await db.select().from(companies).where(eq(companies.id, reservation.companyId)))[0] : undefined;
    const agency = reservation.agencyId ? (await db.select().from(agencies).where(eq(agencies.id, reservation.agencyId)))[0] : undefined;
    return {
      ...reservation,
      guest: guest!,
      company,
      agency,
      room: room ? { ...room, roomType } : undefined as any,
      ratePlan,
      charges: chargesList,
      payments: paymentsList,
    };
  }

  async getReservations(options?: {
    dateFrom?: string;
    dateTo?: string;
    dateMode?: string;
  }): Promise<ReservationWithDetails[]> {
    const conditions = [];

    if (options?.dateMode === "all") {
    } else if (options?.dateFrom || options?.dateTo) {
      if (options.dateFrom) {
        conditions.push(gte(reservations.checkInDate, options.dateFrom));
      }
      if (options.dateTo) {
        conditions.push(lte(reservations.checkInDate, options.dateTo));
      }
    } else {
      const today = getArgentinaToday();
      conditions.push(
        or(
          inArray(reservations.status, ["pending", "confirmed", "checked_in"]),
          and(
            gte(reservations.checkInDate, today),
            ne(reservations.status, "cancelled")
          )
        )
      );
    }

    let query = db.select().from(reservations);
    if (conditions.length > 0) {
      query = query.where(and(...conditions)) as any;
    }

    const allRes = await (query.orderBy(asc(reservations.checkInDate)) as any);
    const results: ReservationWithDetails[] = [];
    for (const r of allRes) {
      results.push(await this.enrichReservation(r));
    }
    return results;
  }

  async getReservation(id: string): Promise<ReservationWithDetails | undefined> {
    const [res] = await db.select().from(reservations).where(eq(reservations.id, id));
    if (!res) return undefined;
    return this.enrichReservation(res);
  }

  async getReservationByCode(code: string): Promise<ReservationWithDetails | undefined> {
    const [res] = await db.select().from(reservations).where(eq(reservations.reservationCode, code));
    if (!res) return undefined;
    return this.enrichReservation(res);
  }

  async getRecentReservations(limit: number): Promise<ReservationWithDetails[]> {
    const allRes = await db.select().from(reservations).orderBy(desc(reservations.createdAt)).limit(limit);
    const results: ReservationWithDetails[] = [];
    for (const r of allRes) {
      results.push(await this.enrichReservation(r));
    }
    return results;
  }

  async getReservationsForCheckIn(): Promise<ReservationWithDetails[]> {
    const todayStr = getArgentinaToday();
    const tomorrow = new Date(todayStr + "T12:00:00");
    tomorrow.setDate(tomorrow.getDate() + 1);
    const tomorrowStr = tomorrow.toISOString().split("T")[0];
    const allRes = await db.select().from(reservations).where(
      and(
        or(eq(reservations.status, "confirmed"), eq(reservations.status, "pending")),
        lte(reservations.checkInDate, tomorrowStr),
        gte(reservations.checkInDate, todayStr)
      )
    );
    const results: ReservationWithDetails[] = [];
    for (const r of allRes) {
      results.push(await this.enrichReservation(r));
    }
    return results;
  }

  async getReservationsForCheckOut(): Promise<ReservationWithDetails[]> {
    const allRes = await db.select().from(reservations).where(eq(reservations.status, "checked_in"));
    const results: ReservationWithDetails[] = [];
    for (const r of allRes) {
      results.push(await this.enrichReservation(r));
    }
    return results;
  }

  async getCheckInsByDate(date: string): Promise<ReservationWithDetails[]> {
    const allRes = await db.select().from(reservations).where(
      and(eq(reservations.checkInDate, date), eq(reservations.status, "checked_in"))
    );
    const results: ReservationWithDetails[] = [];
    for (const r of allRes) {
      results.push(await this.enrichReservation(r));
    }
    return results;
  }

  async getReservationsByGuest(guestId: string): Promise<ReservationWithDetails[]> {
    const allRes = await db.select().from(reservations).where(eq(reservations.guestId, guestId));
    const results: ReservationWithDetails[] = [];
    for (const r of allRes) {
      results.push(await this.enrichReservation(r));
    }
    return results;
  }

  async createReservation(reservation: InsertReservation): Promise<Reservation> {
    const [created] = await db.insert(reservations).values(reservation as any).returning();
    return created;
  }

  async updateReservation(id: string, reservation: Partial<InsertReservation>): Promise<Reservation | undefined> {
    const safeData: Record<string, any> = {};
    const protectedFields = ["id", "createdAt", "reservationCode"];
    const fkFields = ["guestId", "roomId", "roomTypeId"];
    for (const [key, value] of Object.entries(reservation)) {
      if (protectedFields.includes(key)) continue;
      if (value === undefined) continue;
      if (fkFields.includes(key) && value === "") continue;
      safeData[key] = value;
    }
    if (Object.keys(safeData).length === 0) return undefined;
    const [updated] = await db.update(reservations).set(safeData).where(eq(reservations.id, id)).returning();
    return updated;
  }

  async deleteReservation(id: string): Promise<boolean> {
    const result = await db.delete(reservations).where(eq(reservations.id, id));
    return (result.rowCount ?? 0) > 0;
  }

  generateReservationCode(): string {
    const now = Date.now();
    const random = Math.floor(Math.random() * 1000);
    return `RES-${now}-${random}`;
  }

  async getCharges(reservationId: string): Promise<Charge[]> {
    return db.select().from(charges).where(eq(charges.reservationId, reservationId));
  }

  async getCharge(id: string): Promise<Charge | undefined> {
    const [charge] = await db.select().from(charges).where(eq(charges.id, id));
    return charge;
  }

  async createCharge(charge: InsertCharge): Promise<Charge> {
    const [created] = await db.insert(charges).values(charge as any).returning();
    return created;
  }

  async updateCharge(id: string, charge: Partial<InsertCharge>): Promise<Charge | undefined> {
    const [updated] = await db.update(charges).set(charge as any).where(eq(charges.id, id)).returning();
    return updated;
  }

  async deleteCharge(id: string): Promise<boolean> {
    const result = await db.delete(charges).where(eq(charges.id, id));
    return (result.rowCount ?? 0) > 0;
  }

  async getChargesTotal(reservationId: string): Promise<number> {
    const result = await db.select({ total: sql<string>`COALESCE(SUM(${charges.amount}::numeric), 0)` }).from(charges).where(eq(charges.reservationId, reservationId));
    return parseFloat(result[0]?.total || "0");
  }

  async getPayments(reservationId: string): Promise<Payment[]> {
    return db.select().from(payments).where(eq(payments.reservationId, reservationId));
  }

  async createPayment(payment: InsertPayment): Promise<Payment> {
    const [created] = await db.insert(payments).values(payment as any).returning();
    return created;
  }

  async updatePayment(id: string, payment: Partial<InsertPayment>): Promise<Payment | undefined> {
    const [updated] = await db.update(payments).set(payment as any).where(eq(payments.id, id)).returning();
    return updated;
  }

  async deletePayment(id: string): Promise<boolean> {
    const result = await db.delete(payments).where(eq(payments.id, id));
    return (result.rowCount ?? 0) > 0;
  }

  async getPaymentsTotal(reservationId: string): Promise<number> {
    const result = await db.select({ total: sql<string>`COALESCE(SUM(${payments.amount}::numeric), 0)` }).from(payments).where(eq(payments.reservationId, reservationId));
    return parseFloat(result[0]?.total || "0");
  }

  async getCancelledReservationLogs(): Promise<CancelledReservationLog[]> {
    return db.select().from(cancelledReservationLogs);
  }

  async createCancelledReservationLog(log: InsertCancelledReservationLog): Promise<CancelledReservationLog> {
    const [created] = await db.insert(cancelledReservationLogs).values(log as any).returning();
    return created;
  }

  async checkOverbooking(roomId: string, checkInDate: string, checkOutDate: string, excludeReservationId?: string): Promise<boolean> {
    const activeStatuses = ["tentative", "pending", "confirmed", "checked_in"] as const;
    let conditions = and(
      eq(reservations.roomId, roomId),
      inArray(reservations.status, activeStatuses as any),
      sql`${reservations.checkInDate} < ${checkOutDate}`,
      sql`${reservations.checkOutDate} > ${checkInDate}`
    );

    if (excludeReservationId) {
      conditions = and(conditions, ne(reservations.id, excludeReservationId));
    }

    const conflicts = await db.select({ cnt: count() }).from(reservations).where(conditions);
    return (conflicts[0]?.cnt ?? 0) > 0;
  }

  async getDashboardStats() {
    const allRooms = await db.select().from(rooms);
    const today = getArgentinaToday();

    const totalRooms = allRooms.length;
    const availableRooms = allRooms.filter(r => r.status === "available").length;
    const occupiedRooms = allRooms.filter(r => r.status === "occupied").length;
    const dirtyRooms = allRooms.filter(r => r.status === "dirty").length;
    const cleaningRooms = allRooms.filter(r => r.status === "cleaning").length;
    const maintenanceRooms = allRooms.filter(r => r.status === "maintenance").length;
    const oosRooms = allRooms.filter(r => r.status === "oos").length;

    const todayCheckInsResult = await db.select({ cnt: count() }).from(reservations).where(
      and(
        eq(reservations.checkInDate, today),
        inArray(reservations.status, ["confirmed", "pending", "tentative"] as any)
      )
    );
    const todayCheckIns = todayCheckInsResult[0]?.cnt ?? 0;

    const todayCheckOutsResult = await db.select({ cnt: count() }).from(reservations).where(
      and(eq(reservations.checkOutDate, today), eq(reservations.status, "checked_in"))
    );
    const todayCheckOuts = todayCheckOutsResult[0]?.cnt ?? 0;

    const occupancyRate = totalRooms > 0 ? Math.round((occupiedRooms / totalRooms) * 100) : 0;

    const totalGuestsResult = await db.select({ cnt: count() }).from(guests);
    const totalGuests = totalGuestsResult[0]?.cnt ?? 0;

    const pendingResult = await db.select({ cnt: count() }).from(reservations).where(
      inArray(reservations.status, ["pending", "tentative"] as any)
    );
    const pendingReservations = pendingResult[0]?.cnt ?? 0;

    return {
      totalRooms,
      availableRooms,
      occupiedRooms,
      dirtyRooms,
      cleaningRooms,
      maintenanceRooms,
      oosRooms,
      todayCheckIns: Number(todayCheckIns),
      todayCheckOuts: Number(todayCheckOuts),
      occupancyRate,
      totalGuests: Number(totalGuests),
      pendingReservations: Number(pendingReservations),
    };
  }

  async getPlanningData(startDate: string, endDate: string): Promise<PlanningData> {
    const allRooms = await this.getRooms();
    const allReservations = await db.select().from(reservations).where(
      and(
        ne(reservations.status, "cancelled"),
        ne(reservations.status, "checked_out"),
        sql`${reservations.checkInDate} <= ${endDate}`,
        sql`${reservations.checkOutDate} >= ${startDate}`
      )
    );
    const allGroupLinks = await db.select().from(groupReservationLinks);
    const allGuests = await db.select().from(guests);
    const allGroups = await db.select().from(groups);

    const guestsMap = new Map(allGuests.map(g => [g.id, g]));
    const groupsMap = new Map(allGroups.map(g => [g.id, g]));
    const groupReservationIds = new Set(allGroupLinks.map(l => l.reservationId));

    const days: string[] = [];
    const start = new Date(startDate);
    const end = new Date(endDate);
    for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
      days.push(d.toISOString().split("T")[0]);
    }

    const occupancy: Record<string, PlanningCellStatus[]> = {};
    const cellReservations: Record<string, Record<string, string>> = {};
    const cellGroupBlocks: Record<string, Record<string, string>> = {};
    const reservationsMap: Record<string, any> = {};
    const groupBlocksMap: Record<string, any> = {};

    for (const res of allReservations) {
      const guest = guestsMap.get(res.guestId);
      if (guest) {
        const isGroupReservation = groupReservationIds.has(res.id);
        let groupName: string | undefined;
        if (isGroupReservation) {
          const link = allGroupLinks.find(l => l.reservationId === res.id);
          if (link) {
            const group = groupsMap.get(link.groupId);
            if (group) groupName = group.name;
          }
        }
        reservationsMap[res.id] = {
          id: res.id,
          guestName: `${guest.firstName} ${guest.lastName}`,
          checkIn: res.checkInDate,
          checkOut: res.checkOutDate,
          status: res.status as ReservationStatus,
          source: res.source as ReservationSource,
          isGroup: isGroupReservation,
          groupName,
          earlyCheckIn: res.earlyCheckIn ?? false,
          earlyCheckInTime: res.earlyCheckInTime ?? null,
          lateCheckOut: res.lateCheckOut ?? false,
          lateCheckOutTime: res.lateCheckOutTime ?? null,
        };
      }
    }

    for (const room of allRooms) {
      occupancy[room.id] = [];
      cellReservations[room.id] = {};
      cellGroupBlocks[room.id] = {};

      const todayStr = getArgentinaToday();

      for (const day of days) {
        if (room.status === "maintenance") {
          occupancy[room.id].push("maintenance");
          continue;
        }
        if (room.status === "dirty" && day === todayStr) {
          occupancy[room.id].push("dirty");
          continue;
        }
        if (room.status === "cleaning" && day === todayStr) {
          occupancy[room.id].push("cleaning");
          continue;
        }

        const reservation = allReservations.find(r => {
          if (r.roomId !== room.id) return false;
          return day >= r.checkInDate && day < r.checkOutDate;
        });

        if (reservation) {
          cellReservations[room.id][day] = reservation.id;
          const isGroupRes = groupReservationIds.has(reservation.id);
          if (isGroupRes) {
            occupancy[room.id].push("group_blocked");
          } else if (reservation.status === "checked_in") {
            if (day === reservation.checkOutDate) {
              occupancy[room.id].push("checkout_today");
            } else {
              occupancy[room.id].push("checked_in");
            }
          } else if (day === reservation.checkInDate && day === todayStr) {
            occupancy[room.id].push("checkin_today");
          } else {
            occupancy[room.id].push("booked");
          }
        } else {
          occupancy[room.id].push("available");
        }
      }

      for (let dayIndex = 0; dayIndex < days.length; dayIndex++) {
        const day = days[dayIndex];
        const currentStatus = occupancy[room.id][dayIndex];
        if (currentStatus !== "available") continue;

        const nextDay = days[dayIndex + 1];
        if (nextDay) {
          const earlyRes = allReservations.find(r =>
            r.roomId === room.id &&
            r.checkInDate === nextDay &&
            !!r.earlyCheckIn
          );
          if (earlyRes) {
            occupancy[room.id][dayIndex] = "early_blocked";
            cellReservations[room.id][day] = earlyRes.id;
            continue;
          }
        }

        const lateRes = allReservations.find(r =>
          r.roomId === room.id &&
          r.checkOutDate === day &&
          !!r.lateCheckOut
        );
        if (lateRes) {
          occupancy[room.id][dayIndex] = "late_blocked";
          cellReservations[room.id][day] = lateRes.id;
        }
      }
    }

    const allBlocks = await db.select().from(groupRoomBlocks);
    const allRoomTypes = await db.select().from(roomTypes);
    const roomTypesMap = new Map(allRoomTypes.map(rt => [rt.id, rt]));
    const allReservationsFull = await db.select().from(reservations).where(
      ne(reservations.status, "cancelled")
    );
    
    const unassignedGroupBlocks: Array<{
      groupId: string;
      groupName: string;
      groupCode: string;
      roomTypeName: string;
      quantity: number;
      assigned: number;
      checkIn: string;
      checkOut: string;
    }> = [];
    
    for (const group of allGroups) {
      if (group.status === "cancelled" || group.status === "finished") continue;
      const groupBlocks = allBlocks.filter(b => b.groupId === group.id);
      const groupLinks = allGroupLinks.filter(l => l.groupId === group.id);
      
      for (const block of groupBlocks) {
        const blockCheckIn = block.blockCheckInDate || group.checkInDate;
        const blockCheckOut = block.blockCheckOutDate || group.checkOutDate;
        
        if (blockCheckOut <= startDate || blockCheckIn >= endDate) continue;
        
        const assignedCount = groupLinks.filter(l => {
          const res = allReservationsFull.find(r => r.id === l.reservationId);
          return res && res.roomTypeId === block.roomTypeId;
        }).length;
        
        if (assignedCount < block.quantity) {
          const rt = roomTypesMap.get(block.roomTypeId);
          unassignedGroupBlocks.push({
            groupId: group.id,
            groupName: group.name,
            groupCode: group.groupCode,
            roomTypeName: rt?.name || "Desconocido",
            quantity: block.quantity,
            assigned: assignedCount,
            checkIn: blockCheckIn,
            checkOut: blockCheckOut,
          });
        }
      }
    }

    return {
      rooms: allRooms,
      days,
      occupancy,
      groupBlocks: groupBlocksMap,
      cellGroupBlocks,
      reservations: reservationsMap,
      cellReservations,
      unassignedGroupBlocks,
    };
  }

  async getOTAChannels(): Promise<OTAChannelWithStats[]> {
    const channels = await db.select().from(otaChannels);
    const logs = await db.select().from(otaReservationLogs);

    return channels.map(channel => {
      const channelLogs = logs.filter(l => l.channelId === channel.id);
      return {
        ...channel,
        totalReservations: channelLogs.length,
        pendingSync: channelLogs.filter(l => l.status === "pending").length,
        totalRevenue: channelLogs.reduce((sum, l) => sum + parseFloat(l.totalAmount || "0"), 0),
        totalCommission: channelLogs.reduce((sum, l) => sum + parseFloat(l.commission || "0"), 0),
      };
    });
  }

  async getOTAChannel(id: string): Promise<OTAChannel | undefined> {
    const [channel] = await db.select().from(otaChannels).where(eq(otaChannels.id, id));
    return channel;
  }

  async createOTAChannel(channel: InsertOTAChannel): Promise<OTAChannel> {
    const [created] = await db.insert(otaChannels).values(channel as any).returning();
    return created;
  }

  async updateOTAChannel(id: string, channel: Partial<InsertOTAChannel>): Promise<OTAChannel | undefined> {
    const [updated] = await db.update(otaChannels).set(channel as any).where(eq(otaChannels.id, id)).returning();
    return updated;
  }

  async deleteOTAChannel(id: string): Promise<boolean> {
    const result = await db.delete(otaChannels).where(eq(otaChannels.id, id));
    return (result.rowCount ?? 0) > 0;
  }

  async getOTAReservationLogs(channelId?: string): Promise<OTAReservationLogWithChannel[]> {
    let logs: OTAReservationLog[];
    if (channelId) {
      logs = await db.select().from(otaReservationLogs).where(eq(otaReservationLogs.channelId, channelId)).orderBy(desc(otaReservationLogs.createdAt));
    } else {
      logs = await db.select().from(otaReservationLogs).orderBy(desc(otaReservationLogs.createdAt));
    }
    const channels = await db.select().from(otaChannels);
    const channelsMap = new Map(channels.map(c => [c.id, c]));
    return logs.map(log => ({ ...log, channel: channelsMap.get(log.channelId)! }));
  }

  async getOTAReservationLog(id: string): Promise<OTAReservationLogWithChannel | undefined> {
    const [log] = await db.select().from(otaReservationLogs).where(eq(otaReservationLogs.id, id));
    if (!log) return undefined;
    const [channel] = await db.select().from(otaChannels).where(eq(otaChannels.id, log.channelId));
    return { ...log, channel };
  }

  async createOTAReservationLog(log: InsertOTAReservationLog): Promise<OTAReservationLog> {
    const [created] = await db.insert(otaReservationLogs).values(log as any).returning();
    return created;
  }

  async updateOTAReservationLog(id: string, log: Partial<InsertOTAReservationLog>): Promise<OTAReservationLog | undefined> {
    const [updated] = await db.update(otaReservationLogs).set(log as any).where(eq(otaReservationLogs.id, id)).returning();
    return updated;
  }

  async syncOTAReservation(logId: string): Promise<Reservation | undefined> {
    const [log] = await db.select().from(otaReservationLogs).where(eq(otaReservationLogs.id, logId));
    if (!log || log.status === "synced") return undefined;

    const [channel] = await db.select().from(otaChannels).where(eq(otaChannels.id, log.channelId));
    if (!channel) return undefined;

    const nameParts = log.guestName.split(" ");
    const firstName = nameParts[0] || "OTA";
    const lastName = nameParts.slice(1).join(" ") || "Guest";

    let [guest] = await db.select().from(guests).where(
      and(eq(guests.firstName, firstName), eq(guests.lastName, lastName))
    );
    if (!guest) {
      guest = await this.createGuest({ firstName, lastName });
    }

    let roomType: RoomType | undefined;
    if (log.roomTypeName) {
      [roomType] = await db.select().from(roomTypes).where(eq(roomTypes.name, log.roomTypeName));
    }
    if (!roomType) {
      [roomType] = await db.select().from(roomTypes).limit(1);
    }
    if (!roomType) return undefined;

    const [availableRoom] = await db.select().from(rooms).where(
      and(eq(rooms.roomTypeId, roomType.id), eq(rooms.status, "available"))
    ).limit(1);
    if (!availableRoom) return undefined;

    const checkIn = new Date(log.checkInDate);
    const checkOut = new Date(log.checkOutDate);
    const nights = Math.ceil((checkOut.getTime() - checkIn.getTime()) / (1000 * 60 * 60 * 24));

    const reservation = await this.createReservation({
      reservationCode: this.generateReservationCode(),
      guestId: guest.id,
      roomTypeId: roomType.id,
      roomId: availableRoom.id,
      ratePlanId: null,
      checkInDate: log.checkInDate,
      checkOutDate: log.checkOutDate,
      nights,
      baseRatePerNight: log.netAmount ? (parseFloat(log.netAmount) / nights).toFixed(2) : null,
      discountType: "none",
      discountValue: "0",
      finalRatePerNight: log.netAmount ? (parseFloat(log.netAmount) / nights).toFixed(2) : null,
      totalRoomAmount: log.netAmount,
      status: "confirmed",
      source: channel.channelType as any,
      otaChannelId: channel.id,
      externalReservationId: log.externalReservationId,
      numberOfGuests: 1,
      notes: `Reserva importada de ${channel.name}`,
      createdAt: new Date(),
      lastModifiedBy: null,
    });

    await this.updateOTAReservationLog(logId, {
      status: "synced",
      internalReservationId: reservation.id,
      syncedAt: new Date(),
    });

    return reservation;
  }

  async getGroups(): Promise<GroupWithDetails[]> {
    const allGroups = await db.select().from(groups).orderBy(desc(groups.createdAt));
    const results: GroupWithDetails[] = [];
    for (const group of allGroups) {
      results.push(await this.buildGroupWithDetails(group));
    }
    return results;
  }

  async getGroup(id: string): Promise<GroupWithDetails | undefined> {
    const [group] = await db.select().from(groups).where(eq(groups.id, id));
    if (!group) return undefined;
    return this.buildGroupWithDetails(group);
  }

  private async buildGroupWithDetails(group: Group): Promise<GroupWithDetails> {
    const blocks = await this.getGroupBlocks(group.id);
    const links = await this.getGroupReservationLinks(group.id);
    const reservationsList: ReservationWithDetails[] = [];
    for (const link of links) {
      const res = await this.getReservation(link.reservationId);
      if (res) reservationsList.push(res);
    }
    const totalRooms = blocks.reduce((sum, b) => sum + b.quantity, 0);
    const assignedRooms = reservationsList.length;
    return { ...group, blocks, reservations: reservationsList, totalRooms, assignedRooms };
  }

  async createGroup(group: InsertGroup): Promise<Group> {
    const [created] = await db.insert(groups).values(group as any).returning();
    return created;
  }

  async updateGroup(id: string, group: Partial<InsertGroup>): Promise<Group | undefined> {
    const safeData: Record<string, any> = {};
    for (const [key, value] of Object.entries(group)) {
      if (["id", "createdAt", "groupCode"].includes(key) || value === undefined) continue;
      safeData[key] = value;
    }
    if (Object.keys(safeData).length === 0) return undefined;
    const [updated] = await db.update(groups).set(safeData).where(eq(groups.id, id)).returning();
    return updated;
  }

  async deleteGroup(id: string): Promise<boolean> {
    const result = await db.delete(groups).where(eq(groups.id, id));
    return (result.rowCount ?? 0) > 0;
  }

  generateGroupCode(): string {
    const now = Date.now();
    const random = Math.floor(Math.random() * 1000);
    return `GRP-${now}-${random}`;
  }

  async getGroupBlocks(groupId: string): Promise<GroupRoomBlockWithDetails[]> {
    const blocks = await db.select().from(groupRoomBlocks).where(eq(groupRoomBlocks.groupId, groupId));
    const types = await db.select().from(roomTypes);
    const plans = await db.select().from(ratePlans);
    const typesMap = new Map(types.map(t => [t.id, t]));
    const plansMap = new Map(plans.map(p => [p.id, p]));
    return blocks.map(b => ({
      ...b,
      roomType: typesMap.get(b.roomTypeId)!,
      ratePlan: b.ratePlanId ? plansMap.get(b.ratePlanId) : undefined,
    }));
  }

  async createGroupBlock(block: InsertGroupRoomBlock): Promise<GroupRoomBlock> {
    const [created] = await db.insert(groupRoomBlocks).values(block as any).returning();
    return created;
  }

  async updateGroupBlock(id: string, block: Partial<InsertGroupRoomBlock>): Promise<GroupRoomBlock | undefined> {
    const [updated] = await db.update(groupRoomBlocks).set(block as any).where(eq(groupRoomBlocks.id, id)).returning();
    return updated;
  }

  async deleteGroupBlock(id: string): Promise<boolean> {
    const result = await db.delete(groupRoomBlocks).where(eq(groupRoomBlocks.id, id));
    return (result.rowCount ?? 0) > 0;
  }

  async getGroupReservationLinks(groupId: string): Promise<GroupReservationLink[]> {
    return db.select().from(groupReservationLinks).where(eq(groupReservationLinks.groupId, groupId));
  }

  async createGroupReservationLink(link: InsertGroupReservationLink): Promise<GroupReservationLink> {
    const [created] = await db.insert(groupReservationLinks).values(link as any).returning();
    return created;
  }

  async assignRoomToGroup(
    groupId: string,
    roomId: string,
    guestFirstName: string,
    guestLastName: string,
    options?: {
      checkInDate?: string;
      checkOutDate?: string;
      agreedRate?: string;
      ratePlanId?: string | null;
    }
  ): Promise<Reservation | undefined> {
    const [group] = await db.select().from(groups).where(eq(groups.id, groupId));
    if (!group) return undefined;

    const [room] = await db.select().from(rooms).where(eq(rooms.id, roomId));
    if (!room) return undefined;

    const guest = await this.createGuest({
      firstName: guestFirstName,
      lastName: guestLastName,
    });

    const blocks = await this.getGroupBlocks(groupId);
    const matchingBlock = blocks.find(b => b.roomTypeId === room.roomTypeId);

    const checkInDate = options?.checkInDate || matchingBlock?.blockCheckInDate || group.checkInDate;
    const checkOutDate = options?.checkOutDate || matchingBlock?.blockCheckOutDate || group.checkOutDate;
    const agreedRate = options?.agreedRate || matchingBlock?.agreedRate || "0";
    const ratePlanId = options?.ratePlanId !== undefined ? options.ratePlanId : (matchingBlock?.ratePlanId || null);

    const checkIn = new Date(checkInDate);
    const checkOut = new Date(checkOutDate);
    const nights = Math.ceil((checkOut.getTime() - checkIn.getTime()) / (1000 * 60 * 60 * 24));

    const reservation = await this.createReservation({
      reservationCode: `G${group.groupCode}-${room.roomNumber}`,
      guestId: guest.id,
      roomTypeId: room.roomTypeId,
      roomId: room.id,
      ratePlanId,
      checkInDate,
      checkOutDate,
      nights,
      baseRatePerNight: agreedRate,
      discountType: "none",
      discountValue: "0",
      finalRatePerNight: agreedRate,
      totalRoomAmount: (parseFloat(agreedRate) * nights).toFixed(2),
      status: "confirmed",
      source: "empresa",
      otaChannelId: null,
      externalReservationId: null,
      numberOfGuests: 1,
      notes: `Grupo: ${group.name}`,
      createdAt: new Date(),
      lastModifiedBy: null,
    });

    await this.createGroupReservationLink({
      groupId,
      reservationId: reservation.id,
    });

    return reservation;
  }

  async getGuestReviews(): Promise<GuestReviewWithDetails[]> {
    const reviews = await db.select().from(guestReviews).orderBy(desc(guestReviews.reviewDate));
    const allGuests = await db.select().from(guests);
    const allRooms = await db.select().from(rooms);
    const allRes = await db.select().from(reservations);
    const guestsMap = new Map(allGuests.map(g => [g.id, g]));
    const roomsMap = new Map(allRooms.map(r => [r.id, r]));
    const resMap = new Map(allRes.map(r => [r.id, r]));

    return reviews.map(r => ({
      ...r,
      guest: guestsMap.get(r.guestId)!,
      room: r.roomId ? roomsMap.get(r.roomId) : undefined,
      reservation: r.reservationId ? resMap.get(r.reservationId) : undefined,
    }));
  }

  async getGuestReview(id: string): Promise<GuestReviewWithDetails | undefined> {
    const [review] = await db.select().from(guestReviews).where(eq(guestReviews.id, id));
    if (!review) return undefined;
    const [guest] = await db.select().from(guests).where(eq(guests.id, review.guestId));
    const room = review.roomId ? (await db.select().from(rooms).where(eq(rooms.id, review.roomId)))[0] : undefined;
    const reservation = review.reservationId ? (await db.select().from(reservations).where(eq(reservations.id, review.reservationId)))[0] : undefined;
    return { ...review, guest, room, reservation };
  }

  async getGuestReviewsByGuest(guestId: string): Promise<GuestReviewWithDetails[]> {
    const reviews = await db.select().from(guestReviews).where(eq(guestReviews.guestId, guestId)).orderBy(desc(guestReviews.reviewDate));
    const [guest] = await db.select().from(guests).where(eq(guests.id, guestId));
    const allRooms = await db.select().from(rooms);
    const allRes = await db.select().from(reservations);
    const roomsMap = new Map(allRooms.map(r => [r.id, r]));
    const resMap = new Map(allRes.map(r => [r.id, r]));

    return reviews.map(r => ({
      ...r,
      guest,
      room: r.roomId ? roomsMap.get(r.roomId) : undefined,
      reservation: r.reservationId ? resMap.get(r.reservationId) : undefined,
    }));
  }

  async createGuestReview(review: InsertGuestReview): Promise<GuestReview> {
    const [created] = await db.insert(guestReviews).values(review as any).returning();
    return created;
  }

  async updateGuestReview(id: string, review: Partial<InsertGuestReview>): Promise<GuestReview | undefined> {
    const [updated] = await db.update(guestReviews).set(review as any).where(eq(guestReviews.id, id)).returning();
    return updated;
  }

  async deleteGuestReview(id: string): Promise<boolean> {
    const result = await db.delete(guestReviews).where(eq(guestReviews.id, id));
    return (result.rowCount ?? 0) > 0;
  }

  async getReviewAnalyticsSummary() {
    const reviews = await db.select().from(guestReviews);
    const totalReviews = reviews.length;
    const averageRating = totalReviews > 0
      ? reviews.reduce((sum, r) => sum + r.rating, 0) / totalReviews
      : 0;

    const sentimentBreakdown = {
      positive: reviews.filter(r => r.sentiment === "positive").length,
      neutral: reviews.filter(r => r.sentiment === "neutral").length,
      negative: reviews.filter(r => r.sentiment === "negative").length,
    };

    const categoryMap = new Map<string, { count: number; totalScore: number }>();
    reviews.forEach(r => {
      if (r.categories) {
        r.categories.forEach(cat => {
          const existing = categoryMap.get(cat) || { count: 0, totalScore: 0 };
          const score = r.sentimentScore ? parseFloat(r.sentimentScore) : 0.5;
          categoryMap.set(cat, { count: existing.count + 1, totalScore: existing.totalScore + score });
        });
      }
    });

    const topCategories = Array.from(categoryMap.entries())
      .map(([category, data]) => ({
        category,
        count: data.count,
        avgSentiment: data.totalScore / data.count,
      }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 5);

    const dateMap = new Map<string, { total: number; count: number }>();
    reviews.forEach(r => {
      const date = r.reviewDate.split("T")[0];
      const existing = dateMap.get(date) || { total: 0, count: 0 };
      dateMap.set(date, { total: existing.total + r.rating, count: existing.count + 1 });
    });

    const recentTrend = Array.from(dateMap.entries())
      .map(([date, data]) => ({
        date,
        avgRating: data.total / data.count,
        count: data.count,
      }))
      .sort((a, b) => a.date.localeCompare(b.date))
      .slice(-7);

    const improvementAreas: string[] = [];
    reviews
      .filter(r => r.sentiment === "negative" && r.improvementSuggestions)
      .forEach(r => {
        if (r.improvementSuggestions) {
          improvementAreas.push(...r.improvementSuggestions);
        }
      });

    return {
      totalReviews,
      averageRating: Math.round(averageRating * 10) / 10,
      sentimentBreakdown,
      topCategories,
      recentTrend,
      improvementAreas: Array.from(new Set(improvementAreas)).slice(0, 10),
    };
  }

  async getHousekeepingTasks(date?: string): Promise<HousekeepingTaskWithRoom[]> {
    let tasks: HousekeepingTask[];
    if (date) {
      tasks = await db.select().from(housekeepingTasks).where(eq(housekeepingTasks.scheduledDate, date));
    } else {
      tasks = await db.select().from(housekeepingTasks);
    }

    const allRooms = await db.select().from(rooms);
    const allRoomTypes = await db.select().from(roomTypes);
    const roomsMap = new Map(allRooms.map(r => [r.id, r]));
    const typesMap = new Map(allRoomTypes.map(t => [t.id, t]));

    return tasks.map(task => {
      const room = roomsMap.get(task.roomId);
      const roomType = room ? typesMap.get(room.roomTypeId) : undefined;
      return { ...task, room: { ...room!, roomType } };
    }).sort((a, b) => {
      const priorityOrder: Record<string, number> = { urgent: 0, high: 1, normal: 2, low: 3 };
      return (priorityOrder[a.priority] ?? 2) - (priorityOrder[b.priority] ?? 2);
    });
  }

  async getHousekeepingTask(id: string): Promise<HousekeepingTaskWithRoom | undefined> {
    const [task] = await db.select().from(housekeepingTasks).where(eq(housekeepingTasks.id, id));
    if (!task) return undefined;
    const [room] = await db.select().from(rooms).where(eq(rooms.id, task.roomId));
    const roomType = room ? (await db.select().from(roomTypes).where(eq(roomTypes.id, room.roomTypeId)))[0] : undefined;
    return { ...task, room: { ...room!, roomType } };
  }

  async getHousekeepingTasksByRoom(roomId: string): Promise<HousekeepingTask[]> {
    return db.select().from(housekeepingTasks).where(eq(housekeepingTasks.roomId, roomId));
  }

  async createHousekeepingTask(task: InsertHousekeepingTask): Promise<HousekeepingTask> {
    const [created] = await db.insert(housekeepingTasks).values(task as any).returning();
    return created;
  }

  async updateHousekeepingTask(id: string, task: Partial<InsertHousekeepingTask>): Promise<HousekeepingTask | undefined> {
    const [updated] = await db.update(housekeepingTasks).set(task as any).where(eq(housekeepingTasks.id, id)).returning();
    return updated;
  }

  async deleteHousekeepingTask(id: string): Promise<boolean> {
    const result = await db.delete(housekeepingTasks).where(eq(housekeepingTasks.id, id));
    return (result.rowCount ?? 0) > 0;
  }

  async createCheckoutCleaningTask(roomId: string): Promise<HousekeepingTask> {
    const today = getArgentinaToday();
    return this.createHousekeepingTask({
      roomId,
      taskType: "checkout_clean",
      status: "pending",
      priority: "high",
      scheduledDate: today,
      createdAt: new Date(),
    });
  }

  async getRestaurantAreas(): Promise<RestaurantArea[]> {
    return db.select().from(restaurantAreas).where(eq(restaurantAreas.isActive, "true"));
  }

  async getRestaurantArea(id: string): Promise<RestaurantArea | undefined> {
    const [area] = await db.select().from(restaurantAreas).where(eq(restaurantAreas.id, id));
    return area;
  }

  async createRestaurantArea(area: InsertRestaurantArea): Promise<RestaurantArea> {
    const [created] = await db.insert(restaurantAreas).values(area as any).returning();
    return created;
  }

  async updateRestaurantArea(id: string, area: Partial<InsertRestaurantArea>): Promise<RestaurantArea | undefined> {
    const [updated] = await db.update(restaurantAreas).set(area as any).where(eq(restaurantAreas.id, id)).returning();
    return updated;
  }

  async deleteRestaurantArea(id: string): Promise<boolean> {
    const result = await db.delete(restaurantAreas).where(eq(restaurantAreas.id, id));
    return (result.rowCount ?? 0) > 0;
  }

  async getRestaurantTables(): Promise<RestaurantTableWithArea[]> {
    const tables = await db.select().from(restaurantTables).where(eq(restaurantTables.isActive, "true"));
    const areas = await db.select().from(restaurantAreas);
    const areasMap = new Map(areas.map(a => [a.id, a]));
    return tables.map(t => ({ ...t, area: areasMap.get(t.areaId)! }));
  }

  async getRestaurantTable(id: string): Promise<RestaurantTableWithArea | undefined> {
    const [table] = await db.select().from(restaurantTables).where(eq(restaurantTables.id, id));
    if (!table) return undefined;
    const [area] = await db.select().from(restaurantAreas).where(eq(restaurantAreas.id, table.areaId));
    return { ...table, area };
  }

  async getTablesByArea(areaId: string): Promise<RestaurantTable[]> {
    return db.select().from(restaurantTables).where(eq(restaurantTables.areaId, areaId));
  }

  async createRestaurantTable(table: InsertRestaurantTable): Promise<RestaurantTable> {
    const [created] = await db.insert(restaurantTables).values(table as any).returning();
    return created;
  }

  async updateRestaurantTable(id: string, table: Partial<InsertRestaurantTable>): Promise<RestaurantTable | undefined> {
    const [updated] = await db.update(restaurantTables).set(table as any).where(eq(restaurantTables.id, id)).returning();
    return updated;
  }

  async deleteRestaurantTable(id: string): Promise<boolean> {
    const result = await db.delete(restaurantTables).where(eq(restaurantTables.id, id));
    return (result.rowCount ?? 0) > 0;
  }

  async getMenuCategories(): Promise<MenuCategory[]> {
    return db.select().from(menuCategories);
  }

  async getMenuCategory(id: string): Promise<MenuCategory | undefined> {
    const [cat] = await db.select().from(menuCategories).where(eq(menuCategories.id, id));
    return cat;
  }

  async createMenuCategory(category: InsertMenuCategory): Promise<MenuCategory> {
    const [created] = await db.insert(menuCategories).values(category as any).returning();
    return created;
  }

  async updateMenuCategory(id: string, category: Partial<InsertMenuCategory>): Promise<MenuCategory | undefined> {
    const [updated] = await db.update(menuCategories).set(category as any).where(eq(menuCategories.id, id)).returning();
    return updated;
  }

  async deleteMenuCategory(id: string): Promise<boolean> {
    const result = await db.delete(menuCategories).where(eq(menuCategories.id, id));
    return (result.rowCount ?? 0) > 0;
  }

  async getMenuItems(): Promise<MenuItemWithCategory[]> {
    const items = await db.select().from(menuItems);
    const cats = await db.select().from(menuCategories);
    const catsMap = new Map(cats.map(c => [c.id, c]));
    return items.map(i => ({ ...i, category: catsMap.get(i.categoryId)! }));
  }

  async getMenuItem(id: string): Promise<MenuItemWithCategory | undefined> {
    const [item] = await db.select().from(menuItems).where(eq(menuItems.id, id));
    if (!item) return undefined;
    const [cat] = await db.select().from(menuCategories).where(eq(menuCategories.id, item.categoryId));
    return { ...item, category: cat };
  }

  async getMenuItemsByCategory(categoryId: string): Promise<MenuItem[]> {
    return db.select().from(menuItems).where(eq(menuItems.categoryId, categoryId));
  }

  async createMenuItem(item: InsertMenuItem): Promise<MenuItem> {
    const [created] = await db.insert(menuItems).values(item as any).returning();
    return created;
  }

  async updateMenuItem(id: string, item: Partial<InsertMenuItem>): Promise<MenuItem | undefined> {
    const [updated] = await db.update(menuItems).set(item as any).where(eq(menuItems.id, id)).returning();
    return updated;
  }

  async deleteMenuItem(id: string): Promise<boolean> {
    const result = await db.delete(menuItems).where(eq(menuItems.id, id));
    return (result.rowCount ?? 0) > 0;
  }

  async getRestaurantOrders(status?: OrderStatus): Promise<RestaurantOrderWithDetails[]> {
    let orders: RestaurantOrder[];
    if (status) {
      orders = await db.select().from(restaurantOrders).where(eq(restaurantOrders.status, status));
    } else {
      orders = await db.select().from(restaurantOrders);
    }

    const allTables = await db.select().from(restaurantTables);
    const allAreas = await db.select().from(restaurantAreas);
    const allGuests2 = await db.select().from(guests);
    const allOrderItems = await db.select().from(orderItems);
    const allMenuItems = await db.select().from(menuItems);

    const tablesMap = new Map(allTables.map(t => [t.id, t]));
    const areasMap = new Map(allAreas.map(a => [a.id, a]));
    const guestsMap = new Map(allGuests2.map(g => [g.id, g]));
    const menuItemsMap = new Map(allMenuItems.map(m => [m.id, m]));

    return orders.map(order => {
      const table = order.tableId ? tablesMap.get(order.tableId) : undefined;
      const tableArea = table ? areasMap.get(table.areaId) : undefined;
      const area = order.areaId ? areasMap.get(order.areaId) : tableArea;
      const guest = order.guestId ? guestsMap.get(order.guestId) : undefined;
      const items = allOrderItems
        .filter(i => i.orderId === order.id)
        .map(item => ({ ...item, menuItem: menuItemsMap.get(item.menuItemId)! }));
      return {
        ...order,
        table: table ? { ...table, area: tableArea! } : undefined,
        area,
        guest,
        items,
      };
    }).sort((a, b) => new Date(b.openedAt).getTime() - new Date(a.openedAt).getTime());
  }

  async getRestaurantOrder(id: string): Promise<RestaurantOrderWithDetails | undefined> {
    const [order] = await db.select().from(restaurantOrders).where(eq(restaurantOrders.id, id));
    if (!order) return undefined;

    const table = order.tableId ? (await db.select().from(restaurantTables).where(eq(restaurantTables.id, order.tableId)))[0] : undefined;
    const tableArea = table ? (await db.select().from(restaurantAreas).where(eq(restaurantAreas.id, table.areaId)))[0] : undefined;
    const area = order.areaId ? (await db.select().from(restaurantAreas).where(eq(restaurantAreas.id, order.areaId)))[0] : tableArea;
    const guest = order.guestId ? (await db.select().from(guests).where(eq(guests.id, order.guestId)))[0] : undefined;

    const allOrderItems = await db.select().from(orderItems).where(eq(orderItems.orderId, order.id));
    const allMenuItems = await db.select().from(menuItems);
    const menuItemsMap = new Map(allMenuItems.map(m => [m.id, m]));

    const items = allOrderItems.map(item => ({ ...item, menuItem: menuItemsMap.get(item.menuItemId)! }));

    return {
      ...order,
      table: table ? { ...table, area: tableArea! } : undefined,
      area,
      guest,
      items,
    };
  }

  async getOrdersByTable(tableId: string): Promise<RestaurantOrder[]> {
    return db.select().from(restaurantOrders).where(eq(restaurantOrders.tableId, tableId));
  }

  async createRestaurantOrder(order: InsertRestaurantOrder): Promise<RestaurantOrder> {
    const [created] = await db.insert(restaurantOrders).values(order as any).returning();
    return created;
  }

  async updateRestaurantOrder(id: string, order: Partial<InsertRestaurantOrder>): Promise<RestaurantOrder | undefined> {
    const [updated] = await db.update(restaurantOrders).set(order as any).where(eq(restaurantOrders.id, id)).returning();
    return updated;
  }

  async deleteRestaurantOrder(id: string): Promise<boolean> {
    const result = await db.delete(restaurantOrders).where(eq(restaurantOrders.id, id));
    return (result.rowCount ?? 0) > 0;
  }

  generateOrderNumber(): string {
    const today = new Date();
    const dateStr = `${today.getFullYear()}${String(today.getMonth() + 1).padStart(2, "0")}${String(today.getDate()).padStart(2, "0")}`;
    const random = Math.floor(Math.random() * 10000);
    return `ORD-${dateStr}-${random}`;
  }

  async getOrderItems(orderId: string): Promise<OrderItem[]> {
    return db.select().from(orderItems).where(eq(orderItems.orderId, orderId));
  }

  async createOrderItem(item: InsertOrderItem): Promise<OrderItem> {
    const [created] = await db.insert(orderItems).values(item as any).returning();
    return created;
  }

  async updateOrderItem(id: string, item: Partial<InsertOrderItem>): Promise<OrderItem | undefined> {
    const [updated] = await db.update(orderItems).set(item as any).where(eq(orderItems.id, id)).returning();
    return updated;
  }

  async deleteOrderItem(id: string): Promise<boolean> {
    const result = await db.delete(orderItems).where(eq(orderItems.id, id));
    return (result.rowCount ?? 0) > 0;
  }

  async getTableReservations(): Promise<TableReservationWithTable[]> {
    const res = await db.select().from(tableReservations);
    const tables = await db.select().from(restaurantTables);
    const tablesMap = new Map(tables.map(t => [t.id, t]));
    return res.map(r => ({ ...r, table: tablesMap.get(r.tableId)! }));
  }

  async getTableReservation(id: string): Promise<TableReservationWithTable | undefined> {
    const [res] = await db.select().from(tableReservations).where(eq(tableReservations.id, id));
    if (!res) return undefined;
    const [table] = await db.select().from(restaurantTables).where(eq(restaurantTables.id, res.tableId));
    return { ...res, table };
  }

  async getTableReservationsByDate(date: string): Promise<TableReservationWithTable[]> {
    const res = await db.select().from(tableReservations).where(eq(tableReservations.reservationDate, date));
    const tables = await db.select().from(restaurantTables);
    const tablesMap = new Map(tables.map(t => [t.id, t]));
    return res.map(r => ({ ...r, table: tablesMap.get(r.tableId)! }));
  }

  async getTableReservationsByTable(tableId: string): Promise<TableReservation[]> {
    return db.select().from(tableReservations).where(eq(tableReservations.tableId, tableId));
  }

  async createTableReservation(reservation: InsertTableReservation): Promise<TableReservation> {
    const [created] = await db.insert(tableReservations).values(reservation as any).returning();
    return created;
  }

  async updateTableReservation(id: string, reservation: Partial<InsertTableReservation>): Promise<TableReservation | undefined> {
    const [updated] = await db.update(tableReservations).set(reservation as any).where(eq(tableReservations.id, id)).returning();
    return updated;
  }

  async deleteTableReservation(id: string): Promise<boolean> {
    const result = await db.delete(tableReservations).where(eq(tableReservations.id, id));
    return (result.rowCount ?? 0) > 0;
  }

  async getRestaurantTimeSlots(): Promise<RestaurantTimeSlot[]> {
    return db.select().from(restaurantTimeSlots);
  }

  async createRestaurantTimeSlot(slot: InsertRestaurantTimeSlot): Promise<RestaurantTimeSlot> {
    const [created] = await db.insert(restaurantTimeSlots).values(slot as any).returning();
    return created;
  }

  async updateRestaurantTimeSlot(id: string, slot: Partial<InsertRestaurantTimeSlot>): Promise<RestaurantTimeSlot | undefined> {
    const [updated] = await db.update(restaurantTimeSlots).set(slot as any).where(eq(restaurantTimeSlots.id, id)).returning();
    return updated;
  }

  async deleteRestaurantTimeSlot(id: string): Promise<boolean> {
    const result = await db.delete(restaurantTimeSlots).where(eq(restaurantTimeSlots.id, id));
    return (result.rowCount ?? 0) > 0;
  }

  async getRecipes(): Promise<RecipeWithIngredients[]> {
    const allRecipes = await db.select().from(recipes);
    const allIngredients = await db.select().from(recipeIngredients);
    const allMenuItemsList = await db.select().from(menuItems);
    const menuItemsMap = new Map(allMenuItemsList.map(m => [m.id, m]));

    return allRecipes.map(recipe => ({
      ...recipe,
      menuItem: menuItemsMap.get(recipe.menuItemId),
      ingredients: allIngredients.filter(i => i.recipeId === recipe.id),
    }));
  }

  async getRecipe(id: string): Promise<RecipeWithIngredients | undefined> {
    const [recipe] = await db.select().from(recipes).where(eq(recipes.id, id));
    if (!recipe) return undefined;
    const ingredients = await db.select().from(recipeIngredients).where(eq(recipeIngredients.recipeId, id));
    const menuItem = (await db.select().from(menuItems).where(eq(menuItems.id, recipe.menuItemId)))[0];
    return { ...recipe, menuItem, ingredients };
  }

  async getRecipeByMenuItem(menuItemId: string): Promise<RecipeWithIngredients | undefined> {
    const [recipe] = await db.select().from(recipes).where(eq(recipes.menuItemId, menuItemId));
    if (!recipe) return undefined;
    const ingredients = await db.select().from(recipeIngredients).where(eq(recipeIngredients.recipeId, recipe.id));
    const menuItem = (await db.select().from(menuItems).where(eq(menuItems.id, recipe.menuItemId)))[0];
    return { ...recipe, menuItem, ingredients };
  }

  async createRecipe(recipe: InsertRecipe): Promise<Recipe> {
    const [created] = await db.insert(recipes).values(recipe as any).returning();
    return created;
  }

  async updateRecipe(id: string, recipe: Partial<InsertRecipe>): Promise<Recipe | undefined> {
    const [updated] = await db.update(recipes).set(recipe as any).where(eq(recipes.id, id)).returning();
    return updated;
  }

  async deleteRecipe(id: string): Promise<boolean> {
    await db.delete(recipeIngredients).where(eq(recipeIngredients.recipeId, id));
    const result = await db.delete(recipes).where(eq(recipes.id, id));
    return (result.rowCount ?? 0) > 0;
  }

  async getRecipeIngredients(recipeId: string): Promise<RecipeIngredient[]> {
    return db.select().from(recipeIngredients).where(eq(recipeIngredients.recipeId, recipeId));
  }

  async createRecipeIngredient(ingredient: InsertRecipeIngredient): Promise<RecipeIngredient> {
    const [created] = await db.insert(recipeIngredients).values(ingredient as any).returning();
    return created;
  }

  async updateRecipeIngredient(id: string, ingredient: Partial<InsertRecipeIngredient>): Promise<RecipeIngredient | undefined> {
    const [updated] = await db.update(recipeIngredients).set(ingredient as any).where(eq(recipeIngredients.id, id)).returning();
    return updated;
  }

  async deleteRecipeIngredient(id: string): Promise<boolean> {
    const result = await db.delete(recipeIngredients).where(eq(recipeIngredients.id, id));
    return (result.rowCount ?? 0) > 0;
  }

  async getOrderSplits(orderId: string): Promise<OrderSplit[]> {
    return db.select().from(orderSplits).where(eq(orderSplits.orderId, orderId));
  }

  async createOrderSplit(split: InsertOrderSplit): Promise<OrderSplit> {
    const [created] = await db.insert(orderSplits).values(split as any).returning();
    return created;
  }

  async updateOrderSplit(id: string, split: Partial<InsertOrderSplit>): Promise<OrderSplit | undefined> {
    const [updated] = await db.update(orderSplits).set(split as any).where(eq(orderSplits.id, id)).returning();
    return updated;
  }

  async deleteOrderSplitsByOrder(orderId: string): Promise<boolean> {
    const result = await db.delete(orderSplits).where(eq(orderSplits.orderId, orderId));
    return (result.rowCount ?? 0) >= 0;
  }

  async getItemCategories(): Promise<ItemCategory[]> {
    return db.select().from(itemCategories);
  }

  async getItemCategory(id: string): Promise<ItemCategory | undefined> {
    const [cat] = await db.select().from(itemCategories).where(eq(itemCategories.id, id));
    return cat;
  }

  async createItemCategory(category: InsertItemCategory): Promise<ItemCategory> {
    const [created] = await db.insert(itemCategories).values(category as any).returning();
    return created;
  }

  async updateItemCategory(id: string, category: Partial<InsertItemCategory>): Promise<ItemCategory | undefined> {
    const [updated] = await db.update(itemCategories).set(category as any).where(eq(itemCategories.id, id)).returning();
    return updated;
  }

  async deleteItemCategory(id: string): Promise<boolean> {
    const result = await db.delete(itemCategories).where(eq(itemCategories.id, id));
    return (result.rowCount ?? 0) > 0;
  }

  async getSuppliers(): Promise<Supplier[]> {
    return db.select().from(suppliers);
  }

  async getSupplier(id: string): Promise<Supplier | undefined> {
    const [supplier] = await db.select().from(suppliers).where(eq(suppliers.id, id));
    return supplier;
  }

  async createSupplier(supplier: InsertSupplier): Promise<Supplier> {
    const [created] = await db.insert(suppliers).values(supplier as any).returning();
    return created;
  }

  async updateSupplier(id: string, supplier: Partial<InsertSupplier>): Promise<Supplier | undefined> {
    const [updated] = await db.update(suppliers).set(supplier as any).where(eq(suppliers.id, id)).returning();
    return updated;
  }

  async deleteSupplier(id: string): Promise<boolean> {
    const result = await db.delete(suppliers).where(eq(suppliers.id, id));
    return (result.rowCount ?? 0) > 0;
  }

  async getInventoryItems(): Promise<InventoryItemWithDetails[]> {
    const items = await db.select().from(inventoryItems);
    const cats = await db.select().from(itemCategories);
    const sups = await db.select().from(suppliers);
    const catsMap = new Map(cats.map(c => [c.id, c]));
    const supsMap = new Map(sups.map(s => [s.id, s]));
    return items.map(i => ({
      ...i,
      category: i.categoryId ? catsMap.get(i.categoryId) : undefined,
      supplier: i.supplierId ? supsMap.get(i.supplierId) : undefined,
    }));
  }

  async getInventoryItem(id: string): Promise<InventoryItemWithDetails | undefined> {
    const [item] = await db.select().from(inventoryItems).where(eq(inventoryItems.id, id));
    if (!item) return undefined;
    const category = item.categoryId ? (await db.select().from(itemCategories).where(eq(itemCategories.id, item.categoryId)))[0] : undefined;
    const supplier = item.supplierId ? (await db.select().from(suppliers).where(eq(suppliers.id, item.supplierId)))[0] : undefined;
    return { ...item, category, supplier };
  }

  async getInventoryItemsBelowMinStock(): Promise<InventoryItem[]> {
    return db.select().from(inventoryItems).where(
      sql`${inventoryItems.currentStock} < ${inventoryItems.minStock}`
    );
  }

  async createInventoryItem(item: InsertInventoryItem): Promise<InventoryItem> {
    const [created] = await db.insert(inventoryItems).values(item as any).returning();
    return created;
  }

  async updateInventoryItem(id: string, item: Partial<InsertInventoryItem>): Promise<InventoryItem | undefined> {
    const [updated] = await db.update(inventoryItems).set(item as any).where(eq(inventoryItems.id, id)).returning();
    return updated;
  }

  async deleteInventoryItem(id: string): Promise<boolean> {
    const result = await db.delete(inventoryItems).where(eq(inventoryItems.id, id));
    return (result.rowCount ?? 0) > 0;
  }

  async getStockMovements(itemId?: string): Promise<StockMovementWithItem[]> {
    let movements: StockMovement[];
    if (itemId) {
      movements = await db.select().from(stockMovements).where(eq(stockMovements.itemId, itemId)).orderBy(desc(stockMovements.createdAt));
    } else {
      movements = await db.select().from(stockMovements).orderBy(desc(stockMovements.createdAt));
    }
    const items = await db.select().from(inventoryItems);
    const itemsMap = new Map(items.map(i => [i.id, i]));
    return movements.map(m => ({ ...m, item: itemsMap.get(m.itemId)! }));
  }

  async createStockMovement(movement: InsertStockMovement): Promise<StockMovement> {
    const [created] = await db.insert(stockMovements).values(movement as any).returning();
    return created;
  }

  async getSpaCabins(): Promise<SpaCabin[]> {
    return db.select().from(spaCabins);
  }

  async getSpaCabin(id: string): Promise<SpaCabin | undefined> {
    const [cabin] = await db.select().from(spaCabins).where(eq(spaCabins.id, id));
    return cabin;
  }

  async createSpaCabin(cabin: InsertSpaCabin): Promise<SpaCabin> {
    const [created] = await db.insert(spaCabins).values(cabin as any).returning();
    return created;
  }

  async updateSpaCabin(id: string, cabin: Partial<InsertSpaCabin>): Promise<SpaCabin | undefined> {
    const [updated] = await db.update(spaCabins).set(cabin as any).where(eq(spaCabins.id, id)).returning();
    return updated;
  }

  async deleteSpaCabin(id: string): Promise<boolean> {
    const result = await db.delete(spaCabins).where(eq(spaCabins.id, id));
    return (result.rowCount ?? 0) > 0;
  }

  async getSpaTreatmentCategories(): Promise<SpaTreatmentCategory[]> {
    return db.select().from(spaTreatmentCategories);
  }

  async getSpaTreatmentCategory(id: string): Promise<SpaTreatmentCategory | undefined> {
    const [cat] = await db.select().from(spaTreatmentCategories).where(eq(spaTreatmentCategories.id, id));
    return cat;
  }

  async createSpaTreatmentCategory(category: InsertSpaTreatmentCategory): Promise<SpaTreatmentCategory> {
    const [created] = await db.insert(spaTreatmentCategories).values(category as any).returning();
    return created;
  }

  async updateSpaTreatmentCategory(id: string, category: Partial<InsertSpaTreatmentCategory>): Promise<SpaTreatmentCategory | undefined> {
    const [updated] = await db.update(spaTreatmentCategories).set(category as any).where(eq(spaTreatmentCategories.id, id)).returning();
    return updated;
  }

  async deleteSpaTreatmentCategory(id: string): Promise<boolean> {
    const result = await db.delete(spaTreatmentCategories).where(eq(spaTreatmentCategories.id, id));
    return (result.rowCount ?? 0) > 0;
  }

  async getSpaTreatments(): Promise<SpaTreatment[]> {
    return db.select().from(spaTreatments).where(eq(spaTreatments.isActive, "true"));
  }

  async getSpaTreatment(id: string): Promise<SpaTreatment | undefined> {
    const [treatment] = await db.select().from(spaTreatments).where(eq(spaTreatments.id, id));
    return treatment;
  }

  async getSpaTreatmentsByCategory(categoryId: string): Promise<SpaTreatment[]> {
    return db.select().from(spaTreatments).where(
      and(eq(spaTreatments.categoryId, categoryId), eq(spaTreatments.isActive, "true"))
    );
  }

  async createSpaTreatment(treatment: InsertSpaTreatment): Promise<SpaTreatment> {
    const [created] = await db.insert(spaTreatments).values(treatment as any).returning();
    return created;
  }

  async updateSpaTreatment(id: string, treatment: Partial<InsertSpaTreatment>): Promise<SpaTreatment | undefined> {
    const [updated] = await db.update(spaTreatments).set(treatment as any).where(eq(spaTreatments.id, id)).returning();
    return updated;
  }

  async deleteSpaTreatment(id: string): Promise<boolean> {
    const result = await db.delete(spaTreatments).where(eq(spaTreatments.id, id));
    return (result.rowCount ?? 0) > 0;
  }

  async getSpaAppointments(date?: string): Promise<SpaAppointmentWithDetails[]> {
    let appointments: SpaAppointment[];
    if (date) {
      appointments = await db.select().from(spaAppointments).where(eq(spaAppointments.appointmentDate, date));
    } else {
      appointments = await db.select().from(spaAppointments);
    }
    const cabins = await db.select().from(spaCabins);
    const treatments = await db.select().from(spaTreatments);
    const cabinsMap = new Map(cabins.map(c => [c.id, c]));
    const treatmentsMap = new Map(treatments.map(t => [t.id, t]));

    return appointments.map(a => ({
      ...a,
      cabin: cabinsMap.get(a.cabinId)!,
      treatment: treatmentsMap.get(a.treatmentId)!,
    })).sort((a, b) => a.startTime.localeCompare(b.startTime));
  }

  async getSpaAppointment(id: string): Promise<SpaAppointmentWithDetails | undefined> {
    const [appt] = await db.select().from(spaAppointments).where(eq(spaAppointments.id, id));
    if (!appt) return undefined;
    const [cabin] = await db.select().from(spaCabins).where(eq(spaCabins.id, appt.cabinId));
    const [treatment] = await db.select().from(spaTreatments).where(eq(spaTreatments.id, appt.treatmentId));
    return { ...appt, cabin, treatment };
  }

  async getSpaAppointmentsByCabin(cabinId: string, date: string): Promise<SpaAppointment[]> {
    return db.select().from(spaAppointments).where(
      and(eq(spaAppointments.cabinId, cabinId), eq(spaAppointments.appointmentDate, date))
    );
  }

  async getSpaAppointmentsByDateRange(startDate: string, endDate: string): Promise<SpaAppointmentWithDetails[]> {
    const appointments = await db.select().from(spaAppointments).where(
      and(
        sql`${spaAppointments.appointmentDate} >= ${startDate}`,
        sql`${spaAppointments.appointmentDate} <= ${endDate}`
      )
    );
    const cabins = await db.select().from(spaCabins);
    const treatments = await db.select().from(spaTreatments);
    const cabinsMap = new Map(cabins.map(c => [c.id, c]));
    const treatmentsMap = new Map(treatments.map(t => [t.id, t]));

    return appointments.map(a => ({
      ...a,
      cabin: cabinsMap.get(a.cabinId)!,
      treatment: treatmentsMap.get(a.treatmentId)!,
    })).sort((a, b) => {
      if (a.appointmentDate !== b.appointmentDate) {
        return a.appointmentDate.localeCompare(b.appointmentDate);
      }
      return a.startTime.localeCompare(b.startTime);
    });
  }

  async createSpaAppointment(appointment: InsertSpaAppointment): Promise<SpaAppointment> {
    const [created] = await db.insert(spaAppointments).values(appointment as any).returning();
    return created;
  }

  async updateSpaAppointment(id: string, appointment: Partial<InsertSpaAppointment>): Promise<SpaAppointment | undefined> {
    const [updated] = await db.update(spaAppointments).set(appointment as any).where(eq(spaAppointments.id, id)).returning();
    return updated;
  }

  async deleteSpaAppointment(id: string): Promise<boolean> {
    const result = await db.delete(spaAppointments).where(eq(spaAppointments.id, id));
    return (result.rowCount ?? 0) > 0;
  }

  async getSpaAccounts(status?: SpaAccountStatus): Promise<SpaAccountWithItems[]> {
    let accounts: SpaAccount[];
    if (status) {
      accounts = await db.select().from(spaAccounts).where(eq(spaAccounts.status, status));
    } else {
      accounts = await db.select().from(spaAccounts);
    }

    const allItems = await db.select().from(spaAccountItems);
    const allPayments = await db.select().from(spaPayments);
    const allAppointments = await db.select().from(spaAppointments);
    const allCabins = await db.select().from(spaCabins);
    const allTreatments = await db.select().from(spaTreatments);

    const cabinsMap = new Map(allCabins.map(c => [c.id, c]));
    const treatmentsMap = new Map(allTreatments.map(t => [t.id, t]));
    const appointmentsMap = new Map(allAppointments.map(a => [a.id, a]));

    return accounts.map(account => {
      const items = allItems.filter(i => i.accountId === account.id);
      const pmts = allPayments.filter(p => p.accountId === account.id);
      const appointment = appointmentsMap.get(account.appointmentId);
      return {
        ...account,
        items,
        payments: pmts,
        appointment: appointment ? {
          ...appointment,
          cabin: cabinsMap.get(appointment.cabinId)!,
          treatment: treatmentsMap.get(appointment.treatmentId)!,
        } : undefined,
      };
    });
  }

  async getSpaAccount(id: string): Promise<SpaAccountWithItems | undefined> {
    const [account] = await db.select().from(spaAccounts).where(eq(spaAccounts.id, id));
    if (!account) return undefined;
    const items = await db.select().from(spaAccountItems).where(eq(spaAccountItems.accountId, id));
    const pmts = await db.select().from(spaPayments).where(eq(spaPayments.accountId, id));
    const [appointment] = await db.select().from(spaAppointments).where(eq(spaAppointments.id, account.appointmentId));
    let appointmentWithDetails;
    if (appointment) {
      const [cabin] = await db.select().from(spaCabins).where(eq(spaCabins.id, appointment.cabinId));
      const [treatment] = await db.select().from(spaTreatments).where(eq(spaTreatments.id, appointment.treatmentId));
      appointmentWithDetails = { ...appointment, cabin, treatment };
    }
    return { ...account, items, payments: pmts, appointment: appointmentWithDetails };
  }

  async getSpaAccountByAppointment(appointmentId: string): Promise<SpaAccountWithItems | undefined> {
    const [account] = await db.select().from(spaAccounts).where(eq(spaAccounts.appointmentId, appointmentId));
    if (!account) return undefined;
    return this.getSpaAccount(account.id);
  }

  async createSpaAccount(account: InsertSpaAccount): Promise<SpaAccount> {
    const [created] = await db.insert(spaAccounts).values(account as any).returning();
    return created;
  }

  async updateSpaAccount(id: string, account: Partial<InsertSpaAccount>): Promise<SpaAccount | undefined> {
    const [updated] = await db.update(spaAccounts).set(account as any).where(eq(spaAccounts.id, id)).returning();
    return updated;
  }

  async closeSpaAccount(id: string, chargedTo: string, receiptType?: string): Promise<SpaAccount | undefined> {
    const [account] = await db.select().from(spaAccounts).where(eq(spaAccounts.id, id));
    if (!account) return undefined;

    const items = await db.select().from(spaAccountItems).where(eq(spaAccountItems.accountId, id));
    const total = items.reduce((sum, item) => sum + parseFloat(item.subtotal), 0);
    const pmts = await db.select().from(spaPayments).where(eq(spaPayments.accountId, id));
    const totalPaid = pmts.reduce((sum, p) => sum + parseFloat(p.amount), 0);

    const [updated] = await db.update(spaAccounts).set({
      status: "closed",
      subtotal: total.toFixed(2),
      total: total.toFixed(2),
      totalPaid: totalPaid.toFixed(2),
      receiptType: receiptType ?? null,
      closedAt: new Date(),
      chargedTo,
    }).where(eq(spaAccounts.id, id)).returning();

    if (chargedTo.startsWith("room:")) {
      const reservationId = chargedTo.replace("room:", "");
      const [reservation] = await db.select().from(reservations).where(eq(reservations.id, reservationId));
      if (reservation) {
        await db.insert(charges).values({
          reservationId,
          category: "spa",
          description: "Servicios SPA",
          amount: total.toFixed(2),
          date: new Date().toISOString().split("T")[0],
          createdBy: null,
        } as any);
      }
    }

    return updated;
  }

  async getSpaAccountItems(accountId: string): Promise<SpaAccountItem[]> {
    return db.select().from(spaAccountItems).where(eq(spaAccountItems.accountId, accountId));
  }

  async createSpaAccountItem(item: InsertSpaAccountItem): Promise<SpaAccountItem> {
    const [created] = await db.insert(spaAccountItems).values(item as any).returning();
    return created;
  }

  async updateSpaAccountItem(id: string, item: Partial<InsertSpaAccountItem>): Promise<SpaAccountItem | undefined> {
    const [updated] = await db.update(spaAccountItems).set(item as any).where(eq(spaAccountItems.id, id)).returning();
    return updated;
  }

  async deleteSpaAccountItem(id: string): Promise<boolean> {
    const result = await db.delete(spaAccountItems).where(eq(spaAccountItems.id, id));
    return (result.rowCount ?? 0) > 0;
  }

  async getSpaPayments(accountId: string): Promise<SpaPayment[]> {
    return db.select().from(spaPayments).where(eq(spaPayments.accountId, accountId));
  }

  async createSpaPayment(payment: InsertSpaPayment): Promise<SpaPayment> {
    const [created] = await db.insert(spaPayments).values(payment as any).returning();
    return created;
  }

  async deleteSpaPayment(id: string): Promise<boolean> {
    const result = await db.delete(spaPayments).where(eq(spaPayments.id, id));
    return (result.rowCount ?? 0) > 0;
  }

  async getEventRooms(): Promise<EventRoom[]> {
    return db.select().from(eventRooms);
  }

  async getEventRoom(id: string): Promise<EventRoom | undefined> {
    const [room] = await db.select().from(eventRooms).where(eq(eventRooms.id, id));
    return room;
  }

  async createEventRoom(room: InsertEventRoom): Promise<EventRoom> {
    const [created] = await db.insert(eventRooms).values(room as any).returning();
    return created;
  }

  async updateEventRoom(id: string, room: Partial<InsertEventRoom>): Promise<EventRoom | undefined> {
    const [updated] = await db.update(eventRooms).set(room as any).where(eq(eventRooms.id, id)).returning();
    return updated;
  }

  async deleteEventRoom(id: string): Promise<boolean> {
    const result = await db.delete(eventRooms).where(eq(eventRooms.id, id));
    return (result.rowCount ?? 0) > 0;
  }

  private async enrichEvent(event: HotelEvent): Promise<EventWithDetails> {
    const [eventRoom] = await db.select().from(eventRooms).where(eq(eventRooms.id, event.eventRoomId));
    const company = event.companyId ? (await db.select().from(companies).where(eq(companies.id, event.companyId)))[0] : undefined;
    const chargesList = await db.select().from(eventCharges).where(eq(eventCharges.eventId, event.id));
    const allChargeTypes = await db.select().from(eventChargeTypes);
    const chargeTypesMap = new Map(allChargeTypes.map(ct => [ct.id, ct]));
    const chargesWithType: EventChargeWithType[] = chargesList.map(c => ({
      ...c,
      chargeType: c.chargeTypeId ? chargeTypesMap.get(c.chargeTypeId) : undefined,
    }));
    const paymentsList = await db.select().from(eventPayments).where(eq(eventPayments.eventId, event.id));
    return { ...event, eventRoom, company, charges: chargesWithType, payments: paymentsList };
  }

  async getEvents(): Promise<EventWithDetails[]> {
    const allEvents = await db.select().from(events);
    const results: EventWithDetails[] = [];
    for (const event of allEvents) {
      results.push(await this.enrichEvent(event));
    }
    return results;
  }

  async getEvent(id: string): Promise<EventWithDetails | undefined> {
    const [event] = await db.select().from(events).where(eq(events.id, id));
    if (!event) return undefined;
    return this.enrichEvent(event);
  }

  async getEventsByDateRange(startDate: string, endDate: string): Promise<EventWithDetails[]> {
    const eventsInRange = await db.select().from(events).where(
      and(
        sql`${events.startDate} <= ${endDate}`,
        sql`${events.endDate} >= ${startDate}`
      )
    );
    const results: EventWithDetails[] = [];
    for (const event of eventsInRange) {
      results.push(await this.enrichEvent(event));
    }
    return results;
  }

  async createEvent(event: InsertEvent): Promise<HotelEvent> {
    const [created] = await db.insert(events).values(event as any).returning();
    return created;
  }

  async updateEvent(id: string, event: Partial<InsertEvent>): Promise<HotelEvent | undefined> {
    const [updated] = await db.update(events).set(event as any).where(eq(events.id, id)).returning();
    return updated;
  }

  async deleteEvent(id: string): Promise<boolean> {
    await db.delete(eventCharges).where(eq(eventCharges.eventId, id));
    const result = await db.delete(events).where(eq(events.id, id));
    return (result.rowCount ?? 0) > 0;
  }

  generateEventCode(): string {
    const year = new Date().getFullYear();
    const random = Math.floor(Math.random() * 10000);
    return `EVT-${year}-${random.toString().padStart(4, "0")}`;
  }

  async getEventChargeTypes(): Promise<EventChargeType[]> {
    return db.select().from(eventChargeTypes);
  }

  async getEventChargeType(id: string): Promise<EventChargeType | undefined> {
    const [ct] = await db.select().from(eventChargeTypes).where(eq(eventChargeTypes.id, id));
    return ct;
  }

  async createEventChargeType(chargeType: InsertEventChargeType): Promise<EventChargeType> {
    const [created] = await db.insert(eventChargeTypes).values(chargeType as any).returning();
    return created;
  }

  async updateEventChargeType(id: string, chargeType: Partial<InsertEventChargeType>): Promise<EventChargeType | undefined> {
    const [updated] = await db.update(eventChargeTypes).set(chargeType as any).where(eq(eventChargeTypes.id, id)).returning();
    return updated;
  }

  async deleteEventChargeType(id: string): Promise<boolean> {
    const result = await db.delete(eventChargeTypes).where(eq(eventChargeTypes.id, id));
    return (result.rowCount ?? 0) > 0;
  }

  async getEventCharges(eventId: string): Promise<EventChargeWithType[]> {
    const chargesList = await db.select().from(eventCharges).where(eq(eventCharges.eventId, eventId));
    const allChargeTypes = await db.select().from(eventChargeTypes);
    const chargeTypesMap = new Map(allChargeTypes.map(ct => [ct.id, ct]));
    return chargesList.map(c => ({
      ...c,
      chargeType: c.chargeTypeId ? chargeTypesMap.get(c.chargeTypeId) : undefined,
    }));
  }

  async createEventCharge(charge: InsertEventCharge): Promise<EventCharge> {
    const [created] = await db.insert(eventCharges).values(charge as any).returning();
    return created;
  }

  async updateEventCharge(id: string, charge: Partial<InsertEventCharge>): Promise<EventCharge | undefined> {
    const [updated] = await db.update(eventCharges).set(charge as any).where(eq(eventCharges.id, id)).returning();
    return updated;
  }

  async deleteEventCharge(id: string): Promise<boolean> {
    const result = await db.delete(eventCharges).where(eq(eventCharges.id, id));
    return (result.rowCount ?? 0) > 0;
  }

  async getEventPayments(eventId: string): Promise<EventPayment[]> {
    return db.select().from(eventPayments).where(eq(eventPayments.eventId, eventId));
  }

  async createEventPayment(payment: InsertEventPayment): Promise<EventPayment> {
    const [created] = await db.insert(eventPayments).values(payment as any).returning();
    return created;
  }

  async deleteEventPayment(id: string): Promise<boolean> {
    const result = await db.delete(eventPayments).where(eq(eventPayments.id, id));
    return (result.rowCount ?? 0) > 0;
  }

  async getEventTables(eventId: string): Promise<EventTableWithDetails[]> {
    const tables = await db.select().from(eventTables).where(eq(eventTables.eventId, eventId));
    const results: EventTableWithDetails[] = [];
    for (const table of tables) {
      results.push(await this.enrichEventTable(table));
    }
    return results;
  }

  async getEventTable(id: string): Promise<EventTableWithDetails | undefined> {
    const [table] = await db.select().from(eventTables).where(eq(eventTables.id, id));
    if (!table) return undefined;
    return this.enrichEventTable(table);
  }

  private async enrichEventTable(table: EventTable): Promise<EventTableWithDetails> {
    const chargesList = await db.select().from(eventTableCharges).where(eq(eventTableCharges.eventTableId, table.id));
    const paymentsList = await db.select().from(eventTablePayments).where(eq(eventTablePayments.eventTableId, table.id));
    return { ...table, charges: chargesList, payments: paymentsList };
  }

  async createEventTable(table: InsertEventTable): Promise<EventTable> {
    const [created] = await db.insert(eventTables).values(table as any).returning();
    return created;
  }

  async updateEventTable(id: string, table: Partial<InsertEventTable>): Promise<EventTable | undefined> {
    const [updated] = await db.update(eventTables).set(table as any).where(eq(eventTables.id, id)).returning();
    return updated;
  }

  async deleteEventTable(id: string): Promise<boolean> {
    await db.delete(eventTableCharges).where(eq(eventTableCharges.eventTableId, id));
    await db.delete(eventTablePayments).where(eq(eventTablePayments.eventTableId, id));
    const result = await db.delete(eventTables).where(eq(eventTables.id, id));
    return (result.rowCount ?? 0) > 0;
  }

  async getEventTableCharges(tableId: string): Promise<EventTableCharge[]> {
    return db.select().from(eventTableCharges).where(eq(eventTableCharges.eventTableId, tableId));
  }

  async createEventTableCharge(charge: InsertEventTableCharge): Promise<EventTableCharge> {
    const [created] = await db.insert(eventTableCharges).values(charge as any).returning();
    return created;
  }

  async deleteEventTableCharge(id: string): Promise<boolean> {
    const result = await db.delete(eventTableCharges).where(eq(eventTableCharges.id, id));
    return (result.rowCount ?? 0) > 0;
  }

  async getEventTablePayments(tableId: string): Promise<EventTablePayment[]> {
    return db.select().from(eventTablePayments).where(eq(eventTablePayments.eventTableId, tableId));
  }

  async createEventTablePayment(payment: InsertEventTablePayment): Promise<EventTablePayment> {
    const [created] = await db.insert(eventTablePayments).values(payment as any).returning();
    return created;
  }

  async deleteEventTablePayment(id: string): Promise<boolean> {
    const result = await db.delete(eventTablePayments).where(eq(eventTablePayments.id, id));
    return (result.rowCount ?? 0) > 0;
  }

  async getEventPlanningData(startDate: string, endDate: string): Promise<EventPlanningData> {
    const allEventRooms = await db.select().from(eventRooms).where(eq(eventRooms.isActive, "true"));
    const days: string[] = [];
    const currentDate = new Date(startDate);
    const end = new Date(endDate);
    while (currentDate <= end) {
      days.push(currentDate.toISOString().split("T")[0]);
      currentDate.setDate(currentDate.getDate() + 1);
    }

    const eventsInRange = await db.select().from(events).where(
      and(
        sql`${events.startDate} <= ${endDate}`,
        sql`${events.endDate} >= ${startDate}`,
        ne(events.status, "cancelled")
      )
    );

    const occupancy: Record<string, EventPlanningCellStatus[]> = {};
    const eventsMap: Record<string, any> = {};
    const cellEvents: Record<string, Record<string, string>> = {};

    allEventRooms.forEach(room => {
      occupancy[room.id] = [];
      cellEvents[room.id] = {};

      days.forEach(day => {
        const event = eventsInRange.find(e => e.eventRoomId === room.id && e.startDate <= day && e.endDate >= day);
        if (event) {
          occupancy[room.id].push("event");
          cellEvents[room.id][day] = event.id;
          if (!eventsMap[event.id]) {
            eventsMap[event.id] = {
              id: event.id,
              name: event.name,
              contactName: event.contactName,
              startDate: event.startDate,
              endDate: event.endDate,
              status: event.status as EventStatus,
              eventType: event.eventType as EventType,
            };
          }
        } else if (room.status === "maintenance") {
          occupancy[room.id].push("maintenance");
        } else {
          occupancy[room.id].push("available");
        }
      });
    });

    return { rooms: allEventRooms, days, occupancy, events: eventsMap, cellEvents };
  }

  async getMaintenanceStaff(): Promise<MaintenanceStaff[]> {
    return db.select().from(maintenanceStaff);
  }

  async getMaintenanceStaffMember(id: string): Promise<MaintenanceStaff | undefined> {
    const [staff] = await db.select().from(maintenanceStaff).where(eq(maintenanceStaff.id, id));
    return staff;
  }

  async createMaintenanceStaff(staff: InsertMaintenanceStaff): Promise<MaintenanceStaff> {
    const [created] = await db.insert(maintenanceStaff).values(staff as any).returning();
    return created;
  }

  async updateMaintenanceStaff(id: string, staff: Partial<InsertMaintenanceStaff>): Promise<MaintenanceStaff | undefined> {
    const [updated] = await db.update(maintenanceStaff).set(staff as any).where(eq(maintenanceStaff.id, id)).returning();
    return updated;
  }

  async deleteMaintenanceStaff(id: string): Promise<boolean> {
    const result = await db.delete(maintenanceStaff).where(eq(maintenanceStaff.id, id));
    return (result.rowCount ?? 0) > 0;
  }

  private async enrichWorkOrder(wo: WorkOrder): Promise<WorkOrderWithDetails> {
    const room = wo.roomId ? (await db.select().from(rooms).where(eq(rooms.id, wo.roomId)))[0] : undefined;
    const assignedTo = wo.assignedToId ? (await db.select().from(maintenanceStaff).where(eq(maintenanceStaff.id, wo.assignedToId)))[0] : undefined;
    return { ...wo, room, assignedTo };
  }

  async getWorkOrders(): Promise<WorkOrderWithDetails[]> {
    const allOrders = await db.select().from(workOrders);
    const results: WorkOrderWithDetails[] = [];
    for (const wo of allOrders) {
      results.push(await this.enrichWorkOrder(wo));
    }
    return results;
  }

  async getWorkOrder(id: string): Promise<WorkOrderWithDetails | undefined> {
    const [wo] = await db.select().from(workOrders).where(eq(workOrders.id, id));
    if (!wo) return undefined;
    return this.enrichWorkOrder(wo);
  }

  async getWorkOrdersByRoom(roomId: string): Promise<WorkOrderWithDetails[]> {
    const allOrders = await db.select().from(workOrders).where(eq(workOrders.roomId, roomId));
    const results: WorkOrderWithDetails[] = [];
    for (const wo of allOrders) {
      results.push(await this.enrichWorkOrder(wo));
    }
    return results;
  }

  async getWorkOrdersByStatus(status: WorkOrderStatus): Promise<WorkOrderWithDetails[]> {
    const allOrders = await db.select().from(workOrders).where(eq(workOrders.status, status));
    const results: WorkOrderWithDetails[] = [];
    for (const wo of allOrders) {
      results.push(await this.enrichWorkOrder(wo));
    }
    return results;
  }

  async createWorkOrder(order: InsertWorkOrder): Promise<WorkOrder> {
    const [created] = await db.insert(workOrders).values(order as any).returning();
    return created;
  }

  async updateWorkOrder(id: string, order: Partial<InsertWorkOrder>): Promise<WorkOrder | undefined> {
    const [updated] = await db.update(workOrders).set(order as any).where(eq(workOrders.id, id)).returning();
    return updated;
  }

  async deleteWorkOrder(id: string): Promise<boolean> {
    const result = await db.delete(workOrders).where(eq(workOrders.id, id));
    return (result.rowCount ?? 0) > 0;
  }

  generateWorkOrderCode(): string {
    const random = Math.floor(Math.random() * 10000);
    return `OT-${random}`;
  }

  async getSystemUsers(): Promise<SystemUser[]> {
    return db.select().from(systemUsers);
  }

  async getSystemUser(id: string): Promise<SystemUser | undefined> {
    const [user] = await db.select().from(systemUsers).where(eq(systemUsers.id, id));
    return user;
  }

  async getSystemUserByUsername(username: string): Promise<SystemUser | undefined> {
    const [user] = await db.select().from(systemUsers).where(eq(systemUsers.username, username));
    return user;
  }

  async createSystemUser(user: InsertSystemUser): Promise<SystemUser> {
    const [created] = await db.insert(systemUsers).values(user as any).returning();
    return created;
  }

  async updateSystemUser(id: string, user: Partial<InsertSystemUser>): Promise<SystemUser | undefined> {
    const [updated] = await db.update(systemUsers).set(user as any).where(eq(systemUsers.id, id)).returning();
    return updated;
  }

  async deleteSystemUser(id: string): Promise<boolean> {
    const result = await db.delete(systemUsers).where(eq(systemUsers.id, id));
    return (result.rowCount ?? 0) > 0;
  }

  async getSystemSettings(): Promise<SystemSetting[]> {
    return db.select().from(systemSettings);
  }

  async getSystemSetting(key: string): Promise<SystemSetting | undefined> {
    const [setting] = await db.select().from(systemSettings).where(eq(systemSettings.key, key));
    return setting;
  }

  async getSystemSettingsByCategory(category: string): Promise<SystemSetting[]> {
    return db.select().from(systemSettings).where(eq(systemSettings.category, category));
  }

  async upsertSystemSetting(setting: InsertSystemSetting): Promise<SystemSetting> {
    const existing = await this.getSystemSetting(setting.key);
    if (existing) {
      const [updated] = await db.update(systemSettings).set(setting as any).where(eq(systemSettings.key, setting.key)).returning();
      return updated;
    }
    const [created] = await db.insert(systemSettings).values(setting as any).returning();
    return created;
  }

  async deleteSystemSetting(key: string): Promise<boolean> {
    const result = await db.delete(systemSettings).where(eq(systemSettings.key, key));
    return (result.rowCount ?? 0) > 0;
  }

  async getAuditLogs(): Promise<AuditLog[]> {
    return db.select().from(auditLogs).orderBy(desc(auditLogs.timestamp));
  }

  async getAuditLogsByModule(module: string): Promise<AuditLog[]> {
    return db.select().from(auditLogs).where(eq(auditLogs.module, module)).orderBy(desc(auditLogs.timestamp));
  }

  async getAuditLogsByUser(userId: string): Promise<AuditLog[]> {
    return db.select().from(auditLogs).where(eq(auditLogs.userId, userId)).orderBy(desc(auditLogs.timestamp));
  }

  async createAuditLog(log: InsertAuditLog): Promise<AuditLog> {
    const [created] = await db.insert(auditLogs).values(log as any).returning();
    return created;
  }

  async getAdminDashboardStats(): Promise<{
    totalUsers: number;
    activeUsers: number;
    recentLogins: number;
    totalSettings: number;
    recentAuditLogs: AuditLog[];
  }> {
    const allUsers = await db.select().from(systemUsers);
    const today = getArgentinaToday();

    const recentLogins = allUsers.filter(u => {
      if (!u.lastLogin) return false;
      return u.lastLogin.toISOString().startsWith(today);
    }).length;

    const settingsCount = await db.select({ cnt: count() }).from(systemSettings);
    const recentLogs = await db.select().from(auditLogs).orderBy(desc(auditLogs.timestamp)).limit(10);

    return {
      totalUsers: allUsers.length,
      activeUsers: allUsers.filter(u => u.isActive === "true").length,
      recentLogins,
      totalSettings: Number(settingsCount[0]?.cnt ?? 0),
      recentAuditLogs: recentLogs,
    };
  }

  private async enrichPackage(pkg: Package): Promise<PackageWithDetails> {
    const roomType = pkg.roomTypeId ? (await db.select().from(roomTypes).where(eq(roomTypes.id, pkg.roomTypeId)))[0] : undefined;
    const items = await db.select().from(packageItems).where(eq(packageItems.packageId, pkg.id));
    return { ...pkg, roomType, items };
  }

  async getPackages(): Promise<PackageWithDetails[]> {
    const allPkgs = await db.select().from(packages);
    const results: PackageWithDetails[] = [];
    for (const pkg of allPkgs) {
      results.push(await this.enrichPackage(pkg));
    }
    return results;
  }

  async getPackage(id: string): Promise<PackageWithDetails | undefined> {
    const [pkg] = await db.select().from(packages).where(eq(packages.id, id));
    if (!pkg) return undefined;
    return this.enrichPackage(pkg);
  }

  async getActivePackages(): Promise<PackageWithDetails[]> {
    const today = getArgentinaToday();
    const allPkgs = await db.select().from(packages).where(eq(packages.status, "active"));
    const filtered = allPkgs.filter(p => {
      if (p.validFrom && p.validFrom > today) return false;
      if (p.validUntil && p.validUntil < today) return false;
      return true;
    });
    const results: PackageWithDetails[] = [];
    for (const pkg of filtered) {
      results.push(await this.enrichPackage(pkg));
    }
    return results;
  }

  async createPackage(pkg: InsertPackage): Promise<Package> {
    const [created] = await db.insert(packages).values(pkg as any).returning();
    return created;
  }

  async updatePackage(id: string, pkg: Partial<InsertPackage>): Promise<Package | undefined> {
    const [updated] = await db.update(packages).set(pkg as any).where(eq(packages.id, id)).returning();
    return updated;
  }

  async deletePackage(id: string): Promise<boolean> {
    await db.delete(packageItems).where(eq(packageItems.packageId, id));
    const result = await db.delete(packages).where(eq(packages.id, id));
    return (result.rowCount ?? 0) > 0;
  }

  generatePackageCode(): string {
    const random = Math.floor(Math.random() * 10000);
    return `PKG-${random.toString().padStart(4, "0")}`;
  }

  async getPackageItems(packageId: string): Promise<PackageItem[]> {
    return db.select().from(packageItems).where(eq(packageItems.packageId, packageId));
  }

  async createPackageItem(item: InsertPackageItem): Promise<PackageItem> {
    const [created] = await db.insert(packageItems).values(item as any).returning();
    return created;
  }

  async updatePackageItem(id: string, item: Partial<InsertPackageItem>): Promise<PackageItem | undefined> {
    const [updated] = await db.update(packageItems).set(item as any).where(eq(packageItems.id, id)).returning();
    return updated;
  }

  async deletePackageItem(id: string): Promise<boolean> {
    const result = await db.delete(packageItems).where(eq(packageItems.id, id));
    return (result.rowCount ?? 0) > 0;
  }

  async getNotifications(area?: NotificationArea, limit?: number): Promise<SystemNotification[]> {
    let query;
    if (area) {
      query = db.select().from(systemNotifications).where(
        or(eq(systemNotifications.targetArea, area), eq(systemNotifications.targetArea, "all"))
      ).orderBy(asc(systemNotifications.isRead), desc(systemNotifications.createdAt));
    } else {
      query = db.select().from(systemNotifications).orderBy(asc(systemNotifications.isRead), desc(systemNotifications.createdAt));
    }

    if (limit) {
      return (query as any).limit(limit);
    }
    return query;
  }

  async createNotification(notification: InsertSystemNotification): Promise<SystemNotification> {
    const [created] = await db.insert(systemNotifications).values(notification as any).returning();
    return created;
  }

  async markNotificationRead(id: string): Promise<SystemNotification | undefined> {
    const [updated] = await db.update(systemNotifications).set({ isRead: true, readAt: new Date() }).where(eq(systemNotifications.id, id)).returning();
    return updated;
  }

  async markAllNotificationsRead(area?: NotificationArea): Promise<number> {
    let condition;
    if (area) {
      condition = and(
        eq(systemNotifications.isRead, false),
        or(eq(systemNotifications.targetArea, area), eq(systemNotifications.targetArea, "all"))
      );
    } else {
      condition = eq(systemNotifications.isRead, false);
    }
    const result = await db.update(systemNotifications).set({ isRead: true, readAt: new Date() }).where(condition!);
    return result.rowCount ?? 0;
  }

  async getUnreadNotificationCount(area?: NotificationArea): Promise<number> {
    let condition;
    if (area) {
      condition = and(
        eq(systemNotifications.isRead, false),
        or(eq(systemNotifications.targetArea, area), eq(systemNotifications.targetArea, "all"))
      );
    } else {
      condition = eq(systemNotifications.isRead, false);
    }
    const result = await db.select({ cnt: count() }).from(systemNotifications).where(condition!);
    return Number(result[0]?.cnt ?? 0);
  }

  async createWebCheckin(data: InsertWebCheckin): Promise<WebCheckin> {
    const [created] = await db.insert(webCheckins).values(data as any).returning();
    return created;
  }

  async getWebCheckinByToken(token: string): Promise<WebCheckin | undefined> {
    const [checkin] = await db.select().from(webCheckins).where(eq(webCheckins.token, token));
    return checkin;
  }

  async getWebCheckinByReservation(reservationId: string): Promise<WebCheckin | undefined> {
    const [checkin] = await db.select().from(webCheckins).where(eq(webCheckins.reservationId, reservationId));
    return checkin;
  }

  async updateWebCheckin(id: string, data: Partial<InsertWebCheckin>): Promise<WebCheckin | undefined> {
    const [updated] = await db.update(webCheckins).set(data as any).where(eq(webCheckins.id, id)).returning();
    return updated;
  }

  async listWebCheckins(): Promise<WebCheckin[]> {
    return db.select().from(webCheckins).orderBy(desc(webCheckins.createdAt));
  }

  async getGuestPreferences(guestId: string): Promise<GuestPreference[]> {
    return db.select().from(guestPreferences).where(eq(guestPreferences.guestId, guestId)).orderBy(desc(guestPreferences.createdAt));
  }

  async getActiveGuestPreferences(guestId: string): Promise<GuestPreference[]> {
    return db.select().from(guestPreferences).where(
      and(eq(guestPreferences.guestId, guestId), eq(guestPreferences.isActive, true))
    ).orderBy(asc(guestPreferences.priority));
  }

  async getGuestPreference(id: string): Promise<GuestPreference | undefined> {
    const [pref] = await db.select().from(guestPreferences).where(eq(guestPreferences.id, id));
    return pref;
  }

  async createGuestPreference(pref: InsertGuestPreference): Promise<GuestPreference> {
    const [created] = await db.insert(guestPreferences).values(pref as any).returning();
    return created;
  }

  async updateGuestPreference(id: string, pref: Partial<InsertGuestPreference>): Promise<GuestPreference | undefined> {
    const [updated] = await db.update(guestPreferences).set({ ...pref as any, updatedAt: new Date() }).where(eq(guestPreferences.id, id)).returning();
    return updated;
  }

  async toggleGuestPreference(id: string): Promise<GuestPreference | undefined> {
    const [existing] = await db.select().from(guestPreferences).where(eq(guestPreferences.id, id));
    if (!existing) return undefined;
    const [updated] = await db.update(guestPreferences).set({ isActive: !existing.isActive, updatedAt: new Date() }).where(eq(guestPreferences.id, id)).returning();
    return updated;
  }

  async deleteGuestPreference(id: string): Promise<boolean> {
    const result = await db.delete(guestPreferences).where(eq(guestPreferences.id, id));
    return (result.rowCount ?? 0) > 0;
  }

  async getStayNotes(reservationId: string): Promise<StayNote[]> {
    return db.select().from(stayNotes).where(eq(stayNotes.reservationId, reservationId)).orderBy(desc(stayNotes.createdAt));
  }

  async getActiveStayNotes(): Promise<StayNote[]> {
    return db.select().from(stayNotes).where(eq(stayNotes.isResolved, false)).orderBy(desc(stayNotes.createdAt));
  }

  async createStayNote(note: InsertStayNote): Promise<StayNote> {
    const [created] = await db.insert(stayNotes).values(note as any).returning();
    return created;
  }

  async updateStayNote(id: string, note: Partial<InsertStayNote>): Promise<StayNote | undefined> {
    const [updated] = await db.update(stayNotes).set(note as any).where(eq(stayNotes.id, id)).returning();
    return updated;
  }

  async resolveStayNote(id: string, resolvedBy: string): Promise<StayNote | undefined> {
    const [updated] = await db.update(stayNotes).set({ isResolved: true, resolvedAt: new Date(), resolvedBy }).where(eq(stayNotes.id, id)).returning();
    return updated;
  }

  async deleteStayNote(id: string): Promise<boolean> {
    const result = await db.delete(stayNotes).where(eq(stayNotes.id, id));
    return (result.rowCount ?? 0) > 0;
  }

  async getHospitalityAlerts(area?: string): Promise<HospitalityAlert[]> {
    if (area && area !== "all") {
      return db.select().from(hospitalityAlerts).where(
        or(eq(hospitalityAlerts.targetArea, area), eq(hospitalityAlerts.targetArea, "all"))
      ).orderBy(desc(hospitalityAlerts.createdAt));
    }
    return db.select().from(hospitalityAlerts).orderBy(desc(hospitalityAlerts.createdAt));
  }

  async getHospitalityAlertsByReservation(reservationId: string): Promise<HospitalityAlert[]> {
    return db.select().from(hospitalityAlerts).where(eq(hospitalityAlerts.reservationId, reservationId)).orderBy(desc(hospitalityAlerts.createdAt));
  }

  async createHospitalityAlert(alert: InsertHospitalityAlert): Promise<HospitalityAlert> {
    const [created] = await db.insert(hospitalityAlerts).values(alert as any).returning();
    return created;
  }

  async acknowledgeHospitalityAlert(id: string, acknowledgedBy: string): Promise<HospitalityAlert | undefined> {
    const [updated] = await db.update(hospitalityAlerts).set({
      isAcknowledged: true,
      acknowledgedAt: new Date(),
      acknowledgedBy,
    }).where(eq(hospitalityAlerts.id, id)).returning();
    return updated;
  }

  async getExecutiveStats(from: string, to: string): Promise<any> {
    const allRooms = await db.select().from(rooms);
    const totalRooms = allRooms.length;

    const roomsByStatus: Record<string, number> = { available: 0, occupied: 0, dirty: 0, cleaning: 0, maintenance: 0, oos: 0 };
    for (const r of allRooms) {
      const s = r.status || "available";
      if (s in roomsByStatus) roomsByStatus[s]++;
      else roomsByStatus[s] = (roomsByStatus[s] || 0) + 1;
    }

    const periodReservations = await db.select().from(reservations)
      .where(and(lte(reservations.checkInDate, to), gte(reservations.checkOutDate, from)));

    let totalNightsSold = 0;
    for (const r of periodReservations) {
      const ci = new Date(Math.max(new Date(r.checkInDate).getTime(), new Date(from).getTime()));
      const co = new Date(Math.min(new Date(r.checkOutDate).getTime(), new Date(to).getTime()));
      const nights = Math.max(0, Math.ceil((co.getTime() - ci.getTime()) / 86400000));
      totalNightsSold += nights;
    }

    const periodPayments = await db.select().from(payments)
      .where(and(gte(payments.date, from), lte(payments.date, to)));
    const totalRevenue = periodPayments.reduce((s, p) => s + parseFloat(p.amount || "0"), 0);

    const periodCharges = await db.select().from(charges)
      .where(and(gte(charges.date, from), lte(charges.date, to)));
    const accommodationCharges = periodCharges.filter(c => (c.category || "").toLowerCase().includes("aloj"));
    const accommodationRevenue = accommodationCharges.reduce((s, c) => s + parseFloat(c.amount || "0"), 0);
    const extrasRevenue = totalRevenue - accommodationRevenue;

    const daysInPeriod = Math.max(1, Math.ceil((new Date(to).getTime() - new Date(from).getTime()) / 86400000));
    const occupiedRooms = roomsByStatus.occupied || 0;
    const availableRooms = roomsByStatus.available || 0;
    const occupancyRate = totalRooms > 0 ? Math.round((occupiedRooms / totalRooms) * 100) : 0;

    const adr = totalNightsSold > 0 ? Math.round(totalRevenue / totalNightsSold) : 0;
    const revpar = Math.round(adr * occupancyRate / 100);

    const byChannelMap = new Map<string, { reservations: number; revenue: number }>();
    for (const r of periodReservations) {
      const src = r.source || "directo";
      if (!byChannelMap.has(src)) byChannelMap.set(src, { reservations: 0, revenue: 0 });
      const entry = byChannelMap.get(src)!;
      entry.reservations++;
      entry.revenue += parseFloat(r.totalRoomAmount || "0");
    }
    const totalChannelRevenue = Array.from(byChannelMap.values()).reduce((s, v) => s + v.revenue, 0);
    const byChannel = Array.from(byChannelMap.entries()).map(([source, data]) => ({
      source,
      reservations: data.reservations,
      revenue: Math.round(data.revenue),
      percentage: totalChannelRevenue > 0 ? Math.round((data.revenue / totalChannelRevenue) * 100) : 0,
    })).sort((a, b) => b.revenue - a.revenue);

    const prevFrom = new Date(new Date(from).getTime() - 365 * 86400000).toISOString().split("T")[0];
    const prevTo = new Date(new Date(to).getTime() - 365 * 86400000).toISOString().split("T")[0];
    const prevReservations = await db.select().from(reservations)
      .where(and(lte(reservations.checkInDate, prevTo), gte(reservations.checkOutDate, prevFrom)));
    const prevPayments = await db.select().from(payments)
      .where(and(gte(payments.date, prevFrom), lte(payments.date, prevTo)));
    const prevTotalRevenue = prevPayments.reduce((s, p) => s + parseFloat(p.amount || "0"), 0);
    let prevNightsSold = 0;
    for (const r of prevReservations) {
      const ci = new Date(Math.max(new Date(r.checkInDate).getTime(), new Date(prevFrom).getTime()));
      const co = new Date(Math.min(new Date(r.checkOutDate).getTime(), new Date(prevTo).getTime()));
      prevNightsSold += Math.max(0, Math.ceil((co.getTime() - ci.getTime()) / 86400000));
    }
    const prevAdr = prevNightsSold > 0 ? Math.round(prevTotalRevenue / prevNightsSold) : 0;
    const prevOccupancyRate = totalRooms > 0 ? Math.round((prevReservations.length / totalRooms) * 100) : 0;
    const prevRevpar = Math.round(prevAdr * prevOccupancyRate / 100);

    const today = getArgentinaToday();
    const todayReservations = await db.select().from(reservations)
      .where(eq(reservations.checkInDate, today));
    const todayCheckIns = todayReservations.filter(r => r.status === "confirmed" || r.status === "checked_in").length;
    const todayCheckOutReservations = await db.select().from(reservations)
      .where(eq(reservations.checkOutDate, today));
    const todayCheckOuts = todayCheckOutReservations.filter(r => r.status === "checked_in").length;
    const pendingCheckIns = todayReservations.filter(r => r.status === "confirmed").length;

    return {
      occupancyRate, occupiedRooms, availableRooms, totalRooms,
      totalRevenue: Math.round(totalRevenue), accommodationRevenue: Math.round(accommodationRevenue), extrasRevenue: Math.round(extrasRevenue),
      adr, revpar, byChannel,
      previousYear: { occupancyRate: prevOccupancyRate, totalRevenue: Math.round(prevTotalRevenue), adr: prevAdr, revpar: prevRevpar },
      todayCheckIns, todayCheckOuts, pendingCheckIns,
      roomsByStatus,
    };
  }

  async getReportOccupancy(from: string, to: string): Promise<any[]> {
    const result: any[] = [];
    const allRooms = await db.select().from(rooms);
    const totalRooms = allRooms.length;
    const start = new Date(from);
    const end = new Date(to);
    for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
      const dateStr = d.toISOString().split("T")[0];
      const dayReservations = await db.select().from(reservations)
        .where(and(lte(reservations.checkInDate, dateStr), gt(reservations.checkOutDate, dateStr),
          inArray(reservations.status, ["checked_in", "checked_out", "confirmed"])));
      const occupied = dayReservations.length;
      const available = totalRooms - occupied;
      const occupancy = totalRooms > 0 ? Math.round((occupied / totalRooms) * 100) : 0;
      result.push({ date: dateStr, available, occupied, occupancy, totalRooms });
    }
    return result;
  }

  async getReportRevenueByRoomType(from: string, to: string): Promise<any[]> {
    const types = await db.select().from(roomTypes);
    const periodRes = await db.select().from(reservations)
      .where(and(lte(reservations.checkInDate, to), gte(reservations.checkOutDate, from)));

    const result: any[] = [];
    let grandTotal = 0;
    for (const t of types) {
      const typeRes = periodRes.filter(r => r.roomTypeId === t.id);
      let nightsSold = 0;
      let revenue = 0;
      for (const r of typeRes) {
        nightsSold += r.nights || 0;
        revenue += parseFloat(r.totalRoomAmount || "0");
      }
      grandTotal += revenue;
      const typeRooms = (await db.select().from(rooms).where(eq(rooms.roomTypeId, t.id))).length;
      result.push({ type: t.name, rooms: typeRooms, nightsSold, revenue: Math.round(revenue), adr: nightsSold > 0 ? Math.round(revenue / nightsSold) : 0 });
    }
    return result.map(r => ({ ...r, percentage: grandTotal > 0 ? Math.round((r.revenue / grandTotal) * 100) : 0 }));
  }

  async getReportByChannel(from: string, to: string): Promise<any[]> {
    const periodRes = await db.select().from(reservations)
      .where(and(lte(reservations.checkInDate, to), gte(reservations.checkOutDate, from)));

    const map = new Map<string, { reservations: number; nights: number; revenue: number }>();
    for (const r of periodRes) {
      const src = r.source || "directo";
      if (!map.has(src)) map.set(src, { reservations: 0, nights: 0, revenue: 0 });
      const e = map.get(src)!;
      e.reservations++;
      e.nights += r.nights || 0;
      e.revenue += parseFloat(r.totalRoomAmount || "0");
    }
    const total = Array.from(map.values()).reduce((s, v) => s + v.revenue, 0);
    const commissionRates: Record<string, number> = { booking: 15, airbnb: 14, expedia: 18, despegar: 17 };
    return Array.from(map.entries()).map(([source, d]) => {
      const commRate = commissionRates[source] || 0;
      const commission = Math.round(d.revenue * commRate / 100);
      return { source, reservations: d.reservations, nights: d.nights, revenue: Math.round(d.revenue), commission, net: Math.round(d.revenue - commission), percentage: total > 0 ? Math.round((d.revenue / total) * 100) : 0 };
    }).sort((a, b) => b.revenue - a.revenue);
  }

  async getReportReservations(from: string, to: string, status?: string): Promise<any[]> {
    let query = db.select().from(reservations)
      .where(and(lte(reservations.checkInDate, to), gte(reservations.checkOutDate, from)));

    let allRes = await query;
    if (status && status !== "all") {
      allRes = allRes.filter(r => r.status === status);
    }

    const result: any[] = [];
    for (const r of allRes) {
      const guest = r.guestId ? await db.select().from(guests).where(eq(guests.id, r.guestId)).then(g => g[0]) : null;
      const room = r.roomId ? await db.select().from(rooms).where(eq(rooms.id, r.roomId)).then(rm => rm[0]) : null;
      const type = r.roomTypeId ? await db.select().from(roomTypes).where(eq(roomTypes.id, r.roomTypeId)).then(t => t[0]) : null;
      const company = r.companyId ? await db.select().from(companies).where(eq(companies.id, r.companyId)).then(c => c[0]) : null;
      const resPay = await db.select().from(payments).where(eq(payments.reservationId, r.id));
      const totalPaid = resPay.reduce((s, p) => s + parseFloat(p.amount || "0"), 0);
      const total = parseFloat(r.totalRoomAmount || "0");
      result.push({
        code: r.reservationCode, guest: guest ? `${guest.lastName} ${guest.firstName}` : "-",
        company: company?.razonSocial || "-", room: room?.roomNumber || "-", type: type?.name || "-",
        checkIn: r.checkInDate, checkOut: r.checkOutDate, nights: r.nights,
        source: r.source, status: r.status, total: Math.round(total), paid: Math.round(totalPaid), balance: Math.round(total - totalPaid),
      });
    }
    return result;
  }

  async getReportPayments(from: string, to: string): Promise<any> {
    const allPayments = await db.select().from(payments)
      .where(and(gte(payments.date, from), lte(payments.date, to)));

    const methodMap = new Map<string, { count: number; total: number }>();
    for (const p of allPayments) {
      const m = p.method || "efectivo";
      if (!methodMap.has(m)) methodMap.set(m, { count: 0, total: 0 });
      const e = methodMap.get(m)!;
      e.count++;
      e.total += parseFloat(p.amount || "0");
    }
    const grandTotal = Array.from(methodMap.values()).reduce((s, v) => s + v.total, 0);
    const byMethod = Array.from(methodMap.entries()).map(([method, d]) => ({
      method, count: d.count, total: Math.round(d.total),
      percentage: grandTotal > 0 ? Math.round((d.total / grandTotal) * 100) : 0,
    })).sort((a, b) => b.total - a.total);

    return { byMethod, grandTotal: Math.round(grandTotal) };
  }

  async getReportTopGuests(from: string, to: string, limit: number = 50): Promise<any[]> {
    const periodRes = await db.select().from(reservations)
      .where(and(lte(reservations.checkInDate, to), gte(reservations.checkOutDate, from)));

    const guestMap = new Map<string, { stays: number; nights: number; revenue: number; lastVisit: string }>();
    for (const r of periodRes) {
      if (!r.guestId) continue;
      if (!guestMap.has(r.guestId)) guestMap.set(r.guestId, { stays: 0, nights: 0, revenue: 0, lastVisit: "" });
      const e = guestMap.get(r.guestId)!;
      e.stays++;
      e.nights += r.nights || 0;
      e.revenue += parseFloat(r.totalRoomAmount || "0");
      if (r.checkOutDate > e.lastVisit) e.lastVisit = r.checkOutDate as string;
    }

    const entries = Array.from(guestMap.entries()).sort((a, b) => b[1].revenue - a[1].revenue).slice(0, limit);
    const result: any[] = [];
    let rank = 0;
    for (const [guestId, data] of entries) {
      rank++;
      const guest = await db.select().from(guests).where(eq(guests.id, guestId)).then(g => g[0]);
      result.push({
        rank, guest: guest ? `${guest.lastName} ${guest.firstName}` : "-",
        code: guest?.codigo || "-", stays: data.stays, nights: data.nights,
        revenue: Math.round(data.revenue), lastVisit: data.lastVisit, segment: guest?.segment || "-",
      });
    }
    return result;
  }

  async getReportHousekeeping(from: string, to: string): Promise<any> {
    const tasks = await db.select().from(housekeepingTasks)
      .where(and(gte(housekeepingTasks.scheduledDate, from), lte(housekeepingTasks.scheduledDate, to)));

    const allTasks = tasks.length > 0 ? tasks : await db.select().from(housekeepingTasks);

    const byDate = new Map<string, { completed: number; pending: number; urgent: number }>();
    const byType = new Map<string, number>();

    for (const t of allTasks) {
      const dateStr = t.scheduledDate || new Date().toISOString().split("T")[0];
      if (!byDate.has(dateStr as string)) byDate.set(dateStr as string, { completed: 0, pending: 0, urgent: 0 });
      const e = byDate.get(dateStr as string)!;
      if (t.status === "completed" || t.status === "inspected") e.completed++;
      else e.pending++;
      if (t.priority === "urgent" || t.priority === "high") e.urgent++;

      const type = t.type || "other";
      byType.set(type, (byType.get(type) || 0) + 1);
    }

    return {
      daily: Array.from(byDate.entries()).map(([date, d]) => ({ date, ...d })).sort((a, b) => a.date.localeCompare(b.date)),
      byType: Array.from(byType.entries()).map(([type, count]) => ({ type, count })),
      totalCompleted: allTasks.filter(t => t.status === "completed" || t.status === "inspected").length,
      totalPending: allTasks.filter(t => t.status === "pending" || t.status === "assigned").length,
    };
  }

  async getReportRestaurant(from: string, to: string): Promise<any> {
    const orders = await db.select().from(restaurantOrders);
    const items = await db.select().from(orderItems);
    const menuItemsList = await db.select().from(menuItems);
    const areas = await db.select().from(restaurantAreas);

    const menuMap = new Map(menuItemsList.map(m => [m.id, m]));
    const areaMap = new Map(areas.map(a => [a.id, a]));

    let totalRevenue = 0;
    let totalCovers = 0;
    const itemSales = new Map<string, { name: string; count: number; revenue: number }>();
    const areaRevenue = new Map<string, { name: string; orders: number; revenue: number; covers: number }>();

    for (const o of orders) {
      const orderTotal = items.filter(i => i.orderId === o.id).reduce((s, i) => s + parseFloat(i.subtotal || "0"), 0);
      totalRevenue += orderTotal;
      totalCovers += o.covers || 0;

      const table = o.tableId ? await db.select().from(restaurantTables).where(eq(restaurantTables.id, o.tableId)).then(t => t[0]) : null;
      const areaId = table?.areaId || "unknown";
      const area = areaMap.get(areaId);
      if (!areaRevenue.has(areaId)) areaRevenue.set(areaId, { name: area?.name || "Otro", orders: 0, revenue: 0, covers: 0 });
      const ae = areaRevenue.get(areaId)!;
      ae.orders++;
      ae.revenue += orderTotal;
      ae.covers += o.covers || 0;

      for (const i of items.filter(it => it.orderId === o.id)) {
        const mi = menuMap.get(i.menuItemId);
        const name = mi?.name || "Desconocido";
        if (!itemSales.has(i.menuItemId)) itemSales.set(i.menuItemId, { name, count: 0, revenue: 0 });
        const ie = itemSales.get(i.menuItemId)!;
        ie.count += i.quantity;
        ie.revenue += parseFloat(i.subtotal || "0");
      }
    }

    const topItems = Array.from(itemSales.values()).sort((a, b) => b.count - a.count).slice(0, 10);
    const byArea = Array.from(areaRevenue.values()).sort((a, b) => b.revenue - a.revenue);

    return {
      totalOrders: orders.length, totalRevenue: Math.round(totalRevenue), totalCovers,
      avgTicket: orders.length > 0 ? Math.round(totalRevenue / orders.length) : 0,
      topItems, byArea,
    };
  }

  async bulkCheckIn(groupId: string): Promise<{ processed: number; skipped: number; skippedRooms: string[] }> {
    const links = await db.select().from(groupReservationLinks)
      .where(eq(groupReservationLinks.groupId, groupId));

    let processed = 0;
    let skipped = 0;
    const skippedRooms: string[] = [];

    for (const link of links) {
      const [reservation] = await db.select().from(reservations)
        .where(eq(reservations.id, link.reservationId));

      if (!reservation || reservation.status !== "confirmed") continue;

      const [room] = await db.select().from(rooms)
        .where(eq(rooms.id, reservation.roomId));

      if (!room || room.status !== "available") {
        skipped++;
        if (room) skippedRooms.push(room.roomNumber);
        continue;
      }

      await db.update(reservations)
        .set({ status: "checked_in" })
        .where(eq(reservations.id, reservation.id));

      await db.update(rooms)
        .set({ status: "occupied" })
        .where(eq(rooms.id, room.id));

      processed++;
    }

    if (processed > 0) {
      await db.update(groups)
        .set({ status: "inhouse" as any })
        .where(eq(groups.id, groupId));
    }

    return { processed, skipped, skippedRooms };
  }

  async bulkCheckOut(groupId: string): Promise<{ processed: number; skipped: number; pendingBalance: Array<{ room: string; guestName: string; balance: number }> }> {
    const links = await db.select().from(groupReservationLinks)
      .where(eq(groupReservationLinks.groupId, groupId));

    let processed = 0;
    let skipped = 0;
    const pendingBalance: Array<{ room: string; guestName: string; balance: number }> = [];

    const [group] = await db.select().from(groups).where(eq(groups.id, groupId));

    for (const link of links) {
      const [reservation] = await db.select().from(reservations)
        .where(eq(reservations.id, link.reservationId));

      if (!reservation || reservation.status !== "checked_in") continue;

      const chargesList = await db.select().from(charges)
        .where(eq(charges.reservationId, reservation.id));
      const paymentsList = await db.select().from(payments)
        .where(eq(payments.reservationId, reservation.id));

      const totalCharges = chargesList.reduce((sum, c) => sum + parseFloat(c.amount || "0"), 0);
      const totalPayments = paymentsList.reduce((sum, p) => sum + parseFloat(p.amount || "0"), 0);
      const roomTotal = parseFloat(reservation.totalRoomAmount || "0");
      const balance = roomTotal + totalCharges - totalPayments;

      const [room] = await db.select().from(rooms)
        .where(eq(rooms.id, reservation.roomId));

      if (balance > 0.01) {
        skipped++;
        const [guest] = await db.select().from(guests)
          .where(eq(guests.id, reservation.guestId));
        pendingBalance.push({
          room: room?.roomNumber || reservation.roomId,
          guestName: guest ? `${guest.lastName} ${guest.firstName}` : "Sin nombre",
          balance,
        });
        continue;
      }

      await db.update(reservations)
        .set({ status: "checked_out" })
        .where(eq(reservations.id, reservation.id));

      await db.update(rooms)
        .set({ status: "dirty" })
        .where(eq(rooms.id, reservation.roomId));

      try {
        await db.insert(housekeepingTasks).values({
          id: randomUUID(),
          roomId: reservation.roomId,
          type: "checkout_clean",
          priority: "high",
          status: "pending",
          notes: `Check-out grupal — ${group?.name || groupId}`,
          createdAt: new Date(),
        } as any);
      } catch {}

      processed++;
    }

    const allLinks = await db.select().from(groupReservationLinks)
      .where(eq(groupReservationLinks.groupId, groupId));
    let allDone = true;
    for (const l of allLinks) {
      const [r] = await db.select().from(reservations).where(eq(reservations.id, l.reservationId));
      if (r && r.status !== "checked_out" && r.status !== "cancelled") {
        allDone = false;
        break;
      }
    }
    if (allDone && allLinks.length > 0) {
      await db.update(groups).set({ status: "finished" as any }).where(eq(groups.id, groupId));
    }

    return { processed, skipped, pendingBalance };
  }
  // ==================== Cash Register Module ====================

  async getCashConfigs(): Promise<CashRegisterConfig[]> {
    return db.select().from(cashRegisterConfigs).orderBy(asc(cashRegisterConfigs.area));
  }

  async updateCashConfig(area: string, data: Partial<InsertCashRegisterConfig>): Promise<CashRegisterConfig | undefined> {
    const [updated] = await db.update(cashRegisterConfigs)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(cashRegisterConfigs.area, area))
      .returning();
    return updated;
  }

  async getCashShifts(area?: string, status?: string): Promise<CashShift[]> {
    const conditions: any[] = [];
    if (area) conditions.push(eq(cashShifts.area, area));
    if (status) conditions.push(eq(cashShifts.status, status));
    return db.select().from(cashShifts)
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .orderBy(desc(cashShifts.openedAt));
  }

  async getCurrentShift(area: string): Promise<CashShift | undefined> {
    const [shift] = await db.select().from(cashShifts)
      .where(and(eq(cashShifts.area, area), eq(cashShifts.status, "open")))
      .orderBy(desc(cashShifts.openedAt))
      .limit(1);
    return shift;
  }

  async openShift(data: InsertCashShift): Promise<CashShift> {
    const existing = await this.getCurrentShift(data.area);
    if (existing) {
      throw new Error("Ya hay un turno abierto para esta área");
    }

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayShifts = await db.select({ cnt: count() }).from(cashShifts)
      .where(and(
        eq(cashShifts.area, data.area),
        gte(cashShifts.openedAt, today)
      ));
    const shiftNumber = (todayShifts[0]?.cnt || 0) + 1;

    const [shift] = await db.insert(cashShifts).values({
      id: randomUUID(),
      area: data.area,
      shiftNumber,
      openedBy: data.openedBy,
      notes: data.notes || null,
      openedAt: new Date(),
      status: "open",
    }).returning();
    return shift;
  }

  async closeShift(shiftId: string, closedBy: string, notes?: string): Promise<{ shift: CashShift; summary: CashClosingSummary }> {
    const [shift] = await db.select().from(cashShifts).where(eq(cashShifts.id, shiftId));
    if (!shift) throw new Error("Turno no encontrado");
    if (shift.status !== "open") throw new Error("El turno ya está cerrado");

    const movements = await db.select().from(cashMovements).where(eq(cashMovements.shiftId, shiftId));

    const totals: Record<string, number> = {
      cash: 0, debit_card: 0, credit_card: 0, transfer: 0,
      mercadopago: 0, current_account: 0, room_charge: 0,
    };
    let totalGeneral = 0;

    for (const m of movements) {
      const amt = parseFloat(m.amount);
      const sign = m.movementType === "expense" ? -1 : 1;
      const method = m.paymentMethod;
      if (totals[method] !== undefined) totals[method] += amt * sign;
      totalGeneral += amt * sign;
    }

    const [summary] = await db.insert(cashClosingSummaries).values({
      id: randomUUID(),
      shiftId,
      area: shift.area,
      totalCash: totals.cash.toFixed(2),
      totalDebitCard: totals.debit_card.toFixed(2),
      totalCreditCard: totals.credit_card.toFixed(2),
      totalTransfer: totals.transfer.toFixed(2),
      totalMercadopago: totals.mercadopago.toFixed(2),
      totalCurrentAccount: totals.current_account.toFixed(2),
      totalRoomCharge: totals.room_charge.toFixed(2),
      totalGeneral: totalGeneral.toFixed(2),
      transactionCount: movements.length,
      closedBy,
      notes: notes || null,
    }).returning();

    const [updatedShift] = await db.update(cashShifts)
      .set({ status: "closed", closedAt: new Date(), closedBy })
      .where(eq(cashShifts.id, shiftId))
      .returning();

    return { shift: updatedShift, summary };
  }

  async getShiftDetail(shiftId: string): Promise<{ shift: CashShift; movements: CashMovement[]; summary: CashClosingSummary | null }> {
    const [shift] = await db.select().from(cashShifts).where(eq(cashShifts.id, shiftId));
    if (!shift) throw new Error("Turno no encontrado");
    const movements = await db.select().from(cashMovements)
      .where(eq(cashMovements.shiftId, shiftId))
      .orderBy(asc(cashMovements.createdAt));
    const [summary] = await db.select().from(cashClosingSummaries)
      .where(eq(cashClosingSummaries.shiftId, shiftId))
      .limit(1);
    return { shift, movements, summary: summary || null };
  }

  async getCashMovements(shiftId: string): Promise<CashMovement[]> {
    return db.select().from(cashMovements)
      .where(eq(cashMovements.shiftId, shiftId))
      .orderBy(desc(cashMovements.createdAt));
  }

  async createCashMovement(data: InsertCashMovement): Promise<CashMovement> {
    const [movement] = await db.insert(cashMovements).values({
      id: randomUUID(),
      ...data,
    }).returning();
    return movement;
  }

  async registerCashMovement(area: string, sourceType: string, sourceId: string | null, sourceLabel: string, paymentMethod: string, amount: string, movementType: string = "income", registeredBy?: string, receiptType?: string): Promise<CashMovement> {
    const currentShift = await this.getCurrentShift(area);
    const label = currentShift ? sourceLabel : `${sourceLabel} (sin turno asignado)`;
    const [movement] = await db.insert(cashMovements).values({
      id: randomUUID(),
      shiftId: currentShift?.id || null,
      area,
      sourceType,
      sourceId,
      sourceLabel: label,
      paymentMethod,
      amount,
      movementType,
      registeredBy: registeredBy || null,
      receiptType: receiptType || null,
    }).returning();
    return movement;
  }

  async getCashSummary(area?: string, from?: string, to?: string): Promise<any[]> {
    const conditions: any[] = [];
    if (area) conditions.push(eq(cashClosingSummaries.area, area));
    if (from) conditions.push(gte(cashClosingSummaries.closedAt, new Date(from)));
    if (to) {
      const toDate = new Date(to);
      toDate.setDate(toDate.getDate() + 1);
      conditions.push(lt(cashClosingSummaries.closedAt, toDate));
    }

    const summaries = await db.select().from(cashClosingSummaries)
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .orderBy(desc(cashClosingSummaries.closedAt));

    const results = [];
    for (const s of summaries) {
      const [shift] = await db.select().from(cashShifts).where(eq(cashShifts.id, s.shiftId));
      results.push({ ...s, shift });
    }
    return results;
  }
}

export const storage = new DatabaseStorage();
