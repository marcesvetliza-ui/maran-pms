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
  type ChargeType,
  type InsertChargeType,
  type LoanItem,
  type InsertLoanItem,
  type ItemLoan,
  type InsertItemLoan,
  type ItemLoanWithItem,
  type Payment,
  type InsertPayment,
  type ReservationCompanion,
  type InsertReservationCompanion,
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
  type GroupPaymentDestination,
  type GroupFolioData,
  type GroupReservationLedgerLine,
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
  type RestaurantReservationAdvance,
  type InsertRestaurantReservationAdvance,
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
  type TreatmentSupply,
  type InsertTreatmentSupply,
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
  type AccountRetention,
  type AccountMovementAllocation,
  type GiftVoucher,
  type InsertGiftVoucher,
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

  // Charge Types
  getChargeTypes(): Promise<ChargeType[]>;
  createChargeType(ct: InsertChargeType): Promise<ChargeType>;
  updateChargeType(id: string, ct: Partial<InsertChargeType>): Promise<ChargeType | undefined>;
  deleteChargeType(id: string): Promise<boolean>;

  // Loan Items (Elementos prestados)
  getLoanItems(): Promise<LoanItem[]>;
  createLoanItem(item: InsertLoanItem): Promise<LoanItem>;
  updateLoanItem(id: string, item: Partial<InsertLoanItem>): Promise<LoanItem | undefined>;
  deleteLoanItem(id: string): Promise<boolean>;
  getActiveItemLoans(): Promise<ItemLoanWithItem[]>;
  createItemLoan(loan: InsertItemLoan): Promise<ItemLoan>;
  returnItemLoan(id: string): Promise<ItemLoan | undefined>;

  // Companions
  getReservationCompanions(reservationId: string): Promise<ReservationCompanion[]>;
  addReservationCompanion(data: InsertReservationCompanion): Promise<ReservationCompanion>;
  updateReservationCompanion(id: string, data: Partial<InsertReservationCompanion>): Promise<ReservationCompanion>;
  deleteReservationCompanion(id: string): Promise<void>;

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
    inHouseGuests: number;
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
      guestId?: string | null;
    }
  ): Promise<Reservation | undefined>;

  // Group Folio
  createGroupCharge(charge: InsertGroupCharge): Promise<GroupCharge>;
  getGroupCharges(groupId: string): Promise<GroupCharge[]>;
  deleteGroupCharge(id: string): Promise<boolean>;
  createGroupPayment(payment: InsertGroupPayment): Promise<GroupPayment>;
  recordGroupPayment(input: {
    groupId: string;
    destination: GroupPaymentDestination;
    paymentRows: Array<{ method: string; amount: string; reference?: string; retention?: { tipo: string; monto: number } | null }>;
    date: string;
    reference?: string | null;
    distribution: string;
    distributionDetail: Record<string, number>;
    receivedBy?: string | null;
    notes?: string | null;
    receiptType?: string | null;
    billingEntityType?: "company" | "agency" | null;
    billingEntityId?: string | null;
    receiverDetails?: Record<string, string | undefined> | null;
  }): Promise<{ groupPayment: GroupPayment; reservationPayments: Payment[] }>;
  getGroupPayments(groupId: string): Promise<GroupPayment[]>;
  transferChargeToGroup(chargeId: string, groupId: string): Promise<GroupCharge>;
  getGroupFolio(groupId: string): Promise<GroupFolioData>;
  getGroupReservationLedger(groupId: string): Promise<GroupReservationLedgerLine[]>;
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
  deleteMenuItem(id: string): Promise<{ deleted: boolean; deactivated: boolean }>;

  // Restaurant Orders
  closeStaleOrders(): Promise<number>;
  getRestaurantOrders(status?: OrderStatus, from?: string, to?: string): Promise<RestaurantOrderWithDetails[]>;
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
  moveOrderItems(itemIds: string[], targetOrderId: string): Promise<void>;

  // Table Reservations
  getTableReservations(): Promise<TableReservationWithTable[]>;
  getTableReservation(id: string): Promise<TableReservationWithTable | undefined>;
  getTableReservationsByDate(date: string): Promise<TableReservationWithTable[]>;
  getTableReservationsByTable(tableId: string): Promise<TableReservation[]>;
  createTableReservation(reservation: InsertTableReservation): Promise<TableReservation>;
  updateTableReservation(id: string, reservation: Partial<InsertTableReservation>): Promise<TableReservation | undefined>;
  deleteTableReservation(id: string): Promise<boolean>;

  // Reservation Advances
  getReservationAdvances(reservationId: string): Promise<RestaurantReservationAdvance[]>;
  getReservationAdvancesByTable(tableId: string, date: string): Promise<RestaurantReservationAdvance[]>;
  createReservationAdvance(data: InsertRestaurantReservationAdvance): Promise<RestaurantReservationAdvance>;
  deleteReservationAdvance(id: string): Promise<boolean>;

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
  deleteInventoryItem(id: string): Promise<{ deleted: boolean; deactivated: boolean }>;

  // Stock Movements
  getStockMovements(itemId?: string): Promise<StockMovementWithItem[]>;
  createStockMovement(movement: InsertStockMovement): Promise<StockMovement>;
  deductStockFromOrder(orderId: string, orderItems: Array<{ menuItemId: string; quantity: number }>): Promise<{ deducted: Array<{ itemName: string; quantity: number; unit: string }>; warnings: Array<{ itemName: string; required: number; available: number }>; skipped: Array<{ ingredientName: string; reason: string }> }>;

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

  // Treatment Supplies (SPA inventory)
  getTreatmentSupplies(treatmentId: string): Promise<TreatmentSupply[]>;
  createTreatmentSupply(supply: InsertTreatmentSupply): Promise<TreatmentSupply>;
  deleteTreatmentSupply(id: string): Promise<boolean>;
  deductStockFromSpaAccount(accountId: string): Promise<void>;

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
  getEventCharge(id: string): Promise<EventCharge | undefined>;
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
  updateNotificationStatus(id: string, status: string, staffNote?: string, resolvedBy?: string): Promise<SystemNotification | undefined>;

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
  registerCashMovement(area: string, sourceType: string, sourceId: string | null, sourceLabel: string, paymentMethod: string, amount: string, movementType?: string, registeredBy?: string, receiptType?: string, paymentId?: string | null): Promise<any>;
  getCashSummary(area?: string, from?: string, to?: string): Promise<any[]>;

  getAccountMovements(entityType: AccountEntityType, entityId: string): Promise<AccountMovement[]>;
  getAccountMovementsByReservation(reservationId: string): Promise<AccountMovement[]>;
  getAccountBalance(entityType: AccountEntityType, entityId: string): Promise<number>;
  createAccountMovement(data: InsertAccountMovement): Promise<AccountMovement>;
  getAccountSummary(): Promise<{
    companies: { id: string; name: string; balance: number; lastMovement: string | null }[];
    agencies: { id: string; name: string; balance: number; lastMovement: string | null }[];
  }>;
  getPendingCharges(entityType: AccountEntityType, entityId: string): Promise<(AccountMovement & { saldoPendiente: number })[]>;
  createPaymentWithAllocations(
    entityType: AccountEntityType,
    entityId: string,
    data: { date: string; description: string; amount: string; reference: string | null; retentions: AccountRetention[] | null; createdBy: string | null; guestName?: string | null },
    allocations: { cargoId: string; amount: string }[]
  ): Promise<{ movement: AccountMovement; allocations: AccountMovementAllocation[] }>;
  getAccountMovementAllocations(pagoId: string): Promise<AccountMovementAllocation[]>;

  // Gift Vouchers
  getGiftVouchers(filters?: { status?: string; area?: string; search?: string }): Promise<GiftVoucher[]>;
  getGiftVoucher(id: string): Promise<GiftVoucher | undefined>;
  getGiftVoucherByCode(code: string): Promise<GiftVoucher | undefined>;
  createGiftVoucher(data: InsertGiftVoucher): Promise<GiftVoucher>;
  updateGiftVoucher(id: string, data: Partial<InsertGiftVoucher>): Promise<GiftVoucher | undefined>;
  markGiftVoucherUsed(id: string, usedBy: string, usedNotes?: string): Promise<GiftVoucher | undefined>;
  deleteGiftVoucher(id: string): Promise<boolean>;
  generateVoucherCode(): Promise<string>;
}
