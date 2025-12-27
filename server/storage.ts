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
  type Guest,
  type InsertGuest,
  type Reservation,
  type InsertReservation,
  type Charge,
  type InsertCharge,
  type RoomWithType,
  type ReservationWithDetails,
  type RoomStatus,
  type ReservationStatus,
  type PlanningData,
  type PlanningCellStatus,
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

  // Guests
  getGuests(): Promise<Guest[]>;
  getGuest(id: string): Promise<Guest | undefined>;
  createGuest(guest: InsertGuest): Promise<Guest>;
  updateGuest(id: string, guest: Partial<InsertGuest>): Promise<Guest | undefined>;
  deleteGuest(id: string): Promise<boolean>;

  // Reservations
  getReservations(): Promise<ReservationWithDetails[]>;
  getReservation(id: string): Promise<ReservationWithDetails | undefined>;
  getReservationByCode(code: string): Promise<ReservationWithDetails | undefined>;
  getRecentReservations(limit: number): Promise<ReservationWithDetails[]>;
  getReservationsForCheckIn(): Promise<ReservationWithDetails[]>;
  getReservationsForCheckOut(): Promise<ReservationWithDetails[]>;
  getReservationsByGuest(guestId: string): Promise<ReservationWithDetails[]>;
  createReservation(reservation: InsertReservation): Promise<Reservation>;
  updateReservation(id: string, reservation: Partial<InsertReservation>): Promise<Reservation | undefined>;
  deleteReservation(id: string): Promise<boolean>;
  generateReservationCode(): string;

  // Charges
  getCharges(reservationId: string): Promise<Charge[]>;
  createCharge(charge: InsertCharge): Promise<Charge>;
  updateCharge(id: string, charge: Partial<InsertCharge>): Promise<Charge | undefined>;
  deleteCharge(id: string): Promise<boolean>;
  getChargesTotal(reservationId: string): Promise<number>;

  // Dashboard
  getDashboardStats(): Promise<{
    totalRooms: number;
    availableRooms: number;
    occupiedRooms: number;
    cleaningRooms: number;
    maintenanceRooms: number;
    todayCheckIns: number;
    todayCheckOuts: number;
    occupancyRate: number;
    totalGuests: number;
    pendingReservations: number;
  }>;

  // Planning
  getPlanningData(startDate: string, endDate: string): Promise<PlanningData>;
}

export class MemStorage implements IStorage {
  private users: Map<string, User>;
  private roomTypes: Map<string, RoomType>;
  private ratePlans: Map<string, RatePlan>;
  private rooms: Map<string, Room>;
  private guests: Map<string, Guest>;
  private reservations: Map<string, Reservation>;
  private charges: Map<string, Charge>;
  private reservationCounter: number;

  constructor() {
    this.users = new Map();
    this.roomTypes = new Map();
    this.ratePlans = new Map();
    this.rooms = new Map();
    this.guests = new Map();
    this.reservations = new Map();
    this.charges = new Map();
    this.reservationCounter = 1000;

    // Seed with demo data
    this.seedData();
  }

