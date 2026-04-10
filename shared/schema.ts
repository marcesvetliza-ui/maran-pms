import { sql } from "drizzle-orm";
import { pgTable, text, varchar, integer, date, timestamp, decimal, boolean, serial, numeric, jsonb } from "drizzle-orm/pg-core";
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
  // Public booking engine fields
  publicDescription: text("public_description"),
  amenities: text("amenities").array(),
  photos: text("photos").array(),
  sortOrder: integer("sort_order").default(0),
  showInBooking: boolean("show_in_booking").default(true),
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
  rate1pax: decimal("rate_1pax", { precision: 10, scale: 2 }),
  rate2pax: decimal("rate_2pax", { precision: 10, scale: 2 }),
  rate3pax: decimal("rate_3pax", { precision: 10, scale: 2 }),
  rate4pax: decimal("rate_4pax", { precision: 10, scale: 2 }),
  currency: text("currency").notNull().default("ARS"),
  refundable: text("refundable").notNull().default("true"),
  cancellationPolicy: text("cancellation_policy"),
  validFrom: date("valid_from"),
  validTo: date("valid_to"),
});

export const insertRatePlanSchema = createInsertSchema(ratePlans).omit({ id: true });
export type InsertRatePlan = z.infer<typeof insertRatePlanSchema>;
export type RatePlan = typeof ratePlans.$inferSelect;

// Rooms
export type RoomStatus = "available" | "occupied" | "dirty" | "cleaning" | "maintenance" | "oos" | "inspected";
export type RoomFeature = "accessible" | "balcony" | "separable_bed" | "sofa_bed" | "shower_only" | "extra_bed" | "twin_config" | "living_room";
export type BedConfig = "MAT" | "TWIN" | "MAT_CC" | "TWIN_CC" | "MAT_EXTRA" | "MAT_CC_EXTRA";

export const rooms = pgTable("rooms", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  roomNumber: text("room_number").notNull().unique(),
  roomTypeId: varchar("room_type_id").notNull(),
  floor: integer("floor").notNull().default(1),
  status: text("status").$type<RoomStatus>().notNull().default("available"),
  bedConfig: text("bed_config"),
  features: text("features").array(),
  maxOccupancy: integer("max_occupancy").default(2),
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
  createdAt: timestamp("created_at"),
});

export const insertCompanySchema = createInsertSchema(companies).omit({ id: true });
export type InsertCompany = z.infer<typeof insertCompanySchema>;
export type Company = typeof companies.$inferSelect;

// Travel Agencies
export const agencies = pgTable("agencies", {
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
  contactName: text("contact_name"),
  contactEmail: text("contact_email"),
  contactPhone: text("contact_phone"),
  commissionRate: decimal("commission_rate", { precision: 5, scale: 2 }).default("0"),
  creditLimit: decimal("credit_limit", { precision: 12, scale: 2 }).default("0"),
  paymentTermDays: integer("payment_term_days").default(30),
  notes: text("notes"),
  isActive: text("is_active").default("true"),
  createdAt: timestamp("created_at"),
});

export const insertAgencySchema = createInsertSchema(agencies).omit({ id: true });
export type InsertAgency = z.infer<typeof insertAgencySchema>;
export type Agency = typeof agencies.$inferSelect;

// Guests
export type GuestSex = "masculino" | "femenino" | "otro" | "no_especifica";
export type GuestSegment = "LEISURE" | "CORP" | "SPORT" | "CONGRESS" | "OTHER";

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
  fechaNacimiento: date("fecha_nacimiento"),
  sexo: text("sexo").$type<GuestSex>().default("no_especifica"),
  segment: text("segment").$type<GuestSegment>().default("LEISURE"),
  cuilCuit: text("cuil_cuit"),
  companyId: varchar("company_id"),
  agencyId: varchar("agency_id"),
  fechaAlta: timestamp("fecha_alta"),
  vehiculoPatente: text("vehiculo_patente"),
  vehiculoMarca: text("vehiculo_marca"),
  vehiculoModelo: text("vehiculo_modelo"),
  vehiculoColor: text("vehiculo_color"),
});

export const insertGuestSchema = createInsertSchema(guests).omit({ id: true, codigo: true, fechaAlta: true });
export type InsertGuest = z.infer<typeof insertGuestSchema>;
export type Guest = typeof guests.$inferSelect;

// Bed Types (Tipos de Camaje)
export const bedTypes = pgTable("bed_types", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  code: text("code").notNull().unique(),
  name: text("name").notNull(),
  description: text("description"),
  isActive: boolean("is_active").notNull().default(true),
  displayOrder: integer("display_order").notNull().default(0),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertBedTypeSchema = createInsertSchema(bedTypes).omit({ id: true, createdAt: true });
export type InsertBedType = z.infer<typeof insertBedTypeSchema>;
export type BedType = typeof bedTypes.$inferSelect;

// Reservations
export type ReservationStatus = "tentative" | "pending" | "confirmed" | "checked_in" | "checked_out" | "cancelled";
export type DiscountType = "none" | "percent" | "fixed";
export type ReservationSource = "directo" | "web" | "booking" | "expedia" | "airbnb" | "despegar" | "hotelbeds" | "agoda" | "ota" | "empresa" | "telefono" | "agencia";

export const reservations = pgTable("reservations", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  reservationCode: text("reservation_code").notNull(),
  guestId: varchar("guest_id").notNull(),
  companyId: varchar("company_id"),
  agencyId: varchar("agency_id"),
  roomTypeId: varchar("room_type_id").notNull(),
  roomId: varchar("room_id").notNull(),
  ratePlanId: varchar("rate_plan_id"),
  checkInDate: date("check_in_date").notNull(),
  checkOutDate: date("check_out_date").notNull(),
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
  bedTypeId: varchar("bed_type_id"),
  bedTypeNotes: text("bed_type_notes"),
  earlyCheckIn: boolean("early_check_in").default(false),
  earlyCheckInTime: text("early_check_in_time"),
  earlyCheckInCharge: numeric("early_check_in_charge", { precision: 10, scale: 2 }),
  lateCheckOut: boolean("late_check_out").default(false),
  lateCheckOutTime: text("late_check_out_time"),
  lateCheckOutCharge: numeric("late_check_out_charge", { precision: 10, scale: 2 }),
  notes: text("notes"),
  voucherCode: text("voucher_code"),
  voucherNotes: text("voucher_notes"),
  createdAt: timestamp("created_at").notNull(),
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
  date: date("date").notNull(),
  category: text("category").$type<ChargeCategory>().notNull().default("otros"),
  createdBy: varchar("created_by"),
  status: text("status").notNull().default("active"),
  anuladoPor: text("anulado_por"),
  motivoAnulacion: text("motivo_anulacion"),
  anuladoAt: timestamp("anulado_at"),
});

export const insertChargeSchema = createInsertSchema(charges).omit({ id: true });
export type InsertCharge = z.infer<typeof insertChargeSchema>;
export type Charge = typeof charges.$inferSelect;

// Payment methods
export type PaymentMethod = "efectivo" | "tarjeta_debito" | "tarjeta_credito" | "transferencia" | "mercadopago" | "cuenta_corriente";

// Payments table (pagos adelantados y durante estadía)
export type BillingTarget = "guest" | "company" | "agency";

export const payments = pgTable("payments", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  reservationId: varchar("reservation_id").notNull(),
  amount: decimal("amount", { precision: 10, scale: 2 }).notNull(),
  method: text("method").$type<PaymentMethod>().notNull(),
  date: date("date").notNull(),
  reference: text("reference"),
  receivedBy: varchar("received_by"),
  notes: text("notes"),
  billingTarget: text("billing_target").$type<BillingTarget>().default("guest"),
  companyId: varchar("company_id"),
  agencyId: varchar("agency_id"),
  status: text("status").notNull().default("active"),
  anuladoPor: text("anulado_por"),
  motivoAnulacion: text("motivo_anulacion"),
  anuladoAt: timestamp("anulado_at"),
});

export const insertPaymentSchema = createInsertSchema(payments).omit({ id: true });
export type InsertPayment = z.infer<typeof insertPaymentSchema>;
export type Payment = typeof payments.$inferSelect;

// Cancelled Reservation Log (registro de cancelaciones)
export const cancelledReservationLogs = pgTable("cancelled_reservation_logs", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  reservationCode: text("reservation_code").notNull(),
  guestName: text("guest_name").notNull(),
  roomNumber: text("room_number").notNull(),
  checkInDate: date("check_in_date").notNull(),
  checkOutDate: date("check_out_date").notNull(),
  cancellationDate: timestamp("cancellation_date").notNull(),
  cancelledBy: varchar("cancelled_by"),
  reason: text("reason"),
});

export const insertCancelledReservationLogSchema = createInsertSchema(cancelledReservationLogs).omit({ id: true });
export type InsertCancelledReservationLog = z.infer<typeof insertCancelledReservationLogSchema>;
export type CancelledReservationLog = typeof cancelledReservationLogs.$inferSelect;

// Housekeeping Tasks
export type HousekeepingTaskStatus = "pending" | "in_progress" | "completed" | "inspected";
export type HousekeepingTaskType = "checkout_clean" | "stayover_clean" | "deep_clean" | "inspection" | "turndown" | "maintenance_prep";
export type HousekeepingPriority = "low" | "normal" | "high" | "urgent";

export const housekeepingTasks = pgTable("housekeeping_tasks", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  roomId: varchar("room_id").notNull(),
  taskType: text("task_type").$type<HousekeepingTaskType>().notNull().default("checkout_clean"),
  status: text("status").$type<HousekeepingTaskStatus>().notNull().default("pending"),
  priority: text("priority").$type<HousekeepingPriority>().notNull().default("normal"),
  assignedTo: varchar("assigned_to"),
  notes: text("notes"),
  scheduledDate: date("scheduled_date").notNull(),
  startedAt: timestamp("started_at"),
  completedAt: timestamp("completed_at"),
  inspectedBy: varchar("inspected_by"),
  inspectedAt: timestamp("inspected_at"),
  createdAt: timestamp("created_at").notNull(),
});

export const insertHousekeepingTaskSchema = createInsertSchema(housekeepingTasks).omit({ id: true });
export type InsertHousekeepingTask = z.infer<typeof insertHousekeepingTaskSchema>;
export type HousekeepingTask = typeof housekeepingTasks.$inferSelect;

export type HousekeepingTaskWithRoom = HousekeepingTask & {
  room: Room & { roomType?: RoomType };
};

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
  agency?: Agency;
  room: Room & { roomType?: RoomType };
  ratePlan?: RatePlan;
  charges?: Charge[];
  payments?: Payment[];
};

export type RoomWithType = Room & {
  roomType: RoomType;
};

// Planning types
export type PlanningCellStatus = "available" | "booked" | "checkin_today" | "checked_in" | "checkout_today" | "maintenance" | "cleaning" | "dirty" | "group_blocked" | "early_blocked" | "late_blocked" | "inspected";

export type PlanningData = {
  rooms: RoomWithType[];
  days: string[];
  occupancy: Record<string, PlanningCellStatus[]>;
  reservations: Record<string, { id: string; guestName: string; checkIn: string; checkOut: string; status: ReservationStatus; source: ReservationSource; isGroup?: boolean; groupName?: string; groupId?: string; groupColor?: string; earlyCheckIn?: boolean; earlyCheckInTime?: string | null; lateCheckOut?: boolean; lateCheckOutTime?: string | null }>;
  cellReservations: Record<string, Record<string, string>>; // roomId -> date -> reservationId
  groupBlocks: Record<string, { id: string; groupName: string; groupCode: string; checkIn: string; checkOut: string }>;
  cellGroupBlocks: Record<string, Record<string, string>>; // roomId -> date -> groupBlockId
  unassignedGroupBlocks?: Array<{
    groupId: string;
    groupName: string;
    groupCode: string;
    roomTypeName: string;
    quantity: number;
    assigned: number;
    checkIn: string;
    checkOut: string;
  }>;
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
  lastSyncAt: timestamp("last_sync_at"),
  createdAt: timestamp("created_at").notNull(),
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
  checkInDate: date("check_in_date").notNull(),
  checkOutDate: date("check_out_date").notNull(),
  roomTypeName: text("room_type_name"),
  totalAmount: decimal("total_amount", { precision: 10, scale: 2 }),
  commission: decimal("commission", { precision: 10, scale: 2 }),
  netAmount: decimal("net_amount", { precision: 10, scale: 2 }),
  status: text("status").$type<OTASyncStatus>().notNull().default("pending"),
  rawData: text("raw_data"),
  syncedAt: timestamp("synced_at"),
  createdAt: timestamp("created_at").notNull(),
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

// Groups (Grupos de reservas)
export type GroupStatus = "tentative" | "blocked" | "confirmed" | "inhouse" | "finished" | "cancelled";

export const groups = pgTable("groups", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  groupCode: text("group_code").notNull().unique(),
  name: text("name").notNull(),
  contactName: text("contact_name"),
  contactPhone: text("contact_phone"),
  contactEmail: text("contact_email"),
  eventDate: date("event_date"),
  eventSalon: text("event_salon"),
  eventTime: text("event_time"),
  checkInDate: date("check_in_date").notNull(),
  checkOutDate: date("check_out_date").notNull(),
  status: text("status").$type<GroupStatus>().notNull().default("tentative"),
  releaseDate: date("release_date"),
  notes: text("notes"),
  color: text("color").default("#6366f1"),
  createdAt: timestamp("created_at").notNull(),
  createdBy: varchar("created_by"),
});

