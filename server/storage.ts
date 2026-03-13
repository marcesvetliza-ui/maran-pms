import {
  type User,
  type InsertUser,
  type Room,
  type InsertRoom,
  type RoomType,
  type InsertRoomType,
  type RatePlan,
  type InsertRatePlan,
  type RatePlanWithRoomType,
  type Company,
  type InsertCompany,
  type Agency,
  type InsertAgency,
  type Guest,
  type InsertGuest,
  type BedType,
  type InsertBedType,
  type Reservation,
  type InsertReservation,
  type Charge,
  type InsertCharge,
  type Payment,
  type InsertPayment,
  type CancelledReservationLog,
  type InsertCancelledReservationLog,
  type OTAChannel,
  type InsertOTAChannel,
  type OTAChannelWithStats,
  type OTAReservationLog,
  type InsertOTAReservationLog,
  type OTAReservationLogWithChannel,
  type RoomWithType,
  type ReservationWithDetails,
  type RoomStatus,
  type ReservationStatus,
  type ReservationSource,
  type PlanningData,
  type PlanningCellStatus,
  type Group,
  type InsertGroup,
  type GroupRoomBlock,
  type InsertGroupRoomBlock,
  type GroupReservationLink,
  type InsertGroupReservationLink,
  type GroupWithDetails,
  type GroupRoomBlockWithDetails,
  type GroupCharge,
  type InsertGroupCharge,
  type GroupPayment,
  type InsertGroupPayment,
  type GroupFolioData,
  type GuestReview,
  type InsertGuestReview,
  type GuestReviewWithDetails,
  type SentimentType,
  type HousekeepingTask,
  type InsertHousekeepingTask,
  type HousekeepingTaskWithRoom,
  // Restaurant
  type RestaurantArea,
  type InsertRestaurantArea,
  type RestaurantTable,
  type InsertRestaurantTable,
  type RestaurantTableWithArea,
  type MenuCategory,
  type InsertMenuCategory,
  type MenuItem,
  type InsertMenuItem,
  type MenuItemWithCategory,
  type RestaurantOrder,
  type InsertRestaurantOrder,
  type OrderItem,
  type InsertOrderItem,
  type RestaurantOrderWithDetails,
  type TableStatus,
  type OrderStatus,
  type TableReservation,
  type InsertTableReservation,
  type TableReservationWithTable,
  type RestaurantTimeSlot,
  type InsertRestaurantTimeSlot,
  type OrderSplit,
  type InsertOrderSplit,
  type Recipe,
  type InsertRecipe,
  type RecipeIngredient,
  type InsertRecipeIngredient,
  type RecipeWithIngredients,
  // Inventory
  type ItemCategory,
  type InsertItemCategory,
  type Supplier,
  type InsertSupplier,
  type InventoryItem,
  type InsertInventoryItem,
  type InventoryItemWithDetails,
  type StockMovement,
  type InsertStockMovement,
  type StockMovementWithItem,
  type PurchaseOrder,
  type InsertPurchaseOrder,
  type PurchaseOrderItem,
  type InsertPurchaseOrderItem,
  type PurchaseOrderWithDetails,
  // SPA
  type SpaCabin,
  type InsertSpaCabin,
  type SpaTreatmentCategory,
  type InsertSpaTreatmentCategory,
  type SpaTreatment,
  type InsertSpaTreatment,
  type SpaAppointment,
  type InsertSpaAppointment,
  type SpaAppointmentWithDetails,
  type SpaAppointmentStatus,
  type SpaAccount,
  type InsertSpaAccount,
  type SpaAccountStatus,
  type SpaAccountItem,
  type InsertSpaAccountItem,
  type SpaAccountWithItems,
  type SpaPayment,
  type InsertSpaPayment,
  type SpaPaymentMethod,
  // Events
  type EventRoom,
  type InsertEventRoom,
  type EventRoomStatus,
  type Event as HotelEvent,
  type InsertEvent,
  type EventStatus,
  type EventType,
  type EventChargeType,
  type InsertEventChargeType,
  type EventCharge,
  type InsertEventCharge,
  type EventWithDetails,
  type EventChargeWithType,
  type EventPlanningData,
  type EventPlanningCellStatus,
  type EventPayment,
  type InsertEventPayment,
  type EventTable,
  type InsertEventTable,
  type EventTableWithDetails,
  type EventTableCharge,
  type InsertEventTableCharge,
  type EventTablePayment,
  type InsertEventTablePayment,
  // Maintenance
  type MaintenanceStaff,
  type InsertMaintenanceStaff,
  type WorkOrder,
  type InsertWorkOrder,
  type WorkOrderWithDetails,
  type WorkOrderStatus,
  type WorkOrderPriority,
  // Administration
  type SystemUser,
  type InsertSystemUser,
  type SystemUserRole,
  type SystemSetting,
  type InsertSystemSetting,
  type AuditLog,
  type InsertAuditLog,
  type AuditAction,
  type WorkOrderCategory,
  // Packages
  type Package,
  type InsertPackage,
  type PackageItem,
  type InsertPackageItem,
  type PackageWithDetails,
  type PackageStatus,
  // Notifications & Web Check-in
  type SystemNotification,
  type InsertSystemNotification,
  type NotificationArea,
  type WebCheckin,
  type InsertWebCheckin,
  // Hospitality
  type GuestPreference,
  type InsertGuestPreference,
  type StayNote,
  type InsertStayNote,
  type HospitalityAlert,
  type InsertHospitalityAlert,
  type AccountMovement,
  type InsertAccountMovement,
  type AccountEntityType,
} from "@shared/schema";
import { randomUUID } from "crypto";

export interface IStorage {
  // Users
  getUser(id: string): Promise<User | undefined>;
  getUserByUsername(username: string): Promise<User | undefined>;
  createUser(user: InsertUser): Promise<User>;

  // Room Types
  getRoomTypes(): Promise<RoomType[]>;
  getRoomType(id: string): Promise<RoomType | undefined>;
  createRoomType(roomType: InsertRoomType): Promise<RoomType>;
  updateRoomType(id: string, roomType: Partial<InsertRoomType>): Promise<RoomType | undefined>;
  deleteRoomType(id: string): Promise<boolean>;

  // Rate Plans
  getRatePlans(): Promise<RatePlanWithRoomType[]>;
  getRatePlan(id: string): Promise<RatePlanWithRoomType | undefined>;
  getRatePlansByRoomType(roomTypeId: string): Promise<RatePlan[]>;
  createRatePlan(ratePlan: InsertRatePlan): Promise<RatePlan>;
  updateRatePlan(id: string, ratePlan: Partial<InsertRatePlan>): Promise<RatePlan | undefined>;
  deleteRatePlan(id: string): Promise<boolean>;

  // Rooms
  getRooms(): Promise<RoomWithType[]>;
  getRoom(id: string): Promise<RoomWithType | undefined>;
  createRoom(room: InsertRoom): Promise<Room>;
  updateRoom(id: string, room: Partial<InsertRoom>): Promise<Room | undefined>;
  deleteRoom(id: string): Promise<boolean>;

  // Companies
  getCompanies(): Promise<Company[]>;
  getCompany(id: string): Promise<Company | undefined>;
  searchCompanies(query: string): Promise<Company[]>;
  createCompany(company: InsertCompany): Promise<Company>;
  updateCompany(id: string, company: Partial<InsertCompany>): Promise<Company | undefined>;
  deleteCompany(id: string): Promise<boolean>;

  // Agencies
  getAgencies(): Promise<Agency[]>;
  getAgency(id: string): Promise<Agency | undefined>;
  searchAgencies(query: string): Promise<Agency[]>;
  createAgency(agency: InsertAgency): Promise<Agency>;
  updateAgency(id: string, agency: Partial<InsertAgency>): Promise<Agency | undefined>;
  deleteAgency(id: string): Promise<boolean>;

  // Guests
  getGuests(): Promise<Guest[]>;
  getGuest(id: string): Promise<Guest | undefined>;
  searchGuests(query: string): Promise<Guest[]>;
  createGuest(guest: InsertGuest): Promise<Guest>;
  updateGuest(id: string, guest: Partial<InsertGuest>): Promise<Guest | undefined>;
  deleteGuest(id: string): Promise<boolean>;

  // Bed Types
  getBedTypes(): Promise<BedType[]>;
  getBedType(id: string): Promise<BedType | undefined>;
  createBedType(bedType: InsertBedType): Promise<BedType>;
  updateBedType(id: string, bedType: Partial<InsertBedType>): Promise<BedType | undefined>;
  deleteBedType(id: string): Promise<boolean>;

  // Reservations
  getReservations(options?: { dateFrom?: string; dateTo?: string; dateMode?: string }): Promise<ReservationWithDetails[]>;
  getReservation(id: string): Promise<ReservationWithDetails | undefined>;
  getReservationByCode(code: string): Promise<ReservationWithDetails | undefined>;
  getRecentReservations(limit: number): Promise<ReservationWithDetails[]>;
  getReservationsForCheckIn(): Promise<ReservationWithDetails[]>;
  getReservationsForCheckOut(): Promise<ReservationWithDetails[]>;
  getCheckInsByDate(date: string): Promise<ReservationWithDetails[]>;
  getReservationsByGuest(guestId: string): Promise<ReservationWithDetails[]>;
  createReservation(reservation: InsertReservation): Promise<Reservation>;
  updateReservation(id: string, reservation: Partial<InsertReservation>): Promise<Reservation | undefined>;
  deleteReservation(id: string): Promise<boolean>;
  generateReservationCode(): string;

  // Charges
  getCharges(reservationId: string): Promise<Charge[]>;
  getAllChargesIncludingAnulados(reservationId: string): Promise<Charge[]>;
  getCharge(id: string): Promise<Charge | undefined>;
  createCharge(charge: InsertCharge): Promise<Charge>;
  updateCharge(id: string, charge: Partial<InsertCharge>): Promise<Charge | undefined>;
  deleteCharge(id: string): Promise<boolean>;
  getChargesTotal(reservationId: string): Promise<number>;

  // Payments
  getPayments(reservationId: string): Promise<Payment[]>;
  getAllPaymentsIncludingAnulados(reservationId: string): Promise<Payment[]>;
  createPayment(payment: InsertPayment): Promise<Payment>;
  updatePayment(id: string, payment: Partial<InsertPayment>): Promise<Payment | undefined>;
  deletePayment(id: string): Promise<boolean>;
  getPaymentsTotal(reservationId: string): Promise<number>;

  // Cancelled Reservation Logs
  getCancelledReservationLogs(): Promise<CancelledReservationLog[]>;
  createCancelledReservationLog(log: InsertCancelledReservationLog): Promise<CancelledReservationLog>;

  // Overbooking check
  checkOverbooking(roomId: string, checkInDate: string, checkOutDate: string, excludeReservationId?: string): Promise<boolean>;

  // Dashboard
  getDashboardStats(): Promise<{
    totalRooms: number;
    availableRooms: number;
    occupiedRooms: number;
    dirtyRooms: number;
    cleaningRooms: number;
    maintenanceRooms: number;
    oosRooms: number;
    todayCheckIns: number;
    todayCheckOuts: number;
    occupancyRate: number;
    totalGuests: number;
    pendingReservations: number;
  }>;

  // Planning
  getPlanningData(startDate: string, endDate: string): Promise<PlanningData>;

  // OTA Channels
  getOTAChannels(): Promise<OTAChannelWithStats[]>;
  getOTAChannel(id: string): Promise<OTAChannel | undefined>;
  createOTAChannel(channel: InsertOTAChannel): Promise<OTAChannel>;
  updateOTAChannel(id: string, channel: Partial<InsertOTAChannel>): Promise<OTAChannel | undefined>;
  deleteOTAChannel(id: string): Promise<boolean>;

  // OTA Reservation Logs
  getOTAReservationLogs(channelId?: string): Promise<OTAReservationLogWithChannel[]>;
  getOTAReservationLog(id: string): Promise<OTAReservationLogWithChannel | undefined>;
  createOTAReservationLog(log: InsertOTAReservationLog): Promise<OTAReservationLog>;
  updateOTAReservationLog(id: string, log: Partial<InsertOTAReservationLog>): Promise<OTAReservationLog | undefined>;
  syncOTAReservation(logId: string): Promise<Reservation | undefined>;

  // Groups
  getGroups(): Promise<GroupWithDetails[]>;
  getGroup(id: string): Promise<GroupWithDetails | undefined>;
  createGroup(group: InsertGroup): Promise<Group>;
  updateGroup(id: string, group: Partial<InsertGroup>): Promise<Group | undefined>;
  deleteGroup(id: string): Promise<boolean>;
  generateGroupCode(): string;

  // Group Room Blocks
  getGroupBlocks(groupId: string): Promise<GroupRoomBlockWithDetails[]>;
  createGroupBlock(block: InsertGroupRoomBlock): Promise<GroupRoomBlock>;
  updateGroupBlock(id: string, block: Partial<InsertGroupRoomBlock>): Promise<GroupRoomBlock | undefined>;
  deleteGroupBlock(id: string): Promise<boolean>;

  // Group Reservation Links
  getGroupReservationLinks(groupId: string): Promise<GroupReservationLink[]>;
  createGroupReservationLink(link: InsertGroupReservationLink): Promise<GroupReservationLink>;
  assignRoomToGroup(
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
  ): Promise<Reservation | undefined>;

  // Group Folio
  createGroupCharge(charge: InsertGroupCharge): Promise<GroupCharge>;
  getGroupCharges(groupId: string): Promise<GroupCharge[]>;
  deleteGroupCharge(id: string): Promise<boolean>;
  createGroupPayment(payment: InsertGroupPayment): Promise<GroupPayment>;
  getGroupPayments(groupId: string): Promise<GroupPayment[]>;
  transferChargeToGroup(chargeId: string, groupId: string): Promise<GroupCharge>;
  getGroupFolio(groupId: string): Promise<GroupFolioData>;
  distributeGroupPayment(groupId: string, totalAmount: number, distribution: string, manualDetail?: Record<string, number>): Promise<Record<string, number>>;

  // Guest Reviews
  getGuestReviews(): Promise<GuestReviewWithDetails[]>;
  getGuestReview(id: string): Promise<GuestReviewWithDetails | undefined>;
  getGuestReviewsByGuest(guestId: string): Promise<GuestReviewWithDetails[]>;
  createGuestReview(review: InsertGuestReview): Promise<GuestReview>;
  updateGuestReview(id: string, review: Partial<InsertGuestReview>): Promise<GuestReview | undefined>;
  deleteGuestReview(id: string): Promise<boolean>;
  getReviewAnalyticsSummary(): Promise<{
    totalReviews: number;
    averageRating: number;
    sentimentBreakdown: { positive: number; neutral: number; negative: number };
    topCategories: { category: string; count: number; avgSentiment: number }[];
    recentTrend: { date: string; avgRating: number; count: number }[];
    improvementAreas: string[];
  }>;

  // Housekeeping Tasks
  getHousekeepingTasks(date?: string): Promise<HousekeepingTaskWithRoom[]>;
  getHousekeepingTask(id: string): Promise<HousekeepingTaskWithRoom | undefined>;
  getHousekeepingTasksByRoom(roomId: string): Promise<HousekeepingTask[]>;
  createHousekeepingTask(task: InsertHousekeepingTask): Promise<HousekeepingTask>;
  updateHousekeepingTask(id: string, task: Partial<InsertHousekeepingTask>): Promise<HousekeepingTask | undefined>;
  deleteHousekeepingTask(id: string): Promise<boolean>;
  createCheckoutCleaningTask(roomId: string): Promise<HousekeepingTask>;

  // ==================== RESTAURANT ====================
  // Restaurant Areas
  getRestaurantAreas(): Promise<RestaurantArea[]>;
  getRestaurantArea(id: string): Promise<RestaurantArea | undefined>;
  createRestaurantArea(area: InsertRestaurantArea): Promise<RestaurantArea>;
  updateRestaurantArea(id: string, area: Partial<InsertRestaurantArea>): Promise<RestaurantArea | undefined>;
  deleteRestaurantArea(id: string): Promise<boolean>;

  // Restaurant Tables
  getRestaurantTables(): Promise<RestaurantTableWithArea[]>;
  getRestaurantTable(id: string): Promise<RestaurantTableWithArea | undefined>;
  getTablesByArea(areaId: string): Promise<RestaurantTable[]>;
  createRestaurantTable(table: InsertRestaurantTable): Promise<RestaurantTable>;
  updateRestaurantTable(id: string, table: Partial<InsertRestaurantTable>): Promise<RestaurantTable | undefined>;
  deleteRestaurantTable(id: string): Promise<boolean>;

  // Menu Categories
  getMenuCategories(): Promise<MenuCategory[]>;
  getMenuCategory(id: string): Promise<MenuCategory | undefined>;
  createMenuCategory(category: InsertMenuCategory): Promise<MenuCategory>;
  updateMenuCategory(id: string, category: Partial<InsertMenuCategory>): Promise<MenuCategory | undefined>;
  deleteMenuCategory(id: string): Promise<boolean>;

  // Menu Items
  getMenuItems(): Promise<MenuItemWithCategory[]>;
  getMenuItem(id: string): Promise<MenuItemWithCategory | undefined>;
  getMenuItemsByCategory(categoryId: string): Promise<MenuItem[]>;
  createMenuItem(item: InsertMenuItem): Promise<MenuItem>;
  updateMenuItem(id: string, item: Partial<InsertMenuItem>): Promise<MenuItem | undefined>;
  deleteMenuItem(id: string): Promise<boolean>;

  // Restaurant Orders
  getRestaurantOrders(status?: OrderStatus): Promise<RestaurantOrderWithDetails[]>;
  getRestaurantOrder(id: string): Promise<RestaurantOrderWithDetails | undefined>;
  getOrdersByTable(tableId: string): Promise<RestaurantOrder[]>;
  createRestaurantOrder(order: InsertRestaurantOrder): Promise<RestaurantOrder>;
  updateRestaurantOrder(id: string, order: Partial<InsertRestaurantOrder>): Promise<RestaurantOrder | undefined>;
  deleteRestaurantOrder(id: string): Promise<boolean>;
  generateOrderNumber(): string;

  // Order Items
  getOrderItems(orderId: string): Promise<OrderItem[]>;
  createOrderItem(item: InsertOrderItem): Promise<OrderItem>;
  updateOrderItem(id: string, item: Partial<InsertOrderItem>): Promise<OrderItem | undefined>;
  deleteOrderItem(id: string): Promise<boolean>;

  // Table Reservations
  getTableReservations(): Promise<TableReservationWithTable[]>;
  getTableReservation(id: string): Promise<TableReservationWithTable | undefined>;
  getTableReservationsByDate(date: string): Promise<TableReservationWithTable[]>;
  getTableReservationsByTable(tableId: string): Promise<TableReservation[]>;
  createTableReservation(reservation: InsertTableReservation): Promise<TableReservation>;
  updateTableReservation(id: string, reservation: Partial<InsertTableReservation>): Promise<TableReservation | undefined>;
  deleteTableReservation(id: string): Promise<boolean>;

  // Restaurant Time Slots
  getRestaurantTimeSlots(): Promise<RestaurantTimeSlot[]>;
  createRestaurantTimeSlot(slot: InsertRestaurantTimeSlot): Promise<RestaurantTimeSlot>;
  updateRestaurantTimeSlot(id: string, slot: Partial<InsertRestaurantTimeSlot>): Promise<RestaurantTimeSlot | undefined>;
  deleteRestaurantTimeSlot(id: string): Promise<boolean>;

  // Recipes
  getRecipes(): Promise<RecipeWithIngredients[]>;
  getRecipe(id: string): Promise<RecipeWithIngredients | undefined>;
  getRecipeByMenuItem(menuItemId: string): Promise<RecipeWithIngredients | undefined>;
  createRecipe(recipe: InsertRecipe): Promise<Recipe>;
  updateRecipe(id: string, recipe: Partial<InsertRecipe>): Promise<Recipe | undefined>;
  deleteRecipe(id: string): Promise<boolean>;

  // Recipe Ingredients
  getRecipeIngredients(recipeId: string): Promise<RecipeIngredient[]>;
  createRecipeIngredient(ingredient: InsertRecipeIngredient): Promise<RecipeIngredient>;
  updateRecipeIngredient(id: string, ingredient: Partial<InsertRecipeIngredient>): Promise<RecipeIngredient | undefined>;
  deleteRecipeIngredient(id: string): Promise<boolean>;

  // Order Splits
  getOrderSplits(orderId: string): Promise<OrderSplit[]>;
  createOrderSplit(split: InsertOrderSplit): Promise<OrderSplit>;
  updateOrderSplit(id: string, split: Partial<InsertOrderSplit>): Promise<OrderSplit | undefined>;
  deleteOrderSplitsByOrder(orderId: string): Promise<boolean>;

  // ==================== INVENTORY ====================
  // Item Categories
  getItemCategories(): Promise<ItemCategory[]>;
  getItemCategory(id: string): Promise<ItemCategory | undefined>;
  createItemCategory(category: InsertItemCategory): Promise<ItemCategory>;
  updateItemCategory(id: string, category: Partial<InsertItemCategory>): Promise<ItemCategory | undefined>;
  deleteItemCategory(id: string): Promise<boolean>;

  // Suppliers
  getSuppliers(): Promise<Supplier[]>;
  getSupplier(id: string): Promise<Supplier | undefined>;
  createSupplier(supplier: InsertSupplier): Promise<Supplier>;
  updateSupplier(id: string, supplier: Partial<InsertSupplier>): Promise<Supplier | undefined>;
  deleteSupplier(id: string): Promise<boolean>;

  // Inventory Items
  getInventoryItems(): Promise<InventoryItemWithDetails[]>;
  getInventoryItem(id: string): Promise<InventoryItemWithDetails | undefined>;
  getInventoryItemsBelowMinStock(): Promise<InventoryItem[]>;
  createInventoryItem(item: InsertInventoryItem): Promise<InventoryItem>;
  updateInventoryItem(id: string, item: Partial<InsertInventoryItem>): Promise<InventoryItem | undefined>;
  deleteInventoryItem(id: string): Promise<boolean>;

  // Stock Movements
  getStockMovements(itemId?: string): Promise<StockMovementWithItem[]>;
  createStockMovement(movement: InsertStockMovement): Promise<StockMovement>;

  // ==================== SPA ====================
  // SPA Cabins
  getSpaCabins(): Promise<SpaCabin[]>;
  getSpaCabin(id: string): Promise<SpaCabin | undefined>;
  createSpaCabin(cabin: InsertSpaCabin): Promise<SpaCabin>;
  updateSpaCabin(id: string, cabin: Partial<InsertSpaCabin>): Promise<SpaCabin | undefined>;
  deleteSpaCabin(id: string): Promise<boolean>;

  // SPA Treatment Categories
  getSpaTreatmentCategories(): Promise<SpaTreatmentCategory[]>;
  getSpaTreatmentCategory(id: string): Promise<SpaTreatmentCategory | undefined>;
  createSpaTreatmentCategory(category: InsertSpaTreatmentCategory): Promise<SpaTreatmentCategory>;
  updateSpaTreatmentCategory(id: string, category: Partial<InsertSpaTreatmentCategory>): Promise<SpaTreatmentCategory | undefined>;
  deleteSpaTreatmentCategory(id: string): Promise<boolean>;

  // SPA Treatments
  getSpaTreatments(): Promise<SpaTreatment[]>;
  getSpaTreatment(id: string): Promise<SpaTreatment | undefined>;
  getSpaTreatmentsByCategory(categoryId: string): Promise<SpaTreatment[]>;
  createSpaTreatment(treatment: InsertSpaTreatment): Promise<SpaTreatment>;
  updateSpaTreatment(id: string, treatment: Partial<InsertSpaTreatment>): Promise<SpaTreatment | undefined>;
  deleteSpaTreatment(id: string): Promise<boolean>;

  // SPA Appointments
  getSpaAppointments(date?: string): Promise<SpaAppointmentWithDetails[]>;
  getSpaAppointment(id: string): Promise<SpaAppointmentWithDetails | undefined>;
  getSpaAppointmentsByCabin(cabinId: string, date: string): Promise<SpaAppointment[]>;
  getSpaAppointmentsByDateRange(startDate: string, endDate: string): Promise<SpaAppointmentWithDetails[]>;
  createSpaAppointment(appointment: InsertSpaAppointment): Promise<SpaAppointment>;
  updateSpaAppointment(id: string, appointment: Partial<InsertSpaAppointment>): Promise<SpaAppointment | undefined>;
  deleteSpaAppointment(id: string): Promise<boolean>;

  // SPA Accounts
  getSpaAccounts(status?: SpaAccountStatus): Promise<SpaAccountWithItems[]>;
  getSpaAccount(id: string): Promise<SpaAccountWithItems | undefined>;
  getSpaAccountByAppointment(appointmentId: string): Promise<SpaAccountWithItems | undefined>;
  createSpaAccount(account: InsertSpaAccount): Promise<SpaAccount>;
  updateSpaAccount(id: string, account: Partial<InsertSpaAccount>): Promise<SpaAccount | undefined>;
  closeSpaAccount(id: string, chargedTo: string, receiptType?: string): Promise<SpaAccount | undefined>;

  // SPA Account Items
  getSpaAccountItems(accountId: string): Promise<SpaAccountItem[]>;
  createSpaAccountItem(item: InsertSpaAccountItem): Promise<SpaAccountItem>;
  updateSpaAccountItem(id: string, item: Partial<InsertSpaAccountItem>): Promise<SpaAccountItem | undefined>;
  deleteSpaAccountItem(id: string): Promise<boolean>;

  // SPA Payments
  getSpaPayments(accountId: string): Promise<SpaPayment[]>;
  createSpaPayment(payment: InsertSpaPayment): Promise<SpaPayment>;
  deleteSpaPayment(id: string): Promise<boolean>;

  // ==================== EVENTS ====================
  // Event Rooms
  getEventRooms(): Promise<EventRoom[]>;
  getEventRoom(id: string): Promise<EventRoom | undefined>;
  createEventRoom(room: InsertEventRoom): Promise<EventRoom>;
  updateEventRoom(id: string, room: Partial<InsertEventRoom>): Promise<EventRoom | undefined>;
  deleteEventRoom(id: string): Promise<boolean>;

  // Events
  getEvents(): Promise<EventWithDetails[]>;
  getEvent(id: string): Promise<EventWithDetails | undefined>;
  getEventsByDateRange(startDate: string, endDate: string): Promise<EventWithDetails[]>;
  createEvent(event: InsertEvent): Promise<HotelEvent>;
  updateEvent(id: string, event: Partial<InsertEvent>): Promise<HotelEvent | undefined>;
  deleteEvent(id: string): Promise<boolean>;
  generateEventCode(): string;

  // Event Charge Types
  getEventChargeTypes(): Promise<EventChargeType[]>;
  getEventChargeType(id: string): Promise<EventChargeType | undefined>;
  createEventChargeType(chargeType: InsertEventChargeType): Promise<EventChargeType>;
  updateEventChargeType(id: string, chargeType: Partial<InsertEventChargeType>): Promise<EventChargeType | undefined>;
  deleteEventChargeType(id: string): Promise<boolean>;

  // Event Charges
  getEventCharges(eventId: string): Promise<EventChargeWithType[]>;
  createEventCharge(charge: InsertEventCharge): Promise<EventCharge>;
  updateEventCharge(id: string, charge: Partial<InsertEventCharge>): Promise<EventCharge | undefined>;
  deleteEventCharge(id: string): Promise<boolean>;

  // Event Payments
  getEventPayments(eventId: string): Promise<EventPayment[]>;
  createEventPayment(payment: InsertEventPayment): Promise<EventPayment>;
  deleteEventPayment(id: string): Promise<boolean>;

  // Event Tables (Evento por Mesa)
  getEventTables(eventId: string): Promise<EventTableWithDetails[]>;
  getEventTable(id: string): Promise<EventTableWithDetails | undefined>;
  createEventTable(table: InsertEventTable): Promise<EventTable>;
  updateEventTable(id: string, table: Partial<InsertEventTable>): Promise<EventTable | undefined>;
  deleteEventTable(id: string): Promise<boolean>;

  // Event Table Charges
  getEventTableCharges(tableId: string): Promise<EventTableCharge[]>;
  createEventTableCharge(charge: InsertEventTableCharge): Promise<EventTableCharge>;
  deleteEventTableCharge(id: string): Promise<boolean>;

  // Event Table Payments
  getEventTablePayments(tableId: string): Promise<EventTablePayment[]>;
  createEventTablePayment(payment: InsertEventTablePayment): Promise<EventTablePayment>;
  deleteEventTablePayment(id: string): Promise<boolean>;

  // Event Planning
  getEventPlanningData(startDate: string, endDate: string): Promise<EventPlanningData>;

  // ==================== MAINTENANCE ====================
  // Maintenance Staff
  getMaintenanceStaff(): Promise<MaintenanceStaff[]>;
  getMaintenanceStaffMember(id: string): Promise<MaintenanceStaff | undefined>;
  createMaintenanceStaff(staff: InsertMaintenanceStaff): Promise<MaintenanceStaff>;
  updateMaintenanceStaff(id: string, staff: Partial<InsertMaintenanceStaff>): Promise<MaintenanceStaff | undefined>;
  deleteMaintenanceStaff(id: string): Promise<boolean>;

