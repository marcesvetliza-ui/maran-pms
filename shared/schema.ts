import { sql } from "drizzle-orm";
import { pgTable, text, varchar, integer, date, timestamp, decimal } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

// Room Types
export const roomTypes = pgTable("room_types", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  code: text("code").notNull(),
  name: text("name").notNull(),
  description: text("description"),
  baseOccupancy: integer("base_occupancy").notNull().default(2),
  maxOccupancy: integer("max_occupancy").notNull().default(4),
});

export const insertRoomTypeSchema = createInsertSchema(roomTypes).omit({ id: true });
export type InsertRoomType = z.infer<typeof insertRoomTypeSchema>;
export type RoomType = typeof roomTypes.$inferSelect;

// Rate Plans (Planes Tarifarios)
export const ratePlans = pgTable("rate_plans", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull(),
  roomTypeId: varchar("room_type_id").notNull(),
  baseRate: decimal("base_rate", { precision: 10, scale: 2 }).notNull(),
  currency: text("currency").notNull().default("ARS"),
  refundable: text("refundable").notNull().default("true"),
  cancellationPolicy: text("cancellation_policy"),
});

export const insertRatePlanSchema = createInsertSchema(ratePlans).omit({ id: true });
export type InsertRatePlan = z.infer<typeof insertRatePlanSchema>;
export type RatePlan = typeof ratePlans.$inferSelect;

// Rooms
export type RoomStatus = "available" | "occupied" | "cleaning" | "maintenance";

export const rooms = pgTable("rooms", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  roomNumber: text("room_number").notNull().unique(),
  roomTypeId: varchar("room_type_id").notNull(),
  floor: integer("floor").notNull().default(1),
  status: text("status").$type<RoomStatus>().notNull().default("available"),
  notes: text("notes"),
});

export const insertRoomSchema = createInsertSchema(rooms).omit({ id: true });
export type InsertRoom = z.infer<typeof insertRoomSchema>;
export type Room = typeof rooms.$inferSelect;

// Guests
export const guests = pgTable("guests", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  firstName: text("first_name").notNull(),
  lastName: text("last_name").notNull(),
  email: text("email"),
  phone: text("phone"),
  documentType: text("document_type"),
  documentNumber: text("document_number"),
  nationality: text("nationality"),
  address: text("address"),
});

export const insertGuestSchema = createInsertSchema(guests).omit({ id: true });
export type InsertGuest = z.infer<typeof insertGuestSchema>;
export type Guest = typeof guests.$inferSelect;

// Reservations
export type ReservationStatus = "pending" | "confirmed" | "checked_in" | "checked_out" | "cancelled";
export type DiscountType = "none" | "percent" | "fixed";
export type ReservationSource = "directo" | "web" | "ota" | "empresa" | "telefono";

export const reservations = pgTable("reservations", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  reservationCode: text("reservation_code").notNull(),
  guestId: varchar("guest_id").notNull(),
  roomTypeId: varchar("room_type_id").notNull(),
  roomId: varchar("room_id").notNull(),
  ratePlanId: varchar("rate_plan_id"),
  checkInDate: text("check_in_date").notNull(),
  checkOutDate: text("check_out_date").notNull(),
  nights: integer("nights").notNull().default(1),
  baseRatePerNight: decimal("base_rate_per_night", { precision: 10, scale: 2 }),
  discountType: text("discount_type").$type<DiscountType>().notNull().default("none"),
  discountValue: decimal("discount_value", { precision: 10, scale: 2 }).default("0"),
  finalRatePerNight: decimal("final_rate_per_night", { precision: 10, scale: 2 }),
  totalRoomAmount: decimal("total_room_amount", { precision: 10, scale: 2 }),
  status: text("status").$type<ReservationStatus>().notNull().default("pending"),
  source: text("source").$type<ReservationSource>().notNull().default("directo"),
  numberOfGuests: integer("number_of_guests").notNull().default(1),
  notes: text("notes"),
  createdAt: text("created_at").notNull(),
});

export const insertReservationSchema = createInsertSchema(reservations).omit({ id: true });
export type InsertReservation = z.infer<typeof insertReservationSchema>;
export type Reservation = typeof reservations.$inferSelect;

// Charges (Cargos/Folio)
export type ChargeCategory = "room" | "restaurant" | "spa" | "minibar" | "otros" | "adjustment";

export const charges = pgTable("charges", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  reservationId: varchar("reservation_id").notNull(),
  description: text("description").notNull(),
  amount: decimal("amount", { precision: 10, scale: 2 }).notNull(),
  date: text("date").notNull(),
  category: text("category").$type<ChargeCategory>().notNull().default("otros"),
});

export const insertChargeSchema = createInsertSchema(charges).omit({ id: true });
export type InsertCharge = z.infer<typeof insertChargeSchema>;
export type Charge = typeof charges.$inferSelect;

// Extended types for frontend with joined data
export type RatePlanWithRoomType = RatePlan & {
  roomType: RoomType;
};

export type ReservationWithDetails = Reservation & {
  guest: Guest;
  room: Room & { roomType?: RoomType };
  ratePlan?: RatePlan;
  charges?: Charge[];
};

export type RoomWithType = Room & {
  roomType: RoomType;
};

// Planning types
export type PlanningCellStatus = "available" | "booked" | "checked_in" | "checkout_today" | "maintenance" | "cleaning";

export type PlanningData = {
  rooms: RoomWithType[];
  days: string[];
  occupancy: Record<string, PlanningCellStatus[]>;
  reservations: Record<string, { id: string; guestName: string; checkIn: string; checkOut: string; status: ReservationStatus }>;
  cellReservations: Record<string, Record<string, string>>; // roomId -> date -> reservationId
};

// Users (for authentication)
export const users = pgTable("users", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  username: text("username").notNull().unique(),
  password: text("password").notNull(),
});

export const insertUserSchema = createInsertSchema(users).pick({
  username: true,
  password: true,
});

export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof users.$inferSelect;