export const insertGroupSchema = createInsertSchema(groups).omit({ id: true });
export type InsertGroup = z.infer<typeof insertGroupSchema>;
export type Group = typeof groups.$inferSelect;

// Group Room Blocks (Bloqueos de habitaciones para grupos)
export const groupRoomBlocks = pgTable("group_room_blocks", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  groupId: varchar("group_id").notNull(),
  roomTypeId: varchar("room_type_id").notNull(),
  quantity: integer("quantity").notNull(),
  ratePlanId: varchar("rate_plan_id"),
  agreedRate: decimal("agreed_rate", { precision: 12, scale: 2 }),
  // Block-specific dates (can differ from group master dates)
  blockCheckInDate: date("block_check_in_date"),
  blockCheckOutDate: date("block_check_out_date"),
});

export const insertGroupRoomBlockSchema = createInsertSchema(groupRoomBlocks).omit({ id: true });
export type InsertGroupRoomBlock = z.infer<typeof insertGroupRoomBlockSchema>;
export type GroupRoomBlock = typeof groupRoomBlocks.$inferSelect;

// Group Reservation Links (Vinculación de reservas a grupos)
export const groupReservationLinks = pgTable("group_reservation_links", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  groupId: varchar("group_id").notNull(),
  reservationId: varchar("reservation_id").notNull(),
});

export const insertGroupReservationLinkSchema = createInsertSchema(groupReservationLinks).omit({ id: true });
export type InsertGroupReservationLink = z.infer<typeof insertGroupReservationLinkSchema>;
export type GroupReservationLink = typeof groupReservationLinks.$inferSelect;

// Extended Group types
export type GroupRoomBlockWithDetails = GroupRoomBlock & {
  roomType: RoomType;
  ratePlan?: RatePlan;
};

export type GroupWithDetails = Group & {
  blocks: GroupRoomBlockWithDetails[];
  reservations: ReservationWithDetails[];
  totalRooms: number;
  assignedRooms: number;
};

// Group Charges (Cargos del folio grupal)
export const groupCharges = pgTable("group_charges", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  groupId: varchar("group_id").notNull(),
  description: text("description").notNull(),
  amount: decimal("amount", { precision: 10, scale: 2 }).notNull(),
  date: date("date").notNull(),
  category: text("category").notNull().default("otros"),
  billingTarget: text("billing_target").notNull().default("group"),
  reservationId: varchar("reservation_id"),
  createdBy: varchar("created_by"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertGroupChargeSchema = createInsertSchema(groupCharges).omit({ id: true, createdAt: true });
export type InsertGroupCharge = z.infer<typeof insertGroupChargeSchema>;
export type GroupCharge = typeof groupCharges.$inferSelect;

// Group Payments (Pagos del folio grupal)
export const groupPayments = pgTable("group_payments", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  groupId: varchar("group_id").notNull(),
  amount: decimal("amount", { precision: 10, scale: 2 }).notNull(),
  method: text("method").notNull(),
  date: date("date").notNull(),
  reference: text("reference"),
  distribution: text("distribution").notNull().default("equal"),
  distributionDetail: jsonb("distribution_detail"),
  receivedBy: varchar("received_by"),
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertGroupPaymentSchema = createInsertSchema(groupPayments).omit({ id: true, createdAt: true });
export type InsertGroupPayment = z.infer<typeof insertGroupPaymentSchema>;
export type GroupPayment = typeof groupPayments.$inferSelect;

// Group Folio consolidated data type
export type GroupFolioData = {
  group: GroupWithDetails;
  groupCharges: GroupCharge[];
  groupChargesTotal: number;
  reservations: Array<{
    reservationId: string;
    guestName: string;
    roomNumber: string;
    nights: number;
    accommodationTotal: number;
    extrasTotal: number;
    paymentsTotal: number;
    balance: number;
  }>;
  groupPayments: GroupPayment[];
  groupPaymentsTotal: number;
  totals: {
    accommodation: number;
    groupCharges: number;
    extras: number;
    payments: number;
    balance: number;
  };
};

// Guest Reviews with Sentiment Analysis
export type SentimentType = "positive" | "neutral" | "negative";
export type ReviewCategory = "service" | "cleanliness" | "location" | "amenities" | "value" | "food" | "staff" | "general";

export const guestReviews = pgTable("guest_reviews", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  reservationId: varchar("reservation_id"),
  guestId: varchar("guest_id").notNull(),
  roomId: varchar("room_id"),
  reviewDate: date("review_date").notNull(),
  source: text("source").notNull().default("direct"),
  rating: integer("rating").notNull(),
  title: text("title"),
  content: text("content").notNull(),
  // Sentiment Analysis Results
  sentiment: text("sentiment").$type<SentimentType>(),
  sentimentScore: decimal("sentiment_score", { precision: 5, scale: 4 }),
  categories: text("categories").array(),
  categoryScores: text("category_scores"),
  keyPhrases: text("key_phrases").array(),
  improvementSuggestions: text("improvement_suggestions").array(),
  analyzedAt: timestamp("analyzed_at"),
  isPublished: text("is_published").default("false"),
  staffResponse: text("staff_response"),
  respondedAt: timestamp("responded_at"),
  respondedBy: text("responded_by"),
});

export const insertGuestReviewSchema = createInsertSchema(guestReviews).omit({ id: true });
export type InsertGuestReview = z.infer<typeof insertGuestReviewSchema>;
export type GuestReview = typeof guestReviews.$inferSelect;

export type GuestReviewWithDetails = GuestReview & {
  guest: Guest;
  room?: Room;
  reservation?: Reservation;
};

// ==================== EVENTS MODULE ====================

// Event Rooms (Salones de Eventos)
export type EventRoomStatus = "available" | "occupied" | "maintenance" | "reserved";

export const eventRooms = pgTable("event_rooms", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull(),
  capacity: integer("capacity").notNull().default(50),
  status: text("status").$type<EventRoomStatus>().notNull().default("available"),
  description: text("description"),
  amenities: text("amenities").array(),
  isActive: text("is_active").default("true"),
});

export const insertEventRoomSchema = createInsertSchema(eventRooms).omit({ id: true });
export type InsertEventRoom = z.infer<typeof insertEventRoomSchema>;
export type EventRoom = typeof eventRooms.$inferSelect;

// Event Types (Tipos de evento)
export type EventType = "corporate" | "social" | "wedding" | "conference" | "seminar" | "cocktail" | "meeting" | "table_event" | "other";

// Event Status
export type EventStatus = "tentative" | "confirmed" | "in_progress" | "completed" | "cancelled" | "invoiced";

// Events (Eventos)
export const events = pgTable("events", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  eventCode: text("event_code").notNull(),
  name: text("name").notNull(),
  eventRoomId: varchar("event_room_id").notNull(),
  eventType: text("event_type").$type<EventType>().notNull().default("corporate"),
  contactName: text("contact_name").notNull(),
  contactPhone: text("contact_phone"),
  contactEmail: text("contact_email"),
  companyId: varchar("company_id"),
  startDate: date("start_date").notNull(),
  endDate: date("end_date").notNull(),
  startTime: text("start_time"),
  endTime: text("end_time"),
  attendees: integer("attendees").default(10),
  attendeesAdults: integer("attendees_adults").default(0),
  attendeesYouth: integer("attendees_youth").default(0),
  attendeesChildren: integer("attendees_children").default(0),
  status: text("status").$type<EventStatus>().notNull().default("tentative"),
  notes: text("notes"),
  notasArmado: text("notas_armado"),
  notasCocina: text("notas_cocina"),
  notasMantenimiento: text("notas_mantenimiento"),
  notasHousekeeping: text("notas_housekeeping"),
  receiptType: text("receipt_type"),
  closedAt: timestamp("closed_at"),
  totalAmount: decimal("total_amount", { precision: 10, scale: 2 }),
  totalPaid: decimal("total_paid", { precision: 10, scale: 2 }),
  createdAt: timestamp("created_at").notNull(),
});

export const insertEventSchema = createInsertSchema(events).omit({ id: true });
export type InsertEvent = z.infer<typeof insertEventSchema>;
export type Event = typeof events.$inferSelect;

// Event Charge Types (Tipos de cargo predefinidos)
export const eventChargeTypes = pgTable("event_charge_types", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  code: text("code").notNull().unique(),
  name: text("name").notNull(),
  defaultPrice: decimal("default_price", { precision: 10, scale: 2 }),
  isActive: text("is_active").default("true"),
});

export const insertEventChargeTypeSchema = createInsertSchema(eventChargeTypes).omit({ id: true });
export type InsertEventChargeType = z.infer<typeof insertEventChargeTypeSchema>;
export type EventChargeType = typeof eventChargeTypes.$inferSelect;

// Event Charges (Cargos de eventos)
export const eventCharges = pgTable("event_charges", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  eventId: varchar("event_id").notNull(),
  chargeTypeId: varchar("charge_type_id"),
  description: text("description").notNull(),
  quantity: integer("quantity").notNull().default(1),
  unitPrice: decimal("unit_price", { precision: 10, scale: 2 }).notNull(),
  totalAmount: decimal("total_amount", { precision: 10, scale: 2 }).notNull(),
  date: date("date").notNull(),
  notes: text("notes"),
  createdAt: timestamp("created_at").notNull(),
});

export const insertEventChargeSchema = createInsertSchema(eventCharges).omit({ id: true });
export type InsertEventCharge = z.infer<typeof insertEventChargeSchema>;
export type EventCharge = typeof eventCharges.$inferSelect;

// Event Payments (Pagos de eventos)
export const eventPayments = pgTable("event_payments", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  eventId: varchar("event_id").notNull(),
  amount: decimal("amount", { precision: 10, scale: 2 }).notNull(),
  method: text("method").notNull(),
  isAdvance: text("is_advance").default("false"),
  reservationId: varchar("reservation_id"),
  notes: text("notes"),
  paidAt: timestamp("paid_at"),
  createdAt: timestamp("created_at"),
  status: text("status").notNull().default("active"),
  motivoAnulacion: text("motivo_anulacion"),
  anuladoAt: timestamp("anulado_at"),
});

export const insertEventPaymentSchema = createInsertSchema(eventPayments).omit({ id: true });
export type InsertEventPayment = z.infer<typeof insertEventPaymentSchema>;
export type EventPayment = typeof eventPayments.$inferSelect;

// Event Tables (Mesas de eventos por mesa)
export const eventTables = pgTable("event_tables", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  eventId: varchar("event_id").notNull(),
  tableNumber: integer("table_number").notNull(),
  label: text("label"),
  seats: integer("seats"),
  status: text("status").notNull().default("open"),
  reservationId: varchar("reservation_id"),
  receiptType: text("receipt_type"),
  closedAt: timestamp("closed_at"),
  createdAt: timestamp("created_at"),
});

export const insertEventTableSchema = createInsertSchema(eventTables).omit({ id: true });
export type InsertEventTable = z.infer<typeof insertEventTableSchema>;
export type EventTable = typeof eventTables.$inferSelect;