  // Work Orders
  getWorkOrders(): Promise<WorkOrderWithDetails[]>;
  getWorkOrder(id: string): Promise<WorkOrderWithDetails | undefined>;
  getWorkOrdersByRoom(roomId: string): Promise<WorkOrderWithDetails[]>;
  getWorkOrdersByStatus(status: WorkOrderStatus): Promise<WorkOrderWithDetails[]>;
  createWorkOrder(order: InsertWorkOrder): Promise<WorkOrder>;
  updateWorkOrder(id: string, order: Partial<InsertWorkOrder>): Promise<WorkOrder | undefined>;
  deleteWorkOrder(id: string): Promise<boolean>;
  generateWorkOrderCode(): string;

  // Administration - System Users
  getSystemUsers(): Promise<SystemUser[]>;
  getSystemUser(id: string): Promise<SystemUser | undefined>;
  getSystemUserByUsername(username: string): Promise<SystemUser | undefined>;
  createSystemUser(user: InsertSystemUser): Promise<SystemUser>;
  updateSystemUser(id: string, user: Partial<InsertSystemUser>): Promise<SystemUser | undefined>;
  deleteSystemUser(id: string): Promise<boolean>;

  // Administration - System Settings
  getSystemSettings(): Promise<SystemSetting[]>;
  getSystemSetting(key: string): Promise<SystemSetting | undefined>;
  getSystemSettingsByCategory(category: string): Promise<SystemSetting[]>;
  upsertSystemSetting(setting: InsertSystemSetting): Promise<SystemSetting>;
  deleteSystemSetting(key: string): Promise<boolean>;

  // Administration - Audit Logs
  getAuditLogs(): Promise<AuditLog[]>;
  getAuditLogsByModule(module: string): Promise<AuditLog[]>;
  getAuditLogsByUser(userId: string): Promise<AuditLog[]>;
  createAuditLog(log: InsertAuditLog): Promise<AuditLog>;
  getAdminDashboardStats(): Promise<{
    totalUsers: number;
    activeUsers: number;
    recentLogins: number;
    totalSettings: number;
    recentAuditLogs: AuditLog[];
  }>;

  // ==================== PACKAGES ====================
  getPackages(): Promise<PackageWithDetails[]>;
  getPackage(id: string): Promise<PackageWithDetails | undefined>;
  getActivePackages(): Promise<PackageWithDetails[]>;
  createPackage(pkg: InsertPackage): Promise<Package>;
  updatePackage(id: string, pkg: Partial<InsertPackage>): Promise<Package | undefined>;
  deletePackage(id: string): Promise<boolean>;
  generatePackageCode(): string;
  
  // Package Items
  getPackageItems(packageId: string): Promise<PackageItem[]>;
  createPackageItem(item: InsertPackageItem): Promise<PackageItem>;
  updatePackageItem(id: string, item: Partial<InsertPackageItem>): Promise<PackageItem | undefined>;
  deletePackageItem(id: string): Promise<boolean>;

  // System Notifications
  getNotifications(area?: NotificationArea, limit?: number): Promise<SystemNotification[]>;
  createNotification(notification: InsertSystemNotification): Promise<SystemNotification>;
  markNotificationRead(id: string): Promise<SystemNotification | undefined>;
  markAllNotificationsRead(area?: NotificationArea): Promise<number>;
  getUnreadNotificationCount(area?: NotificationArea): Promise<number>;

  // Web Check-in
  createWebCheckin(data: InsertWebCheckin): Promise<WebCheckin>;
  getWebCheckinByToken(token: string): Promise<WebCheckin | undefined>;
  getWebCheckinByReservation(reservationId: string): Promise<WebCheckin | undefined>;
  updateWebCheckin(id: string, data: Partial<InsertWebCheckin>): Promise<WebCheckin | undefined>;
  listWebCheckins(): Promise<WebCheckin[]>;

  // Hospitality - Guest Preferences
  getGuestPreferences(guestId: string): Promise<GuestPreference[]>;
  getActiveGuestPreferences(guestId: string): Promise<GuestPreference[]>;
  getGuestPreference(id: string): Promise<GuestPreference | undefined>;
  createGuestPreference(pref: InsertGuestPreference): Promise<GuestPreference>;
  updateGuestPreference(id: string, pref: Partial<InsertGuestPreference>): Promise<GuestPreference | undefined>;
  toggleGuestPreference(id: string): Promise<GuestPreference | undefined>;
  deleteGuestPreference(id: string): Promise<boolean>;

  // Hospitality - Stay Notes
  getStayNotes(reservationId: string): Promise<StayNote[]>;
  getActiveStayNotes(): Promise<StayNote[]>;
  createStayNote(note: InsertStayNote): Promise<StayNote>;
  updateStayNote(id: string, note: Partial<InsertStayNote>): Promise<StayNote | undefined>;
  resolveStayNote(id: string, resolvedBy: string): Promise<StayNote | undefined>;
  deleteStayNote(id: string): Promise<boolean>;

  // Hospitality - Alerts
  getHospitalityAlerts(area?: string): Promise<HospitalityAlert[]>;
  getHospitalityAlertsByReservation(reservationId: string): Promise<HospitalityAlert[]>;
  createHospitalityAlert(alert: InsertHospitalityAlert): Promise<HospitalityAlert>;
  acknowledgeHospitalityAlert(id: string, acknowledgedBy: string): Promise<HospitalityAlert | undefined>;
  bulkCheckIn(groupId: string): Promise<{ processed: number; skipped: number; skippedRooms: string[] }>;
  bulkCheckOut(groupId: string): Promise<{ processed: number; skipped: number; pendingBalance: Array<{ room: string; guestName: string; balance: number }> }>;
  getExecutiveStats(from: string, to: string): Promise<any>;
  getReportOccupancy(from: string, to: string): Promise<any[]>;
  getReportRevenueByRoomType(from: string, to: string): Promise<any[]>;
  getReportByChannel(from: string, to: string): Promise<any[]>;
  getReportReservations(from: string, to: string, status?: string): Promise<any[]>;
  getReportPayments(from: string, to: string): Promise<any>;
  getReportTopGuests(from: string, to: string, limit?: number): Promise<any[]>;
  getReportHousekeeping(from: string, to: string): Promise<any>;
  getReportRestaurant(from: string, to: string): Promise<any>;

  getCashConfigs(): Promise<any[]>;
  updateCashConfig(area: string, data: any): Promise<any>;
  getCashShifts(area?: string, status?: string): Promise<any[]>;
  getCurrentShift(area: string): Promise<any>;
  openShift(data: any): Promise<any>;
  closeShift(shiftId: string, closedBy: string, efectivoContado: number, operadorSiguiente: string | null, enviarAAdministracion: boolean, notes?: string): Promise<any>;
  getOrCreateActiveTurno(area: string): Promise<any>;
  initCashShifts(): Promise<void>;
  tomarTurno(shiftId: string, operador: string): Promise<any>;
  getAutocreadoShifts(): Promise<any[]>;
  getShiftDetail(shiftId: string): Promise<any>;
  getCashMovements(shiftId: string): Promise<any[]>;
  createCashMovement(data: any): Promise<any>;
  registerCashMovement(area: string, sourceType: string, sourceId: string | null, sourceLabel: string, paymentMethod: string, amount: string, movementType?: string, registeredBy?: string, receiptType?: string): Promise<any>;
  getCashSummary(area?: string, from?: string, to?: string): Promise<any[]>;

  getAccountMovements(entityType: AccountEntityType, entityId: string): Promise<AccountMovement[]>;
  getAccountBalance(entityType: AccountEntityType, entityId: string): Promise<number>;
  createAccountMovement(data: InsertAccountMovement): Promise<AccountMovement>;
  getAccountSummary(): Promise<{
    companies: { id: string; name: string; balance: number; lastMovement: string | null }[];
    agencies: { id: string; name: string; balance: number; lastMovement: string | null }[];
  }>;
}

export class MemStorage implements IStorage {
  private users: Map<string, User>;
  private roomTypes: Map<string, RoomType>;
  private ratePlans: Map<string, RatePlan>;
  private rooms: Map<string, Room>;
  private companies: Map<string, Company>;
  private guests: Map<string, Guest>;
  private bedTypesMap: Map<string, BedType>;
  private reservations: Map<string, Reservation>;
  private charges: Map<string, Charge>;
  private payments: Map<string, Payment>;
  private cancelledReservationLogs: Map<string, CancelledReservationLog>;
  private otaChannels: Map<string, OTAChannel>;
  private otaReservationLogs: Map<string, OTAReservationLog>;
  private groups: Map<string, Group>;
  private groupRoomBlocks: Map<string, GroupRoomBlock>;
  private groupReservationLinks: Map<string, GroupReservationLink>;
  private guestReviews: Map<string, GuestReview>;
  private housekeepingTasks: Map<string, HousekeepingTask>;
  // Restaurant
  private restaurantAreas: Map<string, RestaurantArea>;
  private restaurantTables: Map<string, RestaurantTable>;
  private menuCategories: Map<string, MenuCategory>;
  private menuItems: Map<string, MenuItem>;
  private restaurantOrders: Map<string, RestaurantOrder>;
  private orderItems: Map<string, OrderItem>;
  private tableReservations: Map<string, TableReservation>;
  private restaurantTimeSlots: Map<string, RestaurantTimeSlot>;
  private orderSplitsMap: Map<string, OrderSplit>;
  private recipesMap: Map<string, Recipe>;
  private recipeIngredientsMap: Map<string, RecipeIngredient>;
  // Inventory
  private itemCategories: Map<string, ItemCategory>;
  private suppliers: Map<string, Supplier>;
  private inventoryItems: Map<string, InventoryItem>;
  private stockMovements: Map<string, StockMovement>;
  // SPA
  private spaCabins: Map<string, SpaCabin>;
  private spaTreatmentCategories: Map<string, SpaTreatmentCategory>;
  private spaTreatments: Map<string, SpaTreatment>;
  private spaAppointments: Map<string, SpaAppointment>;
  private spaAccounts: Map<string, SpaAccount>;
  private spaAccountItems: Map<string, SpaAccountItem>;
  private spaPayments: Map<string, SpaPayment>;
  // Events
  private eventRooms: Map<string, EventRoom>;
  private events: Map<string, HotelEvent>;
  private eventChargeTypes: Map<string, EventChargeType>;
  private eventCharges: Map<string, EventCharge>;
  private eventPayments: Map<string, EventPayment>;
  private eventTablesMap: Map<string, EventTable>;
  private eventTableCharges: Map<string, EventTableCharge>;
  private eventTablePayments: Map<string, EventTablePayment>;
  // Maintenance
  private maintenanceStaff: Map<string, MaintenanceStaff>;
  private workOrders: Map<string, WorkOrder>;
  // Administration
  private systemUsers: Map<string, SystemUser>;
  private systemSettings: Map<string, SystemSetting>;
  private auditLogs: Map<string, AuditLog>;
  // Packages
  private packages: Map<string, Package>;
  private packageItems: Map<string, PackageItem>;
  // Notifications & Web Check-in
  private notificationsMap: Map<string, SystemNotification>;
  private webCheckinsMap: Map<string, WebCheckin>;
  // Hospitality
  private guestPreferencesMap: Map<string, GuestPreference>;
  private stayNotesMap: Map<string, StayNote>;
  private hospitalityAlertsMap: Map<string, HospitalityAlert>;
  // Counters
  private reservationCounter: number;
  private guestCounter: number;
  private groupCounter: number;
  private orderCounter: number;
  private eventCounter: number;
  private workOrderCounter: number;
  private packageCounter: number;

  constructor() {
    this.users = new Map();
    this.roomTypes = new Map();
    this.ratePlans = new Map();
    this.rooms = new Map();
    this.companies = new Map();
    this.guests = new Map();
    this.bedTypesMap = new Map();
    this.reservations = new Map();
    this.charges = new Map();
    this.payments = new Map();
    this.cancelledReservationLogs = new Map();
    this.otaChannels = new Map();
    this.otaReservationLogs = new Map();
    this.groups = new Map();
    this.groupRoomBlocks = new Map();
    this.groupReservationLinks = new Map();
    this.guestReviews = new Map();
    this.housekeepingTasks = new Map();
    // Restaurant
    this.restaurantAreas = new Map();
    this.restaurantTables = new Map();
    this.menuCategories = new Map();
    this.menuItems = new Map();
    this.restaurantOrders = new Map();
    this.orderItems = new Map();
    this.tableReservations = new Map();
    this.restaurantTimeSlots = new Map();
    this.orderSplitsMap = new Map();
    this.recipesMap = new Map();
    this.recipeIngredientsMap = new Map();
    // Inventory
    this.itemCategories = new Map();
    this.suppliers = new Map();
    this.inventoryItems = new Map();
    this.stockMovements = new Map();
    // SPA
    this.spaCabins = new Map();
    this.spaTreatmentCategories = new Map();
    this.spaTreatments = new Map();
    this.spaAppointments = new Map();
    this.spaAccounts = new Map();
    this.spaAccountItems = new Map();
    this.spaPayments = new Map();
    // Events
    this.eventRooms = new Map();
    this.events = new Map();
    this.eventChargeTypes = new Map();
    this.eventCharges = new Map();
    this.eventPayments = new Map();
    this.eventTablesMap = new Map();
    this.eventTableCharges = new Map();
    this.eventTablePayments = new Map();
    // Maintenance
    this.maintenanceStaff = new Map();
    this.workOrders = new Map();
    // Administration
    this.systemUsers = new Map();
    this.systemSettings = new Map();
    this.auditLogs = new Map();
    // Packages
    this.packages = new Map();
    this.packageItems = new Map();
    // Notifications & Web Check-in
    this.notificationsMap = new Map();
    this.webCheckinsMap = new Map();
    // Hospitality
    this.guestPreferencesMap = new Map();
    this.stayNotesMap = new Map();
    this.hospitalityAlertsMap = new Map();
    // Counters
    this.reservationCounter = 1000;
    this.guestCounter = 0;
    this.groupCounter = 0;
    this.orderCounter = 1000;
    this.eventCounter = 1000;
    this.workOrderCounter = 1000;
    this.packageCounter = 0;

    // Seed with demo data
    this.seedData();
  }

