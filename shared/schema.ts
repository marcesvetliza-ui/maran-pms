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
  createdAt: text("created_at"),
});

export const insertCompanySchema = createInsertSchema(companies).omit({ id: true });
export type InsertCompany = z.infer<typeof insertCompanySchema>;
export type Company = typeof companies.$inferSelect;

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
  fechaNacimiento: text("fecha_nacimiento"),
  sexo: text("sexo").$type<GuestSex>().default("no_especifica"),
  segment: text("segment").$type<GuestSegment>().default("LEISURE"),
  cuilCuit: text("cuil_cuit"),
  companyId: varchar("company_id"),
  fechaAlta: text("fecha_alta"),
  vehiculoPatente: text("vehiculo_patente"),
  vehiculoMarca: text("vehiculo_marca"),
  vehiculoModelo: text("vehiculo_modelo"),
  vehiculoColor: text("vehiculo_color"),
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

// Payment methods
export type PaymentMethod = "efectivo" | "tarjeta_debito" | "tarjeta_credito" | "transferencia" | "mercadopago" | "cuenta_corriente";

// Payments table (pagos adelantados y durante estadía)
export const payments = pgTable("payments", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  reservationId: varchar("reservation_id").notNull(),
  amount: decimal("amount", { precision: 10, scale: 2 }).notNull(),
  method: text("method").$type<PaymentMethod>().notNull(),
  date: text("date").notNull(),
  reference: text("reference"),
  receivedBy: varchar("received_by"),
  notes: text("notes"),
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
  checkInDate: text("check_in_date").notNull(),
  checkOutDate: text("check_out_date").notNull(),
  cancellationDate: text("cancellation_date").notNull(),
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
  scheduledDate: text("scheduled_date").notNull(),
  startedAt: text("started_at"),
  completedAt: text("completed_at"),
  inspectedBy: varchar("inspected_by"),
  inspectedAt: text("inspected_at"),
  createdAt: text("created_at").notNull(),
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
  room: Room & { roomType?: RoomType };
  ratePlan?: RatePlan;
  charges?: Charge[];
  payments?: Payment[];
};

export type RoomWithType = Room & {
  roomType: RoomType;
};

// Planning types
export type PlanningCellStatus = "available" | "booked" | "checked_in" | "checkout_today" | "maintenance" | "cleaning" | "group_blocked";

export type PlanningData = {
  rooms: RoomWithType[];
  days: string[];
  occupancy: Record<string, PlanningCellStatus[]>;
  reservations: Record<string, { id: string; guestName: string; checkIn: string; checkOut: string; status: ReservationStatus; source: ReservationSource; isGroup?: boolean; groupName?: string }>;
  cellReservations: Record<string, Record<string, string>>; // roomId -> date -> reservationId
  groupBlocks: Record<string, { id: string; groupName: string; groupCode: string; checkIn: string; checkOut: string }>;
  cellGroupBlocks: Record<string, Record<string, string>>; // roomId -> date -> groupBlockId
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

// Groups (Grupos de reservas)
export type GroupStatus = "tentative" | "blocked" | "confirmed" | "inhouse" | "finished" | "cancelled";

export const groups = pgTable("groups", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  groupCode: text("group_code").notNull().unique(),
  name: text("name").notNull(),
  contactName: text("contact_name"),
  contactPhone: text("contact_phone"),
  contactEmail: text("contact_email"),
  eventDate: text("event_date"),
  checkInDate: text("check_in_date").notNull(),
  checkOutDate: text("check_out_date").notNull(),
  status: text("status").$type<GroupStatus>().notNull().default("tentative"),
  releaseDate: text("release_date"),
  notes: text("notes"),
  createdAt: text("created_at").notNull(),
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
  blockCheckInDate: text("block_check_in_date"),
  blockCheckOutDate: text("block_check_out_date"),
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

// Guest Reviews with Sentiment Analysis
export type SentimentType = "positive" | "neutral" | "negative";
export type ReviewCategory = "service" | "cleanliness" | "location" | "amenities" | "value" | "food" | "staff" | "general";

export const guestReviews = pgTable("guest_reviews", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  reservationId: varchar("reservation_id"),
  guestId: varchar("guest_id").notNull(),
  roomId: varchar("room_id"),
  reviewDate: text("review_date").notNull(),
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
  analyzedAt: text("analyzed_at"),
  isPublished: text("is_published").default("false"),
  staffResponse: text("staff_response"),
  respondedAt: text("responded_at"),
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
export type EventType = "corporate" | "social" | "wedding" | "conference" | "seminar" | "cocktail" | "meeting" | "other";

// Event Status
export type EventStatus = "tentative" | "confirmed" | "in_progress" | "completed" | "cancelled";

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
  startDate: text("start_date").notNull(),
  endDate: text("end_date").notNull(),
  startTime: text("start_time"),
  endTime: text("end_time"),
  attendees: integer("attendees").default(10),
  status: text("status").$type<EventStatus>().notNull().default("tentative"),
  notes: text("notes"),
  createdAt: text("created_at").notNull(),
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
  date: text("date").notNull(),
  notes: text("notes"),
  createdAt: text("created_at").notNull(),
});

export const insertEventChargeSchema = createInsertSchema(eventCharges).omit({ id: true });
export type InsertEventCharge = z.infer<typeof insertEventChargeSchema>;
export type EventCharge = typeof eventCharges.$inferSelect;

// Extended Event types
export type EventWithDetails = Event & {
  eventRoom: EventRoom;
  company?: Company;
  charges?: EventChargeWithType[];
};

export type EventChargeWithType = EventCharge & {
  chargeType?: EventChargeType;
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
  createdAt: text("created_at"),
});