// Event Table Charges
export const eventTableCharges = pgTable("event_table_charges", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  eventTableId: varchar("event_table_id").notNull(),
  description: text("description").notNull(),
  quantity: integer("quantity").notNull().default(1),
  unitPrice: decimal("unit_price", { precision: 10, scale: 2 }).notNull(),
  total: decimal("total", { precision: 10, scale: 2 }).notNull(),
  createdAt: timestamp("created_at"),
});

export const insertEventTableChargeSchema = createInsertSchema(eventTableCharges).omit({ id: true });
export type InsertEventTableCharge = z.infer<typeof insertEventTableChargeSchema>;
export type EventTableCharge = typeof eventTableCharges.$inferSelect;

// Event Table Payments
export const eventTablePayments = pgTable("event_table_payments", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  eventTableId: varchar("event_table_id").notNull(),
  amount: decimal("amount", { precision: 10, scale: 2 }).notNull(),
  method: text("method").notNull(),
  isAdvance: text("is_advance").default("false"),
  reservationId: varchar("reservation_id"),
  receiptType: text("receipt_type"),
  paidAt: timestamp("paid_at"),
  createdAt: timestamp("created_at"),
});

export const insertEventTablePaymentSchema = createInsertSchema(eventTablePayments).omit({ id: true });
export type InsertEventTablePayment = z.infer<typeof insertEventTablePaymentSchema>;
export type EventTablePayment = typeof eventTablePayments.$inferSelect;

// Extended Event types
export type EventWithDetails = Event & {
  eventRoom: EventRoom;
  company?: Company;
  charges?: EventChargeWithType[];
  payments?: EventPayment[];
};

export type EventChargeWithType = EventCharge & {
  chargeType?: EventChargeType;
};

export type EventTableWithDetails = EventTable & {
  charges: EventTableCharge[];
  payments: EventTablePayment[];
};

// Event Planning types
export type EventPlanningCellStatus = "available" | "event" | "maintenance" | "reserved";

export type EventPlanningData = {
  rooms: EventRoom[];
  days: string[];
  occupancy: Record<string, EventPlanningCellStatus[]>;
  events: Record<string, { id: string; name: string; contactName: string; startDate: string; endDate: string; status: EventStatus; eventType: EventType }>;
  cellEvents: Record<string, Record<string, string>>; // roomId -> date -> eventId
};

// Conversations and Messages for Chat (AI Integrations)
export const conversations = pgTable("conversations", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  title: text("title").notNull(),
  createdAt: timestamp("created_at"),
});

export const messages = pgTable("messages", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  conversationId: varchar("conversation_id").notNull(),
  role: text("role").notNull(),
  content: text("content").notNull(),
  createdAt: timestamp("created_at"),
});

// ==================== RESTAURANT MODULE ====================

// Restaurant Areas (Salones)
export type RestaurantAreaType = "indoor" | "outdoor" | "terrace" | "bar" | "private";

export const restaurantAreas = pgTable("restaurant_areas", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull(),
  areaType: text("area_type").$type<RestaurantAreaType>().notNull().default("indoor"),
  capacity: integer("capacity").notNull().default(20),
  hasTables: text("has_tables").default("true"),
  isActive: text("is_active").default("true"),
  notes: text("notes"),
});

export const insertRestaurantAreaSchema = createInsertSchema(restaurantAreas).omit({ id: true });
export type InsertRestaurantArea = z.infer<typeof insertRestaurantAreaSchema>;
export type RestaurantArea = typeof restaurantAreas.$inferSelect;

// Restaurant Tables
export type TableStatus = "available" | "occupied" | "reserved" | "cleaning" | "blocked";
export type TableShape = "square" | "round" | "rectangular";

export const restaurantTables = pgTable("restaurant_tables", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  tableNumber: text("table_number").notNull(),
  areaId: varchar("area_id").notNull(),
  capacity: integer("capacity").notNull().default(4),
  shape: text("shape").$type<TableShape>().default("square"),
  status: text("status").$type<TableStatus>().notNull().default("available"),
  positionX: integer("position_x").default(0),
  positionY: integer("position_y").default(0),
  hasWindow: text("has_window").default("false"),
  isActive: text("is_active").default("true"),
});

export const insertRestaurantTableSchema = createInsertSchema(restaurantTables).omit({ id: true });
export type InsertRestaurantTable = z.infer<typeof insertRestaurantTableSchema>;
export type RestaurantTable = typeof restaurantTables.$inferSelect;

export type RestaurantTableWithArea = RestaurantTable & {
  area: RestaurantArea;
};

// Table Reservations
export type TableReservationStatus = "pending" | "confirmed" | "seated" | "completed" | "cancelled" | "no_show";

export const tableReservations = pgTable("table_reservations", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  tableId: varchar("table_id").notNull(),
  guestName: text("guest_name").notNull(),
  guestPhone: text("guest_phone"),
  guestEmail: text("guest_email"),
  partySize: integer("party_size").notNull().default(2),
  reservationDate: date("reservation_date").notNull(),
  reservationTime: text("reservation_time").notNull(),
  status: text("status").$type<TableReservationStatus>().notNull().default("pending"),
  notes: text("notes"),
  advanceAmount: decimal("advance_amount", { precision: 10, scale: 2 }).default("0"),
  advanceMethod: text("advance_method"),
  advanceDate: date("advance_date"),
  advanceNotes: text("advance_notes"),
  createdAt: timestamp("created_at").notNull(),
});

export const insertTableReservationSchema = createInsertSchema(tableReservations).omit({ id: true });
export type InsertTableReservation = z.infer<typeof insertTableReservationSchema>;
export type TableReservation = typeof tableReservations.$inferSelect;

export type TableReservationWithTable = TableReservation & {
  table: RestaurantTable;
};

// Menu Categories
export const menuCategories = pgTable("menu_categories", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull(),
  description: text("description"),
  displayOrder: integer("display_order").default(0),
  isActive: text("is_active").default("true"),
});

export const insertMenuCategorySchema = createInsertSchema(menuCategories).omit({ id: true });
export type InsertMenuCategory = z.infer<typeof insertMenuCategorySchema>;
export type MenuCategory = typeof menuCategories.$inferSelect;

// Menu Items
export const menuItems = pgTable("menu_items", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  categoryId: varchar("category_id").notNull(),
  name: text("name").notNull(),
  description: text("description"),
  price: decimal("price", { precision: 10, scale: 2 }).notNull(),
  preparationTime: integer("preparation_time"),
  isAvailable: text("is_available").default("true"),
  isActive: text("is_active").default("true"),
  isEditable: text("is_editable").default("false"),
  allergens: text("allergens").array(),
  displayOrder: integer("display_order").default(0),
});

export const insertMenuItemSchema = createInsertSchema(menuItems).omit({ id: true });
export type InsertMenuItem = z.infer<typeof insertMenuItemSchema>;
export type MenuItem = typeof menuItems.$inferSelect;

export type MenuItemWithCategory = MenuItem & {
  category: MenuCategory;
};

// Restaurant Orders
export type OrderStatus = "open" | "in_progress" | "served" | "closed" | "cancelled";
export type OrderType = "dine_in" | "room_service" | "takeaway";

export type ReceiptType = "ticket" | "factura_a" | "factura_b" | "factura_c" | "nota_credito";
export type RestaurantPaymentMethod = "efectivo" | "tarjeta_debito" | "tarjeta_credito" | "transferencia" | "cuenta_habitacion" | "mercadopago";

export const restaurantOrders = pgTable("restaurant_orders", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  orderNumber: text("order_number").notNull(),
  tableId: varchar("table_id"),
  areaId: varchar("area_id"),
  reservationId: varchar("reservation_id"),
  guestId: varchar("guest_id"),
  orderType: text("order_type").$type<OrderType>().notNull().default("dine_in"),
  status: text("status").$type<OrderStatus>().notNull().default("open"),
  covers: integer("covers").default(1),
  waiterName: text("waiter_name"),
  orderLabel: text("order_label"),
  activeCourse: integer("active_course").default(1),
  subtotal: decimal("subtotal", { precision: 10, scale: 2 }).default("0"),
  tax: decimal("tax", { precision: 10, scale: 2 }).default("0"),
  total: decimal("total", { precision: 10, scale: 2 }).default("0"),
  notes: text("notes"),
  openedAt: timestamp("opened_at").notNull(),
  closedAt: timestamp("closed_at"),
  chargedToRoom: text("charged_to_room").default("false"),
  roomNumber: text("room_number"),
  receiptType: text("receipt_type").$type<ReceiptType>(),
  paymentMethod: text("payment_method").$type<RestaurantPaymentMethod>(),
});

export const insertRestaurantOrderSchema = createInsertSchema(restaurantOrders).omit({ id: true });
export type InsertRestaurantOrder = z.infer<typeof insertRestaurantOrderSchema>;
export type RestaurantOrder = typeof restaurantOrders.$inferSelect;

// Order Items
export type OrderItemStatus = "pending" | "preparing" | "ready" | "served" | "cancelled" | "waiting_course";

export const orderItems = pgTable("order_items", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  orderId: varchar("order_id").notNull(),
  menuItemId: varchar("menu_item_id").notNull(),
  quantity: integer("quantity").notNull().default(1),
  unitPrice: decimal("unit_price", { precision: 10, scale: 2 }).notNull(),
  subtotal: decimal("subtotal", { precision: 10, scale: 2 }).notNull(),
  status: text("status").$type<OrderItemStatus>().notNull().default("pending"),
  course: integer("course").default(1),
  notes: text("notes"),
  sentAt: timestamp("sent_at"),
});

export const insertOrderItemSchema = createInsertSchema(orderItems).omit({ id: true });
export type InsertOrderItem = z.infer<typeof insertOrderItemSchema>;
export type OrderItem = typeof orderItems.$inferSelect;

export type OrderItemWithMenuItem = OrderItem & {
  menuItem: MenuItem;
};

export type RestaurantOrderWithDetails = RestaurantOrder & {
  table?: RestaurantTableWithArea;
  area?: RestaurantArea;
  guest?: Guest;
  items: OrderItemWithMenuItem[];
};

// Order Splits (bill splitting)
export const orderSplits = pgTable("order_splits", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  orderId: varchar("order_id").notNull(),
  splitNumber: integer("split_number").notNull(),
  amount: decimal("amount", { precision: 10, scale: 2 }).notNull(),
  method: text("method").$type<RestaurantPaymentMethod>(),
  receiptType: text("receipt_type").$type<ReceiptType>(),
  isPaid: text("is_paid").default("false"),
  paidAt: timestamp("paid_at"),
  createdAt: timestamp("created_at"),
});

export const insertOrderSplitSchema = createInsertSchema(orderSplits).omit({ id: true });
export type InsertOrderSplit = z.infer<typeof insertOrderSplitSchema>;
export type OrderSplit = typeof orderSplits.$inferSelect;

// Restaurant Time Slots (configurable reservation turns)
export const restaurantTimeSlots = pgTable("restaurant_time_slots", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  time: text("time").notNull(),
  label: text("label"),
  isActive: text("is_active").default("true"),
  displayOrder: integer("display_order").default(0),
});

export const insertRestaurantTimeSlotSchema = createInsertSchema(restaurantTimeSlots).omit({ id: true });
export type InsertRestaurantTimeSlot = z.infer<typeof insertRestaurantTimeSlotSchema>;
export type RestaurantTimeSlot = typeof restaurantTimeSlots.$inferSelect;

// Recipes (ingredients per dish)
export const recipes = pgTable("recipes", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  menuItemId: varchar("menu_item_id").notNull(),
  notes: text("notes"),
});

export const insertRecipeSchema = createInsertSchema(recipes).omit({ id: true });
export type InsertRecipe = z.infer<typeof insertRecipeSchema>;
export type Recipe = typeof recipes.$inferSelect;

// Recipe Ingredients
export const recipeIngredients = pgTable("recipe_ingredients", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  recipeId: varchar("recipe_id").notNull(),
  inventoryItemId: varchar("inventory_item_id"),
  ingredientName: text("ingredient_name").notNull(),
  quantity: decimal("quantity", { precision: 10, scale: 3 }).notNull(),
  unit: text("unit").notNull(),
  unitCost: decimal("unit_cost", { precision: 10, scale: 2 }).default("0"),
  warehouseId: varchar("warehouse_id"),
});