  private seedData() {
    // Create room types - Real hotel categories
    const roomTypes: RoomType[] = [
      { id: "rt1", code: "EJEC", name: "Ejecutiva", description: "Habitacion ejecutiva, ideal para viajeros de negocios", baseOccupancy: 2, maxOccupancy: 2 },
      { id: "rt2", code: "PREM", name: "Premium", description: "Habitacion premium con amenities superiores", baseOccupancy: 2, maxOccupancy: 3 },
      { id: "rt3", code: "SPAN", name: "Suite Panoramica", description: "Suite con vistas panoramicas y living separado", baseOccupancy: 2, maxOccupancy: 4 },
      { id: "rt4", code: "SPRES", name: "Suite Presidencial", description: "La suite mas exclusiva del hotel", baseOccupancy: 2, maxOccupancy: 4 },
    ];
    roomTypes.forEach((rt) => this.roomTypes.set(rt.id, rt));

    // Create bed types
    const defaultBedTypes: BedType[] = [
      { id: randomUUID(), code: "SGL", name: "Simple", description: "Cama simple individual", isActive: true, displayOrder: 1, createdAt: new Date() },
      { id: randomUUID(), code: "DBL", name: "Doble", description: "Cama doble matrimonial", isActive: true, displayOrder: 2, createdAt: new Date() },
      { id: randomUUID(), code: "TWN", name: "Twin — 2 camas separadas", description: "Dos camas individuales separadas", isActive: true, displayOrder: 3, createdAt: new Date() },
      { id: randomUUID(), code: "TPL", name: "Triple", description: "Configuración triple (matrimonial + individual)", isActive: true, displayOrder: 4, createdAt: new Date() },
      { id: randomUUID(), code: "MAT_LIV", name: "Matrimonial con Living", description: "Cama matrimonial con living separado", isActive: true, displayOrder: 5, createdAt: new Date() },
      { id: randomUUID(), code: "STE_SOFA", name: "Suite con Sofá Cama", description: "Suite con sofá cama adicional", isActive: true, displayOrder: 6, createdAt: new Date() },
    ];
    defaultBedTypes.forEach((bt) => this.bedTypesMap.set(bt.id, bt));

    // Create rate plans
    const ratePlans: RatePlan[] = [
      { id: "rp1", name: "BAR (Mejor Tarifa)", roomTypeId: "rt1", baseRate: "85.00", currency: "USD", refundable: "true", cancellationPolicy: "Cancelacion gratuita hasta 24h antes" },
      { id: "rp2", name: "BAR (Mejor Tarifa)", roomTypeId: "rt2", baseRate: "120.00", currency: "USD", refundable: "true", cancellationPolicy: "Cancelacion gratuita hasta 24h antes" },
      { id: "rp3", name: "BAR (Mejor Tarifa)", roomTypeId: "rt3", baseRate: "180.00", currency: "USD", refundable: "true", cancellationPolicy: "Cancelacion gratuita hasta 24h antes" },
      { id: "rp4", name: "BAR (Mejor Tarifa)", roomTypeId: "rt4", baseRate: "350.00", currency: "USD", refundable: "true", cancellationPolicy: "Cancelacion gratuita hasta 24h antes" },
      { id: "rp5", name: "No Reembolsable", roomTypeId: "rt1", baseRate: "70.00", currency: "USD", refundable: "false", cancellationPolicy: "Sin reembolso por cancelacion" },
      { id: "rp6", name: "No Reembolsable", roomTypeId: "rt2", baseRate: "100.00", currency: "USD", refundable: "false", cancellationPolicy: "Sin reembolso por cancelacion" },
      { id: "rp7", name: "Corporativo", roomTypeId: "rt1", baseRate: "75.00", currency: "USD", refundable: "true", cancellationPolicy: "Facturacion a empresa" },
      { id: "rp8", name: "Corporativo", roomTypeId: "rt2", baseRate: "105.00", currency: "USD", refundable: "true", cancellationPolicy: "Facturacion a empresa" },
      { id: "rp9", name: "Corporativo", roomTypeId: "rt3", baseRate: "160.00", currency: "USD", refundable: "true", cancellationPolicy: "Facturacion a empresa" },
    ];
    ratePlans.forEach((rp) => this.ratePlans.set(rp.id, rp));

    // Create actual hotel rooms based on document
    const rooms: Room[] = [
      // Floor 2
      { id: "r201", roomNumber: "201", roomTypeId: "rt2", floor: 2, status: "available", bedConfig: "MAT_CC_EXTRA", features: ["accessible", "separable_bed"], maxOccupancy: 3, notes: null },
      { id: "r202", roomNumber: "202", roomTypeId: "rt1", floor: 2, status: "available", bedConfig: "TWIN_CC", features: ["twin_config", "separable_bed"], maxOccupancy: 2, notes: null },
      { id: "r204", roomNumber: "204", roomTypeId: "rt2", floor: 2, status: "available", bedConfig: "MAT_CC", features: ["accessible", "separable_bed", "sofa_bed", "living_room"], maxOccupancy: 4, notes: null },
      { id: "r205", roomNumber: "205", roomTypeId: "rt3", floor: 2, status: "available", bedConfig: "MAT_EXTRA", features: ["balcony", "living_room"], maxOccupancy: 4, notes: null },
      { id: "r206", roomNumber: "206", roomTypeId: "rt3", floor: 2, status: "available", bedConfig: "MAT_CC_EXTRA", features: ["separable_bed", "living_room"], maxOccupancy: 4, notes: null },
      { id: "r207", roomNumber: "207", roomTypeId: "rt2", floor: 2, status: "available", bedConfig: "MAT", features: [], maxOccupancy: 2, notes: null },
      // Floor 3
      { id: "r301", roomNumber: "301", roomTypeId: "rt2", floor: 3, status: "available", bedConfig: "MAT_CC_EXTRA", features: ["separable_bed", "extra_bed"], maxOccupancy: 3, notes: null },
      { id: "r302", roomNumber: "302", roomTypeId: "rt1", floor: 3, status: "available", bedConfig: "TWIN_CC", features: ["twin_config", "separable_bed"], maxOccupancy: 2, notes: null },
      { id: "r303", roomNumber: "303", roomTypeId: "rt1", floor: 3, status: "available", bedConfig: "MAT_CC", features: ["separable_bed"], maxOccupancy: 2, notes: null },
      { id: "r304", roomNumber: "304", roomTypeId: "rt1", floor: 3, status: "available", bedConfig: "MAT", features: ["shower_only"], maxOccupancy: 2, notes: null },
      { id: "r305", roomNumber: "305", roomTypeId: "rt3", floor: 3, status: "available", bedConfig: "MAT_EXTRA", features: ["extra_bed", "living_room", "balcony"], maxOccupancy: 5, notes: null },
      { id: "r306", roomNumber: "306", roomTypeId: "rt3", floor: 3, status: "available", bedConfig: "MAT_CC_EXTRA", features: ["separable_bed", "living_room", "balcony"], maxOccupancy: 4, notes: null },
      { id: "r307", roomNumber: "307", roomTypeId: "rt2", floor: 3, status: "available", bedConfig: "MAT_CC", features: ["separable_bed"], maxOccupancy: 2, notes: null },
      // Floor 4
      { id: "r401", roomNumber: "401", roomTypeId: "rt2", floor: 4, status: "available", bedConfig: "MAT_CC_EXTRA", features: ["separable_bed", "extra_bed"], maxOccupancy: 3, notes: null },
      { id: "r402", roomNumber: "402", roomTypeId: "rt1", floor: 4, status: "available", bedConfig: "TWIN_CC", features: ["twin_config", "separable_bed"], maxOccupancy: 2, notes: null },
      { id: "r403", roomNumber: "403", roomTypeId: "rt1", floor: 4, status: "available", bedConfig: "MAT_CC", features: ["separable_bed"], maxOccupancy: 2, notes: null },
      { id: "r404", roomNumber: "404", roomTypeId: "rt1", floor: 4, status: "available", bedConfig: "MAT", features: ["shower_only"], maxOccupancy: 2, notes: null },
      { id: "r405", roomNumber: "405", roomTypeId: "rt3", floor: 4, status: "available", bedConfig: "MAT_EXTRA", features: ["living_room", "balcony"], maxOccupancy: 4, notes: null },
      { id: "r406", roomNumber: "406", roomTypeId: "rt3", floor: 4, status: "available", bedConfig: "MAT_EXTRA", features: ["extra_bed", "living_room", "balcony"], maxOccupancy: 5, notes: null },
      { id: "r407", roomNumber: "407", roomTypeId: "rt2", floor: 4, status: "available", bedConfig: "MAT_CC", features: ["separable_bed"], maxOccupancy: 2, notes: null },
      // Floor 5
      { id: "r501", roomNumber: "501", roomTypeId: "rt2", floor: 5, status: "available", bedConfig: "MAT_CC_EXTRA", features: ["separable_bed", "extra_bed"], maxOccupancy: 3, notes: null },
      { id: "r502", roomNumber: "502", roomTypeId: "rt1", floor: 5, status: "available", bedConfig: "MAT_CC", features: ["twin_config", "separable_bed"], maxOccupancy: 2, notes: null },
      { id: "r503", roomNumber: "503", roomTypeId: "rt1", floor: 5, status: "available", bedConfig: "MAT_CC", features: ["separable_bed"], maxOccupancy: 2, notes: null },
      { id: "r504", roomNumber: "504", roomTypeId: "rt1", floor: 5, status: "available", bedConfig: "MAT", features: ["shower_only"], maxOccupancy: 2, notes: null },
      { id: "r505", roomNumber: "505", roomTypeId: "rt3", floor: 5, status: "available", bedConfig: "MAT_CC_EXTRA", features: ["separable_bed", "living_room", "balcony"], maxOccupancy: 4, notes: null },
      { id: "r506", roomNumber: "506", roomTypeId: "rt3", floor: 5, status: "available", bedConfig: "MAT_EXTRA", features: ["extra_bed", "living_room", "balcony"], maxOccupancy: 5, notes: null },
      { id: "r507", roomNumber: "507", roomTypeId: "rt2", floor: 5, status: "available", bedConfig: "MAT_CC", features: [], maxOccupancy: 2, notes: null },
      // Floor 6
      { id: "r601", roomNumber: "601", roomTypeId: "rt2", floor: 6, status: "available", bedConfig: "TWIN_CC_EXTRA", features: ["separable_bed", "extra_bed"], maxOccupancy: 3, notes: null },
      { id: "r602", roomNumber: "602", roomTypeId: "rt1", floor: 6, status: "available", bedConfig: "TWIN_CC", features: ["twin_config", "separable_bed"], maxOccupancy: 2, notes: null },
      { id: "r603", roomNumber: "603", roomTypeId: "rt1", floor: 6, status: "available", bedConfig: "MAT_CC", features: ["separable_bed"], maxOccupancy: 2, notes: null },
      { id: "r604", roomNumber: "604", roomTypeId: "rt1", floor: 6, status: "available", bedConfig: "MAT", features: [], maxOccupancy: 2, notes: null },
      { id: "r605", roomNumber: "605", roomTypeId: "rt3", floor: 6, status: "available", bedConfig: "MAT_CC_EXTRA", features: ["separable_bed", "living_room", "balcony", "extra_bed"], maxOccupancy: 4, notes: null },
      { id: "r606", roomNumber: "606", roomTypeId: "rt3", floor: 6, status: "available", bedConfig: "MAT_EXTRA", features: ["living_room", "balcony"], maxOccupancy: 4, notes: null },
      { id: "r607", roomNumber: "607", roomTypeId: "rt2", floor: 6, status: "available", bedConfig: "MAT", features: [], maxOccupancy: 2, notes: null },
    ];
    rooms.forEach((r) => this.rooms.set(r.id, r));

    // Create companies
    const seedTimestamp = new Date();
    const companies: Company[] = [
      { id: "comp1", razonSocial: "TechCorp Argentina S.A.", nombreFantasia: "TechCorp", direccion: "Av. del Libertador 1000", pais: "Argentina", codigoPostal: "1001", localidad: "CABA", provincia: "Buenos Aires", telefono: "+54 11 4000-1234", email: "reservas@techcorp.com.ar", cuilCuit: "30-71234567-8", numeroFiscal: "30714567", condicionIva: "responsable_inscripto", inscripcionNacional: "SI", inscripcionProvincial: "SI", contactName: "Pablo Mendez", contactEmail: "pablo.mendez@techcorp.com.ar", contactPhone: "+54 11 4000-1235", creditLimit: "50000.00", paymentTermDays: 30, notes: "Cliente corporativo frecuente", isActive: "true", createdAt: seedTimestamp },
      { id: "comp2", razonSocial: "Consultoría Global S.R.L.", nombreFantasia: "ConsultGlobal", direccion: "Callao 500", pais: "Argentina", codigoPostal: "1002", localidad: "CABA", provincia: "Buenos Aires", telefono: "+54 11 5000-5678", email: "viajes@consultglobal.com", cuilCuit: "30-70987654-3", numeroFiscal: "30709876", condicionIva: "responsable_inscripto", inscripcionNacional: "SI", inscripcionProvincial: "SI", contactName: "Lucia Torres", contactEmail: "lucia.t@consultglobal.com", contactPhone: "+54 11 5000-5679", creditLimit: "25000.00", paymentTermDays: 15, notes: null, isActive: "true", createdAt: seedTimestamp },
      { id: "comp3", razonSocial: "Exportadora del Sur S.A.", nombreFantasia: "ExportSur", direccion: "Bv. Oroño 2000", pais: "Argentina", codigoPostal: "2000", localidad: "Rosario", provincia: "Santa Fe", telefono: "+54 341 456-7890", email: "admin@exportsur.com.ar", cuilCuit: "30-65432198-7", numeroFiscal: "30654321", condicionIva: "responsable_inscripto", inscripcionNacional: "SI", inscripcionProvincial: "SI", contactName: "Martin Gomez", contactEmail: "martin@exportsur.com.ar", contactPhone: "+54 341 456-7891", creditLimit: "30000.00", paymentTermDays: 30, notes: "Empresa de Rosario", isActive: "true", createdAt: seedTimestamp },
    ];
    companies.forEach((c) => this.companies.set(c.id, c));

    // Create guests
    const guestSeedDate = new Date();
    const guests: Guest[] = [
      { id: "g1", codigo: "H-2025-0001", firstName: "Carlos", lastName: "García", email: "carlos.garcia@email.com", phone: "+54 11 4567-8901", documentType: "dni", documentNumber: "30456789", nationality: "Argentina", direccion: "Av. Corrientes 1234", localidad: "CABA", codigoPostal: "1043", fechaNacimiento: "1985-03-15", sexo: "masculino", segment: "LEISURE", cuilCuit: "20-30456789-3", companyId: null, fechaAlta: guestSeedDate, vehiculoPatente: "AB 123 CD", vehiculoMarca: "Toyota", vehiculoModelo: "Corolla", vehiculoColor: "Blanco" },
      { id: "g2", codigo: "H-2025-0002", firstName: "María", lastName: "López", email: "maria.lopez@email.com", phone: "+54 11 5678-9012", documentType: "dni", documentNumber: "28765432", nationality: "Argentina", direccion: "Calle Florida 567", localidad: "CABA", codigoPostal: "1005", fechaNacimiento: "1990-07-22", sexo: "femenino", segment: "LEISURE", cuilCuit: "27-28765432-4", companyId: null, fechaAlta: guestSeedDate, vehiculoPatente: null, vehiculoMarca: null, vehiculoModelo: null, vehiculoColor: null },
      { id: "g3", codigo: "H-2025-0003", firstName: "John", lastName: "Smith", email: "john.smith@email.com", phone: "+1 555 123-4567", documentType: "passport", documentNumber: "US123456", nationality: "Estados Unidos", direccion: "123 Main St", localidad: "New York", codigoPostal: "10001", fechaNacimiento: "1978-11-30", sexo: "masculino", segment: "LEISURE", cuilCuit: null, companyId: null, fechaAlta: guestSeedDate, vehiculoPatente: null, vehiculoMarca: null, vehiculoModelo: null, vehiculoColor: null },
      { id: "g4", codigo: "H-2025-0004", firstName: "Ana", lastName: "Martínez", email: "ana.martinez@email.com", phone: "+54 11 6789-0123", documentType: "dni", documentNumber: "35678901", nationality: "Argentina", direccion: "Av. Santa Fe 890", localidad: "CABA", codigoPostal: "1059", fechaNacimiento: "1995-01-10", sexo: "femenino", segment: "LEISURE", cuilCuit: "27-35678901-9", companyId: null, fechaAlta: guestSeedDate, vehiculoPatente: "XY 456 ZW", vehiculoMarca: "Ford", vehiculoModelo: "Focus", vehiculoColor: "Negro" },
      { id: "g5", codigo: "H-2025-0005", firstName: "Roberto", lastName: "Fernández", email: "roberto.f@email.com", phone: "+54 11 7890-1234", documentType: "dni", documentNumber: "32109876", nationality: "Argentina", direccion: "Callao 456", localidad: "CABA", codigoPostal: "1022", fechaNacimiento: "1982-05-20", sexo: "masculino", segment: "CORP", cuilCuit: "20-32109876-5", companyId: "comp1", fechaAlta: guestSeedDate, vehiculoPatente: null, vehiculoMarca: null, vehiculoModelo: null, vehiculoColor: null },
      { id: "g6", codigo: "H-2025-0006", firstName: "Laura", lastName: "Pérez", email: "laura.p@email.com", phone: "+54 11 8901-2345", documentType: "dni", documentNumber: "29876543", nationality: "Argentina", direccion: "Av. Libertador 123", localidad: "CABA", codigoPostal: "1426", fechaNacimiento: "1988-09-08", sexo: "femenino", segment: "LEISURE", cuilCuit: "27-29876543-2", companyId: null, fechaAlta: guestSeedDate, vehiculoPatente: null, vehiculoMarca: null, vehiculoModelo: null, vehiculoColor: null },
      { id: "g7", codigo: "H-2025-0007", firstName: "Diego", lastName: "Ramírez", email: "diego.r@email.com", phone: "+54 11 9012-3456", documentType: "dni", documentNumber: "31234567", nationality: "Argentina", direccion: "Av. Belgrano 456", localidad: "CABA", codigoPostal: "1092", fechaNacimiento: "1992-12-25", sexo: "masculino", segment: "LEISURE", cuilCuit: "20-31234567-8", companyId: null, fechaAlta: guestSeedDate, vehiculoPatente: "MN 789 OP", vehiculoMarca: "Chevrolet", vehiculoModelo: "Cruze", vehiculoColor: "Gris" },
      { id: "g8", codigo: "H-2025-0008", firstName: "Sophie", lastName: "Martin", email: "sophie.m@email.com", phone: "+33 1 2345 6789", documentType: "passport", documentNumber: "FR789012", nationality: "Francia", direccion: "15 Rue de Paris", localidad: "Lyon", codigoPostal: "69001", fechaNacimiento: "1987-04-18", sexo: "femenino", segment: "LEISURE", cuilCuit: null, companyId: null, fechaAlta: guestSeedDate, vehiculoPatente: null, vehiculoMarca: null, vehiculoModelo: null, vehiculoColor: null },
    ];
    guests.forEach((g) => this.guests.set(g.id, g));
    this.guestCounter = 8;

    // Create reservations with varied dates using real room IDs
    const today = new Date().toISOString().split("T")[0];
    const tomorrow = new Date(Date.now() + 86400000).toISOString().split("T")[0];
    const dayAfter = new Date(Date.now() + 2 * 86400000).toISOString().split("T")[0];
    const in3Days = new Date(Date.now() + 3 * 86400000).toISOString().split("T")[0];
    const in5Days = new Date(Date.now() + 5 * 86400000).toISOString().split("T")[0];
    const nextWeek = new Date(Date.now() + 7 * 86400000).toISOString().split("T")[0];
    const in10Days = new Date(Date.now() + 10 * 86400000).toISOString().split("T")[0];
    
    const reservations: Reservation[] = [
      { id: "res1", reservationCode: "RES-1001", guestId: "g1", companyId: null, roomTypeId: "rt2", roomId: "r201", ratePlanId: "rp2", checkInDate: today, checkOutDate: tomorrow, nights: 1, baseRatePerNight: "120.00", discountType: "none", discountValue: "0", finalRatePerNight: "120.00", totalRoomAmount: "120.00", status: "checked_in", source: "directo", otaChannelId: null, externalReservationId: null, numberOfGuests: 2, notes: null, createdAt: new Date(), lastModifiedBy: null },
      { id: "res2", reservationCode: "RES-1002", guestId: "g2", companyId: null, roomTypeId: "rt3", roomId: "r305", ratePlanId: "rp3", checkInDate: today, checkOutDate: nextWeek, nights: 7, baseRatePerNight: "180.00", discountType: "percent", discountValue: "10", finalRatePerNight: "162.00", totalRoomAmount: "1134.00", status: "checked_in", source: "web", otaChannelId: null, externalReservationId: null, numberOfGuests: 3, notes: "VIP - Aniversario", createdAt: new Date(), lastModifiedBy: null },
      { id: "res3", reservationCode: "RES-1003", guestId: "g3", companyId: null, roomTypeId: "rt3", roomId: "r505", ratePlanId: "rp3", checkInDate: today, checkOutDate: in3Days, nights: 3, baseRatePerNight: "180.00", discountType: "none", discountValue: "0", finalRatePerNight: "180.00", totalRoomAmount: "540.00", status: "checked_in", source: "booking", otaChannelId: null, externalReservationId: "BK-123456", numberOfGuests: 2, notes: null, createdAt: new Date(), lastModifiedBy: null },
      { id: "res4", reservationCode: "RES-1004", guestId: "g4", companyId: null, roomTypeId: "rt2", roomId: "r401", ratePlanId: "rp2", checkInDate: today, checkOutDate: dayAfter, nights: 2, baseRatePerNight: "120.00", discountType: "none", discountValue: "0", finalRatePerNight: "120.00", totalRoomAmount: "240.00", status: "checked_in", source: "directo", otaChannelId: null, externalReservationId: null, numberOfGuests: 2, notes: null, createdAt: new Date(), lastModifiedBy: null },
      { id: "res5", reservationCode: "RES-1005", guestId: "g5", companyId: "comp1", roomTypeId: "rt1", roomId: "r302", ratePlanId: "rp7", checkInDate: today, checkOutDate: tomorrow, nights: 1, baseRatePerNight: "75.00", discountType: "fixed", discountValue: "10", finalRatePerNight: "65.00", totalRoomAmount: "65.00", status: "confirmed", source: "empresa", otaChannelId: null, externalReservationId: null, numberOfGuests: 2, notes: null, createdAt: new Date(), lastModifiedBy: null },
      { id: "res6", reservationCode: "RES-1006", guestId: "g6", companyId: null, roomTypeId: "rt1", roomId: "r202", ratePlanId: "rp1", checkInDate: tomorrow, checkOutDate: in5Days, nights: 4, baseRatePerNight: "85.00", discountType: "none", discountValue: "0", finalRatePerNight: "85.00", totalRoomAmount: "340.00", status: "tentative", source: "telefono", otaChannelId: null, externalReservationId: null, numberOfGuests: 1, notes: "Llegada tardia", createdAt: new Date(), lastModifiedBy: null },
      { id: "res7", reservationCode: "RES-1007", guestId: "g7", companyId: null, roomTypeId: "rt2", roomId: "r307", ratePlanId: "rp2", checkInDate: dayAfter, checkOutDate: nextWeek, nights: 5, baseRatePerNight: "120.00", discountType: "none", discountValue: "0", finalRatePerNight: "120.00", totalRoomAmount: "600.00", status: "confirmed", source: "directo", otaChannelId: null, externalReservationId: null, numberOfGuests: 2, notes: null, createdAt: new Date(), lastModifiedBy: null },
      { id: "res8", reservationCode: "RES-1008", guestId: "g8", companyId: null, roomTypeId: "rt3", roomId: "r405", ratePlanId: "rp3", checkInDate: in3Days, checkOutDate: in10Days, nights: 7, baseRatePerNight: "180.00", discountType: "none", discountValue: "0", finalRatePerNight: "180.00", totalRoomAmount: "1260.00", status: "pending", source: "expedia", otaChannelId: null, externalReservationId: "EX-789012", numberOfGuests: 2, notes: "Turista frances", createdAt: new Date(), lastModifiedBy: null },
    ];
    reservations.forEach((r) => this.reservations.set(r.id, r));
    
    // Update room statuses for checked-in reservations
    const room201 = this.rooms.get("r201");
    if (room201) this.rooms.set("r201", { ...room201, status: "occupied" });
    const room305 = this.rooms.get("r305");
    if (room305) this.rooms.set("r305", { ...room305, status: "occupied" });
    const room505 = this.rooms.get("r505");
    if (room505) this.rooms.set("r505", { ...room505, status: "occupied" });
    const room401 = this.rooms.get("r401");
    if (room401) this.rooms.set("r401", { ...room401, status: "occupied" });

    // Create sample charges for checked-in reservations
    const charges: Charge[] = [
      { id: "ch1", reservationId: "res1", description: "Alojamiento - 1 noche", amount: "120.00", date: today, category: "room", createdBy: null },
      { id: "ch2", reservationId: "res2", description: "Alojamiento - 7 noches", amount: "1134.00", date: today, category: "room", createdBy: null },
      { id: "ch2b", reservationId: "res2", description: "Minibar", amount: "25.00", date: today, category: "minibar", createdBy: null },
      { id: "ch3", reservationId: "res3", description: "Alojamiento - 3 noches", amount: "540.00", date: today, category: "room", createdBy: null },
      { id: "ch3b", reservationId: "res3", description: "Restaurante - Cena", amount: "85.00", date: today, category: "restaurant", createdBy: null },
      { id: "ch4", reservationId: "res4", description: "Alojamiento - 2 noches", amount: "240.00", date: today, category: "room", createdBy: null },
    ];
    charges.forEach((c) => this.charges.set(c.id, c));

    this.reservationCounter = 1008;

    // Restaurant Areas - Dos secciones del plano + areas sin mesas
    const restaurantAreas: RestaurantArea[] = [
      { id: "area1", name: "Sector Bodega (Mesas 1-18)", areaType: "indoor", capacity: 72, hasTables: "true", isActive: "true", notes: "Mesas cuadradas" },
      { id: "area2", name: "Sector Moneda (Mesas 19-32)", areaType: "indoor", capacity: 56, hasTables: "true", isActive: "true", notes: "Mesas redondas" },
      { id: "area-rs", name: "Room Service", areaType: "private", capacity: 0, hasTables: "false", isActive: "true", notes: null },
      { id: "area-delivery", name: "Delivery", areaType: "private", capacity: 0, hasTables: "false", isActive: "true", notes: null },
      { id: "area-solarium", name: "Solarium", areaType: "outdoor", capacity: 0, hasTables: "false", isActive: "true", notes: null },
      { id: "area-spa", name: "SPA", areaType: "private", capacity: 0, hasTables: "false", isActive: "true", notes: null },
    ];
    restaurantAreas.forEach((a) => this.restaurantAreas.set(a.id, a));

    // Restaurant Tables - Plano Justo - Seccion A (Mesas 1-18)
    // Layout del plano:
    // Fila 1: 18, 17, 15
    // Fila 2: 8, 6
    // Fila 3: 1, 2, 3
    // Fila 4: 16, 14 | 4, 5
    // Fila 5: 7, 9
    // Fila 6: 10, 13, 12, 11
    const restaurantTables: RestaurantTable[] = [
      // Seccion A - Mesas 1-18 (cuadradas)
      { id: "t1", tableNumber: "1", areaId: "area1", capacity: 4, shape: "square", status: "available", positionX: 0, positionY: 2, isActive: "true" },
      { id: "t2", tableNumber: "2", areaId: "area1", capacity: 4, shape: "square", status: "available", positionX: 1, positionY: 2, isActive: "true" },
      { id: "t3", tableNumber: "3", areaId: "area1", capacity: 4, shape: "square", status: "available", positionX: 2, positionY: 2, isActive: "true" },
      { id: "t4", tableNumber: "4", areaId: "area1", capacity: 4, shape: "square", status: "available", positionX: 2, positionY: 3, isActive: "true" },
      { id: "t5", tableNumber: "5", areaId: "area1", capacity: 4, shape: "square", status: "available", positionX: 3, positionY: 3, isActive: "true" },
      { id: "t6", tableNumber: "6", areaId: "area1", capacity: 4, shape: "square", status: "available", positionX: 1, positionY: 1, isActive: "true" },
      { id: "t7", tableNumber: "7", areaId: "area1", capacity: 4, shape: "square", status: "available", positionX: 0, positionY: 4, isActive: "true" },
      { id: "t8", tableNumber: "8", areaId: "area1", capacity: 4, shape: "square", status: "available", positionX: 0, positionY: 1, isActive: "true" },
      { id: "t9", tableNumber: "9", areaId: "area1", capacity: 4, shape: "square", status: "available", positionX: 1, positionY: 4, isActive: "true" },
      { id: "t10", tableNumber: "10", areaId: "area1", capacity: 4, shape: "square", status: "available", positionX: 0, positionY: 5, isActive: "true" },
      { id: "t11", tableNumber: "11", areaId: "area1", capacity: 4, shape: "square", status: "available", positionX: 3, positionY: 5, isActive: "true" },
      { id: "t12", tableNumber: "12", areaId: "area1", capacity: 4, shape: "square", status: "available", positionX: 2, positionY: 5, isActive: "true" },
      { id: "t13", tableNumber: "13", areaId: "area1", capacity: 4, shape: "square", status: "available", positionX: 1, positionY: 5, isActive: "true" },
      { id: "t14", tableNumber: "14", areaId: "area1", capacity: 4, shape: "square", status: "available", positionX: 1, positionY: 3, isActive: "true" },
      { id: "t15", tableNumber: "15", areaId: "area1", capacity: 4, shape: "square", status: "available", positionX: 2, positionY: 0, isActive: "true" },
      { id: "t16", tableNumber: "16", areaId: "area1", capacity: 4, shape: "square", status: "available", positionX: 0, positionY: 3, isActive: "true" },
      { id: "t17", tableNumber: "17", areaId: "area1", capacity: 4, shape: "square", status: "available", positionX: 1, positionY: 0, isActive: "true" },
      { id: "t18", tableNumber: "18", areaId: "area1", capacity: 4, shape: "square", status: "available", positionX: 0, positionY: 0, isActive: "true" },
      // Seccion B - Mesas 19-32 (redondas)
      // Layout del plano:
      // Fila 1: 20
      // Fila 2: 32, 29, 30, 31
      // Fila 3: 26, 27, 28
      // Fila 4: 23, 24, 25
      // Fila 5: 21, 22
      // Fila 6: 19
      { id: "t19", tableNumber: "19", areaId: "area2", capacity: 4, shape: "round", status: "available", positionX: 0, positionY: 5, isActive: "true" },
      { id: "t20", tableNumber: "20", areaId: "area2", capacity: 4, shape: "round", status: "available", positionX: 0, positionY: 0, isActive: "true" },
      { id: "t21", tableNumber: "21", areaId: "area2", capacity: 4, shape: "round", status: "available", positionX: 0, positionY: 4, isActive: "true" },
      { id: "t22", tableNumber: "22", areaId: "area2", capacity: 4, shape: "round", status: "available", positionX: 1, positionY: 4, isActive: "true" },
      { id: "t23", tableNumber: "23", areaId: "area2", capacity: 4, shape: "round", status: "available", positionX: 0, positionY: 3, isActive: "true" },
      { id: "t24", tableNumber: "24", areaId: "area2", capacity: 4, shape: "round", status: "available", positionX: 1, positionY: 3, isActive: "true" },
      { id: "t25", tableNumber: "25", areaId: "area2", capacity: 4, shape: "round", status: "available", positionX: 2, positionY: 3, isActive: "true" },
      { id: "t26", tableNumber: "26", areaId: "area2", capacity: 4, shape: "round", status: "available", positionX: 0, positionY: 2, isActive: "true" },
      { id: "t27", tableNumber: "27", areaId: "area2", capacity: 4, shape: "round", status: "available", positionX: 1, positionY: 2, isActive: "true" },
      { id: "t28", tableNumber: "28", areaId: "area2", capacity: 4, shape: "round", status: "available", positionX: 2, positionY: 2, isActive: "true" },
      { id: "t29", tableNumber: "29", areaId: "area2", capacity: 4, shape: "round", status: "available", positionX: 1, positionY: 1, isActive: "true" },
      { id: "t30", tableNumber: "30", areaId: "area2", capacity: 4, shape: "round", status: "available", positionX: 2, positionY: 1, isActive: "true" },
      { id: "t31", tableNumber: "31", areaId: "area2", capacity: 4, shape: "round", status: "available", positionX: 3, positionY: 1, isActive: "true" },
      { id: "t32", tableNumber: "32", areaId: "area2", capacity: 4, shape: "round", status: "available", positionX: 0, positionY: 1, isActive: "true" },
    ];
    restaurantTables.forEach((t) => this.restaurantTables.set(t.id, t));

    // Menu Categories (orden: 1-Bebidas sin alcohol, 2-Bebidas con alcohol, 3-Entradas, 4-Principales, 5-Postres)
    const menuCategories: MenuCategory[] = [
      { id: "mc5", name: "Bebidas sin Alcohol", description: "Aguas, gaseosas y jugos", displayOrder: 1, isActive: "true" },
      { id: "mc6", name: "Bebidas con Alcohol", description: "Vinos, cervezas y cocktails", displayOrder: 2, isActive: "true" },
      { id: "mc1", name: "Entradas", description: "Para comenzar", displayOrder: 3, isActive: "true" },
      { id: "mc2", name: "Platos Principales", description: "Carnes, pastas y pescados", displayOrder: 4, isActive: "true" },
      { id: "mc3", name: "Postres", description: "Dulces y helados", displayOrder: 5, isActive: "true" },
    ];
    menuCategories.forEach((c) => this.menuCategories.set(c.id, c));

    // Menu Items
    const menuItems: MenuItem[] = [
      { id: "mi1", categoryId: "mc1", name: "Empanadas (3 unidades)", description: "Carne cortada a cuchillo", price: "3500.00", preparationTime: 10, isAvailable: "true", isActive: "true", allergens: ["gluten"], displayOrder: 1 },
      { id: "mi2", categoryId: "mc1", name: "Provoleta", description: "Queso provolone a la plancha con oregano", price: "4200.00", preparationTime: 12, isAvailable: "true", isActive: "true", allergens: ["lacteos"], displayOrder: 2 },
      { id: "mi3", categoryId: "mc1", name: "Tabla de Fiambres", description: "Jamon crudo, salamín, quesos", price: "6500.00", preparationTime: 8, isAvailable: "true", isActive: "true", allergens: ["lacteos"], displayOrder: 3 },
      { id: "mi4", categoryId: "mc2", name: "Bife de Chorizo", description: "400g, con guarnicion a eleccion", price: "12500.00", preparationTime: 25, isAvailable: "true", isActive: "true", allergens: null, displayOrder: 1 },
      { id: "mi5", categoryId: "mc2", name: "Salmon Grille", description: "Con vegetales de estacion", price: "14000.00", preparationTime: 20, isAvailable: "true", isActive: "true", allergens: ["pescado"], displayOrder: 2 },
      { id: "mi6", categoryId: "mc2", name: "Ravioles de Ricota", description: "Con salsa bolognesa o filetto", price: "8500.00", preparationTime: 15, isAvailable: "true", isActive: "true", allergens: ["gluten", "lacteos"], displayOrder: 3 },
      { id: "mi7", categoryId: "mc2", name: "Pollo a la Parrilla", description: "Medio pollo con ensalada", price: "7500.00", preparationTime: 30, isAvailable: "true", isActive: "true", allergens: null, displayOrder: 4 },
      { id: "mi8", categoryId: "mc3", name: "Flan con Dulce de Leche", description: "Casero", price: "2800.00", preparationTime: 5, isAvailable: "true", isActive: "true", allergens: ["lacteos", "huevo"], displayOrder: 1 },
      { id: "mi9", categoryId: "mc3", name: "Helado (3 bochas)", description: "Sabores a eleccion", price: "3200.00", preparationTime: 3, isAvailable: "true", isActive: "true", allergens: ["lacteos"], displayOrder: 2 },
      { id: "mi10", categoryId: "mc3", name: "Tiramisu", description: "Postre italiano clasico", price: "4500.00", preparationTime: 5, isAvailable: "true", isActive: "true", allergens: ["gluten", "lacteos", "huevo"], displayOrder: 3 },
      { id: "mi11", categoryId: "mc5", name: "Agua Mineral", description: "Con o sin gas 500ml", price: "1200.00", preparationTime: 1, isAvailable: "true", isActive: "true", allergens: null, displayOrder: 1 },
      { id: "mi12", categoryId: "mc5", name: "Gaseosa", description: "Coca-Cola, Sprite, Fanta", price: "1500.00", preparationTime: 1, isAvailable: "true", isActive: "true", allergens: null, displayOrder: 2 },
      { id: "mi15", categoryId: "mc5", name: "Jugo de Naranja", description: "Exprimido natural", price: "1800.00", preparationTime: 3, isAvailable: "true", isActive: "true", allergens: null, displayOrder: 3 },
      { id: "mi13", categoryId: "mc6", name: "Copa de Vino Malbec", description: "Bodega Luigi Bosca", price: "3500.00", preparationTime: 2, isAvailable: "true", isActive: "true", allergens: null, displayOrder: 1 },
      { id: "mi14", categoryId: "mc6", name: "Cerveza Artesanal", description: "Pinta 500ml", price: "2800.00", preparationTime: 2, isAvailable: "true", isActive: "true", allergens: ["gluten"], displayOrder: 2 },
      { id: "mi16", categoryId: "mc6", name: "Fernet con Cola", description: "Branca con Coca-Cola", price: "3000.00", preparationTime: 3, isAvailable: "true", isActive: "true", allergens: null, displayOrder: 3 },
    ];
    menuItems.forEach((i) => this.menuItems.set(i.id, i));

    // Inventory Categories
    const itemCategories: ItemCategory[] = [
      { id: "ic1", name: "Alimentos", description: "Productos alimenticios", parentId: null, isActive: "true" },
      { id: "ic2", name: "Bebidas", description: "Bebidas alcoholicas y sin alcohol", parentId: null, isActive: "true" },
      { id: "ic3", name: "Limpieza", description: "Productos de limpieza", parentId: null, isActive: "true" },
      { id: "ic4", name: "Amenities", description: "Articulos de tocador para huespedes", parentId: null, isActive: "true" },
      { id: "ic5", name: "Manteleria", description: "Sabanas, toallas, manteles", parentId: null, isActive: "true" },
    ];
    itemCategories.forEach((c) => this.itemCategories.set(c.id, c));

    // Suppliers
    const suppliers: Supplier[] = [
      { id: "sup1", name: "Distribuidora Norte S.A.", contactName: "Juan Perez", phone: "+54 343 456-7890", email: "ventas@distnorte.com", address: "Ruta 14 Km 5", cuit: "30-71234567-8", paymentTermDays: 30, notes: null, isActive: "true" },
      { id: "sup2", name: "Bebidas Premium", contactName: "Maria Garcia", phone: "+54 343 567-8901", email: "pedidos@bebidaspremium.com", address: "Av. Ramirez 1500", cuit: "30-70987654-3", paymentTermDays: 15, notes: "Solo bebidas", isActive: "true" },
      { id: "sup3", name: "Limpieza Total S.R.L.", contactName: "Carlos Lopez", phone: "+54 343 678-9012", email: "ventas@limpiezatotal.com", address: "Zona Industrial", cuit: "30-65432198-7", paymentTermDays: 30, notes: null, isActive: "true" },
    ];
    suppliers.forEach((s) => this.suppliers.set(s.id, s));

    // Inventory Items (some items intentionally below minStock to show low stock alerts)
    const inventoryItems: InventoryItem[] = [
      { id: "inv1", sku: "ALI-001", name: "Cafe en grano", description: "Cafe colombiano premium", categoryId: "ic1", supplierId: "sup1", unit: "kg", costPrice: "8500.00", minStock: 5, maxStock: 20, currentStock: 12, location: "Deposito A", isActive: "true" },
      { id: "inv2", sku: "ALI-002", name: "Azucar", description: "Azucar comun", categoryId: "ic1", supplierId: "sup1", unit: "kg", costPrice: "1200.00", minStock: 10, maxStock: 50, currentStock: 25, location: "Deposito A", isActive: "true" },
      { id: "inv3", sku: "BEB-001", name: "Agua Mineral 500ml", description: "Pack x24", categoryId: "ic2", supplierId: "sup2", unit: "caja", costPrice: "4800.00", minStock: 10, maxStock: 50, currentStock: 8, location: "Deposito B", isActive: "true" },
      { id: "inv4", sku: "BEB-002", name: "Coca-Cola 500ml", description: "Pack x24", categoryId: "ic2", supplierId: "sup2", unit: "caja", costPrice: "7200.00", minStock: 8, maxStock: 40, currentStock: 15, location: "Deposito B", isActive: "true" },
      { id: "inv5", sku: "BEB-003", name: "Vino Malbec Reserva", description: "Bodega Luigi Bosca", categoryId: "ic2", supplierId: "sup2", unit: "unidad", costPrice: "12000.00", minStock: 12, maxStock: 48, currentStock: 24, location: "Bodega", isActive: "true" },
      { id: "inv6", sku: "LIM-001", name: "Detergente Industrial", description: "Bidon 5L", categoryId: "ic3", supplierId: "sup3", unit: "unidad", costPrice: "3500.00", minStock: 5, maxStock: 20, currentStock: 3, location: "Deposito C", isActive: "true" },
      { id: "inv7", sku: "LIM-002", name: "Desinfectante", description: "Bidon 5L", categoryId: "ic3", supplierId: "sup3", unit: "unidad", costPrice: "4200.00", minStock: 5, maxStock: 20, currentStock: 8, location: "Deposito C", isActive: "true" },
      { id: "inv8", sku: "AME-001", name: "Shampoo Individual", description: "Sachet 30ml x100", categoryId: "ic4", supplierId: "sup3", unit: "paquete", costPrice: "6500.00", minStock: 10, maxStock: 50, currentStock: 5, location: "Deposito D", isActive: "true" },
      { id: "inv9", sku: "AME-002", name: "Jabon Individual", description: "Pastilla 20g x100", categoryId: "ic4", supplierId: "sup3", unit: "paquete", costPrice: "5000.00", minStock: 10, maxStock: 50, currentStock: 35, location: "Deposito D", isActive: "true" },
      { id: "inv10", sku: "MAN-001", name: "Toallas Blancas", description: "Toalla 70x140cm", categoryId: "ic5", supplierId: "sup1", unit: "unidad", costPrice: "4500.00", minStock: 50, maxStock: 200, currentStock: 120, location: "Lavanderia", isActive: "true" },
    ];
    inventoryItems.forEach((i) => this.inventoryItems.set(i.id, i));

    // SPA Cabins (Gabinetes)
    const spaCabins: SpaCabin[] = [
      { id: "cab1", name: "Cabina 1 - Masajes", description: "Cabina para masajes relajantes y terapeuticos", isActive: "true" },
      { id: "cab2", name: "Cabina 2 - Masajes", description: "Cabina para masajes con aromaterapia", isActive: "true" },
      { id: "cab3", name: "Cabina 3 - Faciales", description: "Cabina especializada en tratamientos faciales", isActive: "true" },
      { id: "cab4", name: "Cabina 4 - Corporales", description: "Cabina para tratamientos corporales", isActive: "true" },
      { id: "cab5", name: "Cabina 5 - VIP", description: "Cabina VIP para tratamientos premium", isActive: "true" },
      { id: "cab6", name: "Cabina 6 - Parejas", description: "Cabina doble para tratamientos en pareja", isActive: "true" },
    ];
    spaCabins.forEach((c) => this.spaCabins.set(c.id, c));

    // SPA Treatment Categories
    const spaTreatmentCategories: SpaTreatmentCategory[] = [
      { id: "stc1", name: "Masajes", description: "Masajes relajantes y terapeuticos", sortOrder: 1 },
      { id: "stc2", name: "Faciales", description: "Tratamientos de limpieza y rejuvenecimiento facial", sortOrder: 2 },
      { id: "stc3", name: "Corporales", description: "Tratamientos corporales de embellecimiento", sortOrder: 3 },
      { id: "stc4", name: "Circuitos", description: "Circuitos de aguas termales", sortOrder: 4 },
      { id: "stc5", name: "Especiales", description: "Tratamientos premium y paquetes especiales", sortOrder: 5 },
    ];
    spaTreatmentCategories.forEach((c) => this.spaTreatmentCategories.set(c.id, c));

    // SPA Treatments
    const spaTreatments: SpaTreatment[] = [
      // Masajes
      { id: "st1", categoryId: "stc1", name: "Masaje Relajante", description: "Masaje corporal con aceites esenciales", durationMinutes: 60, price: "15000.00", isActive: "true" },
      { id: "st2", categoryId: "stc1", name: "Masaje Descontracturante", description: "Masaje profundo para aliviar tensiones musculares", durationMinutes: 60, price: "18000.00", isActive: "true" },
      { id: "st3", categoryId: "stc1", name: "Masaje con Piedras Calientes", description: "Terapia con piedras volcanicas calientes", durationMinutes: 90, price: "25000.00", isActive: "true" },
      { id: "st4", categoryId: "stc1", name: "Reflexologia Podal", description: "Masaje de pies con tecnica reflexologica", durationMinutes: 45, price: "12000.00", isActive: "true" },
      // Faciales
      { id: "st5", categoryId: "stc2", name: "Limpieza Facial Profunda", description: "Limpieza e hidratacion profunda del rostro", durationMinutes: 60, price: "14000.00", isActive: "true" },
      { id: "st6", categoryId: "stc2", name: "Tratamiento Antiage", description: "Tratamiento rejuvenecedor con colageno", durationMinutes: 75, price: "22000.00", isActive: "true" },
      { id: "st7", categoryId: "stc2", name: "Mascara de Oro", description: "Mascara facial premium con particulas de oro", durationMinutes: 60, price: "28000.00", isActive: "true" },
      // Corporales
      { id: "st8", categoryId: "stc3", name: "Exfoliacion Corporal", description: "Exfoliacion con sales marinas", durationMinutes: 45, price: "13000.00", isActive: "true" },
      { id: "st9", categoryId: "stc3", name: "Envoltura de Chocolate", description: "Tratamiento hidratante con cacao", durationMinutes: 60, price: "18000.00", isActive: "true" },
      { id: "st10", categoryId: "stc3", name: "Reductor Modelador", description: "Tratamiento reductivo con vendas frias", durationMinutes: 90, price: "24000.00", isActive: "true" },
      // Circuitos
      { id: "st11", categoryId: "stc4", name: "Circuito de Aguas", description: "Acceso a piscinas termales, sauna y jacuzzi", durationMinutes: 120, price: "10000.00", isActive: "true" },
      { id: "st12", categoryId: "stc4", name: "Circuito Premium", description: "Circuito de aguas + te y frutas", durationMinutes: 150, price: "15000.00", isActive: "true" },
      // Especiales
      { id: "st13", categoryId: "stc5", name: "Dia de Spa Completo", description: "Circuito + masaje + facial + almuerzo", durationMinutes: 300, price: "45000.00", isActive: "true" },
      { id: "st14", categoryId: "stc5", name: "Experiencia en Pareja", description: "Circuito + masaje para dos personas", durationMinutes: 180, price: "55000.00", isActive: "true" },
    ];
    spaTreatments.forEach((t) => this.spaTreatments.set(t.id, t));

    // Event Rooms (5 salones de eventos)
    const eventRooms: EventRoom[] = [
      { id: "er1", name: "Salon Parana", capacity: 100, status: "available", description: "Salon principal con vista al rio", amenities: ["projector", "audio", "wifi"], isActive: "true" },
      { id: "er2", name: "Salon Victoria", capacity: 60, status: "available", description: "Salon ejecutivo para reuniones", amenities: ["projector", "wifi", "whiteboard"], isActive: "true" },
      { id: "er3", name: "Salon Diamante", capacity: 40, status: "available", description: "Sala de conferencias", amenities: ["projector", "audio", "wifi", "videoconference"], isActive: "true" },
      { id: "er4", name: "Salon Esmeralda", capacity: 30, status: "available", description: "Sala de reuniones ejecutivas", amenities: ["projector", "wifi"], isActive: "true" },
      { id: "er5", name: "Terraza Eventos", capacity: 150, status: "available", description: "Espacio al aire libre para eventos sociales", amenities: ["audio", "lighting"], isActive: "true" },
    ];
    eventRooms.forEach((r) => this.eventRooms.set(r.id, r));

    // Event Charge Types (tipos de cargo predefinidos)
    const eventChargeTypes: EventChargeType[] = [
      { id: "ect1", code: "CB1", name: "Coffee Break 1", defaultPrice: "8500.00", isActive: "true" },
      { id: "ect2", code: "CB2", name: "Coffee Break 2", defaultPrice: "12000.00", isActive: "true" },
      { id: "ect3", code: "CB3", name: "Coffee Break 3", defaultPrice: "15000.00", isActive: "true" },
      { id: "ect4", code: "CENA", name: "Cena Ejecutiva", defaultPrice: "35000.00", isActive: "true" },
      { id: "ect5", code: "COCKTAIL", name: "Cocktail", defaultPrice: "25000.00", isActive: "true" },
      { id: "ect6", code: "SOC1", name: "Social 1", defaultPrice: "18000.00", isActive: "true" },
      { id: "ect7", code: "SOC2", name: "Social 2", defaultPrice: "28000.00", isActive: "true" },
      { id: "ect8", code: "SOC3", name: "Social 3", defaultPrice: "38000.00", isActive: "true" },
    ];
    eventChargeTypes.forEach((ct) => this.eventChargeTypes.set(ct.id, ct));

    // Maintenance Staff (Personal de Mantenimiento)
    const maintenanceStaffData: MaintenanceStaff[] = [
      { id: "ms1", name: "Carlos Rodriguez", phone: "+54 343 456-7890", email: "carlos.rodriguez@maransuites.com", specialty: "Plomeria y Electricidad", isActive: "true" },
      { id: "ms2", name: "Miguel Fernandez", phone: "+54 343 456-7891", email: "miguel.fernandez@maransuites.com", specialty: "Climatizacion", isActive: "true" },
      { id: "ms3", name: "Jorge Martinez", phone: "+54 343 456-7892", email: "jorge.martinez@maransuites.com", specialty: "Mobiliario y Carpinteria", isActive: "true" },
      { id: "ms4", name: "Roberto Sanchez", phone: "+54 343 456-7893", email: "roberto.sanchez@maransuites.com", specialty: "General", isActive: "true" },
    ];
    maintenanceStaffData.forEach((s) => this.maintenanceStaff.set(s.id, s));

    // System Users (Usuarios del Sistema)
    const now = new Date();
    const systemUsersData: SystemUser[] = [
      { id: "su1", username: "admin", email: "admin@maransuites.com", fullName: "Administrador Sistema", role: "admin" as SystemUserRole, department: "Sistemas", phone: "+54 343 400-0001", isActive: "true", lastLogin: now, createdAt: now },
      { id: "su2", username: "gerencia", email: "gerencia@maransuites.com", fullName: "Gerente General", role: "manager" as SystemUserRole, department: "Gerencia", phone: "+54 343 400-0002", isActive: "true", lastLogin: null, createdAt: now },
      { id: "su3", username: "recepcion1", email: "recepcion1@maransuites.com", fullName: "Maria Garcia", role: "reception" as SystemUserRole, department: "Recepcion", phone: "+54 343 400-0003", isActive: "true", lastLogin: now, createdAt: now },
      { id: "su4", username: "housekeeping1", email: "housekeeping@maransuites.com", fullName: "Ana Martinez", role: "housekeeping" as SystemUserRole, department: "Housekeeping", phone: "+54 343 400-0004", isActive: "true", lastLogin: null, createdAt: now },
      { id: "su5", username: "restaurante1", email: "restaurante@maransuites.com", fullName: "Carlos Lopez", role: "restaurant" as SystemUserRole, department: "Restaurante", phone: "+54 343 400-0005", isActive: "true", lastLogin: null, createdAt: now },
      { id: "su6", username: "spa1", email: "spa@maransuites.com", fullName: "Laura Fernandez", role: "spa" as SystemUserRole, department: "SPA", phone: "+54 343 400-0006", isActive: "true", lastLogin: null, createdAt: now },
    ];
    systemUsersData.forEach((u) => this.systemUsers.set(u.id, u));

    // System Settings (Configuracion del Sistema)
    const systemSettingsData: SystemSetting[] = [
      { id: "ss1", key: "hotel_name", value: "Maran Suites & Towers", category: "general", description: "Nombre del hotel", updatedAt: now, updatedBy: "admin" },
      { id: "ss2", key: "hotel_address", value: "Alameda de la Federacion 343, Parana, Entre Rios", category: "general", description: "Direccion del hotel", updatedAt: now, updatedBy: "admin" },
      { id: "ss3", key: "hotel_phone", value: "+54 343 400-0000", category: "general", description: "Telefono principal", updatedAt: now, updatedBy: "admin" },
      { id: "ss4", key: "hotel_email", value: "info@maransuites.com", category: "general", description: "Email de contacto", updatedAt: now, updatedBy: "admin" },
      { id: "ss5", key: "check_in_time", value: "15:00", category: "reservations", description: "Hora de check-in", updatedAt: now, updatedBy: "admin" },
      { id: "ss6", key: "check_out_time", value: "11:00", category: "reservations", description: "Hora de check-out", updatedAt: now, updatedBy: "admin" },
      { id: "ss7", key: "default_currency", value: "ARS", category: "billing", description: "Moneda predeterminada", updatedAt: now, updatedBy: "admin" },
      { id: "ss8", key: "tax_rate", value: "21", category: "billing", description: "Tasa de IVA (%)", updatedAt: now, updatedBy: "admin" },
      { id: "ss9", key: "breakfast_included", value: "true", category: "amenities", description: "Desayuno incluido por defecto", updatedAt: now, updatedBy: "admin" },
      { id: "ss10", key: "wifi_password", value: "MaranGuest2025", category: "amenities", description: "Contrasena WiFi huespedes", updatedAt: now, updatedBy: "admin" },
    ];
    systemSettingsData.forEach((s) => this.systemSettings.set(s.id, s));

    // Sample Audit Logs
    const auditLogsData: AuditLog[] = [
      { id: "al1", userId: "su1", userName: "Administrador Sistema", action: "login" as AuditAction, module: "system", entityType: null, entityId: null, description: "Inicio de sesion", details: null, ipAddress: "192.168.1.1", timestamp: now },
      { id: "al2", userId: "su3", userName: "Maria Garcia", action: "create" as AuditAction, module: "reservations", entityType: "reservation", entityId: "r1001", description: "Nueva reserva creada", details: "Huesped: Juan Perez, Habitacion 301", ipAddress: "192.168.1.10", timestamp: now },
    ];
    auditLogsData.forEach((l) => this.auditLogs.set(l.id, l));

    // Seed chatbot notifications
    const seedNow = new Date();
    const chatbotNotifications: SystemNotification[] = [
      {
        id: randomUUID(), type: "chatbot_housekeeping" as any, title: "Solicitud de Carlos García - Hab. 201",
        message: "Solicita toallas adicionales para la habitación", targetArea: "housekeeping" as any,
        relatedEntityType: "room", relatedEntityId: "201", isRead: false, readAt: null, readBy: null,
        priority: "normal" as any, createdAt: new Date(seedNow.getTime() - 45 * 60000),
      },
      {
        id: randomUUID(), type: "chatbot_restaurant" as any, title: "Solicitud de María López - Hab. 305",
        message: "Consulta horario de desayuno para mañana y si tienen opciones sin gluten",
        targetArea: "restaurant" as any, relatedEntityType: "room", relatedEntityId: "305",
        isRead: false, readAt: null, readBy: null, priority: "normal" as any,
        createdAt: new Date(seedNow.getTime() - 30 * 60000),
      },
      {
        id: randomUUID(), type: "chatbot_maintenance" as any, title: "Solicitud de John Smith - Hab. 505",
        message: "El aire acondicionado no enfría correctamente, la habitación está muy calurosa",
        targetArea: "maintenance" as any, relatedEntityType: "room", relatedEntityId: "505",
        isRead: false, readAt: null, readBy: null, priority: "urgent" as any,
        createdAt: new Date(seedNow.getTime() - 15 * 60000),
      },
      {
        id: randomUUID(), type: "chatbot_spa" as any, title: "Solicitud de Ana Martínez - Hab. 401",
        message: "Quiere reservar un masaje relajante para las 16:00 de hoy",
        targetArea: "spa" as any, relatedEntityType: "room", relatedEntityId: "401",
        isRead: false, readAt: null, readBy: null, priority: "normal" as any,
        createdAt: new Date(seedNow.getTime() - 10 * 60000),
      },
      {
        id: randomUUID(), type: "chatbot_housekeeping" as any, title: "Solicitud de Diego Ramírez - Hab. 307",
        message: "Necesita almohada extra y una manta adicional por favor",
        targetArea: "housekeeping" as any, relatedEntityType: "room", relatedEntityId: "307",
        isRead: true, readAt: new Date(seedNow.getTime() - 60 * 60000), readBy: "reception",
        priority: "normal" as any, createdAt: new Date(seedNow.getTime() - 120 * 60000),
      },
      {
        id: randomUUID(), type: "chatbot_request" as any, title: "Solicitud de Sophie Martin - Hab. 405",
        message: "Consulta sobre el horario de check-out y si es posible late check-out",
        targetArea: "reception" as any, relatedEntityType: "room", relatedEntityId: "405",
        isRead: true, readAt: new Date(seedNow.getTime() - 90 * 60000), readBy: "reception",
        priority: "normal" as any, createdAt: new Date(seedNow.getTime() - 180 * 60000),
      },
    ];
    chatbotNotifications.forEach((n) => this.notificationsMap.set(n.id, n));

    const prefNow = new Date();
    const seedPreferences: GuestPreference[] = [
      { id: randomUUID(), guestId: "g1", category: "alimentacion", subcategory: "alergias", title: "Alergia al maní", description: "Alergia severa al maní y derivados. Riesgo de anafilaxia.", isActive: true, priority: "critical", visibleTo: ["all"], recordedBy: "Recepción", sourceStay: null, createdAt: new Date(prefNow.getTime() - 30 * 86400000), updatedAt: new Date(prefNow.getTime() - 30 * 86400000) },
      { id: randomUUID(), guestId: "g1", category: "habitacion", subcategory: "ubicacion", title: "Piso alto", description: "Prefiere habitaciones en pisos altos con vista a la ciudad", isActive: true, priority: "normal", visibleTo: ["reception"], recordedBy: "Recepción", sourceStay: null, createdAt: new Date(prefNow.getTime() - 30 * 86400000), updatedAt: new Date(prefNow.getTime() - 30 * 86400000) },
      { id: randomUUID(), guestId: "g1", category: "amenities", subcategory: "almohadas", title: "Almohadas extra", description: "Solicita 2 almohadas adicionales firmes", isActive: true, priority: "normal", visibleTo: ["housekeeping"], recordedBy: "Housekeeping", sourceStay: null, createdAt: new Date(prefNow.getTime() - 20 * 86400000), updatedAt: new Date(prefNow.getTime() - 20 * 86400000) },
      { id: randomUUID(), guestId: "g2", category: "fecha_especial", subcategory: "cumpleanos", title: "Cumpleaños 22 de julio", description: "Fecha de nacimiento: 22/07. Huésped frecuente, considerar detalle especial.", isActive: true, priority: "high", visibleTo: ["all"], recordedBy: "Recepción", sourceStay: null, createdAt: new Date(prefNow.getTime() - 60 * 86400000), updatedAt: new Date(prefNow.getTime() - 60 * 86400000) },
      { id: randomUUID(), guestId: "g2", category: "alimentacion", subcategory: "dieta", title: "Vegetariana", description: "Dieta vegetariana estricta. No consume carnes ni pescados.", isActive: true, priority: "high", visibleTo: ["restaurant", "reception"], recordedBy: "Restaurant", sourceStay: null, createdAt: new Date(prefNow.getTime() - 45 * 86400000), updatedAt: new Date(prefNow.getTime() - 45 * 86400000) },
      { id: randomUUID(), guestId: "g3", category: "habitacion", subcategory: "almohadas", title: "Almohada hipoalergénica", description: "Requiere almohadas hipoalergénicas por sensibilidad", isActive: true, priority: "high", visibleTo: ["housekeeping"], recordedBy: "Recepción", sourceStay: null, createdAt: new Date(prefNow.getTime() - 15 * 86400000), updatedAt: new Date(prefNow.getTime() - 15 * 86400000) },
      { id: randomUUID(), guestId: "g3", category: "servicio", subcategory: "idioma", title: "Idioma inglés", description: "Prefiere comunicación en inglés", isActive: true, priority: "normal", visibleTo: ["all"], recordedBy: "Recepción", sourceStay: null, createdAt: new Date(prefNow.getTime() - 15 * 86400000), updatedAt: new Date(prefNow.getTime() - 15 * 86400000) },
      { id: randomUUID(), guestId: "g4", category: "alimentacion", subcategory: "alergias", title: "Intolerancia a lactosa", description: "Intolerancia a la lactosa. Solicitar opciones sin lácteos.", isActive: true, priority: "high", visibleTo: ["restaurant", "reception"], recordedBy: "Restaurant", sourceStay: null, createdAt: new Date(prefNow.getTime() - 10 * 86400000), updatedAt: new Date(prefNow.getTime() - 10 * 86400000) },
    ];
    seedPreferences.forEach((p) => this.guestPreferencesMap.set(p.id, p));
  }