  private seedData() {
    // Create room types
    const roomTypes: RoomType[] = [
      { id: "rt1", code: "STD", name: "Standard", description: "Habitación standard con cama simple", baseOccupancy: 1, maxOccupancy: 2 },
      { id: "rt2", code: "DBL", name: "Doble", description: "Habitación doble con cama matrimonial", baseOccupancy: 2, maxOccupancy: 3 },
      { id: "rt3", code: "SUITE", name: "Suite", description: "Suite de lujo con sala y jacuzzi", baseOccupancy: 2, maxOccupancy: 4 },
      { id: "rt4", code: "FAM", name: "Familiar", description: "Habitación familiar con dos camas dobles", baseOccupancy: 4, maxOccupancy: 6 },
    ];
    roomTypes.forEach((rt) => this.roomTypes.set(rt.id, rt));

    // Create rate plans
    const ratePlans: RatePlan[] = [
      { id: "rp1", name: "BAR (Mejor Tarifa)", roomTypeId: "rt1", baseRate: "50.00", currency: "USD", refundable: "true", cancellationPolicy: "Cancelación gratuita hasta 24h antes" },
      { id: "rp2", name: "BAR (Mejor Tarifa)", roomTypeId: "rt2", baseRate: "80.00", currency: "USD", refundable: "true", cancellationPolicy: "Cancelación gratuita hasta 24h antes" },
      { id: "rp3", name: "BAR (Mejor Tarifa)", roomTypeId: "rt3", baseRate: "150.00", currency: "USD", refundable: "true", cancellationPolicy: "Cancelación gratuita hasta 24h antes" },
      { id: "rp4", name: "BAR (Mejor Tarifa)", roomTypeId: "rt4", baseRate: "120.00", currency: "USD", refundable: "true", cancellationPolicy: "Cancelación gratuita hasta 24h antes" },
      { id: "rp5", name: "No Reembolsable", roomTypeId: "rt1", baseRate: "40.00", currency: "USD", refundable: "false", cancellationPolicy: "Sin reembolso por cancelación" },
      { id: "rp6", name: "No Reembolsable", roomTypeId: "rt2", baseRate: "65.00", currency: "USD", refundable: "false", cancellationPolicy: "Sin reembolso por cancelación" },
      { id: "rp7", name: "Corporativo", roomTypeId: "rt2", baseRate: "70.00", currency: "USD", refundable: "true", cancellationPolicy: "Facturación a empresa" },
      { id: "rp8", name: "Corporativo", roomTypeId: "rt3", baseRate: "130.00", currency: "USD", refundable: "true", cancellationPolicy: "Facturación a empresa" },
    ];
    ratePlans.forEach((rp) => this.ratePlans.set(rp.id, rp));

    // Create 66 rooms across 6 floors
    const roomTypeDistribution = ["rt1", "rt2", "rt2", "rt3", "rt4", "rt2", "rt1", "rt2", "rt3", "rt4", "rt2"];
    const rooms: Room[] = [];
    let roomId = 1;
    
    for (let floor = 1; floor <= 6; floor++) {
      const roomsPerFloor = floor <= 5 ? 11 : 11; // 11 rooms per floor = 66 total
      for (let roomNum = 1; roomNum <= roomsPerFloor; roomNum++) {
        const roomNumber = `${floor}${roomNum.toString().padStart(2, "0")}`;
        const typeIndex = (roomNum - 1) % roomTypeDistribution.length;
        const status: RoomStatus = 
          roomId === 3 || roomId === 15 || roomId === 28 || roomId === 45 ? "occupied" :
          roomId === 5 || roomId === 22 ? "cleaning" :
          roomId === 8 || roomId === 33 ? "maintenance" : "available";
        
        rooms.push({
          id: `r${roomId}`,
          roomNumber,
          roomTypeId: roomTypeDistribution[typeIndex],
          floor,
          status,
          notes: status === "cleaning" ? "Limpieza programada" : 
                 status === "maintenance" ? "Mantenimiento programado" : null,
        });
        roomId++;
      }
    }
    rooms.forEach((r) => this.rooms.set(r.id, r));

    // Create guests
    const guests: Guest[] = [
      { id: "g1", firstName: "Carlos", lastName: "García", email: "carlos.garcia@email.com", phone: "+54 11 4567-8901", documentType: "dni", documentNumber: "30456789", nationality: "Argentina", address: "Av. Corrientes 1234, CABA" },
      { id: "g2", firstName: "María", lastName: "López", email: "maria.lopez@email.com", phone: "+54 11 5678-9012", documentType: "dni", documentNumber: "28765432", nationality: "Argentina", address: "Calle Florida 567, CABA" },
      { id: "g3", firstName: "John", lastName: "Smith", email: "john.smith@email.com", phone: "+1 555 123-4567", documentType: "passport", documentNumber: "US123456", nationality: "Estados Unidos", address: "123 Main St, New York" },
      { id: "g4", firstName: "Ana", lastName: "Martínez", email: "ana.martinez@email.com", phone: "+54 11 6789-0123", documentType: "dni", documentNumber: "35678901", nationality: "Argentina", address: "Av. Santa Fe 890, CABA" },
      { id: "g5", firstName: "Roberto", lastName: "Fernández", email: "roberto.f@email.com", phone: "+54 11 7890-1234", documentType: "dni", documentNumber: "32109876", nationality: "Argentina", address: "Callao 456, CABA" },
      { id: "g6", firstName: "Laura", lastName: "Pérez", email: "laura.p@email.com", phone: "+54 11 8901-2345", documentType: "dni", documentNumber: "29876543", nationality: "Argentina", address: "Av. Libertador 123, CABA" },
      { id: "g7", firstName: "Diego", lastName: "Ramírez", email: "diego.r@email.com", phone: "+54 11 9012-3456", documentType: "dni", documentNumber: "31234567", nationality: "Argentina", address: "Av. Belgrano 456, CABA" },
      { id: "g8", firstName: "Sophie", lastName: "Martin", email: "sophie.m@email.com", phone: "+33 1 2345 6789", documentType: "passport", documentNumber: "FR789012", nationality: "Francia", address: "15 Rue de Paris, Lyon" },
    ];
    guests.forEach((g) => this.guests.set(g.id, g));

    // Create reservations with varied dates
    const today = new Date().toISOString().split("T")[0];
    const tomorrow = new Date(Date.now() + 86400000).toISOString().split("T")[0];
    const dayAfter = new Date(Date.now() + 2 * 86400000).toISOString().split("T")[0];
    const in3Days = new Date(Date.now() + 3 * 86400000).toISOString().split("T")[0];
    const in5Days = new Date(Date.now() + 5 * 86400000).toISOString().split("T")[0];
    const nextWeek = new Date(Date.now() + 7 * 86400000).toISOString().split("T")[0];
    const in10Days = new Date(Date.now() + 10 * 86400000).toISOString().split("T")[0];
    
    const reservations: Reservation[] = [
      { id: "res1", reservationCode: "RES-1001", guestId: "g1", roomTypeId: "rt2", roomId: "r3", ratePlanId: "rp2", checkInDate: today, checkOutDate: tomorrow, nights: 1, baseRatePerNight: "80.00", discountType: "none", discountValue: "0", finalRatePerNight: "80.00", totalRoomAmount: "80.00", status: "checked_in", source: "directo", numberOfGuests: 2, notes: null, createdAt: new Date().toISOString() },
      { id: "res2", reservationCode: "RES-1002", guestId: "g2", roomTypeId: "rt3", roomId: "r15", ratePlanId: "rp3", checkInDate: today, checkOutDate: nextWeek, nights: 7, baseRatePerNight: "150.00", discountType: "percent", discountValue: "10", finalRatePerNight: "135.00", totalRoomAmount: "945.00", status: "checked_in", source: "web", numberOfGuests: 3, notes: "VIP - Aniversario", createdAt: new Date().toISOString() },
      { id: "res3", reservationCode: "RES-1003", guestId: "g3", roomTypeId: "rt3", roomId: "r28", ratePlanId: "rp3", checkInDate: today, checkOutDate: in3Days, nights: 3, baseRatePerNight: "150.00", discountType: "none", discountValue: "0", finalRatePerNight: "150.00", totalRoomAmount: "450.00", status: "checked_in", source: "ota", numberOfGuests: 2, notes: null, createdAt: new Date().toISOString() },
      { id: "res4", reservationCode: "RES-1004", guestId: "g4", roomTypeId: "rt4", roomId: "r45", ratePlanId: "rp4", checkInDate: today, checkOutDate: dayAfter, nights: 2, baseRatePerNight: "120.00", discountType: "none", discountValue: "0", finalRatePerNight: "120.00", totalRoomAmount: "240.00", status: "checked_in", source: "directo", numberOfGuests: 4, notes: null, createdAt: new Date().toISOString() },
      { id: "res5", reservationCode: "RES-1005", guestId: "g5", roomTypeId: "rt2", roomId: "r6", ratePlanId: "rp7", checkInDate: today, checkOutDate: tomorrow, nights: 1, baseRatePerNight: "70.00", discountType: "fixed", discountValue: "10", finalRatePerNight: "60.00", totalRoomAmount: "60.00", status: "confirmed", source: "empresa", numberOfGuests: 2, notes: null, createdAt: new Date().toISOString() },
      { id: "res6", reservationCode: "RES-1006", guestId: "g6", roomTypeId: "rt1", roomId: "r1", ratePlanId: "rp1", checkInDate: tomorrow, checkOutDate: in5Days, nights: 4, baseRatePerNight: "50.00", discountType: "none", discountValue: "0", finalRatePerNight: "50.00", totalRoomAmount: "200.00", status: "pending", source: "telefono", numberOfGuests: 1, notes: "Llegada tardía", createdAt: new Date().toISOString() },
      { id: "res7", reservationCode: "RES-1007", guestId: "g7", roomTypeId: "rt2", roomId: "r10", ratePlanId: "rp2", checkInDate: dayAfter, checkOutDate: nextWeek, nights: 5, baseRatePerNight: "80.00", discountType: "none", discountValue: "0", finalRatePerNight: "80.00", totalRoomAmount: "400.00", status: "confirmed", source: "directo", numberOfGuests: 2, notes: null, createdAt: new Date().toISOString() },
      { id: "res8", reservationCode: "RES-1008", guestId: "g8", roomTypeId: "rt2", roomId: "r20", ratePlanId: "rp2", checkInDate: in3Days, checkOutDate: in10Days, nights: 7, baseRatePerNight: "80.00", discountType: "none", discountValue: "0", finalRatePerNight: "80.00", totalRoomAmount: "560.00", status: "pending", source: "web", numberOfGuests: 2, notes: "Turista francés", createdAt: new Date().toISOString() },
      { id: "res9", reservationCode: "RES-1009", guestId: "g1", roomTypeId: "rt2", roomId: "r35", ratePlanId: "rp2", checkInDate: in5Days, checkOutDate: in10Days, nights: 5, baseRatePerNight: "80.00", discountType: "none", discountValue: "0", finalRatePerNight: "80.00", totalRoomAmount: "400.00", status: "confirmed", source: "directo", numberOfGuests: 2, notes: null, createdAt: new Date().toISOString() },
      { id: "res10", reservationCode: "RES-1010", guestId: "g2", roomTypeId: "rt2", roomId: "r50", ratePlanId: "rp6", checkInDate: tomorrow, checkOutDate: in3Days, nights: 2, baseRatePerNight: "65.00", discountType: "percent", discountValue: "5", finalRatePerNight: "61.75", totalRoomAmount: "123.50", status: "confirmed", source: "web", numberOfGuests: 3, notes: null, createdAt: new Date().toISOString() },
    ];
    reservations.forEach((r) => this.reservations.set(r.id, r));

    // Create sample charges for checked-in reservations
    const charges: Charge[] = [
      { id: "ch1", reservationId: "res1", description: "Alojamiento - 1 noche", amount: "80.00", date: today, category: "room" },
      { id: "ch2", reservationId: "res2", description: "Alojamiento - 7 noches", amount: "945.00", date: today, category: "room" },
      { id: "ch2b", reservationId: "res2", description: "Minibar", amount: "25.00", date: today, category: "minibar" },
      { id: "ch3", reservationId: "res3", description: "Alojamiento - 3 noches", amount: "450.00", date: today, category: "room" },
      { id: "ch3b", reservationId: "res3", description: "Restaurante - Cena", amount: "85.00", date: today, category: "restaurant" },
      { id: "ch4", reservationId: "res4", description: "Alojamiento - 2 noches", amount: "240.00", date: today, category: "room" },
    ];
    charges.forEach((c) => this.charges.set(c.id, c));

    this.reservationCounter = 1010;
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
    const user: User = { ...insertUser, id };
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

  // Guests
  async getGuests(): Promise<Guest[]> {
    return Array.from(this.guests.values());
  }

  async getGuest(id: string): Promise<Guest | undefined> {
    return this.guests.get(id);
  }

  async createGuest(insertGuest: InsertGuest): Promise<Guest> {
    const id = randomUUID();
    const guest: Guest = { 
      id,
      firstName: insertGuest.firstName,
      lastName: insertGuest.lastName,
      email: insertGuest.email ?? null,
      phone: insertGuest.phone ?? null,
      documentType: insertGuest.documentType ?? null,
      documentNumber: insertGuest.documentNumber ?? null,
      nationality: insertGuest.nationality ?? null,
      address: insertGuest.address ?? null,
    };
    this.guests.set(id, guest);
    return guest;
  }

  async updateGuest(id: string, updates: Partial<InsertGuest>): Promise<Guest | undefined> {
    const guest = this.guests.get(id);
    if (!guest) return undefined;
    const updatedGuest: Guest = { ...guest, ...updates };
    this.guests.set(id, updatedGuest);
    return updatedGuest;
  }

  async deleteGuest(id: string): Promise<boolean> {
    return this.guests.delete(id);
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
      source: (insertReservation.source ?? "directo") as "directo" | "web" | "ota" | "empresa" | "telefono",
      numberOfGuests: insertReservation.numberOfGuests ?? 1,
      notes: insertReservation.notes ?? null,
      createdAt: insertReservation.createdAt || new Date().toISOString(),
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
      source: (updates.source ?? reservation.source) as "directo" | "web" | "ota" | "empresa" | "telefono",
    };
    this.reservations.set(id, updatedReservation);
    return updatedReservation;
  }