export const insertRecipeIngredientSchema = createInsertSchema(recipeIngredients).omit({ id: true });
export type InsertRecipeIngredient = z.infer<typeof insertRecipeIngredientSchema>;
export type RecipeIngredient = typeof recipeIngredients.$inferSelect;

export type RecipeWithIngredients = Recipe & {
  menuItem?: MenuItem;
  ingredients: RecipeIngredient[];
};

// ==================== INVENTORY MODULE ====================

// Item Categories (for inventory)
export type InventoryArea = "general" | "spa" | "restaurant" | "housekeeping" | "maintenance" | "admin";

export const itemCategories = pgTable("item_categories", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull(),
  description: text("description"),
  parentId: varchar("parent_id"),
  area: text("area").$type<InventoryArea>().notNull().default("general"),
  isActive: text("is_active").default("true"),
});

export const insertItemCategorySchema = createInsertSchema(itemCategories).omit({ id: true });
export type InsertItemCategory = z.infer<typeof insertItemCategorySchema>;
export type ItemCategory = typeof itemCategories.$inferSelect;

// Suppliers (Proveedores)
export const suppliers = pgTable("suppliers", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull(),
  contactName: text("contact_name"),
  phone: text("phone"),
  email: text("email"),
  address: text("address"),
  cuit: text("cuit"),
  paymentTermDays: integer("payment_term_days").default(30),
  notes: text("notes"),
  isActive: text("is_active").default("true"),
});

export const insertSupplierSchema = createInsertSchema(suppliers).omit({ id: true });
export type InsertSupplier = z.infer<typeof insertSupplierSchema>;
export type Supplier = typeof suppliers.$inferSelect;

// Inventory Items (Articulos)
export type UnitType = "unidad" | "kg" | "g" | "litro" | "ml" | "caja" | "paquete" | "docena";

export const inventoryItems = pgTable("inventory_items", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  sku: text("sku").unique(),
  name: text("name").notNull(),
  description: text("description"),
  categoryId: varchar("category_id"),
  supplierId: varchar("supplier_id"),
  unit: text("unit").$type<UnitType>().notNull().default("unidad"),
  costPrice: decimal("cost_price", { precision: 10, scale: 2 }).default("0"),
  minStock: decimal("min_stock", { precision: 10, scale: 3 }).default("0"),
  maxStock: decimal("max_stock", { precision: 10, scale: 3 }),
  currentStock: decimal("current_stock", { precision: 10, scale: 3 }).default("0"),
  location: text("location"),
  isActive: text("is_active").default("true"),
});

export const insertInventoryItemSchema = createInsertSchema(inventoryItems).omit({ id: true });
export type InsertInventoryItem = z.infer<typeof insertInventoryItemSchema>;
export type InventoryItem = typeof inventoryItems.$inferSelect;

export type InventoryItemWithDetails = InventoryItem & {
  category?: ItemCategory;
  supplier?: Supplier;
};

// Stock Movements (Movimientos de Stock)
export type MovementType = "entrada" | "salida" | "ajuste" | "transferencia" | "consumo";

export const stockMovements = pgTable("stock_movements", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  itemId: varchar("item_id").notNull(),
  movementType: text("movement_type").$type<MovementType>().notNull(),
  quantity: decimal("quantity", { precision: 10, scale: 3 }).notNull(),
  previousStock: decimal("previous_stock", { precision: 10, scale: 3 }).notNull(),
  newStock: decimal("new_stock", { precision: 10, scale: 3 }).notNull(),
  unitCost: decimal("unit_cost", { precision: 10, scale: 2 }),
  reference: text("reference"),
  notes: text("notes"),
  sourceType: text("source_type"),
  sourceId: varchar("source_id"),
  createdAt: timestamp("created_at").notNull(),
  createdBy: text("created_by"),
  warehouseId: varchar("warehouse_id"),
  toWarehouseId: varchar("to_warehouse_id"),
});

export const insertStockMovementSchema = createInsertSchema(stockMovements).omit({ id: true });
export type InsertStockMovement = z.infer<typeof insertStockMovementSchema>;
export type StockMovement = typeof stockMovements.$inferSelect;

export type StockMovementWithItem = StockMovement & {
  item: InventoryItem;
};

// ==================== WAREHOUSES (Depósitos) ====================

export const inventoryWarehouses = pgTable("inventory_warehouses", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull(),
  description: text("description"),
  area: text("area").$type<InventoryArea>().notNull().default("general"),
  isActive: text("is_active").default("true"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertInventoryWarehouseSchema = createInsertSchema(inventoryWarehouses).omit({ id: true, createdAt: true });
export type InsertInventoryWarehouse = z.infer<typeof insertInventoryWarehouseSchema>;
export type InventoryWarehouse = typeof inventoryWarehouses.$inferSelect;

// Stock per Warehouse (Stock por depósito)
export const warehouseStock = pgTable("warehouse_stock", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  warehouseId: varchar("warehouse_id").notNull(),
  itemId: varchar("item_id").notNull(),
  currentStock: decimal("current_stock", { precision: 10, scale: 3 }).default("0"),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const insertWarehouseStockSchema = createInsertSchema(warehouseStock).omit({ id: true, updatedAt: true });
export type InsertWarehouseStock = z.infer<typeof insertWarehouseStockSchema>;
export type WarehouseStock = typeof warehouseStock.$inferSelect;

export type WarehouseStockWithDetails = WarehouseStock & {
  warehouse: InventoryWarehouse;
  item: InventoryItem;
};

// Item Price History (Historial de precios)
export const itemPriceHistory = pgTable("item_price_history", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  itemId: varchar("item_id").notNull(),
  price: decimal("price", { precision: 10, scale: 2 }).notNull(),
  recordedAt: timestamp("recorded_at").defaultNow(),
  source: text("source").default("manual"),
  notes: text("notes"),
});

export const insertItemPriceHistorySchema = createInsertSchema(itemPriceHistory).omit({ id: true, recordedAt: true });
export type InsertItemPriceHistory = z.infer<typeof insertItemPriceHistorySchema>;
export type ItemPriceHistory = typeof itemPriceHistory.$inferSelect;

// Purchase Orders (Ordenes de Compra)
export type PurchaseOrderStatus = "draft" | "sent" | "partial" | "received" | "cancelled";

export const purchaseOrders = pgTable("purchase_orders", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  orderNumber: text("order_number").notNull(),
  supplierId: varchar("supplier_id").notNull(),
  status: text("status").$type<PurchaseOrderStatus>().notNull().default("draft"),
  subtotal: decimal("subtotal", { precision: 12, scale: 2 }).default("0"),
  tax: decimal("tax", { precision: 12, scale: 2 }).default("0"),
  total: decimal("total", { precision: 12, scale: 2 }).default("0"),
  notes: text("notes"),
  createdAt: timestamp("created_at").notNull(),
  expectedDate: date("expected_date"),
  receivedAt: timestamp("received_at"),
});

export const insertPurchaseOrderSchema = createInsertSchema(purchaseOrders).omit({ id: true });
export type InsertPurchaseOrder = z.infer<typeof insertPurchaseOrderSchema>;
export type PurchaseOrder = typeof purchaseOrders.$inferSelect;

// Purchase Order Items
export const purchaseOrderItems = pgTable("purchase_order_items", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  purchaseOrderId: varchar("purchase_order_id").notNull(),
  itemId: varchar("item_id").notNull(),
  quantity: integer("quantity").notNull(),
  unitCost: decimal("unit_cost", { precision: 10, scale: 2 }).notNull(),
  subtotal: decimal("subtotal", { precision: 10, scale: 2 }).notNull(),
  receivedQuantity: integer("received_quantity").default(0),
});

export const insertPurchaseOrderItemSchema = createInsertSchema(purchaseOrderItems).omit({ id: true });
export type InsertPurchaseOrderItem = z.infer<typeof insertPurchaseOrderItemSchema>;
export type PurchaseOrderItem = typeof purchaseOrderItems.$inferSelect;

export type PurchaseOrderWithDetails = PurchaseOrder & {
  supplier: Supplier;
  items: (PurchaseOrderItem & { item: InventoryItem })[];
};

// =====================
// SPA MODULE
// =====================

// SPA Cabins (Gabinetes)
export const spaCabins = pgTable("spa_cabins", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull(),
  description: text("description"),
  isActive: text("is_active").default("true"),
});

export const insertSpaCabinSchema = createInsertSchema(spaCabins).omit({ id: true });
export type InsertSpaCabin = z.infer<typeof insertSpaCabinSchema>;
export type SpaCabin = typeof spaCabins.$inferSelect;

// SPA Treatment Categories
export const spaTreatmentCategories = pgTable("spa_treatment_categories", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull(),
  description: text("description"),
  sortOrder: integer("sort_order").default(0),
});

export const insertSpaTreatmentCategorySchema = createInsertSchema(spaTreatmentCategories).omit({ id: true });
export type InsertSpaTreatmentCategory = z.infer<typeof insertSpaTreatmentCategorySchema>;
export type SpaTreatmentCategory = typeof spaTreatmentCategories.$inferSelect;

// SPA Treatments
export const spaTreatments = pgTable("spa_treatments", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  categoryId: varchar("category_id"),
  name: text("name").notNull(),
  description: text("description"),
  durationMinutes: integer("duration_minutes").notNull().default(60),
  price: decimal("price", { precision: 10, scale: 2 }).notNull().default("0"),
  isActive: text("is_active").default("true"),
});

export const insertSpaTreatmentSchema = createInsertSchema(spaTreatments).omit({ id: true });
export type InsertSpaTreatment = z.infer<typeof insertSpaTreatmentSchema>;
export type SpaTreatment = typeof spaTreatments.$inferSelect;

// SPA Professionals
export const spaProfessionals = pgTable("spa_professionals", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull(),
  lastName: text("last_name"),
  isActive: text("is_active").default("true"),
});

export const insertSpaProfessionalSchema = createInsertSchema(spaProfessionals).omit({ id: true });
export type InsertSpaProfessional = z.infer<typeof insertSpaProfessionalSchema>;
export type SpaProfessional = typeof spaProfessionals.$inferSelect;

// SPA Clients
export const spaClients = pgTable("spa_clients", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  firstName: text("first_name").notNull(),
  lastName: text("last_name"),
  phone: text("phone"),
  email: text("email"),
  notes: text("notes"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertSpaClientSchema = createInsertSchema(spaClients).omit({ id: true, createdAt: true });
export type InsertSpaClient = z.infer<typeof insertSpaClientSchema>;
export type SpaClient = typeof spaClients.$inferSelect;

// SPA Appointments (Turnos)
export type SpaAppointmentStatus = "pending" | "confirmed" | "in_progress" | "completed" | "cancelled" | "no_show";

export const spaAppointments = pgTable("spa_appointments", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  cabinId: varchar("cabin_id").notNull(),
  treatmentId: varchar("treatment_id").notNull(),
  professionalId: varchar("professional_id"),
  guestName: text("guest_name").notNull(),
  guestLastName: text("guest_last_name"),
  guestPhone: text("guest_phone"),
  guestEmail: text("guest_email"),
  reservationId: varchar("reservation_id"),
  appointmentDate: date("appointment_date").notNull(),
  startTime: text("start_time").notNull(),
  endTime: text("end_time").notNull(),
  status: text("status").$type<SpaAppointmentStatus>().notNull().default("pending"),
  notes: text("notes"),
  createdAt: timestamp("created_at").notNull(),
});

export const insertSpaAppointmentSchema = createInsertSchema(spaAppointments).omit({ id: true });
export type InsertSpaAppointment = z.infer<typeof insertSpaAppointmentSchema>;
export type SpaAppointment = typeof spaAppointments.$inferSelect;

export type SpaAppointmentWithDetails = SpaAppointment & {
  cabin: SpaCabin;
  treatment: SpaTreatment;
};

// SPA Account (Cuenta SPA - similar to restaurant orders)
export type SpaAccountStatus = "open" | "closed" | "cancelled";

export const spaAccounts = pgTable("spa_accounts", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  appointmentId: varchar("appointment_id").notNull(),
  guestName: text("guest_name").notNull(),
  reservationId: varchar("reservation_id"),
  status: text("status").$type<SpaAccountStatus>().notNull().default("open"),
  subtotal: decimal("subtotal", { precision: 10, scale: 2 }).default("0"),
  total: decimal("total", { precision: 10, scale: 2 }).default("0"),
  totalPaid: decimal("total_paid", { precision: 10, scale: 2 }).default("0"),
  receiptType: text("receipt_type"),
  notes: text("notes"),
  openedAt: timestamp("opened_at").notNull(),
  closedAt: timestamp("closed_at"),
  closedBy: text("closed_by"),
  chargedTo: text("charged_to"),
});