  // Users
  async getUser(id: string): Promise<User | undefined> {
    return this.users.get(id);
  }

  async getUserByUsername(username: string): Promise<User | undefined> {
    return Array.from(this.users.values()).find((user) => user.username === username);
  }

  async createUser(insertUser: InsertUser): Promise<User> {
    const id = randomUUID();
    const user: User = { 
      id,
      username: insertUser.username,
      password: insertUser.password,
      firstName: insertUser.firstName ?? null,
      lastName: insertUser.lastName ?? null,
      role: (insertUser.role ?? "reception") as "reception" | "housekeeping" | "management" | "director" | "restaurant" | "spa" | "security",
    };
    this.users.set(id, user);
    return user;
  }

  // Room Types
  async getRoomTypes(): Promise<RoomType[]> {
    return Array.from(this.roomTypes.values());
  }

  async getRoomType(id: string): Promise<RoomType | undefined> {
    return this.roomTypes.get(id);
  }

  async createRoomType(roomType: InsertRoomType): Promise<RoomType> {
    const id = randomUUID();
    const newRoomType: RoomType = { 
      id,
      code: roomType.code,
      name: roomType.name,
      description: roomType.description ?? null,
      baseOccupancy: roomType.baseOccupancy ?? 2,
      maxOccupancy: roomType.maxOccupancy ?? 4,
    };
    this.roomTypes.set(id, newRoomType);
    return newRoomType;
  }

  async updateRoomType(id: string, updates: Partial<InsertRoomType>): Promise<RoomType | undefined> {
    const roomType = this.roomTypes.get(id);
    if (!roomType) return undefined;
    const updatedRoomType: RoomType = { ...roomType, ...updates };
    this.roomTypes.set(id, updatedRoomType);
    return updatedRoomType;
  }

  async deleteRoomType(id: string): Promise<boolean> {
    return this.roomTypes.delete(id);
  }

  // Rate Plans
  async getRatePlans(): Promise<RatePlanWithRoomType[]> {
    const ratePlans = Array.from(this.ratePlans.values());
    return ratePlans.map((rp) => ({
      ...rp,
      roomType: this.roomTypes.get(rp.roomTypeId)!,
    }));
  }

  async getRatePlan(id: string): Promise<RatePlanWithRoomType | undefined> {
    const ratePlan = this.ratePlans.get(id);
    if (!ratePlan) return undefined;
    return {
      ...ratePlan,
      roomType: this.roomTypes.get(ratePlan.roomTypeId)!,
    };
  }

  async getRatePlansByRoomType(roomTypeId: string): Promise<RatePlan[]> {
    return Array.from(this.ratePlans.values()).filter((rp) => rp.roomTypeId === roomTypeId);
  }

  async createRatePlan(ratePlan: InsertRatePlan): Promise<RatePlan> {
    const id = randomUUID();
    const newRatePlan: RatePlan = {
      id,
      name: ratePlan.name,
      roomTypeId: ratePlan.roomTypeId,
      baseRate: ratePlan.baseRate,
      currency: ratePlan.currency ?? "ARS",
      refundable: ratePlan.refundable ?? "true",
      cancellationPolicy: ratePlan.cancellationPolicy ?? null,
    };
    this.ratePlans.set(id, newRatePlan);
    return newRatePlan;
  }

  async updateRatePlan(id: string, updates: Partial<InsertRatePlan>): Promise<RatePlan | undefined> {
    const ratePlan = this.ratePlans.get(id);
    if (!ratePlan) return undefined;
    const updatedRatePlan: RatePlan = { ...ratePlan, ...updates };
    this.ratePlans.set(id, updatedRatePlan);
    return updatedRatePlan;
  }

  async deleteRatePlan(id: string): Promise<boolean> {
    return this.ratePlans.delete(id);
  }

  // Rooms
  async getRooms(): Promise<RoomWithType[]> {
    const rooms = Array.from(this.rooms.values());
    return rooms.map((room) => ({
      ...room,
      roomType: this.roomTypes.get(room.roomTypeId)!,
    }));
  }

  async getRoom(id: string): Promise<RoomWithType | undefined> {
    const room = this.rooms.get(id);
    if (!room) return undefined;
    return {
      ...room,
      roomType: this.roomTypes.get(room.roomTypeId)!,
    };
  }

  async createRoom(insertRoom: InsertRoom): Promise<Room> {
    const id = randomUUID();
    const room: Room = { 
      id,
      roomNumber: insertRoom.roomNumber,
      roomTypeId: insertRoom.roomTypeId,
      floor: insertRoom.floor ?? 1,
      status: (insertRoom.status ?? "available") as RoomStatus,
      bedConfig: insertRoom.bedConfig ?? null,
      features: insertRoom.features ?? null,
      maxOccupancy: insertRoom.maxOccupancy ?? 2,
      notes: insertRoom.notes ?? null,
    };
    this.rooms.set(id, room);
    return room;
  }

  async updateRoom(id: string, updates: Partial<InsertRoom>): Promise<Room | undefined> {
    const room = this.rooms.get(id);
    if (!room) return undefined;
    const updatedRoom: Room = { 
      ...room, 
      ...updates,
      status: (updates.status ?? room.status) as RoomStatus,
    };
    this.rooms.set(id, updatedRoom);
    return updatedRoom;
  }

  async deleteRoom(id: string): Promise<boolean> {
    return this.rooms.delete(id);
  }

  // Companies
  async getCompanies(): Promise<Company[]> {
    return Array.from(this.companies.values()).filter((c) => c.isActive === "true");
  }

  async getCompany(id: string): Promise<Company | undefined> {
    return this.companies.get(id);
  }

  async searchCompanies(query: string): Promise<Company[]> {
    const lowerQuery = query.toLowerCase();
    return Array.from(this.companies.values()).filter((c) => 
      c.isActive === "true" && (
        c.razonSocial.toLowerCase().includes(lowerQuery) ||
        c.nombreFantasia?.toLowerCase().includes(lowerQuery) ||
        c.cuilCuit.toLowerCase().includes(lowerQuery)
      )
    );
  }

  async createCompany(insertCompany: InsertCompany): Promise<Company> {
    const id = randomUUID();
    const company: Company = {
      id,
      razonSocial: insertCompany.razonSocial,
      nombreFantasia: insertCompany.nombreFantasia ?? null,
      direccion: insertCompany.direccion ?? null,
      pais: insertCompany.pais ?? "Argentina",
      codigoPostal: insertCompany.codigoPostal ?? null,
      localidad: insertCompany.localidad ?? null,
      provincia: insertCompany.provincia ?? null,
      telefono: insertCompany.telefono ?? null,
      email: insertCompany.email ?? null,
      cuilCuit: insertCompany.cuilCuit,
      numeroFiscal: insertCompany.numeroFiscal ?? null,
      condicionIva: (insertCompany.condicionIva ?? "responsable_inscripto") as "responsable_inscripto" | "monotributo" | "exento" | "consumidor_final" | "no_responsable",
      inscripcionNacional: insertCompany.inscripcionNacional ?? null,
      inscripcionProvincial: insertCompany.inscripcionProvincial ?? null,
      contactName: insertCompany.contactName ?? null,
      contactEmail: insertCompany.contactEmail ?? null,
      contactPhone: insertCompany.contactPhone ?? null,
      creditLimit: insertCompany.creditLimit ?? "0",
      paymentTermDays: insertCompany.paymentTermDays ?? 30,
      notes: insertCompany.notes ?? null,
      isActive: insertCompany.isActive ?? "true",
      createdAt: new Date().split("T")[0],
    };
    this.companies.set(id, company);
    return company;
  }

  async updateCompany(id: string, updates: Partial<InsertCompany>): Promise<Company | undefined> {
    const company = this.companies.get(id);
    if (!company) return undefined;
    const updatedCompany: Company = { 
      ...company, 
      ...updates,
      condicionIva: (updates.condicionIva ?? company.condicionIva) as "responsable_inscripto" | "monotributo" | "exento" | "consumidor_final" | "no_responsable",
    };
    this.companies.set(id, updatedCompany);
    return updatedCompany;
  }

  async deleteCompany(id: string): Promise<boolean> {
    const company = this.companies.get(id);
    if (!company) return false;
    company.isActive = "false";
    this.companies.set(id, company);
    return true;
  }

  private agencies = new Map<string, Agency>();

  async getAgencies(): Promise<Agency[]> {
    return Array.from(this.agencies.values()).filter((a) => a.isActive === "true");
  }

  async getAgency(id: string): Promise<Agency | undefined> {
    return this.agencies.get(id);
  }

  async searchAgencies(query: string): Promise<Agency[]> {
    const lowerQuery = query.toLowerCase();
    return Array.from(this.agencies.values()).filter((a) =>
      a.isActive === "true" && (
        a.razonSocial.toLowerCase().includes(lowerQuery) ||
        a.nombreFantasia?.toLowerCase().includes(lowerQuery) ||
        a.cuilCuit.toLowerCase().includes(lowerQuery)
      )
    );
  }

  async createAgency(insertAgency: InsertAgency): Promise<Agency> {
    const id = randomUUID();
    const agency: Agency = {
      id,
      razonSocial: insertAgency.razonSocial,
      nombreFantasia: insertAgency.nombreFantasia ?? null,
      direccion: insertAgency.direccion ?? null,
      pais: insertAgency.pais ?? "Argentina",
      codigoPostal: insertAgency.codigoPostal ?? null,
      localidad: insertAgency.localidad ?? null,
      provincia: insertAgency.provincia ?? null,
      telefono: insertAgency.telefono ?? null,
      email: insertAgency.email ?? null,
      cuilCuit: insertAgency.cuilCuit,
      numeroFiscal: insertAgency.numeroFiscal ?? null,
      condicionIva: (insertAgency.condicionIva ?? "responsable_inscripto") as any,
      contactName: insertAgency.contactName ?? null,
      contactEmail: insertAgency.contactEmail ?? null,
      contactPhone: insertAgency.contactPhone ?? null,
      commissionRate: insertAgency.commissionRate ?? "0",
      creditLimit: insertAgency.creditLimit ?? "0",
      paymentTermDays: insertAgency.paymentTermDays ?? 30,
      notes: insertAgency.notes ?? null,
      isActive: insertAgency.isActive ?? "true",
      createdAt: new Date(),
    };
    this.agencies.set(id, agency);
    return agency;
  }

  async updateAgency(id: string, updates: Partial<InsertAgency>): Promise<Agency | undefined> {
    const agency = this.agencies.get(id);
    if (!agency) return undefined;
    const updatedAgency: Agency = { ...agency, ...updates } as Agency;
    this.agencies.set(id, updatedAgency);
    return updatedAgency;
  }

  async deleteAgency(id: string): Promise<boolean> {
    const agency = this.agencies.get(id);
    if (!agency) return false;
    agency.isActive = "false";
    this.agencies.set(id, agency);
    return true;
  }

  // Guests
  async getGuests(): Promise<Guest[]> {
    return Array.from(this.guests.values());
  }

  async getGuest(id: string): Promise<Guest | undefined> {
    return this.guests.get(id);
  }

  async searchGuests(query: string): Promise<Guest[]> {
    const lowerQuery = query.toLowerCase();
    return Array.from(this.guests.values()).filter((g) =>
      g.firstName.toLowerCase().includes(lowerQuery) ||
      g.lastName.toLowerCase().includes(lowerQuery) ||
      g.email?.toLowerCase().includes(lowerQuery) ||
      g.documentNumber?.toLowerCase().includes(lowerQuery)
    );
  }

  private generateGuestCode(): string {
    this.guestCounter++;
    const year = new Date().getFullYear();
    return `H-${year}-${this.guestCounter.toString().padStart(4, "0")}`;
  }

  async createGuest(insertGuest: InsertGuest): Promise<Guest> {
    const id = randomUUID();
    const guest: Guest = { 
      id,
      codigo: this.generateGuestCode(),
      firstName: insertGuest.firstName,
      lastName: insertGuest.lastName,
      email: insertGuest.email ?? null,
      phone: insertGuest.phone ?? null,
      documentType: insertGuest.documentType ?? null,
      documentNumber: insertGuest.documentNumber ?? null,
      nationality: insertGuest.nationality ?? null,
      direccion: insertGuest.direccion ?? null,
      localidad: insertGuest.localidad ?? null,
      codigoPostal: insertGuest.codigoPostal ?? null,
      fechaNacimiento: insertGuest.fechaNacimiento ?? null,
      sexo: (insertGuest.sexo ?? "no_especifica") as "masculino" | "femenino" | "otro" | "no_especifica",
      segment: (insertGuest.segment ?? "LEISURE") as "LEISURE" | "CORP" | "SPORT" | "CONGRESS" | "OTHER",
      cuilCuit: insertGuest.cuilCuit ?? null,
      companyId: insertGuest.companyId ?? null,
      fechaAlta: new Date(),
      vehiculoPatente: insertGuest.vehiculoPatente ?? null,
      vehiculoMarca: insertGuest.vehiculoMarca ?? null,
      vehiculoModelo: insertGuest.vehiculoModelo ?? null,
      vehiculoColor: insertGuest.vehiculoColor ?? null,
    };
    this.guests.set(id, guest);
    return guest;
  }