export const messages = pgTable("messages", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  conversationId: varchar("conversation_id").notNull(),
  role: text("role").notNull(),
  content: text("content").notNull(),
  createdAt: text("created_at"),
});

// ==================== RESTAURANT MODULE ====================

// Restaurant Areas (Salones)
export type RestaurantAreaType = "indoor" | "outdoor" | "terrace" | "bar" | "private";

export const restaurantAreas = pgTable("restaurant_areas", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull(),
  areaType: text("area_type").$type<RestaurantAreaType>().notNull().default("indoor"),
  capacity: integer("capacity").notNull().default(20),
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
  reservationDate: text("reservation_date").notNull(),
  reservationTime: text("reservation_time").notNull(),
  status: text("status").$type<TableReservationStatus>().notNull().default("pending"),
  notes: text("notes"),
  createdAt: text("created_at").notNull(),
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

export const restaurantOrders = pgTable("restaurant_orders", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  orderNumber: text("order_number").notNull(),
  tableId: varchar("table_id"),
  reservationId: varchar("reservation_id"),
  guestId: varchar("guest_id"),
  orderType: text("order_type").$type<OrderType>().notNull().default("dine_in"),
  status: text("status").$type<OrderStatus>().notNull().default("open"),
  covers: integer("covers").default(1),
  subtotal: decimal("subtotal", { precision: 10, scale: 2 }).default("0"),
  tax: decimal("tax", { precision: 10, scale: 2 }).default("0"),
  total: decimal("total", { precision: 10, scale: 2 }).default("0"),
  notes: text("notes"),
  openedAt: text("opened_at").notNull(),
  closedAt: text("closed_at"),
  chargedToRoom: text("charged_to_room").default("false"),
  roomNumber: text("room_number"),
});

export const insertRestaurantOrderSchema = createInsertSchema(restaurantOrders).omit({ id: true });
export type InsertRestaurantOrder = z.infer<typeof insertRestaurantOrderSchema>;
export type RestaurantOrder = typeof restaurantOrders.$inferSelect;

// Order Items
export type OrderItemStatus = "pending" | "preparing" | "ready" | "served" | "cancelled";

export const orderItems = pgTable("order_items", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  orderId: varchar("order_id").notNull(),
  menuItemId: varchar("menu_item_id").notNull(),
  quantity: integer("quantity").notNull().default(1),
  unitPrice: decimal("unit_price", { precision: 10, scale: 2 }).notNull(),
  subtotal: decimal("subtotal", { precision: 10, scale: 2 }).notNull(),
  status: text("status").$type<OrderItemStatus>().notNull().default("pending"),
  notes: text("notes"),
  sentAt: text("sent_at"),
});

export const insertOrderItemSchema = createInsertSchema(orderItems).omit({ id: true });
export type InsertOrderItem = z.infer<typeof insertOrderItemSchema>;
export type OrderItem = typeof orderItems.$inferSelect;

