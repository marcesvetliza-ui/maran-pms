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
export type RoomStatus = "available" | "occupied" | "dirty" | "cleaning" | "maintenance" | "oos";

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

// Companies (Empresas)
export type IvaCondition = "responsable_inscripto" | "monotributo" | "exento" | "consumidor_final" | "no_responsable";

export const companies = pgTable("companies", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  razonSocial: text("razon_social").notNull(),
  nombreFantasia: text("nombre_fantasia"),
  direccion: text("direccion"),
  pais: text("pais").default("Argentina"),
  codigoPostal: text("codigo_postal"),
  localidad: text("localidad"),
  provincia: text("provincia"),
  telefono: text("telefono"),
  email: text("email"),
  cuilCuit: text("cuil_cuit").notNull(),
  numeroFiscal: text("numero_fiscal"),
  condicionIva: text("condicion_iva").$type<IvaCondition>().default("responsable_inscripto"),
  inscripcionNacional: text("inscripcion_nacional"),
  inscripcionProvincial: text("inscripcion_provincial"),
  contactName: text("contact_name"),
  contactEmail: text("contact_email"),
  contactPhone: text("contact_phone"),
  creditLimit: decimal("credit_limit", { precision: 12, scale: 2 }).default("0"),
  paymentTermDays: integer("payment_term_days").default(30),
  notes: text("notes"),
  isActive: text("is_active").default("true"),
  createdAt: text("created_at"),
});

export const insertCompanySchema = createInsertSchema(companies).omit({ id: true });
export type InsertCompany = z.infer<typeof insertCompanySchema>;
export type Company = typeof companies.$inferSelect;

// Guests
export type GuestSex = "masculino" | "femenino" | "otro" | "no_especifica";

export const guests = pgTable("guests", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  codigo: text("codigo").unique(),
  firstName: text("first_name").notNull(),
  lastName: text("last_name").notNull(),
  email: text("email"),
  phone: text("phone"),
  documentType: text("document_type"),
  documentNumber: text("document_number"),
  nationality: text("nationality"),
  direccion: text("direccion"),
  localidad: text("localidad"),
  codigoPostal: text("codigo_postal"),
  fechaNacimiento: text("fecha_nacimiento"),
  sexo: text("sexo").$type<GuestSex>().default("no_especifica"),
  cuilCuit: text("cuil_cuit"),
  companyId: varchar("company_id"),
  fechaAlta: text("fecha_alta"),
});

export const insertGuestSchema = createInsertSchema(guests).omit({ id: true, codigo: true, fechaAlta: true });
export type InsertGuest = z.infer<typeof insertGuestSchema>;
export type Guest = typeof guests.$inferSelect;

// Reservations
export type ReservationStatus = "tentative" | "pending" | "confirmed" | "checked_in" | "checked_out" | "cancelled";
export type DiscountType = "none" | "percent" | "fixed";
export type ReservationSource = "directo" | "web" | "booking" | "expedia" | "airbnb" | "despegar" | "hotelbeds" | "agoda" | "ota" | "empresa" | "telefono";

export const reservations = pgTable("reservations", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  reservationCode: text("reservation_code").notNull(),
  guestId: varchar("guest_id").notNull(),
  companyId: varchar("company_id"),
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
  otaChannelId: varchar("ota_channel_id"),
  externalReservationId: text("external_reservation_id"),
  numberOfGuests: integer("number_of_guests").notNull().default(1),
  notes: text("notes"),
  createdAt: text("created_at").notNull(),
  lastModifiedBy: varchar("last_modified_by"),
});

export const insertReservationSchema = createInsertSchema(reservations).omit({ id: true });
export type InsertReservation = z.infer<typeof insertReservationSchema>;
export type Reservation = typeof reservations.$inferSelect;

// Charges (Cargos/Folio)
export type ChargeCategory = "room" | "restaurant" | "spa" | "minibar" | "otros" | "adjustment" | "payment";

export const charges = pgTable("charges", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  reservationId: varchar("reservation_id").notNull(),
  description: text("description").notNull(),
  amount: decimal("amount", { precision: 10, scale: 2 }).notNull(),
  date: text("date").notNull(),
  category: text("category").$type<ChargeCategory>().notNull().default("otros"),
  createdBy: varchar("created_by"),
});

export const insertChargeSchema = createInsertSchema(charges).omit({ id: true });
export type InsertCharge = z.infer<typeof insertChargeSchema>;
export type Charge = typeof charges.$inferSelect;