  async updateGuest(id: string, updates: Partial<InsertGuest>): Promise<Guest | undefined> {
    const guest = this.guests.get(id);
    if (!guest) return undefined;
    const updatedGuest: Guest = { 
      ...guest, 
      ...updates,
      sexo: (updates.sexo ?? guest.sexo) as "masculino" | "femenino" | "otro" | "no_especifica",
      segment: (updates.segment ?? guest.segment) as "LEISURE" | "CORP" | "SPORT" | "CONGRESS" | "OTHER",
    };
    this.guests.set(id, updatedGuest);
    return updatedGuest;
  }

  async deleteGuest(id: string): Promise<boolean> {
    return this.guests.delete(id);
  }

  // Bed Types
  async getBedTypes(): Promise<BedType[]> {
    return Array.from(this.bedTypesMap.values()).sort((a, b) => a.displayOrder - b.displayOrder);
  }

  async getBedType(id: string): Promise<BedType | undefined> {
    return this.bedTypesMap.get(id);
  }

  async createBedType(bedType: InsertBedType): Promise<BedType> {
    const newBedType: BedType = {
      id: randomUUID(),
      code: bedType.code,
      name: bedType.name,
      description: bedType.description ?? null,
      isActive: bedType.isActive ?? true,
      displayOrder: bedType.displayOrder ?? 0,
      createdAt: new Date(),
    };
    this.bedTypesMap.set(newBedType.id, newBedType);
    return newBedType;
  }

  async updateBedType(id: string, bedType: Partial<InsertBedType>): Promise<BedType | undefined> {
    const existing = this.bedTypesMap.get(id);
    if (!existing) return undefined;
    const updated = { ...existing, ...bedType };
    this.bedTypesMap.set(id, updated);
    return updated;
  }

  async deleteBedType(id: string): Promise<boolean> {
    const existing = this.bedTypesMap.get(id);
    if (!existing) return false;
    const updated = { ...existing, isActive: false };
    this.bedTypesMap.set(id, updated);
    return true;
  }

  // Reservations
  private enrichReservation(reservation: Reservation): ReservationWithDetails {
    const guest = this.guests.get(reservation.guestId);
    const room = this.rooms.get(reservation.roomId);
    const roomType = room ? this.roomTypes.get(room.roomTypeId) : undefined;
    const ratePlan = reservation.ratePlanId ? this.ratePlans.get(reservation.ratePlanId) : undefined;
    const charges = Array.from(this.charges.values()).filter((c) => c.reservationId === reservation.id);

    return {
      ...reservation,
      guest: guest!,
      room: room ? { ...room, roomType } : undefined as any,
      ratePlan,
      charges,
    };
  }

  generateReservationCode(): string {
    this.reservationCounter++;
    return `RES-${this.reservationCounter}`;
  }

  async getReservations(): Promise<ReservationWithDetails[]> {
    const reservations = Array.from(this.reservations.values());
    return reservations.map((r) => this.enrichReservation(r)).sort((a, b) => 
      new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );
  }

  async getReservation(id: string): Promise<ReservationWithDetails | undefined> {
    const reservation = this.reservations.get(id);
    if (!reservation) return undefined;
    return this.enrichReservation(reservation);
  }

  async getReservationByCode(code: string): Promise<ReservationWithDetails | undefined> {
    const reservation = Array.from(this.reservations.values()).find((r) => r.reservationCode === code);
    if (!reservation) return undefined;
    return this.enrichReservation(reservation);
  }

  async getRecentReservations(limit: number): Promise<ReservationWithDetails[]> {
    const reservations = await this.getReservations();
    return reservations.slice(0, limit);
  }

  async getReservationsForCheckIn(): Promise<ReservationWithDetails[]> {
    const reservations = await this.getReservations();
    return reservations.filter((r) => r.status === "confirmed");
  }

  async getReservationsForCheckOut(): Promise<ReservationWithDetails[]> {
    const reservations = await this.getReservations();
    return reservations.filter((r) => r.status === "checked_in");
  }

  async getCheckInsByDate(date: string): Promise<ReservationWithDetails[]> {
    const reservations = await this.getReservations();
    return reservations.filter((r) => r.checkInDate === date && r.status === "checked_in");
  }

  async getReservationsByGuest(guestId: string): Promise<ReservationWithDetails[]> {
    const reservations = await this.getReservations();
    return reservations.filter((r) => r.guestId === guestId);
  }

  async createReservation(insertReservation: InsertReservation): Promise<Reservation> {
    const id = randomUUID();
    const reservation: Reservation = { 
      id,
      reservationCode: insertReservation.reservationCode,
      guestId: insertReservation.guestId,
      companyId: insertReservation.companyId ?? null,
      roomTypeId: insertReservation.roomTypeId,
      roomId: insertReservation.roomId,
      ratePlanId: insertReservation.ratePlanId ?? null,
      checkInDate: insertReservation.checkInDate,
      checkOutDate: insertReservation.checkOutDate,
      nights: insertReservation.nights ?? 1,
      baseRatePerNight: insertReservation.baseRatePerNight ?? null,
      discountType: (insertReservation.discountType ?? "none") as "none" | "percent" | "fixed",
      discountValue: insertReservation.discountValue ?? "0",
      finalRatePerNight: insertReservation.finalRatePerNight ?? null,
      totalRoomAmount: insertReservation.totalRoomAmount ?? null,
      status: (insertReservation.status ?? "pending") as ReservationStatus,
      source: (insertReservation.source ?? "directo") as any,
      otaChannelId: insertReservation.otaChannelId ?? null,
      externalReservationId: insertReservation.externalReservationId ?? null,
      numberOfGuests: insertReservation.numberOfGuests ?? 1,
      notes: insertReservation.notes ?? null,
      createdAt: insertReservation.createdAt ? new Date(insertReservation.createdAt as string) : new Date(),
      lastModifiedBy: insertReservation.lastModifiedBy ?? null,
    };
    this.reservations.set(id, reservation);
    return reservation;
  }

  async updateReservation(id: string, updates: Partial<InsertReservation>): Promise<Reservation | undefined> {
    const reservation = this.reservations.get(id);
    if (!reservation) return undefined;
    const updatedReservation: Reservation = { 
      ...reservation, 
      ...updates,
      status: (updates.status ?? reservation.status) as ReservationStatus,
      discountType: (updates.discountType ?? reservation.discountType) as "none" | "percent" | "fixed",
      source: (updates.source ?? reservation.source) as any,
      otaChannelId: updates.otaChannelId !== undefined ? updates.otaChannelId : reservation.otaChannelId,
      externalReservationId: updates.externalReservationId !== undefined ? updates.externalReservationId : reservation.externalReservationId,
    };
    this.reservations.set(id, updatedReservation);
    return updatedReservation;
  }

  async deleteReservation(id: string): Promise<boolean> {
    return this.reservations.delete(id);
  }

  // Charges
  async getCharges(reservationId: string): Promise<Charge[]> {
    return Array.from(this.charges.values()).filter((c) => c.reservationId === reservationId && (c as any).status !== "anulado");
  }

  async getAllChargesIncludingAnulados(reservationId: string): Promise<Charge[]> {
    return Array.from(this.charges.values()).filter((c) => c.reservationId === reservationId);
  }

  async getCharge(id: string): Promise<Charge | undefined> {
    return this.charges.get(id);
  }

  async createCharge(charge: InsertCharge): Promise<Charge> {
    const id = randomUUID();
    const newCharge: Charge = {
      id,
      reservationId: charge.reservationId,
      description: charge.description,
      amount: charge.amount,
      date: charge.date,
      category: (charge.category ?? "otros") as "room" | "restaurant" | "spa" | "minibar" | "otros" | "adjustment",
      createdBy: charge.createdBy ?? null,
    };
    this.charges.set(id, newCharge);
    return newCharge;
  }

  async updateCharge(id: string, updates: Partial<InsertCharge>): Promise<Charge | undefined> {
    const charge = this.charges.get(id);
    if (!charge) return undefined;
    const updatedCharge: Charge = { 
      ...charge, 
      ...updates,
      category: (updates.category ?? charge.category) as "room" | "restaurant" | "spa" | "minibar" | "otros" | "adjustment",
    };
    this.charges.set(id, updatedCharge);
    return updatedCharge;
  }

  async deleteCharge(id: string): Promise<boolean> {
    return this.charges.delete(id);
  }

  async getChargesTotal(reservationId: string): Promise<number> {
    const charges = await this.getCharges(reservationId);
    return charges.reduce((sum, c) => sum + parseFloat(c.amount), 0);
  }

  // Payments
  async getPayments(reservationId: string): Promise<Payment[]> {
    return Array.from(this.payments.values())
      .filter((p) => p.reservationId === reservationId && (p as any).status !== "anulado")
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  }

  async getAllPaymentsIncludingAnulados(reservationId: string): Promise<Payment[]> {
    return Array.from(this.payments.values())
      .filter((p) => p.reservationId === reservationId)
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  }

  async createPayment(payment: InsertPayment): Promise<Payment> {
    const id = randomUUID();
    const newPayment: Payment = {
      id,
      reservationId: payment.reservationId,
      amount: payment.amount,
      method: payment.method as Payment["method"],
      date: payment.date,
      reference: payment.reference ?? null,
      receivedBy: payment.receivedBy ?? null,
      notes: payment.notes ?? null,
    };
    this.payments.set(id, newPayment);
    return newPayment;
  }

  async updatePayment(id: string, payment: Partial<InsertPayment>): Promise<Payment | undefined> {
    const existing = this.payments.get(id);
    if (!existing) return undefined;
    const updatedPayment: Payment = { 
      ...existing, 
      ...payment,
      method: (payment.method ?? existing.method) as Payment["method"],
    };
    this.payments.set(id, updatedPayment);
    return updatedPayment;
  }

  async deletePayment(id: string): Promise<boolean> {
    return this.payments.delete(id);
  }

  async getPaymentsTotal(reservationId: string): Promise<number> {
    const payments = await this.getPayments(reservationId);
    return payments.reduce((sum, p) => sum + parseFloat(p.amount), 0);
  }

  // Cancelled Reservation Logs
  async getCancelledReservationLogs(): Promise<CancelledReservationLog[]> {
    return Array.from(this.cancelledReservationLogs.values()).sort((a, b) => 
      new Date(b.cancellationDate).getTime() - new Date(a.cancellationDate).getTime()
    );
  }

  async createCancelledReservationLog(log: InsertCancelledReservationLog): Promise<CancelledReservationLog> {
    const id = randomUUID();
    const newLog: CancelledReservationLog = {
      id,
      reservationCode: log.reservationCode,
      guestName: log.guestName,
      roomNumber: log.roomNumber,
      checkInDate: log.checkInDate,
      checkOutDate: log.checkOutDate,
      cancellationDate: log.cancellationDate,
      cancelledBy: log.cancelledBy ?? null,
      reason: log.reason ?? null,
    };
    this.cancelledReservationLogs.set(id, newLog);
    return newLog;
  }

  // Overbooking check - returns true if there is a conflict
  async checkOverbooking(roomId: string, checkInDate: string, checkOutDate: string, excludeReservationId?: string): Promise<boolean> {
    const reservations = Array.from(this.reservations.values());
    const activeStatuses: ReservationStatus[] = ["tentative", "pending", "confirmed", "checked_in"];
    
    for (const res of reservations) {
      if (res.roomId !== roomId) continue;
      if (excludeReservationId && res.id === excludeReservationId) continue;
      if (!activeStatuses.includes(res.status)) continue;
      
      // Check for date overlap
      // Reservation A conflicts with B if A.checkIn < B.checkOut AND A.checkOut > B.checkIn
      if (checkInDate < res.checkOutDate && checkOutDate > res.checkInDate) {
        return true; // Conflict found
      }
    }
    return false; // No conflict
  }

  // Dashboard Stats
  async getDashboardStats() {
    const rooms = Array.from(this.rooms.values());
    const reservations = Array.from(this.reservations.values());
    const guests = Array.from(this.guests.values());
    const today = new Date().toISOString().split("T")[0];

    const totalRooms = rooms.length;
    const availableRooms = rooms.filter((r) => r.status === "available").length;
    const occupiedRooms = rooms.filter((r) => r.status === "occupied").length;
    const dirtyRooms = rooms.filter((r) => r.status === "dirty").length;
    const cleaningRooms = rooms.filter((r) => r.status === "cleaning").length;
    const maintenanceRooms = rooms.filter((r) => r.status === "maintenance").length;
    const oosRooms = rooms.filter((r) => r.status === "oos").length;

    const todayCheckIns = reservations.filter(
      (r) => r.checkInDate === today && (r.status === "confirmed" || r.status === "pending" || r.status === "tentative")
    ).length;
    const todayCheckOuts = reservations.filter(
      (r) => r.checkOutDate === today && r.status === "checked_in"
    ).length;

    const occupancyRate = totalRooms > 0 ? Math.round((occupiedRooms / totalRooms) * 100) : 0;
    const totalGuests = guests.length;
    const pendingReservations = reservations.filter((r) => r.status === "pending" || r.status === "tentative").length;

    return {
      totalRooms,
      availableRooms,
      occupiedRooms,
      dirtyRooms,
      cleaningRooms,
      maintenanceRooms,
      oosRooms,
      todayCheckIns,
      todayCheckOuts,
      occupancyRate,
      totalGuests,
      pendingReservations,
    };
  }

  // Planning
  async getPlanningData(startDate: string, endDate: string): Promise<PlanningData> {
    const rooms = await this.getRooms();
    const allReservations = Array.from(this.reservations.values());
    const allGroupLinks = Array.from(this.groupReservationLinks.values());
    
    // Generate array of days between start and end
    const days: string[] = [];
    const start = new Date(startDate);
    const end = new Date(endDate);
    for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
      days.push(d.toISOString().split("T")[0]);
    }

    // Build set of reservation IDs linked to groups
    const groupReservationIds = new Set(allGroupLinks.map(l => l.reservationId));

    // Build occupancy map and cell reservations
    const occupancy: Record<string, PlanningCellStatus[]> = {};
    const cellReservations: Record<string, Record<string, string>> = {};
    const cellGroupBlocks: Record<string, Record<string, string>> = {};
    const reservationsMap: Record<string, { id: string; guestName: string; checkIn: string; checkOut: string; status: ReservationStatus; source: ReservationSource; isGroup?: boolean; groupName?: string; groupId?: string; groupColor?: string; earlyCheckIn?: boolean; earlyCheckInTime?: string | null; lateCheckOut?: boolean; lateCheckOutTime?: string | null }> = {};
    const groupBlocksMap: Record<string, { id: string; groupName: string; groupCode: string; checkIn: string; checkOut: string }> = {};

    // Filter active reservations (not cancelled or checked_out)
    const activeReservations = allReservations.filter(r => 
      r.status !== "cancelled" && r.status !== "checked_out"
    );