export const insertSpaAccountSchema = createInsertSchema(spaAccounts).omit({ id: true });
export type InsertSpaAccount = z.infer<typeof insertSpaAccountSchema>;
export type SpaAccount = typeof spaAccounts.$inferSelect;

// SPA Account Items (Cargos en cuenta SPA)
export const spaAccountItems = pgTable("spa_account_items", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  accountId: varchar("account_id").notNull(),
  description: text("description").notNull(),
  quantity: integer("quantity").notNull().default(1),
  unitPrice: decimal("unit_price", { precision: 10, scale: 2 }).notNull(),
  subtotal: decimal("subtotal", { precision: 10, scale: 2 }).notNull(),
  itemType: text("item_type").notNull().default("treatment"),
  notes: text("notes"),
  createdAt: timestamp("created_at").notNull(),
});

export const insertSpaAccountItemSchema = createInsertSchema(spaAccountItems).omit({ id: true });
export type InsertSpaAccountItem = z.infer<typeof insertSpaAccountItemSchema>;
export type SpaAccountItem = typeof spaAccountItems.$inferSelect;

export const treatmentSupplies = pgTable("treatment_supplies", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  treatmentId: varchar("treatment_id").notNull(),
  inventoryItemId: varchar("inventory_item_id").notNull(),
  quantity: decimal("quantity", { precision: 10, scale: 3 }).notNull(),
  unit: text("unit").notNull(),
  notes: text("notes"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertTreatmentSupplySchema = createInsertSchema(treatmentSupplies).omit({ id: true, createdAt: true });
export type InsertTreatmentSupply = z.infer<typeof insertTreatmentSupplySchema>;
export type TreatmentSupply = typeof treatmentSupplies.$inferSelect;

export type SpaPaymentMethod = "cash" | "debit_card" | "credit_card" | "transfer" | "mercadopago" | "room_charge";

export const spaPayments = pgTable("spa_payments", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  accountId: varchar("account_id").notNull(),
  amount: decimal("amount", { precision: 10, scale: 2 }).notNull(),
  method: text("method").$type<SpaPaymentMethod>().notNull(),
  isAdvance: text("is_advance").default("false"),
  appointmentId: varchar("appointment_id"),
  reservationId: varchar("reservation_id"),
  notes: text("notes"),
  createdAt: timestamp("created_at").notNull(),
  status: text("status").notNull().default("active"),
  motivoAnulacion: text("motivo_anulacion"),
  anuladoAt: timestamp("anulado_at"),
});

export const insertSpaPaymentSchema = createInsertSchema(spaPayments).omit({ id: true });
export type InsertSpaPayment = z.infer<typeof insertSpaPaymentSchema>;
export type SpaPayment = typeof spaPayments.$inferSelect;

export type SpaAccountWithItems = SpaAccount & {
  items: SpaAccountItem[];
  payments: SpaPayment[];
  appointment?: SpaAppointmentWithDetails;
};

// ============== MAINTENANCE MODULE ==============

// Maintenance Staff (Personal de Mantenimiento)
export const maintenanceStaff = pgTable("maintenance_staff", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull(),
  phone: text("phone"),
  email: text("email"),
  specialty: text("specialty"),
  isActive: text("is_active").default("true"),
});

export const insertMaintenanceStaffSchema = createInsertSchema(maintenanceStaff).omit({ id: true });
export type InsertMaintenanceStaff = z.infer<typeof insertMaintenanceStaffSchema>;
export type MaintenanceStaff = typeof maintenanceStaff.$inferSelect;

// Work Order types
export type WorkOrderPriority = "low" | "medium" | "high" | "urgent";
export type WorkOrderStatus = "pending" | "assigned" | "in_progress" | "completed" | "cancelled";
export type WorkOrderCategory = "plumbing" | "electrical" | "hvac" | "furniture" | "cleaning" | "appliances" | "structure" | "general";

// Work Orders (Ordenes de Trabajo)
export const workOrders = pgTable("work_orders", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  orderCode: text("order_code").notNull(),
  title: text("title").notNull(),
  description: text("description"),
  roomId: varchar("room_id"),
  location: text("location"),
  category: text("category").$type<WorkOrderCategory>().notNull().default("general"),
  priority: text("priority").$type<WorkOrderPriority>().notNull().default("medium"),
  status: text("status").$type<WorkOrderStatus>().notNull().default("pending"),
  assignedToId: varchar("assigned_to_id"),
  reportedBy: text("reported_by"),
  reportedAt: timestamp("reported_at").notNull(),
  scheduledDate: date("scheduled_date"),
  completedAt: timestamp("completed_at"),
  completedBy: text("completed_by"),
  estimatedCost: decimal("estimated_cost", { precision: 10, scale: 2 }),
  actualCost: decimal("actual_cost", { precision: 10, scale: 2 }),
  notes: text("notes"),
});

export const insertWorkOrderSchema = createInsertSchema(workOrders).omit({ id: true });
export type InsertWorkOrder = z.infer<typeof insertWorkOrderSchema>;
export type WorkOrder = typeof workOrders.$inferSelect;

export type WorkOrderWithDetails = WorkOrder & {
  room?: Room;
  assignedTo?: MaintenanceStaff;
  maintenanceBlock?: MaintenanceBlock;
};

// Maintenance Room Blocks (bloqueos de habitación por mantenimiento con fechas)
export const maintenanceBlocks = pgTable("maintenance_blocks", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  workOrderId: varchar("work_order_id"),
  roomId: varchar("room_id").notNull(),
  blockFrom: date("block_from").notNull(),
  blockTo: date("block_to").notNull(),
  blockedBy: text("blocked_by").notNull(),
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertMaintenanceBlockSchema = createInsertSchema(maintenanceBlocks).omit({ id: true, createdAt: true });
export type InsertMaintenanceBlock = z.infer<typeof insertMaintenanceBlockSchema>;
export type MaintenanceBlock = typeof maintenanceBlocks.$inferSelect;

// ============== ADMINISTRATION MODULE ==============

// System User Roles (extends existing UserRole with admin roles)
export type SystemUserRole = "admin" | "manager" | "reception" | "housekeeping" | "maintenance" | "restaurant" | "spa" | "events";

// System Users (Usuarios del Sistema)
export const systemUsers = pgTable("system_users", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  username: text("username").notNull().unique(),
  password: text("password"),
  email: text("email").notNull(),
  fullName: text("full_name").notNull(),
  role: text("role").$type<SystemUserRole>().notNull().default("reception"),
  department: text("department"),
  phone: text("phone"),
  isActive: text("is_active").default("true"),
  lastLogin: timestamp("last_login"),
  createdAt: timestamp("created_at").notNull(),
});

export const insertSystemUserSchema = createInsertSchema(systemUsers).omit({ id: true });
export type InsertSystemUser = z.infer<typeof insertSystemUserSchema>;
export type SystemUser = typeof systemUsers.$inferSelect;

// System Settings (Configuracion del Sistema)
export const systemSettings = pgTable("system_settings", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  key: text("key").notNull().unique(),
  value: text("value").notNull(),
  category: text("category").notNull().default("general"),
  description: text("description"),
  updatedAt: timestamp("updated_at").notNull(),
  updatedBy: text("updated_by"),
});

export const insertSystemSettingSchema = createInsertSchema(systemSettings).omit({ id: true });
export type InsertSystemSetting = z.infer<typeof insertSystemSettingSchema>;
export type SystemSetting = typeof systemSettings.$inferSelect;

// Audit Logs (Registro de Auditoria)
export type AuditAction = "create" | "update" | "delete" | "login" | "logout" | "view" | "export";

export const auditLogs = pgTable("audit_logs", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id"),
  userName: text("user_name"),
  action: text("action").$type<AuditAction>().notNull(),
  module: text("module").notNull(),
  entityType: text("entity_type"),
  entityId: varchar("entity_id"),
  description: text("description").notNull(),
  details: text("details"),
  ipAddress: text("ip_address"),
  timestamp: timestamp("timestamp").notNull(),
});

export const insertAuditLogSchema = createInsertSchema(auditLogs).omit({ id: true });
export type InsertAuditLog = z.infer<typeof insertAuditLogSchema>;
export type AuditLog = typeof auditLogs.$inferSelect;

// Packages (Paquetes Turisticos)
export type PackageStatus = "active" | "inactive" | "expired";

export const packages = pgTable("packages", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  code: text("code").notNull().unique(),
  name: text("name").notNull(),
  description: text("description"),
  roomTypeId: varchar("room_type_id"),
  nights: integer("nights").notNull().default(1),
  basePrice: decimal("base_price", { precision: 12, scale: 2 }).notNull(),
  discountPercent: decimal("discount_percent", { precision: 5, scale: 2 }),
  validFrom: date("valid_from"),
  validUntil: date("valid_until"),
  status: text("status").$type<PackageStatus>().notNull().default("active"),
  includedServices: text("included_services").array(),
  terms: text("terms"),
  createdAt: timestamp("created_at").notNull(),
});

export const insertPackageSchema = createInsertSchema(packages).omit({ id: true });
export type InsertPackage = z.infer<typeof insertPackageSchema>;
export type Package = typeof packages.$inferSelect;

// Package Included Items (Items incluidos en paquetes)
export type PackageItemType = "accommodation" | "breakfast" | "dinner" | "spa" | "restaurant" | "event" | "transfer" | "other";

export const packageItems = pgTable("package_items", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  packageId: varchar("package_id").notNull(),
  itemType: text("item_type").$type<PackageItemType>().notNull(),
  description: text("description").notNull(),
  quantity: integer("quantity").notNull().default(1),
  unitValue: decimal("unit_value", { precision: 10, scale: 2 }),
});

export const insertPackageItemSchema = createInsertSchema(packageItems).omit({ id: true });
export type InsertPackageItem = z.infer<typeof insertPackageItemSchema>;
export type PackageItem = typeof packageItems.$inferSelect;

// Package Room Prices (precios por tipo de habitación)
export const packageRoomPrices = pgTable("package_room_prices", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  packageId: varchar("package_id").notNull(),
  roomTypeId: varchar("room_type_id").notNull(),
  price: decimal("price", { precision: 12, scale: 2 }).notNull(),
});

export const insertPackageRoomPriceSchema = createInsertSchema(packageRoomPrices).omit({ id: true });
export type InsertPackageRoomPrice = z.infer<typeof insertPackageRoomPriceSchema>;
export type PackageRoomPrice = typeof packageRoomPrices.$inferSelect;

export type PackageRoomPriceWithType = PackageRoomPrice & {
  roomType?: RoomType;
};

// Package with details
export type PackageWithDetails = Package & {
  roomType?: RoomType;
  items: PackageItem[];
  roomPrices: PackageRoomPriceWithType[];
};

// System Notifications (base for chatbot + web check-in)
export type NotificationType = "web_checkin" | "chatbot_request" | "chatbot_housekeeping" | "chatbot_maintenance" | "chatbot_restaurant" | "chatbot_spa" | "hospitality_alert";
export type NotificationArea = "reception" | "housekeeping" | "maintenance" | "restaurant" | "spa" | "all";
export type NotificationPriority = "low" | "normal" | "high" | "urgent";