  async deleteReservation(id: string): Promise<boolean> {
    return this.reservations.delete(id);
  }

  // Charges
  async getCharges(reservationId: string): Promise<Charge[]> {
    return Array.from(this.charges.values()).filter((c) => c.reservationId === reservationId);
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

  // Dashboard Stats
  async getDashboardStats() {
    const rooms = Array.from(this.rooms.values());
    const reservations = Array.from(this.reservations.values());
    const guests = Array.from(this.guests.values());
    const today = new Date().toISOString().split("T")[0];

    const totalRooms = rooms.length;
    const availableRooms = rooms.filter((r) => r.status === "available").length;
    const occupiedRooms = rooms.filter((r) => r.status === "occupied").length;
    const cleaningRooms = rooms.filter((r) => r.status === "cleaning").length;
    const maintenanceRooms = rooms.filter((r) => r.status === "maintenance").length;

    const todayCheckIns = reservations.filter(
      (r) => r.checkInDate === today && (r.status === "confirmed" || r.status === "pending")
    ).length;
    const todayCheckOuts = reservations.filter(
      (r) => r.checkOutDate === today && r.status === "checked_in"
    ).length;

    const occupancyRate = totalRooms > 0 ? Math.round((occupiedRooms / totalRooms) * 100) : 0;
    const totalGuests = guests.length;
    const pendingReservations = reservations.filter((r) => r.status === "pending").length;

    return {
      totalRooms,
      availableRooms,
      occupiedRooms,
      cleaningRooms,
      maintenanceRooms,
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
    
    // Generate array of days between start and end
    const days: string[] = [];
    const start = new Date(startDate);
    const end = new Date(endDate);
    for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
      days.push(d.toISOString().split("T")[0]);
    }

    // Build occupancy map and cell reservations
    const occupancy: Record<string, PlanningCellStatus[]> = {};
    const cellReservations: Record<string, Record<string, string>> = {};
    const reservationsMap: Record<string, { id: string; guestName: string; checkIn: string; checkOut: string; status: ReservationStatus }> = {};

    // Filter active reservations (not cancelled or checked_out)
    const activeReservations = allReservations.filter(r => 
      r.status !== "cancelled" && r.status !== "checked_out"
    );

    // Build reservation info map
    for (const res of activeReservations) {
      const guest = this.guests.get(res.guestId);
      if (guest) {
        reservationsMap[res.id] = {
          id: res.id,
          guestName: `${guest.firstName} ${guest.lastName}`,
          checkIn: res.checkInDate,
          checkOut: res.checkOutDate,
          status: res.status as ReservationStatus,
        };
      }
    }

    // Calculate occupancy for each room
    for (const room of rooms) {
      occupancy[room.id] = [];
      cellReservations[room.id] = {};

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
          if (reservation.status === "checked_in") {
            if (day === reservation.checkOutDate) {
              occupancy[room.id].push("checkout_today");
            } else {
              occupancy[room.id].push("checked_in");
            }
          } else {
            occupancy[room.id].push("booked");
          }
        } else {
          occupancy[room.id].push("available");
        }
      }
    }

    return {
      rooms,
      days,
      occupancy,
      reservations: reservationsMap,
      cellReservations,
    };
  }
}

export const storage = new MemStorage();