    // Build reservation info map
    for (const res of activeReservations) {
      const guest = this.guests.get(res.guestId);
      if (guest) {
        const isGroupReservation = groupReservationIds.has(res.id);
        let groupName: string | undefined;
        let groupId: string | undefined;
        let groupColor: string | undefined;
        
        if (isGroupReservation) {
          const link = allGroupLinks.find(l => l.reservationId === res.id);
          if (link) {
            const group = this.groups.get(link.groupId);
            if (group) {
              groupName = group.name;
              groupId = group.id;
              groupColor = (group as any).color || "#6366f1";
            }
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
          groupId,
          groupColor,
          earlyCheckIn: res.earlyCheckIn ?? false,
          earlyCheckInTime: res.earlyCheckInTime ?? null,
          lateCheckOut: res.lateCheckOut ?? false,
          lateCheckOutTime: res.lateCheckOutTime ?? null,
        };
      }
    }

    // Calculate occupancy for each room
    for (const room of rooms) {
      occupancy[room.id] = [];
      cellReservations[room.id] = {};
      cellGroupBlocks[room.id] = {};

      for (const day of days) {
        // Check room status first
        if (room.status === "maintenance") {
          occupancy[room.id].push("maintenance");
          continue;
        }
        if (room.status === "cleaning") {
          occupancy[room.id].push("cleaning");
          continue;
        }

        // Find reservation for this room on this day
        const reservation = activeReservations.find(r => {
          if (r.roomId !== room.id) return false;
          const checkIn = r.checkInDate;
          const checkOut = r.checkOutDate;
          return day >= checkIn && day < checkOut;
        });

        if (reservation) {
          cellReservations[room.id][day] = reservation.id;
          const isGroupRes = groupReservationIds.has(reservation.id);
          const todayStr = new Date().toISOString().split("T")[0];
          
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
          const earlyRes = activeReservations.find(r =>
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

        const lateRes = activeReservations.find(r =>
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

    return {
      rooms,
      days,
      occupancy,
      groupBlocks: groupBlocksMap,
      cellGroupBlocks,
      reservations: reservationsMap,
      cellReservations,
    };
  }

  // OTA Channels
  async getOTAChannels(): Promise<OTAChannelWithStats[]> {
    const channels = Array.from(this.otaChannels.values());
    return channels.map((channel) => {
      const logs = Array.from(this.otaReservationLogs.values()).filter(
        (log) => log.channelId === channel.id
      );
      const totalReservations = logs.length;
      const pendingSync = logs.filter((log) => log.status === "pending").length;
      const totalRevenue = logs.reduce((sum, log) => sum + parseFloat(log.totalAmount || "0"), 0);
      const totalCommission = logs.reduce((sum, log) => sum + parseFloat(log.commission || "0"), 0);
      return {
        ...channel,
        totalReservations,
        pendingSync,
        totalRevenue,
        totalCommission,
      };
    });
  }

  async getOTAChannel(id: string): Promise<OTAChannel | undefined> {
    return this.otaChannels.get(id);
  }

  async createOTAChannel(channel: InsertOTAChannel): Promise<OTAChannel> {
    const id = randomUUID();
    const newChannel: OTAChannel = {
      id,
      name: channel.name,
      channelType: channel.channelType as "booking" | "expedia" | "airbnb" | "despegar" | "hotelbeds" | "agoda" | "trivago" | "manual",
      status: (channel.status || "inactive") as "active" | "inactive" | "pending" | "error",
      apiKey: channel.apiKey ?? null,
      apiSecret: channel.apiSecret ?? null,
      hotelCode: channel.hotelCode ?? null,
      commissionPercent: channel.commissionPercent ?? "15.00",
      syncEnabled: channel.syncEnabled ?? "false",
      lastSyncAt: channel.lastSyncAt ?? null,
      createdAt: channel.createdAt,
    };
    this.otaChannels.set(id, newChannel);
    return newChannel;
  }

  async updateOTAChannel(id: string, channel: Partial<InsertOTAChannel>): Promise<OTAChannel | undefined> {
    const existing = this.otaChannels.get(id);
    if (!existing) return undefined;
    const updated: OTAChannel = { ...existing, ...channel } as OTAChannel;
    this.otaChannels.set(id, updated);
    return updated;
  }

  async deleteOTAChannel(id: string): Promise<boolean> {
    return this.otaChannels.delete(id);
  }

  // OTA Reservation Logs
  async getOTAReservationLogs(channelId?: string): Promise<OTAReservationLogWithChannel[]> {
    let logs = Array.from(this.otaReservationLogs.values());
    if (channelId) {
      logs = logs.filter((log) => log.channelId === channelId);
    }
    return logs.map((log) => ({
      ...log,
      channel: this.otaChannels.get(log.channelId)!,
    })).sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }

  async getOTAReservationLog(id: string): Promise<OTAReservationLogWithChannel | undefined> {
    const log = this.otaReservationLogs.get(id);
    if (!log) return undefined;
    return {
      ...log,
      channel: this.otaChannels.get(log.channelId)!,
    };
  }

  async createOTAReservationLog(log: InsertOTAReservationLog): Promise<OTAReservationLog> {
    const id = randomUUID();
    const newLog: OTAReservationLog = {
      id,
      channelId: log.channelId,
      externalReservationId: log.externalReservationId,
      internalReservationId: log.internalReservationId ?? null,
      guestName: log.guestName,
      checkInDate: log.checkInDate,
      checkOutDate: log.checkOutDate,
      roomTypeName: log.roomTypeName ?? null,
      totalAmount: log.totalAmount ?? null,
      commission: log.commission ?? null,
      netAmount: log.netAmount ?? null,
      status: (log.status || "pending") as "pending" | "synced" | "failed" | "cancelled",
      rawData: log.rawData ?? null,
      syncedAt: log.syncedAt ?? null,
      createdAt: log.createdAt,
    };
    this.otaReservationLogs.set(id, newLog);
    return newLog;
  }

  async updateOTAReservationLog(id: string, log: Partial<InsertOTAReservationLog>): Promise<OTAReservationLog | undefined> {
    const existing = this.otaReservationLogs.get(id);
    if (!existing) return undefined;
    const updated: OTAReservationLog = { ...existing, ...log } as OTAReservationLog;
    this.otaReservationLogs.set(id, updated);
    return updated;
  }

  async syncOTAReservation(logId: string): Promise<Reservation | undefined> {
    const log = this.otaReservationLogs.get(logId);
    if (!log || log.status === "synced") return undefined;

    const channel = this.otaChannels.get(log.channelId);
    if (!channel) return undefined;

    // Parse guest name
    const nameParts = log.guestName.split(" ");
    const firstName = nameParts[0] || "OTA";
    const lastName = nameParts.slice(1).join(" ") || "Guest";

    // Create or find guest
    let guest = Array.from(this.guests.values()).find(
      (g) => g.firstName === firstName && g.lastName === lastName
    );
    if (!guest) {
      guest = await this.createGuest({
        firstName,
        lastName,
        email: null,
        phone: null,
        documentType: null,
        documentNumber: null,
        nationality: null,
      });
    }

    // Find room type by name or use first available
    let roomType = Array.from(this.roomTypes.values()).find(
      (rt) => rt.name === log.roomTypeName
    );
    if (!roomType) {
      roomType = Array.from(this.roomTypes.values())[0];
    }

    // Find available room
    const availableRoom = Array.from(this.rooms.values()).find(
      (r) => r.roomTypeId === roomType!.id && r.status === "available"
    );
    if (!availableRoom) return undefined;

    // Calculate nights
    const checkIn = new Date(log.checkInDate);
    const checkOut = new Date(log.checkOutDate);
    const nights = Math.ceil((checkOut.getTime() - checkIn.getTime()) / (1000 * 60 * 60 * 24));

    // Create reservation
    const reservation = await this.createReservation({
      reservationCode: this.generateReservationCode(),
      guestId: guest.id,
      roomTypeId: roomType!.id,
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

    // Update log
    await this.updateOTAReservationLog(logId, {
      status: "synced",
      internalReservationId: reservation.id,
      syncedAt: new Date(),
    });

    return reservation;
  }

  // Groups
  generateGroupCode(): string {
    this.groupCounter++;
    return `GRP-${this.groupCounter.toString().padStart(4, "0")}`;
  }

  private async buildGroupWithDetails(group: Group): Promise<GroupWithDetails> {
    const blocks = await this.getGroupBlocks(group.id);
    const links = await this.getGroupReservationLinks(group.id);
    const reservations: ReservationWithDetails[] = [];
    
    for (const link of links) {
      const res = await this.getReservation(link.reservationId);
      if (res) reservations.push(res);
    }

    const totalRooms = blocks.reduce((sum, b) => sum + b.quantity, 0);
    const assignedRooms = reservations.length;

    return {
      ...group,
      blocks,
      reservations,
      totalRooms,
      assignedRooms,
    };
  }

  async getGroups(): Promise<GroupWithDetails[]> {
    const groups = Array.from(this.groups.values());
    const result: GroupWithDetails[] = [];
    for (const group of groups) {
      result.push(await this.buildGroupWithDetails(group));
    }
    return result.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }

  async getGroup(id: string): Promise<GroupWithDetails | undefined> {
    const group = this.groups.get(id);
    if (!group) return undefined;
    return this.buildGroupWithDetails(group);
  }

  async createGroup(group: InsertGroup): Promise<Group> {
    const id = randomUUID();
    const newGroup: Group = {
      id,
      groupCode: group.groupCode,
      name: group.name,
      contactName: group.contactName ?? null,
      contactPhone: group.contactPhone ?? null,
      contactEmail: group.contactEmail ?? null,
      eventDate: group.eventDate ?? null,
      checkInDate: group.checkInDate,
      checkOutDate: group.checkOutDate,
      status: (group.status ?? "tentative") as Group["status"],
      releaseDate: group.releaseDate ?? null,
      notes: group.notes ?? null,
      createdAt: group.createdAt,
      createdBy: group.createdBy ?? null,
    };
    this.groups.set(id, newGroup);
    return newGroup;
  }

  async updateGroup(id: string, group: Partial<InsertGroup>): Promise<Group | undefined> {
    const existing = this.groups.get(id);
    if (!existing) return undefined;
    const updated: Group = { ...existing, ...group } as Group;
    this.groups.set(id, updated);
    return updated;
  }

  async deleteGroup(id: string): Promise<boolean> {
    // Delete all associated blocks and links
    Array.from(this.groupRoomBlocks.values())
      .filter(b => b.groupId === id)
      .forEach(b => this.groupRoomBlocks.delete(b.id));
    Array.from(this.groupReservationLinks.values())
      .filter(l => l.groupId === id)
      .forEach(l => this.groupReservationLinks.delete(l.id));
    return this.groups.delete(id);
  }

  // Group Room Blocks
  async getGroupBlocks(groupId: string): Promise<GroupRoomBlockWithDetails[]> {
    const blocks = Array.from(this.groupRoomBlocks.values()).filter(b => b.groupId === groupId);
    return blocks.map(block => {
      const roomType = this.roomTypes.get(block.roomTypeId);
      const ratePlan = block.ratePlanId ? this.ratePlans.get(block.ratePlanId) : undefined;
      return {
        ...block,
        roomType: roomType!,
        ratePlan,
      };
    });
  }

  async createGroupBlock(block: InsertGroupRoomBlock): Promise<GroupRoomBlock> {
    const id = randomUUID();
    const newBlock: GroupRoomBlock = {
      id,
      groupId: block.groupId,
      roomTypeId: block.roomTypeId,
      quantity: block.quantity,
      ratePlanId: block.ratePlanId ?? null,
      agreedRate: block.agreedRate ?? null,
      blockCheckInDate: block.blockCheckInDate ?? null,
      blockCheckOutDate: block.blockCheckOutDate ?? null,
    };
    this.groupRoomBlocks.set(id, newBlock);
    return newBlock;
  }

  async updateGroupBlock(id: string, block: Partial<InsertGroupRoomBlock>): Promise<GroupRoomBlock | undefined> {
    const existing = this.groupRoomBlocks.get(id);
    if (!existing) return undefined;
    const updated: GroupRoomBlock = { ...existing, ...block } as GroupRoomBlock;
    this.groupRoomBlocks.set(id, updated);
    return updated;
  }

  async deleteGroupBlock(id: string): Promise<boolean> {
    return this.groupRoomBlocks.delete(id);
  }

  // Group Reservation Links
  async getGroupReservationLinks(groupId: string): Promise<GroupReservationLink[]> {
    return Array.from(this.groupReservationLinks.values()).filter(l => l.groupId === groupId);
  }

  async createGroupReservationLink(link: InsertGroupReservationLink): Promise<GroupReservationLink> {
    const id = randomUUID();
    const newLink: GroupReservationLink = {
      id,
      groupId: link.groupId,
      reservationId: link.reservationId,
    };
    this.groupReservationLinks.set(id, newLink);
    return newLink;
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
    const group = this.groups.get(groupId);
    if (!group) return undefined;

    const room = this.rooms.get(roomId);
    if (!room) return undefined;

    // Create guest for this room assignment
    const guest = await this.createGuest({
      firstName: guestFirstName,
      lastName: guestLastName,
      email: null,
      phone: null,
      documentType: null,
      documentNumber: null,
      nationality: null,
    });

    // Find matching block for defaults
    const blocks = await this.getGroupBlocks(groupId);
    const matchingBlock = blocks.find(b => b.roomTypeId === room.roomTypeId);

    // Use provided values or fall back to block values or group values
    const checkInDate = options?.checkInDate || matchingBlock?.blockCheckInDate || group.checkInDate;
    const checkOutDate = options?.checkOutDate || matchingBlock?.blockCheckOutDate || group.checkOutDate;
    const agreedRate = options?.agreedRate || matchingBlock?.agreedRate || "0";
    const ratePlanId = options?.ratePlanId !== undefined ? options.ratePlanId : (matchingBlock?.ratePlanId || null);

    // Calculate nights
    const checkIn = new Date(checkInDate);
    const checkOut = new Date(checkOutDate);
    const nights = Math.ceil((checkOut.getTime() - checkIn.getTime()) / (1000 * 60 * 60 * 24));

    // Create reservation
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

    // Create link
    await this.createGroupReservationLink({
      groupId,
      reservationId: reservation.id,
    });

    return reservation;
  }

  // Group Folio stubs (MemStorage — production uses DatabaseStorage)
  async createGroupCharge(_charge: InsertGroupCharge): Promise<GroupCharge> { throw new Error("Not implemented in MemStorage"); }
  async getGroupCharges(_groupId: string): Promise<GroupCharge[]> { return []; }
  async deleteGroupCharge(_id: string): Promise<boolean> { return false; }
  async createGroupPayment(_payment: InsertGroupPayment): Promise<GroupPayment> { throw new Error("Not implemented in MemStorage"); }
  async getGroupPayments(_groupId: string): Promise<GroupPayment[]> { return []; }
  async transferChargeToGroup(_chargeId: string, _groupId: string): Promise<GroupCharge> { throw new Error("Not implemented in MemStorage"); }
  async getGroupFolio(_groupId: string): Promise<GroupFolioData> { throw new Error("Not implemented in MemStorage"); }
  async distributeGroupPayment(_groupId: string, totalAmount: number, distribution: string, _manualDetail?: Record<string, number>): Promise<Record<string, number>> { return {}; }

  // Guest Reviews
  private enrichReview(review: GuestReview): GuestReviewWithDetails {
    const guest = this.guests.get(review.guestId);
    const room = review.roomId ? this.rooms.get(review.roomId) : undefined;
    const reservation = review.reservationId ? this.reservations.get(review.reservationId) : undefined;
    return {
      ...review,
      guest: guest!,
      room,
      reservation,
    };
  }

  async getGuestReviews(): Promise<GuestReviewWithDetails[]> {
    return Array.from(this.guestReviews.values())
      .map(r => this.enrichReview(r))
      .sort((a, b) => new Date(b.reviewDate).getTime() - new Date(a.reviewDate).getTime());
  }

  async getGuestReview(id: string): Promise<GuestReviewWithDetails | undefined> {
    const review = this.guestReviews.get(id);
    return review ? this.enrichReview(review) : undefined;
  }

  async getGuestReviewsByGuest(guestId: string): Promise<GuestReviewWithDetails[]> {
    return Array.from(this.guestReviews.values())
      .filter(r => r.guestId === guestId)
      .map(r => this.enrichReview(r))
      .sort((a, b) => new Date(b.reviewDate).getTime() - new Date(a.reviewDate).getTime());
  }

  async createGuestReview(review: InsertGuestReview): Promise<GuestReview> {
    const id = randomUUID();
    const newReview: GuestReview = {
      id,
      reservationId: review.reservationId || null,
      guestId: review.guestId,
      roomId: review.roomId || null,
      reviewDate: review.reviewDate,
      source: review.source || "direct",
      rating: review.rating,
      title: review.title || null,
      content: review.content,
      sentiment: (review.sentiment as SentimentType) || null,
      sentimentScore: review.sentimentScore || null,
      categories: review.categories || null,
      categoryScores: review.categoryScores || null,
      keyPhrases: review.keyPhrases || null,
      improvementSuggestions: review.improvementSuggestions || null,
      analyzedAt: review.analyzedAt || null,
      isPublished: review.isPublished || "false",
      staffResponse: review.staffResponse || null,
      respondedAt: review.respondedAt || null,
      respondedBy: review.respondedBy || null,
    };
    this.guestReviews.set(id, newReview);
    return newReview;
  }

  async updateGuestReview(id: string, review: Partial<InsertGuestReview>): Promise<GuestReview | undefined> {
    const existing = this.guestReviews.get(id);
    if (!existing) return undefined;
    const updated: GuestReview = { 
      ...existing, 
      ...review,
      sentiment: review.sentiment !== undefined ? (review.sentiment as SentimentType) : existing.sentiment,
    };
    this.guestReviews.set(id, updated);
    return updated;
  }

  async deleteGuestReview(id: string): Promise<boolean> {
    return this.guestReviews.delete(id);
  }

  async getReviewAnalyticsSummary(): Promise<{
    totalReviews: number;
    averageRating: number;
    sentimentBreakdown: { positive: number; neutral: number; negative: number };
    topCategories: { category: string; count: number; avgSentiment: number }[];
    recentTrend: { date: string; avgRating: number; count: number }[];
    improvementAreas: string[];
  }> {
    const reviews = Array.from(this.guestReviews.values());
    const totalReviews = reviews.length;
    const averageRating = totalReviews > 0 
      ? reviews.reduce((sum, r) => sum + r.rating, 0) / totalReviews 
      : 0;

    const sentimentBreakdown = {
      positive: reviews.filter(r => r.sentiment === "positive").length,
      neutral: reviews.filter(r => r.sentiment === "neutral").length,
      negative: reviews.filter(r => r.sentiment === "negative").length,
    };

    // Count categories
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

    // Recent trend (last 7 days)
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

    // Collect improvement suggestions from negative reviews
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

  // Housekeeping Tasks
  async getHousekeepingTasks(date?: string): Promise<HousekeepingTaskWithRoom[]> {
    const tasks = Array.from(this.housekeepingTasks.values());
    const filteredTasks = date 
      ? tasks.filter(t => t.scheduledDate === date)
      : tasks;
    
    return filteredTasks.map(task => {
      const room = this.rooms.get(task.roomId);
      const roomType = room ? this.roomTypes.get(room.roomTypeId) : undefined;
      return {
        ...task,
        room: { ...room!, roomType },
      };
    }).sort((a, b) => {
      const priorityOrder = { urgent: 0, high: 1, normal: 2, low: 3 };
      return priorityOrder[a.priority as keyof typeof priorityOrder] - priorityOrder[b.priority as keyof typeof priorityOrder];
    });
  }

  async getHousekeepingTask(id: string): Promise<HousekeepingTaskWithRoom | undefined> {
    const task = this.housekeepingTasks.get(id);
    if (!task) return undefined;
    
    const room = this.rooms.get(task.roomId);
    const roomType = room ? this.roomTypes.get(room.roomTypeId) : undefined;
    return {
      ...task,
      room: { ...room!, roomType },
    };
  }

  async getHousekeepingTasksByRoom(roomId: string): Promise<HousekeepingTask[]> {
    return Array.from(this.housekeepingTasks.values())
      .filter(t => t.roomId === roomId);
  }

  async createHousekeepingTask(task: InsertHousekeepingTask): Promise<HousekeepingTask> {
    const id = randomUUID();
    const newTask: HousekeepingTask = { 
      id,
      roomId: task.roomId,
      taskType: (task.taskType || "checkout_clean") as "checkout_clean" | "stayover_clean" | "deep_clean" | "inspection" | "turndown" | "maintenance_prep",
      status: (task.status || "pending") as "pending" | "in_progress" | "completed" | "inspected",
      priority: (task.priority || "normal") as "low" | "normal" | "high" | "urgent",
      assignedTo: task.assignedTo ?? null,
      notes: task.notes ?? null,
      scheduledDate: task.scheduledDate,
      startedAt: task.startedAt ?? null,
      completedAt: task.completedAt ?? null,
      inspectedBy: task.inspectedBy ?? null,
      inspectedAt: task.inspectedAt ?? null,
      createdAt: task.createdAt,
    };
    this.housekeepingTasks.set(id, newTask);
    return newTask;
  }

  async updateHousekeepingTask(id: string, task: Partial<InsertHousekeepingTask>): Promise<HousekeepingTask | undefined> {
    const existing = this.housekeepingTasks.get(id);
    if (!existing) return undefined;
    
    const updated: HousekeepingTask = { 
      ...existing, 
      ...task,
      status: (task.status ?? existing.status) as "pending" | "in_progress" | "completed" | "inspected",
      taskType: (task.taskType ?? existing.taskType) as "checkout_clean" | "stayover_clean" | "deep_clean" | "inspection" | "turndown" | "maintenance_prep",
      priority: (task.priority ?? existing.priority) as "low" | "normal" | "high" | "urgent",
    };
    this.housekeepingTasks.set(id, updated);
    return updated;
  }

  async deleteHousekeepingTask(id: string): Promise<boolean> {
    return this.housekeepingTasks.delete(id);
  }

  async createCheckoutCleaningTask(roomId: string): Promise<HousekeepingTask> {
    const today = new Date().toISOString().split("T")[0];
    return this.createHousekeepingTask({
      roomId,
      taskType: "checkout_clean",
      status: "pending",
      priority: "high",
      scheduledDate: today,
      createdAt: new Date(),
    });
  }

  // ==================== RESTAURANT ====================
  async getRestaurantAreas(): Promise<RestaurantArea[]> {
    return Array.from(this.restaurantAreas.values()).filter(a => a.isActive === "true");
  }

  async getRestaurantArea(id: string): Promise<RestaurantArea | undefined> {
    return this.restaurantAreas.get(id);
  }

  async createRestaurantArea(area: InsertRestaurantArea): Promise<RestaurantArea> {
    const id = randomUUID();
    const newArea: RestaurantArea = { 
      id, 
      name: area.name,
      areaType: (area.areaType ?? "indoor") as "indoor" | "outdoor" | "terrace" | "bar" | "private",
      capacity: area.capacity ?? 20,
      isActive: area.isActive ?? "true",
      notes: area.notes ?? null,
    };
    this.restaurantAreas.set(id, newArea);
    return newArea;
  }

  async updateRestaurantArea(id: string, area: Partial<InsertRestaurantArea>): Promise<RestaurantArea | undefined> {
    const existing = this.restaurantAreas.get(id);
    if (!existing) return undefined;
    const updated: RestaurantArea = { 
      ...existing, 
      ...area,
      areaType: (area.areaType ?? existing.areaType) as "indoor" | "outdoor" | "terrace" | "bar" | "private",
    };
    this.restaurantAreas.set(id, updated);
    return updated;
  }

  async deleteRestaurantArea(id: string): Promise<boolean> {
    return this.restaurantAreas.delete(id);
  }

  async getRestaurantTables(): Promise<RestaurantTableWithArea[]> {
    return Array.from(this.restaurantTables.values())
      .filter(t => t.isActive === "true")
      .map(table => ({
        ...table,
        area: this.restaurantAreas.get(table.areaId)!,
      }));
  }

  async getRestaurantTable(id: string): Promise<RestaurantTableWithArea | undefined> {
    const table = this.restaurantTables.get(id);
    if (!table) return undefined;
    return { ...table, area: this.restaurantAreas.get(table.areaId)! };
  }

  async getTablesByArea(areaId: string): Promise<RestaurantTable[]> {
    return Array.from(this.restaurantTables.values()).filter(t => t.areaId === areaId);
  }

  async createRestaurantTable(table: InsertRestaurantTable): Promise<RestaurantTable> {
    const id = randomUUID();
    const newTable: RestaurantTable = { 
      id, 
      tableNumber: table.tableNumber,
      areaId: table.areaId,
      capacity: table.capacity ?? 4,
      shape: (table.shape ?? "square") as "square" | "round" | "rectangular",
      status: (table.status ?? "available") as "available" | "occupied" | "reserved" | "cleaning" | "blocked",
      positionX: table.positionX ?? 0,
      positionY: table.positionY ?? 0,
      isActive: table.isActive ?? "true",
    };
    this.restaurantTables.set(id, newTable);
    return newTable;
  }

  async updateRestaurantTable(id: string, table: Partial<InsertRestaurantTable>): Promise<RestaurantTable | undefined> {
    const existing = this.restaurantTables.get(id);
    if (!existing) return undefined;
    const updated: RestaurantTable = { 
      ...existing, 
      ...table,
      status: (table.status ?? existing.status) as "available" | "occupied" | "reserved" | "cleaning" | "blocked",
      shape: (table.shape ?? existing.shape) as "square" | "round" | "rectangular",
    };
    this.restaurantTables.set(id, updated);
    return updated;
  }

  async deleteRestaurantTable(id: string): Promise<boolean> {
    return this.restaurantTables.delete(id);
  }

  async getMenuCategories(): Promise<MenuCategory[]> {
    return Array.from(this.menuCategories.values())
      .filter(c => c.isActive === "true")
      .sort((a, b) => (a.displayOrder ?? 0) - (b.displayOrder ?? 0));
  }

  async getMenuCategory(id: string): Promise<MenuCategory | undefined> {
    return this.menuCategories.get(id);
  }

  async createMenuCategory(category: InsertMenuCategory): Promise<MenuCategory> {
    const id = randomUUID();
    const newCategory: MenuCategory = { 
      id, 
      name: category.name,
      description: category.description ?? null,
      displayOrder: category.displayOrder ?? 0,
      isActive: category.isActive ?? "true",
    };
    this.menuCategories.set(id, newCategory);
    return newCategory;
  }

  async updateMenuCategory(id: string, category: Partial<InsertMenuCategory>): Promise<MenuCategory | undefined> {
    const existing = this.menuCategories.get(id);
    if (!existing) return undefined;
    const updated = { ...existing, ...category };
    this.menuCategories.set(id, updated);
    return updated;
  }

  async deleteMenuCategory(id: string): Promise<boolean> {
    return this.menuCategories.delete(id);
  }

  async getMenuItems(): Promise<MenuItemWithCategory[]> {
    return Array.from(this.menuItems.values())
      .filter(i => i.isActive === "true")
      .map(item => ({
        ...item,
        category: this.menuCategories.get(item.categoryId)!,
      }))
      .sort((a, b) => (a.displayOrder ?? 0) - (b.displayOrder ?? 0));
  }

  async getMenuItem(id: string): Promise<MenuItemWithCategory | undefined> {
    const item = this.menuItems.get(id);
    if (!item) return undefined;
    return { ...item, category: this.menuCategories.get(item.categoryId)! };
  }

  async getMenuItemsByCategory(categoryId: string): Promise<MenuItem[]> {
    return Array.from(this.menuItems.values()).filter(i => i.categoryId === categoryId);
  }

  async createMenuItem(item: InsertMenuItem): Promise<MenuItem> {
    const id = randomUUID();
    const newItem: MenuItem = { 
      id, 
      categoryId: item.categoryId,
      name: item.name,
      description: item.description ?? null,
      price: item.price,
      preparationTime: item.preparationTime ?? null,
      isAvailable: item.isAvailable ?? "true",
      isActive: item.isActive ?? "true",
      allergens: item.allergens ?? null,
      displayOrder: item.displayOrder ?? 0,
    };
    this.menuItems.set(id, newItem);
    return newItem;
  }

  async updateMenuItem(id: string, item: Partial<InsertMenuItem>): Promise<MenuItem | undefined> {
    const existing = this.menuItems.get(id);
    if (!existing) return undefined;
    const updated = { ...existing, ...item };
    this.menuItems.set(id, updated);
    return updated;
  }

  async deleteMenuItem(id: string): Promise<boolean> {
    return this.menuItems.delete(id);
  }

  async getRestaurantOrders(status?: OrderStatus): Promise<RestaurantOrderWithDetails[]> {
    let orders = Array.from(this.restaurantOrders.values());
    if (status) {
      orders = orders.filter(o => o.status === status);
    }
    return orders.map(order => {
      const table = order.tableId ? this.restaurantTables.get(order.tableId) : undefined;
      const tableArea = table ? this.restaurantAreas.get(table.areaId) : undefined;
      const area = order.areaId ? this.restaurantAreas.get(order.areaId) : tableArea;
      const guest = order.guestId ? this.guests.get(order.guestId) : undefined;
      const items = Array.from(this.orderItems.values())
        .filter(i => i.orderId === order.id)
        .map(item => ({
          ...item,
          menuItem: this.menuItems.get(item.menuItemId)!,
        }));
      return {
        ...order,
        table: table ? { ...table, area: tableArea! } : undefined,
        area,
        guest,
        items,
      };
    }).sort((a, b) => b.openedAt.localeCompare(a.openedAt));
  }

  async getRestaurantOrder(id: string): Promise<RestaurantOrderWithDetails | undefined> {
    const order = this.restaurantOrders.get(id);
    if (!order) return undefined;
    const table = order.tableId ? this.restaurantTables.get(order.tableId) : undefined;
    const tableArea = table ? this.restaurantAreas.get(table.areaId) : undefined;
    const area = order.areaId ? this.restaurantAreas.get(order.areaId) : tableArea;
    const guest = order.guestId ? this.guests.get(order.guestId) : undefined;
    const items = Array.from(this.orderItems.values())
      .filter(i => i.orderId === order.id)
      .map(item => ({
        ...item,
        menuItem: this.menuItems.get(item.menuItemId)!,
      }));
    return {
      ...order,
      table: table ? { ...table, area: tableArea! } : undefined,
      area,
      guest,
      items,
    };
  }

  async getOrdersByTable(tableId: string): Promise<RestaurantOrder[]> {
    return Array.from(this.restaurantOrders.values()).filter(o => o.tableId === tableId);
  }

  async createRestaurantOrder(order: InsertRestaurantOrder): Promise<RestaurantOrder> {
    const id = randomUUID();
    const newOrder: RestaurantOrder = { 
      id,
      orderNumber: order.orderNumber,
      tableId: order.tableId ?? null,
      areaId: order.areaId ?? null,
      reservationId: order.reservationId ?? null,
      guestId: order.guestId ?? null,
      orderType: (order.orderType ?? "dine_in") as "dine_in" | "room_service" | "takeaway",
      status: (order.status ?? "open") as "open" | "in_progress" | "served" | "closed" | "cancelled",
      covers: order.covers ?? 1,
      waiterName: order.waiterName ?? null,
      orderLabel: order.orderLabel ?? null,
      activeCourse: order.activeCourse ?? 1,
      subtotal: order.subtotal ?? "0",
      tax: order.tax ?? "0",
      total: order.total ?? "0",
      notes: order.notes ?? null,
      openedAt: order.openedAt,
      closedAt: order.closedAt ?? null,
      chargedToRoom: order.chargedToRoom ?? "false",
      roomNumber: order.roomNumber ?? null,
      receiptType: order.receiptType ?? null,
      paymentMethod: order.paymentMethod ?? null,
    };
    this.restaurantOrders.set(id, newOrder);
    return newOrder;
  }

  async updateRestaurantOrder(id: string, order: Partial<InsertRestaurantOrder>): Promise<RestaurantOrder | undefined> {
    const existing = this.restaurantOrders.get(id);
    if (!existing) return undefined;
    const updated: RestaurantOrder = { 
      ...existing, 
      ...order,
      status: (order.status ?? existing.status) as "open" | "in_progress" | "served" | "closed" | "cancelled",
      orderType: (order.orderType ?? existing.orderType) as "dine_in" | "room_service" | "takeaway",
    };
    this.restaurantOrders.set(id, updated);
    return updated;
  }

  async deleteRestaurantOrder(id: string): Promise<boolean> {
    return this.restaurantOrders.delete(id);
  }

  generateOrderNumber(): string {
    this.orderCounter++;
    const today = new Date();
    const dateStr = `${today.getFullYear()}${String(today.getMonth() + 1).padStart(2, "0")}${String(today.getDate()).padStart(2, "0")}`;
    return `ORD-${dateStr}-${this.orderCounter}`;
  }

  async getOrderItems(orderId: string): Promise<OrderItem[]> {
    return Array.from(this.orderItems.values()).filter(i => i.orderId === orderId);
  }

  async createOrderItem(item: InsertOrderItem): Promise<OrderItem> {
    const id = randomUUID();
    const newItem: OrderItem = { 
      id,
      orderId: item.orderId,
      menuItemId: item.menuItemId,
      quantity: item.quantity ?? 1,
      unitPrice: item.unitPrice,
      subtotal: item.subtotal,
      status: (item.status ?? "pending") as "pending" | "preparing" | "ready" | "served" | "cancelled" | "waiting_course",
      course: item.course ?? 1,
      notes: item.notes ?? null,
      sentAt: item.sentAt ?? null,
    };
    this.orderItems.set(id, newItem);
    return newItem;
  }

  async updateOrderItem(id: string, item: Partial<InsertOrderItem>): Promise<OrderItem | undefined> {
    const existing = this.orderItems.get(id);
    if (!existing) return undefined;
    const updated: OrderItem = { 
      ...existing, 
      ...item,
      status: (item.status ?? existing.status) as "pending" | "preparing" | "ready" | "served" | "cancelled" | "waiting_course",
    };
    this.orderItems.set(id, updated);
    return updated;
  }

  async deleteOrderItem(id: string): Promise<boolean> {
    return this.orderItems.delete(id);
  }

  // Table Reservations
  async getTableReservations(): Promise<TableReservationWithTable[]> {
    const reservations = Array.from(this.tableReservations.values());
    return reservations.map(r => ({
      ...r,
      table: this.restaurantTables.get(r.tableId)!,
    })).filter(r => r.table);
  }

  async getTableReservation(id: string): Promise<TableReservationWithTable | undefined> {
    const reservation = this.tableReservations.get(id);
    if (!reservation) return undefined;
    const table = this.restaurantTables.get(reservation.tableId);
    if (!table) return undefined;
    return { ...reservation, table };
  }

  async getTableReservationsByDate(date: string): Promise<TableReservationWithTable[]> {
    const reservations = Array.from(this.tableReservations.values())
      .filter(r => r.reservationDate === date && r.status !== "cancelled");
    return reservations.map(r => ({
      ...r,
      table: this.restaurantTables.get(r.tableId)!,
    })).filter(r => r.table);
  }

  async getTableReservationsByTable(tableId: string): Promise<TableReservation[]> {
    return Array.from(this.tableReservations.values())
      .filter(r => r.tableId === tableId);
  }

  async createTableReservation(reservation: InsertTableReservation): Promise<TableReservation> {
    const id = randomUUID();
    const newReservation: TableReservation = {
      id,
      tableId: reservation.tableId,
      guestName: reservation.guestName,
      guestPhone: reservation.guestPhone ?? null,
      guestEmail: reservation.guestEmail ?? null,
      partySize: reservation.partySize ?? 2,
      reservationDate: reservation.reservationDate,
      reservationTime: reservation.reservationTime,
      status: (reservation.status ?? "pending") as "pending" | "confirmed" | "seated" | "completed" | "cancelled" | "no_show",
      notes: reservation.notes ?? null,
      createdAt: reservation.createdAt,
    };
    this.tableReservations.set(id, newReservation);
    return newReservation;
  }

  async updateTableReservation(id: string, reservation: Partial<InsertTableReservation>): Promise<TableReservation | undefined> {
    const existing = this.tableReservations.get(id);
    if (!existing) return undefined;
    const updated = { ...existing, ...reservation } as TableReservation;
    this.tableReservations.set(id, updated);
    return updated;
  }

  async deleteTableReservation(id: string): Promise<boolean> {
    return this.tableReservations.delete(id);
  }

  // Restaurant Time Slots
  async getRestaurantTimeSlots(): Promise<RestaurantTimeSlot[]> {
    return Array.from(this.restaurantTimeSlots.values())
      .filter(s => s.isActive === "true")
      .sort((a, b) => (a.displayOrder ?? 0) - (b.displayOrder ?? 0));
  }

  async createRestaurantTimeSlot(slot: InsertRestaurantTimeSlot): Promise<RestaurantTimeSlot> {
    const id = randomUUID();
    const newSlot: RestaurantTimeSlot = {
      id,
      time: slot.time,
      label: slot.label ?? null,
      isActive: slot.isActive ?? "true",
      displayOrder: slot.displayOrder ?? 0,
    };
    this.restaurantTimeSlots.set(id, newSlot);
    return newSlot;
  }

  async updateRestaurantTimeSlot(id: string, slot: Partial<InsertRestaurantTimeSlot>): Promise<RestaurantTimeSlot | undefined> {
    const existing = this.restaurantTimeSlots.get(id);
    if (!existing) return undefined;
    const updated = { ...existing, ...slot } as RestaurantTimeSlot;
    this.restaurantTimeSlots.set(id, updated);
    return updated;
  }

  async deleteRestaurantTimeSlot(id: string): Promise<boolean> {
    return this.restaurantTimeSlots.delete(id);
  }

  // Recipes
  async getRecipes(): Promise<RecipeWithIngredients[]> {
    return Array.from(this.recipesMap.values()).map(recipe => {
      const menuItem = this.menuItems.get(recipe.menuItemId);
      const ingredients = Array.from(this.recipeIngredientsMap.values())
        .filter(i => i.recipeId === recipe.id);
      return { ...recipe, menuItem, ingredients };
    });
  }

  async getRecipe(id: string): Promise<RecipeWithIngredients | undefined> {
    const recipe = this.recipesMap.get(id);
    if (!recipe) return undefined;
    const menuItem = this.menuItems.get(recipe.menuItemId);
    const ingredients = Array.from(this.recipeIngredientsMap.values())
      .filter(i => i.recipeId === recipe.id);
    return { ...recipe, menuItem, ingredients };
  }

  async getRecipeByMenuItem(menuItemId: string): Promise<RecipeWithIngredients | undefined> {
    const recipe = Array.from(this.recipesMap.values()).find(r => r.menuItemId === menuItemId);
    if (!recipe) return undefined;
    const menuItem = this.menuItems.get(recipe.menuItemId);
    const ingredients = Array.from(this.recipeIngredientsMap.values())
      .filter(i => i.recipeId === recipe.id);
    return { ...recipe, menuItem, ingredients };
  }

  async createRecipe(recipe: InsertRecipe): Promise<Recipe> {
    const id = randomUUID();
    const newRecipe: Recipe = {
      id,
      menuItemId: recipe.menuItemId,
      notes: recipe.notes ?? null,
    };
    this.recipesMap.set(id, newRecipe);
    return newRecipe;
  }

  async updateRecipe(id: string, recipe: Partial<InsertRecipe>): Promise<Recipe | undefined> {
    const existing = this.recipesMap.get(id);
    if (!existing) return undefined;
    const updated = { ...existing, ...recipe } as Recipe;
    this.recipesMap.set(id, updated);
    return updated;
  }

  async deleteRecipe(id: string): Promise<boolean> {
    Array.from(this.recipeIngredientsMap.entries())
      .filter(([_, i]) => i.recipeId === id)
      .forEach(([key]) => this.recipeIngredientsMap.delete(key));
    return this.recipesMap.delete(id);
  }

  // Recipe Ingredients
  async getRecipeIngredients(recipeId: string): Promise<RecipeIngredient[]> {
    return Array.from(this.recipeIngredientsMap.values())
      .filter(i => i.recipeId === recipeId);
  }

  async createRecipeIngredient(ingredient: InsertRecipeIngredient): Promise<RecipeIngredient> {
    const id = randomUUID();
    const newIngredient: RecipeIngredient = {
      id,
      recipeId: ingredient.recipeId,
      inventoryItemId: ingredient.inventoryItemId ?? null,
      ingredientName: ingredient.ingredientName,
      quantity: ingredient.quantity,
      unit: ingredient.unit,
      unitCost: ingredient.unitCost ?? "0",
    };
    this.recipeIngredientsMap.set(id, newIngredient);
    return newIngredient;
  }

  async updateRecipeIngredient(id: string, ingredient: Partial<InsertRecipeIngredient>): Promise<RecipeIngredient | undefined> {
    const existing = this.recipeIngredientsMap.get(id);
    if (!existing) return undefined;
    const updated = { ...existing, ...ingredient } as RecipeIngredient;
    this.recipeIngredientsMap.set(id, updated);
    return updated;
  }

  async deleteRecipeIngredient(id: string): Promise<boolean> {
    return this.recipeIngredientsMap.delete(id);
  }

  // Order Splits
  async getOrderSplits(orderId: string): Promise<OrderSplit[]> {
    return Array.from(this.orderSplitsMap.values())
      .filter(s => s.orderId === orderId)
      .sort((a, b) => a.splitNumber - b.splitNumber);
  }

  async createOrderSplit(split: InsertOrderSplit): Promise<OrderSplit> {
    const id = randomUUID();
    const newSplit: OrderSplit = {
      id,
      orderId: split.orderId,
      splitNumber: split.splitNumber,
      amount: split.amount,
      method: split.method ?? null,
      receiptType: split.receiptType ?? null,
      isPaid: split.isPaid ?? "false",
      paidAt: split.paidAt ?? null,
      createdAt: split.createdAt ? new Date(split.createdAt as string) : new Date(),
    };
    this.orderSplitsMap.set(id, newSplit);
    return newSplit;
  }

  async updateOrderSplit(id: string, split: Partial<InsertOrderSplit>): Promise<OrderSplit | undefined> {
    const existing = this.orderSplitsMap.get(id);
    if (!existing) return undefined;
    const updated: OrderSplit = { ...existing, ...split };
    this.orderSplitsMap.set(id, updated);
    return updated;
  }

  async deleteOrderSplitsByOrder(orderId: string): Promise<boolean> {
    const toDelete = Array.from(this.orderSplitsMap.values()).filter(s => s.orderId === orderId);
    toDelete.forEach(s => this.orderSplitsMap.delete(s.id));
    return true;
  }

  // ==================== INVENTORY ====================
  async getItemCategories(): Promise<ItemCategory[]> {
    return Array.from(this.itemCategories.values()).filter(c => c.isActive === "true");
  }

  async getItemCategory(id: string): Promise<ItemCategory | undefined> {
    return this.itemCategories.get(id);
  }

  async createItemCategory(category: InsertItemCategory): Promise<ItemCategory> {
    const id = randomUUID();
    const newCategory: ItemCategory = { 
      id, 
      name: category.name,
      description: category.description ?? null,
      parentId: category.parentId ?? null,
      isActive: category.isActive ?? "true",
    };
    this.itemCategories.set(id, newCategory);
    return newCategory;
  }

  async updateItemCategory(id: string, category: Partial<InsertItemCategory>): Promise<ItemCategory | undefined> {
    const existing = this.itemCategories.get(id);
    if (!existing) return undefined;
    const updated = { ...existing, ...category };
    this.itemCategories.set(id, updated);
    return updated;
  }

  async deleteItemCategory(id: string): Promise<boolean> {
    return this.itemCategories.delete(id);
  }

  async getSuppliers(): Promise<Supplier[]> {
    return Array.from(this.suppliers.values()).filter(s => s.isActive === "true");
  }

  async getSupplier(id: string): Promise<Supplier | undefined> {
    return this.suppliers.get(id);
  }

  async createSupplier(supplier: InsertSupplier): Promise<Supplier> {
    const id = randomUUID();
    const newSupplier: Supplier = { 
      id, 
      name: supplier.name,
      contactName: supplier.contactName ?? null,
      phone: supplier.phone ?? null,
      email: supplier.email ?? null,
      address: supplier.address ?? null,
      cuit: supplier.cuit ?? null,
      paymentTermDays: supplier.paymentTermDays ?? 30,
      notes: supplier.notes ?? null,
      isActive: supplier.isActive ?? "true",
    };
    this.suppliers.set(id, newSupplier);
    return newSupplier;
  }

  async updateSupplier(id: string, supplier: Partial<InsertSupplier>): Promise<Supplier | undefined> {
    const existing = this.suppliers.get(id);
    if (!existing) return undefined;
    const updated = { ...existing, ...supplier };
    this.suppliers.set(id, updated);
    return updated;
  }

  async deleteSupplier(id: string): Promise<boolean> {
    return this.suppliers.delete(id);
  }

  async getInventoryItems(): Promise<InventoryItemWithDetails[]> {
    return Array.from(this.inventoryItems.values())
      .filter(i => i.isActive === "true")
      .map(item => ({
        ...item,
        category: item.categoryId ? this.itemCategories.get(item.categoryId) : undefined,
        supplier: item.supplierId ? this.suppliers.get(item.supplierId) : undefined,
      }));
  }

  async getInventoryItem(id: string): Promise<InventoryItemWithDetails | undefined> {
    const item = this.inventoryItems.get(id);
    if (!item) return undefined;
    return {
      ...item,
      category: item.categoryId ? this.itemCategories.get(item.categoryId) : undefined,
      supplier: item.supplierId ? this.suppliers.get(item.supplierId) : undefined,
    };
  }

  async getInventoryItemsBelowMinStock(): Promise<InventoryItem[]> {
    return Array.from(this.inventoryItems.values())
      .filter(i => i.isActive === "true" && (i.currentStock ?? 0) < (i.minStock ?? 0));
  }

  async createInventoryItem(item: InsertInventoryItem): Promise<InventoryItem> {
    const id = randomUUID();
    const newItem: InventoryItem = { 
      id,
      sku: item.sku ?? null,
      name: item.name,
      description: item.description ?? null,
      categoryId: item.categoryId ?? null,
      supplierId: item.supplierId ?? null,
      unit: (item.unit ?? "unidad") as "unidad" | "kg" | "g" | "litro" | "ml" | "caja" | "paquete" | "docena",
      costPrice: item.costPrice ?? "0",
      minStock: item.minStock ?? 0,
      maxStock: item.maxStock ?? null,
      currentStock: item.currentStock ?? 0,
      location: item.location ?? null,
      isActive: item.isActive ?? "true",
    };
    this.inventoryItems.set(id, newItem);
    return newItem;
  }

  async updateInventoryItem(id: string, item: Partial<InsertInventoryItem>): Promise<InventoryItem | undefined> {
    const existing = this.inventoryItems.get(id);
    if (!existing) return undefined;
    const updated: InventoryItem = { 
      ...existing, 
      ...item,
      unit: (item.unit ?? existing.unit) as "unidad" | "kg" | "g" | "litro" | "ml" | "caja" | "paquete" | "docena",
    };
    this.inventoryItems.set(id, updated);
    return updated;
  }

  async deleteInventoryItem(id: string): Promise<boolean> {
    return this.inventoryItems.delete(id);
  }

  async getStockMovements(itemId?: string): Promise<StockMovementWithItem[]> {
    let movements = Array.from(this.stockMovements.values());
    if (itemId) {
      movements = movements.filter(m => m.itemId === itemId);
    }
    return movements
      .map(movement => ({
        ...movement,
        item: this.inventoryItems.get(movement.itemId)!,
      }))
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  async createStockMovement(movement: InsertStockMovement): Promise<StockMovement> {
    const id = randomUUID();
    const newMovement: StockMovement = { 
      id,
      itemId: movement.itemId,
      movementType: movement.movementType as "entrada" | "salida" | "ajuste" | "transferencia" | "consumo",
      quantity: movement.quantity,
      previousStock: movement.previousStock,
      newStock: movement.newStock,
      unitCost: movement.unitCost ?? null,
      reference: movement.reference ?? null,
      notes: movement.notes ?? null,
      createdAt: movement.createdAt,
      createdBy: movement.createdBy ?? null,
    };
    this.stockMovements.set(id, newMovement);
    
    // Update current stock in the inventory item
    const item = this.inventoryItems.get(movement.itemId);
    if (item) {
      item.currentStock = movement.newStock;
      this.inventoryItems.set(movement.itemId, item);
    }
    
    return newMovement;
  }

  // ==================== SPA METHODS ====================

  async getSpaCabins(): Promise<SpaCabin[]> {
    return Array.from(this.spaCabins.values()).filter(c => c.isActive === "true");
  }

  async getSpaCabin(id: string): Promise<SpaCabin | undefined> {
    return this.spaCabins.get(id);
  }

  async createSpaCabin(cabin: InsertSpaCabin): Promise<SpaCabin> {
    const id = randomUUID();
    const newCabin: SpaCabin = {
      id,
      name: cabin.name,
      description: cabin.description ?? null,
      isActive: cabin.isActive ?? "true",
    };
    this.spaCabins.set(id, newCabin);
    return newCabin;
  }

  async updateSpaCabin(id: string, cabin: Partial<InsertSpaCabin>): Promise<SpaCabin | undefined> {
    const existing = this.spaCabins.get(id);
    if (!existing) return undefined;
    const updated = { ...existing, ...cabin };
    this.spaCabins.set(id, updated);
    return updated;
  }

  async deleteSpaCabin(id: string): Promise<boolean> {
    return this.spaCabins.delete(id);
  }

  async getSpaTreatmentCategories(): Promise<SpaTreatmentCategory[]> {
    return Array.from(this.spaTreatmentCategories.values()).sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));
  }

  async getSpaTreatmentCategory(id: string): Promise<SpaTreatmentCategory | undefined> {
    return this.spaTreatmentCategories.get(id);
  }

  async createSpaTreatmentCategory(category: InsertSpaTreatmentCategory): Promise<SpaTreatmentCategory> {
    const id = randomUUID();
    const newCategory: SpaTreatmentCategory = {
      id,
      name: category.name,
      description: category.description ?? null,
      sortOrder: category.sortOrder ?? 0,
    };
    this.spaTreatmentCategories.set(id, newCategory);
    return newCategory;
  }

  async updateSpaTreatmentCategory(id: string, category: Partial<InsertSpaTreatmentCategory>): Promise<SpaTreatmentCategory | undefined> {
    const existing = this.spaTreatmentCategories.get(id);
    if (!existing) return undefined;
    const updated = { ...existing, ...category };
    this.spaTreatmentCategories.set(id, updated);
    return updated;
  }

  async deleteSpaTreatmentCategory(id: string): Promise<boolean> {
    return this.spaTreatmentCategories.delete(id);
  }

  async getSpaTreatments(): Promise<SpaTreatment[]> {
    return Array.from(this.spaTreatments.values()).filter(t => t.isActive === "true");
  }

  async getSpaTreatment(id: string): Promise<SpaTreatment | undefined> {
    return this.spaTreatments.get(id);
  }

  async getSpaTreatmentsByCategory(categoryId: string): Promise<SpaTreatment[]> {
    return Array.from(this.spaTreatments.values()).filter(t => t.categoryId === categoryId && t.isActive === "true");
  }

  async createSpaTreatment(treatment: InsertSpaTreatment): Promise<SpaTreatment> {
    const id = randomUUID();
    const newTreatment: SpaTreatment = {
      id,
      categoryId: treatment.categoryId ?? null,
      name: treatment.name,
      description: treatment.description ?? null,
      durationMinutes: treatment.durationMinutes ?? 60,
      price: treatment.price ?? "0",
      isActive: treatment.isActive ?? "true",
    };
    this.spaTreatments.set(id, newTreatment);
    return newTreatment;
  }

  async updateSpaTreatment(id: string, treatment: Partial<InsertSpaTreatment>): Promise<SpaTreatment | undefined> {
    const existing = this.spaTreatments.get(id);
    if (!existing) return undefined;
    const updated = { ...existing, ...treatment };
    this.spaTreatments.set(id, updated);
    return updated;
  }

  async deleteSpaTreatment(id: string): Promise<boolean> {
    return this.spaTreatments.delete(id);
  }

  async getSpaAppointments(date?: string): Promise<SpaAppointmentWithDetails[]> {
    let appointments = Array.from(this.spaAppointments.values());
    if (date) {
      appointments = appointments.filter(a => a.appointmentDate === date);
    }
    return appointments.map(a => ({
      ...a,
      cabin: this.spaCabins.get(a.cabinId)!,
      treatment: this.spaTreatments.get(a.treatmentId)!,
    })).sort((a, b) => a.startTime.localeCompare(b.startTime));
  }

  async getSpaAppointment(id: string): Promise<SpaAppointmentWithDetails | undefined> {
    const appointment = this.spaAppointments.get(id);
    if (!appointment) return undefined;
    return {
      ...appointment,
      cabin: this.spaCabins.get(appointment.cabinId)!,
      treatment: this.spaTreatments.get(appointment.treatmentId)!,
    };
  }

  async getSpaAppointmentsByCabin(cabinId: string, date: string): Promise<SpaAppointment[]> {
    return Array.from(this.spaAppointments.values())
      .filter(a => a.cabinId === cabinId && a.appointmentDate === date);
  }

  async getSpaAppointmentsByDateRange(startDate: string, endDate: string): Promise<SpaAppointmentWithDetails[]> {
    return Array.from(this.spaAppointments.values())
      .filter(a => a.appointmentDate >= startDate && a.appointmentDate <= endDate)
      .map(a => ({
        ...a,
        cabin: this.spaCabins.get(a.cabinId)!,
        treatment: this.spaTreatments.get(a.treatmentId)!,
      }))
      .sort((a, b) => {
        if (a.appointmentDate !== b.appointmentDate) {
          return a.appointmentDate.localeCompare(b.appointmentDate);
        }
        return a.startTime.localeCompare(b.startTime);
      });
  }

  async createSpaAppointment(appointment: InsertSpaAppointment): Promise<SpaAppointment> {
    const id = randomUUID();
    const newAppointment: SpaAppointment = {
      id,
      cabinId: appointment.cabinId,
      treatmentId: appointment.treatmentId,
      guestName: appointment.guestName,
      guestLastName: appointment.guestLastName ?? null,
      guestPhone: appointment.guestPhone ?? null,
      guestEmail: appointment.guestEmail ?? null,
      reservationId: appointment.reservationId ?? null,
      appointmentDate: appointment.appointmentDate,
      startTime: appointment.startTime,
      endTime: appointment.endTime,
      status: (appointment.status ?? "pending") as SpaAppointmentStatus,
      notes: appointment.notes ?? null,
      createdAt: appointment.createdAt,
    };
    this.spaAppointments.set(id, newAppointment);
    return newAppointment;
  }

  async updateSpaAppointment(id: string, appointment: Partial<InsertSpaAppointment>): Promise<SpaAppointment | undefined> {
    const existing = this.spaAppointments.get(id);
    if (!existing) return undefined;
    const updated: SpaAppointment = {
      ...existing,
      ...appointment,
      status: (appointment.status ?? existing.status) as SpaAppointmentStatus,
    };
    this.spaAppointments.set(id, updated);
    return updated;
  }

  async deleteSpaAppointment(id: string): Promise<boolean> {
    return this.spaAppointments.delete(id);
  }

  async getSpaAccounts(status?: SpaAccountStatus): Promise<SpaAccountWithItems[]> {
    let accounts = Array.from(this.spaAccounts.values());
    if (status) {
      accounts = accounts.filter(a => a.status === status);
    }
    return accounts.map(account => {
      const items = Array.from(this.spaAccountItems.values()).filter(i => i.accountId === account.id);
      const payments = Array.from(this.spaPayments.values()).filter(p => p.accountId === account.id);
      const appointment = this.spaAppointments.get(account.appointmentId);
      return {
        ...account,
        items,
        payments,
        appointment: appointment ? {
          ...appointment,
          cabin: this.spaCabins.get(appointment.cabinId)!,
          treatment: this.spaTreatments.get(appointment.treatmentId)!,
        } : undefined,
      };
    });
  }

  async getSpaAccount(id: string): Promise<SpaAccountWithItems | undefined> {
    const account = this.spaAccounts.get(id);
    if (!account) return undefined;
    const items = Array.from(this.spaAccountItems.values()).filter(i => i.accountId === id);
    const payments = Array.from(this.spaPayments.values()).filter(p => p.accountId === id);
    const appointment = this.spaAppointments.get(account.appointmentId);
    return {
      ...account,
      items,
      payments,
      appointment: appointment ? {
        ...appointment,
        cabin: this.spaCabins.get(appointment.cabinId)!,
        treatment: this.spaTreatments.get(appointment.treatmentId)!,
      } : undefined,
    };
  }

  async getSpaAccountByAppointment(appointmentId: string): Promise<SpaAccountWithItems | undefined> {
    const account = Array.from(this.spaAccounts.values()).find(a => a.appointmentId === appointmentId);
    if (!account) return undefined;
    return this.getSpaAccount(account.id);
  }

  async createSpaAccount(account: InsertSpaAccount): Promise<SpaAccount> {
    const id = randomUUID();
    const newAccount: SpaAccount = {
      id,
      appointmentId: account.appointmentId,
      guestName: account.guestName,
      reservationId: account.reservationId ?? null,
      status: (account.status ?? "open") as SpaAccountStatus,
      subtotal: account.subtotal ?? "0",
      total: account.total ?? "0",
      totalPaid: account.totalPaid ?? "0",
      receiptType: account.receiptType ?? null,
      notes: account.notes ?? null,
      openedAt: account.openedAt,
      closedAt: account.closedAt ?? null,
      closedBy: account.closedBy ?? null,
      chargedTo: account.chargedTo ?? null,
    };
    this.spaAccounts.set(id, newAccount);
    return newAccount;
  }

  async updateSpaAccount(id: string, account: Partial<InsertSpaAccount>): Promise<SpaAccount | undefined> {
    const existing = this.spaAccounts.get(id);
    if (!existing) return undefined;
    const updated: SpaAccount = {
      ...existing,
      ...account,
      status: (account.status ?? existing.status) as SpaAccountStatus,
    };
    this.spaAccounts.set(id, updated);
    return updated;
  }

  async closeSpaAccount(id: string, chargedTo: string, receiptType?: string): Promise<SpaAccount | undefined> {
    const account = this.spaAccounts.get(id);
    if (!account) return undefined;
    const items = Array.from(this.spaAccountItems.values()).filter(i => i.accountId === id);
    const total = items.reduce((sum, item) => sum + parseFloat(item.subtotal), 0);
    const payments = Array.from(this.spaPayments.values()).filter(p => p.accountId === id);
    const totalPaid = payments.reduce((sum, p) => sum + parseFloat(p.amount), 0);
    
    const updated: SpaAccount = {
      ...account,
      status: "closed",
      subtotal: total.toFixed(2),
      total: total.toFixed(2),
      totalPaid: totalPaid.toFixed(2),
      receiptType: receiptType ?? null,
      closedAt: new Date(),
      chargedTo,
    };
    this.spaAccounts.set(id, updated);

    // If charged to room, create a charge on the reservation
    if (chargedTo.startsWith("room:")) {
      const reservationId = chargedTo.replace("room:", "");
      const reservation = this.reservations.get(reservationId);
      if (reservation) {
        const chargeId = randomUUID();
        const charge: Charge = {
          id: chargeId,
          reservationId,
          category: "spa",
          description: "Servicios SPA",
          amount: total.toFixed(2),
          date: new Date().toISOString().split("T")[0],
          createdBy: null,
        };
        this.charges.set(chargeId, charge);
      }
    }

    return updated;
  }

  async getSpaAccountItems(accountId: string): Promise<SpaAccountItem[]> {
    return Array.from(this.spaAccountItems.values()).filter(i => i.accountId === accountId);
  }

  async createSpaAccountItem(item: InsertSpaAccountItem): Promise<SpaAccountItem> {
    const id = randomUUID();
    const newItem: SpaAccountItem = {
      id,
      accountId: item.accountId,
      description: item.description,
      quantity: item.quantity ?? 1,
      unitPrice: item.unitPrice,
      subtotal: item.subtotal,
      itemType: item.itemType ?? "treatment",
      notes: item.notes ?? null,
      createdAt: item.createdAt,
    };
    this.spaAccountItems.set(id, newItem);

    // Update account totals
    const account = this.spaAccounts.get(item.accountId);
    if (account) {
      const items = Array.from(this.spaAccountItems.values()).filter(i => i.accountId === item.accountId);
      const total = items.reduce((sum, i) => sum + parseFloat(i.subtotal), 0);
      account.subtotal = total.toFixed(2);
      account.total = total.toFixed(2);
      this.spaAccounts.set(item.accountId, account);
    }

    return newItem;
  }

  async updateSpaAccountItem(id: string, item: Partial<InsertSpaAccountItem>): Promise<SpaAccountItem | undefined> {
    const existing = this.spaAccountItems.get(id);
    if (!existing) return undefined;
    const updated = { ...existing, ...item };
    this.spaAccountItems.set(id, updated);

    // Update account totals
    const account = this.spaAccounts.get(existing.accountId);
    if (account) {
      const items = Array.from(this.spaAccountItems.values()).filter(i => i.accountId === existing.accountId);
      const total = items.reduce((sum, i) => sum + parseFloat(i.subtotal), 0);
      account.subtotal = total.toFixed(2);
      account.total = total.toFixed(2);
      this.spaAccounts.set(existing.accountId, account);
    }

    return updated;
  }

  async deleteSpaAccountItem(id: string): Promise<boolean> {
    const item = this.spaAccountItems.get(id);
    if (!item) return false;
    const accountId = item.accountId;
    const deleted = this.spaAccountItems.delete(id);

    // Update account totals
    if (deleted) {
      const account = this.spaAccounts.get(accountId);
      if (account) {
        const items = Array.from(this.spaAccountItems.values()).filter(i => i.accountId === accountId);
        const total = items.reduce((sum, i) => sum + parseFloat(i.subtotal), 0);
        account.subtotal = total.toFixed(2);
        account.total = total.toFixed(2);
        this.spaAccounts.set(accountId, account);
      }
    }

    return deleted;
  }

  async getSpaPayments(accountId: string): Promise<SpaPayment[]> {
    return Array.from(this.spaPayments.values()).filter(p => p.accountId === accountId);
  }

  async createSpaPayment(payment: InsertSpaPayment): Promise<SpaPayment> {
    const id = randomUUID();
    const newPayment: SpaPayment = {
      id,
      accountId: payment.accountId,
      amount: payment.amount,
      method: payment.method as SpaPaymentMethod,
      isAdvance: payment.isAdvance ?? "false",
      appointmentId: payment.appointmentId ?? null,
      reservationId: payment.reservationId ?? null,
      notes: payment.notes ?? null,
      createdAt: payment.createdAt,
    };
    this.spaPayments.set(id, newPayment);

    const account = this.spaAccounts.get(payment.accountId);
    if (account) {
      const allPayments = Array.from(this.spaPayments.values()).filter(p => p.accountId === payment.accountId);
      const totalPaid = allPayments.reduce((sum, p) => sum + parseFloat(p.amount), 0);
      account.totalPaid = totalPaid.toFixed(2);
      this.spaAccounts.set(payment.accountId, account);
    }

    return newPayment;
  }

  async deleteSpaPayment(id: string): Promise<boolean> {
    const payment = this.spaPayments.get(id);
    if (!payment) return false;
    const accountId = payment.accountId;
    const deleted = this.spaPayments.delete(id);

    if (deleted) {
      const account = this.spaAccounts.get(accountId);
      if (account) {
        const allPayments = Array.from(this.spaPayments.values()).filter(p => p.accountId === accountId);
        const totalPaid = allPayments.reduce((sum, p) => sum + parseFloat(p.amount), 0);
        account.totalPaid = totalPaid.toFixed(2);
        this.spaAccounts.set(accountId, account);
      }
    }

    return deleted;
  }

  // ==================== EVENTS ====================
  // Event Rooms
  async getEventRooms(): Promise<EventRoom[]> {
    return Array.from(this.eventRooms.values());
  }

  async getEventRoom(id: string): Promise<EventRoom | undefined> {
    return this.eventRooms.get(id);
  }

  async createEventRoom(room: InsertEventRoom): Promise<EventRoom> {
    const id = randomUUID();
    const newRoom: EventRoom = {
      id,
      name: room.name,
      capacity: room.capacity ?? 50,
      status: (room.status ?? "available") as EventRoomStatus,
      description: room.description ?? null,
      amenities: room.amenities ?? null,
      isActive: room.isActive ?? "true",
    };
    this.eventRooms.set(id, newRoom);
    return newRoom;
  }

  async updateEventRoom(id: string, room: Partial<InsertEventRoom>): Promise<EventRoom | undefined> {
    const existing = this.eventRooms.get(id);
    if (!existing) return undefined;
    const updated: EventRoom = {
      ...existing,
      ...room,
      status: (room.status ?? existing.status) as EventRoomStatus,
    };
    this.eventRooms.set(id, updated);
    return updated;
  }

  async deleteEventRoom(id: string): Promise<boolean> {
    return this.eventRooms.delete(id);
  }

  // Events
  async getEvents(): Promise<EventWithDetails[]> {
    return Array.from(this.events.values()).map(event => this.enrichEvent(event));
  }

  async getEvent(id: string): Promise<EventWithDetails | undefined> {
    const event = this.events.get(id);
    if (!event) return undefined;
    return this.enrichEvent(event);
  }

  async getEventsByDateRange(startDate: string, endDate: string): Promise<EventWithDetails[]> {
    const events = Array.from(this.events.values()).filter(event => {
      return event.startDate <= endDate && event.endDate >= startDate;
    });
    return events.map(event => this.enrichEvent(event));
  }

  private enrichEvent(event: HotelEvent): EventWithDetails {
    const eventRoom = this.eventRooms.get(event.eventRoomId)!;
    const company = event.companyId ? this.companies.get(event.companyId) : undefined;
    const charges = Array.from(this.eventCharges.values())
      .filter(c => c.eventId === event.id)
      .map(charge => {
        const chargeType = charge.chargeTypeId ? this.eventChargeTypes.get(charge.chargeTypeId) : undefined;
        return { ...charge, chargeType };
      });
    const payments = Array.from(this.eventPayments.values())
      .filter(p => p.eventId === event.id);
    return { ...event, eventRoom, company, charges, payments };
  }

  async createEvent(event: InsertEvent): Promise<HotelEvent> {
    const id = randomUUID();
    const newEvent: HotelEvent = {
      id,
      eventCode: event.eventCode,
      name: event.name,
      eventRoomId: event.eventRoomId,
      eventType: (event.eventType ?? "corporate") as EventType,
      contactName: event.contactName,
      contactPhone: event.contactPhone ?? null,
      contactEmail: event.contactEmail ?? null,
      companyId: event.companyId ?? null,
      startDate: event.startDate,
      endDate: event.endDate,
      startTime: event.startTime ?? null,
      endTime: event.endTime ?? null,
      attendees: event.attendees ?? 10,
      status: (event.status ?? "tentative") as EventStatus,
      notes: event.notes ?? null,
      receiptType: event.receiptType ?? null,
      closedAt: event.closedAt ?? null,
      totalAmount: event.totalAmount ?? null,
      totalPaid: event.totalPaid ?? null,
      createdAt: event.createdAt,
    };
    this.events.set(id, newEvent);
    return newEvent;
  }

  async updateEvent(id: string, event: Partial<InsertEvent>): Promise<HotelEvent | undefined> {
    const existing = this.events.get(id);
    if (!existing) return undefined;
    const updated: HotelEvent = { 
      ...existing, 
      ...event,
      eventType: (event.eventType ?? existing.eventType) as EventType,
      status: (event.status ?? existing.status) as EventStatus,
    };
    this.events.set(id, updated);
    return updated;
  }

  async deleteEvent(id: string): Promise<boolean> {
    // Also delete associated charges
    const chargesToDelete = Array.from(this.eventCharges.values()).filter(c => c.eventId === id);
    chargesToDelete.forEach(c => this.eventCharges.delete(c.id));
    return this.events.delete(id);
  }

  generateEventCode(): string {
    this.eventCounter++;
    const year = new Date().getFullYear();
    return `EVT-${year}-${this.eventCounter.toString().padStart(4, "0")}`;
  }

  // Event Charge Types
  async getEventChargeTypes(): Promise<EventChargeType[]> {
    return Array.from(this.eventChargeTypes.values());
  }

  async getEventChargeType(id: string): Promise<EventChargeType | undefined> {
    return this.eventChargeTypes.get(id);
  }

  async createEventChargeType(chargeType: InsertEventChargeType): Promise<EventChargeType> {
    const id = randomUUID();
    const newChargeType: EventChargeType = {
      id,
      code: chargeType.code,
      name: chargeType.name,
      defaultPrice: chargeType.defaultPrice ?? null,
      isActive: chargeType.isActive ?? "true",
    };
    this.eventChargeTypes.set(id, newChargeType);
    return newChargeType;
  }

  async updateEventChargeType(id: string, chargeType: Partial<InsertEventChargeType>): Promise<EventChargeType | undefined> {
    const existing = this.eventChargeTypes.get(id);
    if (!existing) return undefined;
    const updated: EventChargeType = { ...existing, ...chargeType };
    this.eventChargeTypes.set(id, updated);
    return updated;
  }

  async deleteEventChargeType(id: string): Promise<boolean> {
    return this.eventChargeTypes.delete(id);
  }

  // Event Charges
  async getEventCharges(eventId: string): Promise<EventChargeWithType[]> {
    const charges = Array.from(this.eventCharges.values()).filter(c => c.eventId === eventId);
    return charges.map(charge => {
      const chargeType = charge.chargeTypeId ? this.eventChargeTypes.get(charge.chargeTypeId) : undefined;
      return { ...charge, chargeType };
    });
  }

  async createEventCharge(charge: InsertEventCharge): Promise<EventCharge> {
    const id = randomUUID();
    const newCharge: EventCharge = {
      id,
      eventId: charge.eventId,
      chargeTypeId: charge.chargeTypeId ?? null,
      description: charge.description,
      quantity: charge.quantity ?? 1,
      unitPrice: charge.unitPrice,
      totalAmount: charge.totalAmount,
      date: charge.date,
      notes: charge.notes ?? null,
      createdAt: charge.createdAt,
    };
    this.eventCharges.set(id, newCharge);
    return newCharge;
  }

  async updateEventCharge(id: string, charge: Partial<InsertEventCharge>): Promise<EventCharge | undefined> {
    const existing = this.eventCharges.get(id);
    if (!existing) return undefined;
    const updated: EventCharge = { ...existing, ...charge };
    this.eventCharges.set(id, updated);
    return updated;
  }

  async deleteEventCharge(id: string): Promise<boolean> {
    return this.eventCharges.delete(id);
  }

  // Event Planning
  async getEventPlanningData(startDate: string, endDate: string): Promise<EventPlanningData> {
    const rooms = Array.from(this.eventRooms.values()).filter(r => r.isActive === "true");
    const days: string[] = [];
    const currentDate = new Date(startDate);
    const end = new Date(endDate);
    while (currentDate <= end) {
      days.push(currentDate.toISOString().split("T")[0]);
      currentDate.setDate(currentDate.getDate() + 1);
    }

    const eventsInRange = Array.from(this.events.values()).filter(event => {
      return event.startDate <= endDate && event.endDate >= startDate && event.status !== "cancelled";
    });

    const occupancy: Record<string, EventPlanningCellStatus[]> = {};
    const eventsMap: Record<string, { id: string; name: string; contactName: string; startDate: string; endDate: string; status: EventStatus; eventType: EventType }> = {};
    const cellEvents: Record<string, Record<string, string>> = {};

    rooms.forEach(room => {
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

    return { rooms, days, occupancy, events: eventsMap, cellEvents };
  }

  // Event Payments
  async getEventPayments(eventId: string): Promise<EventPayment[]> {
    return Array.from(this.eventPayments.values()).filter(p => p.eventId === eventId);
  }

  async createEventPayment(payment: InsertEventPayment): Promise<EventPayment> {
    const id = randomUUID();
    const newPayment: EventPayment = {
      id,
      eventId: payment.eventId,
      amount: payment.amount,
      method: payment.method,
      isAdvance: payment.isAdvance ?? "false",
      reservationId: payment.reservationId ?? null,
      notes: payment.notes ?? null,
      paidAt: payment.paidAt ? new Date(payment.paidAt as string) : new Date(),
      createdAt: payment.createdAt ? new Date(payment.createdAt as string) : new Date(),
    };
    this.eventPayments.set(id, newPayment);
    return newPayment;
  }

  async deleteEventPayment(id: string): Promise<boolean> {
    return this.eventPayments.delete(id);
  }

  // Event Tables
  async getEventTables(eventId: string): Promise<EventTableWithDetails[]> {
    return Array.from(this.eventTablesMap.values())
      .filter(t => t.eventId === eventId)
      .map(table => this.enrichEventTable(table));
  }

  async getEventTable(id: string): Promise<EventTableWithDetails | undefined> {
    const table = this.eventTablesMap.get(id);
    if (!table) return undefined;
    return this.enrichEventTable(table);
  }

  private enrichEventTable(table: EventTable): EventTableWithDetails {
    const charges = Array.from(this.eventTableCharges.values()).filter(c => c.eventTableId === table.id);
    const payments = Array.from(this.eventTablePayments.values()).filter(p => p.eventTableId === table.id);
    return { ...table, charges, payments };
  }

  async createEventTable(table: InsertEventTable): Promise<EventTable> {
    const id = randomUUID();
    const newTable: EventTable = {
      id,
      eventId: table.eventId,
      tableNumber: table.tableNumber,
      label: table.label ?? null,
      seats: table.seats ?? null,
      status: table.status ?? "open",
      reservationId: table.reservationId ?? null,
      receiptType: table.receiptType ?? null,
      closedAt: table.closedAt ?? null,
      createdAt: table.createdAt ? new Date(table.createdAt as string) : new Date(),
    };
    this.eventTablesMap.set(id, newTable);
    return newTable;
  }

  async updateEventTable(id: string, table: Partial<InsertEventTable>): Promise<EventTable | undefined> {
    const existing = this.eventTablesMap.get(id);
    if (!existing) return undefined;
    const updated: EventTable = { ...existing, ...table };
    this.eventTablesMap.set(id, updated);
    return updated;
  }

  async deleteEventTable(id: string): Promise<boolean> {
    const charges = Array.from(this.eventTableCharges.values()).filter(c => c.eventTableId === id);
    charges.forEach(c => this.eventTableCharges.delete(c.id));
    const payments = Array.from(this.eventTablePayments.values()).filter(p => p.eventTableId === id);
    payments.forEach(p => this.eventTablePayments.delete(p.id));
    return this.eventTablesMap.delete(id);
  }

  // Event Table Charges
  async getEventTableCharges(tableId: string): Promise<EventTableCharge[]> {
    return Array.from(this.eventTableCharges.values()).filter(c => c.eventTableId === tableId);
  }

  async createEventTableCharge(charge: InsertEventTableCharge): Promise<EventTableCharge> {
    const id = randomUUID();
    const newCharge: EventTableCharge = {
      id,
      eventTableId: charge.eventTableId,
      description: charge.description,
      quantity: charge.quantity ?? 1,
      unitPrice: charge.unitPrice,
      total: charge.total,
      createdAt: charge.createdAt ? new Date(charge.createdAt as string) : new Date(),
    };
    this.eventTableCharges.set(id, newCharge);
    return newCharge;
  }

  async deleteEventTableCharge(id: string): Promise<boolean> {
    return this.eventTableCharges.delete(id);
  }

  // Event Table Payments
  async getEventTablePayments(tableId: string): Promise<EventTablePayment[]> {
    return Array.from(this.eventTablePayments.values()).filter(p => p.eventTableId === tableId);
  }

  async createEventTablePayment(payment: InsertEventTablePayment): Promise<EventTablePayment> {
    const id = randomUUID();
    const newPayment: EventTablePayment = {
      id,
      eventTableId: payment.eventTableId,
      amount: payment.amount,
      method: payment.method,
      isAdvance: payment.isAdvance ?? "false",
      reservationId: payment.reservationId ?? null,
      receiptType: payment.receiptType ?? null,
      paidAt: payment.paidAt ? new Date(payment.paidAt as string) : new Date(),
      createdAt: payment.createdAt ? new Date(payment.createdAt as string) : new Date(),
    };
    this.eventTablePayments.set(id, newPayment);
    return newPayment;
  }

  async deleteEventTablePayment(id: string): Promise<boolean> {
    return this.eventTablePayments.delete(id);
  }

  // ==================== MAINTENANCE ====================

  // Maintenance Staff
  async getMaintenanceStaff(): Promise<MaintenanceStaff[]> {
    return Array.from(this.maintenanceStaff.values());
  }

  async getMaintenanceStaffMember(id: string): Promise<MaintenanceStaff | undefined> {
    return this.maintenanceStaff.get(id);
  }

  async createMaintenanceStaff(staff: InsertMaintenanceStaff): Promise<MaintenanceStaff> {
    const id = randomUUID();
    const newStaff: MaintenanceStaff = {
      id,
      name: staff.name,
      phone: staff.phone ?? null,
      email: staff.email ?? null,
      specialty: staff.specialty ?? null,
      isActive: staff.isActive ?? "true",
    };
    this.maintenanceStaff.set(id, newStaff);
    return newStaff;
  }

  async updateMaintenanceStaff(id: string, staff: Partial<InsertMaintenanceStaff>): Promise<MaintenanceStaff | undefined> {
    const existing = this.maintenanceStaff.get(id);
    if (!existing) return undefined;
    const updated: MaintenanceStaff = { ...existing, ...staff };
    this.maintenanceStaff.set(id, updated);
    return updated;
  }

  async deleteMaintenanceStaff(id: string): Promise<boolean> {
    return this.maintenanceStaff.delete(id);
  }

  // Work Orders
  private enrichWorkOrder(order: WorkOrder): WorkOrderWithDetails {
    const room = order.roomId ? this.rooms.get(order.roomId) : undefined;
    const assignedTo = order.assignedToId ? this.maintenanceStaff.get(order.assignedToId) : undefined;
    return { ...order, room, assignedTo };
  }

  async getWorkOrders(): Promise<WorkOrderWithDetails[]> {
    return Array.from(this.workOrders.values()).map(order => this.enrichWorkOrder(order));
  }

  async getWorkOrder(id: string): Promise<WorkOrderWithDetails | undefined> {
    const order = this.workOrders.get(id);
    if (!order) return undefined;
    return this.enrichWorkOrder(order);
  }

  async getWorkOrdersByRoom(roomId: string): Promise<WorkOrderWithDetails[]> {
    return Array.from(this.workOrders.values())
      .filter(order => order.roomId === roomId)
      .map(order => this.enrichWorkOrder(order));
  }

  async getWorkOrdersByStatus(status: WorkOrderStatus): Promise<WorkOrderWithDetails[]> {
    return Array.from(this.workOrders.values())
      .filter(order => order.status === status)
      .map(order => this.enrichWorkOrder(order));
  }

  async createWorkOrder(order: InsertWorkOrder): Promise<WorkOrder> {
    const id = randomUUID();
    const newOrder: WorkOrder = {
      id,
      orderCode: order.orderCode,
      title: order.title,
      description: order.description ?? null,
      roomId: order.roomId ?? null,
      location: order.location ?? null,
      category: (order.category ?? "general") as WorkOrderCategory,
      priority: (order.priority ?? "medium") as WorkOrderPriority,
      status: (order.status ?? "pending") as WorkOrderStatus,
      assignedToId: order.assignedToId ?? null,
      reportedBy: order.reportedBy ?? null,
      reportedAt: order.reportedAt,
      scheduledDate: order.scheduledDate ?? null,
      completedAt: order.completedAt ?? null,
      completedBy: order.completedBy ?? null,
      estimatedCost: order.estimatedCost ?? null,
      actualCost: order.actualCost ?? null,
      notes: order.notes ?? null,
    };
    this.workOrders.set(id, newOrder);
    return newOrder;
  }

  async updateWorkOrder(id: string, order: Partial<InsertWorkOrder>): Promise<WorkOrder | undefined> {
    const existing = this.workOrders.get(id);
    if (!existing) return undefined;
    const updated: WorkOrder = { 
      ...existing, 
      ...order,
      category: (order.category ?? existing.category) as WorkOrderCategory,
      priority: (order.priority ?? existing.priority) as WorkOrderPriority,
      status: (order.status ?? existing.status) as WorkOrderStatus,
    };
    this.workOrders.set(id, updated);
    return updated;
  }

  async deleteWorkOrder(id: string): Promise<boolean> {
    return this.workOrders.delete(id);
  }

  generateWorkOrderCode(): string {
    this.workOrderCounter++;
    return `OT-${this.workOrderCounter}`;
  }

  // ============== ADMINISTRATION ==============

  // System Users
  async getSystemUsers(): Promise<SystemUser[]> {
    return Array.from(this.systemUsers.values());
  }

  async getSystemUser(id: string): Promise<SystemUser | undefined> {
    return this.systemUsers.get(id);
  }

  async getSystemUserByUsername(username: string): Promise<SystemUser | undefined> {
    return Array.from(this.systemUsers.values()).find((u) => u.username === username);
  }

  async createSystemUser(user: InsertSystemUser): Promise<SystemUser> {
    const id = randomUUID();
    const newUser: SystemUser = {
      id,
      username: user.username,
      email: user.email,
      fullName: user.fullName,
      role: (user.role ?? "reception") as SystemUserRole,
      department: user.department ?? null,
      phone: user.phone ?? null,
      isActive: user.isActive ?? "true",
      lastLogin: user.lastLogin ?? null,
      createdAt: user.createdAt,
    };
    this.systemUsers.set(id, newUser);
    return newUser;
  }

  async updateSystemUser(id: string, user: Partial<InsertSystemUser>): Promise<SystemUser | undefined> {
    const existing = this.systemUsers.get(id);
    if (!existing) return undefined;
    const updated: SystemUser = {
      ...existing,
      ...user,
      role: (user.role ?? existing.role) as SystemUserRole,
    };
    this.systemUsers.set(id, updated);
    return updated;
  }

  async deleteSystemUser(id: string): Promise<boolean> {
    return this.systemUsers.delete(id);
  }

  // System Settings
  async getSystemSettings(): Promise<SystemSetting[]> {
    return Array.from(this.systemSettings.values());
  }

  async getSystemSetting(key: string): Promise<SystemSetting | undefined> {
    return Array.from(this.systemSettings.values()).find((s) => s.key === key);
  }

  async getSystemSettingsByCategory(category: string): Promise<SystemSetting[]> {
    return Array.from(this.systemSettings.values()).filter((s) => s.category === category);
  }

  async upsertSystemSetting(setting: InsertSystemSetting): Promise<SystemSetting> {
    const existing = Array.from(this.systemSettings.values()).find((s) => s.key === setting.key);
    if (existing) {
      const updated: SystemSetting = {
        ...existing,
        value: setting.value,
        description: setting.description ?? existing.description,
        updatedAt: setting.updatedAt,
        updatedBy: setting.updatedBy ?? existing.updatedBy,
      };
      this.systemSettings.set(existing.id, updated);
      return updated;
    }
    const id = randomUUID();
    const newSetting: SystemSetting = {
      id,
      key: setting.key,
      value: setting.value,
      category: setting.category ?? "general",
      description: setting.description ?? null,
      updatedAt: setting.updatedAt,
      updatedBy: setting.updatedBy ?? null,
    };
    this.systemSettings.set(id, newSetting);
    return newSetting;
  }

  async deleteSystemSetting(key: string): Promise<boolean> {
    const setting = Array.from(this.systemSettings.values()).find((s) => s.key === key);
    if (!setting) return false;
    return this.systemSettings.delete(setting.id);
  }

  // Audit Logs
  async getAuditLogs(): Promise<AuditLog[]> {
    return Array.from(this.auditLogs.values()).sort((a, b) => 
      new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
    );
  }

  async getAuditLogsByModule(module: string): Promise<AuditLog[]> {
    return Array.from(this.auditLogs.values())
      .filter((l) => l.module === module)
      .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
  }

  async getAuditLogsByUser(userId: string): Promise<AuditLog[]> {
    return Array.from(this.auditLogs.values())
      .filter((l) => l.userId === userId)
      .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
  }

  async createAuditLog(log: InsertAuditLog): Promise<AuditLog> {
    const id = randomUUID();
    const newLog: AuditLog = {
      id,
      userId: log.userId ?? null,
      userName: log.userName ?? null,
      action: log.action as AuditAction,
      module: log.module,
      entityType: log.entityType ?? null,
      entityId: log.entityId ?? null,
      description: log.description,
      details: log.details ?? null,
      ipAddress: log.ipAddress ?? null,
      timestamp: log.timestamp,
    };
    this.auditLogs.set(id, newLog);
    return newLog;
  }

  async getAdminDashboardStats(): Promise<{
    totalUsers: number;
    activeUsers: number;
    recentLogins: number;
    totalSettings: number;
    recentAuditLogs: AuditLog[];
  }> {
    const users = Array.from(this.systemUsers.values());
    const logs = Array.from(this.auditLogs.values());
    const today = new Date().toISOString().split("T")[0];
    
    const recentLogins = users.filter((u) => {
      if (!u.lastLogin) return false;
      return u.lastLogin.startsWith(today);
    }).length;

    return {
      totalUsers: users.length,
      activeUsers: users.filter((u) => u.isActive === "true").length,
      recentLogins,
      totalSettings: this.systemSettings.size,
      recentAuditLogs: logs
        .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
        .slice(0, 10),
    };
  }

  // ==================== PACKAGES ====================
  private enrichPackage(pkg: Package): PackageWithDetails {
    const roomType = pkg.roomTypeId ? this.roomTypes.get(pkg.roomTypeId) : undefined;
    const items = Array.from(this.packageItems.values()).filter(i => i.packageId === pkg.id);
    return { ...pkg, roomType, items };
  }

  async getPackages(): Promise<PackageWithDetails[]> {
    return Array.from(this.packages.values()).map(p => this.enrichPackage(p));
  }

  async getPackage(id: string): Promise<PackageWithDetails | undefined> {
    const pkg = this.packages.get(id);
    return pkg ? this.enrichPackage(pkg) : undefined;
  }

  async getActivePackages(): Promise<PackageWithDetails[]> {
    const today = new Date().toISOString().split("T")[0];
    return Array.from(this.packages.values())
      .filter(p => {
        if (p.status !== "active") return false;
        if (p.validFrom && p.validFrom > today) return false;
        if (p.validUntil && p.validUntil < today) return false;
        return true;
      })
      .map(p => this.enrichPackage(p));
  }

  async createPackage(pkg: InsertPackage): Promise<Package> {
    const id = randomUUID();
    const newPkg: Package = {
      id,
      code: pkg.code,
      name: pkg.name,
      description: pkg.description ?? null,
      roomTypeId: pkg.roomTypeId ?? null,
      nights: pkg.nights ?? 1,
      basePrice: pkg.basePrice,
      discountPercent: pkg.discountPercent ?? null,
      validFrom: pkg.validFrom ?? null,
      validUntil: pkg.validUntil ?? null,
      status: (pkg.status as PackageStatus) ?? "active",
      includedServices: pkg.includedServices ?? null,
      terms: pkg.terms ?? null,
      createdAt: pkg.createdAt,
    };
    this.packages.set(id, newPkg);
    return newPkg;
  }

  async updatePackage(id: string, pkg: Partial<InsertPackage>): Promise<Package | undefined> {
    const existing = this.packages.get(id);
    if (!existing) return undefined;
    const updated: Package = { ...existing, ...pkg } as Package;
    this.packages.set(id, updated);
    return updated;
  }

  async deletePackage(id: string): Promise<boolean> {
    // Delete package items first
    const itemsToDelete = Array.from(this.packageItems.values()).filter(i => i.packageId === id);
    itemsToDelete.forEach(i => this.packageItems.delete(i.id));
    return this.packages.delete(id);
  }

  generatePackageCode(): string {
    this.packageCounter++;
    return `PKG-${this.packageCounter.toString().padStart(4, "0")}`;
  }

  async getPackageItems(packageId: string): Promise<PackageItem[]> {
    return Array.from(this.packageItems.values()).filter(i => i.packageId === packageId);
  }

  async createPackageItem(item: InsertPackageItem): Promise<PackageItem> {
    const id = randomUUID();
    const newItem: PackageItem = {
      id,
      packageId: item.packageId,
      itemType: item.itemType as any,
      description: item.description,
      quantity: item.quantity ?? 1,
      unitValue: item.unitValue ?? null,
    };
    this.packageItems.set(id, newItem);
    return newItem;
  }

  async updatePackageItem(id: string, item: Partial<InsertPackageItem>): Promise<PackageItem | undefined> {
    const existing = this.packageItems.get(id);
    if (!existing) return undefined;
    const updated: PackageItem = { ...existing, ...item } as PackageItem;
    this.packageItems.set(id, updated);
    return updated;
  }

  async deletePackageItem(id: string): Promise<boolean> {
    return this.packageItems.delete(id);
  }

  // System Notifications
  async getNotifications(area?: NotificationArea, limit?: number): Promise<SystemNotification[]> {
    let notifications = Array.from(this.notificationsMap.values());
    if (area) {
      notifications = notifications.filter(n => n.targetArea === area || n.targetArea === "all");
    }
    notifications.sort((a, b) => {
      if (a.isRead !== b.isRead) return a.isRead ? 1 : -1;
      return new Date(b.createdAt!).getTime() - new Date(a.createdAt!).getTime();
    });
    if (limit) {
      notifications = notifications.slice(0, limit);
    }
    return notifications;
  }

  async createNotification(notification: InsertSystemNotification): Promise<SystemNotification> {
    const id = randomUUID();
    const newNotification: SystemNotification = {
      id,
      type: notification.type,
      title: notification.title,
      message: notification.message,
      targetArea: notification.targetArea,
      relatedEntityType: notification.relatedEntityType ?? null,
      relatedEntityId: notification.relatedEntityId ?? null,
      isRead: false,
      readAt: null,
      readBy: null,
      priority: notification.priority ?? "normal",
      createdAt: new Date(),
    };
    this.notificationsMap.set(id, newNotification);
    return newNotification;
  }

  async markNotificationRead(id: string): Promise<SystemNotification | undefined> {
    const notification = this.notificationsMap.get(id);
    if (!notification) return undefined;
    const updated = { ...notification, isRead: true, readAt: new Date() };
    this.notificationsMap.set(id, updated);
    return updated;
  }

  async markAllNotificationsRead(area?: NotificationArea): Promise<number> {
    let count = 0;
    for (const [id, notification] of this.notificationsMap) {
      if (!notification.isRead) {
        if (!area || notification.targetArea === area || notification.targetArea === "all") {
          this.notificationsMap.set(id, { ...notification, isRead: true, readAt: new Date() });
          count++;
        }
      }
    }
    return count;
  }

  async getUnreadNotificationCount(area?: NotificationArea): Promise<number> {
    let count = 0;
    for (const notification of this.notificationsMap.values()) {
      if (!notification.isRead) {
        if (!area || notification.targetArea === area || notification.targetArea === "all") {
          count++;
        }
      }
    }
    return count;
  }

  // Web Check-in
  async createWebCheckin(data: InsertWebCheckin): Promise<WebCheckin> {
    const id = randomUUID();
    const newCheckin: WebCheckin = {
      id,
      reservationId: data.reservationId,
      token: data.token,
      status: data.status ?? "pending",
      confirmedFirstName: data.confirmedFirstName ?? null,
      confirmedLastName: data.confirmedLastName ?? null,
      confirmedDocumentType: data.confirmedDocumentType ?? null,
      confirmedDocumentNumber: data.confirmedDocumentNumber ?? null,
      confirmedNationality: data.confirmedNationality ?? null,
      confirmedPhone: data.confirmedPhone ?? null,
      confirmedEmail: data.confirmedEmail ?? null,
      documentPhotoUrl: data.documentPhotoUrl ?? null,
      estimatedArrivalTime: data.estimatedArrivalTime ?? null,
      requestEarlyCheckIn: data.requestEarlyCheckIn ?? false,
      earlyCheckInTime: data.earlyCheckInTime ?? null,
      termsAccepted: data.termsAccepted ?? false,
      termsAcceptedAt: data.termsAcceptedAt ?? null,
      ipAddress: data.ipAddress ?? null,
      completedAt: data.completedAt ?? null,
      expiresAt: data.expiresAt ?? null,
      createdAt: new Date(),
    };
    this.webCheckinsMap.set(id, newCheckin);
    return newCheckin;
  }

  async getWebCheckinByToken(token: string): Promise<WebCheckin | undefined> {
    for (const checkin of this.webCheckinsMap.values()) {
      if (checkin.token === token) return checkin;
    }
    return undefined;
  }

  async getWebCheckinByReservation(reservationId: string): Promise<WebCheckin | undefined> {
    for (const checkin of this.webCheckinsMap.values()) {
      if (checkin.reservationId === reservationId) return checkin;
    }
    return undefined;
  }

  async updateWebCheckin(id: string, data: Partial<InsertWebCheckin>): Promise<WebCheckin | undefined> {
    const existing = this.webCheckinsMap.get(id);
    if (!existing) return undefined;
    const updated = { ...existing, ...data } as WebCheckin;
    this.webCheckinsMap.set(id, updated);
    return updated;
  }

  async listWebCheckins(): Promise<WebCheckin[]> {
    return Array.from(this.webCheckinsMap.values()).sort(
      (a, b) => new Date(b.createdAt!).getTime() - new Date(a.createdAt!).getTime()
    );
  }

  // ==================== HOSPITALITY - GUEST PREFERENCES ====================
  async getGuestPreferences(guestId: string): Promise<GuestPreference[]> {
    return Array.from(this.guestPreferencesMap.values())
      .filter((p) => p.guestId === guestId)
      .sort((a, b) => new Date(b.createdAt!).getTime() - new Date(a.createdAt!).getTime());
  }

  async getActiveGuestPreferences(guestId: string): Promise<GuestPreference[]> {
    return Array.from(this.guestPreferencesMap.values())
      .filter((p) => p.guestId === guestId && p.isActive)
      .sort((a, b) => {
        const priorityOrder = { critical: 0, high: 1, normal: 2, low: 3 };
        return (priorityOrder[a.priority as keyof typeof priorityOrder] || 2) - (priorityOrder[b.priority as keyof typeof priorityOrder] || 2);
      });
  }

  async getGuestPreference(id: string): Promise<GuestPreference | undefined> {
    return this.guestPreferencesMap.get(id);
  }

  async createGuestPreference(pref: InsertGuestPreference): Promise<GuestPreference> {
    const id = randomUUID();
    const now = new Date();
    const preference: GuestPreference = {
      id,
      guestId: pref.guestId,
      category: pref.category,
      subcategory: pref.subcategory ?? null,
      title: pref.title,
      description: pref.description ?? null,
      isActive: pref.isActive ?? true,
      priority: pref.priority ?? "normal",
      visibleTo: pref.visibleTo ?? ["all"],
      recordedBy: pref.recordedBy ?? null,
      sourceStay: pref.sourceStay ?? null,
      createdAt: now,
      updatedAt: now,
    };
    this.guestPreferencesMap.set(id, preference);
    return preference;
  }

  async updateGuestPreference(id: string, pref: Partial<InsertGuestPreference>): Promise<GuestPreference | undefined> {
    const existing = this.guestPreferencesMap.get(id);
    if (!existing) return undefined;
    const updated = { ...existing, ...pref, updatedAt: new Date() } as GuestPreference;
    this.guestPreferencesMap.set(id, updated);
    return updated;
  }

  async toggleGuestPreference(id: string): Promise<GuestPreference | undefined> {
    const existing = this.guestPreferencesMap.get(id);
    if (!existing) return undefined;
    const updated = { ...existing, isActive: !existing.isActive, updatedAt: new Date() };
    this.guestPreferencesMap.set(id, updated);
    return updated;
  }

  async deleteGuestPreference(id: string): Promise<boolean> {
    return this.guestPreferencesMap.delete(id);
  }

  // ==================== HOSPITALITY - STAY NOTES ====================
  async getStayNotes(reservationId: string): Promise<StayNote[]> {
    return Array.from(this.stayNotesMap.values())
      .filter((n) => n.reservationId === reservationId)
      .sort((a, b) => new Date(b.createdAt!).getTime() - new Date(a.createdAt!).getTime());
  }

  async getActiveStayNotes(): Promise<StayNote[]> {
    return Array.from(this.stayNotesMap.values())
      .filter((n) => !n.isResolved)
      .sort((a, b) => new Date(b.createdAt!).getTime() - new Date(a.createdAt!).getTime());
  }

  async createStayNote(note: InsertStayNote): Promise<StayNote> {
    const id = randomUUID();
    const stayNote: StayNote = {
      id,
      reservationId: note.reservationId,
      guestId: note.guestId ?? null,
      category: note.category,
      title: note.title,
      description: note.description ?? null,
      priority: note.priority ?? "normal",
      visibleTo: note.visibleTo ?? ["all"],
      isResolved: false,
      resolvedAt: null,
      resolvedBy: null,
      recordedBy: note.recordedBy ?? null,
      createdAt: new Date(),
    };
    this.stayNotesMap.set(id, stayNote);
    return stayNote;
  }

  async updateStayNote(id: string, note: Partial<InsertStayNote>): Promise<StayNote | undefined> {
    const existing = this.stayNotesMap.get(id);
    if (!existing) return undefined;
    const updated = { ...existing, ...note } as StayNote;
    this.stayNotesMap.set(id, updated);
    return updated;
  }

  async resolveStayNote(id: string, resolvedBy: string): Promise<StayNote | undefined> {
    const existing = this.stayNotesMap.get(id);
    if (!existing) return undefined;
    const updated = { ...existing, isResolved: true, resolvedAt: new Date(), resolvedBy };
    this.stayNotesMap.set(id, updated);
    return updated;
  }

  async deleteStayNote(id: string): Promise<boolean> {
    return this.stayNotesMap.delete(id);
  }

  // ==================== HOSPITALITY - ALERTS ====================
  async getHospitalityAlerts(area?: string): Promise<HospitalityAlert[]> {
    let alerts = Array.from(this.hospitalityAlertsMap.values());
    if (area && area !== "all") {
      alerts = alerts.filter((a) => a.targetArea === area || a.targetArea === "all");
    }
    return alerts.sort((a, b) => new Date(b.createdAt!).getTime() - new Date(a.createdAt!).getTime());
  }

  async getHospitalityAlertsByReservation(reservationId: string): Promise<HospitalityAlert[]> {
    return Array.from(this.hospitalityAlertsMap.values())
      .filter((a) => a.reservationId === reservationId)
      .sort((a, b) => new Date(b.createdAt!).getTime() - new Date(a.createdAt!).getTime());
  }

  async createHospitalityAlert(alert: InsertHospitalityAlert): Promise<HospitalityAlert> {
    const id = randomUUID();
    const hospitalityAlert: HospitalityAlert = {
      id,
      reservationId: alert.reservationId,
      guestId: alert.guestId,
      preferenceId: alert.preferenceId ?? null,
      alertMessage: alert.alertMessage,
      targetArea: alert.targetArea,
      priority: alert.priority ?? "normal",
      isAcknowledged: false,
      acknowledgedAt: null,
      acknowledgedBy: null,
      createdAt: new Date(),
    };
    this.hospitalityAlertsMap.set(id, hospitalityAlert);
    return hospitalityAlert;
  }

  async acknowledgeHospitalityAlert(id: string, acknowledgedBy: string): Promise<HospitalityAlert | undefined> {
    const existing = this.hospitalityAlertsMap.get(id);
    if (!existing) return undefined;
    const updated = { ...existing, isAcknowledged: true, acknowledgedAt: new Date(), acknowledgedBy };
    this.hospitalityAlertsMap.set(id, updated);
    return updated;
  }

  async bulkCheckIn(_groupId: string): Promise<{ processed: number; skipped: number; skippedRooms: string[] }> {
    return { processed: 0, skipped: 0, skippedRooms: [] };
  }

  async bulkCheckOut(_groupId: string): Promise<{ processed: number; skipped: number; pendingBalance: Array<{ room: string; guestName: string; balance: number }> }> {
    return { processed: 0, skipped: 0, pendingBalance: [] };
  }
  async getExecutiveStats(_from: string, _to: string): Promise<any> { return {}; }
  async getReportOccupancy(_from: string, _to: string): Promise<any[]> { return []; }
  async getReportRevenueByRoomType(_from: string, _to: string): Promise<any[]> { return []; }
  async getReportByChannel(_from: string, _to: string): Promise<any[]> { return []; }
  async getReportReservations(_from: string, _to: string, _status?: string): Promise<any[]> { return []; }
  async getReportPayments(_from: string, _to: string): Promise<any> { return { byMethod: [], grandTotal: 0 }; }
  async getReportTopGuests(_from: string, _to: string, _limit?: number): Promise<any[]> { return []; }
  async getReportHousekeeping(_from: string, _to: string): Promise<any> { return { daily: [], byType: [], totalCompleted: 0, totalPending: 0 }; }
  async getReportRestaurant(_from: string, _to: string): Promise<any> { return { totalOrders: 0, totalRevenue: 0, totalCovers: 0, avgTicket: 0, topItems: [], byArea: [] }; }
  async getCashConfigs(): Promise<any[]> { return []; }
  async updateCashConfig(_area: string, _data: any): Promise<any> { return null; }
  async getCashShifts(_area?: string, _status?: string): Promise<any[]> { return []; }
  async getCurrentShift(_area: string): Promise<any> { return undefined; }
  async openShift(_data: any): Promise<any> { return {}; }
  async closeShift(_shiftId: string, _closedBy: string, _efectivoContado: number = 0, _operadorSiguiente: string | null = null, _enviarAAdministracion: boolean = false, _notes?: string): Promise<any> { return {}; }
  async getOrCreateActiveTurno(_area: string): Promise<any> { return {}; }
  async initCashShifts(): Promise<void> {}
  async tomarTurno(_shiftId: string, _operador: string): Promise<any> { return {}; }
  async getAutocreadoShifts(): Promise<any[]> { return []; }
  async getShiftDetail(_shiftId: string): Promise<any> { return {}; }
  async getCashMovements(_shiftId: string): Promise<any[]> { return []; }
  async createCashMovement(_data: any): Promise<any> { return {}; }
  async registerCashMovement(_area: string, _sourceType: string, _sourceId: string | null, _sourceLabel: string, _paymentMethod: string, _amount: string, _movementType?: string, _registeredBy?: string, _receiptType?: string): Promise<any> { return {}; }
  async getCashSummary(_area?: string, _from?: string, _to?: string): Promise<any[]> { return []; }
  async getAccountMovements(_entityType: AccountEntityType, _entityId: string): Promise<AccountMovement[]> { return []; }
  async getAccountBalance(_entityType: AccountEntityType, _entityId: string): Promise<number> { return 0; }
  async createAccountMovement(_data: InsertAccountMovement): Promise<AccountMovement> { return {} as AccountMovement; }
  async getAccountSummary(): Promise<{ companies: any[]; agencies: any[] }> { return { companies: [], agencies: [] }; }
}