// Cancelled Reservation Log (registro de cancelaciones)
export const cancelledReservationLogs = pgTable("cancelled_reservation_logs", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  reservationCode: text("reservation_code").notNull(),
  guestName: text("guest_name").notNull(),
  roomNumber: text("room_number").notNull(),
  checkInDate: text("check_in_date").notNull(),
  checkOutDate: text("check_out_date").notNull(),
  cancellationDate: text("cancellation_date").notNull(),
  cancelledBy: varchar("cancelled_by"),
  reason: text("reason"),
});

export const insertCancelledReservationLogSchema = createInsertSchema(cancelledReservationLogs).omit({ id: true });
export type InsertCancelledReservationLog = z.infer<typeof insertCancelledReservationLogSchema>;
export type CancelledReservationLog = typeof cancelledReservationLogs.$inferSelect;

// Extended types for frontend with joined data
export type RatePlanWithRoomType = RatePlan & {
  roomType: RoomType;
};

export type GuestWithCompany = Guest & {
  company?: Company;
};

export type ReservationWithDetails = Reservation & {
  guest: Guest;
  company?: Company;
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
export type UserRole = "reception" | "housekeeping" | "management" | "director" | "restaurant" | "spa" | "security";

export const users = pgTable("users", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  username: text("username").notNull().unique(),
  password: text("password").notNull(),
  firstName: text("first_name"),
  lastName: text("last_name"),
  role: text("role").$type<UserRole>().notNull().default("reception"),
});

export const insertUserSchema = createInsertSchema(users).omit({ id: true });
export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof users.$inferSelect;

// OTA Channels (Canales de distribución)
export type OTAChannelType = "booking" | "expedia" | "airbnb" | "despegar" | "hotelbeds" | "agoda" | "trivago" | "manual";
export type OTAChannelStatus = "active" | "inactive" | "pending" | "error";

export const otaChannels = pgTable("ota_channels", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull(),
  channelType: text("channel_type").$type<OTAChannelType>().notNull(),
  status: text("status").$type<OTAChannelStatus>().notNull().default("inactive"),
  apiKey: text("api_key"),
  apiSecret: text("api_secret"),
  hotelCode: text("hotel_code"),
  commissionPercent: decimal("commission_percent", { precision: 5, scale: 2 }).default("15.00"),
  syncEnabled: text("sync_enabled").notNull().default("false"),
  lastSyncAt: text("last_sync_at"),
  createdAt: text("created_at").notNull(),
});

export const insertOTAChannelSchema = createInsertSchema(otaChannels).omit({ id: true });
export type InsertOTAChannel = z.infer<typeof insertOTAChannelSchema>;
export type OTAChannel = typeof otaChannels.$inferSelect;

// OTA Reservation Sync Log (registro de sincronización)
export type OTASyncStatus = "pending" | "synced" | "failed" | "cancelled";

export const otaReservationLogs = pgTable("ota_reservation_logs", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  channelId: varchar("channel_id").notNull(),
  externalReservationId: text("external_reservation_id").notNull(),
  internalReservationId: varchar("internal_reservation_id"),
  guestName: text("guest_name").notNull(),
  checkInDate: text("check_in_date").notNull(),
  checkOutDate: text("check_out_date").notNull(),
  roomTypeName: text("room_type_name"),
  totalAmount: decimal("total_amount", { precision: 10, scale: 2 }),
  commission: decimal("commission", { precision: 10, scale: 2 }),
  netAmount: decimal("net_amount", { precision: 10, scale: 2 }),
  status: text("status").$type<OTASyncStatus>().notNull().default("pending"),
  rawData: text("raw_data"),
  syncedAt: text("synced_at"),
  createdAt: text("created_at").notNull(),
});

export const insertOTAReservationLogSchema = createInsertSchema(otaReservationLogs).omit({ id: true });
export type InsertOTAReservationLog = z.infer<typeof insertOTAReservationLogSchema>;
export type OTAReservationLog = typeof otaReservationLogs.$inferSelect;

// Extended OTA types
export type OTAChannelWithStats = OTAChannel & {
  totalReservations: number;
  pendingSync: number;
  totalRevenue: number;
  totalCommission: number;
};

export type OTAReservationLogWithChannel = OTAReservationLog & {
  channel: OTAChannel;
};