export type OrderItemWithMenuItem = OrderItem & {
  menuItem: MenuItem;
};

export type RestaurantOrderWithDetails = RestaurantOrder & {
  table?: RestaurantTableWithArea;
  guest?: Guest;
  items: OrderItemWithMenuItem[];
};

// ==================== INVENTORY MODULE ====================

// Item Categories (for inventory)
export const itemCategories = pgTable("item_categories", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull(),
  description: text("description"),
  parentId: varchar("parent_id"),
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
  minStock: integer("min_stock").default(0),
  maxStock: integer("max_stock"),
  currentStock: integer("current_stock").default(0),
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
  quantity: integer("quantity").notNull(),
  previousStock: integer("previous_stock").notNull(),
  newStock: integer("new_stock").notNull(),
  unitCost: decimal("unit_cost", { precision: 10, scale: 2 }),
  reference: text("reference"),
  notes: text("notes"),
  createdAt: text("created_at").notNull(),
  createdBy: text("created_by"),
});

export const insertStockMovementSchema = createInsertSchema(stockMovements).omit({ id: true });
export type InsertStockMovement = z.infer<typeof insertStockMovementSchema>;
export type StockMovement = typeof stockMovements.$inferSelect;

export type StockMovementWithItem = StockMovement & {
  item: InventoryItem;
};

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
  createdAt: text("created_at").notNull(),
  expectedDate: text("expected_date"),
  receivedAt: text("received_at"),
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

// SPA Appointments (Turnos)
export type SpaAppointmentStatus = "pending" | "confirmed" | "in_progress" | "completed" | "cancelled" | "no_show";

export const spaAppointments = pgTable("spa_appointments", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  cabinId: varchar("cabin_id").notNull(),
  treatmentId: varchar("treatment_id").notNull(),
  guestName: text("guest_name").notNull(),
  guestLastName: text("guest_last_name"),
  guestPhone: text("guest_phone"),
  guestEmail: text("guest_email"),
  reservationId: varchar("reservation_id"),
  appointmentDate: text("appointment_date").notNull(),
  startTime: text("start_time").notNull(),
  endTime: text("end_time").notNull(),
  status: text("status").$type<SpaAppointmentStatus>().notNull().default("pending"),
  notes: text("notes"),
  createdAt: text("created_at").notNull(),
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
  notes: text("notes"),
  openedAt: text("opened_at").notNull(),
  closedAt: text("closed_at"),
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
  createdAt: text("created_at").notNull(),
});

export const insertSpaAccountItemSchema = createInsertSchema(spaAccountItems).omit({ id: true });
export type InsertSpaAccountItem = z.infer<typeof insertSpaAccountItemSchema>;
export type SpaAccountItem = typeof spaAccountItems.$inferSelect;

export type SpaAccountWithItems = SpaAccount & {
  items: SpaAccountItem[];
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
  reportedAt: text("reported_at").notNull(),
  scheduledDate: text("scheduled_date"),
  completedAt: text("completed_at"),
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
};

// ============== ADMINISTRATION MODULE ==============

// System User Roles (extends existing UserRole with admin roles)
export type SystemUserRole = "admin" | "manager" | "reception" | "housekeeping" | "maintenance" | "restaurant" | "spa" | "events";

// System Users (Usuarios del Sistema)
export const systemUsers = pgTable("system_users", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  username: text("username").notNull().unique(),
  email: text("email").notNull(),
  fullName: text("full_name").notNull(),
  role: text("role").$type<SystemUserRole>().notNull().default("reception"),
  department: text("department"),
  phone: text("phone"),
  isActive: text("is_active").default("true"),
  lastLogin: text("last_login"),
  createdAt: text("created_at").notNull(),
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
  updatedAt: text("updated_at").notNull(),
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
  timestamp: text("timestamp").notNull(),
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
  validFrom: text("valid_from"),
  validUntil: text("valid_until"),
  status: text("status").$type<PackageStatus>().notNull().default("active"),
  includedServices: text("included_services").array(),
  terms: text("terms"),
  createdAt: text("created_at").notNull(),
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

// Package with details
export type PackageWithDetails = Package & {
  roomType?: RoomType;
  items: PackageItem[];
};