export const systemNotifications = pgTable("system_notifications", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  type: text("type").$type<NotificationType>().notNull(),
  title: text("title").notNull(),
  message: text("message").notNull(),
  targetArea: text("target_area").$type<NotificationArea>().notNull(),
  relatedEntityType: text("related_entity_type"),
  relatedEntityId: text("related_entity_id"),
  isRead: boolean("is_read").default(false),
  readAt: timestamp("read_at"),
  readBy: text("read_by"),
  priority: text("priority").$type<NotificationPriority>().notNull().default("normal"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertSystemNotificationSchema = createInsertSchema(systemNotifications).omit({ id: true, createdAt: true, isRead: true, readAt: true, readBy: true });
export type InsertSystemNotification = z.infer<typeof insertSystemNotificationSchema>;
export type SystemNotification = typeof systemNotifications.$inferSelect;

// Web Check-in
export type WebCheckinStatus = "pending" | "completed" | "expired";

export const webCheckins = pgTable("web_checkins", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  reservationId: varchar("reservation_id").notNull(),
  token: text("token").notNull().unique(),
  status: text("status").$type<WebCheckinStatus>().notNull().default("pending"),
  confirmedFirstName: text("confirmed_first_name"),
  confirmedLastName: text("confirmed_last_name"),
  confirmedDocumentType: text("confirmed_document_type"),
  confirmedDocumentNumber: text("confirmed_document_number"),
  confirmedNationality: text("confirmed_nationality"),
  confirmedPhone: text("confirmed_phone"),
  confirmedEmail: text("confirmed_email"),
  documentPhotoUrl: text("document_photo_url"),
  estimatedArrivalTime: text("estimated_arrival_time"),
  requestEarlyCheckIn: boolean("request_early_check_in").default(false),
  earlyCheckInTime: text("early_check_in_time"),
  termsAccepted: boolean("terms_accepted").default(false),
  termsAcceptedAt: timestamp("terms_accepted_at"),
  ipAddress: text("ip_address"),
  completedAt: timestamp("completed_at"),
  expiresAt: timestamp("expires_at"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertWebCheckinSchema = createInsertSchema(webCheckins).omit({ id: true, createdAt: true });
export type InsertWebCheckin = z.infer<typeof insertWebCheckinSchema>;
export type WebCheckin = typeof webCheckins.$inferSelect;

// Hospitality Module - Guest Preferences CRM
export type PreferenceCategory = "habitacion" | "alimentacion" | "amenities" | "servicio" | "fecha_especial" | "motivo_viaje" | "nota_interna" | "otro";
export type PreferencePriority = "low" | "normal" | "high" | "critical";

export const guestPreferences = pgTable("guest_preferences", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  guestId: varchar("guest_id").notNull(),
  category: text("category").$type<PreferenceCategory>().notNull(),
  subcategory: text("subcategory"),
  title: text("title").notNull(),
  description: text("description"),
  isActive: boolean("is_active").notNull().default(true),
  priority: text("priority").$type<PreferencePriority>().notNull().default("normal"),
  visibleTo: text("visible_to").array().notNull().default(["all"]),
  recordedBy: text("recorded_by"),
  sourceStay: varchar("source_stay"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const insertGuestPreferenceSchema = createInsertSchema(guestPreferences).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertGuestPreference = z.infer<typeof insertGuestPreferenceSchema>;
export type GuestPreference = typeof guestPreferences.$inferSelect;

export const stayNotes = pgTable("stay_notes", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  reservationId: varchar("reservation_id").notNull(),
  guestId: varchar("guest_id"),
  category: text("category").$type<PreferenceCategory>().notNull(),
  title: text("title").notNull(),
  description: text("description"),
  priority: text("priority").$type<PreferencePriority>().notNull().default("normal"),
  visibleTo: text("visible_to").array().notNull().default(["all"]),
  isResolved: boolean("is_resolved").default(false),
  resolvedAt: timestamp("resolved_at"),
  resolvedBy: text("resolved_by"),
  recordedBy: text("recorded_by"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertStayNoteSchema = createInsertSchema(stayNotes).omit({ id: true, createdAt: true, isResolved: true, resolvedAt: true, resolvedBy: true });
export type InsertStayNote = z.infer<typeof insertStayNoteSchema>;
export type StayNote = typeof stayNotes.$inferSelect;

export const hospitalityAlerts = pgTable("hospitality_alerts", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  reservationId: varchar("reservation_id").notNull(),
  guestId: varchar("guest_id").notNull(),
  preferenceId: varchar("preference_id"),
  alertMessage: text("alert_message").notNull(),
  targetArea: text("target_area").notNull(),
  priority: text("priority").$type<PreferencePriority>().notNull().default("normal"),
  isAcknowledged: boolean("is_acknowledged").default(false),
  acknowledgedAt: timestamp("acknowledged_at"),
  acknowledgedBy: text("acknowledged_by"),
  status: text("status").notNull().default("pending"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertHospitalityAlertSchema = createInsertSchema(hospitalityAlerts).omit({ id: true, createdAt: true, isAcknowledged: true, acknowledgedAt: true, acknowledgedBy: true, status: true });
export type InsertHospitalityAlert = z.infer<typeof insertHospitalityAlertSchema>;
export type HospitalityAlert = typeof hospitalityAlerts.$inferSelect;

// ==================== Cash Register Module ====================

export const cashRegisterConfigs = pgTable("cash_register_configs", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  area: text("area").notNull().unique(),
  areaLabel: text("area_label").notNull(),
  shiftsPerDay: integer("shifts_per_day").notNull().default(1),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const insertCashRegisterConfigSchema = createInsertSchema(cashRegisterConfigs).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertCashRegisterConfig = z.infer<typeof insertCashRegisterConfigSchema>;
export type CashRegisterConfig = typeof cashRegisterConfigs.$inferSelect;

export const cashShifts = pgTable("cash_shifts", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  area: text("area").notNull(),
  shiftNumber: integer("shift_number").notNull(),
  openedBy: text("opened_by"),
  closedBy: text("closed_by"),
  openedAt: timestamp("opened_at").notNull().defaultNow(),
  closedAt: timestamp("closed_at"),
  status: text("status").notNull().default("open"),
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow(),
  autoCreado: boolean("auto_creado").default(false),
  turnoAnteriorId: varchar("turno_anterior_id"),
});

export const insertCashShiftSchema = createInsertSchema(cashShifts).omit({ id: true, closedBy: true, closedAt: true, status: true, createdAt: true });
export type InsertCashShift = z.infer<typeof insertCashShiftSchema>;
export type CashShift = typeof cashShifts.$inferSelect;

export const cashMovements = pgTable("cash_movements", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  shiftId: varchar("shift_id"),
  area: text("area").notNull(),
  sourceType: text("source_type").notNull(),
  sourceId: varchar("source_id"),
  sourceLabel: text("source_label"),
  paymentMethod: text("payment_method").notNull(),
  amount: numeric("amount", { precision: 10, scale: 2 }).notNull(),
  movementType: text("movement_type").notNull().default("income"),
  receiptType: text("receipt_type"),
  registeredBy: text("registered_by"),
  createdAt: timestamp("created_at").defaultNow(),
  anulado: boolean("anulado").notNull().default(false),
  motivoAnulacion: text("motivo_anulacion"),
  anuladoPor: text("anulado_por"),
  anuladoAt: timestamp("anulado_at"),
});

export const insertCashMovementSchema = createInsertSchema(cashMovements).omit({ id: true, createdAt: true });
export type InsertCashMovement = z.infer<typeof insertCashMovementSchema>;
export type CashMovement = typeof cashMovements.$inferSelect;

export const cashClosingSummaries = pgTable("cash_closing_summaries", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  shiftId: varchar("shift_id").notNull(),
  area: text("area").notNull(),
  totalCash: numeric("total_cash", { precision: 10, scale: 2 }).default("0"),
  totalDebitCard: numeric("total_debit_card", { precision: 10, scale: 2 }).default("0"),
  totalCreditCard: numeric("total_credit_card", { precision: 10, scale: 2 }).default("0"),
  totalTransfer: numeric("total_transfer", { precision: 10, scale: 2 }).default("0"),
  totalMercadopago: numeric("total_mercadopago", { precision: 10, scale: 2 }).default("0"),
  totalCurrentAccount: numeric("total_current_account", { precision: 10, scale: 2 }).default("0"),
  totalRoomCharge: numeric("total_room_charge", { precision: 10, scale: 2 }).default("0"),
  totalGeneral: numeric("total_general", { precision: 10, scale: 2 }).default("0"),
  transactionCount: integer("transaction_count").default(0),
  closedAt: timestamp("closed_at").defaultNow(),
  closedBy: text("closed_by"),
  notes: text("notes"),
});

export const insertCashClosingSummarySchema = createInsertSchema(cashClosingSummaries).omit({ id: true, closedAt: true });
export type InsertCashClosingSummary = z.infer<typeof insertCashClosingSummarySchema>;
export type CashClosingSummary = typeof cashClosingSummaries.$inferSelect;

export type AccountMovementType = "cargo" | "pago" | "nota_credito" | "ajuste";
export type AccountEntityType = "company" | "agency" | "guest";

export const accountMovements = pgTable("account_movements", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  entityType: text("entity_type").$type<AccountEntityType>().notNull(),
  entityId: varchar("entity_id").notNull(),
  date: date("date").notNull(),
  type: text("type").$type<AccountMovementType>().notNull(),
  description: text("description").notNull(),
  amount: numeric("amount", { precision: 12, scale: 2 }).notNull(),
  reservationId: varchar("reservation_id"),
  reservationCode: text("reservation_code"),
  guestName: text("guest_name"),
  reference: text("reference"),
  createdBy: varchar("created_by"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertAccountMovementSchema = createInsertSchema(accountMovements).omit({ id: true, createdAt: true });
export type InsertAccountMovement = z.infer<typeof insertAccountMovementSchema>;
export type AccountMovement = typeof accountMovements.$inferSelect;

// ============================================================
// MÓDULO CONTABLE / ADMINISTRATIVO
// ============================================================

// Proveedores contables (separado de suppliers del inventario)
export const accountingSuppliers = pgTable("accounting_suppliers", {
  id: serial("id").primaryKey(),
  razonSocial: text("razon_social").notNull(),
  cuit: text("cuit").notNull().unique(),
  domicilio: text("domicilio"),
  localidad: text("localidad"),
  provincia: text("provincia").default("Entre Rios"),
  cp: text("cp"),
  condicionIva: text("condicion_iva").notNull(),
  alicuotaIibb: numeric("alicuota_iibb", { precision: 6, scale: 4 }).default("0"),
  alicuotaGanancias: numeric("alicuota_ganancias", { precision: 6, scale: 4 }).default("0"),
  alicuotaIva: numeric("alicuota_iva", { precision: 6, scale: 4 }).default("0"),
  cbu: text("cbu"),
  banco: text("banco"),
  activo: boolean("activo").default(true),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const insertAccountingSupplierSchema = createInsertSchema(accountingSuppliers).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertAccountingSupplier = z.infer<typeof insertAccountingSupplierSchema>;
export type AccountingSupplier = typeof accountingSuppliers.$inferSelect;

// Plan de Cuentas Contables
export const accountingAccounts = pgTable("accounting_accounts", {
  id: serial("id").primaryKey(),
  codigo: text("codigo").notNull().unique(),
  nombre: text("nombre").notNull(),
  tipo: text("tipo").notNull(),
  nivel: integer("nivel").default(1),
  activo: boolean("activo").default(true),
});

export const insertAccountingAccountSchema = createInsertSchema(accountingAccounts).omit({ id: true });
export type InsertAccountingAccount = z.infer<typeof insertAccountingAccountSchema>;
export type AccountingAccount = typeof accountingAccounts.$inferSelect;

// Comprobantes de Compra (Facturas, NC, Resúmenes, Liquidaciones)
export const purchaseInvoices = pgTable("purchase_invoices", {
  id: serial("id").primaryKey(),
  tipoComprobante: text("tipo_comprobante").notNull(),
  supplierId: integer("supplier_id").references(() => accountingSuppliers.id),
  proveedorNombre: text("proveedor_nombre"),
  proveedorCuit: text("proveedor_cuit"),
  puntoVenta: text("punto_venta"),
  numeroComprobante: text("numero_comprobante").notNull(),
  numeroComprobanteExt: text("numero_comprobante_ext"),
  fechaEmision: date("fecha_emision").notNull(),
  periodo: text("periodo"),
  condicionPago: text("condicion_pago").notNull().default("contado"),
  montoNeto: numeric("monto_neto", { precision: 14, scale: 2 }).notNull().default("0"),
  alicuotaIva: text("alicuota_iva").default("21"),
  montoIva27: numeric("monto_iva27", { precision: 14, scale: 2 }).default("0"),
  montoIva21: numeric("monto_iva21", { precision: 14, scale: 2 }).default("0"),
  montoIva105: numeric("monto_iva105", { precision: 14, scale: 2 }).default("0"),
  montoIva5: numeric("monto_iva5", { precision: 14, scale: 2 }).default("0"),
  montoIva25: numeric("monto_iva25", { precision: 14, scale: 2 }).default("0"),
  montoExento: numeric("monto_exento", { precision: 14, scale: 2 }).default("0"),
  montoNoGravado: numeric("monto_no_gravado", { precision: 14, scale: 2 }).default("0"),
  impuestosInternos: numeric("impuestos_internos", { precision: 14, scale: 2 }).default("0"),
  ley25413: numeric("ley_25413", { precision: 14, scale: 2 }).default("0"),
  percepcionIibb: numeric("percepcion_iibb", { precision: 14, scale: 2 }).default("0"),
  percepcionIva: numeric("percepcion_iva", { precision: 14, scale: 2 }).default("0"),
  percepcionGanancias: numeric("percepcion_ganancias", { precision: 14, scale: 2 }).default("0"),
  retencionIibb: numeric("retencion_iibb", { precision: 14, scale: 2 }).default("0"),
  retencionGanancias: numeric("retencion_ganancias", { precision: 14, scale: 2 }).default("0"),
  retencionIva: numeric("retencion_iva", { precision: 14, scale: 2 }).default("0"),
  retencionSuss: numeric("retencion_suss", { precision: 14, scale: 2 }).default("0"),
  retencionMunicipal: numeric("retencion_municipal", { precision: 14, scale: 2 }).default("0"),
  monotributoCompBC: numeric("monotributo_comp_bc", { precision: 14, scale: 2 }).default("0"),
  montoTotal: numeric("monto_total", { precision: 14, scale: 2 }).notNull().default("0"),
  cuentaContableId: integer("cuenta_contable_id").references(() => accountingAccounts.id),
  centroCosto: text("centro_costo"),
  estado: text("estado").notNull().default("pendiente"),
  asientoId: integer("asiento_id"),
  observaciones: text("observaciones"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const insertPurchaseInvoiceSchema = createInsertSchema(purchaseInvoices).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertPurchaseInvoice = z.infer<typeof insertPurchaseInvoiceSchema>;
export type PurchaseInvoice = typeof purchaseInvoices.$inferSelect;

// Órdenes de Pago
export const paymentOrders = pgTable("payment_orders", {
  id: serial("id").primaryKey(),
  numero: text("numero").notNull().unique(),
  supplierId: integer("supplier_id").notNull().references(() => accountingSuppliers.id),
  fecha: date("fecha").notNull(),
  formaPago: text("forma_pago").notNull().default("transferencia"),
  depBancario: numeric("dep_bancario", { precision: 14, scale: 2 }).default("0"),
  efectivo: numeric("efectivo", { precision: 14, scale: 2 }).default("0"),
  cheques: numeric("cheques", { precision: 14, scale: 2 }).default("0"),
  totalFacturas: numeric("total_facturas", { precision: 14, scale: 2 }).notNull(),
  retencionIibb: numeric("retencion_iibb", { precision: 14, scale: 2 }).default("0"),
  retencionGanancias: numeric("retencion_ganancias", { precision: 14, scale: 2 }).default("0"),
  retencionIva: numeric("retencion_iva", { precision: 14, scale: 2 }).default("0"),
  retencionProfLibs: numeric("retencion_prof_libs", { precision: 14, scale: 2 }).default("0"),
  compensacion: numeric("compensacion", { precision: 14, scale: 2 }).default("0"),
  totalAbonado: numeric("total_abonado", { precision: 14, scale: 2 }).notNull(),
  asientoId: integer("asiento_id"),
  observaciones: text("observaciones"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertPaymentOrderSchema = createInsertSchema(paymentOrders).omit({ id: true, createdAt: true });
export type InsertPaymentOrder = z.infer<typeof insertPaymentOrderSchema>;
export type PaymentOrder = typeof paymentOrders.$inferSelect;

// Ítems de Orden de Pago (facturas que cancela cada OP)
export const paymentOrderItems = pgTable("payment_order_items", {
  id: serial("id").primaryKey(),
  paymentOrderId: integer("payment_order_id").notNull().references(() => paymentOrders.id),
  invoiceId: integer("invoice_id").notNull().references(() => purchaseInvoices.id),
  importeCancelado: numeric("importe_cancelado", { precision: 14, scale: 2 }).notNull(),
});

export const insertPaymentOrderItemSchema = createInsertSchema(paymentOrderItems).omit({ id: true });
export type InsertPaymentOrderItem = z.infer<typeof insertPaymentOrderItemSchema>;
export type PaymentOrderItem = typeof paymentOrderItems.$inferSelect;

// Asientos Contables (Mayor de Cuentas)
export const accountingEntries = pgTable("accounting_entries", {
  id: serial("id").primaryKey(),
  numeroMinuta: integer("numero_minuta").notNull(),
  fecha: date("fecha").notNull(),
  periodo: text("periodo").notNull(),
  concepto: text("concepto").notNull(),
  tipoOrigen: text("tipo_origen").notNull(),
  origenId: integer("origen_id"),
  origenTipo: text("origen_tipo"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertAccountingEntrySchema = createInsertSchema(accountingEntries).omit({ id: true, createdAt: true });
export type InsertAccountingEntry = z.infer<typeof insertAccountingEntrySchema>;
export type AccountingEntry = typeof accountingEntries.$inferSelect;

// Líneas de Asiento
export const accountingEntryLines = pgTable("accounting_entry_lines", {
  id: serial("id").primaryKey(),
  entryId: integer("entry_id").notNull().references(() => accountingEntries.id),
  accountId: integer("account_id").notNull().references(() => accountingAccounts.id),
  comprobanteTipo: text("comprobante_tipo"),
  comprobanteNumero: text("comprobante_numero"),
  proveedorNombre: text("proveedor_nombre"),
  debe: numeric("debe", { precision: 14, scale: 2 }).default("0"),
  haber: numeric("haber", { precision: 14, scale: 2 }).default("0"),
});

export const insertAccountingEntryLineSchema = createInsertSchema(accountingEntryLines).omit({ id: true });
export type InsertAccountingEntryLine = z.infer<typeof insertAccountingEntryLineSchema>;
export type AccountingEntryLine = typeof accountingEntryLines.$inferSelect;

// Constancias de Retención IIBB (SIRCAR)
export const iibbRetentions = pgTable("iibb_retentions", {
  id: serial("id").primaryKey(),
  nroConstancia: integer("nro_constancia").notNull(),
  supplierId: integer("supplier_id").references(() => accountingSuppliers.id),
  cuitProveedor: text("cuit_proveedor").notNull(),
  fechaRetencion: date("fecha_retencion").notNull(),
  fechaComprobante: date("fecha_comprobante").notNull(),
  nroComprobante: integer("nro_comprobante").notNull(),
  letraFactura: text("letra_factura"),
  importeBase: numeric("importe_base", { precision: 14, scale: 2 }).notNull(),
  alicuota: numeric("alicuota", { precision: 6, scale: 4 }).notNull(),
  importeRetenido: numeric("importe_retenido", { precision: 14, scale: 2 }).notNull(),
  anulacion: boolean("anulacion").default(false),
  convMultilateral: boolean("conv_multilateral").default(false),
  invoiceId: integer("invoice_id").references(() => purchaseInvoices.id),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertIibbRetentionSchema = createInsertSchema(iibbRetentions).omit({ id: true, createdAt: true });
export type InsertIibbRetention = z.infer<typeof insertIibbRetentionSchema>;
export type IibbRetention = typeof iibbRetentions.$inferSelect;

// ─── Caja de Administración ──────────────────────────────────────────────────

export const adminCashMovements = pgTable("admin_cash_movements", {
  id: serial("id").primaryKey(),
  fecha: date("fecha").notNull(),
  hora: text("hora"),
  tipo: text("tipo").notNull(),
  concepto: text("concepto").notNull(),
  importe: numeric("importe", { precision: 14, scale: 2 }).notNull(),
  signo: text("signo").notNull(),
  cuentaContableId: integer("cuenta_contable_id").references(() => accountingAccounts.id),
  centroCosto: text("centro_costo"),
  paymentOrderId: integer("payment_order_id").references(() => paymentOrders.id),
  areaOrigen: text("area_origen"),
  cierreOrigenId: integer("cierre_origen_id"),
  anulado: boolean("anulado").default(false),
  motivoAnulacion: text("motivo_anulacion"),
  operador: text("operador"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertAdminCashMovementSchema = createInsertSchema(adminCashMovements).omit({ id: true, createdAt: true });
export type InsertAdminCashMovement = z.infer<typeof insertAdminCashMovementSchema>;
export type AdminCashMovement = typeof adminCashMovements.$inferSelect;

export const adminCashArqueos = pgTable("admin_cash_arqueos", {
  id: serial("id").primaryKey(),
  fecha: date("fecha").notNull().unique(),
  saldoSistema: numeric("saldo_sistema", { precision: 14, scale: 2 }).notNull(),
  saldoFisico: numeric("saldo_fisico", { precision: 14, scale: 2 }).notNull(),
  diferencia: numeric("diferencia", { precision: 14, scale: 2 }).notNull(),
  observaciones: text("observaciones"),
  operador: text("operador"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertAdminCashArqueoSchema = createInsertSchema(adminCashArqueos).omit({ id: true, createdAt: true });
export type InsertAdminCashArqueo = z.infer<typeof insertAdminCashArqueoSchema>;
export type AdminCashArqueo = typeof adminCashArqueos.$inferSelect;

export const adminCashConfig = pgTable("admin_cash_config", {
  id: serial("id").primaryKey(),
  fondoFijo: numeric("fondo_fijo", { precision: 14, scale: 2 }).default("0"),
  alertaBajo: numeric("alerta_bajo", { precision: 14, scale: 2 }).default("0"),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// ─── Facturación Electrónica ──────────────────────────────────────────────────

export const billingConfig = pgTable("billing_config", {
  id: serial("id").primaryKey(),
  modoArca: boolean("modo_arca").default(false),
  cuit: text("cuit").default("33-68110008-9"),
  razonSocial: text("razon_social").default("MARAN S.A."),
  domicilioComercial: text("domicilio_comercial").default("Alameda de la Federación 698"),
  localidad: text("localidad").default("Paraná"),
  provincia: text("provincia").default("Entre Ríos"),
  cp: text("cp").default("3100"),
  condicionIva: text("condicion_iva").default("Responsable Inscripto"),
  inicioActividades: text("inicio_actividades").default("01/01/2000"),
  puntoVenta: integer("punto_venta").default(1),
  tipoPuntoVenta: text("tipo_punto_venta").default("online"),
  arcaCert: text("arca_cert"),
  arcaKey: text("arca_key"),
  arcaCuit: text("arca_cuit"),
  logoUrl: text("logo_url"),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const salesInvoices = pgTable("sales_invoices", {
  id: serial("id").primaryKey(),
  tipoComprobante: text("tipo_comprobante").notNull(),
  puntoVenta: integer("punto_venta").notNull(),
  numero: integer("numero").notNull(),
  fechaEmision: date("fecha_emision").notNull(),
  fechaVtoPago: date("fecha_vto_pago"),
  clienteRazonSocial: text("cliente_razon_social").notNull(),
  clienteCuit: text("cliente_cuit"),
  clienteDni: text("cliente_dni"),
  clienteCondicionIva: text("cliente_condicion_iva").notNull(),
  clienteDomicilio: text("cliente_domicilio"),
  montoNeto: numeric("monto_neto", { precision: 14, scale: 2 }).notNull(),
  montoIva21: numeric("monto_iva21", { precision: 14, scale: 2 }).default("0"),
  montoIva105: numeric("monto_iva105", { precision: 14, scale: 2 }).default("0"),
  montoExento: numeric("monto_exento", { precision: 14, scale: 2 }).default("0"),
  montoNoGravado: numeric("monto_no_gravado", { precision: 14, scale: 2 }).default("0"),
  montoTotal: numeric("monto_total", { precision: 14, scale: 2 }).notNull(),
  cae: text("cae"),
  caeFechaVto: date("cae_fecha_vto"),
  modoFicticio: boolean("modo_ficticio").default(true),
  estado: text("estado").default("emitida"),
  reservaId: integer("reserva_id"),
  folioId: integer("folio_id"),
  notaCreditoId: integer("nota_credito_id"),
  concepto: text("concepto").default("2"),
  items: jsonb("items"),
  operador: text("operador"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertSalesInvoiceSchema = createInsertSchema(salesInvoices).omit({ id: true, createdAt: true });
export type InsertSalesInvoice = z.infer<typeof insertSalesInvoiceSchema>;
export type SalesInvoice = typeof salesInvoices.$inferSelect;

export const invoiceCounters = pgTable("invoice_counters", {
  id: serial("id").primaryKey(),
  tipoComprobante: text("tipo_comprobante").notNull(),
  puntoVenta: integer("punto_venta").notNull(),
  ultimoNumero: integer("ultimo_numero").default(0),
});

export const reservationChangelog = pgTable("reservation_changelog", {
  id: serial("id").primaryKey(),
  reservationId: varchar("reservation_id").notNull().references(() => reservations.id),
  fecha: timestamp("fecha").defaultNow().notNull(),
  operador: text("operador"),
  tipo: text("tipo").notNull(),
  descripcion: text("descripcion").notNull(),
});

export const insertReservationChangelogSchema = createInsertSchema(reservationChangelog).omit({ id: true, fecha: true });
export type InsertReservationChangelog = z.infer<typeof insertReservationChangelogSchema>;
export type ReservationChangelog = typeof reservationChangelog.$inferSelect;

export type LostFoundStatus = "en_custodia" | "contactado" | "entregado" | "descartado";
export type LostFoundCategory = "ropa" | "electronica" | "documento" | "accesorio" | "otro";

export const lostFoundItems = pgTable("lost_found_items", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  codigo: text("codigo").notNull().unique(),
  description: text("description").notNull(),
  category: text("category").$type<LostFoundCategory>().notNull().default("otro"),
  location: text("location").notNull(),
  foundDate: date("found_date").notNull(),
  foundBy: text("found_by").notNull(),
  storageLocation: text("storage_location"),
  status: text("status").$type<LostFoundStatus>().notNull().default("en_custodia"),
  guestId: varchar("guest_id"),
  reservationId: varchar("reservation_id"),
  notes: text("notes"),
  claimedBy: text("claimed_by"),
  claimedDate: date("claimed_date"),
  deliveryType: text("delivery_type"),
  deliveredBy: text("delivered_by"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const insertLostFoundSchema = createInsertSchema(lostFoundItems).omit({
  id: true, createdAt: true, updatedAt: true,
});
export type InsertLostFound = z.infer<typeof insertLostFoundSchema>;
export type LostFoundItem = typeof lostFoundItems.$inferSelect;

// ==================== SYSTEM INCIDENTS ====================
export type IncidentSeverity = "baja" | "media" | "alta" | "critica";
export type IncidentStatus = "pendiente" | "en_revision" | "resuelto" | "descartado";
export type IncidentModule =
  | "planning" | "reservas" | "check-in" | "check-out"
  | "grupos" | "restaurant" | "spa" | "eventos"
  | "housekeeping" | "hospitalidad" | "inventario"
  | "cajas" | "reportes" | "administracion" | "otro";

export const systemIncidents = pgTable("system_incidents", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  title: text("title").notNull(),
  description: text("description").notNull(),
  module: text("module").$type<IncidentModule>().notNull().default("otro"),
  severity: text("severity").$type<IncidentSeverity>().notNull().default("media"),
  status: text("status").$type<IncidentStatus>().notNull().default("pendiente"),
  reportedBy: text("reported_by").notNull(),
  reportedAt: timestamp("reported_at").notNull().defaultNow(),
  assignedTo: text("assigned_to"),
  resolvedBy: text("resolved_by"),
  resolvedAt: timestamp("resolved_at"),
  resolutionNotes: text("resolution_notes"),
  screenshotUrl: text("screenshot_url"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const insertSystemIncidentSchema = createInsertSchema(systemIncidents).omit({
  id: true, createdAt: true, updatedAt: true, resolvedAt: true,
});
export type InsertSystemIncident = z.infer<typeof insertSystemIncidentSchema>;
export type SystemIncident = typeof systemIncidents.$inferSelect;

// ==================== MOTOR FINANCIERO — FOLIOS ====================
export type FolioEntityType =
  | "reservation" | "restaurant_order" | "spa_account"
  | "group" | "event" | "company" | "agency";

export type FolioStatus = "open" | "closed" | "invoiced";

export type FolioMovementType =
  | "charge" | "payment" | "advance" | "discount"
  | "adjustment" | "transfer_in" | "transfer_out" | "void";

export const folios = pgTable("folios", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  codigo: text("codigo").notNull().unique(),
  entityType: text("entity_type").$type<FolioEntityType>().notNull(),
  entityId: varchar("entity_id").notNull(),
  status: text("status").$type<FolioStatus>().notNull().default("open"),
  totalCharges: decimal("total_charges", { precision: 12, scale: 2 }).default("0"),
  totalPayments: decimal("total_payments", { precision: 12, scale: 2 }).default("0"),
  balance: decimal("balance", { precision: 12, scale: 2 }).default("0"),
  openedAt: timestamp("opened_at").defaultNow(),
  closedAt: timestamp("closed_at"),
  closedBy: text("closed_by"),
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertFolioSchema = createInsertSchema(folios).omit({ id: true, createdAt: true });
export type InsertFolio = z.infer<typeof insertFolioSchema>;
export type Folio = typeof folios.$inferSelect;

export const folioMovements = pgTable("folio_movements", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  folioId: varchar("folio_id").notNull().references(() => folios.id),
  type: text("type").$type<FolioMovementType>().notNull(),
  amount: decimal("amount", { precision: 12, scale: 2 }).notNull(),
  description: text("description").notNull(),
  sourceType: text("source_type"),
  sourceId: varchar("source_id"),
  paymentMethod: text("payment_method"),
  cashMovementId: varchar("cash_movement_id"),
  relatedFolioId: varchar("related_folio_id"),
  voidedMovementId: varchar("voided_movement_id"),
  voidReason: text("void_reason"),
  registeredBy: text("registered_by"),
  receiptType: text("receipt_type"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertFolioMovementSchema = createInsertSchema(folioMovements).omit({ id: true, createdAt: true });
export type InsertFolioMovement = z.infer<typeof insertFolioMovementSchema>;
export type FolioMovement = typeof folioMovements.$inferSelect;

export type FolioWithMovements = Folio & { movements: FolioMovement[] };

// ==================== NIGHT AUDIT ====================
export type NightAuditStatus = "success" | "partial" | "failed";

export const planningDayNotes = pgTable("planning_day_notes", {
  date: text("date").primaryKey(),
  note: text("note").notNull().default(""),
  updatedAt: timestamp("updated_at").defaultNow(),
});
export type PlanningDayNote = typeof planningDayNotes.$inferSelect;

export const nightAuditLogs = pgTable("night_audit_logs", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  auditDate: date("audit_date").notNull(),
  executedAt: timestamp("executed_at").notNull().defaultNow(),
  executedBy: text("executed_by").notNull().default("sistema"),
  isManual: boolean("is_manual").notNull().default(false),
  reservationsProcessed: integer("reservations_processed").notNull().default(0),
  reservationsSkipped: integer("reservations_skipped").notNull().default(0),
  totalPosted: decimal("total_posted", { precision: 12, scale: 2 }).notNull().default("0"),
  arrivalsNextDay: integer("arrivals_next_day").notNull().default(0),
  arrivalsWithPrepago: integer("arrivals_with_prepago").notNull().default(0),
  arrivalsWithoutPrepago: integer("arrivals_without_prepago").notNull().default(0),
  status: text("status").$type<NightAuditStatus>().notNull().default("success"),
  notes: text("notes"),
  detail: text("detail"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertNightAuditLogSchema = createInsertSchema(nightAuditLogs).omit({
  id: true,
  createdAt: true,
});
export type InsertNightAuditLog = z.infer<typeof insertNightAuditLogSchema>;
export type NightAuditLog = typeof nightAuditLogs.$inferSelect;

// ─────────────────────────────────────────────────────────────────────────────
// Email / Respuestas Automáticas
// ─────────────────────────────────────────────────────────────────────────────

// Single-row config table (id = 1 always)
export const emailConfig = pgTable("email_config", {
  id: serial("id").primaryKey(),
  globalEnabled: boolean("global_enabled").notNull().default(false),
  provider: text("provider").notNull().default("resend"), // "resend" | "smtp"
  apiKey: text("api_key"),
  fromEmail: text("from_email").notNull().default("reservas@maransuites.com"),
  fromName: text("from_name").notNull().default("Maran Suites & Towers"),
  googleMapsUrl: text("google_maps_url"),
  // SMTP / Gmail settings
  smtpHost: text("smtp_host").default("smtp.gmail.com"),
  smtpPort: integer("smtp_port").default(587),
  smtpUser: text("smtp_user"),
  smtpPass: text("smtp_pass"),
  smtpSecure: boolean("smtp_secure").default(false),
  // Confirmation email
  confirmationEnabled: boolean("confirmation_enabled").notNull().default(true),
  confirmationSubject: text("confirmation_subject").notNull().default("Confirmación de tu reserva — Maran Suites & Towers"),
  confirmationBody: text("confirmation_body").notNull().default("Hola {nombre_huesped},\n\nTu reserva ha sido confirmada. Te esperamos el {fecha_checkin} en la habitación {numero_habitacion}.\n\nCheck-in: {fecha_checkin}\nCheck-out: {fecha_checkout}\nHabitaciones: {numero_habitacion}\n\n¡Nos vemos pronto!\nMaran Suites & Towers"),
  // 2-day reminder email
  reminderEnabled: boolean("reminder_enabled").notNull().default(true),
  reminderSubject: text("reminder_subject").notNull().default("Tu estadía se acerca — Maran Suites & Towers"),
  reminderBody: text("reminder_body").notNull().default("Hola {nombre_huesped},\n\nTe recordamos que en 2 días comenzás tu estadía en Maran Suites & Towers.\n\nCheck-in: {fecha_checkin}\nCheck-out: {fecha_checkout}\nHabitación: {numero_habitacion}\n\n¡Te esperamos!\nMaran Suites & Towers"),
  // Post-checkout + survey email
  checkoutEnabled: boolean("checkout_enabled").notNull().default(true),
  checkoutSubject: text("checkout_subject").notNull().default("Gracias por tu estadía — Contanos tu experiencia"),
  checkoutBody: text("checkout_body").notNull().default("Hola {nombre_huesped},\n\nGracias por elegir Maran Suites & Towers. Esperamos que hayas disfrutado tu estadía.\n\nNos encantaría conocer tu experiencia. Completá nuestra encuesta rápida (menos de 2 minutos):\n\n{link_encuesta}\n\nSi tu estadía fue excelente, también podés dejarnos una reseña en Google Maps:\n{link_google_maps}\n\n¡Hasta la próxima!\nMaran Suites & Towers"),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export type EmailConfig = typeof emailConfig.$inferSelect;

// Email send log
export const emailLogs = pgTable("email_logs", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  reservationId: varchar("reservation_id"),
  type: text("type").notNull(), // "confirmation" | "reminder" | "checkout"
  status: text("status").notNull(), // "sent" | "failed" | "skipped"
  recipientEmail: text("recipient_email"),
  errorMessage: text("error_message"),
  sentAt: timestamp("sent_at").defaultNow(),
});

export type EmailLog = typeof emailLogs.$inferSelect;

// Survey tokens (one per checkout)
export const surveyTokens = pgTable("survey_tokens", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  reservationId: varchar("reservation_id").notNull(),
  token: varchar("token").notNull().unique(),
  completed: boolean("completed").notNull().default(false),
  expiresAt: timestamp("expires_at"),
  createdAt: timestamp("created_at").defaultNow(),
});

export type SurveyToken = typeof surveyTokens.$inferSelect;

// Survey responses
export const surveyResponses = pgTable("survey_responses", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  surveyTokenId: varchar("survey_token_id").notNull().references(() => surveyTokens.id),
  ratingOverall: integer("rating_overall").notNull(),    // 1-5
  ratingRoom: integer("rating_room").notNull(),
  ratingCleanliness: integer("rating_cleanliness").notNull(),
  ratingService: integer("rating_service").notNull(),
  ratingFood: integer("rating_food"),                    // optional
  comment: text("comment"),
  guestName: text("guest_name"),
  submittedAt: timestamp("submitted_at").defaultNow(),
});

export type SurveyResponse = typeof surveyResponses.$inferSelect;
